# Verified Diagram Revision Guide

This guide is based on the current system implementation in:

- `frontend/src/App.js`
- `frontend/src/pages/`
- `backend/src/routes/`
- `backend/src/controllers/`
- `backend/src/services/`
- `backend/src/database/sia.sql`
- `backend/src/database/migrations/`
- `backend/src/utils/automatedReports.js`
- `backend/src/services/scannerSchemaService.js`

The goal of this guide is to help you revise the:

1. Use Case Diagram
2. Domain Class Diagram
3. Design Class Diagram

without adding features that are not actually active in the current system.

## 1. Scope To Use In Your Revision

If you want the diagrams to stay close to your current manuscript structure, keep the diagram scope to these implemented subsystems only:

1. Authentication and Account Security
2. User and Employee Management
3. Roles and Permissions
4. Product and Category Management
5. Inventory Management
6. Sales and Returns
7. Supplier Management
8. Purchasing and Bale Workflow
9. Customer Management
10. Payroll with Attendance

Do not force extra modules into these three diagrams unless your adviser explicitly asks for full-scope redraws. The system also has Expenses, Ledger, Notifications, Settings, Reports, Audit, and Files, but those are outside the safest “fix only what is already in your paper” scope.

## 2. Global Corrections You Should Apply To All Three Diagram Sets

These are the system facts that your revised diagrams must follow:

- Sales uses a persisted `DRAFT` sale flow before checkout.
- Clearing a sale deletes the `DRAFT` sale record, not just a temporary cart screen.
- Bale breakdown save does not directly auto-complete the purchase order into a `Broken Down` status.
- The active purchase-order statuses are `PENDING`, `ORDERED`, `RECEIVED`, `COMPLETED`, and `CANCELLED`.
- Low-stock behavior is a query/list view, not an automatic manager notification event.
- Payroll is already implemented.
- Payroll write actions are separated into `create period`, `load inputs`, `sync attendance`, `compute`, `finalize`, `release`, and `void`.
- Payroll write actions are admin-only by default in seeded RBAC.
- Payslips are viewed and printed in the client; do not describe them as server-generated PDF files unless you intentionally mark that as browser printing.
- Category “type” is not stored through a hard foreign key from `products` to `category_types`. The active product field is `products.subcategory`, and the backend validates it against category-type options.
- The intended user-to-employee model is a linked account/profile pair, but the physical schema link is compatibility-based. Do not overstate it as a single rigid universal foreign key if your class diagram is meant to reflect the actual implementation detail.
- Supplier return flow is active through `bale_supplier_returns` and `bale_supplier_return_items`.
- The current active bale product flow is one-by-one bale-linked product creation from Product Management, not automatic mass stock injection on breakdown save.

## 3. Use Case Diagram Revision Guide

## 3.1 Actors To Use

Use only actors that are clearly supported by the system:

- `Admin`
- `Manager`
- `Sales Clerk`
- `Inventory Clerk`
- `HR`
- `Auditor`
- `Employee/User`

Use `Supplier` only as an external business entity if your instructor expects it. Do not model Supplier as a normal authenticated system user unless you are explicitly showing an external actor relationship.

## 3.2 Authentication and Account Security

Keep:

- `Login`
- `Logout`
- `Change Password`

You may include:

- `Forgot Password`

but only as a lightweight account-support use case, because the backend currently returns a generic success message and does not show a full reset-token workflow in the active code.

Do not show:

- complex session invalidation
- token blacklist
- server-side logout invalidation

Recommended actors:

- `Admin`
- `Manager`
- `Sales Clerk`
- `Inventory Clerk`
- `HR`
- `Auditor`
- `Employee/User`

## 3.3 User and Employee Management

What the system actually does:

- creates a user account
- optionally creates or links an employee profile
- generates default credentials at account creation
- manages government documents in a separate step
- supports verification/update of employee documents
- can activate or deactivate a user

Use these use cases:

- `Create User-Employee Profile`
- `Update User-Employee Profile`
- `View User-Employee Profile`
- `Manage Employee Documents`
- `Verify Employee Documents`
- `Activate / Deactivate User`

