import { IsString, IsNumber, IsOptional, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateProductDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsNumber()
  cost?: number;

  /** Ваша цена (продажная) для Ozon */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
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
  description?: string;

  @IsOptional()
  @IsString()
  seoTitle?: string;

  @IsOptional()
  @IsString()
  seoKeywords?: string;

  @IsOptional()
  @IsString()
  seoDescription?: string;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  /** Штрих-коды нельзя менять через PATCH — только через load с маркета */

  @IsOptional()
  @IsString()
  brand?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  weight?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  width?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  length?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  height?: number;

  @IsOptional()
  @IsString()
  productUrl?: string;

  @IsOptional()
  @IsString()
  color?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
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

  /** Ozon: description_category_id (выбор категории) */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  ozonCategoryId?: number;

  /** Ozon: type_id (тип товара в категории) */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  ozonTypeId?: number;

  /** Ozon: путь категории для отображения (Хобби > Материал > Бусина) */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  ozonCategoryPath?: string;
}
