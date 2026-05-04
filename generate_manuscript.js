const {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  AlignmentType, Table, TableRow, TableCell, WidthType,
  BorderStyle, ShadingType, convertInchesToTwip,
  UnderlineType, PageBreak, LevelFormat
} = require('docx')
const fs = require('fs')

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function border() {
  return { top: { style: BorderStyle.SINGLE, size: 1 }, bottom: { style: BorderStyle.SINGLE, size: 1 }, left: { style: BorderStyle.SINGLE, size: 1 }, right: { style: BorderStyle.SINGLE, size: 1 } }
}
function h1(text) { return new Paragraph({ text, heading: HeadingLevel.HEADING_1, spacing: { before: 400, after: 200 } }) }
function h2(text) { return new Paragraph({ text, heading: HeadingLevel.HEADING_2, spacing: { before: 300, after: 160 } }) }
function h3(text) { return new Paragraph({ text, heading: HeadingLevel.HEADING_3, spacing: { before: 240, after: 120 } }) }
function body(text) { return new Paragraph({ children: [new TextRun({ text, size: 24, font: 'Times New Roman' })], spacing: { before: 80, after: 80, line: 360 }, alignment: AlignmentType.JUSTIFIED }) }
function bullet(text, level = 0) { return new Paragraph({ children: [new TextRun({ text, size: 24, font: 'Times New Roman' })], bullet: { level }, spacing: { before: 60, after: 60, line: 320 } }) }
function emptyLine() { return new Paragraph({ text: '', spacing: { before: 60, after: 60 } }) }
function pageBreak() { return new Paragraph({ children: [new PageBreak()] }) }
function centeredBold(text, size = 28) { return new Paragraph({ children: [new TextRun({ text, bold: true, size, font: 'Times New Roman' })], alignment: AlignmentType.CENTER, spacing: { before: 120, after: 120 } }) }
function centered(text, size = 24) { return new Paragraph({ children: [new TextRun({ text, size, font: 'Times New Roman' })], alignment: AlignmentType.CENTER, spacing: { before: 80, after: 80 } }) }
function label(text) { return new Paragraph({ children: [new TextRun({ text, bold: true, underline: { type: UnderlineType.SINGLE }, size: 24, font: 'Times New Roman' })], spacing: { before: 180, after: 80 } }) }
function note(text) { return new Paragraph({ children: [new TextRun({ text, size: 22, italics: true, font: 'Times New Roman', color: '555555' })], spacing: { before: 60, after: 60 }, alignment: AlignmentType.JUSTIFIED }) }
function critical(text) { return new Paragraph({ children: [new TextRun({ text: '⚑ ' + text, bold: true, size: 23, font: 'Times New Roman', color: 'C0392B' })], spacing: { before: 80, after: 80 } }) }
function incomplete(text) { return new Paragraph({ children: [new TextRun({ text: '+ ' + text, size: 23, font: 'Times New Roman', color: '1A5276' })], spacing: { before: 60, after: 60 } }) }
function verified(text) { return new Paragraph({ children: [new TextRun({ text: '✓ ' + text, size: 23, font: 'Times New Roman', color: '1E8449' })], spacing: { before: 60, after: 60 } }) }

function makeTable(headers, rows, colWidths) {
  const headerRow = new TableRow({
    children: headers.map((h, i) => new TableCell({
      children: [new Paragraph({ children: [new TextRun({ text: h, bold: true, size: 20, font: 'Times New Roman', color: 'FFFFFF' })], alignment: AlignmentType.CENTER, spacing: { before: 60, after: 60 } })],
      width: colWidths ? { size: colWidths[i], type: WidthType.PERCENTAGE } : undefined,
      shading: { type: ShadingType.CLEAR, fill: '1F3864' }, borders: border()
    })), tableHeader: true
  })
  const dataRows = rows.map((row, ri) => new TableRow({
    children: row.map((cell, ci) => new TableCell({
      children: [new Paragraph({ children: [new TextRun({ text: String(cell ?? ''), size: 20, font: 'Times New Roman' })], spacing: { before: 40, after: 40 } })],
      width: colWidths ? { size: colWidths[ci], type: WidthType.PERCENTAGE } : undefined,
      shading: { type: ShadingType.CLEAR, fill: ri % 2 === 0 ? 'F2F3F4' : 'FFFFFF' }, borders: border()
    }))
  }))
  return new Table({ rows: [headerRow, ...dataRows], width: { size: 100, type: WidthType.PERCENTAGE } })
}

// ─── LEGEND BLOCK ─────────────────────────────────────────────────────────────
function legendBlock() {
  return [
    emptyLine(),
    new Paragraph({ children: [new TextRun({ text: 'HOW TO READ THIS DOCUMENT:', bold: true, size: 22, font: 'Times New Roman' })], spacing: { before: 80, after: 40 } }),
    new Paragraph({ children: [new TextRun({ text: '⚑ RED  =  FACTUALLY WRONG — must be corrected before submission', bold: true, size: 22, font: 'Times New Roman', color: 'C0392B' })], spacing: { before: 40, after: 40 } }),
    new Paragraph({ children: [new TextRun({ text: '+  BLUE  =  INCOMPLETE — information is missing, needs to be added', bold: true, size: 22, font: 'Times New Roman', color: '1A5276' })], spacing: { before: 40, after: 40 } }),
    new Paragraph({ children: [new TextRun({ text: '✓  GREEN  =  CORRECT — leave as-is', bold: true, size: 22, font: 'Times New Roman', color: '1E8449' })], spacing: { before: 40, after: 60 } }),
    emptyLine()
  ]
}

const children = []

// ══════════════════════════════════════════════════════
// COVER PAGE
// ══════════════════════════════════════════════════════
children.push(
  emptyLine(), emptyLine(), emptyLine(),
  centeredBold("CECILLE'S N'STYLE BOUTIQUE MANAGEMENT SYSTEM", 32),
  emptyLine(),
  centeredBold("Complete Manuscript Revision Document", 26),
  centeredBold("What Must Change vs. What Is Correct", 24),
  emptyLine(), emptyLine(),
  centered("Based on full codebase analysis of c:/Users/acer/SIA", 22),
  centered("Cross-referenced against the submitted manuscript PDF", 22),
  emptyLine(), emptyLine(),
  centeredBold("Ilanga · Palanca · Sintos", 24),
  centered("Ateneo de Davao University", 22),
  centered("System Integration and Architecture 2 | S.Y. 2025–2026, 2nd Semester", 22),
  emptyLine(), emptyLine(),
  centered("Analysis Date: April 29, 2026", 22),
  emptyLine(),
  ...legendBlock(),
  pageBreak()
)

// ══════════════════════════════════════════════════════
// SECTION 1 — INTRODUCTION
// ══════════════════════════════════════════════════════
children.push(
  h1("SECTION 1 — INTRODUCTION"),
  body("The Introduction section covers pages 3–4 of the manuscript. The organizational background, current business process, and identified problems are largely accurate. Minimal changes are required here."),
  emptyLine(),

  h2("1.1 The Organization"),
  verified("Accurate. Cecille B. Ilanga as owner/representative. Davao City location. No changes needed."),
  emptyLine(),

  h2("1.2 Organization Brief Description"),
  verified("Accurate. Owner/Manager at top, sales clerks below. Manual operations described correctly."),
  emptyLine(),

  h2("1.3 Current Business Process"),
  verified("All four bullet points (Sales/Checkout, Inventory/Bale Management, Employee Access, Supplier/Bale Purchasing) are accurate background context."),
  emptyLine(),

  h2("1.4 Identified Problems"),
  verified("Problems 1–6 are accurate and all are addressed by the implemented system."),
  incomplete("SHOULD ADD — Problem 7: Payroll was described in the manuscript as a 'planned expansion.' The system is now fully implemented with BIR-compliant statutory deductions. Add a sentence stating payroll was completed."),
  emptyLine(),

  h2("Section 2: Proposed System — Introduction Paragraph"),
  body("Current text: 'The system focuses on Inventory Management, POS, Supplier Management, and Advanced RBAC.'"),
  critical("MUST UPDATE — The system now includes 12 fully implemented modules: Inventory, POS, Purchasing (Bale), Supplier, Customer, Employee/HR, Attendance, Payroll, Expenses, Ledger, Notifications, and Reports. Update the opening paragraph of Section 2 to reflect the complete scope."),
  pageBreak()
)

