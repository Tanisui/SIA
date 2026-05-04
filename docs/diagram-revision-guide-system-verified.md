# System-Verified Diagram Revision Guide

This guide is for revising the Domain Class Diagram, Use Case Diagram, and Design Class Diagram of the current Cecille's N'Style system.

Basis of this guide:
- `frontend/src/App.js`
- `frontend/src/pages/Users.jsx`
- `frontend/src/pages/UserFormPage.jsx`
- `frontend/src/pages/Categories.jsx`
- `frontend/src/pages/Inventory.js`
- `frontend/src/pages/Sales.jsx`
- `frontend/src/pages/Customers.jsx`
- `frontend/src/pages/CustomerFormPage.jsx`
- `frontend/src/pages/Suppliers.jsx`
- `frontend/src/pages/Purchasing.jsx`
- `frontend/src/pages/BalePurchaseOrder.jsx`
- `frontend/src/pages/Attendance.jsx`
- `frontend/src/pages/payroll/*`
- `backend/src/routes/auth.js`
- `backend/src/routes/users.js`
- `backend/src/routes/roles.js`
- `backend/src/routes/rbac.js`
- `backend/src/routes/categories.js`
- `backend/src/routes/products.js`
- `backend/src/routes/inventory.js`
- `backend/src/routes/sales.js`
- `backend/src/routes/customers.js`
- `backend/src/routes/suppliers.js`
- `backend/src/routes/balePurchases.js`
- `backend/src/routes/attendance.js`
- `backend/src/routes/payroll.routes.js`
- `backend/src/services/draftSaleService.js`
- `backend/src/services/scannerSchemaService.js`
- `backend/src/services/payroll/*`
- `backend/src/utils/salesSupport.js`
- `backend/src/database/sia.sql`
- `backend/src/database/migrations/*`

## Scope to keep

To avoid adding extra scope, keep the diagrams focused on the implemented operational modules below:

- Authentication and access control
- User and employee management
- Roles and permissions
- Category and product management
- Inventory management
- Sales and customer management
- Supplier and bale purchase workflow
- Attendance
- Payroll

Leave out these modules unless your adviser explicitly asks for full-system diagrams:

- Expenses
- Accounting
- API integration
- Notifications as a main subsystem
- Settings
- Dashboard-only presentation widgets

## Global correction rules

Apply these rules before redrawing anything:

- Do not show payroll as future work. Payroll is already implemented.
- Do not show payroll processing as a single manager action. The implemented flow is `create period -> load inputs -> sync attendance -> edit inputs -> compute -> finalize -> release -> void`.
- Do not show automatic low-stock push notification to the manager. The system exposes a low-stock list/view.
- Do not show a bale purchase status named `Broken Down`. The active purchase order statuses are `PENDING`, `ORDERED`, `RECEIVED`, `COMPLETED`, and `CANCELLED`.
- Do not show automatic product stock creation immediately after saving a bale breakdown. The system explicitly disables automatic bale stock-in and tells the user to create bale-linked products one by one from Product Management.
- Do not show payslip PDF generation as a server feature. The implemented payslip is a rendered page with browser print.
- Do not show POS as an in-memory cart only. The working cart is a persisted `Sale` record in `DRAFT` status.
- Do not show a standalone `Category Type Management` actor workflow unless your current draft already has it and your panel asks for it. In the current UI, category types are mainly lookup or validation data, not a separate end-user maintenance module.
- Do not use legacy current-state classes such as `payrolls` or `bale_returns` as the main active model if the goal is the present running system. Use the newer payroll and supplier-return structures.

## Use Case Diagram revision guide

### Recommended actors

Use these actors only:

- `Administrator`
- `Manager`
- `Sales Clerk`
- `Inventory Clerk`
- `HR`
- `Auditor`
- `Employee/User`

Do not add an external `Supplier` actor to the main diagram unless your adviser specifically wants outside-party system access. The codebase has a `Supplier` role entry, but the main business workflow is still internal staff use.

### Minimum subsystem set

If you want the cleanest revision with no extra scope, redraw these use case groups.

### 1. Authentication and access control

Keep:

- `Login`
- `Logout`
- `Change Password`

Actors:

