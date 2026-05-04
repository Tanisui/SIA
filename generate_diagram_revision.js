const {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  AlignmentType, Table, TableRow, TableCell, WidthType,
  BorderStyle, ShadingType, convertInchesToTwip, UnderlineType, PageBreak
} = require('docx')
const fs = require('fs')

function border() {
  return {
    top: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
    bottom: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
    left: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
    right: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' }
  }
}
function thickBorder() {
  return {
    top: { style: BorderStyle.SINGLE, size: 4, color: '1F3864' },
    bottom: { style: BorderStyle.SINGLE, size: 4, color: '1F3864' },
    left: { style: BorderStyle.SINGLE, size: 4, color: '1F3864' },
    right: { style: BorderStyle.SINGLE, size: 4, color: '1F3864' }
  }
}
const TNR = 'Times New Roman'
const h1 = t => new Paragraph({ text: t, heading: HeadingLevel.HEADING_1, spacing: { before: 400, after: 200 } })
const h2 = t => new Paragraph({ text: t, heading: HeadingLevel.HEADING_2, spacing: { before: 300, after: 160 } })
const h3 = t => new Paragraph({ text: t, heading: HeadingLevel.HEADING_3, spacing: { before: 240, after: 100 } })
const body = t => new Paragraph({ children: [new TextRun({ text: t, size: 22, font: TNR })], spacing: { before: 60, after: 60, line: 320 }, alignment: AlignmentType.JUSTIFIED })
const mono = t => new Paragraph({ children: [new TextRun({ text: t, size: 20, font: 'Courier New' })], spacing: { before: 40, after: 40 } })
const bullet = (t, lvl = 0) => new Paragraph({ children: [new TextRun({ text: t, size: 22, font: TNR })], bullet: { level: lvl }, spacing: { before: 40, after: 40, line: 280 } })
const empty = () => new Paragraph({ text: '', spacing: { before: 60, after: 60 } })
const pg = () => new Paragraph({ children: [new PageBreak()] })
const centered = (t, sz = 24) => new Paragraph({ children: [new TextRun({ text: t, size: sz, font: TNR })], alignment: AlignmentType.CENTER, spacing: { before: 80, after: 80 } })
const centeredBold = (t, sz = 28) => new Paragraph({ children: [new TextRun({ text: t, bold: true, size: sz, font: TNR })], alignment: AlignmentType.CENTER, spacing: { before: 100, after: 100 } })
const label = t => new Paragraph({ children: [new TextRun({ text: t, bold: true, underline: { type: UnderlineType.SINGLE }, size: 22, font: TNR })], spacing: { before: 180, after: 80 } })
const correct = t => new Paragraph({ children: [new TextRun({ text: '✓  ' + t, size: 22, font: TNR, color: '1E8449' })], spacing: { before: 50, after: 50 } })
const fix = t => new Paragraph({ children: [new TextRun({ text: '✗  ' + t, bold: true, size: 22, font: TNR, color: 'C0392B' })], spacing: { before: 50, after: 50 } })
const task = t => new Paragraph({ children: [new TextRun({ text: '→  ' + t, size: 22, font: TNR, color: '1A5276' })], spacing: { before: 50, after: 50 } })

function makeTable(headers, rows, widths, headerColor = '1F3864') {
  const hr = new TableRow({
    children: headers.map((h, i) => new TableCell({
      children: [new Paragraph({ children: [new TextRun({ text: h, bold: true, size: 20, font: TNR, color: 'FFFFFF' })], alignment: AlignmentType.CENTER, spacing: { before: 60, after: 60 } })],
      width: widths ? { size: widths[i], type: WidthType.PERCENTAGE } : undefined,
      shading: { type: ShadingType.CLEAR, fill: headerColor }, borders: border()
    })), tableHeader: true
  })
  const dr = rows.map((row, ri) => new TableRow({
    children: row.map((cell, ci) => new TableCell({
      children: [new Paragraph({ children: [new TextRun({ text: String(cell ?? ''), size: 20, font: TNR })], spacing: { before: 50, after: 50 } })],
      width: widths ? { size: widths[ci], type: WidthType.PERCENTAGE } : undefined,
      shading: { type: ShadingType.CLEAR, fill: ri % 2 === 0 ? 'EAF2FF' : 'FFFFFF' }, borders: border()
    }))
  }))
  return new Table({ rows: [hr, ...dr], width: { size: 100, type: WidthType.PERCENTAGE } })
}

function sectionBox(title, color = '2E4057') {
  return new Paragraph({
    children: [new TextRun({ text: '  ' + title + '  ', bold: true, size: 24, font: TNR, color: 'FFFFFF' })],
    shading: { type: ShadingType.CLEAR, fill: color },
    spacing: { before: 200, after: 100 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color } }
  })
}

const children = []