// ══════════════════════════════════════════════════════
// SECTION 2.1 — EVENTS TABLE (DETAILED)
// ══════════════════════════════════════════════════════
children.push(
  h1("SECTION 2.1 — EVENTS TABLE (DETAILED CORRECTIONS)"),
  body("The Events Table is one of the most critically reviewed sections. Below is a row-by-row assessment of every event in each subsystem table."),
  ...legendBlock(),
  emptyLine(),

  h2("2.1.1 User and Role Management System Events"),
  emptyLine(),
  makeTable(
    ['Event in Manuscript', 'Status', 'What Code Actually Does / Correction'],
    [
      ['Manage Custom Roles', 'CORRECT ✓', 'Role CRUD is fully implemented. Roles can be created, named, described, and assigned permissions.'],
      ['Profile Creation (Step 1): New employee hired → Admin creates profile', 'INCOMPLETE +', 'CORRECTION: Creating an employee automatically creates a linked USER account in the same database transaction (employees.js:77). It is not two manual steps — the user account is auto-generated with the employee email as username and a default bcrypt-hashed password. Update this row.'],
      ['Document Setup (Step 2): Employee submits files → Admin uploads PSA, IDs, TIN, SSS', 'INCOMPLETE +', 'CORRECTION: Documents go through a 5-status lifecycle: NOT_SUBMITTED → SUBMITTED → VERIFIED (or REJECTED or EXPIRED). Each document tracks: document_number, issuing_agency, issue_date, expiry_date, verified_by, verified_at, and remarks. The table shows only the upload step — the verification workflow is missing.'],
      ['Role Assignment: Profile complete → Assign Role → User inherits role access', 'INCORRECT ⚑', 'CORRECTION 1: Users can have MULTIPLE roles simultaneously (user_roles is many-to-many). CORRECTION 2: Users can also have direct permissions via user_permissions, independent of any role. CORRECTION 3: The system uses wildcard permissions (admin.* = everything, sales.* = all sales actions). The manuscript implies one role, simple inheritance.'],
      ['Profile Modification: Employee details change → Update/Delete/View Profile', 'CORRECT ✓', 'Accurate. PUT /employees/:id syncs changes to both employees and users tables.'],
    ],
    [22, 12, 66]
  ),
  emptyLine(),
  incomplete("ADD NEW ROW — Login Event: Actor: User | Trigger: POST /auth/login | Response: System verifies password (bcrypt + legacy pbkdf2_sha512), checks is_active = 1, issues 8-hour JWT token. Failed logins are logged as AUTH_LOGIN_FAILED (severity: HIGH) in audit_logs. Inactive account attempts logged as AUTH_LOGIN_BLOCKED (severity: HIGH)."),
  incomplete("ADD NEW ROW — Logout Event: Actor: User | Trigger: Client-side only (no server endpoint) | Response: Client clears stored token. Token remains valid on server until 8-hour expiry. NOTE: This is a known system limitation — no server-side invalidation."),
  emptyLine(),

  h2("2.1.2 Inventory Management System Events"),
  emptyLine(),
  makeTable(
    ['Event in Manuscript', 'Status', 'Correction'],
    [
      ['Add New Supplier', 'CORRECT ✓', 'Saves supplier contact and details to suppliers table.'],
      ['Update Supplier', 'CORRECT ✓', 'Updates supplier record.'],
      ['Input new product', 'INCOMPLETE +', 'Accurate for manually created products. MISSING: Products can also be AUTO-GENERATED from bale breakdowns (product_source = bale_breakdown) — no manual input needed for those. Mention both paths.'],
      ['Generate Barcode', 'INCOMPLETE +', 'Barcode generation is CLIENT-SIDE using jsbarcode library in the browser (Inventory.js). Barcodes are also auto-assigned sequentially when products are auto-created from bale breakdowns. Destination should say "Browser / PDF" not "Printer / Database."'],
      ['Create Bale Purchase Order: Need to order bulk clothes → Create new Bale P.O. → Saves Bale Purchase Order to Bale Records DB', 'INCORRECT ⚑', 'CORRECTION: The Bale Purchase Order and Bale Purchase Record are stored in the SAME TABLE (bale_purchases). There is no separate Bale Records DB — it is the same inventory/purchasing database. The po_number is auto-generated as BALE-PO-0001, BALE-PO-0002, etc. The record starts with po_status = PENDING.'],
      ['Record Bale Delivery / Breakdown: Delivery arrives → Process bale breakdown → Updates individual product stock levels and closes P.O.', 'INCORRECT ⚑', 'MAJOR CORRECTION: The actual system does much more than described: (1) Saves bale_breakdowns record with premium_items, standard_items, low_grade_items, damaged_items counts. (2) AUTO-GENERATES one product record for Premium grade and one for Standard grade — including auto-assigning sequential SKU, barcode number, and QR code image. (3) Calculates allocated_cost = bale_cost ÷ saleable_items per product. (4) Creates an IN inventory_transaction for each product. (5) Low_grade and damaged items are counted but do NOT auto-generate products. (6) The P.O. does NOT automatically close — po_status must be manually updated.'],
      ['Input manual stock (Stock In)', 'CORRECT ✓', 'Creates inventory_transaction of type IN. Adds quantity to inventory.'],
      ['Record return: Returned item from customer → Process return → Restocks item', 'CORRECT ✓', 'Accurate. Creates RETURN inventory_transaction. If item is damaged, also creates damaged_inventory record with damage_source = sales_return.'],
      ['Record damages: Defective item found → Record damaged stock → Deducts from available stock', 'INCOMPLETE +', 'Accurate but missing: The system tracks THREE damage sources: (1) bale_breakdown — found during sorting, (2) manual_damage — discovered on floor, (3) sales_return — customer returned damaged item. Both damaged_inventory and inventory_adjustments records are written on each damage event.'],
      ['Record stock adjustment (Shrinkage)', 'CORRECT ✓', 'Updates discrepancy record and adjusts stock.'],
      ['Update product details', 'CORRECT ✓', 'Updates product record.'],
      ['Low stock alert: Product drops below threshold → System generates alert → Notifies Manager', 'INCORRECT ⚑', 'CRITICAL CORRECTION: The system does NOT automatically notify the manager when stock falls below threshold. There is an ENDPOINT (GET /inventory/alerts/low-stock) that returns a list of low-stock products when queried — but it is informational only. No notification is sent, no event is triggered, no push alert is created automatically. Change Response from "Notifies Manager" to "Returns list of products where stock_quantity ≤ low_stock_threshold when endpoint is queried."'],
      ['Check inventory status', 'CORRECT ✓', 'Displays inventory summary.'],
    ],
    [22, 12, 66]
  ),
  emptyLine(),

  h2("2.1.3 Sales Management System (POS) Events"),
  emptyLine(),
  makeTable(
    ['Event in Manuscript', 'Status', 'Correction'],
    [
      ['Scan / Input Item to Cart: Customer brings items → Add item to cart → Retrieves item details & price → POS Interface', 'INCORRECT ⚑', 'MAJOR CORRECTION: The POS uses a DRAFT SALE system, not a simple cart. When a cashier opens the POS, the system first creates a DRAFT record in the sales table (status = DRAFT, sale_number = DRF-XXXXX). Items are added to this draft via POST /sales/:id/items — stock is NOT yet deducted at this point. The scanner input goes through a multi-format normalizer that handles: plain barcode, URL-encoded scan, JSON-wrapped input, and key=value format. Update the event to reflect: "Creates DRAFT sale if none exists → Adds item to DRAFT sale_items."'],
      ['Clear Order: Customer cancels → Clear current cart → Empties POS cart', 'INCOMPLETE +', 'In the system, clearing the draft DELETES the DRAFT sales record entirely (DELETE /sales/:id). This removes the DRAFT from the database, not just from the screen. Update Response to: "Deletes DRAFT sale record from database."'],
      ['Review Order Details: Cashier verifies items → View order details → Displays total with VAT, discounts', 'CORRECT ✓', 'Accurate. VAT calculation uses system config setting (vat_inclusive toggle from configs table).'],
      ['Process Payment (Generate Transaction): Customer provides payment → Record payment → Finalizes transaction, saves sales record, deducts items from inventory', 'INCOMPLETE +', 'Partially accurate but missing the DRAFT → COMPLETED transition: (1) Cashier clicks Checkout on the DRAFT. (2) System converts DRAFT → COMPLETED. (3) receipt_no is assigned. (4) Snapshots of product_name, sku, brand, barcode, size, color, unit_price are stored in sale_items for permanent record. (5) Stock is deducted for each item. (6) sale_number is updated from DRF- format to SAL- format. Add these steps.'],
      ['Print Receipt: Transaction completed → System/Cashier prints receipt → Generates physical receipt', 'INCOMPLETE +', 'The system generates a receipt_no and receipt data in the database. The actual printing is client-side via the browser — jsPDF or the browser print dialog. The receipt is not physically printed by the server. Update Destination to "Browser (client-side PDF/print)" rather than "Customer / Printer."'],
      ['Process Return (Load Receipt): Customer returns item → Process Sales Return → Loads transaction via receipt, updates sales record, flags returned item', 'CORRECT ✓', 'Accurate. Process: scan/enter receipt → load original sale → input return quantities → system restores stock via RETURN inventory_transaction.'],
      ['View Sales & Transactions', 'CORRECT ✓', 'Displays sales metrics and transaction history.'],
    ],
    [22, 12, 66]
  ),
  emptyLine(),

  h2("2.1.4 Purchasing Management System Events"),
  emptyLine(),
  makeTable(
    ['Event in Manuscript', 'Status', 'Correction'],
    [
      ['Order Creation: Need to order bulk items → Manager creates Purchase Order → Inputs bale quantity, cost, supplier details → Purchasing DB', 'INCOMPLETE +', 'Accurate but missing: (1) System auto-generates PO number in BALE-PO-XXXX format. (2) Record starts with po_status = PENDING. (3) Records also include: expected_delivery_date, payment_status (UNPAID by default). (4) The Purchasing DB is actually the same database — cecilles_nstyle_db — not a separate database.'],
      ['Bale Processing: Received bale is opened → Manager processes bale breakdown → Inputs total pieces, sorts to categories, logs damage → Inventory DB', 'INCORRECT ⚑', 'MAJOR CORRECTION — The breakdown triggers automatic product generation not described here: (1) Staff enters: total_pieces, premium_items, standard_items, low_grade_items, damaged_items. (2) System calculates: saleable_items = total_pieces - damaged_items; cost_per_saleable_item = bale_cost ÷ saleable_items. (3) System AUTO-CREATES one product record for Premium grade and one for Standard grade. Each product gets: auto-assigned SKU, auto-assigned sequential barcode, auto-generated QR code image, allocated_cost = cost_per_saleable_item, name = "{batchNo} - Premium/Standard". (4) Low_grade and damaged items are recorded as counts ONLY — no products are auto-created for them. (5) Each auto-created product gets 1 unit of stock via IN inventory_transaction.'],
      ['Return Processing: Bale is defective → Process Supplier Return → Inputs return details and links to supplier → Purchasing DB', 'INCORRECT ⚑', 'KNOWN BUG: The bale supplier return feature has a schema mismatch. The route file (baleReturns.js) queries a table called bale_returns but no database migration creates this table. The migration creates bale_supplier_returns (different name, different structure). This feature will throw a runtime error. Note this as a known system limitation.'],
      ['History Review: Manager audits past orders → View Purchase History / Manage Orders → Displays past purchase records → Dashboard', 'CORRECT ✓', 'Accurate.'],
    ],
    [22, 12, 66]
  ),
  emptyLine(),

  h2("2.1.5 Payroll Management System Events"),
  emptyLine(),
  makeTable(
    ['Event in Manuscript', 'Status', 'Correction'],
    [
      ['Manage Profiles: HR needs to setup payroll info → Manage Payroll Profiles → Inputs payroll details → Payroll Database', 'INCOMPLETE +', 'Accurate but payroll profile contains more than the manuscript implies: pay_basis (monthly/daily/hourly), payroll_frequency (weekly/semi_monthly/monthly), standard_work_days_per_month, standard_hours_per_day, individual statutory flags (sss_enabled, philhealth_enabled, pagibig_enabled, tax_enabled), overtime_eligible, payroll_method (cash/bank_transfer/ewallet), and bank details.'],
      ['Initiate Payroll Run: New cutoff period begins → Create Payroll Period → Sets start/end dates and frequency → Payroll Database', 'CORRECT ✓', 'Accurate. Period is created with status = draft.'],
      ['Attendance Logging: Daily employee shifts → Record Attendance → Logs time-in and time-out → Attendance Database', 'INCOMPLETE +', 'Accurate but missing: The system also AUTO-COMPUTES late_minutes, undertime_minutes, overtime_minutes by comparing clock_in/clock_out against expected_in/expected_out. These computed values are what feed into payroll inputs during sync. Valid attendance statuses: PRESENT, LATE, HALF_DAY, ABSENT, ON_LEAVE, REST_DAY, HOLIDAY.'],
      ['Execute Payroll Process: Cutoff is reached → Process Payroll → Syncs attendance, loads profiles, computes deductions → Payroll Database', 'INCORRECT ⚑', 'MAJOR CORRECTION: This is not one step. The payroll has a 6-STAGE LIFECYCLE: (1) DRAFT — period created. (2) Inputs loaded — attendance synced to payroll_inputs via syncAttendanceToInputs service. (3) COMPUTED — computePayrollRun creates payroll_runs + payroll_run_items. Statutory deductions computed per BIR RR 11-2018: SSS (5% employee / 10% employer), PhilHealth (5% split 50/50), Pag-IBIG (2%/2%), Withholding Tax (BIR brackets). Immutable snapshots stored. (4) FINALIZED — locked. (5) RELEASED — disbursed. (6) VOID — cancelled.'],
      ['Manual Adjustments: Employee has bonuses/deductions → Edit Inputs → Adjusts days, OT, bonuses manually → Payroll Database', 'INCOMPLETE +', 'Accurate but missing adjustable fields: overtime_hours, night_differential_minutes, late_minutes, absent_days, regular_holiday_days, special_holiday_days, rest_day_days, paid_leave_days, unpaid_leave_days, manual_bonus, manual_commission, manual_allowance, loan_deduction, manual_deduction.'],
      ['Finalize Payroll: Computation is approved → Preview & Release Payslips → Generates physical or digital payslips → Employee / Reports', 'INCORRECT ⚑', 'CORRECTION: "Finalize" and "Release" are TWO SEPARATE stages — not one. Finalize = lock for review (status: finalized). Release = mark as disbursed (status: released). There is also a Void option (status: void). "Approved" implies an owner-specific approval gate — there is none. The permission system controls who can finalize (payroll.finalize permission). Payslips are NOT physically generated by the server — the payslip data is stored in payroll_run_items and payroll_item_lines; PDF rendering is client-side.'],
      ['View Reports', 'CORRECT ✓', 'Displays historical payroll data.'],
    ],
    [22, 12, 66]
  ),
  emptyLine(),

  h2("2.1.6 Supplier Management System Events"),
  verified("All three events (Supplier Profiling, View Directory, Supplier Selection) are accurate. No changes needed."),
  emptyLine(),

  h2("2.1.7 Category and Type Management System Events"),
  makeTable(
    ['Event in Manuscript', 'Status', 'Correction'],
    [
      ['Category Maintenance', 'CORRECT ✓', 'Accurate.'],
      ['Type Creation/Update', 'INCOMPLETE +', 'Accurate but note: In the database, the table is named category_types (not PRODUCT_TYPE). Product type is stored in products.subcategory as a text field — validated against category_types at the application layer, but no database-level foreign key enforces this.'],
      ['Link Classification: New product being added → Link Product Type to Product Records → Assigns correct category/type to item → Inventory Database', 'INCOMPLETE +', 'Accurate but clarify: The "link" is a text value stored in products.subcategory. If a category_type is later deleted, existing products are NOT updated (no cascade). The link is enforced via API validation only.'],
    ],
    [22, 12, 66]
  ),
  emptyLine(),

  h2("2.1.8 Customer Management System Events"),
  makeTable(
    ['Event in Manuscript', 'Status', 'Correction'],
    [
      ['Profile Management', 'CORRECT ✓', 'Accurate.'],
      ['Profile Inquiry', 'CORRECT ✓', 'Displays customer details and purchase history.'],
      ['Transaction Linking: Customer checking out at POS → Link Customer to Sale → Searches customer record and associates with sale', 'INCOMPLETE +', 'Accurate but add: (1) All sales start with Walk-In Customer as the default. (2) Customer can be attached to the DRAFT sale at any time before checkout. (3) Walk-in sales can be retrospectively matched to customer profiles using name + phone matching logic (MATCH_SALE_TO_CUSTOMER_SQL).'],
    ],
    [22, 12, 66]
  ),
  emptyLine(),

  incomplete("ADD MISSING EVENTS TABLES: The manuscript is missing entire events tables for these implemented modules:"),
  incomplete("• Authentication Events Table (Login, Logout, Failed Login, Blocked Login)"),
  incomplete("• Expense Management Events Table (Record Expense, Approve/Reject Expense)"),
  incomplete("• Ledger Management Events Table (Create/Update/Delete Ledger Entry)"),
  incomplete("• Notification Events Table (Receive Notification, Mark as Read)"),
  incomplete("• System Settings Events Table (Update Config — e.g., VAT toggle)"),
  incomplete("• Audit Log Events Table (View Activity History)"),
  pageBreak()
)