Recommended actors:

- `Admin`
- `Manager` for profile viewing/updating if you want to reflect operational use

Important correction:

- Do not model document upload as mandatory inside the exact same creation step. The active UI lets the profile be saved first, then documents are managed afterward.

## 3.4 Roles and Permissions

Use these use cases:

- `Create Role`
- `Update Role Permissions`
- `Assign Role to User`
- `View Roles`

Recommended actors:

- `Admin`

Important correction:

- Do not draw the subsystem as only a single hardcoded role assignment flow.
- The backend supports role-permission mapping and user-permission overrides.

## 3.5 Product and Category Management

Use these use cases:

- `Create Category`
- `Update Category`
- `Delete Category`
- `View Categories`
- `Create Product`
- `Update Product`
- `View Product`
- `Generate Barcode or QR Label`
- `Load Type Options for Category`

Recommended actors:

- `Admin`
- `Manager`
- `Inventory Clerk`

Important correction:

- Do not draw `Create Type` / `Update Type` as a full standalone CRUD subsystem unless your teacher specifically asks you to model the `category_types` table itself. The current active UI maintains categories directly, while type selection is mainly a validated lookup used during product entry.

## 3.6 Inventory Management

Use these use cases:

- `Record Manual Stock In`
- `Record Stock Out Adjustment`
- `Record Damage`
- `Record Shrinkage`
- `Receive Repaired Product`
- `View Inventory Transactions`
- `View Low Stock List`
- `View Inventory Summary`

Recommended actors:

- `Inventory Clerk`
- `Manager`
- `Admin`

Important corrections:

- Rename any “low stock alert” use case so it behaves like `View Low Stock List` or `Review Low Stock Items`.
- Do not show an automatic system-to-manager push notification.
- If you keep bale-linked product creation here, label it `Create Bale-linked Product from Bale Record`, not `Automatic Bale Stock-In`.

## 3.7 Sales and Returns

This subsystem is one of the most important corrections.

Use these use cases:

- `Prepare Draft Sale`
- `Add Item to Draft Sale`
- `Update Draft Sale Item`
- `Remove Draft Sale Item`
- `Attach Customer to Draft Sale`
- `Checkout Draft Sale`
- `Print Receipt`
- `Process Return by Receipt`
- `View Sales History`

Recommended actors:

- `Sales Clerk`
- `Manager`

Important corrections:

- Replace simple `cart` wording with `draft sale`.
- Replace `Clear Order` with `Delete Draft Sale`.
- Keep `Print Receipt`, but describe it as client-side print output.
- Do not model checkout as a one-step “scan directly to final sale” process.

## 3.8 Supplier Management

Use these use cases:

- `Create Supplier`
- `Update Supplier`
- `View Supplier`
- `Delete Supplier`
- `Select Supplier for Purchase / Stock In`

Recommended actors:

- `Admin`
- `Manager`
- `Inventory Clerk`

## 3.9 Purchasing and Bale Workflow

Use these use cases:

- `Create Bale Purchase Order`
- `Receive Purchase Order`
- `Record Supplier Return`
- `Save Bale Breakdown`
- `View Purchase Order History`

Recommended actors:

- `Inventory Clerk`
- `Manager`
- `Admin`

Important corrections:

- Do not use a `Broken Down` purchase-order status.
- Do not show breakdown save as automatic bulk stock injection.
- Do not show a separate “bale purchase record” and “purchase order record” if your diagram implies two different core entities for the same active flow. The current active flow centers on `bale_purchases`.
- If you want to show that multiple lines can be created from the form, treat that as multiple purchase-order entries created from one submission, not as a required separate `PurchaseOrderLine` use case.

## 3.10 Customer Management

Use these use cases:

- `Create Customer Profile`
- `Update Customer Profile`
- `View Customer Profile`
- `Search Customer`
- `Link Customer to Draft Sale`
- `View Customer Purchase History`

Recommended actors:

- `Sales Clerk`
- `Manager`
- `Admin`

Important correction:

- Link the customer to the `draft sale`, not only to the final sale after checkout.

