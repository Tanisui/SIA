# Backend — Routes Overview

Responsibilities
- Each file in `backend/src/routes/` defines a resource router (Express `Router`) for a domain area: users, roles, products, inventory, sales, customers, suppliers, payroll, attendance, reports, files, settings, notifications, audit, expenses, dashboard, ledger, categories, purchase-orders, etc.

Common patterns
- Most routes apply `verifyToken` and `authorize(permission)` middleware to protect endpoints.
- Routes use the shared `database.pool` for queries and return JSON responses. Many routes accept/return typical CRUD payloads.

Selected route responsibilities (high level)
- `auth.js` — login, token handling, change-password.
- `rbac.js` — list permissions, roles, user role lookups.
- `users.js` — user CRUD, activation, possibly password reset.
- `products.js` — product CRUD and low-stock alerts.
- `inventory.js` — stock-in/out, adjustments, returns, damaged listings, inventory reports.
- `sales.js` — create sale, list, refunds, sales reports.
- `purchaseOrders.js` — create and receive POs.
- `employees.js` — employee CRUD for HR and payroll/attendance integrations.

Where to inspect
- Folder: `backend/src/routes/`
- Entry points wired in: `backend/server.js`
