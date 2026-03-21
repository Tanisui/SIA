# Backend — Authentication & RBAC

Responsibilities
- Validate JWT tokens for incoming requests and resolve user roles and permissions for authorization checks.

Key functions
- `verifyToken(req,res,next)`: parses `Authorization: Bearer <token>`, verifies JWT using `getJwtSecret()`, sets `req.auth` and checks that the user exists and is active (`users.is_active`). Returns 401/403 on failure.
- `getUserPermissions(userId)`: queries the database for roles and permissions. Supports two schema variants: with `users.role_id` column or without it (uses `user_roles`). Aggregates role permissions and direct user permissions into a single permissions set.
- `authorize(permission)`: middleware that accepts a permission string or array; allows exact matches and wildcard matches (e.g., `prefix.*`). `admin.*` grants universal access.

Security notes
- Wildcard permissions provide flexible grants but must be used carefully (e.g., `admin.*` is powerful).
- Permission resolution runs DB queries per request; consider caching if traffic is high.

Files
- `backend/src/middleware/authMiddleware.js`
- `backend/src/config/security.js` (JWT secret provider)
