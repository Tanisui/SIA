# CECILLE'S N'STYLE BOUTIQUE MANAGEMENT SYSTEM
# Complete Manuscript Revision Document
## System Integration and Architecture 2 — S.Y. 2025–2026, 2nd Semester
## Ilanga · Palanca · Sintos | Ateneo de Davao University

---

**Document Type:** Full Revision Reference (Manuscript vs. Codebase)
**Analysis Date:** April 29, 2026
**Codebase Path:** `c:/Users/acer/SIA`
**Database:** `cecilles_nstyle_db` (MySQL 8)

Every finding in this document is traced to a specific file and line in the codebase.
Color coding: 🔴 Factually wrong or missing — must fix | 🟡 Incomplete — should add | 🟢 Verified correct

---

## SECTION 1 — AUTHENTICATION & ACCESS CONTROL

---

### 1.1 Login Process

**What the code actually does** — traced to `backend/src/routes/auth.js`:

1. User submits `username` + `password`
2. System queries `users` table for matching username
3. If user not found → logs `AUTH_LOGIN_FAILED` event (severity: HIGH) to audit log, returns error
4. If user is found but `is_active ≠ 1` → logs `AUTH_LOGIN_BLOCKED` event (severity: HIGH), returns "Account inactive" error
5. Password is verified using **bcrypt** (primary) or legacy **pbkdf2_sha512** (for migrated accounts)
6. On success → a **JWT token** is issued with **8-hour expiry**
7. Token payload contains: `id`, `username`
8. Response includes: `token`, `id`, `username`, `full_name`, `email`, `roles[]`, `permissions[]`
9. Login success is logged as `AUTH_LOGIN` (severity: LOW) to audit log

**Code evidence:**
- Token expiry set at `auth.js:83` → `jwt.sign({ id, username }, secret, { expiresIn: '8h' })`
- Failed login audit at `auth.js:111–124`
- Inactive account check at `auth.js:128–143`
- Legacy hash support at `auth.js:28–41`

🟡 **Revision needed:** The manuscript likely says "user enters credentials and the system authenticates." It should also state:
- Token is valid for **8 hours** after login
- Failed logins are logged with HIGH severity
- Inactive accounts are completely blocked at login, not just warned

---

### 1.2 Logout Process

**What the code actually does:**
- There is **no server-side logout endpoint**
- Logout is handled entirely on the client (React/Redux clears the stored token)
- The JWT token issued at login remains technically valid for 8 hours even after logout
- No token blacklist or revocation mechanism exists

**Code evidence:** No `POST /auth/logout` handler found across all route files.

🔴 **Revision needed:** If your manuscript shows logout as a server-side event with a system response (e.g., "session terminated"), that is incorrect. Logout is client-side only. This is a known security limitation — mention it as one.

---

### 1.3 Roles and Permissions (RBAC)

**Actual permission list** — traced to `backend/seed_permissions.js`:

| Module | Permission Keys |
|---|---|
| Dashboard | `dashboard.view` |
| Products | `products.view`, `products.create`, `products.edit`, `products.delete` |
| Inventory | `inventory.view`, `inventory.edit` |
| Sales | `sales.view`, `sales.create`, `sales.edit` |
| Customers | `customers.view`, `customers.create`, `customers.edit` |
| Employees | `employees.view`, `employees.create`, `employees.edit` |
| Attendance | `attendance.view`, `attendance.create` |
| Payroll | `payroll.view`, `payroll.create` |
| Finance | `finance.reports.view`, `expenses.view`, `expenses.create` |
| Categories | `categories.view`, `categories.create` |
| Users & Roles | `users.view`, `users.create`, `users.edit`, `roles.view`, `roles.create`, `roles.edit` |
| Audit | `system.audit.view` |
| System Settings | `system.config.update` |
| Reports | `reports.view` |
| Super Admin | `admin.*` (grants everything via wildcard) |

**Additional permissions used in routes** (not in seed but actively checked in code):
- `purchase.view`, `purchase.create`, `purchase.update`, `purchase.receive`, `purchase.delete`
- `inventory.receive`
- `attendance.manage`, `attendance.record`, `attendance.view_own`
- `payroll.profile.view`, `payroll.period.view`, `payroll.input.update`
- `employees.update`

**Default role assignments** (from `seed_permissions.js`):

| Role | Permissions Assigned |
|---|---|
| `super_admin` | All permissions including `admin.*` |
| `manager` | dashboard, products, inventory, sales, customers, employees.view, attendance, payroll.view, finance, categories, reports |
| `employee` | dashboard.view, products.view, inventory.view, sales.view, customers.view, attendance.view, attendance.create |

**RBAC wildcard logic** — traced to `authMiddleware.js:93–100`:
- `admin.*` → grants access to everything
- `sales.*` → grants all permissions starting with `sales.`
- Exact match → `sales.create` grants only that action
- A user can have multiple roles simultaneously — permissions from all roles are combined
- A user can also have direct permissions assigned independent of any role (`user_permissions` table)

🔴 **Revision needed:** Your manuscript likely shows a simple role-access matrix. The actual system is more complex:
1. Add the wildcard permission system to the RBAC description
2. Note that `super_admin`, `manager`, and `employee` are the three built-in roles with pre-assigned permissions
3. The `employee` role does NOT have `sales.create` by default — sales creation requires a specific permission assignment

---

## SECTION 2 — PRODUCT MANAGEMENT

---

### 2.1 Product Record — Actual Database Fields

**Table:** `products` (traced to `backend/src/database/sia.sql` + `20260323_bale_reporting.sql`)

| Field | Type | Description |
|---|---|---|
| `id` | BIGINT UNSIGNED | Primary key, auto-increment |
| `item_code` | VARCHAR(128) | Boutique item code (unique, indexed) |
| `bale_purchase_id` | BIGINT UNSIGNED | FK to `bale_purchases` — which bale it came from |
| `sku` | VARCHAR(100) | Stock keeping unit (unique) |
| `name` | VARCHAR(255) | Product name (auto-generated for bale products) |
| `brand` | VARCHAR(255) | Brand name |
| `description` | TEXT | Description (auto-generated for bale products) |
| `category_id` | BIGINT UNSIGNED | FK to `categories` |
| `subcategory` | VARCHAR(150) | Product type (validated against `category_types`) |
| `price` | DECIMAL(12,2) | Base price |
| `cost` | DECIMAL(12,2) | Cost price (= allocated_cost for bale products) |
| `allocated_cost` | DECIMAL(12,2) | Cost allocated from bale (bale_cost ÷ saleable_items) |
| `selling_price` | DECIMAL(12,2) | Displayed selling price |
| `stock_quantity` | INT | Current stock count |
| `low_stock_threshold` | INT | Alert threshold (default 10) |
| `size` | VARCHAR(64) | Size |
| `color` | VARCHAR(64) | Color |
| `barcode` | VARCHAR(128) | Unique barcode |
| `images` | JSON | Array of image paths |
| `condition_grade` | ENUM | `premium`, `standard`, `low_grade`, `damaged`, `unsellable` |
| `product_source` | VARCHAR | `bale_breakdown` (auto-generated) or NULL (manual) |
| `source_breakdown_id` | BIGINT UNSIGNED | FK to `bale_breakdowns` |
| `status` | ENUM | `available`, `sold`, `damaged`, `reserved`, `archived` |
| `date_encoded` | DATE | Date added to system |
| `is_active` | TINYINT(1) | Soft delete flag |