## 3.11 Payroll with Attendance

Treat payroll as implemented, not future scope.

Use these use cases:

- `Create Payroll Period`
- `Load Payroll Inputs`
- `Sync Attendance to Payroll Inputs`
- `Update Payroll Inputs`
- `Compute Payroll`
- `Finalize Payroll Run`
- `Release Payroll Run`
- `Void Payroll Run`
- `View Payroll Profiles`
- `View Payroll Reports`
- `View Payslip`
- `Record Attendance`

Recommended actors:

- `Admin` for write actions
- `HR` for operational viewing if you want to show read-only access
- `Manager` for read-only reporting if desired
- `Employee/User` for own payslip viewing

Important corrections:

- Do not label payroll as future expansion.
- Do not collapse `compute`, `finalize`, `release`, and `void` into one use case.
- Do not show `Manager approves computation` as a mandatory workflow gate.
- Do not show server-side PDF generation as the final payroll output.

## 4. Domain Class Diagram Revision Guide

## 4.1 What The Domain Diagram Should Show

Your domain class diagram should focus on the data objects and relationships that drive the business flow. It should stay mostly entity-centered.

Use these class groups.

## 4.2 Access Control and HR Cluster

Keep or add:

- `User`
- `Role`
- `Permission`
- `UserRole`
- `RolePermission`
- `UserPermission`
- `Employee`
- `EmployeeDocument`
- `File`

Recommended core attributes:

- `User`: `id`, `username`, `email`, `first_name`, `last_name`, `full_name`, `password_hash`, `is_active`
- `Role`: `id`, `name`, `description`
- `Permission`: `id`, `name`, `description`
- `Employee`: `id`, `first_name`, `last_name`, `name`, `position_title`, `department_name`, `hire_date`, `employment_type`, `employment_status`, `pay_rate`, `pay_basis`, `payroll_method`, `bank_details`
- `EmployeeDocument`: `id`, `employee_id`, `file_id`, `document_type`, `document_number`, `issuing_agency`, `issue_date`, `expiry_date`, `status`, `remarks`, `verified_by`, `verified_at`
- `File`: `id`, `path`, `original_name`, `type`, `size`, `uploaded_by`

Relationships to draw:

- `User` many-to-many `Role` through `UserRole`
- `Role` many-to-many `Permission` through `RolePermission`
- `User` many-to-many `Permission` through `UserPermission`
- `User` associated with `Employee` as an intended one-account-to-one-profile link
- `Employee` one-to-many `EmployeeDocument`
- `EmployeeDocument` optional many-to-one `File`
- `EmployeeDocument` optional many-to-one `User` through `verified_by`

Important correction:

- Do not reduce the RBAC model to `User -> Role` only.

## 4.3 Product, Category, and Inventory Cluster

Keep or add:

- `Category`
- `CategoryType`
- `Product`
- `InventoryTransaction`
- `InventoryAdjustment`
- `DamageRepairEvent`

Recommended core attributes:

- `Category`: `id`, `name`, `description`
- `CategoryType`: `id`, `category_id`, `name`, `description`, `is_active`
- `Product`: `id`, `item_code`, `sku`, `name`, `brand`, `description`, `category_id`, `subcategory`, `price`, `cost`, `allocated_cost`, `stock_quantity`, `low_stock_threshold`, `size`, `barcode`, `qr_image_path`, `product_source`, `source_breakdown_id`, `bale_purchase_id`, `condition_grade`, `status`
- `InventoryTransaction`: `id`, `product_id`, `supplier_id`, `transaction_type`, `quantity`, `reference`, `user_id`, `reason`, `balance_after`, `created_at`
- `InventoryAdjustment`: `id`, `product_id`, `bale_purchase_id`, `adjustment_type`, `quantity`, `reason`, `adjustment_date`
- `DamageRepairEvent`: draw only if your instructor expects the repaired-product flow to appear in the diagram

Relationships to draw:

- `Category` one-to-many `Product`
- `Category` one-to-many `CategoryType`
- `Product` one-to-many `InventoryTransaction`
- `Product` one-to-many `InventoryAdjustment`