// ══════════════════════════════════════════════════════
// SECTION 2.2 — USE CASE LIST
// ══════════════════════════════════════════════════════
children.push(
  h1("SECTION 2.2 — USE CASE LIST (CORRECTIONS)"),
  emptyLine(),

  h2("2.2.1 User and Role Management System"),
  verified("Create, Update, View user/employee profile ✓"),
  verified("Assign role and permissions ✓"),
  verified("Manage employee documents ✓"),
  verified("Track employee status ✓"),
  verified("Authenticate user login ✓"),
  verified("Restrict access based on user role ✓"),
  critical("REMOVE — 'Employee profile creation' implies it is separate from user account creation. In the code, creating an employee (POST /employees) AUTOMATICALLY creates the linked user account in a single database transaction. Clarify this as one operation."),
  incomplete("ADD — 'Auto-create user login account when employee is created (single transaction)'"),
  incomplete("ADD — 'Verify submitted employee document (NOT_SUBMITTED → SUBMITTED → VERIFIED/REJECTED/EXPIRED)'"),
  incomplete("ADD — 'Change Password' (POST /auth/change-password — fully implemented)"),
  incomplete("ADD — 'Forgot Password' (POST /auth/forgot-password — fully implemented)"),
  incomplete("ADD — 'Deactivate/Reactivate user account' — setting is_active = 0 blocks future logins"),
  emptyLine(),

  h2("2.2.2 Inventory Management System"),
  verified("All view, stock-in, stock-out, damage, repair, shrinkage, barcode generation use cases ✓"),
  critical("CLARIFY — 'Create product from bale record' — this is AUTOMATIC, not manual. When a bale breakdown is saved, the system auto-creates products for Premium and Standard grades without any user action. Rewrite as: 'System auto-creates product records upon saving bale breakdown (Premium and Standard grades only)'"),
  critical("CLARIFY — 'Automatically identify product category from selected bale record' — Accurate but clarify: The bale_category field on bale_purchases is used to auto-match or auto-create a category in the categories table via deriveCategoryAndTypeFromBaleCategory() utility."),
  incomplete("ADD — 'View bale-linked products (auto-generated from breakdown)'"),
  incomplete("ADD — 'Track three damage source types: bale_breakdown, manual_damage, sales_return'"),
  emptyLine(),

  h2("2.2.3 Sales Management System"),
  verified("Search product, scan barcode/QR, compute totals, accept payment, print receipt, deduct inventory, record transaction, view reports ✓"),
  critical("REWRITE — 'Add product to sales cart' → Should be: 'Add product to DRAFT sale' — the system uses a draft sale pattern, not a simple cart."),
  critical("REWRITE — 'Complete sale transaction' → Should be: 'Checkout draft sale (converts DRAFT → COMPLETED, assigns receipt_no, deducts stock, stores product snapshots in sale_items)'"),
  incomplete("ADD — 'Create draft sale session (system auto-creates DRAFT on POS open)'"),
  incomplete("ADD — 'Cancel / delete draft sale (permanently removes DRAFT record)'"),
  incomplete("ADD — 'Attach customer to active DRAFT sale at any point before checkout'"),
  incomplete("ADD — 'Override item price (requires sales.edit permission)'"),
  emptyLine(),

  h2("2.2.4 Purchasing Management System"),
  verified("Auto-generate purchase order number ✓"),
  verified("Select supplier, input cost and category, view bale purchase orders, receive bales, create breakdown, record quantities ✓"),
  critical("REMOVE — 'Add multiple order lines in one purchase order' — This DOES NOT EXIST in the code. There is no ORDER_LINE_ITEM table. One bale_purchases record = one category. To order multiple categories, multiple separate records must be created."),
  critical("REWRITE — 'Create bale purchase order' and 'Create bale purchase record' as a SINGLE item — they are the same entity (bale_purchases table). State: 'Create bale purchase record / purchase order (unified — po_status tracks workflow: PENDING → ORDERED → RECEIVED → COMPLETED → CANCELLED)'"),
  critical("REWRITE — 'Record premium, standard, and damaged quantities' → Should say: 'Record premium, standard, low_grade, and damaged quantities. System auto-creates product records for premium and standard grades only.'"),
  incomplete("ADD — 'System auto-calculates allocated_cost per product (bale_cost ÷ saleable_items)'"),
  incomplete("ADD — 'System auto-assigns sequential SKU, barcode, and QR code to generated products'"),
  incomplete("NOTE — Bale Supplier Returns are listed but have a known schema bug — note as partial/incomplete feature"),
  emptyLine(),

  h2("2.2.5 Payroll Management System"),
  critical("REWRITE — Payroll is NOT a 'planned expansion.' It is fully implemented with BIR-compliant statutory deductions. Remove the qualifier 'planned expansion.'"),
  verified("Create payroll period ✓"),
  verified("Record attendance and leaves ✓"),
  verified("Record deductions and allowances ✓"),
  verified("Compute salary based on attendance and payroll rules ✓"),
  verified("Generate payslip, Generate payroll report ✓"),
  critical("REMOVE — 'Record cash advances' as a standalone use case — in code this is the loan_deduction field in payroll_inputs, not a separate cash advance module."),
  critical("REWRITE — 'Compute salary' → Add: 'Compute salary with Philippine statutory deductions: SSS (employee 5% / employer 10%), PhilHealth (5% split 50/50), Pag-IBIG (2%/2%), Withholding Tax per BIR RR 11-2018 Annex E (2023 onwards)'"),
  incomplete("ADD — 'Finalize payroll run (locks for editing, status: finalized)'"),
  incomplete("ADD — 'Release payroll (mark as disbursed, status: released)'"),
  incomplete("ADD — 'Void payroll run (cancel, status: void)'"),
  incomplete("ADD — 'Sync attendance data to payroll inputs (auto-pull from attendance records)'"),
  incomplete("ADD — 'View employee payslip (employee can view own payslip)'"),
  incomplete("ADD — 'Store immutable computation snapshots (profile, inputs, settings frozen at compute time)'"),
  emptyLine(),

  h2("2.2.6 Supplier Management System"),
  verified("All supplier use cases are accurate. No changes needed."),
  emptyLine(),

  h2("2.2.7 Category and Type Management System"),
  verified("All category and type use cases are accurate."),
  incomplete("ADD — 'Category type validation: when a product is created in a category that has types configured, selecting a type is required (enforced at API layer)'"),
  emptyLine(),

  h2("2.2.8 Customer Management System"),
  verified("All customer use cases are accurate."),
  incomplete("ADD — 'Walk-in customer support — all sales default to Walk-In Customer when no account is linked'"),
  incomplete("ADD — 'Retrospective customer matching — walk-in sales can be matched to a registered customer via name + phone'"),
  incomplete("ADD — 'Customer record includes full Philippine address hierarchy: Region → Province → City → Barangay (PSGC codes)'"),
  emptyLine(),

  incomplete("ADD MISSING USE CASE SECTIONS — The following modules are fully implemented but have NO use case section in the manuscript:"),
  incomplete("• 2.2.9 Expense Management: Record expense, Approve/Reject expense, View expense report"),
  incomplete("• 2.2.10 Ledger Module: Create/Edit/Delete manual ledger entry, Filter by account_code and date"),
  incomplete("• 2.2.11 Notification System: View notifications, Mark notification as read"),
  incomplete("• 2.2.12 System Settings: Toggle VAT inclusive/exclusive, Update business name, currency, system config"),
  incomplete("• 2.2.13 Audit Log: View all system activity, Filter by module/action/severity/user, Export CSV/PDF"),
  incomplete("• 2.2.14 File Management: Upload files, Link files to employee documents"),
  pageBreak()
)