🟡 **Revision needed:** Add all fields to your Domain Class Diagram and database schema section. The key bale-linked fields (`condition_grade`, `bale_purchase_id`, `allocated_cost`, `selling_price`, `status`, `date_encoded`, `product_source`) are not in a typical product management description.

---

### 2.2 Product Type Validation

**What the code actually does** — traced to `backend/src/routes/products.js:95–116`:

When a product is created or updated, the `subcategory` (type) field is validated:
1. Queries `category_types` for active types under the selected `category_id`
2. Also checks existing product subcategories for that category
3. If the category has types configured → a type selection is **required**
4. If the submitted type does not match any known type → **400 error** is thrown
5. The matched type name is stored in `products.subcategory`

This means product type IS validated at the application layer, even though there is no FK in the database.

🟡 **Revision needed:** Your manuscript may say the product type is free-text or unvalidated. In practice it IS validated against `category_types` at the API level, just not at the database constraint level.

---

## SECTION 3 — PURCHASING (BALE WORKFLOW)

---

### 3.1 Bale Purchase Record — Actual Fields

**Table:** `bale_purchases` (evolved through 4 migrations)

| Field | Type | Description |
|---|---|---|
| `id` | BIGINT UNSIGNED | Primary key |
| `bale_batch_no` | VARCHAR(100) UNIQUE | Batch number / PO number (format: `BALE-PO-0001`) |
| `po_number` | VARCHAR(100) UNIQUE | Purchase order number |
| `supplier_id` | BIGINT UNSIGNED | FK to `suppliers` (nullable) |
| `supplier_name` | VARCHAR(255) | Snapshot of supplier name at time of purchase |
| `purchase_date` | DATE | Date of purchase/order |
| `bale_category` | VARCHAR(120) | Category of items in the bale |
| `bale_cost` | DECIMAL(12,2) | Cost of the bale |
| `total_purchase_cost` | DECIMAL(12,2) | Total cost (= bale_cost in current schema) |
| `payment_status` | ENUM | `PAID`, `PARTIAL`, `UNPAID` |
| `po_status` | ENUM | `PENDING`, `ORDERED`, `RECEIVED`, `COMPLETED`, `CANCELLED` |
| `quantity_ordered` | INT | Number of pieces ordered |
| `quantity_received` | INT | Number of pieces actually received |
| `expected_delivery_date` | DATE | Expected delivery |
| `actual_delivery_date` | DATE | Actual delivery |
| `notes` | TEXT | Additional notes |

🔴 **Revision needed:** The `bale_purchases` table serves as BOTH the purchase record AND the purchase order. There is no separate `ORDER_LINE_ITEM` table.

---

### 3.2 The "Bale Purchase Order" Is Not a Separate Entity

**Code evidence** — `backend/src/routes/balePurchaseOrders.js:1`:
```
module.exports = require('./balePurchases')
```

The `balePurchaseOrders.js` file is a **one-line alias** pointing to `balePurchases.js`. They are the same router, the same endpoints, the same database table.

**PO number auto-generation** — traced to `backend/src/routes/balePurchases.js:22–57`:
- Format: `BALE-PO-0001`, `BALE-PO-0002`, `BALE-PO-0003`...
- Stored in `bale_purchases.bale_batch_no`
- Collision-safe: checks for existence before assigning

🔴 **Revision needed:**
- Remove the `BALE_PURCHASE_ORDER` class from your Domain Class Diagram
- Remove the `ORDER_LINE_ITEM` class — it does not exist in the code
- Show one unified `BALE_PURCHASE` class with a `po_status` attribute

---

### 3.3 Bale Breakdown — Full Behavior

**Table:** `bale_breakdowns`

| Field | Description |
|---|---|
| `bale_purchase_id` | FK to `bale_purchases` (1:1 relationship, UNIQUE) |
| `total_pieces` | Total items received in the bale |
| `saleable_items` | Items that can be sold |
| `premium_items` | Count of premium grade items |
| `standard_items` | Count of standard grade items |
| `low_grade_items` | Count of low grade items |
| `damaged_items` | Count of damaged items |
| `cost_per_saleable_item` | `bale_cost ÷ saleable_items` |
| `encoded_by` | FK to `users` who entered the breakdown |
| `breakdown_date` | Date the breakdown was done |

**Automatic Product Generation** — traced to `backend/src/utils/baleBreakdownProductSync.js`:

After a breakdown is saved, this service runs automatically:
- Creates **one product record per grade** (`premium` and `standard` only)
- Grade definitions at `baleBreakdownProductSync.js:6–9` (only 2 grades generate products)
- `low_grade_items`, `damaged_items` are tracked as counts but do **NOT** auto-generate products
- Auto-generated product name: `"{bale_batch_no} - Premium"` / `"{bale_batch_no} - Standard"`
- Auto-assigned: `sku` (sequential), `barcode` (sequential), `item_code`, QR code image
- `allocated_cost` = `bale_cost ÷ saleable_items`
- Each generated product gets 1 unit of stock via an `IN` inventory transaction
- Products are tagged `product_source = 'bale_breakdown'`

🟡 **Revision needed:**
- The manuscript should describe the auto-product generation step explicitly
- Note that only `premium` and `standard` grades auto-generate products
- `low_grade` and `damaged` items are tracked in `bale_breakdowns` but do NOT create product records automatically

---

### 3.4 Bale Supplier Returns — Schema Mismatch (BUG)

**This is an actual bug in the codebase.**

**Migration creates:** `bale_supplier_returns` table (simple: `supplier_id`, `bale_purchase_id`, `return_date`, `notes`, `processed_by`) — no `status` column, no `return_number` column.

**Route queries:** `bale_returns` table with columns `return_number`, `status` (PENDING/APPROVED/REJECTED/PROCESSED), `items_json`, `supplier_id`, `supplier_name`, `bale_purchase_id`, `return_date`, `created_by`, `processed_by`.

