-- Purpose: store database-driven product type options scoped to a product category.

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS subcategory VARCHAR(150) NULL AFTER category_id;

CREATE TABLE IF NOT EXISTS category_types (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  category_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(150) NOT NULL,
  description TEXT NULL,
  is_active TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_category_types_category_name (category_id, name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX IF NOT EXISTS idx_category_types_category_id
  ON category_types(category_id);
