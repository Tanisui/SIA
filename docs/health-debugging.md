# Health Checks & Debugging

Health endpoints
- `GET /` — basic health check; calls `database.testConnection()` and returns `{ status: 'success' }` or `500` with error.
- `GET /health` and `GET /health/database` — explicit DB health checks.

Common failure modes and how to investigate
- Database connection error:
  - Symptoms: `testConnection()` logs an error at startup; `/health/database` returns 500.
  - Check: `DB_*` env vars in `backend/.env`; run `mysql` client to verify connectivity.
- Authentication errors (401):
  - Symptoms: frontend redirects to `/login` after an API call and clears token.
  - Check: ensure `Authorization` header exists and token is not expired; inspect backend logs for `invalid token` messages.
- Authorization errors (403):
  - Symptoms: response `{ error: 'forbidden' }`.
  - Check: inspect `role_permissions` and `user_permissions` records for the user (via DB), and ensure permission strings match expected route checks.
- Port in use (EADDRINUSE):
  - Symptoms: server logs port-in-use and exits.
  - Check: change `PORT` env or kill existing process using the port.

Useful commands
```bash
# Check health
curl -v http://localhost:3000/health

# Check DB health
curl -v http://localhost:3000/health/database

# Example authenticated request (replace TOKEN)
curl -H "Authorization: Bearer TOKEN" http://localhost:3000/users

# Inspect CSP header
curl -I http://localhost:3000/
```
