import { MarketplaceType } from './connect-marketplace.dto';

export class MarketplaceConnectionResponseDto {
  id: string;
  type: MarketplaceType;
  status: string;
  lastSyncAt?: Date;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
}
