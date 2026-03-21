# Frontend — Routing & Pages

Responsibilities
- Define application routes, protect pages that require authentication, and map URLs to React page components.

Key file
- `frontend/src/App.js`: sets up routes using `react-router-dom` `Routes` and `Route`.

Routing notes
- Public routes: `/login`, `/forgot-password`, `/forgot-email`.
- Protected app (root `/`) uses `ProtectedRoute` and `Layout`. Inside it are main pages: `Dashboard`, `Users` (also `employees` is redirected to `users`), `Roles`, `Categories`, `Inventory`, `Sales`, `Customers`, `Purchasing`, `Payroll`, `Expenses`, `Audit`, `Files`, `Settings`, `Attendance`, `Notifications`, `Reports`, and `ChangePassword`.

ProtectedRoute
- Ensures the user is authenticated (via Redux/authSlice and/or `localStorage`) before rendering the app shell. On missing auth, it should redirect to `/login`.
