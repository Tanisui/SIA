# Frontend — Overview

Responsibilities
- Provide the user interface: login, dashboard, and pages for users, products, inventory, sales, purchasing, payroll, attendance, reports, files, and settings. Implements client-side routing, state management, and API integration.

Structure
- Entry: `frontend/src/main.js` mounts React app.
- Routing & pages: `frontend/src/App.js` defines public routes and a protected app shell via `ProtectedRoute` + `Layout`.
- Components: reusable UI components live in `frontend/src/components/` (Table, Modal, Alert, Sidebar, Header, etc.).

Auth flow
- Stores JWT token and user/permissions in `localStorage` and Redux (`authSlice`). Protected pages check auth state and permissions.

Files of interest
- `frontend/src/App.js` — routes and page mapping
- `frontend/src/api/api.js` — Axios client and interceptors
- `frontend/src/store/authSlice.js` — auth state and reducers