**Evidence:**
- Migration `20260421_create_bale_supplier_returns.sql:3` creates `bale_supplier_returns`
- Route `backend/src/routes/baleReturns.js:63` queries `FROM bale_returns r`
- These are two different tables with different structures

**Effect:** The `bale_returns` table is not created by any migration in the codebase. The route will fail at runtime if `bale_returns` does not exist in the database.

🔴 **Revision needed / To fix:**
- Manuscript: Remove `bale_returns`/`bale_supplier_returns` as a fully functioning feature — note it as a known inconsistency
- Code fix needed: Either create a migration for `bale_returns` matching the route's schema, or update the route to use `bale_supplier_returns`

---

## SECTION 4 — INVENTORY MANAGEMENT

---

### 4.1 Inventory Transaction Types

**Table:** `inventory_transactions` — `transaction_type` ENUM values: `IN`, `OUT`, `ADJUST`, `RETURN`

**Damage source types** — traced to `backend/src/routes/inventory.js:22`:
```
DAMAGE_SOURCE_TYPES = ['bale_breakdown', 'manual_damage', 'sales_return']
```

Three separate damage sources are tracked:
1. **bale_breakdown** — damage discovered during bale sorting
2. **manual_damage** — manually reported damage
3. **sales_return** — item returned by customer and found damaged

🟡 **Revision needed:** The manuscript may only mention manual damage. Add all three damage sources.

---

### 4.2 Inventory Reports Available

Traced to `backend/src/routes/inventory.js` — confirmed endpoints:
- `GET /inventory/reports/shrinkage` — shrinkage report
- `GET /inventory/reports/stock-out` — stock-out report
- `GET /inventory/reports/summary` — overall inventory summary
- `GET /inventory/alerts/low-stock` — products at or below `low_stock_threshold`
- `GET /inventory/damaged` — all damaged inventory records
- `GET /inventory/transactions` — paginated transaction history

---

### 4.3 Two Overlapping Damage Tables

The codebase has two tables that record damaged items:

| Table | What it stores | Written by |
|---|---|---|
| `damaged_inventory` | Legacy: product_id, quantity, reason, reported_by | `POST /inventory/stock-out/damage` |
| `inventory_adjustments` | Type = 'damaged' or 'shrinkage' or 'unsellable' or 'correction', tied to bale or product | `POST /inventory/stock-out/damage` (also) |

Both are written on the same damage event. `damaged_inventory` is the authoritative record for the damage history view. `inventory_adjustments` provides the adjustment type breakdown for reports.

🟡 **Revision needed:** Your Domain Class Diagram likely shows only one damage entity. Show both if documenting the full schema, or note that damage is tracked in two complementary tables.

---

## SECTION 5 — SALES / POS

---

### 5.1 Draft Sale Architecture

**Critical design detail not in the manuscript.**

The `sales` table itself stores draft records using `status = 'DRAFT'`. There is no separate draft table.

**Full POS workflow** — traced to `backend/src/services/draftSaleService.js` and `backend/src/routes/sales.js`:

| Step | API Call | What happens |
|---|---|---|
| 1. Start sale | `POST /sales/drafts` | Creates a `DRAFT` record in `sales` table |
| 2. Add item (manual) | `POST /sales/:id/items` | Adds to `sale_items`, validates stock |
| 3. Add item (scanner) | `POST /sales/:id/items` with `scanned_code` | Looks up product by barcode/SKU/item_code |
| 4. Change quantity | `PUT /sales/:id/items/:itemId` | Updates `sale_items.qty` and `line_total` |
| 5. Remove item | `DELETE /sales/:id/items/:itemId` | Deletes `sale_items` row |
| 6. Attach customer | `PATCH /drafts/:id/customer` | Links customer to draft |
| 7. Checkout | `POST /sales` (with `sale_id`) | Converts DRAFT → COMPLETED, deducts stock |
| 8. Cancel draft | `DELETE /sales/:id` | Deletes the DRAFT record entirely |

**Key behaviors:**
- Draft sale is locked with `SELECT ... FOR UPDATE` to prevent concurrent edits
- Price override requires `sales.edit` permission (or `admin.*`)
- Snapshots of `product_name`, `sku`, `brand`, `barcode`, `size`, `color` are stored in `sale_items` at checkout
- Payment is recorded at checkout only, not during draft
- `WALK_IN_CUSTOMER_LABEL` is the default customer name on new drafts
- VAT calculation uses `getRuntimeConfig()` → reads `configs` table for `vat_inclusive` setting

🔴 **Revision needed:** Rewrite the POS use case description entirely. Include:
1. Draft sale is created first
2. Items are added/removed before commitment
3. Checkout is a separate action that finalizes and deducts stock
4. Snapshots are stored for historical accuracy
5. Scanner support

---

### 5.2 Sale Record — Actual Fields

**Table:** `sales`

| Field | Description |
|---|---|
| `sale_number` | Unique, auto-generated (format: `DRF-XXXXX` for drafts, converted on checkout) |
| `date` | Timestamp of sale |
| `clerk_id` | FK to `users` |
| `customer_id` | FK to `customers` (nullable, for walk-in) |
| `customer_name_snapshot` | Name stored at time of sale |
| `customer_phone_snapshot` | Phone stored at time of sale |
| `customer_email_snapshot` | Email stored at time of sale |
| `order_note` | Optional note |
| `subtotal` | Before tax/discount |
| `tax` | Tax amount |
| `discount` | Discount amount |
| `total` | Final amount |
| `payment_method` | Cash/card/etc. |
| `status` | `DRAFT`, `COMPLETED`, `REFUNDED`, `CANCELLED` |
| `receipt_no` | Receipt number (assigned at checkout) |

---

### 5.3 Returns and Refunds

Two separate endpoints:
- `POST /sales/returns` — creates a sales return, restores stock, optionally marks items as damaged
- `POST /sales/:id/refund` — marks a COMPLETED sale as REFUNDED

Stock restoration on return → creates an `IN` inventory transaction.
If returned item is damaged → damage source set to `sales_return`, creates `damaged_inventory` record.

---

## SECTION 6 — CUSTOMERS

---

### 6.1 Customer Record — Actual Fields

**Base table** (`sia.sql`) + **migration** (`20260324_customer_profile.sql`):

| Field | Description |
|---|---|
| `id` | Primary key |
| `customer_code` | Auto-assigned (`CUST-000001`) |
| `name` | Display name |
| `full_name` | Full legal name |
| `nickname` | Optional nickname |
| `phone` | Phone number (validated: `+639XXXXXXXXX` format) |
| `email` | Email (validated format) |
| `preferred_contact_method` | SMS / Call / Email / Facebook-Messenger / Viber |
| `address` | Legacy single-line address |
| `address_line` | Street address |
| `barangay` / `barangay_name` / `barangay_code` | Barangay (PSGC) |
| `city` / `city_name` / `city_code` | City (PSGC) |
| `province` / `province_name` / `province_code` | Province (PSGC) |
| `region_name` / `region_code` | Region (PSGC) |
| `postal_code` | 4-digit postal code |
| `notes` | Notes (max 600 chars) |

