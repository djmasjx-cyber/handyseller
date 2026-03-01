import { IsString, IsNotEmpty, IsUUID, IsInt, Min, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateManualOrderDto {
  @IsString()
  @IsNotEmpty({ message: 'Укажите номер заказа (externalId)' })
  externalId: string;

  @IsUUID()
  productId: string;

  @Type(() => Number)
  @IsInt()
  @Min(1, { message: 'Количество должно быть не менее 1' })
  quantity: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0, { message: 'Стоимость не может быть отрицательной' })
  price: number;

  @IsString()
  @IsNotEmpty({ message: 'Укажите источник продажи' })
  salesSource: string;
}