// ══════════════════════════════════════════════════════
// SECTION 2.3 — USE CASE DIAGRAMS
// ══════════════════════════════════════════════════════
children.push(
  h1("SECTION 2.3 — USE CASE DIAGRAMS (CORRECTIONS)"),
  body("The use case diagrams cannot be directly edited in this document, but the following corrections must be applied when redrawing them."),
  emptyLine(),

  h2("2.3.1 RBAC Diagram — Corrections"),
  verified("Actors shown correctly (Store Owner / Admin). Main use cases shown correctly."),
  critical("CORRECTION — 'Create Employee/User Profile (Step 1 Profile Setup)' with separate includes for Account Details, Employment Details, etc.: The diagram implies the user account is a separate step. In code, ONE action (POST /employees) creates BOTH the employee record and the user account in a single database transaction. Redraw as one use case: 'Create Employee Profile (auto-generates login account).'"),
  critical("CORRECTION — 'Assign Role': The diagram shows role assignment as a post-creation step. In code, the role is assigned during the same employee creation call if a role name is provided. Also: a user can have MULTIPLE roles (user_roles is many-to-many). The diagram should show this."),
  incomplete("ADD — 'Verify Employee Document' use case (HR action, document status lifecycle)"),
  incomplete("ADD — 'Deactivate User Account' use case"),
  incomplete("ADD — 'Login' use case with alternative flow for failed login and inactive account"),
  emptyLine(),

  h2("2.3.2 Inventory Management System Diagram — Corrections"),
  verified("Most use cases shown correctly."),
  critical("CORRECTION — 'Create Product (From Manual/Bale)' should be split: Manual creation is user-initiated. Bale-linked product creation is AUTOMATIC — it is triggered by the system when bale breakdown is saved, not by the user directly. Show it as a system-initiated sub-case."),
  critical("CORRECTION — 'Low Stock Alert → Warning Message': Remove the <<include>> to 'Warning Message' implying automatic notification. The alert is a query result, not a system push. Change to: 'Low Stock Alert → Displays list of products below threshold (query-only, no push notification).'"),
  emptyLine(),

  h2("2.3.3 Sales Management System (POS) Diagram — Corrections"),
  critical("CORRECTION — The diagram shows 'Add Products to Cart' as a direct use case. In the system, items are added to a DRAFT sale. Add a new use case: 'Create Draft Sale (system auto-creates on POS open)' and connect 'Add Products to Cart/Draft' to it."),
  critical("CORRECTION — 'Accept Payment' should show it as completing the DRAFT → COMPLETED transition. The diagram implies payment is a standalone action without the draft context."),
  incomplete("ADD — 'Cancel Draft Sale' use case (deletes DRAFT record from database)"),
  incomplete("ADD — 'Attach Customer to Draft' use case"),
  emptyLine(),

  h2("2.3.4 Purchasing Management System Diagram — Corrections"),
  critical("CORRECTION — The diagram shows 'Manage Purchase Orders' → extends to 'Create Purchase Order' which <<includes>> 'Input Bale Details (Quantity & Cost)' and 'Input Supplier Details'. This is accurate for the PO flow."),
  critical("CORRECTION — 'Sort to Categories (Class A Premium, Class B Standard)' → The diagram shows the user sorting as a manual step. In reality, after the user inputs quantities, the system AUTO-CREATES the product records. Add a system-initiated step: 'Auto-generate products for Premium and Standard grades (system)'"),
  critical("CORRECTION — 'Record Damaged/Unsellable' → Only counted, NOT converted to products automatically. The diagram should clarify this."),
  critical("REMOVE — Any implication of separate 'ORDER_LINE_ITEM' entity. The manuscript's class diagram shows this but it does not exist in code."),
  emptyLine(),

  h2("2.3.5 Payroll Management System Diagram — Corrections"),
  critical("CORRECTION — The diagram shows 'Compute Salary' as the main payroll action. The full lifecycle is: Create Period → Load Inputs → Compute → Finalize → Release (or Void). These are separate stages with distinct permissions. Add all stages to the diagram."),
  incomplete("ADD — 'Finalize Payroll Run' use case"),
  incomplete("ADD — 'Release Payroll' use case"),
  incomplete("ADD — 'Void Payroll Run' use case"),
  incomplete("ADD — 'Sync Attendance to Payroll Inputs' as a system-triggered sub-case"),
  emptyLine(),

  h2("2.3.6 Supplier Management System Diagram — Corrections"),
  verified("The diagram is accurate. No changes needed."),
  emptyLine(),

  h2("2.3.7 Category and Type Management System Diagram — Corrections"),
  critical("CORRECTION — The diagram shows PRODUCT_TYPE as a class that 'classifies' PRODUCT with a solid relationship line. In the code, products.subcategory is a text field — there is NO database foreign key from products to category_types. Change the relationship line to a dashed line (dependency/usage) to indicate application-layer validation only."),
  emptyLine(),

  h2("2.3.8 Customer Management System Diagram — Corrections"),
  verified("The diagram is accurate. No changes needed."),
  pageBreak()
)

