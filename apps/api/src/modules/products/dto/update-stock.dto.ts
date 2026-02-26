import { IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateStockDto {
  /** Абсолютное значение остатка (0 и выше) */
  @IsInt()
  @Min(0)
  @Max(999999)
  @Type(() => Number)
  stock: number;
}
