-- Add supplier return tracking for received bale purchase orders.

CREATE TABLE IF NOT EXISTS bale_supplier_returns (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  supplier_id BIGINT UNSIGNED NULL,
  supplier_name VARCHAR(255) NULL,
  bale_purchase_id BIGINT UNSIGNED NOT NULL,
  return_date DATE NOT NULL,
  notes TEXT NULL,
  processed_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL,
  FOREIGN KEY (bale_purchase_id) REFERENCES bale_purchases(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS bale_supplier_return_items (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  return_id BIGINT UNSIGNED NOT NULL,
  quantity INT NOT NULL DEFAULT 0,
  reason TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (return_id) REFERENCES bale_supplier_returns(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX IF NOT EXISTS idx_bale_supplier_returns_supplier_id ON bale_supplier_returns(supplier_id);
CREATE INDEX IF NOT EXISTS idx_bale_supplier_returns_purchase_id ON bale_supplier_returns(bale_purchase_id);
CREATE INDEX IF NOT EXISTS idx_bale_supplier_returns_date ON bale_supplier_returns(return_date);
CREATE INDEX IF NOT EXISTS idx_bale_supplier_return_items_return_id ON bale_supplier_return_items(return_id);