- `Administrator`
- `Manager`
- `Sales Clerk`
- `Inventory Clerk`
- `HR`
- `Auditor`
- `Employee/User`

Do not add:

- Public registration
- Email-based employee onboarding as a separate main use case

### 2. User and employee management

Keep:

- `Create User-Employee Profile`
- `Update User-Employee Profile`
- `Upload Employee Document`
- `Update Employee Document Status`
- `Download Employee Document`
- `Assign User Role`

Actors:

- `Administrator`

Important correction:

- In the current UI and route flow, account/profile creation happens first, then document upload happens after the profile exists. Do not draw document upload as a prerequisite step before creating the profile.

Do not add:

- Separate public employee registration
- Manager-led payroll account creation
- A separate active `Employees Page` actor flow if your diagram is based on the current frontend, because the frontend routes employee maintenance through `Users` and `UserFormPage`

### 3. Roles and permissions

Keep:

- `Create Role`
- `Update Role Permissions`
- `Delete Role`
- `Assign Role Access`

Actors:

- `Administrator`

Do not add:

- Automatic role assignment logic as a main business use case

### 4. Category and product management

Keep:

- `Create or Update Category`
- `Create or Update Product`
- `Generate Barcode or QR Label`

Actors:

- `Administrator`
- `Manager`
- `Inventory Clerk`

Important correction:

- If you show product type, label it as `Category Type` or `Type Option` under the category structure. Do not show a separate user-facing type-maintenance subsystem unless you are specifically asked to do so.

Do not add:

- A separate main `Products` page actor flow if you are following the current frontend navigation. Product management is currently handled inside `Inventory`.

### 5. Inventory management

Keep:

- `Record Manual Stock In`
- `Record Stock Out Adjustment`
- `Record Damage`
- `Receive Repaired Product`
- `View Low Stock List`
- `View Inventory Transactions`

Actors:

- `Administrator`
- `Manager`
- `Inventory Clerk`

Important corrections:

- Low stock should be drawn as a view or monitoring use case, not an automatic system notification.
- Bale-linked product stock should not be drawn as automatically created when a breakdown is saved.

Do not add:

- `Automatic Low Stock Notification`
- `Automatic Bale Stock Creation`
- `Broken Down Purchase Status`

### 6. Sales and customer management

Keep:

- `Prepare Draft Sale`
- `Add Item to Draft Sale`
- `Update Draft Sale Item`
- `Remove Draft Sale Item`
- `Link Customer to Draft Sale`
- `Checkout Sale`
- `Accept Payment`
- `Print Receipt`
- `Process Receipt-Based Return`
- `Refund Sale`
- `Create Customer`
- `Update Customer`
- `Search Customer`
- `View Sales History`

Actors:

- `Administrator`
- `Manager`
- `Sales Clerk`

Important corrections:

- The cart should be represented as a draft sale workflow, not just a temporary cart.
- Returns should be shown as receipt-based or sale-based return processing, not as a disconnected inventory return process.

Do not add:

- A generic `Clear Cart` use case as the main delete behavior. The active system deletes a persisted draft sale.
- Return processing with no sale or receipt reference

### 7. Supplier and bale workflow

Keep:

- `Manage Supplier Profile`
- `Create Bale Purchase Order`
- `Update Bale Purchase Order`
- `Receive Purchase Order`
- `Save Bale Breakdown`
- `Record Supplier Return`
- `View Purchase, Breakdown, and Return Records`

Actors:

- `Administrator`
- `Manager`
- `Inventory Clerk` for purchase-order, receiving, breakdown, and supplier-return actions

Important corrections:

- `Save Bale Breakdown` only stores the breakdown record.
- If you want to show product creation after breakdown, make it a separate follow-on use case such as `Create Bale-Linked Product`, not an automatic included result of saving the breakdown.
- `Manage Supplier Profile` should stay with `Administrator` and `Manager`. `Inventory Clerk` mainly participates in the bale purchase, receiving, breakdown, and return workflow.

Do not add:

- `Broken Down` as a purchase order status
- `Auto Generate Products from Breakdown` as a guaranteed system step

### 8. Attendance

Keep:

- `Clock In`
- `Clock Out`
- `View Own Attendance`
- `Manage Attendance Record`
- `View Attendance Summary`