Address lookup uses the **Philippine Standard Geographic Code (PSGC) API** at `psgc.cloud/api/v1`.

🟡 **Revision needed:** Your customer entity in the Domain Class Diagram likely only shows basic fields. Add the Philippine address hierarchy and PSGC integration.

---

### 6.2 Walk-In Customer

- All sales default to `WALK_IN_CUSTOMER_LABEL` until a specific customer is assigned
- Walk-in profiles are auto-created for each unique name+phone combination
- Walk-in customers can be "claimed" by a registered customer profile post-sale via the customer purchase history matching logic (`MATCH_SALE_TO_CUSTOMER_SQL`)

---

## SECTION 7 — EMPLOYEES & HR

---

### 7.1 Employee Creation — Auto User Account

**Traced to `backend/src/routes/employees.js:77–156`.**

Creating an employee is wrapped in a **database transaction** (BEGIN → COMMIT or ROLLBACK):
1. Validate email uniqueness in `employees` table
2. Insert into `employees`
3. Resolve role ID from role name
4. Hash a default password with bcrypt (10 salt rounds)
5. Insert into `users` (email = username = employee email)
6. If anything fails → full rollback (both employee AND user records are undone)

**Response:** Returns `{ id: employeeId, message: 'Employee and Login Credentials generated successfully' }`

The default password is set by `getDefaultNewUserPassword()` from `config/security.js`.

🟡 **Revision needed:** The manuscript should note that creating an employee automatically creates a system login account. The user account shares the employee's email as both username and email.

---

### 7.2 Employee Document Lifecycle

**Table:** `employee_documents`

| Field | Description |
|---|---|
| `employee_id` | FK to `employees` |
| `file_id` | FK to `files` (uploaded file) |
| `document_type` | Type of document (e.g., `PSA_BIRTH_CERT`, `SSS`, `PHILHEALTH`, `PAGIBIG`, `TIN`, `NBI`) |
| `document_number` | The document's reference number |
| `issuing_agency` | Who issued it |
| `issue_date` | Date issued |
| `expiry_date` | Expiry date (indexed for expiry alerts) |
| `status` | `NOT_SUBMITTED`, `SUBMITTED`, `VERIFIED`, `REJECTED`, `EXPIRED` |
| `remarks` | Remarks (for rejection reason) |
| `verified_by` | FK to `users` who verified |
| `verified_at` | Timestamp of verification |

**Constraint:** Only one record per `(employee_id, document_type)` — unique key enforced at DB level.

**Lifecycle flow:**
```
NOT_SUBMITTED → SUBMITTED → VERIFIED
                          ↘ REJECTED
                ↘ EXPIRED (system/manual)
```

🔴 **Revision needed:** Add this lifecycle to your Employee use case description and Domain Class Diagram. Show `EMPLOYEE_DOCUMENT` as a class linked to `EMPLOYEE` and `FILE`.

---

## SECTION 8 — ATTENDANCE

---

### 8.1 Attendance Record Fields

**Table:** `attendance`

| Field | Description |
|---|---|
| `employee_id` | FK to `employees` |
| `date` | Date of attendance |
| `clock_in` | Time in (HH:MM format after normalization) |
| `clock_out` | Time out (HH:MM format after normalization) |
| `status` | Attendance status (see below) |
| `expected_in` | Expected start time |
| `expected_out` | Expected end time |
| `late_minutes` | Minutes late (auto-computed) |
| `undertime_minutes` | Minutes undertime (auto-computed) |
| `overtime_minutes` | Minutes overtime (auto-computed) |
| `hours_worked` | Decimal hours worked (auto-computed) |
| `notes` | Optional notes |

**Valid statuses** — traced to `backend/src/routes/attendance.js:10`:
```
PRESENT | LATE | HALF_DAY | ABSENT | ON_LEAVE | REST_DAY | HOLIDAY
```

**Auto-computation** — traced to `attendance.js:66–83`:
- Late minutes = `clock_in - expected_in` (if clock_in is after expected_in)
- Undertime minutes = `expected_out - clock_out` (if clock_out is before expected_out)
- Overtime minutes = `clock_out - expected_out` (if clock_out is after expected_out)
- Hours worked = `(clock_out - clock_in) / 60`

**Known gap:** No unique constraint on `(employee_id, date)` in the database. Duplicate entries for the same employee on the same day are possible.

🔴 **Revision needed:**
1. Add all 7 attendance statuses to the manuscript
2. Add the auto-computed fields (late_minutes, undertime_minutes, overtime_minutes) — these feed directly into payroll
3. Note the missing uniqueness constraint as a system limitation

---

## SECTION 9 — PAYROLL

---

### 9.1 The Full Payroll Architecture (7 Tables + 1 Legacy)

The manuscript likely shows a simple payroll record. The actual implementation uses 8 tables.

**Table 1: `payroll_profiles`** — Per-employee payroll configuration
- `pay_basis`: `monthly`, `daily`, or `hourly`
- `pay_rate`: base rate
- `payroll_frequency`: `weekly`, `semi_monthly`, or `monthly`
- `standard_work_days_per_month`: default 22 days
- `standard_hours_per_day`: default 8 hours
- Flags: `overtime_eligible`, `late_deduction_enabled`, `undertime_deduction_enabled`, `tax_enabled`, `sss_enabled`, `philhealth_enabled`, `pagibig_enabled`
- `payroll_method`: `cash`, `bank_transfer`, or `ewallet`
- Bank details: `bank_name`, `bank_account_name`, `bank_account_number`

**Table 2: `payroll_periods`** — Pay period definitions
- `code`: unique period identifier
- `start_date`, `end_date`, `payout_date`
- `frequency`: `weekly`, `semi_monthly`, or `monthly`
- `status`: `draft`, `computed`, `finalized`, `released`, `void`
- Audit trail: `created_by`, `finalized_by`, `released_by`

**Table 3: `payroll_inputs`** — Per-employee data for a period
- `days_worked`, `hours_worked`, `overtime_hours`
- `night_differential_minutes`
- `late_minutes`, `undertime_minutes`, `absent_days`
- `regular_holiday_days`, `special_holiday_days`, `rest_day_days`
- `paid_leave_days`, `unpaid_leave_days`
- `manual_bonus`, `manual_commission`, `manual_allowance`
- `loan_deduction`, `manual_deduction`
- Auto-synced from `attendance` via `syncAttendanceToInputs` service

