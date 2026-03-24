-- Migration to update bale_purchases table schema
-- Remove bale_type, shipping_cost, other_charges columns
-- Convert supplier_id to supplier_name (text field)

ALTER TABLE bale_purchases
  DROP FOREIGN KEY fk_bale_purchases_supplier,
  DROP COLUMN bale_type,
  DROP COLUMN shipping_cost,
  DROP COLUMN other_charges,
  CHANGE COLUMN supplier_id supplier_name VARCHAR(255);

-- Update total_purchase_cost to be simple bale_cost (since we removed shipping and other charges)
-- Data is already correct since total_purchase_cost = bale_cost + shipping_cost + other_charges
-- No change needed for data, just removing the old fields

-- Note: existing total_purchase_cost values are already calculated correctly
