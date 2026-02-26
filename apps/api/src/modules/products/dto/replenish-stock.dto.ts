import { IsString, IsInt, Min, IsOptional, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class ReplenishStockDto {
  /** Product ID (UUID) или артикул */
  @IsString()
  productIdOrArticle: string;

  /** Изменение: положительное = пополнение, отрицательное = списание */
  @IsInt()
  @Min(-100000)
  @Max(100000)
  @Type(() => Number)
  delta: number;

  @IsOptional()
  @IsString()
  note?: string;
}
