import { Injectable, BadRequestException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../common/database/prisma.service';
import { StockLogSource } from '@prisma/client';
import { LoggerService } from '../../common/logger/logger.service';
import { PRODUCT_SYNC_CHANGED_EVENT, StockChangedPayload } from './products.service';

export interface StockChangeOptions {
  /** Разрешить отрицательные остатки (для продаж — «догонять» поставками) */
  allowNegative?: boolean;
  source?: StockLogSource;
  note?: string;
}

/**
 * Сервис атомарных операций с остатками.
 * Использует UPDATE stock = stock + delta на уровне БД для предотвращения race conditions.
 * При изменении emits stock.changed для авто-синхронизации с маркетплейсами (п.2.2 спецификации).
 */
@Injectable()
export class StockService {
  constructor(
    private prisma: PrismaService,
    private logger: LoggerService,
    private eventEmitter: EventEmitter2,
  ) {}

  /**
   * Атомарное изменение остатков.
   * @param productId UUID товара
   * @param userId Кто выполнил операцию
   * @param delta Положительное = пополнение, отрицательное = списание
   * @param options allowNegative — разрешить stock < 0; source, note
   */
  async change(
    productId: string,
    userId: string,
    delta: number,
    options: StockChangeOptions = {},
  ) {
    if (delta === 0) {
      const p = await this.prisma.product.findUnique({
        where: { id: productId },
        select: { id: true, stock: true, title: true, article: true },
      });
      return p;
    }

    const { allowNegative = false, source = StockLogSource.MANUAL, note } = options;

    const result = await this.prisma.$transaction(async (tx) => {
      // 0. Устанавливаем контекст для триггера product_change_trigger (логирует в product_change_log)
      await tx.$executeRawUnsafe(
        `SELECT set_config('app.changed_by', $1, true), set_config('app.change_source', $2, true), set_config('app.change_note', $3, true)`,
        String(userId),
        String(source ?? 'MANUAL'),
        String(note ?? ''),
      );
      // 1. Атомарный UPDATE с проверкой (при запрете отрицательных)
      const sql = allowNegative
        ? `UPDATE "Product" SET stock = stock + $1 WHERE id = $2 RETURNING id, stock, title, article`
        : `UPDATE "Product" SET stock = GREATEST(0, stock + $1) WHERE id = $2 RETURNING id, stock, title, article`;
      const rows = await tx.$queryRawUnsafe<
        Array<{ id: string; stock: number; title: string; article: string | null }>
      >(sql, delta, productId);

      if (!rows || rows.length === 0) {
        throw new BadRequestException('Товар не найден.');
      }

      const row = rows[0];
      const quantityAfter = Number(row.stock);
      const quantityBefore = quantityAfter - delta;

      if (quantityAfter < 0 && allowNegative) {
        this.logger.warn('Отрицательный остаток товара', {
          productId: row.id,
          productTitle: row.title,
          quantityAfter,
          delta,
          source,
        });
      }

      // 2. Запись в историю
      await tx.stockLog.create({
        data: {
          productId: row.id,
          userId,
          delta,
          quantityBefore,
          quantityAfter,
          source,
          note: note ?? undefined,
        },
      });

    });

    const updated = await this.prisma.product.findUnique({
      where: { id: productId },
    });
    if (updated) {
      this.eventEmitter.emit(PRODUCT_SYNC_CHANGED_EVENT, { userId, productId } as StockChangedPayload);
    }
    return updated;
  }

  /**
   * Резервирование (списание) при продаже. По умолчанию не допускает отрицательных остатков.
   */
  async reserve(
    productId: string,
    userId: string,
    quantity: number,
    options: Omit<StockChangeOptions, 'allowNegative'> & { allowNegative?: boolean } = {},
  ) {
    if (quantity <= 0) {
      throw new BadRequestException('Количество для резервирования должно быть положительным.');
    }
    return this.change(productId, userId, -quantity, {
      ...options,
      source: options.source ?? StockLogSource.SALE,
      allowNegative: options.allowNegative ?? false,
    });
  }

  /**
   * Возврат остатков при отмене заказа.
   */
  async release(
    productId: string,
    userId: string,
    quantity: number,
    options: Omit<StockChangeOptions, 'allowNegative'> = {},
  ) {
    if (quantity <= 0) {
      throw new BadRequestException('Количество для возврата должно быть положительным.');
    }
    return this.change(productId, userId, quantity, {
      ...options,
      source: options.source ?? StockLogSource.SALE,
    });
  }
}