**Table 4: `payroll_runs`** — Run-level summary
- `run_number`: unique identifier
- `total_gross_pay`, `total_employee_deductions`, `total_employer_contributions`, `total_net_pay`
- `employee_count`
- `status`: `draft`, `finalized`, `released`, `void`

**Table 5: `payroll_run_items`** — Per-employee computed result
Stores the full breakdown per employee:
- `gross_basic_pay`, `gross_overtime_pay`, `gross_holiday_pay`, `gross_rest_day_pay`
- `gross_bonus`, `gross_commission`, `gross_allowances`, `gross_pay`
- `taxable_income`, `withholding_tax`
- `employee_sss`, `employer_sss`, `ec_contribution`
- `employee_philhealth`, `employer_philhealth`
- `employee_pagibig`, `employer_pagibig`
- `other_deductions`, `total_deductions`, `net_pay`
- JSON snapshots: `payroll_profile_snapshot_json`, `input_snapshot_json`, `settings_snapshot_json`

**Table 6: `payroll_item_lines`** — Itemized line breakdown
- One row per earning or deduction line per employee
- `line_type`: `earning`, `deduction`, `employer_share`, `info`
- `code`: `BASIC_PAY`, `OVERTIME_PAY`, `NIGHT_DIFFERENTIAL`, `HOLIDAY_PAY`, `REST_DAY_PAY`, `BONUS`, `COMMISSION`, `ALLOWANCE`, `ABSENCES`, `LATE`, `UNDERTIME`, `SSS_EMPLOYEE`, `PHILHEALTH_EMPLOYEE`, `PAGIBIG_EMPLOYEE`, `WITHHOLDING_TAX`, `LOAN`, `MANUAL_DEDUCTION`

**Table 7: `payroll_settings_versions`** — Versioned statutory rates
- Stores BIR tax brackets, SSS rates, PhilHealth rates, Pag-IBIG rates as JSON
- Default settings use **BIR RR 11-2018 (effective 2023 onwards)**

**Table 8: `payrolls`** — Legacy simple table (no longer actively used)
- Old schema: `employee_id`, `period_start`, `period_end`, `gross_pay`, `deductions`, `advances`, `net_pay`, `status` (PENDING/PROCESSED/PAID)
- Not written to by the current payroll system

---

### 9.2 Payroll Computation — Statutory Rules

**Traced to `backend/src/services/payroll/computeEmployeePayroll.js`:**

**Basic Pay calculation:**
- Monthly basis: `pay_rate ÷ 2` (semi-monthly) or `pay_rate` (monthly) or `(pay_rate × 12) ÷ 52` (weekly)
- Daily basis: `days_worked × pay_rate`
- Hourly basis: `hours_worked × pay_rate`

**Overtime:** `hourly_rate × overtime_hours × overtime_multiplier (default 1.25)`

**Night Differential:** `hourly_rate × night_differential_minutes/60 × 0.10`

**SSS (2026 rates):**
- Employee rate: 5% of monthly salary credit
- Employer rate: 10% of monthly salary credit
- Salary credit floor: ₱5,000 / cap: ₱35,000
- EC contribution: ₱10 (if ≤₱14,500) or ₱30 (if >₱14,500)

**PhilHealth (2026 rates):**
- Premium rate: 5% of monthly basic salary
- Employee share: 50% | Employer share: 50%
- Floor: ₱10,000 / Cap: ₱100,000 monthly salary

**Pag-IBIG:**
- Employee: 2% | Employer: 2%
- Cap on compensation base: ₱10,000/month

**Withholding Tax — BIR RR 11-2018 Annex E (2023 onwards):**

Semi-monthly brackets:
| From | To | Base Tax | Rate |
|---|---|---|---|
| ₱0 | ₱10,417 | ₱0 | 0% |
| ₱10,417 | ₱16,666 | ₱0 | 15% |
| ₱16,667 | ₱33,332 | ₱937.50 | 20% |
| ₱33,333 | ₱83,332 | ₱4,270.70 | 25% |
| ₱83,333 | ₱333,332 | ₱16,770.70 | 30% |
| ₱333,333+ | — | ₱91,770.70 | 35% |

Also supports weekly and monthly frequency brackets.

🔴 **Revision needed:** Your payroll section in the manuscript likely shows a simplified formula. Replace it with:
1. The 6-stage payroll lifecycle (draft → computed → finalized → released → void)
2. The Philippine statutory deduction details with correct 2026 rates
3. The immutable snapshot concept (payslips preserve rates at time of computation)
4. That attendance data is auto-synced into payroll inputs

---

### 9.3 Payroll Period Lifecycle

```
DRAFT
  ↓ (load inputs, sync attendance)
  ↓ POST /payroll/periods/:id/compute
COMPUTED
  ↓ POST /payroll/periods/:id/finalize
FINALIZED  (no further edits allowed)
  ↓ POST /payroll/periods/:id/release
RELEASED   (disbursed to employees)

At any stage before RELEASED:
  → POST /payroll/periods/:id/void → VOID
```

---

## SECTION 10 — ADDITIONAL MODULES NOT IN MANUSCRIPT

---

### 10.1 Expenses Module (FULLY IMPLEMENTED)

**Table:** `expenses` — created on-the-fly by `backend/src/routes/expenses.js`

| Field | Description |
|---|---|
| `expense_date` | Date of expense |
| `category` | Expense category (free text) |
| `description` | Description |
| `amount` | Amount in PHP |
| `vendor` | Vendor/payee name |
| `employee_id` | FK to `employees` (who incurred it) |
| `status` | `PENDING`, `APPROVED`, `REJECTED`, `PAID` |
| `approved_by` | FK to `users` who approved |

**Operations:** Full CRUD (list, get single, create, update status, delete)
**Permission required:** `finance.reports.view`

---

### 10.2 Ledger Module (FULLY IMPLEMENTED)

**Table:** `ledger` — created on-the-fly by `backend/src/routes/ledger.js`

| Field | Description |
|---|---|
| `account_code` | Chart of accounts code |
| `entry_date` | Date of entry |
| `description` | Entry description |
| `debit` | Debit amount |
| `credit` | Credit amount |
| `reference` | Reference document/number |
| `created_by` | FK to `users` |

**Operations:** Full CRUD (list with date/account filter, get single, create, update, delete)
**Permission required:** `finance.reports.view`

Note: The ledger is manual — no automatic double-entry from sales or purchases. Entries must be created manually.

---

### 10.3 Notifications Module (FULLY IMPLEMENTED)

**Table:** `notifications` — from `sia.sql`, extended by migration `20260426_notifications_read_state.sql`

