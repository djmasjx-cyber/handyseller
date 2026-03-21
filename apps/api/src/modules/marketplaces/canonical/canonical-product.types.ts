/**
 * Каноническая модель товара — единый «золотой стандарт» для всех маркетплейсов.
 * См. docs/unified-sync-architecture.md
 */

/** Характеристика товара (гибкая структура для любых платформ) */
export interface CanonicalAttribute {
  name: string;
  value: string;
}

/** Изображение с метаданными */
export interface CanonicalImage {
  url: string;
  altText?: string;
  isMain?: boolean;
}

export interface CanonicalProduct {
  /** Внутренний уникальный код (Product.id) */
  canonical_sku: string;

  /** Бренд */
  brand_name?: string;

  /** ID типа товара из единого справочника */
  product_type_id?: number;

  /** Артикул производителя */
  vendor_code?: string;

  /** Штрих-код (EAN/UPC) */
  barcode?: string;

  /** Основное название */
  title: string;

  /** Короткое описание для списков */
  short_description?: string;

  /** Длинное описание (Markdown) */
  long_description_plain?: string;

  /** Длинное описание (HTML) */
  long_description_html?: string;

  /** SEO заголовок */
  seo_title?: string;

  /** SEO ключевые слова (через запятую) */
  seo_keywords?: string;

  /** SEO описание */
  seo_description?: string;

  /** Характеристики [{name, value}] */
  attributes?: CanonicalAttribute[];

  /** Изображения */
  images?: CanonicalImage[];

  /** Видео URL (для WB/Ozon) */
  video_url?: string;

  /** Цена продажи */
  price: number;

  /** Старая цена (для отображения скидки) */
  old_price?: number;

  /** Количество на складе */
  stock_quantity: number;

  /** Маркетинговые теги ("хит", "новинка", "акция") */
  tags?: string[];

  /** Габариты и вес (для WB, Ozon, Яндекс) */
  weight_grams?: number;
  width_mm?: number;
  length_mm?: number;
  height_mm?: number;

  /** URL страницы товара (обяз. для Яндекс.Маркета) */
  product_url?: string;

  /** Цвет (WB: characteristics «Цвет», Ozon: attributes, Яндекс: param) */
  color?: string;

  /** Количество предметов в упаковке (WB, Ozon, Яндекс) */
  items_per_pack?: number;
  /** Материал изделия */
  material?: string;
  /** Вид творчества */
  craft_type?: string;
  /** Страна производства */
  country_of_origin?: string;
  /** Комплектация */
  package_contents?: string;
  /** Ozon: description_category_id */
  ozon_category_id?: number;
  /** Ozon: type_id */
  ozon_type_id?: number;
  /** WB: subjectId из справочника категорий */
  wb_subject_id?: number;
}
