export interface CanonicalAttribute {
    name: string;
    value: string;
}
export interface CanonicalImage {
    url: string;
    altText?: string;
    isMain?: boolean;
}
export interface CanonicalProduct {
    canonical_sku: string;
    brand_name?: string;
    product_type_id?: number;
    vendor_code?: string;
    barcode?: string;
    title: string;
    short_description?: string;
    long_description_plain?: string;
    long_description_html?: string;
    seo_title?: string;
    seo_keywords?: string;
    seo_description?: string;
    attributes?: CanonicalAttribute[];
    images?: CanonicalImage[];
    price: number;
    old_price?: number;
    stock_quantity: number;
    tags?: string[];
    weight_grams?: number;
    width_mm?: number;
    length_mm?: number;
    height_mm?: number;
    product_url?: string;
    color?: string;
    items_per_pack?: number;
    material?: string;
    craft_type?: string;
    country_of_origin?: string;
    package_contents?: string;
    ozon_category_id?: number;
    ozon_type_id?: number;
}
