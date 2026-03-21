# Frontend — Runtime & UI Guide

This document describes what the frontend looks like and how it behaves when running locally or in development.

Overview
- The frontend is a React SPA (Vite) located in the `frontend/` folder. The app is mounted in `frontend/src/main.js` and routes are defined in `frontend/src/App.js`.
- The UI uses a top `Header`, a left `Sidebar`, and a central content area provided by `Layout` (`frontend/src/components/Layout.js`). Pages are organized under protected routes and require authentication.

Run the dev server
```bash
cd frontend
npm install
npm run dev
# Open http://localhost:5173 (default Vite port)
```

Authentication & navigation
- On first load the app redirects to `/login` if not authenticated. After successful login the backend returns a JWT which the frontend stores in `localStorage.token` and user info/permissions in `localStorage.user` / `localStorage.permissions` and in the Redux `auth` slice.
- `ProtectedRoute` prevents access to pages unless the user is authenticated. The `Sidebar` shows navigation links based on permissions.

Global layout & common elements
- Header: contains app title, user avatar / menu, and quick actions (logout, change password).
- Sidebar: navigation links to main modules (Dashboard, Users, Products, Inventory, Sales, Purchasing, Payroll, Attendance, Reports, Settings, Files, Notifications).
- Content area: each page uses `EntityPage`, `Table`, `Card`, `FormGroup`, `Pagination`, and `Modal` components for listing, detail views, and CRUD operations.

Representative pages (what they look like)
- Dashboard: KPI cards (sales, low-stock alerts), charts, quick links. Typically a grid of `Card` components.
- Users / Roles: table listing with pagination, filter controls, `Create` button opening a modal form, per-row `Edit` and `Permissions` actions.
- Inventory: transactions feed with filters (date, product), stock-in / stock-out forms, and alerts for low-stock items.
- Sales: POS-style create sale flow or sale listing with refund action. Forms for customer selection and payment.
- Payroll / Attendance: employee lists, attendance records, payroll generation and process buttons.

Network behavior
- All API calls go through `frontend/src/api/api.js` which sets `baseURL` from `VITE_API_BASE` (default `http://localhost:3000`).
- Axios request interceptor attaches `Authorization: Bearer <token>` from `localStorage`.
- On response 401 (except `/auth/change-password`), the client clears auth and navigates to `/login`.

Developer tips & expected runtime signals
- If the Sidebar is empty or pages 403, verify `localStorage.permissions` and the backend `role_permissions`/`user_permissions` for the user.
- When the dev server runs, the console shows Vite info; network requests are visible in DevTools → Network and have `Authorization` headers.
- If the frontend cannot reach the API, set `VITE_API_BASE=http://localhost:3000` in `.env` or in the dev environment.

Screenshots / Visual hints
- Header + Sidebar + Content grid is the canonical layout. Tables use rows with action buttons on the right; forms appear in modals for create/edit flows.

Files to inspect for UI behavior
- `frontend/src/App.js` — route mapping
- `frontend/src/components/Layout.js` — layout and navigation
- `frontend/src/api/api.js` — network client and auth handling
- `frontend/src/store/authSlice.js` — auth state and permissions
