# Opzon Template to Implemented-Only SIA Gap Analysis

## Scope

This analysis treats the Opzon PDF as a document-format template only. The live SIA codebase is the source of truth for all replacement content. The goal is to keep the structure of the template while replacing printing-press content with the modules that are clearly implemented in the current Cecille's N'Style system.

## Evidence Baseline

- Mounted backend domains: `backend/server.js:41-61`
- Routed frontend screens: `frontend/src/App.js:28-55`
- Live sidebar modules and tabs: `frontend/src/components/Sidebar.js:8-61`
- Core base schema: `backend/src/database/sia.sql:6-305`
- Runtime sales tables: `backend/src/utils/salesSupport.js:47-78`
- Runtime bale-reporting tables and product extensions: `backend/src/utils/automatedReports.js:139-244`
- User profile and employee document workflow: `backend/src/routes/users.js:763-1330`, `frontend/src/pages/UserFormPage.jsx:326-1328`
- Sales POS, payment, and returns flow: `backend/src/routes/sales.js:96-248`, `backend/src/routes/sales.js:847`, `frontend/src/pages/Sales.jsx:241-1499`
- Inventory stock movement and label export flow: `backend/src/routes/inventory.js:8-259`, `frontend/src/pages/Inventory.js:360-1184`
- Bale purchasing and receiving flow: `backend/src/routes/balePurchases.js:320-792`, `frontend/src/pages/Purchasing.jsx:1-260`
- Automated reporting and CSV export: `backend/src/routes/reports.js:56-270`, `frontend/src/pages/Reports.jsx:1-260`
- Audit trail review: `backend/src/routes/audit.js:129-207`, `frontend/src/pages/Audit.jsx:1-180`

## Gap Analysis Matrix

| Template section | Keep / Replace / Remove | SIA replacement | Why | System evidence |
| --- | --- | --- | --- | --- |
| Title and company identity: Opzon's Printing Press | Replace | Cecille's N'Style Boutique Management System | The repo branding, login copy, sidebar brand, and dashboard all point to a boutique POS and operations system, not a printing-press ERP. | `frontend/src/pages/Login.js:26-38`; `frontend/src/components/Sidebar.js:122-132`; `frontend/src/pages/Dashboard.js:170-177` |
| Chapter 1: organization and business context | Replace | Small boutique retail operation in Davao City with POS, inventory, supplier, bale, user, and reporting workflows | The active system is centered on retail inventory and point-of-sale behavior rather than RFQ, production, and printing fulfillment. | `docs/PROJECT_OVERVIEW.md`; `frontend/src/App.js:34-52`; `backend/server.js:43-61` |
| Current business process: RFQ, quotation, print production, invoicing | Replace | Retail sales, stock monitoring, supplier and bale purchasing, employee profile handling, reporting, and auditability | No printing-production or quotation workflow is mounted or routed. The implemented flow is product catalog -> inventory -> sales -> purchasing -> reporting. | `backend/server.js:43-61`; `frontend/src/components/Sidebar.js:10-61` |
| Client Profiling | Replace | User and Employee Management | The active main app does not expose customer profiling. It does expose user accounts, employee profile fields, and government-document tracking in a combined flow. | `frontend/src/App.js:34-39`; `backend/src/routes/users.js:763-1330`; `frontend/src/pages/UserFormPage.jsx:326-1328` |
| Product Profiles | Replace | Product and Category Management | The system has active category and product CRUD with SKU, barcode, QR, price, cost, stock, and category support. | `backend/src/routes/categories.js:7-65`; `backend/src/routes/products.js:62-339`; `backend/src/database/sia.sql:54-97` |
| Order Request | Replace | Sales / POS draft-sale flow | There is no active order-request subsystem. The implemented flow uses POS product loading, draft sales, cart handling, payment capture, and receipt output. | `backend/src/routes/sales.js:96-248`; `backend/src/services/draftSaleService.js:61-220`; `frontend/src/pages/Sales.jsx:175-260` |
| Client Orders | Replace | Sales history, transactions, and receipt-driven returns | There is no active client-order module. The implemented system stores completed sales, payment records, and receipt-based returns with inventory reintegration. | `backend/src/routes/sales.js:248-847`; `backend/src/utils/salesSupport.js:55-78`; `frontend/src/pages/Sales.jsx:241-1499` |
| Supplier Orders | Replace | Purchasing and Bale Workflow | The closest live replacement is the bale purchase / purchase-order workflow with receiving, quantity tracking, and bale breakdowns. | `backend/src/routes/balePurchases.js:320-792`; `frontend/src/pages/Purchasing.jsx:1-260`; `backend/src/utils/automatedReports.js:139-244` |
| Supplier Profile | Replace | Supplier Management | Supplier CRUD is fully active and mounted in both frontend and backend. | `frontend/src/App.js:42`; `backend/src/routes/suppliers.js:8-100`; `frontend/src/components/Sidebar.js:10-11` |
| Inventory | Keep and rewrite | Inventory Management | Inventory is a strong direct match, but it must be rewritten to reflect the real tabs and behaviors: stock-in, stock-out, damage, shrinkage, low-stock alerts, transactions, reports, and barcode / QR labels. | `frontend/src/components/Sidebar.js:13-27`; `backend/src/routes/inventory.js:8-259`; `frontend/src/pages/Inventory.js:1184-1668` |
| Employees | Replace | User and Employee Management | The current app merges user-account and employee-profile handling instead of treating employees as a fully separate subsystem. | `frontend/src/App.js:34-39`; `frontend/src/pages/Users.jsx`; `frontend/src/pages/UserFormPage.jsx:1230-1328`; `backend/src/routes/users.js:838-1279` |
| Attendance | Remove from the main implemented paper | Exclude from primary module set | Attendance tables and permissions exist, but there is no mounted attendance route and no routed attendance screen in the current app shell. | `backend/src/database/sia.sql:200-210`; `backend/src/migrations/seed.js:49-51`; absence from `backend/server.js:41-61`; absence from `frontend/src/App.js:34-52` |
| Technicians | Replace | Roles and Permissions | The live administration layer is role-based access control, not technician profiling. | `frontend/src/App.js:40`; `backend/src/routes/roles.js:48-154`; `frontend/src/pages/Roles.jsx:1-180`; `backend/src/database/sia.sql:17-46` |
| Machinery | Replace | Audit and System Administration | The system has no machinery, maintenance, or equipment assignment module. The closest implemented administrative replacement is audit review, settings/configuration, and credential maintenance. | `frontend/src/App.js:47-52`; `backend/src/routes/audit.js:129-207`; `frontend/src/pages/Audit.jsx:1-180`; `frontend/src/pages/Settings.js:1-10`; `frontend/src/pages/ChangePassword.js:42` |
| Reports and Document Generation | Keep and rewrite | Dashboard metrics, bale analytics, CSV report export, employee document download, and audit-backed monitoring | Reporting is implemented, but the actual scope is operational and bale-aware analytics with CSV export, not generic PDF/Excel reporting for a print business. Employee documents are also actively managed. | `backend/src/routes/reports.js:56-270`; `frontend/src/pages/Reports.jsx:1-260`; `backend/src/routes/users.js:784-1130`; `frontend/src/pages/UserFormPage.jsx:607-744` |
| Domain Class Diagram | Replace | Implemented-only ERD / domain model | The Opzon diagram includes clients, quotation requests, technicians, machinery, and maintenance records that do not belong to the active SIA core. | Opzon PDF pages 11-12; compare with `backend/src/database/sia.sql:6-305`, `backend/src/utils/salesSupport.js:47-78`, `backend/src/utils/automatedReports.js:139-244` |
| Design Class Diagram | Replace | Three implemented slices: access and staff records; catalog, inventory, and sales; suppliers, purchasing, reporting, and audit | A direct carry-over of the printing-process design classes would misrepresent the live page/route/entity structure. | `frontend/src/App.js:34-52`; `backend/server.js:43-61` |
| User Interface section | Replace | Actual live screens and tabs only | The paper should name real screens: dashboard, categories, suppliers, inventory tabs, sales tabs, purchasing tabs, reports tabs, users, roles, audit, and change-password. | `frontend/src/App.js:34-52`; `frontend/src/components/Sidebar.js:8-61` |
| Events Table appendix | Replace | Implemented event set only | The appendix must be rebuilt from live actions such as login, stock moves, sales, returns, purchasing, reporting, and audit review. | `backend/src/routes/auth.js:79-304`; `backend/src/routes/inventory.js:8-259`; `backend/src/routes/sales.js:96-847`; `backend/src/routes/balePurchases.js:320-792`; `backend/src/routes/reports.js:56-270`; `backend/src/routes/audit.js:129-207` |
| Fully developed use case descriptions | Replace | Fourteen implemented use case sets defined by the revision plan | The final appendix should describe implemented behavior only and avoid unsupported printing-domain flows. | Same evidence baseline listed above |