Important correction:

- Draw `Product.subcategory` as a validated text-based association to category types.
- Do not draw a strict database foreign key from `Product` to `CategoryType` unless you label it as application-layer validation only.

## 4.4 Sales and Customer Cluster

Keep or add:

- `Customer`
- `Sale`
- `SaleItem`

Recommended core attributes:

- `Customer`: `id`, `customer_code`, `full_name`, `phone`, `email`, `address_line`, `barangay`, `city`, `province`, `postal_code`
- `Sale`: `id`, `sale_number`, `receipt_no`, `date`, `clerk_id`, `customer_id`, `subtotal`, `tax`, `discount`, `total`, `payment_method`, `status`
- `SaleItem`: `id`, `sale_id`, `product_id`, `qty`, `unit_price`, `line_total`, `product_name_snapshot`, `sku_snapshot`, `brand_snapshot`, `barcode_snapshot`, `size_snapshot`, `color_snapshot`

Relationships to draw:

- `Customer` one-to-many `Sale`
- `User` one-to-many `Sale` through `clerk_id`
- `Sale` one-to-many `SaleItem`
- `SaleItem` optional many-to-one `Product`

Important corrections:

- Add `DRAFT` as an actual sale status in your notes if you annotate sale states.
- Do not invent a separate `Cart` domain class as the main system entity. The active persisted object is still `Sale` with `status = DRAFT`.

## 4.5 Supplier and Purchasing Cluster

Keep or add:

- `Supplier`
- `BalePurchase`
- `BaleBreakdown`
- `BaleSupplierReturn`
- `BaleSupplierReturnItem`

Recommended core attributes:

- `Supplier`: `id`, `name`, `contact_person`, `phone`, `email`, `address`, `default_payment_terms_days`, `credit_limit`, `payment_terms_notes`
- `BalePurchase`: `id`, `supplier_id`, `bale_batch_no`, `purchase_date`, `bale_category`, `bale_cost`, `total_purchase_cost`, `quantity_ordered`, `quantity_received`, `payment_status`, `po_status`, `expected_delivery_date`, `actual_delivery_date`
- `BaleBreakdown`: `id`, `bale_purchase_id`, `total_pieces`, `saleable_items`, `premium_items`, `standard_items`, `low_grade_items`, `damaged_items`, `cost_per_saleable_item`, `breakdown_date`
- `BaleSupplierReturn`: `id`, `supplier_id`, `supplier_name`, `bale_purchase_id`, `return_date`, `notes`, `processed_by`
- `BaleSupplierReturnItem`: `id`, `return_id`, `quantity`, `reason`

Relationships to draw:

- `Supplier` one-to-many `BalePurchase`
- `BalePurchase` one-to-zero-or-one `BaleBreakdown` in active application behavior
- `BalePurchase` one-to-many `BaleSupplierReturn`
- `BaleSupplierReturn` one-to-many `BaleSupplierReturnItem`
- `BalePurchase` one-to-many `InventoryAdjustment`
- `BalePurchase` one-to-many `Product` for bale-linked products

Important corrections:

- Do not use `BalePurchaseOrder` and `BalePurchaseRecord` as two separate core domain classes unless your instructor specifically wants them separated conceptually.
- The safest domain representation for the active system is `BalePurchase` plus optional `BaleBreakdown` plus returns.
- Do not make `BalePurchaseItem` a required class in the core domain redraw. The active `bale-purchases` flow does not use it as a central runtime entity.

## 4.6 Payroll and Attendance Cluster

Keep or add:

- `Attendance`
- `PayrollProfile`
- `PayrollPeriod`
- `PayrollInput`
- `PayrollRun`
- `PayrollRunItem`
- `PayrollItemLine`
- `PayrollSettingsVersion`

Recommended core attributes:

