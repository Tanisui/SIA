# SIA — Project Overview

Purpose
- SIA is a lightweight ERP-style web application combining inventory, sales, purchasing, HR (employees, attendance, payroll), and financial reporting. It provides a React single-page frontend and an Express + MySQL backend with JWT authentication and role/permission (RBAC) access control.

High-level architecture
- Frontend: React (Vite) SPA that communicates with REST API endpoints. Routes and UI pages are defined in `frontend/src/App.js`.
- Backend: Node.js + Express API server (`backend/server.js`) that mounts resource routers in `backend/src/routes/` and uses a pooled MySQL connection (`backend/src/database/database.js`).
- Auth & RBAC: JWT tokens validated by middleware; permissions resolved from `roles`, `role_permissions`, `user_permissions` and optional `users.role_id`.

Who should read this
- New contributors, code reviewers, and maintainers who need a quick orientation to the project structure and responsibilities.