// ── COVER ───────────────────────────────────────────────────────────────────
children.push(
  empty(), empty(), empty(), empty(),
  centeredBold("CECILLE'S N'STYLE BOUTIQUE MANAGEMENT SYSTEM", 32),
  empty(),
  centeredBold("DIAGRAM REVISION TASK GUIDE", 28),
  centeredBold("Use Case · Design Class · Domain Class Diagrams", 24),
  empty(), empty(),
  centered("For internal review and correction by the group", 22),
  empty(),
  centered("Ilanga · Palanca · Sintos", 22),
  centered("Ateneo de Davao University", 22),
  centered("System Integration and Architecture 2 | S.Y. 2025–2026, 2nd Semester", 22),
  empty(), empty(),
  centered("Based on full manuscript review + codebase cross-reference", 20),
  centered("April 30, 2026", 20),
  empty(), empty(), empty(),
  new Paragraph({
    children: [
      new TextRun({ text: '✓  GREEN', bold: true, size: 22, font: TNR, color: '1E8449' }),
      new TextRun({ text: '  =  Correct — no change needed (or minor elaboration only)', size: 22, font: TNR })
    ], spacing: { before: 60, after: 40 }
  }),
  new Paragraph({
    children: [
      new TextRun({ text: '✗  RED', bold: true, size: 22, font: TNR, color: 'C0392B' }),
      new TextRun({ text: '  =  Wrong — must be corrected before submission', size: 22, font: TNR })
    ], spacing: { before: 40, after: 40 }
  }),
  new Paragraph({
    children: [
      new TextRun({ text: '→  BLUE', bold: true, size: 22, font: TNR, color: '1A5276' }),
      new TextRun({ text: '  =  Action to take when redrawing the diagram', size: 22, font: TNR })
    ], spacing: { before: 40, after: 60 }
  }),
  pg()
)

// ── SECTION 1: USE CASE DIAGRAMS ───────────────────────────────────────────
children.push(
  h1("PART 1 — USE CASE DIAGRAMS (2.3.1 to 2.3.8)"),
  body("Each subsection below covers one use case diagram. If a diagram is correct, it is marked as such and elaborated. If it needs changes, the exact corrections are listed."),
  empty()
)

// 2.3.1
children.push(
  sectionBox("2.3.1 — User and Role Management System (RBAC)"),
  empty(),
  correct("Role management use cases are correct: Create Custom Role, View Role, Delete Role, Modify Role Access Rights — all match the system."),
  correct("Create Employee/User Profile (Step 1) with <<include>> sub-forms (Account Details, Employment Details, Personal Information, Pay Rate, Government Details, Emergency Contact) — structure is acceptable."),
  correct("Manage Employee Documents (Step 2) with <<include>> for Upload Documents — correct."),
  empty(),
  fix("Login and Logout use cases are MISSING from this diagram entirely."),
  fix("There is only one actor (Store Owner / Admin). A second actor is needed for Login and Logout."),
  empty(),
  label("WHAT TO ADD:"),
  task("Add a second actor labeled 'User' (stick figure, left side of diagram)."),
  task("Draw a line from [User] → Login"),
  task("Draw a line from [User] → Logout"),
  task("These two use cases do not belong only to the Admin — any system user logs in and out."),
  empty(),
  label("CORRECTED ACTOR AND USE CASE ADDITIONS:"),
  mono("Actor: [User]"),
  mono("  [User] ──► Login"),
  mono("  [User] ──► Logout"),
  mono(""),
  mono("Actor: [Store Owner / Admin]   (keep all existing connections)"),
  empty(), pg()
)

// 2.3.2
children.push(
  sectionBox("2.3.2 — Inventory Management System"),
  empty(),
  correct("Product creation, stock-in (manual and from bale), stock-out, damaged item recording, item repair, shrinkage recording, barcode/QR generation, and inventory reports — all correct in structure."),
  correct("Actors and connections for Store Manager and Clerk are appropriate."),
  empty(),
  fix("Low Stock Alert is shown as the SYSTEM automatically notifying the Manager. This is factually wrong."),
  body("The system has a low-stock query endpoint (GET /inventory/alerts/low-stock). It returns a list of products below threshold only when a user actively checks it. No automatic notification is sent to anyone."),
  empty(),
  label("WHAT TO CHANGE:"),
  task("Remove any arrow showing the system pushing a Low Stock Alert automatically."),
  task("Replace with a use case: 'View Low Stock Alerts'"),
  task("Connect this use case to the [Store Manager / Owner] actor with a normal association line."),
  task("This is a user-initiated query, not a system-triggered event."),
  empty(),
  label("CORRECTED LOW STOCK ALERT:"),
  mono("BEFORE: [System] ──► Low Stock Alert ──► 'Notifies Manager'"),
  mono("AFTER:  [Store Manager / Owner] ──► View Low Stock Alerts"),
  mono("         (user opens the alerts page; system returns the list)"),
  empty(), pg()
)

