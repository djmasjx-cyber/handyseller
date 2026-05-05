import { strict as assert } from 'assert';
import * as XLSX from 'xlsx';
import { WmsAnalyticsService } from '../src/modules/wms/analytics/wms-analytics.service';

async function main() {
  delete process.env.WMS_DATABASE_URL;
  delete process.env.DATABASE_URL;

  const rows = [
    [
      'Ссылка',
      'Номер',
      'Дата',
      'СкладОтправитель',
      'СкладПолучатель',
      'Номенклатура',
      'Назначение',
      'НоменклатураАртикул',
      'НоменклатураКод',
      'ДокументОснование',
      'ЭтоРозничнаяЦена',
      'РозничнаяЦена',
      'Себестоимость',
      'Контрогент',
      'Доставка',
    ],
    ['ref-1', 'MOV-1', '01.01.2026 10:00:00', 'Склад Запчасти ОСИНОВО', 'Склад Запчасти ЛОНМАДИ ЕЛИНО', 'Товар X', '', 'ART-X', 'CODE-X', '', 'Нет', 10, 7, 'КТ-1', ''],
    /** Пополнение: в Назначение или ДокументОснование есть номер пополнения LM… (полный текст режется до LM при сохранении). */
    ['ref-2', 'MOV-2', '02.01.2026 10:00:00', 'Склад Запчасти ЕЛИНО', 'Склад Запчасти ЛОНМАДИ ЕЛИНО', 'Товар X', 'Назначение-A', 'ART-X', 'CODE-X', 'Передача LM00-022106 (прим.)', 'Нет', 20, 12, 'КТ-2', ''],
    ['ref-3', 'MOV-3', '03.01.2026 10:00:00', 'Склад Техники РОСТОВ', 'Склад Запчасти ЛОНМАДИ ЕЛИНО', 'Товар X', '', 'ART-X', 'CODE-X', '', 'Нет', 30, 20, 'КТ-3', 4],
    /** MOV-4: пополнение только у строки с непустым Назначение или Основание; вторая строка — турист. */
    ['ref-4a', 'MOV-4', '04.01.2026 10:00:00', 'Склад Запчасти ЕЛИНО', 'Склад Запчасти ЛОНМАДИ ЕЛИНО', 'Товар X', 'LM00-010001 пополнение', 'ART-X', 'CODE-X', '', 'Нет', 40, 32, 'КТ-4', ''],
    ['ref-4b', 'MOV-4', '04.01.2026 10:00:00', 'Склад Запчасти ЕЛИНО', 'Склад Запчасти ЛОНМАДИ ЕЛИНО', 'Товар X', '', 'ART-X', 'CODE-X', '', 'Нет', 40, 25, 'КТ-5', 5],
  ];
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), 'Лист_1');
  const contentBase64 = XLSX.write(book, { bookType: 'xlsx', type: 'buffer' }).toString('base64');

  const service = new WmsAnalyticsService();
  const result = await service.importTransferOrders('test-user', {
    fileName: 'transfer-orders.xlsx',
    contentBase64,
  });

  assert.equal(result.batch.rawRowCount, 5);
  assert.equal(result.batch.importedRowCount, 5);
  assert.equal(result.summary.rowsTotal, 5);
  assert.equal(result.summary.ordersTotal, 4);
  assert.equal(result.summary.replenishmentRows, 2);
  assert.equal(result.summary.touristRows, 3);
  assert.equal(result.summary.touristValue, 80);

  const byOp = await service.getTransfersByOp('test-user', {});
  assert.equal(byOp[0].receiverOp, 'ЛОНМАДИ ЕЛИНО');
  assert.equal(byOp[0].receiverWarehouseType, 'Склад Запчасти');
  assert.equal(byOp[0].rows, 5);
  assert.equal(byOp[0].touristRows, 3);
  assert.equal(byOp[0].touristValue, 80);

  const options = await service.getTransferOptions('test-user');
  assert.equal(options.warehouseTypes.includes('Склад Запчасти'), true);
  assert.equal(options.warehouseTypes.includes('Склад Техники'), true);
  assert.equal(options.receiverOps.includes('ЛОНМАДИ ЕЛИНО'), true);

  const touristOrders = await service.getTouristOrders('test-user', {});
  const mov3 = touristOrders.find((o) => o.orderNumber === 'MOV-3');
  assert.equal(mov3 != null && mov3.orderTotal === 30, true);
  assert.equal(mov3 != null && mov3.marginTotal === 10, true);
  assert.equal(mov3 != null && mov3.deliveryTotal === 4, true);
  assert.equal(mov3 != null && mov3.differenceTotal === 6, true);
  const detail = await service.getTouristOrderDetail('test-user', 'MOV-3', {});
  assert.equal(detail.lines.some((l) => l.itemCode === 'CODE-X' && l.sum === 30), true);

  const freq = await service.getItemFrequency('test-user', {});
  const fx = freq.find((r) => r.itemCode === 'CODE-X');
  assert.equal(fx != null && fx.rowCount >= 5, true);

  const risks = await service.getReplenishmentRisks('test-user', {});
  assert.equal(risks.length, 2);
  const byValue = [...risks].sort((a, b) => b.touristValueUntilNextReplenishment - a.touristValueUntilNextReplenishment);
  assert.equal(byValue[0].receiverOp, 'ЛОНМАДИ ЕЛИНО');
  assert.equal(byValue[0].touristRowsUntilNextReplenishment, 1);
  assert.equal(byValue[0].touristValueUntilNextReplenishment, 40);
  assert.equal(byValue[1].touristRowsUntilNextReplenishment, 1);
  assert.equal(byValue[1].touristValueUntilNextReplenishment, 30);
}

void main();
