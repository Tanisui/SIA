# Promptable Descriptions — Paste these into an LLM

Use the prompts below to ask another AI to analyze, summarize, or propose changes for each JS file or module. For each entry: copy the "Prompt to paste" section and submit it to the AI along with the file contents.

---

## Backend — core

- File: `backend/server.js`
  - Role: App bootstrap, middleware, route mounting, health endpoints, CSP.
  - Prompt to paste:
    "Analyze `backend/server.js`: summarize responsibilities, list all middleware and routes mounted, identify security and startup issues (CSP, health checks), and suggest 3 prioritized, low-risk improvements with code snippets."

- File: `backend/src/database/database.js`
  - Role: MySQL pool creation and `testConnection()` health helper.
  - Prompt to paste:
    "Analyze `backend/src/database/database.js`: explain connection pooling settings, env var usage, and `testConnection()` behavior. Point out risks (silent failures, retries), and provide a minimal patch to make startup fail-fast on initial DB connection."

- File: `backend/src/config/security.js`
  - Role: Provides JWT secret / security config.
  - Prompt to paste:
    "Analyze `backend/src/config/security.js`: list how JWT secret is obtained, any default secrets, and recommend secure practices for secrets management and rotation. Provide code and config suggestions."

- File: `backend/src/middleware/authMiddleware.js`
  - Role: JWT verification, user status check, permission resolution and `authorize()` middleware.
  - Prompt to paste:
    "Analyze `backend/src/middleware/authMiddleware.js`: describe `verifyToken`, `getUserPermissions`, and `authorize`. Identify potential performance, security, and correctness issues (e.g., SQL queries per-request, wildcard matching). Suggest 4 concrete improvements and show code snippets or caching ideas."

---

## Backend — routes (use the template below for any route file)

Template (copy & paste before file content):
"Analyze [FILE_PATH]: summarize the REST endpoints defined, required permissions, input validation patterns, and error handling. List any security or correctness concerns and propose 2 small patches to harden or clean up the file."

Use the template for these route files (each file defines an Express `Router`):
- `backend/src/routes/auth.js` — auth endpoints (login, change-password)
- `backend/src/routes/rbac.js` — permissions and roles listing
- `backend/src/routes/users.js` — user CRUD and management
- `backend/src/routes/roles.js` — role CRUD
- `backend/src/routes/products.js` — product CRUD, low-stock alerts
- `backend/src/routes/categories.js` — categories CRUD
- `backend/src/routes/suppliers.js` — suppliers CRUD
- `backend/src/routes/inventory.js` — inventory transactions, stock-in/out, reports
- `backend/src/routes/purchaseOrders.js` — purchase orders flows
- `backend/src/routes/sales.js` — sales create/list/refund
- `backend/src/routes/customers.js` — customers CRUD
- `backend/src/routes/employees.js` — employees CRUD
- `backend/src/routes/attendance.js` — attendance records
- `backend/src/routes/payroll.js` — payroll processing
- `backend/src/routes/reports.js` — report generation
- `backend/src/routes/files.js` — file upload/metadata
- `backend/src/routes/settings.js` — system settings
- `backend/src/routes/notifications.js` — notification CRUD and send
- `backend/src/routes/audit.js` — audit logs
- `backend/src/routes/expenses.js` — expense endpoints
- `backend/src/routes/dashboard.js` — stats endpoints
- `backend/src/routes/ledger.js` — ledger/finance endpoints

---

## Frontend — core files

- File: `frontend/src/main.js`
  - Role: React app bootstrap and root mounting.
  - Prompt to paste:
    "Summarize `frontend/src/main.js`: identify how the app is mounted and any global wrappers (Redux Provider, Router). Suggest improvements for hydration, error boundaries, or dev-time enhancements."

- File: `frontend/src/App.js`
  - Role: Router and page mapping; defines public and protected routes.
  - Prompt to paste:
    "Analyze `frontend/src/App.js`: list all routes and which pages are protected. Explain how `ProtectedRoute` is used, and suggest any improvements for lazy loading, code-splitting, or route-based permission checks."

- File: `frontend/src/api/api.js`
  - Role: Central Axios client, attaches JWT, and handles global response logic (401 logout exception for `/auth/change-password`).
  - Prompt to paste:
    "Analyze `frontend/src/api/api.js`: explain the request/response interceptors, the logout-on-401 logic, and any edge cases (token refresh). Recommend a resilient pattern for handling expired tokens (refresh flow) and show a minimal implementation outline."

- File: `frontend/src/store/authSlice.js`
  - Role: Redux slice for auth state (token, user, permissions).
  - Prompt to paste:
    "Analyze `frontend/src/store/authSlice.js`: list actions and reducers, how state is persisted, and whether permissions are stored. Suggest improvements to avoid stale state and to sync with `localStorage` and API client."

---

## Frontend — pages & components (use template)

Template (copy & paste before file content):
"Describe what this React component/page does, its props/state, side effects (API calls), and UX behavior. Suggest accessibility, performance, or UX improvements and include a small code snippet if needed."

Representative components/pages to prompt about:
- `frontend/src/pages/Login.js` — login form and submit
- `frontend/src/pages/Dashboard.js` — KPI cards and charts
- `frontend/src/pages/Users.jsx` and `frontend/src/pages/Users.js` — users list & CRUD
- `frontend/src/pages/Products.js` — product listing and management
- `frontend/src/pages/Inventory.js` — inventory transactions UI
- `frontend/src/pages/Sales.js` — sales page/pos
- `frontend/src/pages/Payroll.js` — payroll UI
- `frontend/src/pages/Attendance.js` — attendance UI
- `frontend/src/components/Layout.js` — header/sidebar/content layout
- `frontend/src/components/ProtectedRoute.js` — route protection logic
- `frontend/src/components/EntityPage.js` — common entity listing/detail patterns

---

## How to use these prompts

1. Open the JS file content in your editor or fetch the file text.
2. Copy the corresponding "Prompt to paste" above and send it to the AI together with the file contents.
3. Ask the AI for a short summary, a list of potential issues (security, correctness), and 2–3 suggested code patches.

Tip: for route files, include example requests (method + path + body) when asking for input validation checks.

---

If you want, I can automatically generate a per-file prompt file (one `.md` per JS file) under `docs/prompts/` so each prompt is pre-populated for every file. Should I do that? 
