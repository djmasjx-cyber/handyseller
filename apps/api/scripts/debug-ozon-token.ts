#!/usr/bin/env npx ts-node
/**
 * Отладка Ozon API: проверка токена и API ключа для пользователя.
 *
 * Вариант 1 (с БД): USER_ID=c127f2df-02da-4be8-b108-d6de8d31c83c npx ts-node scripts/debug-ozon-token.ts
 * Вариант 2 (без БД): USE_ENV_CREDS=1 OZON_CLIENT_ID=xxx OZON_API_KEY=xxx npx ts-node scripts/debug-ozon-token.ts
 *
 * Ozon: Client-Id (seller_id) + Api-Key (token) — из личного кабинета Ozon Seller.
 */
import * as dotenv from 'dotenv';
import * as path from 'path';
import axios from 'axios';
import { PrismaClient } from '@prisma/client';
dotenv.config({ path: path.join(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../../.env.secrets'), override: true });

import { createCryptoServiceForCli } from '../src/common/crypto/bootstrap-for-cli';

const prisma = new PrismaClient();

const API_BASE = 'https://api-seller.ozon.ru';
const USER_ID = process.env.USER_ID || 'c127f2df-02da-4be8-b108-d6de8d31c83c';
const USE_ENV_CREDS = process.env.USE_ENV_CREDS === '1' || process.env.USE_ENV_CREDS === 'true';

function headers(clientId: string, apiKey: string) {
  return {
    'Client-Id': clientId.trim(),
    'Api-Key': apiKey.trim(),
    'Content-Type': 'application/json',
  };
}

async function testEndpoint(
  name: string,
  clientId: string,
  apiKey: string,
  url: string,
  body: object = {},
): Promise<{ ok: boolean; status?: number; data?: unknown; error?: string }> {
  try {
    const { status, data } = await axios.post(url, body, {
      headers: headers(clientId, apiKey),
      timeout: 15000,
      validateStatus: () => true,
    });
    if (status >= 200 && status < 300) {
      return { ok: true, status, data };
    }
    const errDetail = (data as { message?: string; details?: Array<{ message?: string }> })?.details?.[0]?.message
      ?? (data as { message?: string }).message
      ?? JSON.stringify(data).slice(0, 300);
    return { ok: false, status, data, error: errDetail };
  } catch (err: unknown) {
    const axErr = err as { response?: { status?: number; data?: unknown } };
    const status = axErr?.response?.status;
    const data = axErr?.response?.data;
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, status, data, error: msg };
  }
}

async function main() {
  const crypto = await createCryptoServiceForCli();
  console.log('=== Отладка Ozon API для Манойло Николая ===\n');
  console.log(`User ID: ${USER_ID}\n`);

  let clientId: string;
  let apiKey: string;

  if (USE_ENV_CREDS) {
    clientId = (process.env.OZON_CLIENT_ID ?? '').trim();
    apiKey = (process.env.OZON_API_KEY ?? '').trim();
    if (!clientId || !apiKey) {
      console.error('USE_ENV_CREDS=1 задан, но OZON_CLIENT_ID или OZON_API_KEY пусты.');
      process.exit(1);
    }
    console.log('Режим: credentials из env (без БД)\n');
  } else {
    const conn = await prisma.marketplaceConnection.findFirst({
      where: { userId: USER_ID, marketplace: 'OZON' },
    });

    if (!conn) {
      console.error('Ошибка: Ozon не подключён для этого пользователя.');
      console.log('Подключите Ozon в разделе Маркетплейсы (Client-Id + Api-Key).');
      console.log('Или используйте: USE_ENV_CREDS=1 OZON_CLIENT_ID=xxx OZON_API_KEY=xxx');
      process.exit(1);
    }

    try {
      apiKey = conn.token ? crypto.decrypt(conn.token) : '';
    } catch (e) {
      console.error('Ошибка: не удалось расшифровать token (проверьте ENCRYPTION_KEY).');
      process.exit(1);
    }

    clientId = (conn.sellerId ?? '').trim();
    if (!clientId) {
      console.error('Ошибка: seller_id (Client-Id) не указан. Укажите в настройках Ozon.');
      process.exit(1);
    }
    if (!apiKey) {
      console.error('Ошибка: Api-Key (token) пуст.');
      process.exit(1);
    }
  }

  console.log(`Client-Id: ${clientId}`);
  console.log(`Api-Key: ${apiKey.slice(0, 8)}...${apiKey.slice(-4)}`);
  console.log('');

  // 1. Проверка аутентификации
  console.log('--- 1. Проверка аутентификации ---');
  const endpoints: Array<{ name: string; url: string; body: object }> = [
    { name: 'v1/warehouse/list', url: `${API_BASE}/v1/warehouse/list`, body: {} },
    { name: 'v2/product/list', url: `${API_BASE}/v2/product/list`, body: { limit: 1, offset: 0 } },
    { name: 'v3/product/list', url: `${API_BASE}/v3/product/list`, body: {} },
  ];

  for (const ep of endpoints) {
    const res = await testEndpoint(ep.name, clientId, apiKey, ep.url, ep.body);
    if (res.ok) {
      console.log(`  ✓ ${ep.name}: OK (HTTP ${res.status})`);
    } else {
      console.log(`  ✗ ${ep.name}: FAIL (HTTP ${res.status})`);
      console.log(`    Ошибка: ${res.error}`);
      if ((res.data as object) && typeof res.data === 'object') {
        console.log(`    Ответ:`, JSON.stringify(res.data, null, 2).slice(0, 500));
      }
    }
  }

  // 2. Список складов (для выгрузки остатков)
  console.log('\n--- 2. Список складов ---');
  const whRes = await testEndpoint('warehouse/list', clientId, apiKey, `${API_BASE}/v1/warehouse/list`, {});
  if (whRes.ok && whRes.data) {
    const items = ((whRes.data as { result?: unknown[] }).result ?? []) as Array<{ warehouse_id?: number; name?: string }>;
    if (items.length === 0) {
      console.log('  Склады не найдены. Для выгрузки остатков нужно создать склад в ЛК Ozon.');
    } else {
      items.forEach((w) => console.log(`  - ID ${w.warehouse_id}: ${w.name ?? ''}`));
    }
  }

  // 3. Тестовый запрос v3/product/import (минимальная карточка — только для проверки формата)
  console.log('\n--- 3. Тестовый импорт товара (минимальная карточка) ---');
  const testItem = {
    description_category_id: 17028922,
    type_id: 91565,
    name: 'Тест HandySeller ' + Date.now(),
    offer_id: 'HS_TEST_' + Date.now(),
    barcode: '4607012345678',
    price: '100',
    old_price: '120',
    vat: '0',
    height: 100,
    width: 100,
    depth: 100,
    dimension_unit: 'mm',
    weight: 100,
    weight_unit: 'g',
    images: ['https://cdn.ozon.ru/multimedia/1026626492.jpg'],
  };

  const importRes = await testEndpoint(
    'v3/product/import',
    clientId,
    apiKey,
    `${API_BASE}/v3/product/import`,
    { items: [testItem] },
  );

  if (importRes.ok && importRes.data) {
    const taskId = (importRes.data as { result?: { task_id?: string } }).result?.task_id;
    console.log(`  ✓ Импорт создан, task_id: ${taskId}`);
    if (taskId) {
      await new Promise((r) => setTimeout(r, 3000));
      const infoRes = await testEndpoint(
        'v1/product/import/info',
        clientId,
        apiKey,
        `${API_BASE}/v1/product/import/info`,
        { task_id: taskId },
      );
      if (infoRes.ok && infoRes.data) {
        const result = (infoRes.data as { result?: { items?: unknown[]; state?: string } }).result;
        const items = result?.items ?? [];
        const first = items[0] as { status?: string; product_id?: number; errors?: unknown[] } | undefined;
        console.log(`  Статус: ${first?.status ?? result?.state}`);
        if (first?.product_id) console.log(`  product_id: ${first.product_id}`);
        if (Array.isArray(first?.errors) && first.errors.length) {
          console.log('  Ошибки Ozon:', JSON.stringify(first.errors));
        }
      }
    }
  } else {
    console.log(`  ✗ Ошибка импорта: ${importRes.error}`);
    if (importRes.data) {
      console.log('  Ответ Ozon:', JSON.stringify(importRes.data, null, 2));
    }
  }

  console.log('\n--- Готово ---');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
