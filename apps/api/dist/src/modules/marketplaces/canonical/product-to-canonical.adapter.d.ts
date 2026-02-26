import { CanonicalProduct } from './canonical-product.types';
import type { Product } from '@prisma/client';
export interface ProductWithRelations extends Product {
    marketplaceMappings?: Array<{
        marketplace: string;
        externalSystemId: string;
        externalArticle?: string | null;
    }>;
}
export declare function productToCanonical(product: ProductWithRelations): CanonicalProduct;
export declare function canonicalToProductData(canonical: CanonicalProduct, overrides?: {
    barcodeOzon?: string;
}): {
    id: string;
    name: string;
    description?: string;
    price: number;
    stock: number;
    images: string[];
    barcode?: string;
    vendorCode?: string;
    brand?: string;
    weight?: number;
    width?: number;
    length?: number;
    height?: number;
    productUrl?: string;
    color?: string;
    itemsPerPack?: number;
    material?: string;
    craftType?: string;
    countryOfOrigin?: string;
    packageContents?: string;
    richContent?: string;
    characteristics?: Record<string, unknown>;
    ozonCategoryId?: number;
    ozonTypeId?: number;
    barcodeOzon?: string;
};
