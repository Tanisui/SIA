# SIA — Quick Start & Run Guide

This README summarizes how to run the SIA app locally, required environment variables, health checks, and quick debugging commands.

---

## Quick summary
SIA is a React single-page app (frontend/) that communicates with a Node/Express API (backend/) backed by a MySQL database. Authentication uses JWTs and a role/permission RBAC system.

## Prerequisites
- Node.js (>=14)
- npm
- MySQL server accessible from the machine running the backend

## Environment variables

Backend (`backend/.env`)
- `PORT` (optional) — port to run the backend (default: `3000`)
- `DB_HOST` — MySQL host (e.g. `localhost`)
- `DB_PORT` (optional) — MySQL port (default: `3306`)
- `DB_DATABASE` — database name
- `DB_USERNAME` — database user
- `DB_PASSWORD` — database password
- (Other config may exist under `backend/src/config`)

Frontend (Vite, `frontend/.env` or runtime)
- `VITE_API_BASE` — base URL for API requests (default `http://localhost:3000`)

Note: Add a `backend/.env.example` file with the above keys for developer convenience.

## Start backend (development)

1. Install dependencies and run the server:

```bash
cd backend
npm install
# create a .env with the DB_* variables
node server.js
```

The backend exposes top-level routes such as `/auth`, `/users`, `/products`, `/inventory`, `/sales`, `/employees`, and many more (see `backend/src/routes/`). Health endpoints: `/`, `/health`, `/health/database`.

If the port is already in use the server will log an error and exit.

## Start frontend (development)

```bash
cd frontend
npm install
npm run dev
```

Ensure `VITE_API_BASE` points to your backend (e.g. `http://localhost:3000`) if needed.

## Health checks & quick API tests

Check overall health and DB connectivity:

```bash
curl -v http://localhost:3000/health
curl -v http://localhost:3000/health/database
```

Authenticated API call example (replace `<TOKEN>`):

```bash
curl -H "Authorization: Bearer <TOKEN>" http://localhost:3000/users
```

Check CSP header (server sets Content-Security-Policy):

```bash
curl -I http://localhost:3000/
```

## Common runtime notes and debugging
- On startup `backend/src/database/database.js` calls `testConnection()`; it currently logs DB errors but the server keeps running — check `/health/database` to confirm DB connectivity.
- 401 responses mean missing/invalid token; frontend auto-clears auth on 401 (except for `/auth/change-password`).
- 403 responses mean missing permissions — inspect `role_permissions` and `user_permissions` tables.
- If you see `EADDRINUSE`, change `PORT` or stop the process using the port.

## Files of interest
- Backend entry: `backend/server.js`
- DB pool: `backend/src/database/database.js`
- Auth middleware & RBAC: `backend/src/middleware/authMiddleware.js`
- Frontend API client: `frontend/src/api/api.js`
- Frontend routes: `frontend/src/App.js`

## Small improvements to add
- `backend/.env.example` with required env keys
- Fail-fast behavior in `testConnection()` during CI/startup
- README expansion with endpoint list and developer notes

---

If you want, I can commit a `backend/.env.example` and a short `README` section listing the most-used endpoints next.