- `Attendance`: `id`, `employee_id`, `date`, `clock_in`, `clock_out`, `hours_worked`, `expected_clock_in`, `expected_clock_out`, `status`, `late_minutes`, `undertime_minutes`, `overtime_minutes`
- `PayrollProfile`: `id`, `user_id`, `pay_basis`, `pay_rate`, `payroll_frequency`, `standard_work_days_per_month`, `standard_hours_per_day`, `overtime_eligible`, `tax_enabled`, `sss_enabled`, `philhealth_enabled`, `pagibig_enabled`, `payroll_method`, `status`
- `PayrollPeriod`: `id`, `code`, `start_date`, `end_date`, `payout_date`, `frequency`, `status`
- `PayrollInput`: `id`, `payroll_period_id`, `user_id`, `days_worked`, `hours_worked`, `overtime_hours`, `night_differential_minutes`, `late_minutes`, `undertime_minutes`, `absent_days`, `manual_bonus`, `manual_commission`, `manual_allowance`, `loan_deduction`, `manual_deduction`
- `PayrollRun`: `id`, `payroll_period_id`, `run_number`, `status`, `total_gross_pay`, `total_employee_deductions`, `total_employer_contributions`, `total_net_pay`, `employee_count`
- `PayrollRunItem`: `id`, `payroll_run_id`, `user_id`, `gross_basic_pay`, `gross_pay`, `withholding_tax`, `employee_sss`, `employee_philhealth`, `employee_pagibig`, `total_deductions`, `net_pay`, `status`
- `PayrollItemLine`: `id`, `payroll_run_item_id`, `line_type`, `code`, `label`, `amount`, `sort_order`
- `PayrollSettingsVersion`: `id`, `version_name`, `effective_from`, `effective_to`, `is_active`, `settings_json`

Relationships to draw:

- `Employee` one-to-many `Attendance`
- `User` one-to-one `PayrollProfile`
- `PayrollPeriod` one-to-many `PayrollInput`
- `User` one-to-many `PayrollInput`
- `PayrollPeriod` one-to-many `PayrollRun`
- `PayrollRun` one-to-many `PayrollRunItem`
- `User` one-to-many `PayrollRunItem`
- `PayrollRunItem` one-to-many `PayrollItemLine`

Important corrections:

- Keep `PayrollRunItem` as the computed result record.
- Do not collapse everything into one old `PayrollRecord` class.
- Do not replace `PayrollRunItem` with a standalone `Payslip` entity unless you explicitly label payslip as a rendered view over run-item data.
- Mention that snapshots are stored in JSON inside the run item. Do not overdraw live foreign keys where the system stores immutable snapshots instead.

## 5. Design Class Diagram Revision Guide

## 5.1 How To Interpret “Design Class Diagram” For This System

This project is written in React + Express + service modules, not in Java-style domain classes. The cleanest way to make the design class diagrams match the system is:

- use `<<boundary>>` for pages/UI components
- use `<<control>>` for routes, controllers, middleware, and service modules
- use `<<entity>>` for database-backed domain records

Do not invent object-oriented classes that do not exist in the code.

## 5.2 Authentication / User / Role Design Diagram

Use these design classes:

- `<<boundary>> LoginPage`
- `<<boundary>> ChangePasswordPage`
- `<<boundary>> UsersPage`
- `<<boundary>> UserFormPage`
- `<<boundary>> RolesPage`
- `<<control>> AuthRoutes`
- `<<control>> UsersRoutes`
- `<<control>> RolesRoutes`
- `<<control>> AuthMiddleware`
- `<<entity>> User`
- `<<entity>> Role`
- `<<entity>> Permission`
- `<<entity>> Employee`
- `<<entity>> EmployeeDocument`
- `<<entity>> File`

Key dependencies to show:

- `LoginPage -> AuthRoutes`
- `ChangePasswordPage -> AuthRoutes`
- `UsersPage -> UsersRoutes`
- `UserFormPage -> UsersRoutes`
- `RolesPage -> RolesRoutes`
- `AuthRoutes -> AuthMiddleware`
- `UsersRoutes -> User`
- `UsersRoutes -> Employee`
- `UsersRoutes -> EmployeeDocument`
- `RolesRoutes -> Role`
- `RolesRoutes -> Permission`

Important correction:

- Add document verification behavior to the user-management design.

## 5.3 Product / Category / Inventory Design Diagram

