-- Rename Product.price to Product.cost (Себестоимость для аналитики).
-- Ценообразование на маркетплейсах остаётся за клиентом.

ALTER TABLE "Product" RENAME COLUMN "price" TO "cost";
ALTER TABLE "Product" ALTER COLUMN "cost" SET DEFAULT 0;

-- Update trigger to log cost changes
CREATE OR REPLACE FUNCTION log_product_changes_trigger()
RETURNS TRIGGER AS $$
DECLARE
  changed_by TEXT;
BEGIN
  changed_by := current_setting('app.changed_by', true);
  IF changed_by IS NULL OR changed_by = '' THEN
    changed_by := NEW.user_id;
  END IF;

  IF OLD.stock IS DISTINCT FROM NEW.stock THEN
    INSERT INTO product_change_log (product_id, user_id, change_type, field_name, old_value, new_value, delta, source, note, created_at)
    VALUES (
      NEW.id,
      changed_by,
      'STOCK',
      'stock',
      OLD.stock::TEXT,
      NEW.stock::TEXT,
      (NEW.stock - OLD.stock),
      COALESCE(NULLIF(current_setting('app.change_source', true), ''), 'MANUAL'),
      NULLIF(current_setting('app.change_note', true), ''),
      NOW()
    );
  END IF;

  IF OLD.title IS DISTINCT FROM NEW.title THEN
    INSERT INTO product_change_log (product_id, user_id, change_type, field_name, old_value, new_value, created_at)
    VALUES (NEW.id, changed_by, 'FIELD', 'title', OLD.title, NEW.title, NOW());
  END IF;

  IF OLD.cost::TEXT IS DISTINCT FROM NEW.cost::TEXT THEN
    INSERT INTO product_change_log (product_id, user_id, change_type, field_name, old_value, new_value, created_at)
    VALUES (NEW.id, changed_by, 'FIELD', 'cost', OLD.cost::TEXT, NEW.cost::TEXT, NOW());
  END IF;

  IF OLD.description IS DISTINCT FROM NEW.description THEN
    INSERT INTO product_change_log (product_id, user_id, change_type, field_name, old_value, new_value, created_at)
    VALUES (NEW.id, changed_by, 'FIELD', 'description', OLD.description, NEW.description, NOW());
  END IF;

  IF OLD.article IS DISTINCT FROM NEW.article THEN
    INSERT INTO product_change_log (product_id, user_id, change_type, field_name, old_value, new_value, created_at)
    VALUES (NEW.id, changed_by, 'FIELD', 'article', OLD.article, NEW.article, NOW());
  END IF;

  IF OLD.seo_title IS DISTINCT FROM NEW.seo_title THEN
    INSERT INTO product_change_log (product_id, user_id, change_type, field_name, old_value, new_value, created_at)
    VALUES (NEW.id, changed_by, 'FIELD', 'seoTitle', OLD.seo_title, NEW.seo_title, NOW());
  END IF;

  IF OLD.seo_keywords IS DISTINCT FROM NEW.seo_keywords THEN
    INSERT INTO product_change_log (product_id, user_id, change_type, field_name, old_value, new_value, created_at)
    VALUES (NEW.id, changed_by, 'FIELD', 'seoKeywords', OLD.seo_keywords, NEW.seo_keywords, NOW());
  END IF;

  IF OLD.seo_description IS DISTINCT FROM NEW.seo_description THEN
    INSERT INTO product_change_log (product_id, user_id, change_type, field_name, old_value, new_value, created_at)
    VALUES (NEW.id, changed_by, 'FIELD', 'seoDescription', OLD.seo_description, NEW.seo_description, NOW());
  END IF;

  IF OLD.image_url IS DISTINCT FROM NEW.image_url THEN
    INSERT INTO product_change_log (product_id, user_id, change_type, field_name, old_value, new_value, created_at)
    VALUES (NEW.id, changed_by, 'FIELD', 'imageUrl', OLD.image_url, NEW.image_url, NOW());
  END IF;

  IF OLD.barcode_wb IS DISTINCT FROM NEW.barcode_wb THEN
    INSERT INTO product_change_log (product_id, user_id, change_type, field_name, old_value, new_value, created_at)
    VALUES (NEW.id, changed_by, 'FIELD', 'barcodeWb', OLD.barcode_wb, NEW.barcode_wb, NOW());
  END IF;

  IF OLD.barcode_ozon IS DISTINCT FROM NEW.barcode_ozon THEN
    INSERT INTO product_change_log (product_id, user_id, change_type, field_name, old_value, new_value, created_at)
    VALUES (NEW.id, changed_by, 'FIELD', 'barcodeOzon', OLD.barcode_ozon, NEW.barcode_ozon, NOW());
  END IF;

  IF OLD.archived_at IS DISTINCT FROM NEW.archived_at THEN
    IF NEW.archived_at IS NOT NULL THEN
      INSERT INTO product_change_log (product_id, user_id, change_type, field_name, created_at)
      VALUES (NEW.id, changed_by, 'ARCHIVE', 'archivedAt', NOW());
    ELSE
      INSERT INTO product_change_log (product_id, user_id, change_type, field_name, created_at)
      VALUES (NEW.id, changed_by, 'RESTORE', 'archivedAt', NOW());
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