## Explicit Exclusions and Partial Areas

### Customer management

Customer-related code exists, but it is not part of the active main application flow. It should not be presented as a primary implemented subsystem in the revised paper.

- Backend customer route exists: `backend/src/routes/customers.js`
- Runtime server does not mount `/customers`: `backend/server.js:41-61`
- Main app router does not expose `/customers`: `frontend/src/App.js:34-52`
- Sales now use walk-in snapshots rather than active customer-profile selection: `backend/src/routes/sales.js:111-112`, `backend/src/routes/sales.js:592-705`

### Attendance and payroll

Attendance and payroll are present as schema and permission groundwork, but they are not backed by mounted route modules in the live server and are not exposed in the routed frontend shell. They should stay out of the main implemented paper body.

- Tables exist: `backend/src/database/sia.sql:200-226`
- Permissions are seeded: `backend/src/migrations/seed.js:49-51`
- No mounted attendance or payroll route in `backend/server.js:41-61`
- No routed attendance or payroll page in `frontend/src/App.js:34-52`

### Supplemental modules not central to the template replacement

The system also includes files, settings, notifications, expenses, and ledger routes. These are implemented but are not the best replacements for the core printing-domain sections in the Opzon template, so they should remain secondary or be mentioned only briefly if needed.

- Mounted in backend: `backend/server.js:53-61`
- Some routed in frontend: `frontend/src/App.js:46-52`

## Recommended Writing Boundary

The revised paper should treat the implemented core as:

- Authentication and access control
- User and employee management
- Roles and permissions
- Product and category management
- Inventory management
- Sales and returns
- Supplier management
- Purchasing and bale workflow
- Reports and audit monitoring

The revised paper should explicitly exclude or footnote as non-primary:

- Customers
- Attendance
- Payroll
- Technicians
- Machinery
- Printing-specific RFQ, production, and maintenance flows
