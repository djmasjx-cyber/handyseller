import { IsEnum, IsOptional, IsString, IsNotEmpty, Length, ValidateIf } from 'class-validator';

export enum MarketplaceType {
  WILDBERRIES = 'WILDBERRIES',
  OZON = 'OZON',
  YANDEX = 'YANDEX',
  AVITO = 'AVITO',
}

export class ConnectMarketplaceDto {
  @IsNotEmpty({ message: 'Укажите тип маркетплейса' })
  @IsEnum(MarketplaceType, { message: 'Недопустимый тип маркетплейса' })
  marketplace: MarketplaceType;

  @ValidateIf((o) => !o.token)
  @IsNotEmpty({ message: 'Укажите apiKey или token' })
  @IsString()
  @Length(10, 5000, { message: 'API ключ должен быть от 10 до 5000 символов' })
  apiKey?: string;

  @ValidateIf((o) => !o.apiKey)
  @IsNotEmpty({ message: 'Укажите apiKey или token' })
  @IsString()
  @Length(10, 5000)
  token?: string;

  @IsOptional()
  @IsString()
  refreshToken?: string;

  @IsOptional()
  @IsString()
  sellerId?: string;

  @IsOptional()
  @IsString()
  warehouseId?: string;

  /** WB: токен «Статистика и Аналитика» для заказов ФБО (со склада WB) */
  @IsOptional()
  @IsString()
  @Length(10, 5000, { message: 'Токен должен быть от 10 до 5000 символов' })
  statsToken?: string;

  @IsOptional()
  @IsString()
  shopName?: string;
}

/** Alias для обратной совместимости */
export type MarketplaceSlug = MarketplaceType;