// 2.3.3
children.push(
  sectionBox("2.3.3 — Sales Management System (POS)"),
  empty(),
  correct("Barcode/QR scanning, compute totals, accept payment, print receipt, process sales return — all correct."),
  correct("Actors (Cashier, Admin) and their connections are appropriate."),
  empty(),
  fix("'Add product to sales cart' — the system does not use a cart object. Items are added to a draft sale record stored in the database."),
  fix("The checkout process is shown as a single step. In the system, checkout is a separate action that converts a DRAFT sale to COMPLETED. Stock is only deducted at checkout, not when items are added."),
  empty(),
  label("WHAT TO CHANGE:"),
  task("Rename 'Add product to sales cart' → 'Add Product to Draft Sale'"),
  task("Split the sale process into two distinct use cases:"),
  task("  (1) 'Create Draft Sale' — system auto-creates this when POS is opened"),
  task("  (2) 'Checkout / Confirm Payment' — this finalizes, deducts stock, assigns receipt number"),
  task("Add 'Cancel Draft Sale' connected to [Cashier] — this deletes the draft record from the database entirely, not just clears a screen."),
  empty(),
  label("CORRECTED STRUCTURE:"),
  mono("[Cashier] ──► Create Draft Sale"),
  mono("[Cashier] ──► Add Product to Draft Sale"),
  mono("                 <<include>>──► Scan Barcode / Search Product"),
  mono("[Cashier] ──► Checkout (Confirm Payment)"),
  mono("[Cashier] ──► Cancel Draft Sale"),
  mono("[Cashier] ──► Process Sales Return"),
  empty(), pg()
)

// 2.3.4
children.push(
  sectionBox("2.3.4 — Purchasing Management System"),
  empty(),
  correct("Create Bale Purchase Order, Receive Bale, View Purchase History — correct."),
  correct("Connecting the Manager actor to bale operations is appropriate."),
  empty(),
  fix("'Add multiple order lines in one purchase order' — this DOES NOT EXIST in the system. One bale purchase record equals one category. There is no order line item table."),
  fix("Bale breakdown description implies the system passively converts items. In reality, the system AUTO-CREATES product records for Premium and Standard grades immediately when breakdown is saved."),
  fix("'P.O. closes automatically after breakdown' — the po_status must be manually updated to COMPLETED. It does not close automatically."),
  empty(),
  label("WHAT TO CHANGE:"),
  task("REMOVE the 'Add multiple order lines' use case completely."),
  task("In the breakdown use case, add a note or <<include>> showing: 'System auto-generates product records for Premium and Standard grades'"),
  task("Low-grade and damaged items are recorded as counts only — no products are auto-created for them. Add this as a note."),
  task("Remove any notation showing the P.O. closing automatically."),
  empty(),
  label("CORRECTED BREAKDOWN USE CASE:"),
  mono("[Manager] ──► Process Bale Breakdown"),
  mono("                 <<include>>──► Record Grade Quantities"),
  mono("                 <<extend>>──► Record Damaged / Unsellable"),
  mono("                 System auto-creates:"),
  mono("                   - 1 product for Premium grade"),
  mono("                   - 1 product for Standard grade"),
  mono("                   (low-grade and damaged: counted only, no product created)"),
  empty(), pg()
)

// 2.3.5
children.push(
  sectionBox("2.3.5 — Payroll Management System"),
  empty(),
  correct("Create Payroll Period and Record Attendance are correct as starting points."),
  correct("Sync Attendance and Edit Inputs as related use cases are correct."),
  empty(),
  fix("'Process Payroll' is shown as a single use case. Payroll has a 6-stage lifecycle — each stage is a separate, permission-controlled operation."),
  fix("'Finalize Payroll → Owner Approves' — there is NO owner-specific approval gate. Any user with the correct permission (payroll.finalize) can finalize. Showing 'Owner' as the only approver is factually wrong."),
  fix("'Generate Payslip PDFs' — the server does not generate PDFs. Payslip data is stored in the database. PDF rendering happens in the browser."),
  empty(),
  label("WHAT TO CHANGE:"),
  task("Split 'Process Payroll' into 5 separate use cases:"),
  task("  1. Compute Payroll"),
  task("  2. Finalize Payroll  (locks results, no more edits)"),
  task("  3. Release Payroll   (marks as disbursed)"),
  task("  4. Void Payroll      (cancels the run — can happen before release)"),
  task("Label the actor for finalize/release as 'Authorized User' not 'Owner specifically.'"),
  task("Remove 'Generate payslip PDFs' — replace with 'Payslip data stored; viewable by employee'"),
  empty(),
  label("CORRECTED LIFECYCLE USE CASES:"),
  mono("[HR / Manager] ──► Create Payroll Period"),
  mono("[HR / Manager] ──► Sync Attendance to Inputs"),
  mono("[HR / Manager] ──► Edit Payroll Inputs"),
  mono("[Authorized User] ──► Compute Payroll"),
  mono("[Authorized User] ──► Finalize Payroll"),
  mono("[Authorized User] ──► Release Payroll"),
  mono("[Authorized User] ──► Void Payroll"),
  empty(), pg()
)

// 2.3.6
children.push(
  sectionBox("2.3.6 — Supplier Management System"),
  empty(),
  correct("Manage Supplier Profiles — correct."),
  correct("View Supplier List/Directory — correct."),
  correct("Select Supplier for Transaction — correct."),
  correct("All three use cases match the system exactly. Actor (Manager) and connections are appropriate."),
  body("No changes needed for this diagram."),
  empty(), pg()
)

