# SIA System Context Overview

This document provides a contextual overview of all major systems and subsystems in the SIA project, summarizing their roles and interactions. This serves as a foundation for updating the final documentation and for creating use case diagrams.

## 1. Backend
- **API Server**: Handles all business logic, authentication, authorization (RBAC), and data processing.
- **Database Layer**: Manages schema, migrations, and direct SQL operations.
- **Repositories**: Encapsulate data access for entities like products, users, roles, inventory, etc.
- **Routes**: RESTful endpoints for modules such as products, sales, inventory, employees, suppliers, categories, reports, notifications, and more.
- **Middleware**: Handles authentication, security, and request validation.
- **Services**: Business logic for draft sales, inventory, and other domain-specific operations.
- **Seed & Migration Scripts**: For initializing and updating the database schema and seed data.

## 2. Frontend
- **React SPA**: User interface for all business operations, including inventory, sales, employee management, reporting, and more.
- **Pages**: Each business domain (e.g., Inventory, Sales, Employees, Products) has a dedicated page/component.
- **Components**: Reusable UI elements (tables, modals, forms, etc.).
- **API Layer**: Handles communication with the backend.
- **Store**: State management for user sessions, data caching, etc.
- **Assets**: Static files such as images and icons.

## 3. Authentication & RBAC
- **User Authentication**: Login, session management, and password reset.
- **Role-Based Access Control**: Permissions and roles for users, enforced both in backend and frontend.

## 4. Inventory & Product Management
- **Inventory**: Stock-in, stock-out, damaged goods, shrinkage, and reporting.
- **Products**: CRUD operations, barcode/QR generation, and product categorization.

## 5. Sales & POS
- **Sales**: Draft sales, barcode/QR scanning, and transaction management.
- **Reports**: Sales, inventory, and shrinkage reports.

## 6. Employees & Suppliers
- **Employee Management**: CRUD, role assignment, and document uploads.
- **Supplier Management**: CRUD and supplier-product relationships.

## 7. Notifications & Audit
- **Notifications**: System and user notifications for important events.
- **Audit Trail**: Tracks user actions and system changes for accountability.

## 8. File Uploads
- **Private Uploads**: Employee documents and other sensitive files.
- **QR Uploads**: Product QR/barcode images.

## 9. Utilities & Scripts
- **Database Sync & Backup**: PowerShell scripts for syncing and backing up the database.
- **Miscellaneous Utilities**: Helper scripts for migration, schema checks, and more.

---

This context overview should be referenced when updating the final documentation and for creating diagrams that illustrate system interactions and use cases.
