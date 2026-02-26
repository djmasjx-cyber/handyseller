#!/usr/bin/env npx ts-node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv = require("dotenv");
const path = require("path");
const axios_1 = require("axios");
const client_1 = require("@prisma/client");
const crypto_service_1 = require("../src/common/crypto/crypto.service");
dotenv.config({ path: path.join(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../../.env.secrets'), override: true });
const prisma = new client_1.PrismaClient();
const crypto = new crypto_service_1.CryptoService();
const ORDER_ID = process.env.ORDER_ID || '4501750166';
const EMAIL = process.env.EMAIL;
const STATISTICS_API = 'https://statistics-api.wildberries.ru';
async function main() {
    console.log('=== Логистика и комиссия по заказу WB ===\n');
    console.log(`Заказ: ${ORDER_ID}\n`);
    const order = await prisma.order.findFirst({
        where: {
            marketplace: 'WILDBERRIES',
            OR: [{ externalId: ORDER_ID }, { wbStickerNumber: ORDER_ID }],
            ...(EMAIL
                ? {
                    user: {
                        OR: [{ emailHash: crypto.hashForLookup(EMAIL) }, { email: EMAIL.toLowerCase().trim() }],
                    },
                }
                : {}),
        },
        select: {
            id: true,
            externalId: true,
            wbStickerNumber: true,
            totalAmount: true,
            status: true,
            logisticsCost: true,
            commissionAmount: true,
            costsSyncedAt: true,
            createdAt: true,
            userId: true,
        },
    });
    if (!order) {
        console.log('Заказ не найден в БД. Проверьте ORDER_ID и EMAIL (если несколько пользователей).');
        process.exit(1);
    }
    console.log('Заказ в БД:');
    console.log('  id:', order.id);
    console.log('  externalId (srid):', order.externalId);
    console.log('  wbStickerNumber:', order.wbStickerNumber);
    console.log('  totalAmount:', order.totalAmount, '₽');
    console.log('  status:', order.status);
    console.log('  logisticsCost:', order.logisticsCost ?? '—');
    console.log('  commissionAmount:', order.commissionAmount ?? '—');
    console.log('  costsSyncedAt:', order.costsSyncedAt?.toISOString() ?? '—');
    console.log('  createdAt:', order.createdAt.toISOString());
    console.log('');
    const conn = await prisma.marketplaceConnection.findFirst({
        where: { userId: order.userId, marketplace: 'WILDBERRIES' },
    });
    if (!conn?.statsToken) {
        console.log('statsToken не найден. Добавьте токен «Статистика и Аналитика» в настройках WB.');
        process.exit(1);
    }
    const token = crypto.decrypt(conn.statsToken);
    const monthStart = new Date(order.createdAt.getFullYear(), order.createdAt.getMonth(), 1);
    const monthEnd = new Date(order.createdAt.getFullYear(), order.createdAt.getMonth() + 1, 0, 23, 59, 59);
    console.log('Запрос WB reportDetailByPeriod:');
    console.log('  dateFrom:', monthStart.toISOString());
    console.log('  dateTo:', monthEnd.toISOString());
    console.log('  ищем srid:', order.externalId);
    console.log('');
    const { data } = await axios_1.default.get(`${STATISTICS_API}/api/v5/supplier/reportDetailByPeriod`, {
        headers: { Authorization: `Bearer ${token}` },
        params: { dateFrom: monthStart.toISOString(), dateTo: monthEnd.toISOString(), rrdid: 0, limit: 10000 },
    });
    if (!Array.isArray(data) || data.length === 0) {
        console.log('Отчёт пуст или 204. Проверьте период и права токена.');
        process.exit(0);
    }
    const rows = data.filter((r) => {
        const srid = String(r.srid ?? '').trim();
        return srid === order.externalId;
    });
    if (rows.length === 0) {
        console.log('Строк с srid =', order.externalId, 'не найдено.');
        console.log('Примеры srid из отчёта:', [...new Set(data.slice(0, 5).map((r) => r.srid))]);
        process.exit(0);
    }
    let totalLogistics = 0;
    let totalCommission = 0;
    console.log(`Найдено строк: ${rows.length}\n`);
    for (const r of rows) {
        const delivery = Number(r.delivery_rub ?? 0);
        const commission = Number(r.ppvz_sales_commission ?? 0);
        totalLogistics += delivery;
        totalCommission += commission;
        console.log('  nm_id:', r.nm_id, '| doc_type:', r.doc_type_name, '| qty:', r.quantity);
        console.log('    delivery_rub:', delivery, '| ppvz_sales_commission:', commission);
    }
    console.log('\n--- Итого по заказу ---');
    console.log('  Логистика:', totalLogistics.toFixed(2), '₽');
    console.log('  Комиссия:', totalCommission.toFixed(2), '₽');
}
main()
    .catch((e) => {
    console.error(e);
    process.exit(1);
})
    .finally(() => prisma.$disconnect());
//# sourceMappingURL=debug-order-costs.js.map