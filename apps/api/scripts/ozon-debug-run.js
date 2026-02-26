#!/usr/bin/env node
/**
 * Запуск: cd apps/api && set -a && . ../../.env.production; set +a; node scripts/ozon-debug-run.js
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env.production'), override: true });

const { PrismaClient } = require('@prisma/client');
const { CryptoService } = require('../dist/src/common/crypto/crypto.service.js');
const axios = require('axios');

const prisma = new PrismaClient();
const crypto = new CryptoService();
const USER_ID = process.env.USER_ID || 'c127f2df-02da-4be8-b108-d6de8d31c83c';
const API_BASE = 'https://api-seller.ozon.ru';

async function main() {
  console.log('=== Ozon API Debug ===\nUser ID:', USER_ID, '\n');

  const ozonAll = await prisma.marketplaceConnection.findMany({
    where: { marketplace: 'OZON' },
    select: { userId: true, sellerId: true, token: true },
  });
  console.log('Ozon connections in DB:', ozonAll.length);
  ozonAll.forEach((c) => console.log('  userId:', c.userId, 'sellerId:', c.sellerId || '(empty)'));

  const conn = await prisma.marketplaceConnection.findFirst({
    where: { userId: USER_ID, marketplace: 'OZON' },
  });

  if (!conn) {
    console.log('\nOzon not connected for this user. Connect Ozon in Marketplace settings.');
    return;
  }

  const apiKey = conn.token ? crypto.decrypt(conn.token) : '';
  const clientId = (conn.sellerId || '').trim();

  if (!clientId || !apiKey) {
    console.log('Missing Client-Id or Api-Key');
    return;
  }

  console.log('\nClient-Id:', clientId);
  console.log('Api-Key:', apiKey.slice(0, 8) + '...');

  const headers = {
    'Client-Id': clientId,
    'Api-Key': apiKey,
    'Content-Type': 'application/json',
  };

  console.log('\n--- 1. v1/warehouse/list ---');
  try {
    const r1 = await axios.post(API_BASE + '/v1/warehouse/list', {}, { headers, timeout: 10000 });
    console.log('OK', r1.status, r1.data?.result?.length ?? 0, 'warehouses');
  } catch (e) {
    console.log('FAIL', e.response?.status, e.response?.data?.message || e.message);
  }

  console.log('\n--- 2. v3/product/import (test) ---');
  const testItem = {
    description_category_id: 17028922,
    type_id: 91565,
    name: 'Test HandySeller ' + Date.now(),
    offer_id: 'HSTEST' + Date.now(),
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

  try {
    const r2 = await axios.post(API_BASE + '/v3/product/import', { items: [testItem] }, { headers, timeout: 15000 });
    const taskId = r2.data?.result?.task_id;
    console.log('Created task_id:', taskId);

    if (taskId) {
      await new Promise((r) => setTimeout(r, 3000));
      const r3 = await axios.post(API_BASE + '/v1/product/import/info', { task_id: taskId }, { headers, timeout: 10000 });
      const items = r3.data?.result?.items || [];
      const first = items[0];
      console.log('Status:', first?.status, 'product_id:', first?.product_id);
      if (first?.errors?.length) console.log('Errors:', JSON.stringify(first.errors));
    }
  } catch (e) {
    console.log('FAIL', e.response?.status);
    console.log('Response:', JSON.stringify(e.response?.data || {}));
  }

  console.log('\n--- Done ---');
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