// ══════════════════════════════════════════════════════
// SECTION 2.4 — DESIGN CLASS DIAGRAMS
// ══════════════════════════════════════════════════════
children.push(
  h1("SECTION 2.4 — DESIGN CLASS DIAGRAM (CORRECTIONS)"),
  body("This is the most critical section for correction. Every class diagram must be updated to reflect the actual database schema and relationships."),
  emptyLine(),

  h2("2.4.1 RBAC Class Diagram — Corrections"),
  emptyLine(),
  makeTable(
    ['Class in Manuscript', 'Status', 'What to Fix'],
    [
      ['ROLE: role_id, role_name, permissions', 'INCORRECT ⚑', 'REMOVE the "permissions" attribute from ROLE. Permissions are stored in a separate PERMISSION entity linked via the role_permissions junction table. Add PERMISSION as its own class: (id, name, description). Add role_permissions junction class.'],
      ['USER: user_id, role_id, username, password, status, personal_info', 'INCORRECT ⚑', 'CORRECTION 1: Remove role_id from USER. Users have roles through user_roles junction table (many-to-many). The code does have a compatibility check for legacy role_id but the canonical schema does NOT have role_id on users. CORRECTION 2: Add is_active field (controls login access). CORRECTION 3: Add full_name, email fields. CORRECTION 4: Add user_permissions association (direct permissions bypass roles).'],
      ['ROLE → USER relationship shown as 1 assigns to 0..*', 'INCORRECT ⚑', 'CHANGE to many-to-many: One user can have many roles; one role can be assigned to many users. Junction table: user_roles(user_id, role_id).'],
    ],
    [22, 12, 66]
  ),
  incomplete("ADD PERMISSION class: id, name (format: module.action, e.g., sales.create), description"),
  incomplete("ADD role_permissions junction: role_id → permission_id"),
  incomplete("ADD user_permissions junction: user_id → permission_id (direct permissions)"),
  incomplete("ADD user_roles junction: user_id → role_id"),
  emptyLine(),

  h2("2.4.2 Inventory Management System Class Diagram — Corrections"),
  emptyLine(),
  makeTable(
    ['Class in Manuscript', 'Status', 'What to Fix'],
    [
      ['PRODUCT: product_id, type_id, sku_code, barcode, name, brand, size, float selling_price, int stock_quantity, int stock_threshold', 'INCOMPLETE +', 'ADD MISSING FIELDS: item_code (boutique identifier), bale_purchase_id (FK to bale_purchases for bale-generated products), condition_grade ENUM(premium, standard, low_grade, damaged, unsellable), allocated_cost (bale_cost ÷ saleable_items), product_source (bale_breakdown or null for manual), status ENUM(available, sold, damaged, reserved, archived), date_encoded, category_id (FK to categories), source_breakdown_id. Also: change type_id to subcategory (VARCHAR, not FK).'],
      ['STOCK_IN_RECORD: stock_in_id, product_id, supplier_id, quantity, source_type, date_received', 'INCORRECT ⚑', 'In the actual DB this is inventory_transactions with transaction_type = IN. Fields: id, product_id, supplier_id, transaction_type ENUM(IN,OUT,ADJUST,RETURN), quantity, reference, user_id, reason, balance_after. Rename to INVENTORY_TRANSACTION and show all types.'],
      ['STOCK_ADJUSTMENT: adjustment_id, product_id, quantity, date_recorded, reason, barcode', 'INCOMPLETE +', 'In DB this is inventory_adjustments. Add: bale_purchase_id (for bale-source adjustments), adjustment_type (damaged/shrinkage/unsellable/correction).'],
      ['DAMAGED_ITEM: damage_id, product_id, quantity, status, date_reported', 'CORRECT ✓', 'Corresponds to damaged_inventory table. Table name should be DAMAGED_INVENTORY. Add reported_by field.'],
      ['INVENTORY_LOG: log_id, product_id, transaction_type, qty_change, timestamp', 'CORRECT ✓', 'This maps to inventory_transactions. Accurate overview. Rename to INVENTORY_TRANSACTION to match DB table name.'],
    ],
    [22, 12, 66]
  ),
  emptyLine(),

  h2("2.4.3 Sales Management System (POS) Class Diagram — Corrections"),
  emptyLine(),
  makeTable(
    ['Class in Manuscript', 'Status', 'What to Fix'],
    [
      ['USER: user_id, role_id, username, password, status', 'INCORRECT ⚑', 'Same as 2.4.1 — role_id should not be on USER directly. Use user_roles junction.'],
      ['CUSTOMER: customer_id, customer_code, first_name, surname, phone, email', 'INCOMPLETE +', 'ADD MISSING FIELDS: full_name, nickname, preferred_contact_method (SMS/Call/Email/Facebook-Messenger/Viber), address_line, region_name, province_name, city_name, barangay_name, postal_code (all PSGC address fields). Customer records store the complete Philippine address hierarchy.'],
      ['SALES_TRANSACTION: transaction_id, user_id, customer_id, transaction_date, vat_amount, discount, total_amount, payment_status', 'INCORRECT ⚑', 'RENAME to SALE (matches DB table: sales). ADD MISSING FIELDS: sale_number (unique, auto-generated), status ENUM(DRAFT, COMPLETED, REFUNDED, CANCELLED) — DRAFT is critical and missing, receipt_no, order_note, customer_name_snapshot, payment_method. REMOVE payment_status — the sales table does not have payment_status; it is on bale_purchases.'],
      ['SALES_ITEM: sales_item_id, transaction_id, product_id, quantity, subtotal', 'INCOMPLETE +', 'RENAME to SALE_ITEM. ADD MISSING: unit_price, line_total. ADD SNAPSHOT FIELDS: product_name_snapshot, sku_snapshot, brand_snapshot, barcode_snapshot, size_snapshot, color_snapshot — these are critical for historical accuracy after product edits.'],
      ['SALES_RETURN: return_id, transaction_id, return_date, reason, status, return_qty, refund_amount', 'CORRECT ✓', 'Mostly accurate. DB table uses sale_id not transaction_id but the concept is correct.'],
      ['SALES_REPORT: report_id, generated_date, total_revenue', 'INCOMPLETE +', 'This is not a persistent entity — reports are generated on-the-fly by aggregating sales data. If kept, note it as a computed/view type, not a stored table.'],
    ],
    [22, 12, 66]
  ),
  emptyLine(),

  h2("2.4.4 Purchasing Management System Class Diagram — Corrections"),
  body("This is the most structurally incorrect diagram. It must be significantly revised."),
  emptyLine(),
  makeTable(
    ['Class in Manuscript', 'Status', 'What to Fix'],
    [
      ['BALE_PURCHASE_ORDER: bale_po_id, po_number, supplier_id, order_date, expected_delivery, status', 'INCORRECT ⚑', 'This class must be MERGED with BALE_PURCHASE_RECORD. There is ONE table (bale_purchases) for both. Show a single BALE_PURCHASE class with the po_status attribute (PENDING/ORDERED/RECEIVED/COMPLETED/CANCELLED) distinguishing the workflow stage.'],
      ['ORDER_LINE_ITEM: line_id, bale_po_id, bale_category, quantity, unit_cost', 'INCORRECT ⚑', 'REMOVE THIS CLASS. It does not exist in the database. There is no ORDER_LINE_ITEM table. The bale_category, quantity, and cost are stored directly on bale_purchases — one record per category.'],
      ['BALE_PURCHASE_RECORD: bale_record_id, bale_po_id, batch_number, bale_category, received_qty, bale_cost, total_cost', 'INCORRECT ⚑', 'MERGE into BALE_PURCHASE (same table as ORDER). Replace with single class: BALE_PURCHASE with fields: id, bale_batch_no, po_number, po_status, supplier_id, supplier_name, purchase_date, bale_category, bale_cost, total_purchase_cost, payment_status, quantity_ordered, quantity_received, expected_delivery_date, actual_delivery_date.'],
      ['BALE_BREAKDOWN: breakdown_id, bale_record_id, category_display, premium_qty, standard_qty, damaged_qty', 'INCOMPLETE +', 'ADD MISSING FIELDS: low_grade_items (tracked but no product auto-created), saleable_items (auto-computed), cost_per_saleable_item (auto-computed), encoded_by (FK to users), breakdown_date. CHANGE bale_record_id to bale_purchase_id. ADD: generates relationship to PRODUCT (1:1 to premium product, 1:1 to standard product).'],
      ['BALE_RETURN: return_id, bale_po_id, return_date, return_qty, reason, status', 'INCORRECT ⚑', 'NOTE KNOWN BUG: The route file (baleReturns.js) and the database migration create tables with DIFFERENT names and DIFFERENT structures (bale_returns vs. bale_supplier_returns). This feature has a schema mismatch. Note as a known system limitation.'],
    ],
    [22, 12, 66]
  ),
  incomplete("ADD to BALE_PURCHASE: relationship to PRODUCT (1 bale → many products via bale_purchase_id FK on products table)"),
  incomplete("ADD BALE_SUPPLIER_RETURN class (from migration): supplier_id, bale_purchase_id, return_date, notes, processed_by"),
  incomplete("ADD BALE_SUPPLIER_RETURN_ITEMS class: return_id, quantity, reason"),
  emptyLine(),

  h2("2.4.5 Payroll Management System Class Diagram — Corrections"),
  body("The diagram shows a simplified payroll model. The actual implementation uses 7 interrelated tables."),
  emptyLine(),
  makeTable(
    ['Class in Manuscript', 'Status', 'What to Fix'],
    [
      ['PAYROLL_PROFILE: profile_id, user_id, monthly_rate, daily_rate, hourly_rate, sss_contribution, philhealth_contribution, pagibig_contribution', 'INCOMPLETE +', 'Mostly accurate but ADD: pay_basis ENUM(monthly/daily/hourly), payroll_frequency ENUM(weekly/semi_monthly/monthly), standard_work_days_per_month, standard_hours_per_day, overtime_eligible flag, late_deduction_enabled flag, undertime_deduction_enabled flag, tax_enabled flag, sss_enabled flag, philhealth_enabled flag, pagibig_enabled flag, payroll_method ENUM(cash/bank_transfer/ewallet), bank details.'],
      ['PAYROLL_PERIOD: period_id, period_code, start_date, end_date, payout_date, frequency, status', 'CORRECT ✓', 'Mostly accurate. Add: status ENUM(draft, computed, finalized, released, void) — the status lifecycle is essential.'],
      ['PAYROLL_RECORD: payroll_record_id, period_id, user_id, regular_hours, overtime_hours, leave_days, cash_advances, deductions, allowances, gross_pay, net_pay', 'INCORRECT ⚑', 'The manuscript conflates two separate tables: (1) PAYROLL_INPUTS (per-period attendance/adjustment data) and (2) PAYROLL_RUN_ITEMS (computed results). These must be separate classes. PAYROLL_RUN_ITEMS contains: gross_basic_pay, gross_overtime_pay, gross_holiday_pay, withholding_tax, employee_sss, employer_sss, ec_contribution, employee_philhealth, employer_philhealth, employee_pagibig, employer_pagibig, total_deductions, net_pay, plus 3 immutable JSON snapshots.'],
      ['PAYROLL_ADJUSTMENT: adjustment_id, payroll_record_id, adjustment_type, description, amount', 'INCORRECT ⚑', 'In the actual DB, adjustments are fields on PAYROLL_INPUTS: manual_bonus, manual_commission, manual_allowance, loan_deduction, manual_deduction, regular_holiday_days, special_holiday_days, rest_day_days, paid_leave_days, unpaid_leave_days. There is no separate PAYROLL_ADJUSTMENT table.'],
      ['PAYSLIP: payslip_id, payroll_record_id, release_date, status', 'INCORRECT ⚑', 'There is no separate PAYSLIP table. Payslip data is stored in PAYROLL_RUN_ITEMS and PAYROLL_ITEM_LINES. The payslip is a VIEW built from these tables, not a stored record. Remove PAYSLIP as a standalone class.'],
      ['PAYROLL_REPORT: report_id, period_id, generated_date, grand_total_payout', 'INCOMPLETE +', 'Not a persistent table — reports are computed on-the-fly from payroll_run_items. If kept, mark as computed/view type.'],
    ],
    [22, 12, 66]
  ),
  incomplete("ADD PAYROLL_RUN class: payroll_period_id, run_number, status (draft/finalized/released/void), total_gross_pay, total_net_pay, employee_count"),
  incomplete("ADD PAYROLL_INPUTS class: payroll_period_id, user_id, days_worked, hours_worked, overtime_hours, night_differential_minutes, late_minutes, undertime_minutes, absent_days, manual_bonus, loan_deduction, manual_deduction"),
  incomplete("ADD PAYROLL_ITEM_LINE class: payroll_run_item_id, line_type (earning/deduction), code (BASIC_PAY/SSS_EMPLOYEE/etc.), label, amount"),
  incomplete("ADD PAYROLL_SETTINGS_VERSION class: version_name, effective_from, settings_json (BIR/SSS/PhilHealth/Pag-IBIG rates)"),
  emptyLine(),

  h2("2.4.6 Supplier Management System Class Diagram — Corrections"),
  verified("SUPPLIER class is accurate: supplier_id, name, contact_person, phone, email, address ✓"),
  critical("CORRECTION — The diagram shows BALE_PURCHASE_ORDER and BALE_PURCHASE_RECORD as separate classes linked to SUPPLIER. As established in 2.4.4, these are the SAME TABLE. Redraw with a single BALE_PURCHASE class."),
  critical("CORRECTION — ORDER_LINE_ITEM appears in this diagram too. Remove it entirely — it does not exist."),
  emptyLine(),

  h2("2.4.7 Category and Type Management System Class Diagram — Corrections"),
  makeTable(
    ['Class in Manuscript', 'Status', 'What to Fix'],
    [
      ['PRODUCT_CATEGORY: category_id, category_name, description', 'CORRECT ✓', 'Maps to categories table. Accurate.'],
      ['PRODUCT_TYPE: type_id, category_id, type_name', 'INCORRECT ⚑', 'RENAME to CATEGORY_TYPE (DB table is category_types). ADD: is_active field. The class name PRODUCT_TYPE does not match the actual table name.'],
      ['PRODUCT: product_id, category_id, type_id, product_name, selling_price', 'INCORRECT ⚑', 'CHANGE type_id to subcategory VARCHAR. The products table does NOT have a type_id foreign key. The type is stored as a text value (subcategory) validated against category_types at the application layer. The relationship line from PRODUCT to CATEGORY_TYPE should be DASHED (dependency/validation), not a solid FK line.'],
    ],
    [22, 12, 66]
  ),
  emptyLine(),

  h2("2.4.8 Customer Management System Class Diagram — Corrections"),
  makeTable(
    ['Class in Manuscript', 'Status', 'What to Fix'],
    [
      ['CUSTOMER: customer_id, customer_code, first_name, surname, phone, email', 'INCOMPLETE +', 'ADD MISSING FIELDS (added by migration 20260324): full_name, nickname, preferred_contact_method, address_line, region_code, region_name, province_code, province_name, city_code, city_name, barangay_code, barangay_name, postal_code. These Philippine address fields store PSGC (Philippine Standard Geographic Code) hierarchy.'],
      ['SALES_TRANSACTION (linked to CUSTOMER)', 'INCORRECT ⚑', 'RENAME to SALE. Add status ENUM(DRAFT, COMPLETED, REFUNDED, CANCELLED). The DRAFT status is critical — it represents in-progress POS transactions.'],
    ],
    [22, 12, 66]
  ),
  emptyLine(),

  h2("SECTION 4 — DOMAIN CLASS DIAGRAM (Full-Page, p.54)"),
  body("The consolidated domain class diagram on page 54 must incorporate all the individual corrections above. Summary of changes:"),
  emptyLine(),
  makeTable(
    ['Action', 'Class', 'Reason'],
    [
      ['REMOVE', 'ORDER_LINE_ITEM', 'Does not exist in the database. No migration, no table, no route.'],
      ['MERGE', 'BALE_PURCHASE_ORDER + BALE_PURCHASE_RECORD → BALE_PURCHASE', 'Same table (bale_purchases). po_status drives the workflow.'],
      ['RENAME', 'PRODUCT_TYPE → CATEGORY_TYPE', 'DB table is category_types, not product_type.'],
      ['FIX RELATIONSHIP', 'PRODUCT → CATEGORY_TYPE', 'Change solid FK line to dashed (no database FK, app-layer validation only).'],
      ['ADD', 'PAYROLL_RUN', 'payroll_runs table — aggregate per-period computation results.'],
      ['ADD', 'PAYROLL_INPUTS', 'payroll_inputs table — per-user per-period attendance/adjustment data.'],
      ['ADD', 'PAYROLL_ITEM_LINE', 'payroll_item_lines table — itemized earning/deduction lines.'],
      ['ADD', 'PAYROLL_SETTINGS_VERSION', 'payroll_settings_versions table — versioned BIR/SSS/PhilHealth/Pag-IBIG tables.'],
      ['SPLIT', 'PAYROLL_RECORD → PAYROLL_INPUTS + PAYROLL_RUN_ITEMS', 'These are two distinct tables with different roles.'],
      ['REMOVE', 'PAYSLIP (as standalone class)', 'No separate payslip table. Data is in PAYROLL_RUN_ITEMS + PAYROLL_ITEM_LINE.'],
      ['ADD FIELDS', 'PRODUCT', 'condition_grade, bale_purchase_id, allocated_cost, status, date_encoded, item_code, product_source.'],
      ['ADD FIELDS', 'SALE (was SALES_TRANSACTION)', 'status ENUM(DRAFT, COMPLETED, REFUNDED, CANCELLED), receipt_no.'],
      ['ADD FIELDS', 'SALE_ITEM (was SALES_ITEM)', 'Snapshot fields: product_name_snapshot, sku_snapshot, barcode_snapshot, size_snapshot, color_snapshot.'],
      ['ADD FIELDS', 'CUSTOMER', 'Full Philippine address hierarchy (15+ fields from PSGC migration).'],
      ['ADD FIELDS', 'BALE_BREAKDOWN', 'low_grade_items, saleable_items (computed), cost_per_saleable_item (computed).'],
      ['FIX', 'USER.role_id', 'Remove role_id from USER attributes. Roles linked via user_roles junction table.'],
      ['ADD', 'PERMISSION class', 'id, name (module.action), description.'],
      ['ADD', 'EMPLOYEE_DOCUMENT class', 'Links EMPLOYEE to FILE with document lifecycle status.'],
      ['ADD', 'FILE class', 'id, path, original_name, type, size, uploaded_by.'],
      ['ADD', 'AUDIT_LOG class', 'id, user_id, action, resource_type, resource_id, details (JSON), created_at.'],
      ['ADD', 'NOTIFICATION class', 'id, type, recipient_user_id, payload, status, is_read, read_at.'],
      ['ADD', 'EXPENSE class', 'id, expense_date, category, amount, vendor, employee_id, status, approved_by.'],
      ['ADD', 'LEDGER class', 'id, account_code, entry_date, debit, credit, reference, created_by.'],
      ['ADD', 'CONFIG class', 'config_key (PK), config_value (e.g., vat_inclusive, currency).'],
      ['ADD', 'BALE_SUPPLIER_RETURN class', 'supplier_id, bale_purchase_id, return_date, notes.'],
      ['ADD', 'INVENTORY_ADJUSTMENT class', 'product_id, bale_purchase_id, adjustment_type, quantity, reason.'],
    ],
    [12, 22, 66]
  ),
  pageBreak()
)

