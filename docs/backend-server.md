# Backend — server.js

Responsibilities
- Bootstrap the Express application, apply global middleware, mount all route modules, add health endpoints, set minimal CSP, and start the HTTP server.

Key behaviors
- Loads environment from `.env` via `dotenv`.
- Global middleware: `cors()` and `express.json()` are applied for CORS and JSON body parsing.
- Adds a response header `Content-Security-Policy` (configured for local dev origins and allows inline scripts/styles currently).
- Mounts resource routers under path prefixes (e.g., `/users`, `/products`, `/inventory`, `/employees`, etc.).
- Customer routes are intentionally retired from runtime: `/customers*` endpoints are not mounted in `server.js`.
- Provides health endpoints: `/`, `/health`, `/health/database` which call the DB `testConnection()`.
- Starts server on `process.env.PORT || 3000`; handles `EADDRINUSE` and exits with a helpful message.

Runtime notes
- `server.js` assumes the `database` module exports `testConnection()` and a `pool` used by routes.
- CSP is permissive for development; tighten for production.

Files referenced
- `backend/src/database/database.js`
- `backend/src/routes/*`
- `backend/src/middleware/authMiddleware.js`