// 2.3.7
children.push(
  sectionBox("2.3.7 — Category and Type Management System"),
  empty(),
  correct("Create Product Category, Update Product Category, View Categories — correct."),
  correct("Create/Update Product Type under a Category — correct."),
  correct("Load Type Options based on selected Category — correct."),
  empty(),
  fix("The relationship between 'Link Product Type to Product Records' and the PRODUCT entity is shown with a solid line, implying a database foreign key. There is no FK in the database."),
  body("The product stores the type name as plain text in its subcategory field. The API validates this against the active types for that category at runtime — there is no database-level enforcement."),
  empty(),
  label("WHAT TO CHANGE:"),
  task("Change the association line from Product to Category Type to a DASHED line."),
  task("Add label on the dashed line: 'validated at application layer (no FK)'"),
  empty(), pg()
)

// 2.3.8
children.push(
  sectionBox("2.3.8 — Customer Management System"),
  empty(),
  correct("Manage Customer Records — correct."),
  correct("View Customer Profile — correct."),
  correct("Search Customer Record — correct."),
  correct("Link Customer to Sale Transaction — correct."),
  correct("Track Purchase History — correct."),
  correct("Actor (Manager / Cashier) and connections are appropriate."),
  body("No changes needed for this diagram."),
  empty(), pg()
)

// ── SECTION 2: DESIGN CLASS DIAGRAMS ───────────────────────────────────────
children.push(
  h1("PART 2 — DESIGN CLASS DIAGRAMS (2.4.1 to 2.4.8)"),
  body("Each design class diagram is reviewed below. The corrected class structures are provided in text notation that can be directly used to redraw each diagram."),
  empty()
)

// 2.4.1
children.push(
  sectionBox("2.4.1 — User and Role Management System (RBAC)"),
  empty(),
  correct("ROLE class methods are correct: createRole(), updateRole(), assignPermissions(), deleteRole()."),
  correct("USER class methods are correct: login(), logout(), createProfile(), updateProfile()."),
  correct("The existence of a relationship between ROLE and USER is conceptually correct."),
  empty(),
  fix("ROLE class has '+String permissions' as a direct attribute. Permissions are NOT a column on the roles table. They are a separate entity linked through a junction table."),
  fix("USER class has '+int role_id' as a direct attribute. There is no role_id column on the users table. Users link to roles through a user_roles junction table (many-to-many)."),
  fix("Relationship is shown as 1 ROLE → 0..* USER (one-to-many). This is wrong. One user can have multiple roles; one role can be assigned to multiple users. It must be many-to-many."),
  empty(),
  label("CORRECTED CLASS DIAGRAM (redraw as follows):"),
  empty(),
  mono("┌────────────────────────────┐    *        *    ┌────────────────────────────┐"),
  mono("│            ROLE            │─────────────────│        PERMISSION          │"),
  mono("├────────────────────────────┤  via role_perms  ├────────────────────────────┤"),
  mono("│ +int role_id               │                  │ +int permission_id         │"),
  mono("│ +String role_name          │                  │ +String name               │"),
  mono("│ +String description        │                  │   (format: module.action)  │"),
  mono("├────────────────────────────┤                  │ +String description        │"),
  mono("│ +createRole()              │                  └────────────────────────────┘"),
  mono("│ +updateRole()              │"),
  mono("│ +assignPermissions()       │"),
  mono("│ +deleteRole()              │"),
  mono("└────────────────────────────┘"),
  mono("           *"),
  mono("           │  (via user_roles junction, many-to-many)"),
  mono("           *"),
  mono("┌────────────────────────────┐"),
  mono("│            USER            │"),
  mono("├────────────────────────────┤"),
  mono("│ +int user_id               │"),
  mono("│ +String username           │"),
  mono("│ +String password_hash      │"),
  mono("│ +String full_name          │"),
  mono("│ +String email              │"),
  mono("│ +int is_active             │"),
  mono("├────────────────────────────┤"),
  mono("│ +login()                   │"),
  mono("│ +logout()                  │"),
  mono("│ +createProfile()           │"),
  mono("│ +updateProfile()           │"),
  mono("└────────────────────────────┘"),
  empty(),
  task("Remove '+String permissions' from ROLE attributes."),
  task("Remove '+int role_id' from USER attributes."),
  task("Add PERMISSION as a new class."),
  task("Change ROLE-USER relationship from 1:0..* to *:* (many-to-many)."),
  task("Label the ROLE-USER association: 'via user_roles'"),
  task("Label the ROLE-PERMISSION association: 'via role_permissions'"),
  empty(), pg()
)

// 2.4.2
children.push(
  sectionBox("2.4.2 — Inventory Management System"),
  empty(),
  correct("PRODUCT class exists — correct."),
  correct("Stock transaction record entity — correct in concept."),
  correct("Damaged item entity — correct in concept."),
  correct("Stock adjustment entity — correct in concept."),
  empty(),
  fix("PRODUCT class is missing critical bale-linked fields."),
  fix("STOCK_IN_RECORD should be renamed INVENTORY_TRANSACTION — it covers all movement types (IN, OUT, ADJUST, RETURN), not just stock-in."),
  fix("DAMAGED_ITEM should be renamed DAMAGED_INVENTORY to match the actual table name."),
  empty(),
  label("ADD these fields to the PRODUCT class:"),
  task("+String item_code             (boutique-specific identifier)"),
  task("+int bale_purchase_id         (FK — which bale this product came from, null if manual)"),
  task("+String condition_grade       (premium / standard / low_grade / damaged / unsellable)"),
  task("+Decimal allocated_cost       (bale cost ÷ total saleable items)"),
  task("+String product_source        (bale_breakdown or null for manually created products)"),
  task("+String status                (available / sold / damaged / reserved / archived)"),
  empty(),
  label("RENAME and ADD to transaction class:"),
  task("Rename STOCK_IN_RECORD → INVENTORY_TRANSACTION"),
  task("Add: +String transaction_type  (IN / OUT / ADJUST / RETURN)"),
  task("Add: +int balance_after        (stock count after the transaction)"),
  task("Rename DAMAGED_ITEM → DAMAGED_INVENTORY"),
  task("Add: +String damage_source     (bale_breakdown / manual_damage / sales_return)"),
  empty(), pg()
)