// ══════════════════════════════════════════════════════
// SECTION 3 — USE CASE DESCRIPTIONS
// ══════════════════════════════════════════════════════
children.push(
  h1("SECTION 3 — USE CASE DESCRIPTIONS (CORRECTIONS)"),
  emptyLine(),

  h2("3.1 RBAC — Create Employee Profile & Assign Role"),
  emptyLine(),
  makeTable(
    ['Field', 'Manuscript Says', 'Status', 'Correction'],
    [
      ['Triggering Event', 'Admin navigates to User Management and clicks "Add Employee"', 'INCOMPLETE +', 'Accurate but add: this single action creates BOTH the employee record AND the user login account in a single database transaction.'],
      ['Brief Description', 'Admin inputs personal details, uploads documents, creates login credentials, assigns Role.', 'INCORRECT ⚑', 'CORRECTION: Login credentials are AUTO-GENERATED by the system (email = username, bcrypt-hashed default password). Admin does NOT manually set a password. Remove "creates system login credentials" and replace with "system automatically generates login credentials."'],
      ['Postconditions', 'A new user account is active, documents are saved, and login credentials are valid.', 'INCOMPLETE +', 'ADD: Login credentials use the employee email as both username and email address. The default password is configurable via system settings (getDefaultNewUserPassword() from security config).'],
      ['Flow of Activities', '(2) Uploads required PDF/Image documents. (3) Selects Role. (4) Saves profile. System: (3.1) Links Role ID to User ID.', 'INCORRECT ⚑', 'CORRECTION TO STEP 2: Document upload is a SEPARATE operation (POST /employees/:id/documents) with its own lifecycle. Uploading documents is not part of the initial profile creation form. CORRECTION TO SYSTEM STEP 3.1: The role is linked via user_roles junction table (many-to-many), not a direct role_id FK on users.'],
    ],
    [15, 22, 10, 53]
  ),
  emptyLine(),

  h2("3.2 Inventory — Record Stock Adjustments (Shrinkage/Damage)"),
  emptyLine(),
  makeTable(
    ['Field', 'Manuscript Says', 'Status', 'Correction'],
    [
      ['Flow of Activities', 'System: (3.1) Updates inventory and triggers Low Stock Alert if needed.', 'INCORRECT ⚑', 'CORRECTION: Low Stock Alert does NOT automatically trigger. The system updates inventory. The low-stock status becomes visible when a user queries GET /inventory/alerts/low-stock. Change "triggers Low Stock Alert" to "updates stock_quantity; alert becomes visible on the Low Stock Alerts page if threshold is crossed."'],
    ],
    [15, 22, 10, 53]
  ),
  emptyLine(),

  h2("3.3 Sales (POS) — Process Sales Transaction"),
  body("This use case description needs the most significant revision. The draft-sale pattern is entirely absent."),
  emptyLine(),
  makeTable(
    ['Field', 'Manuscript Says', 'Status', 'Correction'],
    [
      ['Triggering Event', 'The cashier initiates a new cart and scans the first product barcode.', 'INCORRECT ⚑', 'REWRITE: "The cashier opens the POS screen. The system automatically creates a DRAFT sale record (status = DRAFT, sale_number = DRF-XXXXX) in the database."'],
      ['Brief Description', 'Cashier adds items to POS cart, applies discounts, links customer profile, accepts payment. System computes totals, records transaction, prints receipt, deducts items from inventory.', 'INCOMPLETE +', 'REWRITE to include two-phase process: Phase 1 (Draft): Cashier adds items to the draft sale. Scanner accepts multiple formats (plain barcode, QR code, URL-encoded scan, JSON format). Customer can be optionally linked. Stock is NOT yet deducted. Phase 2 (Checkout): Cashier confirms payment. System converts DRAFT → COMPLETED, assigns receipt_no, stores product snapshots in sale_items, deducts stock, logs audit event.'],
      ['Postconditions', 'A permanent sales record is created, and inventory quantities are reduced.', 'INCOMPLETE +', 'ADD: sale_items stores immutable snapshots of product_name, sku, brand, barcode, size, color, and unit_price at time of sale. These snapshots ensure the sales record remains accurate even if products are later edited or deleted.'],
      ['Flow of Activities Actor: (1) Scans item barcodes. (2) Links customer profile. (3) Inputs payment amount.', 'Flow', 'INCORRECT ⚑', 'REWRITE FLOW: Actor: (1) Opens POS — system creates DRAFT sale. (2) Scans barcode or searches product — item added to DRAFT. (3) Adjusts quantity if needed. (4) Optionally attaches customer. (5) Optionally applies discount. (6) Clicks "Proceed to Accept Payment." System: (2.1) Normalizes scan input (handles barcode, QR, URL-encoded, JSON formats). (3.1) Validates stock availability. (6.1) Calculates subtotal, tax (from vat_inclusive config), discount, total. (6.2) Converts DRAFT → COMPLETED. (6.3) Deducts stock for each item. (6.4) Stores product snapshots. (6.5) Assigns receipt_no. (6.6) Logs SALE_COMPLETED to audit_logs.'],
    ],
    [15, 22, 10, 53]
  ),
  emptyLine(),

  h2("3.4 Purchasing — Process Bale Breakdown"),
  emptyLine(),
  makeTable(
    ['Field', 'Manuscript Says', 'Status', 'Correction'],
    [
      ['Triggering Event', 'Manager selects a "Received" Bale Purchase Order and initiates the breakdown.', 'INCOMPLETE +', 'Accurate but clarify: The bale must have po_status = RECEIVED or COMPLETED (not just "Received").'],
      ['Brief Description', 'Manager inputs total pieces, sorts into Class A (Premium) and Class B (Standard). Defective items recorded. System converts into individual stock records.', 'INCORRECT ⚑', 'MAJOR REWRITE: (1) Staff enters: total_pieces, premium_items, standard_items, low_grade_items, damaged_items, breakdown_date. (2) System computes: saleable_items = total_pieces - damaged_items; cost_per_saleable_item = bale_cost ÷ saleable_items. (3) System AUTO-CREATES one product for Premium and one product for Standard — each with auto-assigned SKU, barcode, QR code, allocated_cost. (4) LOW_GRADE items are COUNTED ONLY — no product is auto-created. (5) DAMAGED items are COUNTED ONLY — recorded for damaged_inventory, not converted to sellable products. (6) Each auto-created product receives 1 unit of stock via IN inventory transaction.'],
      ['Postconditions', '"The Bale status is updated to Broken Down, and new product stock is injected into Inventory."', 'INCORRECT ⚑', 'CORRECTION 1: There is no "Broken Down" status in the system. The po_status values are: PENDING, ORDERED, RECEIVED, COMPLETED, CANCELLED. CORRECTION 2: More precisely: bale_breakdowns record is created, two product records are auto-generated (premium + standard), inventory_transactions records are created for each new product.'],
      ['Flow of Activities', 'Actor: (3) Assigns quantities to Class A and Class B. (4) Flags unsellable items. System: (3.1) Generates stock-in records.', 'INCOMPLETE +', 'ADD: System also (a) creates product records for each grade, (b) assigns SKU/barcode/QR, (c) calculates allocated_cost, (d) creates IN inventory_transaction per product.'],
    ],
    [15, 22, 10, 53]
  ),
  emptyLine(),

  h2("3.5 Payroll — Process Payroll Cycle"),
  emptyLine(),
  makeTable(
    ['Field', 'Manuscript Says', 'Status', 'Correction'],
    [
      ['Triggering Event', 'Manager creates a new Payroll Period and clicks "Process Payroll."', 'INCOMPLETE +', 'Accurate for period creation. But "Process Payroll" is only one stage. The full sequence: Create Period → Load Inputs → Compute → Finalize → Release.'],
      ['Brief Description', 'System loads active employee profiles and syncs attendance. Manager edits inputs. System computes net pay including statutory deductions and generates payslips.', 'INCOMPLETE +', 'ADD STATUTORY DETAILS: SSS (employee 5% / employer 10%, MSC floor ₱5,000 / cap ₱35,000, EC ₱10–₱30), PhilHealth (5% split 50/50, floor ₱10,000 / cap ₱100,000 monthly salary), Pag-IBIG (2%/2%, cap ₱10,000), Withholding Tax (BIR RR 11-2018 Annex E, 2023 onwards). ADD: payslip data is stored with immutable JSON snapshots of the computation parameters.'],
      ['Preconditions', 'Employees must have active Payroll Profiles; Attendance logs must be complete.', 'CORRECT ✓', 'Accurate.'],
      ['Postconditions', '"Payroll records are permanently saved, and payslips are made available for release."', 'INCOMPLETE +', 'ADD: Payroll goes through Finalize (locked) and Release (disbursed) stages. Each stage is separate and permission-controlled. ADD: Historical payslips remain accurate because computation parameters are frozen as snapshots.'],
      ['Flow of Activities', 'Actor: (4) Approves computation. System: (3.1) Computes gross pay, taxes, and net pay. (4.1) Generates payslip PDFs.', 'INCORRECT ⚑', 'CORRECTION: "Approves computation" implies an owner-specific approval gate. This does NOT exist. The finalize action is permission-controlled (payroll.finalize permission) — anyone with that permission can finalize. CORRECTION: "(4.1) Generates payslip PDFs" — the system stores payslip data in payroll_run_items. PDF generation happens client-side in the browser, not on the server. Remove "Generates payslip PDFs."'],
    ],
    [15, 22, 10, 53]
  ),
  emptyLine(),

  h2("3.6 Supplier — Create Supplier Profile"),
  verified("All fields accurate. Triggering event, brief description, flow of activities are correct. No changes needed."),
  emptyLine(),

  h2("3.7 Category and Type — Manage Product Categories & Types"),
  verified("Mostly accurate."),
  critical("CORRECTION — 'The system enforces a hierarchy, requiring a category to be loaded before a type can be created or linked to inventory.' → Clarify: At the database level, there is NO foreign key from products.subcategory to category_types. The hierarchy is enforced at the APPLICATION (API) layer only — the products route validates the submitted type against active category_types for the selected category. A database migration adding the FK was never created."),
  emptyLine(),

  h2("3.8 Customer — View Customer Profile & Purchase History"),
  verified("All fields accurate. No changes needed."),
  emptyLine(),

  incomplete("ADD MISSING USE CASE DESCRIPTIONS for:"),
  incomplete("• Log In (with failed login, inactive account, 8-hour JWT, audit logging)"),
  incomplete("• Process Payroll Finalize / Release / Void"),
  incomplete("• Record Expense / Approve Expense"),
  incomplete("• Manage Ledger Entry"),
  incomplete("• View Audit Log"),
  incomplete("• Update System Settings (VAT toggle, business name)"),
  incomplete("• Manage Employee Document (upload + verify lifecycle)"),
  pageBreak()
)

