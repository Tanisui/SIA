# Cecille's N'Style Boutique — Manuscript Revision Guide
**System Integration and Architecture 2 | S.Y. 2025–2026, 2nd Semester**
**Ilanga, Palanca, Sintos | Ateneo de Davao University**

Analysis date: April 29, 2026
Based on: Full codebase scan of `c:/Users/acer/SIA` cross-referenced against the submitted manuscript PDF.

---

## How to Read This Guide

Each section tells you:
- **What the manuscript currently says** (or doesn't say)
- **What the actual system does**
- **What you need to revise** — marked with action labels:
  - 🔴 **MUST FIX** — Factually wrong or critically missing; will affect your grade
  - 🟡 **SHOULD ADD** — Not wrong, but incomplete; the system does more than described
  - 🟢 **CORRECT** — Manuscript matches the actual system

---

## PART 1 — USE CASE LIST

### What your manuscript lists vs. what is actually built

---

### 🟢 Correctly Documented Use Cases

These use cases are in your manuscript AND are fully working in the system. No changes needed.

| Use Case | What the system does |
|---|---|
| Log In | Works. User enters credentials, system checks if account is active, issues a secure token. |
| Log Out | Works. Clears the session on the user's device. |
| Manage Users | Full add / edit / deactivate user accounts. |
| Manage Roles & Permissions | Full role management with permission assignment. |
| Manage Products | Full add / edit / delete / view products with images, sizes, colors. |
| Manage Categories | Categories can be added and are automatically created when a bale category is first entered. |
| Manage Suppliers | Full supplier records with contact info. |
| Manage Customers | Full customer records. (Extended — see below.) |
| Process a Sale (POS) | Cashier adds items, applies discount, accepts payment, generates receipt. (Has important additions — see below.) |
| Process a Return / Refund | Sales returns and refunds are fully working. |
| Manage Bale Purchases | Bale records, receipt tracking, batch numbering. (Has important discrepancy — see below.) |
| Bale Breakdown | Sorting bale items into grades, recording quantities per grade. |
| Stock-In (from bale) | Stock added to inventory from a completed bale breakdown. |
| Stock-In (manual) | Direct stock additions not tied to a bale. |
| Stock Adjustment | Manual corrections to stock count. |
| Record Damaged Items | Logging damaged items to remove from saleable stock. |
| Repair Damaged Item | Restoring a repaired item back to saleable stock. |
| Manage Employees | Full employee profiles with personal info, government IDs, employment details. |
| Record Attendance | Add, edit, and view daily attendance per employee. |
| Compute Payroll | Full payroll computation with statutory deductions. (Has important additions — see below.) |
| View Reports | Sales, inventory, payroll, and other module-level reports. |
| View Audit Log | System-wide activity history with who did what and when. |
| View Dashboard | Summary of key stats — role-aware (admin sees everything; sales clerk sees limited view). |

---

### 🔴 MUST FIX — Use Cases with Wrong or Incomplete Descriptions

---

#### 1. Bale Purchase Order vs. Bale Purchase Record

**What your manuscript says:**
The manuscript treats these as two separate things — a *Bale Purchase Record* (the record of what was bought) and a *Bale Purchase Order* (the order placed with a supplier before receiving).

**What the system actually does:**
They are stored in **the same database table** (`bale_purchases`). There is no separate purchase order table. Instead, a single `bale_purchase` record has a **status** that tracks where it is in the process:

```
PENDING → ORDERED → RECEIVED → COMPLETED → CANCELLED
```

A record becomes a "purchase order" by having a `po_number` assigned (format: `BALE-PO-0001`, `BALE-PO-0002`, etc.).

**What you need to revise:**
- In the Use Case descriptions, clarify that the PO and the purchase record are managed from the same screen and stored as one entity.
- In the Domain Class Diagram, remove the separate `BALE_PURCHASE_ORDER` class — or show it as the same class as `BALE_PURCHASE_RECORD` with a status field.
- Update any actor/flow that implies the PO and record are managed separately.

---

#### 2. The POS / Sale Process (Draft Sale Pattern)

**What your manuscript says:**
Cashier searches for a product → adds to cart → enters quantity → applies discount → payment → receipt printed.

**What the system actually does:**
The POS uses a **two-step process** that the manuscript does not describe:

**Step 1 — Draft Sale:**
The system creates a "draft" (a temporary, incomplete sale) the moment the cashier starts. Items are added one at a time. A customer can be added at any point. Nothing is committed yet.

**Step 2 — Checkout:**
Only when the cashier confirms does the draft become a real, finalized sale. Stock is deducted. The receipt is generated.

This is important because:
- It prevents incomplete or half-entered sales from appearing in reports
- It allows the cashier to hold a sale, modify it, and come back to it
- The system also supports **barcode/QR scanner input** at POS — scanning a product barcode automatically adds the item to the draft. The manuscript does not mention this at all.

**What you need to revise:**
- Rewrite the POS use case description to include the two-step draft → checkout flow
- Add a sentence about barcode scanner support in the POS section

---

#### 3. Payroll — Lifecycle Stages

**What your manuscript says:**
Describes payroll as essentially: compute hours worked → apply deductions → output net pay.

**What the system actually does:**
Payroll goes through **6 stages**, each with a distinct status:

| Stage | What happens |
|---|---|
| **Draft** | Payroll period is created (start date, end date, payout date). |
| **Input Loading** | Employee attendance data is pulled and can be manually adjusted (overtime, leaves, bonuses, deductions). |
| **Computed** | System runs the payroll calculation — gross pay, SSS, PhilHealth, Pag-IBIG, withholding tax, net pay. |
| **Finalized** | Locked for review. No more edits allowed. |
| **Released** | Marked as paid/disbursed to employees. |
| **Void** | Cancelled run — permanently invalidated. |

The tax computation follows **BIR RR 11-2018 (2023 onwards)** — the actual Philippine Bureau of Internal Revenue tax tables for semi-monthly, weekly, and monthly frequencies are all coded in.

Each payslip also stores a **snapshot** of the employee profile and settings at the time of computation — meaning even if rates change later, old payslips stay accurate.

**What you need to revise:**
- Rewrite the payroll use case to describe all 6 stages
- Add the BIR reference (RR 11-2018) to show compliance with Philippine law
- Add a note that payslips are immutable snapshots — this is a key design decision worth mentioning

---

#### 4. Employee Documents — Lifecycle Workflow

**What your manuscript says:**
Describes uploading government-required documents (PSA Birth Certificate, Government ID, TIN, SSS, PhilHealth, Pag-IBIG cards).

**What the system actually does:**
Each uploaded document goes through a **status lifecycle**:

```
NOT SUBMITTED → SUBMITTED → VERIFIED (or REJECTED or EXPIRED)
```

Additional fields tracked per document (not in the manuscript):
- Document number (e.g., SSS number itself)
- Issuing agency
- Issue date and expiry date
- Who verified it and when
- Remarks (for rejection notes)

The system enforces that each employee can only have **one record per document type** (e.g., only one SSS entry per employee).

**What you need to revise:**
- Add the document lifecycle (NOT SUBMITTED → SUBMITTED → VERIFIED/REJECTED/EXPIRED) to the Employee management section
- List the additional fields (document number, expiry, verifier) in the Employee use case description

---

### 🟡 SHOULD ADD — Use Cases Implemented but NOT in Your Manuscript

These are fully working features in the system that your manuscript never mentions. You should add brief descriptions of each to show the full scope of what was built.

| Feature | What it does |
|---|---|
| **Expense Tracking** | Separate module for logging business expenses. |
| **Notifications** | System-generated alerts (e.g., low stock) are stored and can be marked as read. |
| **File Management** | All uploaded files (documents, images) are tracked with file name, type, size, and who uploaded them. |
| **Payslip Viewing** | Employees with access can view their own payslips. Managers can view all. |
| **Payroll Input Sheet** | Before computing payroll, there is an input sheet where HR adjusts each employee's data for the period. |
| **Saved Report Configurations** | Users can save their report filters (e.g., "Sales for March, filtered by Category A") for reuse. |
| **Change Password / Forgot Password** | Users can change their password and request a password reset via email. |
| **Bale Supplier Returns** | When a received bale has defective items, a return to the supplier can be logged with reason and quantity. |
| **VAT Settings Toggle** | The owner can configure whether product prices are VAT-inclusive or VAT-exclusive from the Settings page. |
| **Barcode/QR Label Printing** | From the Inventory page, individual product labels (barcode + QR code) can be generated and printed. |

---

## PART 2 — USE CASE DESCRIPTIONS (Detailed Accuracy Check)

### Per use case, here is what is correct and what needs updating:

---

### UC: Log In
🟢 **Accurate.** One addition worth noting: the system checks whether the account is **active** (`is_active = 1`). If an admin deactivates a user account, that user can no longer log in even with the correct password.

---

### UC: Manage Roles & Permissions
🟡 **Mostly accurate, but incomplete.**

The system uses a **wildcard permission model** that is more powerful than a simple role-to-screen matrix:
- A role can have `sales.*` which grants *all* sales-related permissions at once
- A role can have `admin.*` which grants *everything* in the system
- A user can have **multiple roles** at the same time (permissions from all roles are combined)
- A user can also have **direct permissions** assigned to them individually (independent of any role)

If your manuscript shows a simple table like "Sales Clerk can access: Sales, Customers" — that is an oversimplification. The actual RBAC system is more granular.

---

### UC: Manage Products
🟡 **Accurate, but missing bale-linked product fields.**

Products generated from a bale breakdown have extra fields that manually created products don't:
- **Condition grade**: `premium`, `standard`, `low_grade`, `damaged`, or `unsellable`
- **Allocated cost**: the cost per item calculated from the bale total cost ÷ number of saleable items
- **Source bale reference**: the product links back to which bale it came from
- **Item code**: a boutique-specific identifier (different from SKU)
- **Status**: `available`, `sold`, `damaged`, `reserved`, or `archived`

---

### UC: Manage Customers
🟡 **Accurate, but the address model is richer than described.**

The customer record stores the full Philippine address hierarchy:
- Region → Province → City/Municipality → Barangay → Address Line → Postal Code

All levels are stored as both a **code** and a **name** (e.g., `region_code: "XI"` and `region_name: "Davao Region"`), which is consistent with the Philippine Standard Geographic Code (PSGC).

There is also a **walk-in customer** flag — sales can be made to an anonymous walk-in without requiring a customer account.

---

### UC: Bale Breakdown
🟡 **Accurate, but missing the auto-product generation step — this is critical.**

After the breakdown is saved, the system **automatically creates product records** for the saleable items. This happens without any manual input from the user:

1. For each grade (premium, standard), a product record is created
2. The system generates: SKU, barcode number, QR code image, item code
3. The cost per item is calculated automatically: `bale cost ÷ total saleable items`
4. The products immediately appear in the Inventory list, ready to be sold

This automatic product generation is a core system feature that connects Purchasing → Inventory → Sales. It must be described in your manuscript, especially in the system architecture and use case description for Bale Breakdown.

---

### UC: Record Attendance
🟡 **Accurate, but missing valid status options.**

The system supports these attendance statuses (your manuscript may only mention PRESENT/ABSENT):

| Status | Meaning |
|---|---|
| PRESENT | Normal workday, clocked in and out |
| LATE | Clocked in after the scheduled start time |
| HALF_DAY | Worked only half a day |
| ABSENT | Did not report for work |
| ON_LEAVE | Approved leave (paid or unpaid) |
| REST_DAY | Scheduled day off |
| HOLIDAY | National or special holiday |

These statuses are used in payroll computation — for example, LATE attendance deducts minutes from worked hours; ON_LEAVE with paid leave days keeps the pay intact.

---

## PART 3 — EVENTS TABLE

### Events in your manuscript vs. what actually triggers in the system

---

### 🟢 Events That Are Correct

| Event | What triggers it in the system |
|---|---|
| User logs in | Token is issued; activity is logged |
| Product created | Product record saved; audit log entry created |
| Stock added | Inventory transaction record created (type: IN) |
| Stock falls below threshold | Low-stock alert endpoint returns the product |
| Sale completed | Sale record + sale items saved; stock decremented; audit log entry |
| Sale returned | Return record saved; inventory transaction (type: RETURN) created |
| Bale purchase recorded | Bale record saved; audit log entry |
| Bale received | Status updated to RECEIVED; delivery date recorded |
| Bale breakdown saved | Breakdown record saved; products auto-generated immediately |
| Employee added | Employee record + linked user account both created |
| Attendance recorded | Attendance record saved |
| Payroll computed | Payroll run and per-employee results calculated and saved |
| Damaged item recorded | Damaged inventory record created; stock decremented |
| Damaged item repaired | Stock restored; audit log entry |

---

### 🔴 Events in Your Manuscript That Don't Happen in the System

---

#### Event: "System notifies supplier when a Purchase Order is created"
**What the manuscript implies:** When a PO is created, the supplier receives a notification.

**What actually happens:** The system does NOT send any notification to a supplier. There is a `notifications` table in the database, but it only stores notifications for internal system users (employees/admins). There is no email or SMS sent to suppliers. If your manuscript says or implies this, remove it or correct it.

---

#### Event: "System triggers automatic reorder when stock falls below threshold"
**What the manuscript implies:** Falling below the low-stock threshold automatically creates a purchase recommendation or a draft PO.

**What actually happens:** The system has a low-stock *alert endpoint* — meaning it can tell you which products are low — but it does NOT automatically create any purchase order or send any reorder notification. A staff member must manually check the alerts and act on them.

---

#### Event: "Owner approves payroll before it is released"
**What the manuscript implies:** There is a dedicated approval step by the owner.

**What actually happens:** The payroll goes through `finalize` → `release`. Any user with the `payroll.finalize` or `payroll.release` permission can perform these steps. There is no system-enforced requirement that the *owner specifically* must approve. If your manuscript describes an owner approval gate, clarify that this is a permission-based restriction, not a hardcoded approval workflow.

---

## PART 4 — DOMAIN CLASS DIAGRAM

### What needs to change in your diagram

---

### 🔴 MUST FIX — Structural Changes to the Diagram

---

#### Fix 1: Remove `BALE_PURCHASE_ORDER` as a separate class

Your diagram shows `BALE_PURCHASE_RECORD` and `BALE_PURCHASE_ORDER` as two separate boxes connected by an association line.

**The correct picture:**
There is **one class** — `BALE_PURCHASE` — with a `po_status` attribute. That one class handles both the purchase record and the order tracking. There is no separate order table in the database.

If you want to keep the distinction visible in the diagram, show it as a single class with a status enum, not as two separate classes.

---

#### Fix 2: Remove `ORDER_LINE_ITEM` class

Your diagram shows an `ORDER_LINE_ITEM` class with attributes `bale_category`, `quantity`, and `unit_cost`, linked to `BALE_PURCHASE_ORDER`.

**The correct picture:**
This class does not exist in the database. The bale category, quantity, and cost are stored directly on the `BALE_PURCHASE` record itself. One bale purchase = one category. If your diagram implies that one order can have multiple categories as line items, that is not how the system works.

---

#### Fix 3: Rename `PRODUCT_TYPE` to `CATEGORY_TYPE` and fix its relationship

Your diagram likely shows `PRODUCT_TYPE` linked to `PRODUCT`.

**The correct picture:**
- The table is called `category_types` (plural)
- A `CATEGORY` can have many `CATEGORY_TYPES` (e.g., Category = "Tops", Types = "T-Shirt", "Polo", "Blouse")
- `PRODUCT` stores its selected type as a plain text field (`subcategory`) — there is no foreign key from product to category_type

Show this as: `CATEGORY` → (1 to many) → `CATEGORY_TYPE`
And: `PRODUCT` references `CATEGORY_TYPE` by name only (loose reference, not a hard database link)

---

#### Fix 4: Expand `PAYROLL_RECORD` into the full payroll model

Your diagram likely shows `PAYROLL_RECORD` as a single class with basic attributes.

**The correct picture — 7 related classes:**

```
PAYROLL_PROFILE        (per-employee configuration: rates, statutory flags, pay frequency)
    ↓
PAYROLL_PERIOD         (the pay period: dates, frequency, status)
    ↓
PAYROLL_INPUT          (per-employee data for the period: days worked, overtime, leaves)
    ↓
PAYROLL_RUN            (the computed result for the whole period)
    ↓
PAYROLL_RUN_ITEM       (per-employee computed result: gross, deductions, net pay)
    ↓
PAYROLL_ITEM_LINE      (itemized breakdown: basic pay, SSS, PhilHealth, Pag-IBIG, tax)
    ↓
PAYROLL_SETTINGS       (versioned statutory rate tables: BIR tax brackets, SSS tables, etc.)
```

You don't need to show every attribute of every class in the diagram — but you should show these 7 entities and their relationships to demonstrate the actual architecture.

---

### 🟡 SHOULD ADD — Classes Missing from Your Diagram

These tables exist in the database and are actively used, but are absent from your domain class diagram:

| Missing Class | Description | Connects to |
|---|---|---|
| `CATEGORY_TYPE` | Product type options per category | `CATEGORY`, `PRODUCT` |
| `EMPLOYEE_DOCUMENT` | Document record per employee (with status lifecycle) | `EMPLOYEE`, `FILE` |
| `FILE` | Uploaded file metadata | `EMPLOYEE_DOCUMENT` |
| `INVENTORY_ADJUSTMENT` | Inventory correction records | `PRODUCT`, `BALE_PURCHASE` |
| `BALE_SUPPLIER_RETURN` | Returns sent back to supplier | `BALE_PURCHASE`, `SUPPLIER` |
| `NOTIFICATION` | System alerts to internal users | `USER` |
| `AUDIT_LOG` | Activity history for all actions | `USER` |
| `CONFIG` | System settings (e.g., VAT toggle) | — (standalone) |

---

## PART 5 — SYSTEM ARCHITECTURE

### What your manuscript should say about how the system is built

---

### Technology Stack (Verified from codebase)

| Layer | What it uses |
|---|---|
| **Backend (server)** | Node.js with Express framework |
| **Frontend (user interface)** | React with Redux for state management, Vite as the build tool |
| **Database** | MySQL 8 — database name: `cecilles_nstyle_db` |
| **Authentication** | JWT (JSON Web Token) — secure token issued at login, sent with every request |
| **Password storage** | bcrypt hashing — passwords are never stored in plain text |
| **Barcode/QR generation** | jsbarcode and QRCode libraries (runs in the browser) |
| **PDF generation** | jsPDF library (runs in the browser, used for payslips and labels) |

---

### Key Architectural Decisions Worth Mentioning

**1. Role-Based Access Control (RBAC)**
Every API request checks the user's permissions before processing. Permissions follow a `module.action` format (e.g., `sales.create`, `inventory.view`). A wildcard like `sales.*` grants all sales actions at once. `admin.*` grants full system access. Users can have multiple roles, and all permissions from all roles are combined.

**2. Draft Sale System**
The POS does not write a sale to the database until checkout is confirmed. A temporary "draft" holds the work in progress. This prevents partial sales from contaminating records.

**3. Bale-to-Product Auto-Sync**
When a bale breakdown is saved, the system automatically generates individual product records for each grade type. This is the core data pipeline connecting the purchasing module to the inventory and sales modules.

**4. Immutable Payslips**
When payroll is computed, snapshots of the employee's pay configuration and the current statutory rates are saved alongside the results. Even if those rates change later (e.g., SSS contribution table updates), existing payslips always reflect what they were at the time of computation.

**5. Audit Trail**
Every write action (create, update, delete) in every module logs an entry to `audit_logs`. Each entry records who did it, what they did, which record was affected, and when.

---

## PART 6 — DATABASE STRUCTURE

### What your manuscript should say about the database

---

### Complete List of Database Tables (Actual)

**Authentication & Access Control**
- `users` — login credentials, name, active status
- `roles` — role definitions
- `permissions` — individual permission keys
- `role_permissions` — which permissions belong to which role
- `user_roles` — which roles a user has
- `user_permissions` — permissions assigned directly to a user (bypassing roles)

**Products & Categories**
- `products` — all product records (includes bale-linked fields)
- `categories` — product categories
- `category_types` — product type options within each category

**Inventory**
- `inventory_transactions` — every stock movement (IN, OUT, ADJUST, RETURN)
- `inventory_adjustments` — inventory correction records tied to bale or product
- `damaged_inventory` — damaged item records

**Sales**
- `sales` — completed sale headers
- `sale_items` — line items per sale (with product snapshot for historical accuracy)

**Customers**
- `customers` — customer profiles with Philippine address hierarchy

**Suppliers**
- `suppliers` — supplier contact information

**Purchasing (Bale)**
- `bale_purchases` — bale purchase and order records (unified)
- `bale_breakdowns` — breakdown results per bale (grade counts, cost per item)
- `bale_supplier_returns` — return-to-supplier headers
- `bale_supplier_return_items` — return line items

**Employees & HR**
- `employees` — full employee profiles
- `employee_documents` — government and employment documents with status tracking
- `attendance` — daily attendance records
- `files` — uploaded file metadata

**Payroll (7 tables)**
- `payroll_profiles` — per-employee payroll configuration
- `payroll_periods` — pay period definitions
- `payroll_inputs` — per-employee data inputs per period
- `payroll_runs` — computed run summaries
- `payroll_run_items` — per-employee payroll results
- `payroll_item_lines` — itemized earnings and deduction lines
- `payroll_settings_versions` — versioned BIR/SSS/PhilHealth/Pag-IBIG rate tables
- `payrolls` — legacy simple table (no longer actively used)

**System & Configuration**
- `audit_logs` — system-wide activity history
- `notifications` — internal user notifications
- `saved_reports` — saved report filter configurations
- `configs` — system settings key-value store
- `expenses` — expense tracking records
- `api_keys` — external API credentials (not yet fully implemented)
- `webhooks` — event webhook subscriptions (not yet fully implemented)

**Total: 35 tables** (your manuscript may document significantly fewer — add the missing ones)

---

### 🔴 Specific Schema Corrections

**1. `products` table — missing fields from manuscript**
Your manuscript likely only lists the basic fields. The actual table has these additional columns:

| Field | What it stores |
|---|---|
| `condition_grade` | `premium`, `standard`, `low_grade`, `damaged`, or `unsellable` |
| `bale_purchase_id` | Which bale this product came from |
| `item_code` | Boutique-specific item identifier |
| `allocated_cost` | Cost per item from the bale |
| `selling_price` | The displayed selling price |
| `status` | `available`, `sold`, `damaged`, `reserved`, or `archived` |
| `date_encoded` | Date the product was added to the system |

**2. `bale_purchases` table — missing fields from manuscript**
Your manuscript likely shows the basic purchase fields. The actual table also has:

| Field | What it stores |
|---|---|
| `po_number` | Auto-generated number like `BALE-PO-0001` |
| `po_status` | `PENDING`, `ORDERED`, `RECEIVED`, `COMPLETED`, or `CANCELLED` |
| `quantity_ordered` | How many pieces were ordered |
| `quantity_received` | How many pieces were actually received |
| `expected_delivery_date` | When delivery was expected |
| `actual_delivery_date` | When it actually arrived |
| `supplier_id` | Link to the supplier record |

**3. `customers` table — missing address fields**
The `customers` table has been extended with 15+ address columns covering the full Philippine address hierarchy (region, province, city, barangay, all stored as both code and display name). Your manuscript likely shows only basic contact fields.

---

## PART 7 — ISSUES THAT NEED FIXING IN THE SYSTEM (Not Just the Manuscript)

These are actual bugs or design gaps in the code that you should be aware of when writing your recommendation or conclusion sections:

---

### 🔴 Actual System Issues

**Issue 1: Duplicate attendance entries are possible**
The `attendance` database table has no rule preventing two records for the same employee on the same day. If a staff member accidentally records attendance twice for the same employee on the same date, both records will exist. This can cause payroll to be over-counted.
*Recommendation: Add a database-level unique constraint on (employee_id, date).*

**Issue 2: Logout does not truly invalidate the token**
When a user logs out, the system clears their session on the browser — but the server does not "invalidate" the token. If the token was copied before logout, it remains usable until it naturally expires.
*Recommendation: Implement short token expiry (e.g., 15 minutes) with a refresh token system, or maintain a server-side token blocklist.*

**Issue 3: Bale return schema mismatch**
The code file that handles bale supplier returns (`baleReturns.js`) and the actual database table (`bale_supplier_returns`) were written with slightly different structures. The route code expects a `return_number` and `status` column on the table, but the migration that created the table does not include those columns. This is an internal inconsistency that could cause errors.

**Issue 4: Product type (subcategory) is not enforced**
When assigning a product type, the system stores the type name as plain text. There is no database enforcement that the value matches any real entry in the `category_types` table. This means typos or deleted types will not be caught automatically.

---

### 🟡 Minor Gaps (Lower Priority)

**Gap 1: No automatic reorder trigger**
Low-stock alerts work, but they require a user to manually check. The system does not proactively create a purchase recommendation when stock drops below threshold.

**Gap 2: Supplier notification not implemented**
The notification system only works for internal users (employees/admins). Suppliers cannot receive notifications from the system.

**Gap 3: API Keys and Webhooks have database tables but no management interface**
The schema includes tables for external API key management and event webhooks, but no route or UI exists to manage them yet. These are placeholders for future features.

---

## PART 8 — PRIORITY REVISION LIST

Here is the ordered list of what to revise in your manuscript, from most critical to least:

| Priority | What to Fix | Where in Manuscript |
|---|---|---|
| 🔴 1 | Remove `BALE_PURCHASE_ORDER` as a separate domain class; merge with `BALE_PURCHASE` | Domain Class Diagram |
| 🔴 2 | Remove `ORDER_LINE_ITEM` class; its fields belong on `BALE_PURCHASE` directly | Domain Class Diagram |
| 🔴 3 | Rename `PRODUCT_TYPE` to `CATEGORY_TYPE` and fix its relationship to `CATEGORY` | Domain Class Diagram |
| 🔴 4 | Expand `PAYROLL_RECORD` to show all 7 payroll tables and their relationships | Domain Class Diagram |
| 🔴 5 | Rewrite Payroll use case to include all 6 lifecycle stages | Use Case Descriptions |
| 🔴 6 | Rewrite POS use case to describe the draft-sale pattern and barcode scanner support | Use Case Descriptions |
| 🔴 7 | Add bale breakdown auto-product generation to the Bale Breakdown use case | Use Case Descriptions |
| 🔴 8 | Add employee document lifecycle (NOT SUBMITTED → VERIFIED/REJECTED/EXPIRED) | Use Case Descriptions |
| 🔴 9 | Remove or correct the "system notifies supplier" event — it is not implemented | Events Table |
| 🔴 10 | Correct "automatic reorder" event — the system only alerts, it doesn't auto-order | Events Table |
| 🟡 11 | Add `CATEGORY_TYPE`, `EMPLOYEE_DOCUMENT`, `FILE`, `INVENTORY_ADJUSTMENT` classes | Domain Class Diagram |
| 🟡 12 | Add missing product fields to the `PRODUCT` class in the diagram | Domain Class Diagram |
| 🟡 13 | Add missing bale purchase fields (PO number, status, delivery dates) | Domain Class Diagram |
| 🟡 14 | Add all 35 database tables to the database structure section | Database Structure Section |
| 🟡 15 | Add Expenses, Notifications, File Management use cases | Use Case List |
| 🟡 16 | Add the 7 payroll tables to the database structure section | Database Structure Section |
| 🟡 17 | Add attendance status types (LATE, HALF_DAY, ON_LEAVE, REST_DAY, HOLIDAY) | Attendance Use Case |
| 🟡 18 | Add the wildcard permission model explanation to the RBAC description | Roles Use Case |
| 🟡 19 | Note the duplicate attendance entry gap as a known system limitation | Limitations / Recommendations |
| 🟡 20 | Note the token logout security gap as a known system limitation | Limitations / Recommendations |

---

*End of Revision Guide*
*This guide was generated by cross-referencing every route file, controller, migration, and frontend page in the codebase against the manuscript content.*
