Step-by-step: How to use your barcode module
1. One-time setup (required)
Open terminal in project root.
Go to backend:
cd backend
Install dependencies if not yet:
npm install
Run barcode migration/index script:
npm run migrate:barcode
Expected output:

A unique barcode index already exists.
or
Created unique index uq_products_barcode on products(barcode).
If it says duplicate barcode found:

Fix duplicates in products table first.
Re-run npm run migrate:barcode.
2. Start the system
Start backend:
cd backend
npm start
Start frontend in another terminal:
cd frontend
npm install
npm run dev
Important:

Frontend uses npm run dev, not npm run start.
3. Create products with barcode
Open Inventory page.
Go to Products tab.
Click + Create Product.
Fill required fields:
Name
Price
Barcode field:
Enter barcode manually, or
Leave blank to auto-generate.
Save product.
Result:

Product is created with unique barcode.
Duplicate barcode is blocked.
4. Use barcode scanning in POS
Open Sales page.
Stay in Point of Sale tab.
In Scan Barcode (2D Scanner), put cursor there.
Scan product barcode using your scanner.
Scan same barcode again to increase quantity.
Set payment method.
Click Finalize Order.
Result:

Product is auto-added by barcode lookup.
Stock is validated before finalize.
Sale is recorded and stock is deducted.
5. Use barcode in cycle count
Open Inventory page.
Go to Cycle Count tab.
In Scan Barcode, scan physical items one by one.
Count sheet updates counted quantity per scan.
Optional: edit counted quantity manually.
Enter Reference (example: CC-2026-03-16-A).
Click Post Reconciliation.
Result:

Stock adjusts to counted quantity.
Variance is logged as inventory adjustments.
6. Import/export product catalog
Open Inventory → Products.
Click Export CSV to download current product list.
Click Import JSON to upload products in bulk.
Toggle Overwrite existing SKU/Barcode if you want update behavior.
Import JSON accepted formats:

Array:
[
{ "name": "Floral Dress", "price": 1299, "barcode": "100000000123" }
]
Object:
{ "products": [ ... ] }
7. Verify logs (recommended)
Open Audit module/page.
Filter by action.
Check these actions:
PRODUCT_CREATE
PRODUCT_UPDATE
INVENTORY_STOCK_IN
INVENTORY_CYCLE_RECONCILE_ITEM
SALE_CREATE
SALE_REFUND
This confirms traceability for barcode-driven operations.

8. Daily operating flow (best practice)
Morning:
Receive stock in Inventory.
Verify low-stock alerts.
During sales:
Use scanner in POS.
Avoid manual item search unless needed.
End of day:
Run Cycle Count scan.
Post reconciliation.
Check audit logs for exceptions.