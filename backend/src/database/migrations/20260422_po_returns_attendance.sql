-- ── Attendance: add status + expected times ──────────────────────────────
ALTER TABLE attendance
  ADD COLUMN expected_clock_in  TIME        NULL AFTER notes,
  ADD COLUMN expected_clock_out TIME        NULL AFTER expected_clock_in,
  ADD COLUMN status VARCHAR(32) NOT NULL DEFAULT 'PRESENT' AFTER expected_clock_out,
  ADD COLUMN late_minutes       INT         NOT NULL DEFAULT 0 AFTER status,
  ADD COLUMN undertime_minutes  INT         NOT NULL DEFAULT 0 AFTER late_minutes,
  ADD COLUMN overtime_minutes   INT         NOT NULL DEFAULT 0 AFTER undertime_minutes,
  ADD COLUMN created_by         BIGINT UNSIGNED NULL AFTER overtime_minutes,
  ADD COLUMN updated_by         BIGINT UNSIGNED NULL AFTER created_by,
  ADD COLUMN created_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP AFTER updated_by,
  ADD COLUMN updated_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_at;

ALTER TABLE attendance ADD INDEX idx_attendance_date   (date);
ALTER TABLE attendance ADD INDEX idx_attendance_status (status);

-- ── Suppliers: add default payment terms ─────────────────────────────────
ALTER TABLE suppliers
  ADD COLUMN default_payment_terms_days INT           NOT NULL DEFAULT 0 AFTER address,
  ADD COLUMN credit_limit               DECIMAL(14,2) NULL     AFTER default_payment_terms_days,
  ADD COLUMN payment_terms_notes        TEXT          NULL     AFTER credit_limit;

-- ── Bale Purchases: add payment method + PO credit terms ─────────────────
ALTER TABLE bale_purchases
  ADD COLUMN payment_method       ENUM('CASH','GCASH','BANK_TRANSFER','PURCHASE_ORDER','CHECK') NOT NULL DEFAULT 'CASH' AFTER payment_status,
  ADD COLUMN payment_terms_days   INT           NOT NULL DEFAULT 0   AFTER payment_method,
  ADD COLUMN po_due_date          DATE          NULL                 AFTER payment_terms_days,
  ADD COLUMN amount_paid          DECIMAL(12,2) NOT NULL DEFAULT 0   AFTER po_due_date,
  ADD COLUMN tax_amount           DECIMAL(12,2) NOT NULL DEFAULT 0   AFTER amount_paid,
  ADD COLUMN shipping_handling    DECIMAL(12,2) NOT NULL DEFAULT 0   AFTER tax_amount,
  ADD COLUMN special_instructions TEXT          NULL                 AFTER shipping_handling,
  ADD COLUMN authorized_by        VARCHAR(180)  NULL                 AFTER special_instructions,
  ADD COLUMN ship_via             VARCHAR(120)  NULL                 AFTER authorized_by,
  ADD COLUMN fob_point            VARCHAR(120)  NULL                 AFTER ship_via,
  ADD COLUMN shipping_terms       VARCHAR(120)  NULL                 AFTER fob_point,
  ADD COLUMN ship_to_name         VARCHAR(255)  NULL                 AFTER shipping_terms,
  ADD COLUMN ship_to_address      TEXT          NULL                 AFTER ship_to_name;

ALTER TABLE bale_purchases ADD INDEX idx_bale_purchases_payment_method (payment_method);
ALTER TABLE bale_purchases ADD INDEX idx_bale_purchases_po_due_date    (po_due_date);

-- ── Bale Purchase Items: line items per purchase (for PO form) ───────────
CREATE TABLE IF NOT EXISTS bale_purchase_items (
  id               BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  bale_purchase_id BIGINT UNSIGNED NOT NULL,
  item_code        VARCHAR(100)    NULL,
  description      VARCHAR(500)    NOT NULL,
  quantity         DECIMAL(12,4)   NOT NULL DEFAULT 1,
  unit             VARCHAR(50)     NULL,
  unit_price       DECIMAL(12,2)   NOT NULL DEFAULT 0,
  line_total       DECIMAL(12,2)   NOT NULL DEFAULT 0,
  sort_order       INT             NOT NULL DEFAULT 0,
  created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_bale_purchase_items_purchase (bale_purchase_id),
  CONSTRAINT fk_bale_purchase_items_purchase
    FOREIGN KEY (bale_purchase_id) REFERENCES bale_purchases(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Bale Returns ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bale_returns (
  id               BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  return_number    VARCHAR(100)    NOT NULL,
  bale_purchase_id BIGINT UNSIGNED NULL,
  supplier_id      INT             NULL,
  supplier_name    VARCHAR(255)    NULL,
  return_date      DATE            NOT NULL,
  reason           TEXT            NULL,
  items_json       JSON            NULL,
  subtotal         DECIMAL(12,2)   NOT NULL DEFAULT 0,
  return_amount    DECIMAL(12,2)   NOT NULL DEFAULT 0,
  status           ENUM('PENDING','APPROVED','REJECTED','PROCESSED') NOT NULL DEFAULT 'PENDING',
  notes            TEXT            NULL,
  processed_by     BIGINT UNSIGNED NULL,
  processed_at     TIMESTAMP       NULL,
  created_by       BIGINT UNSIGNED NULL,
  created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_bale_returns_number (return_number),
  KEY idx_bale_returns_purchase   (bale_purchase_id),
  KEY idx_bale_returns_status     (status),
  KEY idx_bale_returns_date       (return_date),
  CONSTRAINT fk_bale_returns_purchase
    FOREIGN KEY (bale_purchase_id) REFERENCES bale_purchases(id) ON DELETE SET NULL,
  CONSTRAINT fk_bale_returns_processed_by
    FOREIGN KEY (processed_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_bale_returns_created_by
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