Actors:

- `Employee/User` for own attendance and clock-in or clock-out
- `Administrator`
- `HR`
- `Manager`
- `Sales Clerk`
- `Inventory Clerk`

Important correction:

- Do not draw attendance as HR-only. The code currently exposes attendance operations more broadly than that.

### 9. Payroll

Keep:

- `Create Payroll Profile`
- `Update Payroll Profile`
- `Create Payroll Period`
- `Load Payroll Inputs`
- `Sync Attendance to Payroll Inputs`
- `Edit Payroll Inputs`
- `Compute Payroll`
- `Finalize Payroll Run`
- `Release Payroll Run`
- `Void Payroll Run`
- `View Payroll Reports`
- `View My Payslip`

Actors:

- `Administrator` for create, update, compute, finalize, release, void, and settings-related work
- Other internal roles mainly for payroll view, report, and payslip access
- `Employee/User` for own payslip and own payroll-facing self-service views

If your panel wants the view-only payroll actors written explicitly, use:

- `Manager`
- `HR`
- `Sales Clerk`
- `Inventory Clerk`
- `Auditor`

Important corrections:

- Do not collapse payroll into one use case called only `Process Payroll`.
- Do not make `Manager` the primary actor for compute, finalize, release, or void. Those are admin-side actions in the current implementation.
- `View My Payslip` is separate from admin payroll processing.

Do not add:

- `Generate Payslip PDF`
- `Future Payroll Module`

## Domain Class Diagram revision guide

### Minimum corrected class set

If you want a current-system domain diagram with no unnecessary additions, use the classes below.

### Access control cluster

- `User`
- `Role`
- `Permission`
- `UserRole`
- `RolePermission`
- `UserPermission`

### Employee records cluster

- `Employee`
- `File`
- `EmployeeDocument`

### Catalog and inventory cluster

- `Category`
- `CategoryType`
- `Product`
- `InventoryTransaction`

### Sales and customer cluster

- `Customer`
- `Sale`
- `SalesPayment`
- `SaleItem`
- `SaleReturnItem`

### Supplier and bale cluster

- `Supplier`
- `BalePurchase`
- `BaleBreakdown`
- `BaleSupplierReturn`
- `BaleSupplierReturnItem`

### Attendance and payroll cluster

- `Attendance`
- `PayrollProfile`
- `PayrollPeriod`
- `PayrollInput`
- `PayrollRun`
- `PayrollRunItem`
- `PayrollItemLine`
- `PayrollSettingsVersion`

### Strong relationships to draw

Use these as the main solid associations in the domain diagram:

- `User` many-to-many `Role` through `UserRole`
- `Role` many-to-many `Permission` through `RolePermission`
- `User` many-to-many `Permission` through `UserPermission`
- `Employee` one-to-many `EmployeeDocument`
- `EmployeeDocument` many-to-one `File` as an optional uploaded file
- `Employee` one-to-many `Attendance`
- `Category` one-to-many `Product`
- `Category` one-to-many `CategoryType`
- `Product` one-to-many `InventoryTransaction`
- `Customer` one-to-many `Sale`
- `User` one-to-many `Sale` as clerk or processor
- `Sale` zero-or-one `SalesPayment`
- `Sale` one-to-many `SaleItem`
- `Sale` one-to-many `SaleReturnItem`
- `SaleItem` one-to-many `SaleReturnItem`
- `Supplier` one-to-many `BalePurchase`
- `BalePurchase` zero-or-one `BaleBreakdown`
- `BalePurchase` one-to-many `BaleSupplierReturn`
- `BaleSupplierReturn` one-to-many `BaleSupplierReturnItem`
- `User` zero-or-one `PayrollProfile`
- `PayrollPeriod` one-to-many `PayrollInput`
- `User` one-to-many `PayrollInput`
- `PayrollPeriod` one-to-many `PayrollRun`
- `PayrollRun` one-to-many `PayrollRunItem`
- `User` one-to-many `PayrollRunItem`
- `PayrollRunItem` one-to-many `PayrollItemLine`

### Soft or implementation-level relationships to annotate carefully

These relationships exist in the system, but they should not be overstated as strict direct table links in the diagram:

- `User` to `Employee` is an intended one-to-zero-or-one account/profile link, but the implementation resolves it through `users.employee_id`, `employees.user_id`, and fallback matching logic. If your panel wants a pure conceptual class diagram, draw the association. If they want a strict database-faithful domain picture, add a note that the link is schema-compatible and application-resolved.
- `Product` to `CategoryType` is not a hard foreign key. The product stores `subcategory` text, and the application validates it against category type options. Draw this as a soft reference or add a note.
- `Attendance` feeds `PayrollInput` through synchronization logic. Do not draw a hard foreign key from `Attendance` to `PayrollInput`.
- `PayrollRunItem` contains `payroll_profile_snapshot_json`, `input_snapshot_json`, and `settings_snapshot_json`. This means the payroll result stores snapshots of the data used during computation. Do not draw it as depending only on the current live `PayrollProfile` or `PayrollSettingsVersion`.
- `Product` can be linked to `BalePurchase` and optionally to a breakdown source through `bale_purchase_id` and `source_breakdown_id`, but breakdown save does not automatically create those products.
- `InventoryTransaction.reference` stores text links to sale, return, or stock events. Do not model those as strong foreign keys unless your adviser explicitly wants a looser event-reference note.

### Classes to avoid or demote in the revised domain diagram

Avoid making these primary current-state classes:

- `Payrolls` as the main payroll entity. The active payroll module uses the newer payroll tables.
- `BaleReturn` as the main supplier-return class if your goal is the current purchasing workflow. Use `BaleSupplierReturn` and `BaleSupplierReturnItem`.
- `Cart` as a domain class. Use `Sale` with `DRAFT` status.
- `LowStockNotification` as a core entity.
- `PayslipPDF` or `PDFGenerator` as a domain entity.
- `BalePurchaseItem` in the minimum corrected version unless your adviser explicitly asks you to include dormant or partial schema support.
- `DamagedInventory` as the main active damage record class. The implemented flow mainly records damage through inventory movement and related workflow, not that older table as the central user-facing model.

## Design Class Diagram revision guide

### Important modeling rule

The current codebase is mostly route modules, services, utilities, and frontend pages, not classical object-oriented classes. For the design class diagram, use UML class boxes with stereotypes such as:

- `<<boundary>>` for frontend pages and route-facing UI
- `<<control>>` for backend routes, controllers, middleware, and services
- `<<entity>>` for database-backed domain records

This will make the design class diagram consistent with the actual implementation.

### Minimum corrected boundary classes

Use these boundary classes if you want the cleanest current-system design diagram:

- `Login`
- `ChangePassword`
- `Users`
- `UserFormPage`
- `Roles`
- `Categories`
- `Inventory`
- `Sales`
- `Customers`
- `CustomerFormPage`
- `Suppliers`
- `Purchasing`
- `BalePurchaseOrder`
- `Attendance`
- `PayrollProfiles`
- `PayrollPeriods`
- `PayrollInputSheet`
- `PayrollPreview`
- `PayrollPayslip`
- `PayrollReports`
- `MyPayslips`
- `PayrollDTR`

### Minimum corrected control classes

Use these control classes:

- `ProtectedRoute`
- `auth.js`
- `authMiddleware`
- `users.js`
- `roles.js`
- `rbac.js`
- `categories.js`
- `products.js`
- `inventory.js`
- `sales.js`
- `draftSaleService`
- `salesSupport`
- `scannerSchemaService`
- `customers.js`
- `suppliers.js`
- `balePurchases.js`
- `attendance.js`
- `payroll.routes.js`
- `payroll.controller`
- `syncAttendanceToInputs`
- `computePayrollRun`
- `computeEmployeePayroll`
- `computeSSS`
- `computePhilHealth`
- `computePagibig`
- `computeWithholdingTax`

### Minimum corrected entity classes

Use these entity classes:

- `User`
- `Role`
- `Permission`
- `Employee`
- `File`
- `EmployeeDocument`
- `Category`
- `CategoryType`
- `Product`
- `InventoryTransaction`
- `Customer`
- `Sale`
- `SalesPayment`
- `SaleItem`
- `SaleReturnItem`
- `Supplier`
- `BalePurchase`
- `BaleBreakdown`
- `BaleSupplierReturn`
- `BaleSupplierReturnItem`
- `Attendance`
- `PayrollProfile`
- `PayrollPeriod`
- `PayrollInput`
- `PayrollRun`
- `PayrollRunItem`
- `PayrollItemLine`
- `PayrollSettingsVersion`

### Recommended design groupings

#### 1. Authentication and access control

Draw this flow:

- `<<boundary>> Login`
- `<<boundary>> ChangePassword`
- `<<control>> auth.js`
- `<<control>> authMiddleware`
- `<<boundary>> ProtectedRoute`
- `<<entity>> User`

Main relation idea:

- `Login -> auth.js -> User`
- `ProtectedRoute -> authMiddleware -> User`

#### 2. User and employee management

Draw this flow:

- `<<boundary>> Users`
- `<<boundary>> UserFormPage`
- `<<control>> users.js`
- `<<entity>> User`
- `<<entity>> Employee`
- `<<entity>> EmployeeDocument`
- `<<entity>> File`
- `<<entity>> Role`

Important note:

- The current UI creates or updates the account/profile first, then uploads or updates employee documents after save.

#### 3. Roles and permissions

Draw this flow:

- `<<boundary>> Roles`
- `<<control>> roles.js`
- `<<control>> rbac.js`
- `<<entity>> Role`
- `<<entity>> Permission`
- `<<entity>> UserRole`
- `<<entity>> RolePermission`
- `<<entity>> UserPermission`

#### 4. Category and product management

Draw this flow:

- `<<boundary>> Categories`
- `<<boundary>> Inventory`
- `<<control>> categories.js`
- `<<control>> products.js`
- `<<entity>> Category`
- `<<entity>> CategoryType`
- `<<entity>> Product`

Important note:

- In the active frontend, product maintenance lives inside `Inventory`, not a main routed `Products` page.

#### 5. Inventory management

Draw this flow:

- `<<boundary>> Inventory`
- `<<control>> inventory.js`
- `<<entity>> Product`
- `<<entity>> InventoryTransaction`

Important notes:

- `Inventory -> inventory.js -> Product`
- `Inventory -> inventory.js -> InventoryTransaction`
- Low stock is a query and monitoring view.
- Bale-linked product creation is not automatic on breakdown save.

#### 6. Sales and customer management

Draw this flow:

- `<<boundary>> Sales`
- `<<boundary>> Customers`
- `<<boundary>> CustomerFormPage`
- `<<control>> sales.js`
- `<<control>> draftSaleService`
- `<<control>> salesSupport`
- `<<control>> scannerSchemaService`
- `<<entity>> Sale`
- `<<entity>> SalesPayment`
- `<<entity>> SaleItem`
- `<<entity>> SaleReturnItem`
- `<<entity>> Customer`
- `<<entity>> Product`
- `<<entity>> InventoryTransaction`

Important notes:

- Do not draw a separate `Cart` class. The current cart is a `Sale` in `DRAFT` status managed through `draftSaleService`.
- `SalesPayment` is a real stored entity and is separate from `Sale`.
- Returns are stored through `SaleReturnItem`, not only as a sale status flag.

#### 7. Supplier and bale workflow

Draw this flow:

- `<<boundary>> Suppliers`
- `<<boundary>> Purchasing`
- `<<boundary>> BalePurchaseOrder`
- `<<control>> suppliers.js`
- `<<control>> balePurchases.js`
- `<<entity>> Supplier`
- `<<entity>> BalePurchase`
- `<<entity>> BaleBreakdown`
- `<<entity>> BaleSupplierReturn`
- `<<entity>> BaleSupplierReturnItem`

Important notes:

- `Purchasing` is the bale breakdown view.
- `BalePurchaseOrder` covers purchase orders and supplier returns.
- Do not place `baleBreakdownProductSync` on the main active path unless your panel asks for helper-level internal utilities. It exists in the codebase, but it is not the main active route flow for breakdown save.

#### 8. Attendance

Draw this flow:

- `<<boundary>> Attendance`
- `<<boundary>> PayrollDTR`
- `<<control>> attendance.js`
- `<<entity>> Attendance`
- `<<entity>> Employee`
- `<<entity>> User`

