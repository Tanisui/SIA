-- Bale-aware automated reports migration
-- Date: 2026-03-23
-- This migration aligns inventory/POS schema with boutique bale workflow reporting.

CREATE TABLE IF NOT EXISTS bale_purchases (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  bale_batch_no VARCHAR(100) NOT NULL UNIQUE,
  supplier_name VARCHAR(255),
  purchase_date DATE NOT NULL,
  bale_category VARCHAR(120),
  bale_cost DECIMAL(12,2) DEFAULT 0.00,
  total_purchase_cost DECIMAL(12,2) DEFAULT 0.00,
  payment_status ENUM('PAID', 'PARTIAL', 'UNPAID') DEFAULT 'UNPAID',
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS bale_breakdowns (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  bale_purchase_id BIGINT UNSIGNED NOT NULL UNIQUE,
  total_pieces INT DEFAULT 0,
  saleable_items INT DEFAULT 0,
  premium_items INT DEFAULT 0,
  standard_items INT DEFAULT 0,
  low_grade_items INT DEFAULT 0,
  damaged_items INT DEFAULT 0,
  cost_per_saleable_item DECIMAL(12,2) DEFAULT 0.00,
  encoded_by BIGINT UNSIGNED NULL,
  breakdown_date DATE,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_bale_breakdowns_bale
    FOREIGN KEY (bale_purchase_id) REFERENCES bale_purchases(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS inventory_adjustments (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  product_id BIGINT UNSIGNED NULL,
  bale_purchase_id BIGINT UNSIGNED NULL,
  adjustment_type ENUM('damaged', 'unsellable', 'shrinkage', 'correction') NOT NULL,
  quantity INT NOT NULL DEFAULT 0,
  reason TEXT,
  adjustment_date DATE NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_inventory_adjustments_product
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL,
  CONSTRAINT fk_inventory_adjustments_bale
    FOREIGN KEY (bale_purchase_id) REFERENCES bale_purchases(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE suppliers
  ADD COLUMN IF NOT EXISTS notes TEXT NULL,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS item_code VARCHAR(128) NULL AFTER id,
  ADD COLUMN IF NOT EXISTS bale_purchase_id BIGINT UNSIGNED NULL AFTER id,
  ADD COLUMN IF NOT EXISTS subcategory VARCHAR(150) NULL AFTER category_id,
  ADD COLUMN IF NOT EXISTS condition_grade ENUM('premium','standard','low_grade','damaged','unsellable') NULL AFTER color,
  ADD COLUMN IF NOT EXISTS allocated_cost DECIMAL(12,2) DEFAULT 0.00 AFTER cost,
  ADD COLUMN IF NOT EXISTS selling_price DECIMAL(12,2) DEFAULT 0.00 AFTER price,
  ADD COLUMN IF NOT EXISTS status ENUM('available','sold','damaged','reserved','archived') DEFAULT 'available' AFTER selling_price,
  ADD COLUMN IF NOT EXISTS date_encoded DATE NULL AFTER status;

CREATE UNIQUE INDEX IF NOT EXISTS idx_products_item_code ON products(item_code);
CREATE INDEX IF NOT EXISTS idx_products_bale_purchase_id ON products(bale_purchase_id);
CREATE INDEX IF NOT EXISTS idx_products_date_encoded ON products(date_encoded);
CREATE INDEX IF NOT EXISTS idx_bale_purchase_date ON bale_purchases(purchase_date);
CREATE INDEX IF NOT EXISTS idx_bale_breakdown_date ON bale_breakdowns(breakdown_date);
CREATE INDEX IF NOT EXISTS idx_inventory_adjustments_date ON inventory_adjustments(adjustment_date);
CREATE INDEX IF NOT EXISTS idx_inventory_adjustments_type ON inventory_adjustments(adjustment_type);

ALTER TABLE products
  ADD CONSTRAINT fk_products_bale_purchase
  FOREIGN KEY (bale_purchase_id) REFERENCES bale_purchases(id) ON DELETE SET NULL;

UPDATE products
SET selling_price = COALESCE(NULLIF(selling_price, 0), price, 0)
WHERE selling_price IS NULL OR selling_price = 0;

UPDATE products
SET date_encoded = DATE(created_at)
WHERE date_encoded IS NULL AND created_at IS NOT NULL;

UPDATE products
SET status = CASE
  WHEN COALESCE(stock_quantity, 0) > 0 THEN 'available'
  ELSE 'sold'
END
WHERE status IS NULL OR status = '';
