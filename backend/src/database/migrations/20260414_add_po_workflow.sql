-- Migration: Add P.O. workflow status and inventory tracking to bale_purchases
-- This enables PENDING → COMPLETED workflow with automatic stock updates

ALTER TABLE bale_purchases
  ADD COLUMN po_status ENUM('PENDING', 'ORDERED', 'RECEIVED', 'COMPLETED', 'CANCELLED') DEFAULT 'PENDING' AFTER payment_status,
  ADD COLUMN expected_delivery_date DATE NULL AFTER po_status,
  ADD COLUMN actual_delivery_date DATE NULL AFTER expected_delivery_date,
  ADD COLUMN po_number VARCHAR(100) UNIQUE AFTER bale_batch_no,
  ADD COLUMN quantity_ordered INT DEFAULT 0 AFTER total_purchase_cost,
  ADD COLUMN quantity_received INT DEFAULT 0 AFTER quantity_ordered;

-- Create index for po_status lookups
CREATE INDEX idx_bale_purchases_po_status ON bale_purchases(po_status);
