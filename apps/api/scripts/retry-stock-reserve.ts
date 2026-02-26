#!/usr/bin/env node
/**
 * Повторное резервирование остатка для заказа (если не было при создании).
 * Запуск: EXTERNAL_ID=4686579129 node scripts/retry-stock-reserve.js
 * Или: ORDER_ID=uuid node scripts/retry-stock-reserve.js
 */
import * as dotenv from 'dotenv';
import * as path from 'path';
import { NestFactory } from '@nestjs/core';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { OrdersService } from '../src/modules/orders/orders.service';

dotenv.config({ path: path.join(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../../.env.secrets'), override: true });

const EXTERNAL_ID = process.env.EXTERNAL_ID?.trim();
const ORDER_ID = process.env.ORDER_ID?.trim();
const ID = ORDER_ID ?? EXTERNAL_ID;

async function main() {
  if (!ID) {
    console.error('Укажите EXTERNAL_ID или ORDER_ID, например: EXTERNAL_ID=4686579129 node scripts/retry-stock-reserve.js');
    process.exit(1);
  }
  const prisma = new PrismaClient();
  const order = await prisma.order.findFirst({
    where: { OR: [{ id: ID }, { externalId: ID }] },
    select: { userId: true, externalId: true },
  });
  await prisma.$disconnect();
  if (!order) {
    console.error('Заказ не найден:', ID);
    process.exit(1);
  }
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  const ordersService = app.get(OrdersService);
  try {
    const result = await ordersService.retryStockReserve(order.userId, ID);
    console.log(JSON.stringify(result, null, 2));
    if (result.ok) {
      console.log('Остатки обновлены. StockSyncListener отправит на WB/Ozon.');
    } else {
      console.error(result.message);
      process.exit(1);
    }
  } finally {
    await app.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
