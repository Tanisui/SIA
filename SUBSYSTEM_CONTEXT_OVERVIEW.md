# SIA Subsystem Context Overview

This document provides a focused overview of the main subsystems in the SIA project, summarizing their roles, main entities, and interactions. Each section can be referenced for documentation and diagramming.

---

## 1. HR System
- **Purpose:** Manage employees, roles, and user authentication.
- **Key Features:**
  - Employee CRUD (Create, Read, Update, Delete)
  - Role assignment and permissions (RBAC)
  - Document uploads (e.g., employee files)
  - User authentication (login, password reset)
- **Main Entities:** Employee, Admin, Role, FileUpload, AuditTrail

---

## 2. Inventory System
- **Purpose:** Track and manage product stock, movement, and reporting.
- **Key Features:**
  - Stock-in and stock-out operations
  - Damaged goods and shrinkage tracking
  - Inventory reporting
  - Product categorization
- **Main Entities:** Inventory, Product, Admin, Employee, AuditTrail

---

## 3. Purchasing System
- **Purpose:** Manage suppliers and product procurement.
- **Key Features:**
  - Supplier CRUD
  - Supplier-product relationships
  - Purchase order management (if implemented)
- **Main Entities:** Supplier, Product, Admin, Employee

---

## 4. Sales Ordering System
- **Purpose:** Handle sales transactions, POS operations, and sales reporting.
- **Key Features:**
  - Draft sales and order processing
  - Barcode/QR scanning for sales
  - Transaction management
  - Sales and inventory reports
- **Main Entities:** Sales, Product, Customer (if applicable), Admin, Employee, Notification

---

## Use Case Summary for SIA Subsystems

### HR System
- **Actors:** Admin, Employee
- **Main Use Cases:**
  - Admin manages employees (CRUD)
  - Admin assigns roles and permissions
  - Admin and Employee upload/view employee documents
  - Admin and Employee view audit trail
  - Admin and Employee login/logout, reset password

### Inventory System
- **Actors:** Admin, Employee
- **Main Use Cases:**
  - Admin and Employee perform stock in/out
  - Admin and Employee view inventory
  - Admin and Employee manage damaged goods and shrinkage
  - Admin and Employee generate/view inventory reports
  - Admin and Employee categorize products, generate barcodes/QRs
  - Admin and Employee manage products (CRUD)

### Purchasing System
- **Actors:** Admin, Employee, Supplier
- **Main Use Cases:**
  - Admin and Employee manage suppliers (CRUD)
  - Admin and Employee manage supplier-product relationships
  - Admin and Employee create/view purchase orders
  - Supplier supplies products, receives purchase orders

### Sales Ordering System
- **Actors:** Admin, Employee, Customer
- **Main Use Cases:**
  - Admin and Employee draft/process sales orders
  - Admin and Employee scan barcodes/QRs for sales
  - Admin and Employee manage transactions
  - Admin and Employee generate/view sales reports
  - Customer places orders, tracks order status

### Notifications & Audit
- **Actors:** Admin, Employee, Customer
- **Main Use Cases:**
  - System sends notifications to users
  - Admin and Employee receive system/user notifications
  - Admin reviews audit trail, Employee triggers audit events

### File Uploads
- **Actors:** Admin, Employee
- **Main Use Cases:**
  - Admin and Employee upload employee documents
  - Admin and Employee upload product QR/barcode images

---

These use case summaries are based on a comprehensive analysis of your system's backend, frontend, and all documented modules. Each subsystem is mapped to its primary actors and core use cases for clear documentation and future diagramming.

Each subsystem interacts with shared modules such as authentication, notifications, and audit trails. For detailed relationships, refer to the entity-relationship diagram.