Important note:

- The design should show both own-attendance self-service and broader attendance management, not only HR-side maintenance.

#### 9. Payroll

Draw this flow:

- `<<boundary>> PayrollProfiles`
- `<<boundary>> PayrollPeriods`
- `<<boundary>> PayrollInputSheet`
- `<<boundary>> PayrollPreview`
- `<<boundary>> PayrollPayslip`
- `<<boundary>> PayrollReports`
- `<<boundary>> MyPayslips`
- `<<control>> payroll.routes.js`
- `<<control>> payroll.controller`
- `<<control>> syncAttendanceToInputs`
- `<<control>> computePayrollRun`
- `<<control>> computeEmployeePayroll`
- `<<control>> computeSSS`
- `<<control>> computePhilHealth`
- `<<control>> computePagibig`
- `<<control>> computeWithholdingTax`
- `<<entity>> PayrollProfile`
- `<<entity>> PayrollPeriod`
- `<<entity>> PayrollInput`
- `<<entity>> PayrollRun`
- `<<entity>> PayrollRunItem`
- `<<entity>> PayrollItemLine`
- `<<entity>> PayrollSettingsVersion`
- `<<entity>> Attendance`
- `<<entity>> User`

Important notes:

- `PayrollPreview` should connect to finalize, release, and void actions as separate control operations.
- `PayrollPayslip` should be drawn as a view or print page, not a PDF-generation class.
- `Attendance` connects to payroll through `syncAttendanceToInputs`, not by direct hard-coding payroll values inside the attendance entity.

### Design classes to remove from an inaccurate draft

Remove or rename these if they appear in your current design class diagram:

- `Cart`
- `PayslipPDFGenerator`
- `AutoLowStockNotifier`
- `BrokenDownStatus`
- `AutoBreakdownProductGenerator`
- `LegacyPayroll`
- `BaleReturn` as the main current return design class if you mean the active purchasing flow
- `ProductsPage` as the primary current product boundary if you want the routed frontend exactly as implemented
- `EmployeesPage` as the main employee-maintenance boundary if you want the current routed frontend exactly as implemented

## Quick revision checklist

Use this before finalizing the revised diagrams:

- Replace any future or planned payroll wording with implemented payroll classes and use cases.
- Replace any simple cart model with `Sale (DRAFT)`.
- Replace any automatic low-stock notification with low-stock monitoring or view.
- Replace any `Broken Down` purchase status with the actual purchase order statuses.
- Remove any automatic breakdown-to-product generation path.
- Use `BaleSupplierReturn` instead of legacy `BaleReturn` for the active purchase return workflow.
- Use `SaleReturnItem` and `SalesPayment` if your current sales domain is too simplified.
- Keep `CategoryType` as a soft product reference, not a hard `Product -> CategoryType` foreign key.
- Show payroll run snapshots as stored results, not only live references to current profile or settings data.
- Keep the design class diagram module-based: boundary, control, entity.

## Best minimum version

If you need the safest revision with no added scope, this is the minimum you should deliver:

- Use Case Diagram with these major groups: Authentication, User/Employee Management, Roles and Permissions, Category/Product, Inventory, Sales/Customers, Supplier/Bale Workflow, Attendance, Payroll
- Domain Class Diagram with these core classes: `User`, `Role`, `Permission`, `UserRole`, `RolePermission`, `UserPermission`, `Employee`, `EmployeeDocument`, `File`, `Category`, `CategoryType`, `Product`, `InventoryTransaction`, `Customer`, `Sale`, `SalesPayment`, `SaleItem`, `SaleReturnItem`, `Supplier`, `BalePurchase`, `BaleBreakdown`, `BaleSupplierReturn`, `BaleSupplierReturnItem`, `Attendance`, `PayrollProfile`, `PayrollPeriod`, `PayrollInput`, `PayrollRun`, `PayrollRunItem`, `PayrollItemLine`, `PayrollSettingsVersion`
- Design Class Diagram with these layers: frontend pages as boundaries, route or service modules as controls, and database-backed records as entities

If you want, the next step can be a ready-to-draw version in Mermaid or PlantUML for all three diagrams using this exact corrected scope.
