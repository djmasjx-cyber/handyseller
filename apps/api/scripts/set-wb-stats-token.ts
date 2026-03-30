#!/usr/bin/env npx ts-node
/**
 * Установка statsToken для WB (токен «Статистика и Аналитика»).
 * Запуск: WB_STATS_TOKEN="jwt..." npx ts-node scripts/set-wb-stats-token.ts
 * Токен берётся из env, в код не попадает.
 */
import * as dotenv from 'dotenv';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';
import { createCryptoServiceForCli } from '../src/common/crypto/bootstrap-for-cli';

dotenv.config({ path: path.join(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../../.env.secrets'), override: true });

const prisma = new PrismaClient();

async function main() {
  const crypto = await createCryptoServiceForCli();
  const token = process.env.WB_STATS_TOKEN?.trim();
  if (!token) {
    console.error('Укажите WB_STATS_TOKEN в env.');
    process.exit(1);
  }

  const conns = await prisma.marketplaceConnection.findMany({
    where: { marketplace: 'WILDBERRIES' },
    select: { id: true, userId: true },
  });
  if (conns.length === 0) {
    console.error('Подключение WB не найдено.');
    process.exit(1);
  }

  const encrypted = crypto.encrypt(token);
  for (const c of conns) {
    await prisma.marketplaceConnection.update({
      where: { id: c.id },
      data: { statsToken: encrypted, lastError: null },
    });
    console.log('statsToken обновлён для WB (userId:', c.userId, ')');
  }
  console.log('Готово.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