// 2.4.3
children.push(
  sectionBox("2.4.3 — Sales Management System (POS)"),
  empty(),
  correct("SALES_TRANSACTION (Sale) entity with header fields — correct in concept."),
  correct("SALES_ITEM (Sale Item) entity linked to SALE — correct in concept."),
  correct("CUSTOMER linked to SALE — correct."),
  correct("SALES_RETURN entity — correct in concept."),
  empty(),
  fix("SALES_TRANSACTION is missing the DRAFT status — this is critical. POS creates a DRAFT sale first before any final record exists."),
  fix("SALES_ITEM is missing snapshot fields — the system stores a frozen copy of the product name, SKU, barcode, size, and color at the time of checkout so the record never changes even if the product is edited later."),
  fix("If a clearCart() method exists on the sale class — rename it to cancelDraft(). Clearing a cart is a UI concept; the system deletes the entire DRAFT record from the database."),
  empty(),
  label("ADD to SALE class:"),
  task("+String status   (DRAFT / COMPLETED / REFUNDED / CANCELLED)"),
  task("+String receipt_no   (assigned only at checkout, null while DRAFT)"),
  empty(),
  label("ADD to SALE_ITEM class (snapshot fields):"),
  task("+String product_name_snapshot"),
  task("+String sku_snapshot"),
  task("+String barcode_snapshot"),
  task("+String size_snapshot"),
  task("+String color_snapshot"),
  task("These fields are stored at checkout and never change, even if the product is later edited."),
  empty(),
  label("RENAME method if present:"),
  task("clearCart() → cancelDraft()"),
  empty(), pg()
)

// 2.4.4
children.push(
  sectionBox("2.4.4 — Purchasing Management System"),
  empty(),
  fix("BALE_PURCHASE_ORDER and BALE_PURCHASE_RECORD are shown as two separate classes. They are the SAME database table (bale_purchases). This must be merged into one class."),
  fix("ORDER_LINE_ITEM class must be REMOVED entirely. This table does not exist in the system. There are no line items on a bale purchase — one record equals one category."),
  fix("BALE_BREAKDOWN is missing key fields."),
  empty(),
  label("REMOVE:"),
  task("Delete BALE_PURCHASE_ORDER class"),
  task("Delete BALE_PURCHASE_RECORD class"),
  task("Delete ORDER_LINE_ITEM class"),
  empty(),
  label("REPLACE WITH one unified BALE_PURCHASE class:"),
  mono("┌────────────────────────────────┐"),
  mono("│         BALE_PURCHASE          │"),
  mono("├────────────────────────────────┤"),
  mono("│ +int id                        │"),
  mono("│ +String bale_batch_no          │  ← format: BALE-PO-0001"),
  mono("│ +int supplier_id               │"),
  mono("│ +String supplier_name          │"),
  mono("│ +Date purchase_date            │"),
  mono("│ +String bale_category          │"),
  mono("│ +Decimal bale_cost             │"),
  mono("│ +int quantity_ordered          │"),
  mono("│ +int quantity_received         │"),
  mono("│ +Date expected_delivery_date   │"),
  mono("│ +Date actual_delivery_date     │"),
  mono("│ +String payment_status         │  ← PAID / PARTIAL / UNPAID"),
  mono("│ +String po_status              │  ← PENDING / ORDERED / RECEIVED"),
  mono("│                                │     / COMPLETED / CANCELLED"),
  mono("└────────────────────────────────┘"),
  empty(),
  label("CORRECT BALE_BREAKDOWN class — add missing fields:"),
  task("+int low_grade_items            (was missing)"),
  task("+int saleable_items             (auto-computed: total - damaged)"),
  task("+Decimal cost_per_saleable_item (auto-computed: bale_cost ÷ saleable_items)"),
  task("+int encoded_by                 (FK to USER — who entered the breakdown)"),
  empty(),
  label("ADD relationship between BALE_BREAKDOWN and PRODUCT:"),
  task("BALE_BREAKDOWN ──[1]──generates──[0..2]── PRODUCT"),
  task("One breakdown auto-creates up to 2 products: one for Premium grade and one for Standard grade."),
  task("Low-grade and damaged items are counted in the breakdown but do NOT generate product records."),
  empty(), pg()
)

