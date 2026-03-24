# Backend — database module

Responsibilities
- Create and export a MySQL connection pool using `mysql2/promise` and expose a `testConnection()` helper used by health checks and startup.

Behavior
- Reads DB settings from environment variables: `DB_HOST`, `DB_PORT`, `DB_DATABASE`, `DB_USERNAME`, `DB_PASSWORD`.
- Creates a pool with `connectionLimit: 10` and `waitForConnections: true`.
- `testConnection()` acquires a connection, calls `conn.ping()`, and releases it. On error it logs the issue (current behavior does not exit process).
- Customer data is preserved in the database for historical integrity/rollback, even though the Customers module is deprecated in runtime.

Recommendations
- Fail-fast: consider exiting the process when the initial `testConnection()` fails in CI or production.
- Add `.env.example` documenting required vars.

Files
- `backend/src/database/database.js`
- SQL schema & seeds: `backend/src/database/sia.sql` and any seed scripts.
