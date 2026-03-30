#!/usr/bin/env npx ts-node
/**
 * Диагностика FBO-заказов WB: проверка, откуда приходят заказы и почему списывают «Мой склад».
 *
 * Сценарий: товар возвращён/отказ при получении → на СЦ WB → новый заказ → WB отгружает со своего СЦ.
 * Такие заказы НЕ должны влиять на остаток «Мой склад».
 *
 * Запуск: EMAIL=user@example.com ORDER_IDS=4680400358,4510843907 npx ts-node scripts/debug-wb-order-fbo.ts
 * Или один заказ: ORDER_ID=4680400358 EMAIL=... npx ts-node scripts/debug-wb-order-fbo.ts
 */
import * as dotenv from 'dotenv';
import * as path from 'path';
import axios from 'axios';
import { PrismaClient } from '@prisma/client';
import { createCryptoServiceForCli } from '../src/common/crypto/bootstrap-for-cli';

dotenv.config({ path: path.join(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../../.env.secrets'), override: true });

const prisma = new PrismaClient();

const MARKETPLACE_API = 'https://marketplace-api.wildberries.ru';
const ORDER_IDS_STR = process.env.ORDER_IDS || process.env.ORDER_ID || '';
const ORDER_IDS = ORDER_IDS_STR.split(/[,\s]+/).filter(Boolean);
const EMAIL = process.env.EMAIL || '';

function authHeader(token: string) {
  const t = token.startsWith('Bearer ') ? token : `Bearer ${token}`;
  return { Authorization: t, 'Content-Type': 'application/json' };
}

type EndpointResult = {
  path: string;
  label: string;
  useStats: boolean;
  found: boolean;
  raw?: unknown;
  error?: string;
};

async function checkOrderInEndpoint(
  token: string,
  statsToken: string | null,
  orderId: string,
  ep: { path: string; bodyKey: string; bodyVal: number[]; useStats?: boolean },
): Promise<EndpointResult> {
  const label = ep.useStats ? 'DBW (ФБО, statsToken)' : ep.path.includes('dbs') ? 'DBS' : 'FBS';
  const tok = ep.useStats && statsToken ? statsToken : token;
  if (!tok && ep.useStats) {
    return { path: ep.path, label, useStats: !!ep.useStats, found: false, error: 'statsToken отсутствует' };
  }
  try {
    const { data } = await axios.post(
      `${MARKETPLACE_API}${ep.path}`,
      { [ep.bodyKey]: ep.bodyVal },
      { timeout: 10000, headers: authHeader(tok || token) },
    );
    const orders = (data as { orders?: unknown[] }).orders ?? [];
    const o = orders[0];
    return {
      path: ep.path,
      label,
      useStats: !!ep.useStats,
      found: !!o,
      raw: o,
    };
  } catch (err: unknown) {
    const status = (err as { response?: { status?: number } })?.response?.status;
    const msg = (err as Error)?.message;
    return {
      path: ep.path,
      label,
      useStats: !!ep.useStats,
      found: false,
      error: status ? `HTTP ${status}` : msg || 'Ошибка',
    };
  }
}

async function fetchReshipmentOrders(token: string): Promise<unknown[]> {
  try {
    const { data } = await axios.get(`${MARKETPLACE_API}/api/v3/supplies/orders/reshipment`, {
      timeout: 10000,
      headers: authHeader(token),
    });
    return (data as { orders?: unknown[] }).orders ?? [];
  } catch {
    return [];
  }
}

/** Получить полные данные заказов из FBS/DBW (deliveryType, warehouseId и т.д.) */
async function fetchOrderDetails(
  token: string,
  statsToken: string | null,
  orderIds: number[],
): Promise<Map<number, { source: string; deliveryType?: string; warehouseId?: number; raw: unknown }>> {
  const result = new Map<number, { source: string; deliveryType?: string; warehouseId?: number; raw: unknown }>();
  const now = Math.floor(Date.now() / 1000);
  const monthAgo = now - 30 * 24 * 3600;

  const listEndpoints: Array<{ path: string; params?: Record<string, number>; label: string; useStats?: boolean }> = [
    { path: '/api/v3/orders/new', label: 'FBS new' },
    { path: '/api/v3/dbw/orders/new', label: 'DBW new', useStats: true },
    { path: '/api/v3/orders', params: { dateFrom: monthAgo, dateTo: now, next: 0, limit: 1000 }, label: 'FBS' },
    { path: '/api/v3/dbw/orders', params: { dateFrom: monthAgo, dateTo: now, next: 0, limit: 1000 }, label: 'DBW', useStats: true },
  ];

  for (const ep of listEndpoints) {
    const tok = ep.useStats && statsToken ? statsToken : token;
    if (!tok && ep.useStats) continue;
    try {
      const { data } = await axios.get(`${MARKETPLACE_API}${ep.path}`, {
        params: ep.params ?? {},
        timeout: 15000,
        headers: authHeader(tok || token),
      });
      const orders = (data as { orders?: Array<Record<string, unknown>> }).orders ?? [];
      for (const o of orders) {
        const id = o.id ?? o.orderId;
        if (id != null && orderIds.includes(Number(id))) {
          const deliveryType = (o.deliveryType ?? o.delivery_type) as string | undefined;
          const warehouseId = o.warehouseId as number | undefined;
          const numId = Number(id);
          const existing = result.get(numId);
          // Приоритет DBW (ФБО) — если заказ и в FBS, и в DBW
          if (!existing || ep.label.startsWith('DBW')) {
            result.set(numId, {
              source: ep.label,
              deliveryType,
              warehouseId,
              raw: o,
            });
          }
        }
      }
    } catch {
      /* skip */
    }
  }
  return result;
}

async function main() {
  const crypto = await createCryptoServiceForCli();
  const ids = ORDER_IDS.length > 0 ? ORDER_IDS : ['4680400358', '4510843907'];
  console.log('=== Диагностика FBO-заказов WB ===\n');
  console.log('Сценарий: товар на СЦ WB (возврат/отказ) → новый заказ → WB отгружает со своего склада.');
  console.log('Такие заказы НЕ должны списывать «Мой склад».\n');
  console.log('Заказы:', ids.join(', '));

  if (!EMAIL) {
    console.error('\nУкажите EMAIL пользователя для доступа к токенам WB.');
    process.exit(1);
  }

  const emailHash = crypto.hashForLookup(EMAIL);
  const user = await prisma.user.findFirst({
    where: { OR: [{ emailHash }, { email: EMAIL.toLowerCase().trim() }] },
    select: { id: true, emailEncrypted: true },
  });
  if (!user) {
    console.error('Пользователь не найден:', EMAIL);
    process.exit(1);
  }

  const conn = await prisma.marketplaceConnection.findFirst({
    where: { userId: user.id, marketplace: 'WILDBERRIES' },
  });
  if (!conn?.token) {
    console.error('Подключение WB не найдено.');
    process.exit(1);
  }

  const token = crypto.decrypt(conn.token);
  const statsToken = conn.statsToken ? crypto.decrypt(conn.statsToken) : null;

  console.log('\nТокены: основной OK, statsToken (ФБО):', statsToken ? 'есть' : 'НЕТ');
  if (!statsToken) {
    console.log('  ⚠ Без statsToken заказы DBW (со склада WB) не загружаются!');
    console.log('  Добавьте токен «Статистика и Аналитика» в Маркетплейсы → WB.');
  }

  const endpoints = [
    { path: '/api/v3/orders/status', bodyKey: 'orders', bodyVal: [] as number[] },
    { path: '/api/marketplace/v3/dbs/orders/status/info', bodyKey: 'ordersIds', bodyVal: [] as number[] },
    { path: '/api/v3/dbw/orders/status', bodyKey: 'orders', bodyVal: [] as number[], useStats: true },
  ];

  // 1. Проверка каждого заказа во всех эндпоинтах
  console.log('\n--- 1. Где WB возвращает эти заказы ---');
  for (const orderId of ids) {
    const numId = parseInt(orderId, 10);
    if (isNaN(numId)) continue;
    endpoints[0].bodyVal = [numId];
    endpoints[1].bodyVal = [numId];
    endpoints[2].bodyVal = [numId];

    console.log(`\n  Заказ ${orderId}:`);
    const results: EndpointResult[] = [];
    for (const ep of endpoints) {
      const r = await checkOrderInEndpoint(token, statsToken, orderId, ep);
      results.push(r);
      const status = r.raw && typeof r.raw === 'object' && 'supplierStatus' in r.raw
        ? (r.raw as { supplierStatus?: string }).supplierStatus
        : r.raw && typeof r.raw === 'object' && 'wbStatus' in r.raw
          ? (r.raw as { wbStatus?: string }).wbStatus
          : null;
      console.log(`    ${r.label}: ${r.found ? `найден (${status ?? '—'})` : r.error ?? 'не найден'}`);
      if (r.found && r.raw && process.env.VERBOSE === '1') {
        console.log('      raw:', JSON.stringify(r.raw, null, 2));
      }
    }

    const fbsFound = results[0].found;
    const dbwFound = results[2].found;
    if (fbsFound && !dbwFound && !statsToken) {
      console.log(`    ⚠ Заказ в FBS, но DBW не проверен (нет statsToken). Может быть ФБО!`);
    }
    if (fbsFound && dbwFound) {
      console.log(`    → Заказ есть и в FBS, и в DBW. Приоритет DBW (ФБО) — не списывать склад.`);
    }
  }

  // 2. Полные данные заказов (deliveryType, warehouseId)
  console.log('\n--- 2. Полные данные заказов (deliveryType, warehouseId) ---');
  const numIds = ids.map((id) => parseInt(id, 10)).filter((n) => !isNaN(n));
  const details = await fetchOrderDetails(token, statsToken, numIds);
  for (const orderId of ids) {
    const numId = parseInt(orderId, 10);
    const d = details.get(numId);
    if (d) {
      console.log(`  ${orderId}: source=${d.source}, deliveryType=${d.deliveryType ?? '—'}, warehouseId=${d.warehouseId ?? '—'}`);
      if (d.deliveryType && /dbw/i.test(d.deliveryType)) {
        console.log(`    → deliveryType=dbw: заказ со склада WB (ФБО), не должен списывать Мой склад`);
      }
    } else {
      console.log(`  ${orderId}: не найден в списках FBS/DBW (возможно, старый заказ или другой эндпоинт)`);
    }
  }

  // 3. Заказы на переотправку (reshipment)
  console.log('\n--- 3. Заказы на переотправку (reshipment) ---');
  const reshipment = await fetchReshipmentOrders(token);
  const reshipmentIds = new Set(
    (reshipment as Array<{ id?: number }>).map((o) => String(o.id ?? '')),
  );
  const inReshipment = ids.filter((id) => reshipmentIds.has(id));
  if (inReshipment.length > 0) {
    console.log('  Найдены в reshipment:', inReshipment.join(', '));
    console.log('  (Товар на складе WB, требуется переотправка — не должен списывать Мой склад)');
  } else {
    console.log('  Ни один из заказов не в списке переотправки.');
  }

  // 4. Наша БД
  console.log('\n--- 4. Заказы в нашей БД ---');
  for (const orderId of ids) {
    const ourOrder = await prisma.order.findFirst({
      where: {
        userId: user.id,
        marketplace: 'WILDBERRIES',
        OR: [{ externalId: orderId }, { wbStickerNumber: orderId }],
      },
      select: {
        id: true,
        externalId: true,
        status: true,
        rawStatus: true,
        wbFulfillmentType: true,
        isFbo: true,
        createdAt: true,
      },
    });
    if (ourOrder) {
      console.log(`  ${orderId}: wbFulfillmentType=${ourOrder.wbFulfillmentType ?? '—'}, isFbo=${ourOrder.isFbo ?? '—'}, status=${ourOrder.status}`);
      if (ourOrder.wbFulfillmentType !== 'DBW' && ourOrder.isFbo !== true) {
        console.log(`    ⚠ Помечен как FBS/DBS — списывает «Мой склад». Если это ФБО — нужен sync с statsToken.`);
      }
    } else {
      console.log(`  ${orderId}: не найден в БД`);
    }
  }

  // 5. Рекомендации
  console.log('\n--- 5. Рекомендации ---');
  if (!statsToken) {
    console.log('  1. Добавьте токен «Статистика и Аналитика» (ЛК WB → API) в настройки WB.');
    console.log('  2. Запустите POST /api/orders/sync для пересинхронизации.');
  } else {
    console.log('  1. Запустите POST /api/orders/sync — заказы из DBW получат isFbo=true.');
    console.log('  2. При backfill исправления FBO остаток будет возвращён на «Мой склад».');
  }
  console.log('\n--- Готово ---');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
