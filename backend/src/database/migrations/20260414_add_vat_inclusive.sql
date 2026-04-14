-- Migration: Update sales table for Philippine 12% VAT Inclusive
-- This allows storing VAT calculation method and precise VAT amounts for inclusive pricing

ALTER TABLE sales
  ADD COLUMN tax_calculation_method ENUM('INCLUSIVE', 'EXCLUSIVE') DEFAULT 'INCLUSIVE' AFTER tax_rate_percentage,
  ADD COLUMN vatable_sales DECIMAL(12,2) DEFAULT 0.00 AFTER subtotal,
  ADD COLUMN vat_amount DECIMAL(12,2) DEFAULT 0.00 AFTER vatable_sales;

-- Update sale_items for line-level VAT tracking
ALTER TABLE sale_items
  ADD COLUMN vat_amount DECIMAL(12,2) DEFAULT 0.00 AFTER line_total;

-- Create indices for VAT reporting
CREATE INDEX idx_sales_tax_calculation_method ON sales(tax_calculation_method);
CREATE INDEX idx_sales_vatable_sales ON sales(vatable_sales);
