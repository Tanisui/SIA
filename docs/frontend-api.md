# Frontend — API client

Responsibilities
- Centralize HTTP requests to the backend, attach JWT Authorization headers, and implement global error handling for responses.

Key behaviors (`frontend/src/api/api.js`)
- `baseURL` set from `import.meta.env.VITE_API_BASE` or `http://localhost:3000` by default.
- Request interceptor: reads `token` from `localStorage` and attaches `Authorization: Bearer <token>` header when present.
- Response interceptor: on 401 (except requests whose URL includes `/auth/change-password`) clears `localStorage` keys (`token`, `user`, `permissions`) and redirects to `/login`.

Implications
- Automatic logout on 401 is helpful but may need exceptions if token-refresh logic is added.
- Ensure `VITE_API_BASE` matches backend for local development.
