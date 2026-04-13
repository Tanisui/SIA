# HPRT N80 Barcode Workflow

## Scope
This guide covers the store label workflow for the POS system:
- Generate and enforce unique product barcodes.
- Print/export product barcode labels.
- Scan labels for Sales and Inventory transactions.

## Requirements
- HPRT N80 scanner connected in **USB HID keyboard mode**.
- Scanner suffix configured to send **Enter** after each scan.
- Printed barcode type: **Code 128**.
- Product barcode policy: **one unique barcode per product**.

## Barcode Data Rules
- Barcode format: uppercase letters, numbers, `.`, `_`, `-`, length `4-64`.
- Creating a product without barcode auto-generates one from product id (Code 128 compatible).
- Duplicate barcodes are blocked.
- Product barcode cannot be cleared once assigned.

## Migration / Existing Data
- `backend/migrate_inventory.js` now:
1. Normalizes existing barcodes to uppercase.
2. Auto-fills missing barcodes.
3. Stops migration when duplicate barcodes exist (lists affected product ids).
4. Adds unique index `ux_products_barcode` when data is clean.

## Store Operations

### Sales Scan Flow
- In Sales, focus **Product Search**.
- Scan barcode then Enter.
- Exact barcode match auto-adds product to cart with quantity `1`.
- Repeat scan to add more quantity.

### Inventory Scan Flow
- In Stock In, Stock Out (Adjustment/Damage), and Supplier Returns:
- Scan barcode in the **Scan Barcode** field then press Enter.
- System auto-selects the matching product.
- Staff enters quantity/reason and submits transaction.

## Barcode Label Module
- Open **Inventory > Barcode Labels**.
- Select products and set manual copy count per product.
- Output options:
- **Print A4 (3x8)** label layout (24 labels per page).
- **Print QR A4 (3x8)** using each product barcode as QR payload.
- **Download CSV** for external printing workflows.

## Labeling SOP (Print and Paste)
1. Queue products and copies in Barcode Labels.
2. Print sample sheet first and verify scanner readability.
3. Paste labels on product tags/shelves.
4. Run test scans in Sales and Inventory screens.
5. Reprint unreadable labels immediately.

## Troubleshooting
- No scan captured:
- confirm cursor focus is inside a scan input field.
- Wrong product selected:
- check for duplicate/incorrect barcode assignment in products.
- Barcode does not scan from label:
- increase print quality, ensure paper/ink contrast, and avoid scaling artifacts.
- Scanner adds no Enter action:
- reconfigure scanner suffix to Enter in scanner settings.