// 2.4.5
children.push(
  sectionBox("2.4.5 — Payroll Management System"),
  empty(),
  correct("PAYROLL_PROFILE entity — correct in concept."),
  correct("PAYROLL_PERIOD entity — correct in concept."),
  empty(),
  fix("PAYROLL_RECORD is a single class that combines two separate database tables. It must be split into PAYROLL_INPUTS (what goes in before computation) and PAYROLL_RUN_ITEM (the computed result per employee)."),
  fix("PAYROLL_ADJUSTMENT does not exist as a separate table. Bonuses, deductions, and manual adjustments are fields on PAYROLL_INPUTS."),
  fix("PAYSLIP does not exist as a separate table. Payslip data is stored in PAYROLL_RUN_ITEM and PAYROLL_ITEM_LINE. The payslip is a view generated from those records — it is not a stored entity."),
  empty(),
  label("REMOVE:"),
  task("Delete PAYROLL_ADJUSTMENT class"),
  task("Delete PAYSLIP class"),
  empty(),
  label("SPLIT PAYROLL_RECORD into two classes:"),
  mono("┌──────────────────────────────┐"),
  mono("│       PAYROLL_INPUTS         │  ← data entered before computation"),
  mono("├──────────────────────────────┤"),
  mono("│ +int payroll_period_id       │"),
  mono("│ +int user_id                 │"),
  mono("│ +int days_worked             │"),
  mono("│ +int overtime_hours          │"),
  mono("│ +int late_minutes            │"),
  mono("│ +int absent_days             │"),
  mono("│ +int paid_leave_days         │"),
  mono("│ +Decimal manual_bonus        │"),
  mono("│ +Decimal loan_deduction      │"),
  mono("│ +Decimal manual_deduction    │"),
  mono("└──────────────────────────────┘"),
  empty(),
  mono("┌──────────────────────────────┐"),
  mono("│      PAYROLL_RUN_ITEM        │  ← computed result per employee"),
  mono("├──────────────────────────────┤"),
  mono("│ +int payroll_run_id          │"),
  mono("│ +int user_id                 │"),
  mono("│ +Decimal gross_pay           │"),
  mono("│ +Decimal employee_sss        │"),
  mono("│ +Decimal employee_philhealth │"),
  mono("│ +Decimal employee_pagibig    │"),
  mono("│ +Decimal withholding_tax     │"),
  mono("│ +Decimal total_deductions    │"),
  mono("│ +Decimal net_pay             │"),
  mono("│ +JSON profile_snapshot       │  ← frozen at computation time"),
  mono("└──────────────────────────────┘"),
  empty(),
  label("ADD to PAYROLL_PERIOD — status lifecycle:"),
  task("+String status   (draft / computed / finalized / released / void)"),
  empty(), pg()
)

// 2.4.6
children.push(
  sectionBox("2.4.6 — Supplier Management System"),
  empty(),
  correct("SUPPLIER class is correct: supplier_id, name, contact_person, phone, email, address — all match the actual database table."),
  empty(),
  fix("If this diagram shows BALE_PURCHASE_ORDER and BALE_PURCHASE_RECORD as two separate classes linked to SUPPLIER — apply the same correction as 2.4.4: merge them into one BALE_PURCHASE class."),
  fix("If ORDER_LINE_ITEM appears in this diagram — remove it entirely."),
  empty(),
  label("CORRECTED RELATIONSHIP:"),
  mono("SUPPLIER ──[1]────────[0..*]── BALE_PURCHASE"),
  mono("(one supplier can have many bale purchases)"),
  empty(), pg()
)

// 2.4.7
children.push(
  sectionBox("2.4.7 — Category and Type Management System"),
  empty(),
  correct("PRODUCT_CATEGORY class is correct: category_id, category_name, description — matches the categories table."),
  correct("The 1:many relationship from CATEGORY to PRODUCT_TYPE is correct — one category can have many types."),
  empty(),
  fix("PRODUCT_TYPE must be renamed to CATEGORY_TYPE. The actual database table is named category_types, not product_type."),
  fix("The relationship line from PRODUCT to CATEGORY_TYPE is shown as a solid FK line. There is NO database foreign key from products to category_types. The type is stored as plain text in the products.subcategory column and is validated by the API only."),
  empty(),
  label("CORRECTIONS:"),
  task("Rename PRODUCT_TYPE → CATEGORY_TYPE"),
  task("Add +int is_active to CATEGORY_TYPE"),
  task("Change the PRODUCT → CATEGORY_TYPE line from SOLID to DASHED"),
  task("Add label on dashed line: 'validated at API layer (no database FK)'"),
  empty(),
  label("CORRECTED RELATIONSHIPS:"),
  mono("CATEGORY  ──[1]────[0..*]──  CATEGORY_TYPE     (solid line — real FK)"),
  mono("PRODUCT   ──[*]────[1]──────  CATEGORY          (solid line — real FK)"),
  mono("PRODUCT   - - - - - - - - -►  CATEGORY_TYPE     (dashed — API validation only)"),
  empty(), pg()
)

// 2.4.8
children.push(
  sectionBox("2.4.8 — Customer Management System"),
  empty(),
  correct("CUSTOMER class with basic fields — correct."),
  correct("SALES_TRANSACTION (SALE) linked to CUSTOMER — correct in concept."),
  correct("Relationship multiplicity (one customer to many sales) — correct."),
  empty(),
  fix("CUSTOMER class is missing the Philippine address fields added by the database migration."),
  empty(),
  label("ADD to CUSTOMER class:"),
  task("+String region_name"),
  task("+String province_name"),
  task("+String city_name"),
  task("+String barangay_name"),
  task("+String address_line"),
  task("+String postal_code"),
  body("These fields store the full Philippine Standard Geographic Code (PSGC) address hierarchy. They were added to support the region-province-city-barangay address selection in the customer form."),
  empty(), pg()
)

