-- Customer profile upgrade migration
-- Date: 2026-03-24
-- Purpose: align customer records with boutique-focused contact and address capture.

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS customer_code VARCHAR(40) NULL AFTER id,
  ADD COLUMN IF NOT EXISTS full_name VARCHAR(255) NULL AFTER customer_code,
  ADD COLUMN IF NOT EXISTS nickname VARCHAR(120) NULL AFTER full_name,
  ADD COLUMN IF NOT EXISTS preferred_contact_method VARCHAR(50) NULL AFTER email,
  ADD COLUMN IF NOT EXISTS address_line VARCHAR(255) NULL AFTER preferred_contact_method,
  ADD COLUMN IF NOT EXISTS region_code VARCHAR(80) NULL AFTER address_line,
  ADD COLUMN IF NOT EXISTS region_name VARCHAR(140) NULL AFTER region_code,
  ADD COLUMN IF NOT EXISTS province_code VARCHAR(80) NULL AFTER region_name,
  ADD COLUMN IF NOT EXISTS province_name VARCHAR(120) NULL AFTER province_code,
  ADD COLUMN IF NOT EXISTS city_code VARCHAR(80) NULL AFTER province_name,
  ADD COLUMN IF NOT EXISTS city_name VARCHAR(120) NULL AFTER city_code,
  ADD COLUMN IF NOT EXISTS barangay_code VARCHAR(80) NULL AFTER city_name,
  ADD COLUMN IF NOT EXISTS barangay_name VARCHAR(120) NULL AFTER barangay_code,
  ADD COLUMN IF NOT EXISTS barangay VARCHAR(120) NULL AFTER address_line,
  ADD COLUMN IF NOT EXISTS city VARCHAR(120) NULL AFTER barangay,
  ADD COLUMN IF NOT EXISTS province VARCHAR(120) NULL AFTER city,
  ADD COLUMN IF NOT EXISTS postal_code VARCHAR(16) NULL AFTER province,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_at;

CREATE INDEX IF NOT EXISTS idx_customers_customer_code ON customers(customer_code);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email);
CREATE INDEX IF NOT EXISTS idx_customers_region_code ON customers(region_code);
CREATE INDEX IF NOT EXISTS idx_customers_province_code ON customers(province_code);
CREATE INDEX IF NOT EXISTS idx_customers_city_code ON customers(city_code);
CREATE INDEX IF NOT EXISTS idx_customers_barangay_code ON customers(barangay_code);

UPDATE customers
SET full_name = COALESCE(NULLIF(TRIM(full_name), ''), NULLIF(TRIM(name), ''))
WHERE full_name IS NULL OR TRIM(full_name) = '';

UPDATE customers
SET name = COALESCE(NULLIF(TRIM(name), ''), NULLIF(TRIM(full_name), ''), name)
WHERE name IS NULL OR TRIM(name) = '';

UPDATE customers
SET customer_code = CONCAT('CUST-', LPAD(id, 6, '0'))
WHERE customer_code IS NULL OR TRIM(customer_code) = '';

UPDATE customers
SET address_line = COALESCE(NULLIF(TRIM(address_line), ''), NULLIF(TRIM(address), ''))
WHERE address_line IS NULL OR TRIM(address_line) = '';

UPDATE customers
SET province_name = COALESCE(NULLIF(TRIM(province_name), ''), NULLIF(TRIM(province), ''))
WHERE province_name IS NULL OR TRIM(province_name) = '';

UPDATE customers
SET city_name = COALESCE(NULLIF(TRIM(city_name), ''), NULLIF(TRIM(city), ''))
WHERE city_name IS NULL OR TRIM(city_name) = '';

UPDATE customers
SET barangay_name = COALESCE(NULLIF(TRIM(barangay_name), ''), NULLIF(TRIM(barangay), ''))
WHERE barangay_name IS NULL OR TRIM(barangay_name) = '';

UPDATE customers
SET address = COALESCE(NULLIF(TRIM(address), ''), NULLIF(TRIM(address_line), ''))
WHERE address IS NULL OR TRIM(address) = '';

UPDATE customers
SET province = COALESCE(NULLIF(TRIM(province), ''), NULLIF(TRIM(province_name), ''))
WHERE province IS NULL OR TRIM(province) = '';

UPDATE customers
SET city = COALESCE(NULLIF(TRIM(city), ''), NULLIF(TRIM(city_name), ''))
WHERE city IS NULL OR TRIM(city) = '';

UPDATE customers
SET barangay = COALESCE(NULLIF(TRIM(barangay), ''), NULLIF(TRIM(barangay_name), ''))
WHERE barangay IS NULL OR TRIM(barangay) = '';
