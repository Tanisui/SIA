-- Purpose: allow manual stock-in transactions to keep an optional supplier reference.

ALTER TABLE inventory_transactions
  ADD COLUMN IF NOT EXISTS supplier_id BIGINT UNSIGNED NULL AFTER product_id;

CREATE INDEX IF NOT EXISTS idx_inventory_transactions_supplier_id
  ON inventory_transactions(supplier_id);

ALTER TABLE inventory_transactions
  ADD CONSTRAINT fk_inventory_transactions_supplier_id
  FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL;