// ── SECTION 3: DOMAIN CLASS DIAGRAM ────────────────────────────────────────
children.push(
  h1("PART 3 — DOMAIN CLASS DIAGRAM (Section 4)"),
  body("The Domain Class Diagram is the consolidated system-wide model. All corrections from Parts 1 and 2 apply here. This section lists every change needed and provides the corrected class structures and relationships."),
  empty(),
  sectionBox("Step 1 — REMOVE these classes (they do not exist in the database)"),
  empty(),
  makeTable(
    ['Class to Remove', 'Why'],
    [
      ['BALE_PURCHASE_ORDER', 'Not a separate table. Merged into BALE_PURCHASE (same table: bale_purchases).'],
      ['ORDER_LINE_ITEM', 'Does not exist at all. No table, no route, no migration. Remove completely.'],
    ],
    [30, 70]
  ),
  empty(),
  sectionBox("Step 2 — RENAME these classes"),
  empty(),
  makeTable(
    ['Current Name', 'Correct Name', 'Reason'],
    [
      ['BALE_PURCHASE_RECORD', 'BALE_PURCHASE', 'Same table as BALE_PURCHASE_ORDER. Merge both into this one.'],
      ['PRODUCT_TYPE', 'CATEGORY_TYPE', 'Actual table name is category_types.'],
      ['SALES_TRANSACTION', 'SALE', 'Actual table name is sales.'],
      ['DAMAGED_ITEM', 'DAMAGED_INVENTORY', 'Actual table name is damaged_inventory.'],
    ],
    [25, 25, 50]
  ),
  empty(),
  sectionBox("Step 3 — ADD these classes (missing from domain diagram)"),
  empty(),
  makeTable(
    ['Class to Add', 'Key Fields', 'Connects to'],
    [
      ['PRODUCT', 'id, sku, item_code, name, category_id, subcategory, selling_price, allocated_cost, condition_grade, bale_purchase_id, stock_quantity, status', 'CATEGORY, CATEGORY_TYPE (dashed), BALE_PURCHASE, SALE_ITEM'],
      ['SALE', 'id, sale_number, status (DRAFT/COMPLETED/REFUNDED/CANCELLED), clerk_id, customer_id, subtotal, tax, discount, total, receipt_no', 'USER, CUSTOMER, SALE_ITEM'],
      ['SALE_ITEM', 'id, sale_id, product_id, qty, unit_price, line_total, product_name_snapshot, sku_snapshot, barcode_snapshot', 'SALE, PRODUCT'],
      ['INVENTORY_TRANSACTION', 'id, product_id, transaction_type (IN/OUT/ADJUST/RETURN), quantity, balance_after, reference, reason', 'PRODUCT'],
      ['PERMISSION', 'id, name (format: module.action), description', 'ROLE (via role_permissions), USER (via user_permissions)'],
    ],
    [20, 50, 30]
  ),
  empty(),
  sectionBox("Step 4 — FIX these relationships"),
  empty(),
  makeTable(
    ['Relationship', 'Current (Wrong)', 'Correct'],
    [
      ['ROLE → USER', '1 ROLE assigns to 0..* USER (one-to-many)', 'ROLE * ──── * USER (many-to-many via user_roles junction)'],
      ['ROLE → permissions', '"permissions" string attribute on ROLE', 'ROLE * ──── * PERMISSION (via role_permissions junction)'],
      ['PRODUCT → CATEGORY_TYPE', 'Solid line (implies database FK)', 'Dashed line labeled "validated at API layer (no FK)"'],
      ['BALE_BREAKDOWN → PRODUCT', 'Not shown', 'BALE_BREAKDOWN [1] ──generates── [0..2] PRODUCT (premium + standard only)'],
      ['BALE_PURCHASE → BALE_BREAKDOWN', 'Not shown or shown via removed classes', 'BALE_PURCHASE [1] ──── [0..1] BALE_BREAKDOWN (one-to-one)'],
      ['USER → EMPLOYEE', 'Not shown', 'USER [1] ──── [1] EMPLOYEE (auto-created when employee is registered)'],
    ],
    [22, 39, 39]
  ),
  empty(),
  sectionBox("Step 5 — CORRECTED FIELD ADDITIONS per class"),
  empty(),
  label("BALE_PURCHASE (merged class):"),
  mono("  +String bale_batch_no, +String po_status (PENDING/ORDERED/RECEIVED/COMPLETED/CANCELLED)"),
  mono("  +int quantity_ordered, +int quantity_received"),
  mono("  +Date expected_delivery_date, +Date actual_delivery_date"),
  empty(),
  label("BALE_BREAKDOWN:"),
  mono("  ADD: +int low_grade_items, +int saleable_items, +Decimal cost_per_saleable_item"),
  empty(),
  label("CUSTOMER:"),
  mono("  ADD: +String region_name, +String province_name, +String city_name"),
  mono("  ADD: +String barangay_name, +String address_line, +String postal_code"),
  empty(),
  label("USER:"),
  mono("  REMOVE: +int role_id  (no such column)"),
  mono("  ADD:    +String full_name, +String email, +int is_active"),
  empty(),
  label("ROLE:"),
  mono("  REMOVE: +String permissions  (not a column — separate entity)"),
  empty(),
  label("PAYROLL_PERIOD:"),
  mono("  ADD: +String status  (draft / computed / finalized / released / void)"),
  empty(), pg()
)

