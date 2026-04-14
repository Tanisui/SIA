-- Migration: Add unit_price snapshot to sale_items table
-- This freezes prices at the time of sale, preventing historical receipt changes
-- when product prices are updated later

ALTER TABLE sale_items
  ADD COLUMN unit_price DECIMAL(12,2) NULL AFTER product_id;

-- Create index for faster queries
CREATE INDEX idx_sale_items_unit_price ON sale_items(unit_price);
