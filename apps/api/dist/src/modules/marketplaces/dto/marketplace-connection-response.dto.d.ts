import { MarketplaceType } from './connect-marketplace.dto';
export declare class MarketplaceConnectionResponseDto {
    id: string;
    type: MarketplaceType;
    status: string;
    lastSyncAt?: Date;
    error?: string;
    createdAt: Date;
    updatedAt: Date;
}
