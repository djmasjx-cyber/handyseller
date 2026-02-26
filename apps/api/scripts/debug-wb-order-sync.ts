#!/usr/bin/env npx ts-node
/**
 * Скрипт отладки: проверка синхронизации статусов заказов WB.
 *
 * Вариант 1 (с БД): EMAIL=nmanoilo@ya.ru ORDER_ID=4645532575 npx ts-node scripts/debug-wb-order-sync.ts
 * Вариант 2 (без БД, проверка токенов): USE_ENV_TOKENS=1 WB_MAIN_TOKEN="jwt1" WB_STATS_TOKEN="jwt2" ORDER_ID=4645532575 npx ts-node scripts/debug-wb-order-sync.ts
 *
 * WB токены:
 * - Основной: ЛК WB → Настройки → Доступ к API
 * - Статистика (ФБО): ЛК WB → API → Статистика и Аналитика (для заказов со склада WB)
 */
import * as dotenv from 'dotenv';
import * as path from 'path';
import axios from 'axios';
import { PrismaClient } from '@prisma/client';
import { CryptoService } from '../src/common/crypto/crypto.service';

dotenv.config({ path: path.join(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../../.env.secrets'), override: true });

const prisma = new PrismaClient();
const crypto = new CryptoService();

const MARKETPLACE_API = 'https://marketplace-api.wildberries.ru';
const ORDER_ID = process.env.ORDER_ID || '4645532575';
const EMAIL = process.env.EMAIL || 'nmanoilo@ya.ru';
const USE_ENV_TOKENS = process.env.USE_ENV_TOKENS === '1' || process.env.USE_ENV_TOKENS === 'true';

function authHeader(token: string) {
  const t = token.startsWith('Bearer ') ? token : `Bearer ${token}`;
  return { Authorization: t, 'Content-Type': 'application/json' };
}

async function fetchWbOrderStatus(
  token: string,
  statsToken: string | null,
  orderIdOrSrid: string,
): Promise<{ source: string; found: boolean; wbStatus?: string; supplierStatus?: string; raw?: unknown } | null> {
  const numId = parseInt(orderIdOrSrid, 10);
  const opts = { timeout: 10000 };
  const endpoints: Array<{ path: string; bodyKey: string; bodyVal: number[]; useStats?: boolean }> = [
    { path: '/api/v3/orders/status', bodyKey: 'orders', bodyVal: [numId] },
    { path: '/api/marketplace/v3/dbs/orders/status/info', bodyKey: 'ordersIds', bodyVal: [numId] },
    { path: '/api/v3/dbw/orders/status', bodyKey: 'orders', bodyVal: [numId], useStats: true },
  ];

  for (const ep of endpoints) {
    const tok = ep.useStats && statsToken ? statsToken : token;
    if (!tok) continue;
    try {
      const { data } = await axios.post(
        `${MARKETPLACE_API}${ep.path}`,
        { [ep.bodyKey]: ep.bodyVal },
        { ...opts, headers: authHeader(tok) },
      );
      const orders = (data as { orders?: unknown[] }).orders ?? [];
      const o = orders[0] as { wbStatus?: string; supplierStatus?: string } | undefined;
      if (o) {
        const label = ep.useStats ? 'DBW (statsToken, ФБО)' : ep.path.includes('dbs') ? 'DBS' : 'FBS';
        return {
          source: label,
          found: true,
          wbStatus: o.wbStatus,
          supplierStatus: o.supplierStatus,
          raw: o,
        };
      }
    } catch (err) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status !== 404) {
        console.warn(`  [${ep.path}] HTTP ${status ?? 'err'}`);
      }
    }
  }
  return null;
}

async function main() {
  console.log('=== Отладка WB синхронизации заказов ===\n');
  console.log(`Заказ: ${ORDER_ID}\n`);

  let token: string;
  let statsToken: string | null = null;

  if (USE_ENV_TOKENS) {
    token = process.env.WB_MAIN_TOKEN?.trim() ?? '';
    statsToken = process.env.WB_STATS_TOKEN?.trim() || null;
    if (!token) {
      console.error('USE_ENV_TOKENS=1 задан, но WB_MAIN_TOKEN пуст.');
      process.exit(1);
    }
    console.log('Режим: токены из env (без БД)\n');
  } else {
    console.log(`Email: ${EMAIL}\n`);
    const emailHash = crypto.hashForLookup(EMAIL);
    const user = await prisma.user.findFirst({
      where: { OR: [{ emailHash }, { email: EMAIL.toLowerCase().trim() }] },
      select: { id: true, email: true, emailEncrypted: true },
    });
    if (!user) {
      console.error('Пользователь не найден:', EMAIL);
      process.exit(1);
    }
    const displayEmail = user.emailEncrypted ? crypto.decrypt(user.emailEncrypted) : user.email;
    console.log(`Пользователь: ${displayEmail} (id: ${user.id})\n`);

    const conn = await prisma.marketplaceConnection.findFirst({
      where: { userId: user.id, marketplace: 'WILDBERRIES' },
    });
    if (!conn?.token) {
      console.error('Подключение WB не найдено для этого пользователя.');
      process.exit(1);
    }

    token = crypto.decrypt(conn.token);
    statsToken = conn.statsToken ? crypto.decrypt(conn.statsToken) : null;
  }

  console.log('Токены: основной OK, statsToken (ФБО):', statsToken ? 'есть' : 'НЕТ');

  // 1. Статус на WB
  console.log('\n--- 1. Запрос статуса в WB API ---');
  const wbResult = await fetchWbOrderStatus(token, statsToken, ORDER_ID);
  if (wbResult) {
    console.log('  Найден в:', wbResult.source);
    console.log('  wbStatus:', wbResult.wbStatus ?? '(нет)');
    console.log('  supplierStatus:', wbResult.supplierStatus ?? '(нет)');
  } else {
    console.log('  Заказ не найден ни в FBS, ни в DBS, ни в DBW.');
  }

  // 2. Заказ в нашей БД (только при использовании БД)
  let ourOrder: { id?: string; externalId?: string; status: string; rawStatus?: string | null; wbStickerNumber?: string | null } | null = null;
  if (!USE_ENV_TOKENS) {
    console.log('\n--- 2. Заказ в нашей БД ---');
    const emailHash = crypto.hashForLookup(EMAIL);
    const user = await prisma.user.findFirst({
      where: { OR: [{ emailHash }, { email: EMAIL.toLowerCase().trim() }] },
      select: { id: true },
    });
    if (user) {
      ourOrder = await prisma.order.findFirst({
        where: {
          userId: user.id,
          marketplace: 'WILDBERRIES',
          OR: [{ externalId: ORDER_ID }, { wbStickerNumber: ORDER_ID }],
        },
        select: { id: true, externalId: true, status: true, rawStatus: true, wbStickerNumber: true, createdAt: true },
      });
    }
    if (ourOrder) {
    console.log('  ID:', ourOrder.id);
    console.log('  externalId:', ourOrder.externalId);
    console.log('  wbStickerNumber:', ourOrder.wbStickerNumber);
    console.log('  status (наше приложение):', ourOrder.status);
    console.log('  rawStatus (сырой WB):', ourOrder.rawStatus ?? '(не сохранён)');
    } else {
      console.log('  Заказ не найден в БД.');
    }
  }

  // 3. Вывод и рекомендации
  console.log('\n--- 3. Анализ ---');
  const wbStatus = wbResult?.supplierStatus ?? wbResult?.wbStatus ?? '';
  const wbConfirm = /confirm/i.test(wbStatus);
  const ourNew = ourOrder?.status === 'NEW';

  if (wbResult && ourOrder && wbConfirm && ourNew) {
    console.log('ПРОБЛЕМА: WB показывает «На сборке» (confirm), у нас — «Новый».');
    console.log('');
    console.log('Возможные причины:');
    if (!statsToken && wbResult.source.includes('DBW')) {
      console.log('  - Заказ ФБО (со склада WB). Нужен statsToken!');
      console.log('    Обновите токен «Статистика и Аналитика» в настройках WB.');
    }
    console.log('  - Cron sync работает каждые 5 мин. Подождите или запустите ручной sync:');
    console.log('    POST /api/orders/sync (с JWT этого пользователя)');
    console.log('  - Проверьте логи API на ошибки при синке заказов.');
  } else if (!wbResult) {
    console.log('Заказ не найден в WB API по id/srid:', ORDER_ID);
    console.log('  - Убедитесь, что это числовой id или srid заказа WB.');
    console.log('  - Для ФБО нужен statsToken (токен «Статистика и Аналитика»).');
  } else if (!ourOrder) {
    if (USE_ENV_TOKENS && wbResult) {
      console.log('Токены WB работают. Заказ найден в', wbResult.source);
      console.log('  Подключите эти токены в приложении: Маркетплейсы → WB → Основной + Статистика.');
    } else {
      console.log('Заказ не найден в нашей БД.');
      console.log('  - Синк мог не подтянуть заказ (например, товар не в каталоге).');
      console.log('  - Запустите POST /api/orders/sync для принудительной синхронизации.');
    }
  } else {
    console.log('Статусы совпадают или ситуация штатная.');
  }

  console.log('\n--- Готово ---');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