| Field | Description |
|---|---|
| `type` | Notification type |
| `title` | Title |
| `body` | Body text |
| `recipient_user_id` | FK to `users` |
| `payload` | JSON additional data |
| `status` | `PENDING`, `SENT`, `FAILED` |
| `sent_at` | When sent |
| `is_read` | Read flag (Boolean) |
| `read_at` | When read |

Admin users can view all notifications. Regular users see only their own.

---

### 10.4 Settings / System Configuration (FULLY IMPLEMENTED)

**Table:** `configs` (key-value store)

Known configuration keys used in the system:
- `vat_inclusive` — whether prices include VAT (affects POS tax calculation)
- `vat_rate` — VAT rate percentage
- `currency` — currency code (default: PHP)
- `business_name` — store name
- `default_new_user_password` — default password for auto-created user accounts

**Permission required:** `system.config.update` (for both reading AND writing)

---

### 10.5 Audit Log — Module Classification

**Traced to `backend/src/routes/audit.js:13–42`:**

Audit entries are auto-classified into modules based on action name patterns:
- Actions containing `INVENTORY_` → module: `inventory`
- Actions containing `SALE_` → module: `sales`
- Actions containing `AUTH_`, `USER_`, `ROLE_` → module: `access`
- Actions containing `SUPPLIER_`, `PURCHASE_ORDER_`, `BALE_` → module: `purchasing`
- Actions containing `CONFIG_`, `SYSTEM_` → module: `system`

Severity auto-detection:
- HIGH: `FAILED`, `BLOCKED`, `DELETE`, `PASSWORD`, `REFUND`, `PRICE_OVERRIDE`, `CONFIG`, `ROLE_`, `PERMISSION`, `REVERS`
- MEDIUM: `DISCOUNT`, `CREATE`, `UPDATE`, `RECEIVE`, `DAMAGE`, `SHRINKAGE`, `RETURN`
- LOW: everything else

---

## SECTION 11 — DOMAIN CLASS DIAGRAM — EXACT CORRECTIONS

---

### What needs to change:

#### REMOVE these classes:
1. `BALE_PURCHASE_ORDER` — merged into `BALE_PURCHASE`
2. `ORDER_LINE_ITEM` — does not exist as a table

#### RENAME these classes:
1. `PRODUCT_TYPE` → `CATEGORY_TYPE` (table is `category_types`)
2. `PAYROLL_RECORD` → expand to 7 separate classes (see Section 9.1)
3. `DAMAGED_ITEM` → `DAMAGED_INVENTORY` (table is `damaged_inventory`)

#### ADD these classes (all exist in the actual database):
1. `CATEGORY_TYPE` (linked to `CATEGORY` — one category has many types)
2. `EMPLOYEE_DOCUMENT` (linked to `EMPLOYEE` and `FILE`)
3. `FILE` (linked to `EMPLOYEE_DOCUMENT`)
4. `INVENTORY_ADJUSTMENT` (linked to `PRODUCT` and `BALE_PURCHASE`)
5. `PAYROLL_PROFILE` (linked to `USER`)
6. `PAYROLL_PERIOD` (standalone + linked to `PAYROLL_RUN`)
7. `PAYROLL_INPUT` (linked to `PAYROLL_PERIOD` and `USER`)
8. `PAYROLL_RUN` (linked to `PAYROLL_PERIOD` and `PAYROLL_RUN_ITEM`)
9. `PAYROLL_RUN_ITEM` (linked to `PAYROLL_RUN` and `USER`)
10. `PAYROLL_ITEM_LINE` (linked to `PAYROLL_RUN_ITEM`)
11. `PAYROLL_SETTINGS` (standalone — versioned statutory rates)
12. `NOTIFICATION` (linked to `USER`)
13. `AUDIT_LOG` (linked to `USER`)
14. `CONFIG` (standalone — system settings key-value)
15. `LEDGER` (linked to `USER`)
16. `EXPENSE` (linked to `EMPLOYEE` and `USER`)

#### FIX these relationships:
1. `PRODUCT` → `CATEGORY`: FK exists ✅
2. `PRODUCT` → `CATEGORY_TYPE`: No FK (loose text) — draw as dashed/dependency line, not solid FK line
3. `BALE_PURCHASE` ↔ `BALE_BREAKDOWN`: 1:1 (UNIQUE constraint on `bale_purchase_id` in `bale_breakdowns`)
4. `BALE_BREAKDOWN` → `PRODUCT`: 1:many (one breakdown generates 2 products — premium + standard)
5. `EMPLOYEE` → `USER`: 1:1 (employee creation auto-creates user)
6. `SALE` → `SALE_ITEM`: 1:many ✅ (keep, but note `sale_items` not `SALE_LINE_ITEM`)
7. `USER` → `USER_ROLE` → `ROLE`: many-to-many (junction table `user_roles`) ✅

---

## SECTION 12 — DATABASE STRUCTURE — COMPLETE TABLE LIST

**Total tables: 37** (including tables created at runtime)

### Group 1: Access Control
| Table | Key Fields | Notes |
|---|---|---|
| `users` | id, username, email, password_hash, full_name, is_active | Core auth entity |
| `roles` | id, name, description | Named role groups |
| `permissions` | id, name, description | Granular permission keys |
| `role_permissions` | role_id, permission_id | Junction: role ↔ permission |
| `user_roles` | user_id, role_id | Junction: user ↔ role |
| `user_permissions` | user_id, permission_id | Direct user permissions |

### Group 2: Products & Categories
| Table | Key Fields | Notes |
|---|---|---|
| `categories` | id, name, description | Product categories |
| `category_types` | id, category_id, name, is_active | Sub-types per category |
| `products` | id, sku, name, category_id, condition_grade, bale_purchase_id, stock_quantity, status | Extended with bale fields |

### Group 3: Inventory
| Table | Key Fields | Notes |
|---|---|---|
| `inventory_transactions` | id, product_id, transaction_type, quantity, reference, balance_after | Full movement history |
| `inventory_adjustments` | id, product_id, bale_purchase_id, adjustment_type, quantity, reason | Bale-aware adjustments |
| `damaged_inventory` | id, product_id, quantity, reason, reported_by | Damage records |

### Group 4: Sales
| Table | Key Fields | Notes |
|---|---|---|
| `sales` | id, sale_number, status, clerk_id, customer_id, subtotal, tax, discount, total, receipt_no | Holds DRAFT and COMPLETED |
| `sale_items` | id, sale_id, product_id, qty, unit_price, line_total + snapshot fields | Line items with snapshots |

### Group 5: Customers & Suppliers
| Table | Key Fields | Notes |
|---|---|---|
| `customers` | id, customer_code, name, phone, email + Philippine address hierarchy | 20+ columns |
| `suppliers` | id, name, contact_person, phone, email, address | Basic contact info |