Use these design classes:

- `<<boundary>> CategoriesPage`
- `<<boundary>> InventoryPage`
- `<<control>> CategoriesRoutes`
- `<<control>> ProductsRoutes`
- `<<control>> InventoryRoutes`
- `<<control>> QrCodeService`
- `<<control>> InventoryStock`
- `<<entity>> Category`
- `<<entity>> CategoryType`
- `<<entity>> Product`
- `<<entity>> InventoryTransaction`
- `<<entity>> InventoryAdjustment`
- `<<entity>> DamageRepairEvent`

Key dependencies to show:

- `CategoriesPage -> CategoriesRoutes`
- `InventoryPage -> ProductsRoutes`
- `InventoryPage -> InventoryRoutes`
- `ProductsRoutes -> Category`
- `ProductsRoutes -> Product`
- `ProductsRoutes -> QrCodeService`
- `InventoryRoutes -> InventoryTransaction`
- `InventoryRoutes -> InventoryAdjustment`
- `InventoryRoutes -> InventoryStock`

Important corrections:

- Category type is support data for product validation, not a full independent UI workflow in the active build.
- Repaired-product intake belongs to inventory design if you want to reflect the damaged-to-repair flow.

## 5.4 Sales and Returns Design Diagram

Use these design classes:

- `<<boundary>> SalesPage`
- `<<control>> SalesRoutes`
- `<<control>> DraftSaleService`
- `<<control>> SalesSupport`
- `<<control>> ScannerSchemaService`
- `<<entity>> Sale`
- `<<entity>> SaleItem`
- `<<entity>> Customer`
- `<<entity>> Product`
- `<<entity>> InventoryTransaction`
- `<<entity>> SaleScanEvent`

Key dependencies to show:

- `SalesPage -> SalesRoutes`
- `SalesRoutes -> DraftSaleService`
- `SalesRoutes -> SalesSupport`
- `SalesRoutes -> ScannerSchemaService`
- `DraftSaleService -> Sale`
- `DraftSaleService -> SaleItem`
- `SalesRoutes -> InventoryTransaction` during checkout and returns
- `SalesRoutes -> Customer` for customer linking

Important corrections:

- Replace any `Cart` control/entity with `DraftSaleService` and `Sale(status=DRAFT)`.
- Receipt-based return should depend on loading an existing sale by `receipt_no`.

## 5.5 Supplier and Purchasing Design Diagram

Use these design classes:

- `<<boundary>> SuppliersPage`
- `<<boundary>> BalePurchaseOrderPage`
- `<<control>> SuppliersRoutes`
- `<<control>> BalePurchasesRoutes`
- `<<entity>> Supplier`
- `<<entity>> BalePurchase`
- `<<entity>> BaleBreakdown`
- `<<entity>> BaleSupplierReturn`
- `<<entity>> BaleSupplierReturnItem`
- `<<entity>> InventoryAdjustment`

Key dependencies to show:

- `SuppliersPage -> SuppliersRoutes`
- `BalePurchaseOrderPage -> BalePurchasesRoutes`
- `BalePurchasesRoutes -> Supplier`
- `BalePurchasesRoutes -> BalePurchase`
- `BalePurchasesRoutes -> BaleBreakdown`
- `BalePurchasesRoutes -> BaleSupplierReturn`
- `BalePurchasesRoutes -> InventoryAdjustment`

Important corrections:

- Do not depend on a `BrokenDownStatusController` or similar invented class.
- Do not make `BaleBreakdownProductSync` a mandatory active runtime dependency in the main purchasing design diagram, because it is not wired into the active breakdown route.

## 5.6 Customer Design Diagram

Use these design classes:

- `<<boundary>> CustomersPage`
- `<<boundary>> CustomerFormPage`
- `<<control>> CustomersRoutes`
- `<<entity>> Customer`
- `<<entity>> Sale`
- `<<entity>> SaleItem`

Key dependencies to show:

- `CustomersPage -> CustomersRoutes`
- `CustomerFormPage -> CustomersRoutes`
- `CustomersRoutes -> Customer`
- `CustomersRoutes -> Sale`
- `CustomersRoutes -> SaleItem`