// ══════════════════════════════════════════════════════
// SECTION — DATABASE STRUCTURE (MISSING SECTION)
// ══════════════════════════════════════════════════════
children.push(
  h1("MISSING SECTION — DATABASE STRUCTURE"),
  body("The manuscript does not have a dedicated database section. Given the scope of the system, adding one is strongly recommended. The following is the authoritative table inventory verified from the codebase."),
  emptyLine(),
  body("Database: cecilles_nstyle_db | Engine: MySQL 8 | Character Set: utf8mb4 | Total Tables: 37+"),
  emptyLine(),
  makeTable(
    ['#', 'Table', 'Module', 'What It Stores'],
    [
      ['1','users','Access Control','Login credentials, full_name, is_active. No role_id column in canonical schema (roles via user_roles).'],
      ['2','roles','Access Control','Role definitions: name, description.'],
      ['3','permissions','Access Control','Permission keys in module.action format (e.g., sales.create, admin.*).'],
      ['4','role_permissions','Access Control','Many-to-many junction: role_id ↔ permission_id.'],
      ['5','user_roles','Access Control','Many-to-many junction: user_id ↔ role_id.'],
      ['6','user_permissions','Access Control','Direct user-level permissions bypassing roles.'],
      ['7','categories','Products','Product category names and descriptions.'],
      ['8','category_types','Products','Product sub-type options scoped per category. Linked to products via text only (subcategory field), not FK.'],
      ['9','products','Products/Inventory','All products. Includes bale-linked fields: condition_grade, bale_purchase_id, allocated_cost, selling_price, status, date_encoded, item_code.'],
      ['10','inventory_transactions','Inventory','Every stock movement: IN, OUT, ADJUST, RETURN. Records balance_after for audit trail.'],
      ['11','inventory_adjustments','Inventory','Adjustment records typed as: damaged, shrinkage, unsellable, correction. Linked to bale or product.'],
      ['12','damaged_inventory','Inventory','Damaged item records with quantity, reason, reported_by.'],
      ['13','sales','Sales','Sale headers. status ENUM: DRAFT (in-progress), COMPLETED, REFUNDED, CANCELLED. Holds snapshots of customer info.'],
      ['14','sale_items','Sales','Line items per sale. Stores product snapshots: product_name, sku, brand, barcode, size, color, unit_price — immutable historical record.'],
      ['15','customers','Customers','Customer profiles + full Philippine PSGC address hierarchy (region → province → city → barangay).'],
      ['16','suppliers','Purchasing','Supplier contact info: name, contact_person, phone, email, address.'],
      ['17','bale_purchases','Purchasing','Unified Bale Purchase Record AND Purchase Order. po_status drives workflow. PO number format: BALE-PO-XXXX.'],
      ['18','bale_breakdowns','Purchasing/Inventory','One-to-one with bale_purchases. Stores: total_pieces, premium_items, standard_items, low_grade_items, damaged_items, cost_per_saleable_item.'],
      ['19','bale_supplier_returns','Purchasing','Return-to-supplier header records.'],
      ['20','bale_supplier_return_items','Purchasing','Line items per supplier return.'],
      ['21','employees','HR','Employee profiles: personal info, employment details, government IDs (TIN, SSS, PhilHealth, Pag-IBIG), emergency contacts.'],
      ['22','employee_documents','HR','Document lifecycle per employee. status: NOT_SUBMITTED, SUBMITTED, VERIFIED, REJECTED, EXPIRED. Tracks expiry and verification.'],
      ['23','attendance','HR','Daily attendance. Auto-computes late_minutes, undertime_minutes, overtime_minutes. status: PRESENT, LATE, HALF_DAY, ABSENT, ON_LEAVE, REST_DAY, HOLIDAY.'],
      ['24','files','HR/System','Uploaded file metadata: path, original_name, type, size, uploaded_by.'],
      ['25','payroll_profiles','Payroll','Per-employee config: pay_basis, pay_rate, frequency, statutory flags, payment method.'],
      ['26','payroll_periods','Payroll','Pay period definitions. status lifecycle: draft → computed → finalized → released → void.'],
      ['27','payroll_inputs','Payroll','Per-user per-period inputs: days_worked, hours_worked, overtime, late_minutes, bonuses, deductions.'],
      ['28','payroll_runs','Payroll','Aggregate run results per period: total_gross_pay, total_net_pay, employee_count.'],
      ['29','payroll_run_items','Payroll','Per-employee computed payslip with full breakdowns + 3 immutable JSON snapshots.'],
      ['30','payroll_item_lines','Payroll','Itemized earning/deduction lines: BASIC_PAY, OVERTIME_PAY, SSS_EMPLOYEE, PHILHEALTH_EMPLOYEE, etc.'],
      ['31','payroll_settings_versions','Payroll','Versioned BIR/SSS/PhilHealth/Pag-IBIG rate tables. Default: BIR RR 11-2018 (2023 onwards).'],
      ['32','payrolls','Payroll (Legacy)','Original simple payroll table — superseded by payroll_run_items. No longer written to.'],
      ['33','expenses','Finance','Business expense records: date, category, amount, vendor, employee, status (PENDING/APPROVED/REJECTED/PAID), approved_by.'],
      ['34','ledger','Finance','Manual journal entries: account_code, entry_date, debit, credit, reference. No auto-posting from sales/payroll.'],
      ['35','audit_logs','System','Complete activity history for all write events. Action names follow pattern: MODULE_ACTION (e.g., AUTH_LOGIN, BALE_PURCHASE_CREATED). Severity: high/medium/low.'],
      ['36','notifications','System','Internal user notifications. Fields: type, title, body, recipient_user_id, status (PENDING/SENT/FAILED), is_read, read_at.'],
      ['37','saved_reports','Reports','User-saved report filter configurations (JSON).'],
      ['38','configs','Settings','System key-value store: vat_inclusive, vat_rate, currency, business_name, default_new_user_password.'],
      ['39','api_keys','System (stub)','External API keys. Table exists; no management interface built yet.'],
      ['40','webhooks','System (stub)','Event webhook subscriptions. Table exists; no management interface built yet.'],
    ],
    [4, 18, 14, 64]
  ),
  pageBreak()
)