### Group 6: Purchasing (Bale)
| Table | Key Fields | Notes |
|---|---|---|
| `bale_purchases` | id, bale_batch_no, po_number, po_status, supplier_id, supplier_name, purchase_date, bale_category, bale_cost, quantity_ordered, quantity_received | Unified PO+Record |
| `bale_breakdowns` | id, bale_purchase_id (UNIQUE), premium_items, standard_items, low_grade_items, damaged_items, cost_per_saleable_item | 1:1 with bale_purchases |
| `bale_supplier_returns` | id, supplier_id, bale_purchase_id, return_date | Simple return record |
| `bale_supplier_return_items` | id, return_id, quantity, reason | Return line items |

### Group 7: Employees & HR
| Table | Key Fields | Notes |
|---|---|---|
| `employees` | id, name, email, tin, sss_number, philhealth_pin, pagibig_mid, employment_type, pay_rate, employment_status + emergency contact | 30+ columns |
| `employee_documents` | id, employee_id, document_type, status, expiry_date, verified_by | Document lifecycle |
| `attendance` | id, employee_id, date, clock_in, clock_out, status, late_minutes, undertime_minutes, overtime_minutes, hours_worked | |
| `files` | id, path, original_name, type, size, uploaded_by | Generic file metadata |

### Group 8: Payroll (7 active + 1 legacy)
| Table | Notes |
|---|---|
| `payroll_profiles` | Per-employee configuration |
| `payroll_periods` | Pay period with 5-stage lifecycle |
| `payroll_inputs` | Per-employee inputs per period |
| `payroll_runs` | Aggregate run result |
| `payroll_run_items` | Per-employee computed payslip |
| `payroll_item_lines` | Itemized earnings/deductions |
| `payroll_settings_versions` | Versioned BIR/SSS/PhilHealth/Pag-IBIG tables |
| `payrolls` | Legacy table — NOT actively used by current system |

### Group 9: Finance
| Table | Key Fields | Notes |
|---|---|---|
| `expenses` | id, expense_date, category, amount, vendor, employee_id, status, approved_by | Created at runtime |
| `ledger` | id, account_code, entry_date, debit, credit, reference, created_by | Manual double-entry |

### Group 10: System
| Table | Key Fields | Notes |
|---|---|---|
| `audit_logs` | id, user_id, action, resource_type, resource_id, details (JSON), created_at | All write events |
| `notifications` | id, type, recipient_user_id, payload, status, is_read, read_at | Internal alerts |
| `saved_reports` | id, name, filters (JSON), owner_id | Saved filter configs |
| `configs` | config_key (PK), config_value | System settings |
| `api_keys` | id, name, key, permissions (JSON) | External API access |
| `webhooks` | id, name, url, events (JSON) | Event hooks |

---

## SECTION 13 — EVENTS TABLE — CORRECTED VERSION

The following table replaces your manuscript's events table with the verified actual events:

| Event | Actor | Trigger | System Response | Audit Logged? | Severity |
|---|---|---|---|---|---|
| Login attempt — failed | User | POST /auth/login | Return 401 error | ✅ AUTH_LOGIN_FAILED | HIGH |
| Login — inactive account | User | POST /auth/login | Return 403 error | ✅ AUTH_LOGIN_BLOCKED | HIGH |
| Login — success | User | POST /auth/login | Issue 8-hour JWT token | ✅ AUTH_LOGIN | LOW |
| Product created | Admin/Manager | POST /products | Product record saved | ✅ | MEDIUM |
| Product stock adjusted | Staff | POST /inventory/stock-in | IN transaction created | ✅ | MEDIUM |
| Product stock decremented | Cashier | POST /sales (checkout) | OUT transaction per item | ✅ | MEDIUM |
| Stock falls below threshold | System | GET /inventory/alerts/low-stock | Alert returned in response | ❌ No auto-trigger | — |
| Draft sale created | Cashier | POST /sales/drafts | DRAFT record in sales table | — | — |
| Sale completed (checkout) | Cashier | POST /sales | DRAFT→COMPLETED, stock deducted, receipt generated | ✅ SALE_COMPLETED | MEDIUM |
| Sale refunded | Manager | POST /sales/:id/refund | Status → REFUNDED | ✅ | MEDIUM |
| Sale returned | Staff | POST /sales/returns | Stock restored, damage logged if applicable | ✅ | MEDIUM |
| Bale purchase created | Manager/Owner | POST /bale-purchases | bale_purchases record saved | ✅ BALE_PURCHASE_CREATED | MEDIUM |
| Bale breakdown saved | Staff | POST /bale-purchases/:id/breakdown | bale_breakdowns saved + products auto-created + stock added | ✅ | MEDIUM |
| Bale received | Manager | POST /bale-purchases/:id/receive | po_status → RECEIVED, actual_delivery_date set | ✅ | MEDIUM |
| Employee created | Admin | POST /employees | Employee + User account created in transaction | ✅ | MEDIUM |
| Attendance recorded | HR/Manager | POST /attendance | Attendance record saved, late/OT computed | ✅ | LOW |
| Payroll inputs synced | Payroll | POST /payroll/periods/:id/sync-attendance | payroll_inputs updated from attendance | ✅ | LOW |
| Payroll computed | Payroll | POST /payroll/periods/:id/compute | payroll_run + payroll_run_items created | ✅ | MEDIUM |
| Payroll finalized | Payroll/Owner | POST /payroll/periods/:id/finalize | Status → finalized, locked | ✅ | HIGH |
| Payroll released | Owner | POST /payroll/periods/:id/release | Status → released | ✅ | HIGH |
| Payroll voided | Owner | POST /payroll/periods/:id/void | Status → void | ✅ | HIGH |
| System config changed | Admin | POST/PUT /settings | Config updated | ✅ CONFIG_UPDATED | HIGH |
| Damaged item recorded | Staff | POST /inventory/stock-out/damage | OUT transaction + damaged_inventory record | ✅ | MEDIUM |
| Damaged item repaired | Staff | POST /inventory/damaged/repair | IN transaction restoring stock | ✅ | MEDIUM |
| User deactivated | Admin | PUT /users/:id (is_active=0) | Account blocked from login | ✅ | HIGH |
| Document verified | HR | PUT /employees/:id/documents/:docId | Status → VERIFIED, verifier recorded | ✅ | MEDIUM |

### Events to REMOVE from manuscript:
- ❌ "System notifies supplier when PO is created" — no supplier notifications exist
- ❌ "System auto-creates draft purchase order when stock is low" — alert-only, no auto-order
- ❌ "Owner must approve payroll" — no owner-specific approval gate; permission-based only

---

