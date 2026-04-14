-- Migration to add supplier_id foreign key to bale_purchases table
-- This allows bale purchases to inherit supplier data from the suppliers table

ALTER TABLE bale_purchases
  ADD COLUMN supplier_id INT NULL AFTER id;

-- Add foreign key constraint
ALTER TABLE bale_purchases
  ADD CONSTRAINT fk_bale_purchases_supplier_id
  FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL;

-- Create index for faster lookups
CREATE INDEX idx_bale_purchases_supplier_id ON bale_purchases(supplier_id);