// ══════════════════════════════════════════════════════
// SECTION — KNOWN SYSTEM ISSUES (Must add to paper)
// ══════════════════════════════════════════════════════
children.push(
  h1("KNOWN SYSTEM ISSUES & LIMITATIONS (Must Add to Paper)"),
  body("These issues were found during codebase analysis and must be documented in the manuscript — either in a Limitations section or in the Discussion."),
  emptyLine(),
  makeTable(
    ['Issue', 'Severity', 'Description', 'Evidence in Code'],
    [
      ['Bale Returns Schema Mismatch', 'CRITICAL — Runtime Error', 'The bale returns route file queries a table named bale_returns but no migration creates this table. The migration creates bale_supplier_returns (different name + structure). The feature will throw ER_NO_SUCH_TABLE at runtime.', 'baleReturns.js:63 queries FROM bale_returns r; migration creates bale_supplier_returns.'],
      ['JWT Logout Has No Server Invalidation', 'HIGH — Security Gap', 'Logout only clears the client-side token. The JWT issued at login remains valid for 8 hours on the server. A stolen or copied token can be used after logout.', 'No POST /auth/logout endpoint exists. Token expiry set at auth.js:83 (expiresIn: 8h).'],
      ['Attendance Missing Uniqueness Constraint', 'HIGH — Data Integrity', 'The attendance table has no UNIQUE KEY on (employee_id, date). Duplicate records for the same employee on the same day can be inserted, which can cause payroll inputs to be overstated.', 'sia.sql attendance table definition — no UNIQUE constraint.'],
      ['product_source Column Not in Any Migration', 'MEDIUM — Data Error', 'baleBreakdownProductSync.js writes product_source = bale_breakdown to products table but no migration adds this column. Silent failure or error depending on MySQL strict mode.', 'baleBreakdownProductSync.js:143; not in sia.sql or any migration file.'],
      ['source_breakdown_id Column Not in Any Migration', 'MEDIUM — Data Error', 'Same issue as above — column written by sync service but not created by any migration.', 'baleBreakdownProductSync.js:157.'],
      ['Ledger Has No Auto-Posting', 'LOW — Incomplete Feature', 'The ledger module exists with full CRUD but no sales, payroll, or expense transactions auto-post as ledger entries. All entries must be manual.', 'ledger.js — no triggers from other routes.'],
      ['Low Stock Alert Is Query-Only', 'LOW — Missing Feature', 'The manuscript implies an automatic manager notification on low stock. The system only returns a list on API query — no push notification, no automatic action.', 'GET /inventory/alerts/low-stock — informational only.'],
    ],
    [18, 12, 45, 25]
  ),
  pageBreak()
)

// ══════════════════════════════════════════════════════
// SUMMARY CHECKLIST
// ══════════════════════════════════════════════════════
children.push(
  h1("MASTER REVISION CHECKLIST"),
  body("Use this checklist to track all revisions. Sort order: critical corrections first."),
  emptyLine(),
  label("SECTION 2 — PROPOSED SYSTEM (Introduction Paragraph)"),
  critical("Update list of modules to include all 12 implemented modules"),
  critical("Remove 'planned expansion' qualifier for Payroll — it is fully implemented"),
  emptyLine(),
  label("SECTION 2.1 — EVENTS TABLE"),
  critical("2.1.1: Correct 'Profile Creation' — employee + user auto-created in one transaction"),
  critical("2.1.1: Correct 'Role Assignment' — users can have multiple roles (many-to-many)"),
  critical("2.1.2: Correct 'Record Bale Delivery/Breakdown' — auto-product generation not described"),
  critical("2.1.2: Correct 'Low stock alert' — NOT an automatic notification, query-only"),
  critical("2.1.3: Correct 'Scan/Input Item to Cart' — draft sale pattern missing"),
  critical("2.1.3: Correct 'Process Payment' — draft → COMPLETED transition not described"),
  critical("2.1.4: Correct 'Order Creation' — BALE-PO-XXXX auto-number not mentioned"),
  critical("2.1.4: Correct 'Bale Processing' — auto-product generation missing entirely"),
  critical("2.1.4: NOTE 'Return Processing' — known runtime bug (schema mismatch)"),
  critical("2.1.5: Correct 'Execute Payroll Process' — 6-stage lifecycle missing"),
  critical("2.1.5: Correct 'Finalize Payroll' — Finalize and Release are separate stages"),
  incomplete("2.1.1: Add Login, Logout, Failed Login events"),
  incomplete("2.1.2: Add damage source types (bale_breakdown, manual_damage, sales_return)"),
  incomplete("2.1.5: Add attendance status types (LATE, HALF_DAY, etc.)"),
  incomplete("ADD MISSING: Expense, Ledger, Notification, Settings, Audit Log event tables"),
  emptyLine(),
  label("SECTION 2.2 — USE CASE LIST"),
  critical("2.2.4: REMOVE 'Add multiple order lines in one purchase order' — does not exist"),
  critical("2.2.4: MERGE bale purchase order + record into one use case"),
  critical("2.2.5: REMOVE 'planned expansion' for Payroll"),
  incomplete("2.2.1: Add Change Password, Forgot Password, Document Verification use cases"),
  incomplete("2.2.3: Add Draft Sale, Cancel Draft, Attach Customer to Draft"),
  incomplete("2.2.4: Add auto-product generation, allocated cost calculation use cases"),
  incomplete("2.2.5: Add Finalize, Release, Void payroll; Sync Attendance; BIR compliance"),
  incomplete("ADD: Use case sections for Expenses, Ledger, Notifications, Settings, Audit Log"),
  emptyLine(),
  label("SECTION 2.3 — USE CASE DIAGRAMS"),
  critical("2.3.1 RBAC: Fix employee + user as single transaction"),
  critical("2.3.2 Inventory: Fix Low Stock Alert — not a push notification"),
  critical("2.3.3 Sales: Add Draft Sale as starting use case"),
  critical("2.3.4 Purchasing: Auto-product generation is missing; Draft POS not shown"),
  critical("2.3.5 Payroll: Add Finalize, Release, Void stages"),
  emptyLine(),
  label("SECTION 2.4 — DESIGN CLASS DIAGRAMS"),
  critical("2.4.1: Remove role_id from USER; add PERMISSION class; add junctions"),
  critical("2.4.2: Add missing PRODUCT fields (condition_grade, bale_purchase_id, etc.)"),
  critical("2.4.3: Add DRAFT to SALE status; add snapshot fields to SALE_ITEM"),
  critical("2.4.4: REMOVE ORDER_LINE_ITEM; MERGE BALE_PURCHASE_ORDER + RECORD"),
  critical("2.4.5: Split PAYROLL_RECORD into PAYROLL_INPUTS + PAYROLL_RUN_ITEMS; Remove PAYSLIP"),
  critical("2.4.6: Same as 2.4.4 — remove ORDER_LINE_ITEM, merge bale classes"),
  critical("2.4.7: Rename PRODUCT_TYPE to CATEGORY_TYPE; change solid FK line to dashed"),
  critical("2.4.8: Add all Philippine address fields to CUSTOMER"),
  incomplete("Domain Diagram (p.54): Add PAYROLL_RUN, PAYROLL_INPUTS, PAYROLL_ITEM_LINE, PAYROLL_SETTINGS_VERSION, EMPLOYEE_DOCUMENT, FILE, AUDIT_LOG, NOTIFICATION, EXPENSE, LEDGER, CONFIG, BALE_SUPPLIER_RETURN, INVENTORY_ADJUSTMENT"),
  emptyLine(),
  label("SECTION 3 — USE CASE DESCRIPTIONS"),
  critical("3.1 RBAC: Employee creation auto-generates user account; system sets default password"),
  critical("3.2 Inventory: Low Stock Alert does NOT auto-trigger — query only"),
  critical("3.3 Sales: Complete rewrite to include draft-sale two-phase pattern"),
  critical("3.4 Purchasing: Rewrite to include auto-product generation from breakdown"),
  critical("3.4 Purchasing: Remove 'Broken Down' status — it does not exist in po_status ENUM"),
  critical("3.5 Payroll: Rewrite to include 6-stage lifecycle and BIR statutory rates"),
  critical("3.5 Payroll: Remove 'owner approval gate' — permission-based finalize/release only"),
  incomplete("Add use case descriptions for: Login, Process Payroll Finalize/Release/Void, Expense, Ledger, Audit Log, System Settings, Employee Document Verification"),
  emptyLine(),
  label("ADD NEW SECTION — DATABASE STRUCTURE"),
  incomplete("Add full table inventory (37+ tables) with descriptions"),
  incomplete("Add schema migration timeline"),
  incomplete("Add Philippine statutory rates used in payroll (BIR RR 11-2018 brackets)"),
  emptyLine(),
  label("ADD NEW SECTION — KNOWN SYSTEM LIMITATIONS"),
  critical("Document: Bale returns schema mismatch (runtime bug)"),
  critical("Document: JWT logout has no server-side invalidation"),
  critical("Document: Attendance table missing uniqueness constraint"),
  incomplete("Document: product_source and source_breakdown_id columns not in migrations"),
  incomplete("Document: Ledger is manual-only (no auto-posting)"),
  incomplete("Document: Low stock alert is query-only"),
)

// ─── BUILD ────────────────────────────────────────────────────────────────────
const doc = new Document({
  numbering: {
    config: [{
      reference: 'default-numbering',
      levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT }]
    }]
  },
  styles: {
    default: {
      document: { run: { font: 'Times New Roman', size: 24 }, paragraph: { spacing: { line: 360 } } }
    },
    paragraphStyles: [
      { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', run: { bold: true, size: 32, font: 'Times New Roman', color: '1F3864' }, paragraph: { spacing: { before: 480, after: 240 }, border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: '1F3864' } } } },
      { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', run: { bold: true, size: 28, font: 'Times New Roman', color: '2E4057' }, paragraph: { spacing: { before: 360, after: 180 } } },
      { id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', run: { bold: true, size: 26, font: 'Times New Roman', color: '2E6DA4' }, paragraph: { spacing: { before: 280, after: 120 } } },
    ]
  },
  sections: [{
    properties: {
      page: { margin: { top: convertInchesToTwip(1.0), right: convertInchesToTwip(1.0), bottom: convertInchesToTwip(1.0), left: convertInchesToTwip(1.5) } }
    },
    children
  }]
})

Packer.toBuffer(doc).then(buf => {
  fs.writeFileSync('CECILLES_NSTYLE_REVISED_MANUSCRIPT_v2.docx', buf)
  console.log('✓ Done: CECILLES_NSTYLE_REVISED_MANUSCRIPT_v2.docx')
}).catch(err => { console.error(err); process.exit(1) })