// ── SECTION 4: MASTER SUMMARY ──────────────────────────────────────────────
children.push(
  h1("PART 4 — MASTER SUMMARY TABLE"),
  body("Use this as a quick-reference checklist when redrawing all diagrams."),
  empty(),
  makeTable(
    ['Diagram', 'Status', 'Required Action'],
    [
      ['UC 2.3.1 RBAC', 'Minor Fix', 'Add User actor + Login + Logout use cases'],
      ['UC 2.3.2 Inventory', 'Minor Fix', 'Change Low Stock Alert from auto-notify to user-query use case'],
      ['UC 2.3.3 POS', 'Minor Fix', 'Rename cart → draft sale; split add-item and checkout; add cancel draft'],
      ['UC 2.3.4 Purchasing', 'Moderate Fix', 'Remove "multiple order lines"; correct breakdown to show auto-product creation'],
      ['UC 2.3.5 Payroll', 'Moderate Fix', 'Split into 5 lifecycle stages; remove owner-specific approval; fix payslip description'],
      ['UC 2.3.6 Supplier', 'CORRECT', 'No changes needed'],
      ['UC 2.3.7 Category', 'Minor Fix', 'Change PRODUCT → CATEGORY_TYPE line from solid to dashed'],
      ['UC 2.3.8 Customer', 'CORRECT', 'No changes needed'],
      ['DC 2.4.1 RBAC', 'Moderate Fix', 'Remove permissions from ROLE; remove role_id from USER; add PERMISSION class; make ROLE-USER many-to-many'],
      ['DC 2.4.2 Inventory', 'Minor Fix', 'Add bale fields to PRODUCT; rename transaction class; rename damaged class'],
      ['DC 2.4.3 POS', 'Minor Fix', 'Add DRAFT to SALE status; add snapshot fields to SALE_ITEM; rename clearCart'],
      ['DC 2.4.4 Purchasing', 'Critical Fix', 'Remove ORDER_LINE_ITEM; merge BALE_PURCHASE_ORDER + RECORD into one class; fix BALE_BREAKDOWN fields'],
      ['DC 2.4.5 Payroll', 'Moderate Fix', 'Split PAYROLL_RECORD into INPUTS + RUN_ITEM; remove PAYSLIP; remove PAYROLL_ADJUSTMENT'],
      ['DC 2.4.6 Supplier', 'Same as 2.4.4', 'Merge bale classes; remove ORDER_LINE_ITEM if present'],
      ['DC 2.4.7 Category', 'Minor Fix', 'Rename PRODUCT_TYPE to CATEGORY_TYPE; change PRODUCT-CATEGORY_TYPE line to dashed'],
      ['DC 2.4.8 Customer', 'Minor Fix', 'Add Philippine address fields to CUSTOMER class'],
      ['Domain Diagram Sec. 4', 'Critical Fix', 'Remove 2 classes; merge bale classes; add PRODUCT/SALE/SALE_ITEM/PERMISSION; fix 6 relationships'],
    ],
    [22, 14, 64]
  ),
  empty(),
  body("Priority order for corrections: Start with DC 2.4.4 (Purchasing) and the Domain Class Diagram — these have the most structural errors. Then fix DC 2.4.1 (RBAC) and DC 2.4.5 (Payroll). All use case diagram fixes are minor and can be done last."),
  empty()
)

// ── BUILD ───────────────────────────────────────────────────────────────────
const doc = new Document({
  styles: {
    default: {
      document: { run: { font: TNR, size: 22 }, paragraph: { spacing: { line: 320 } } }
    },
    paragraphStyles: [
      {
        id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal',
        run: { bold: true, size: 32, font: TNR, color: '1F3864' },
        paragraph: { spacing: { before: 480, after: 240 }, border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: '1F3864' } } }
      },
      {
        id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal',
        run: { bold: true, size: 26, font: TNR, color: '2E4057' },
        paragraph: { spacing: { before: 320, after: 160 } }
      },
      {
        id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal',
        run: { bold: true, size: 24, font: TNR, color: '2E6DA4' },
        paragraph: { spacing: { before: 240, after: 120 } }
      }
    ]
  },
  sections: [{
    properties: {
      page: {
        margin: {
          top: convertInchesToTwip(1.0),
          right: convertInchesToTwip(1.0),
          bottom: convertInchesToTwip(1.0),
          left: convertInchesToTwip(1.5)
        }
      }
    },
    children
  }]
})

Packer.toBuffer(doc).then(buf => {
  fs.writeFileSync('DIAGRAM_REVISION_GUIDE.docx', buf)
  console.log('✓ DIAGRAM_REVISION_GUIDE.docx created')
}).catch(err => { console.error(err); process.exit(1) })
