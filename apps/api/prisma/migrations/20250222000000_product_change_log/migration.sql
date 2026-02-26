-- Единая таблица истории изменений товаров (stock, поля, archive).
-- Ловит ВСЕ изменения через триггер — невозможно обойти.
CREATE TABLE IF NOT EXISTS product_change_log (
  id         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  product_id TEXT NOT NULL REFERENCES "Product"(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  change_type TEXT NOT NULL,  -- STOCK | FIELD | ARCHIVE | RESTORE
  field_name  TEXT,           -- stock | title | price | description | article | ...
  old_value   TEXT,
  new_value   TEXT,
  delta       INTEGER,        -- для stock: +5, -3
  source      TEXT,           -- MANUAL | SALE | IMPORT | SYNC
  note        TEXT,
  created_at  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS product_change_log_product_id_idx ON product_change_log(product_id);
CREATE INDEX IF NOT EXISTS product_change_log_created_at_idx ON product_change_log(created_at);
CREATE INDEX IF NOT EXISTS product_change_log_user_id_idx ON product_change_log(user_id);

-- Триггер: логирует ВСЕ изменения Product. user_id берётся из set_config('app.changed_by', ...).
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

  IF OLD.price::TEXT IS DISTINCT FROM NEW.price::TEXT THEN
    INSERT INTO product_change_log (product_id, user_id, change_type, field_name, old_value, new_value, created_at)
    VALUES (NEW.id, changed_by, 'FIELD', 'price', OLD.price::TEXT, NEW.price::TEXT, NOW());
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

DROP TRIGGER IF EXISTS product_change_trigger ON "Product";
CREATE TRIGGER product_change_trigger
  AFTER UPDATE ON "Product"
  FOR EACH ROW EXECUTE FUNCTION log_product_changes_trigger();
