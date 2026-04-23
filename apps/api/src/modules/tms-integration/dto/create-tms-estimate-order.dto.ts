import { Type } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/** Ручной заказ для оценки перевозки (TMS): груз + адреса. */
export class CreateTmsEstimateOrderDto {
  @IsString()
  @IsOptional()
  @MaxLength(80)
  /** Номер заказа; если не задан — сгенерируется (TMS-…) */
  externalId?: string;

  @IsString()
  @IsNotEmpty({ message: 'Укажите адрес отправления' })
  @MinLength(3, { message: 'Адрес отправления слишком короткий' })
  @MaxLength(500)
  originAddress!: string;

  @IsString()
  @IsNotEmpty({ message: 'Укажите адрес доставки' })
  @MinLength(3, { message: 'Адрес доставки слишком короткий' })
  @MaxLength(500)
  destinationAddress!: string;

  @IsString()
  @IsNotEmpty({ message: 'Укажите имя/название отправителя' })
  @MinLength(2, { message: 'Имя отправителя слишком короткое' })
  @MaxLength(200)
  shipperName!: string;

  @IsString()
  @IsNotEmpty({ message: 'Укажите телефон отправителя' })
  @MinLength(5, { message: 'Телефон отправителя слишком короткий' })
  @MaxLength(50)
  shipperPhone!: string;

  @IsString()
  @IsNotEmpty({ message: 'Укажите имя/название получателя' })
  @MinLength(2, { message: 'Имя получателя слишком короткое' })
  @MaxLength(200)
  recipientName!: string;

  @IsString()
  @IsNotEmpty({ message: 'Укажите телефон получателя' })
  @MinLength(5, { message: 'Телефон получателя слишком короткий' })
  @MaxLength(50)
  recipientPhone!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.01, { message: 'Вес должен быть больше 0' })
  @Max(50000, { message: 'Некорректный вес' })
  /** Вес, кг */
  weightKg!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(1, { message: 'Укажите длину груза, см' })
  @Max(600, { message: 'Некорректная длина' })
  lengthCm!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(1, { message: 'Укажите ширину груза, см' })
  @Max(600, { message: 'Некорректная ширина' })
  widthCm!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(1, { message: 'Укажите высоту груза, см' })
  @Max(600, { message: 'Некорректная высота' })
  heightCm!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(999)
  @IsOptional()
  places?: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0, { message: 'Объявленная ценность не может быть отрицательной' })
  @Max(99999999)
  /** Объявленная ценность груза, ₽ */
  declaredValueRub!: number;

  @IsString()
  @IsNotEmpty({ message: 'Укажите описание груза' })
  @MinLength(2, { message: 'Описание груза слишком короткое' })
  @MaxLength(255, { message: 'Описание груза слишком длинное' })
  cargoDescription!: string;

  @IsString()
  @IsOptional()
  @MaxLength(120)
  salesSource?: string;

  @IsString()
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Дата забора должна быть в формате YYYY-MM-DD' })
  pickupDate?: string;
}
