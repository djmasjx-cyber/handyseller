import { IsNotEmpty, IsEnum } from 'class-validator';
import { MarketplaceType } from './connect-marketplace.dto';

export class DisconnectMarketplaceDto {
  @IsNotEmpty({ message: 'Укажите тип маркетплейса' })
  @IsEnum(MarketplaceType, { message: 'Недопустимый тип маркетплейса' })
  marketplace: MarketplaceType;
}