## SECTION 14 — KNOWN BUGS & SYSTEM LIMITATIONS

### Bug 1 — Bale Returns Schema Mismatch (RUNTIME ERROR)
**File:** `backend/src/routes/baleReturns.js`
**Problem:** Route queries `FROM bale_returns` but no migration creates that table. Migration `20260421_create_bale_supplier_returns.sql` creates `bale_supplier_returns` — a different table with a different structure.
**Effect:** `GET /bale-returns` will throw `ER_NO_SUCH_TABLE` at runtime.
**Fix needed:** Create a migration for `bale_returns` table matching the route's expected schema, OR update `baleReturns.js` to use `bale_supplier_returns`.

---

### Bug 2 — Duplicate Attendance Entries Possible
**File:** `backend/src/database/sia.sql` (attendance table definition)
**Problem:** `attendance` table has no `UNIQUE KEY` on `(employee_id, date)`.
**Effect:** Multiple attendance records for the same employee on the same day can be inserted. `syncAttendanceToInputs` may double-count hours.
**Fix needed:** Add `UNIQUE KEY uq_attendance_employee_date (employee_id, date)` to the `attendance` table.

---

### Bug 3 — JWT Logout Has No Server-Side Invalidation
**File:** No server-side logout endpoint exists
**Problem:** A JWT token issued at login remains valid for 8 hours even after the user "logs out" on the client.
**Effect:** If a token is copied before logout, it can be reused until natural expiry.
**Fix needed:** Implement a token blacklist table, or use short-expiry tokens (e.g., 15 min) with refresh tokens.

---

### Bug 4 — `product_source` Column Not in `sia.sql` or Any Migration
**File:** `baleBreakdownProductSync.js:143` sets `product_source = 'bale_breakdown'`
**Problem:** No migration adds `product_source` column to `products` table. It exists in `sia_backup.sql` but not in `sia.sql` or any of the 18 listed migrations.
**Effect:** `UPDATE products SET product_source = ...` may fail or silently be ignored if the column doesn't exist in the deployed database.

---

### Bug 5 — `source_breakdown_id` Column Not in Any Migration
**File:** `baleBreakdownProductSync.js:157` sets `source_breakdown_id`
**Problem:** No migration adds `source_breakdown_id` to `products`. Same issue as Bug 4.

---

### Gap 1 — API Keys and Webhooks Are Stubs
**Tables exist:** `api_keys`, `webhooks`
**Routes:** None registered in `server.js`
**Effect:** These tables are created but no functionality is wired to them.

---

### Gap 2 — Ledger Is Manual-Only
The `ledger` module exists and is fully functional, but no automatic entries are created when sales, expenses, or payroll events occur. All ledger entries must be created manually.

---

## SECTION 15 — PRIORITY REVISION CHECKLIST

Use this checklist when updating the manuscript:

### Domain Class Diagram
- [ ] Remove `BALE_PURCHASE_ORDER` as a separate class
- [ ] Remove `ORDER_LINE_ITEM`
- [ ] Rename `PRODUCT_TYPE` to `CATEGORY_TYPE`
- [ ] Show `CATEGORY` → `CATEGORY_TYPE` as 1:many
- [ ] Show `PRODUCT` → `CATEGORY_TYPE` as dashed (app-level validation, not FK)
- [ ] Add `BALE_BREAKDOWN` → `PRODUCT` (1:2 auto-generated)
- [ ] Replace `PAYROLL_RECORD` with 7-entity payroll model
- [ ] Add `EMPLOYEE_DOCUMENT` linked to `EMPLOYEE` and `FILE`
- [ ] Add `FILE` entity
- [ ] Add `INVENTORY_ADJUSTMENT` entity
- [ ] Add `AUDIT_LOG` entity
- [ ] Add `NOTIFICATION` entity
- [ ] Add `CONFIG` entity
- [ ] Add `EXPENSE` entity
- [ ] Add `LEDGER` entity
- [ ] Show `EMPLOYEE` → `USER` as 1:1 (auto-creation)
- [ ] Show `sales` status includes `DRAFT` (not just COMPLETED/REFUNDED/CANCELLED)

### Use Case Descriptions
- [ ] Rewrite **Log In** — add active account check, 8-hour token, audit logging of failures
- [ ] Rewrite **POS/Sale** — add draft-sale flow, barcode scanner, checkout step, snapshot storage
- [ ] Rewrite **Bale Breakdown** — add auto-product generation (only premium + standard), stock auto-add
- [ ] Rewrite **Payroll** — add 6-stage lifecycle, statutory rates, snapshots
- [ ] Rewrite **Employee Documents** — add 5-status lifecycle, verification workflow
- [ ] Add **Expenses** use case
- [ ] Add **Ledger** use case
- [ ] Add **Notifications** use case
- [ ] Add **System Settings** use case
- [ ] Add **Saved Reports** use case

### Events Table
- [ ] Remove "supplier notification on PO creation"
- [ ] Remove "automatic reorder on low stock"
- [ ] Remove "owner approval gate on payroll" (replace with permission-based finalize/release)
- [ ] Add all payroll lifecycle events (compute, finalize, release, void)
- [ ] Add document verification event
- [ ] Add system config change event (HIGH severity)
- [ ] Add `AUTH_LOGIN_FAILED` and `AUTH_LOGIN_BLOCKED` events

### Database Schema Section
- [ ] Add missing columns to `products` table (condition_grade, bale_purchase_id, allocated_cost, selling_price, status, date_encoded, item_code)
- [ ] Add missing columns to `bale_purchases` table (po_number, po_status, quantity_ordered, quantity_received, expected_delivery_date, actual_delivery_date, supplier_id)
- [ ] Add all 7 payroll tables
- [ ] Add `employee_documents` table
- [ ] Add `files` table
- [ ] Add `inventory_adjustments` table
- [ ] Add `expenses` table
- [ ] Add `ledger` table
- [ ] Add `notifications` table with `is_read`/`read_at`
- [ ] Add `configs` table
- [ ] Add `saved_reports` table
- [ ] Note `payrolls` as legacy/unused
- [ ] Document full Philippine address hierarchy in `customers`

### System Limitations to Disclose
- [ ] Token logout is client-side only (no server invalidation)
- [ ] `attendance` has no unique constraint on (employee_id, date)
- [ ] `bale_returns` table mismatch is an open bug
- [ ] Ledger entries are not auto-posted from transactions
- [ ] API Keys and Webhooks tables exist but no management interface

---

*End of Document*
*All code evidence cited was verified by direct file inspection on April 29, 2026*
*Sources: `backend/src/routes/`, `backend/src/database/`, `backend/src/services/`, `backend/src/utils/`, `backend/seed_permissions.js`*
