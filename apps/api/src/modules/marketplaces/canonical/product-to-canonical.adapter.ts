import { CanonicalProduct, CanonicalImage, CanonicalAttribute } from './canonical-product.types';
import type { Product } from '@prisma/client';

export interface ProductWithRelations extends Product {
  marketplaceMappings?: Array<{ marketplace: string; externalSystemId: string; externalArticle?: string | null }>;
}

/**
 * Адаптер входа: преобразование Product (БД) → CanonicalProduct.
 * Product — источник правды; каноническая модель — промежуточный формат для синхронизации.
 */
export function productToCanonical(product: ProductWithRelations): CanonicalProduct {
  const images: CanonicalImage[] = [];
  if (product.imageUrl) {
    images.push({ url: product.imageUrl, isMain: true });
  }

  const attributes: CanonicalAttribute[] = [];
  if (product.article) {
    attributes.push({ name: 'Артикул', value: product.article });
  }

  const p = product as Product & {
    seoTitle?: string | null;
    seoKeywords?: string | null;
    seoDescription?: string | null;
    barcodeOzon?: string | null;
    barcodeWb?: string | null;
    brand?: string | null;
    weight?: number | null;
    width?: number | null;
    length?: number | null;
    height?: number | null;
    productUrl?: string | null;
    color?: string | null;
    itemsPerPack?: number | null;
    material?: string | null;
    craftType?: string | null;
    countryOfOrigin?: string | null;
    packageContents?: string | null;
    richContent?: string | null;
    ozonCategoryId?: number | null;
    ozonTypeId?: number | null;
    wbSubjectId?: number | null;
    price?: number | null;
    oldPrice?: number | null;
  };
  return {
    canonical_sku: product.id,
    vendor_code: product.article ?? product.sku ?? undefined,
    barcode: p.barcodeOzon ?? p.barcodeWb ?? undefined,
    brand_name: p.brand ?? undefined,
    weight_grams: p.weight ?? undefined,
    width_mm: p.width ?? undefined,
    length_mm: p.length ?? undefined,
    height_mm: p.height ?? undefined,
    product_url: p.productUrl ?? undefined,
    color: p.color ?? undefined,
    items_per_pack: p.itemsPerPack ?? undefined,
    material: p.material ?? undefined,
    craft_type: p.craftType ?? undefined,
    country_of_origin: p.countryOfOrigin ?? undefined,
    package_contents: p.packageContents ?? undefined,
    ozon_category_id: p.ozonCategoryId ?? undefined,
    ozon_type_id: p.ozonTypeId ?? undefined,
    wb_subject_id: p.wbSubjectId ?? undefined,
    title: product.title,
    seo_title: p.seoTitle ?? undefined,
    seo_keywords: p.seoKeywords ?? undefined,
    seo_description: p.seoDescription ?? undefined,
    short_description: product.description
      ? product.description.length > 150
        ? product.description.slice(0, 147) + '...'
        : product.description
      : undefined,
    long_description_plain: product.description ?? undefined,
    long_description_html: p.richContent ?? undefined,
    attributes: attributes.length > 0 ? attributes : undefined,
    images: images.length > 0 ? images : undefined,
    price: p.price ?? 1,
    old_price: p.oldPrice ?? undefined,
    stock_quantity: product.stock ?? 0,
  };
}

/** CanonicalProduct → ProductData (legacy) для адаптеров без uploadFromCanonical */
export function canonicalToProductData(
  canonical: CanonicalProduct,
  overrides?: { barcodeOzon?: string },
): {
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
  wbSubjectId?: number;
  barcodeOzon?: string;
  oldPrice?: number;
} {
  return {
    id: canonical.canonical_sku,
    name: canonical.title,
    description: canonical.long_description_plain ?? canonical.short_description,
    price: canonical.price,
    oldPrice: canonical.old_price,
    stock: canonical.stock_quantity,
    images: canonical.images?.map((i) => i.url) ?? [],
    barcode: canonical.barcode,
    vendorCode: canonical.vendor_code,
    brand: canonical.brand_name,
    weight: canonical.weight_grams,
    width: canonical.width_mm,
    length: canonical.length_mm,
    height: canonical.height_mm,
    productUrl: canonical.product_url,
    color: canonical.color,
    itemsPerPack: canonical.items_per_pack,
    material: canonical.material,
    craftType: canonical.craft_type,
    countryOfOrigin: canonical.country_of_origin,
    packageContents: canonical.package_contents,
    richContent: canonical.long_description_html,
    characteristics: canonical.attributes?.length
      ? Object.fromEntries(canonical.attributes.map((a) => [a.name, a.value]))
      : undefined,
    ozonCategoryId: canonical.ozon_category_id,
    ozonTypeId: canonical.ozon_type_id,
    wbSubjectId: canonical.wb_subject_id,
    ...overrides,
  };
}