Important correction:

- Keep purchase history as a derived view from customer-linked sales, not as a separate stored history class.

## 5.7 Payroll and Attendance Design Diagram

Use these design classes:

- `<<boundary>> PayrollProfilesPage`
- `<<boundary>> PayrollPeriodsPage`
- `<<boundary>> PayrollInputSheetPage`
- `<<boundary>> PayrollPreviewPage`
- `<<boundary>> PayrollPayslipPage`
- `<<boundary>> PayrollReportsPage`
- `<<boundary>> MyPayslipsPage`
- `<<boundary>> PayrollDTRPage`
- `<<boundary>> AttendancePage`
- `<<control>> PayrollRoutes`
- `<<control>> PayrollController`
- `<<control>> SyncAttendanceToInputs`
- `<<control>> ComputePayrollRun`
- `<<control>> ComputeEmployeePayroll`
- `<<control>> ComputeSSS`
- `<<control>> ComputePhilHealth`
- `<<control>> ComputePagibig`
- `<<control>> ComputeWithholdingTax`
- `<<control>> AttendanceRoutes`
- `<<entity>> Attendance`
- `<<entity>> PayrollProfile`
- `<<entity>> PayrollPeriod`
- `<<entity>> PayrollInput`
- `<<entity>> PayrollRun`
- `<<entity>> PayrollRunItem`
- `<<entity>> PayrollItemLine`
- `<<entity>> PayrollSettingsVersion`
- `<<entity>> User`

Key dependencies to show:

- `PayrollProfilesPage -> PayrollRoutes`
- `PayrollPeriodsPage -> PayrollRoutes`
- `PayrollInputSheetPage -> PayrollRoutes`
- `PayrollPreviewPage -> PayrollRoutes`
- `PayrollPayslipPage -> PayrollRoutes`
- `MyPayslipsPage -> PayrollRoutes`
- `AttendancePage -> AttendanceRoutes`
- `PayrollRoutes -> PayrollController`
- `PayrollController -> SyncAttendanceToInputs`
- `PayrollController -> ComputePayrollRun`
- `ComputePayrollRun -> ComputeEmployeePayroll`
- `ComputeEmployeePayroll -> ComputeSSS`
- `ComputeEmployeePayroll -> ComputePhilHealth`
- `ComputeEmployeePayroll -> ComputePagibig`
- `ComputeEmployeePayroll -> ComputeWithholdingTax`
- `PayrollController -> PayrollProfile`
- `PayrollController -> PayrollPeriod`
- `PayrollController -> PayrollInput`
- `PayrollController -> PayrollRun`
- `PayrollController -> PayrollRunItem`
- `PayrollController -> PayrollItemLine`
- `PayrollController -> PayrollSettingsVersion`

Important corrections:

- Separate `compute`, `finalize`, `release`, and `void`.
- Make attendance sync an explicit control dependency.
- Do not create a fake `PayslipGeneratorPDF` class unless you clearly label it as browser print rendering, not a server-side payroll engine class.

## 6. What You Should Remove From Your Old Diagrams If They Are Still There

Remove or rename these if they still appear:

- `Cart` as the main persistent sales class
- `Low Stock Alert -> Notifies Manager`
- `Broken Down` purchase-order status
- `Manager approves payroll` as a required gate
- `Payroll is future scope`
- `Automatic mass bale stock creation on breakdown save`
- `ProductType` as a strict foreign-key child of `Product`
- `Payslip PDF generation` as a backend-generated payroll artifact
- `BalePurchaseRecord` as a separate required core entity if it duplicates `BalePurchase`

## 7. Safest Final Redraw Strategy

If you want the cleanest revision with the lowest risk of another mismatch:

1. Keep your existing subsystem count.
2. Update the actor names and use cases to match the active routes and permissions.
3. Update the domain classes to match the actual tables and live relationships.
4. Redraw the design class diagrams using `boundary-control-entity` style instead of inventing Java-like classes.
5. Remove any automation claim that the active routes do not currently perform.

