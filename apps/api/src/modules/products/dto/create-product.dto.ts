import { IsString, IsNumber, IsOptional, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
export class CreateProductDto {
  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsNumber()
  cost?: number;

  /** Ваша цена (продажная) для Ozon */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(20)
  price?: number;

  /** Цена до скидки для Ozon */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  oldPrice?: number;

  @IsOptional()
  @IsString()
  article?: string;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsOptional()
  @IsString()
  sku?: string;

  @IsOptional()
  @IsString()
  brand?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(500000)
  weight?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10000)
  width?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10000)
  length?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10000)
  height?: number;

  @IsOptional()
  @IsString()
  productUrl?: string;

  @IsOptional()
  @IsString()
  color?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  itemsPerPack?: number;

  @IsOptional()
  @IsString()
  material?: string;

  @IsOptional()
  @IsString()
  craftType?: string;

  @IsOptional()
  @IsString()
  countryOfOrigin?: string;

  @IsOptional()
  @IsString()
  packageContents?: string;

  @IsOptional()
  @IsString()
  richContent?: string;

  /** Ozon: description_category_id */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  ozonCategoryId?: number;

  /** Ozon: type_id */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  ozonTypeId?: number;

  /** Ozon: путь категории для отображения */
  @IsOptional()
  @IsString()
  ozonCategoryPath?: string;
}
