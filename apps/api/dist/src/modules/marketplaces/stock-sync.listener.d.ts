import { ProductsService } from '../products/products.service';
import { StockChangedPayload } from '../products/products.service';
import { MarketplacesService } from './marketplaces.service';
export declare class StockSyncListener {
    private readonly productsService;
    private readonly marketplacesService;
    constructor(productsService: ProductsService, marketplacesService: MarketplacesService);
    handleProductSyncChanged(payload: StockChangedPayload): Promise<void>;
}
