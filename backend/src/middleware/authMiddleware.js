const jwt = require('jsonwebtoken')
const db = require('../database')

let hasUsersRoleIdColumnCache = null

async function hasUsersRoleIdColumn() {
  if (hasUsersRoleIdColumnCache !== null) return hasUsersRoleIdColumnCache
  const [rows] = await db.pool.query(
    `SELECT 1 AS found
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'users'
       AND COLUMN_NAME = 'role_id'
     LIMIT 1`
  )
  hasUsersRoleIdColumnCache = rows.length > 0
  return hasUsersRoleIdColumnCache
}

async function getUserPermissions(userId){
  // Support both schemas: with or without users.role_id
  const includeDirectRole = await hasUsersRoleIdColumn()
  const roleSql = includeDirectRole
    ? `SELECT id, name FROM roles
       WHERE id IN (SELECT role_id FROM user_roles WHERE user_id = ?)
          OR id = (SELECT role_id FROM users WHERE id = ?)`
    : `SELECT id, name FROM roles
       WHERE id IN (SELECT role_id FROM user_roles WHERE user_id = ?)`

  const roleParams = includeDirectRole ? [userId, userId] : [userId]
  const [roleRows] = await db.pool.query(roleSql, roleParams)
  
  const perms = new Set()
  for (const r of roleRows) {
    const [pRows] = await db.pool.query(
      `SELECT p.name FROM permissions p JOIN role_permissions rp ON rp.permission_id = p.id WHERE rp.role_id = ?`,
      [r.id]
    )
    for (const p of pRows) perms.add(p.name)
  }

  const [uPerms] = await db.pool.query(
    `SELECT p.name FROM permissions p JOIN user_permissions up ON up.permission_id = p.id WHERE up.user_id = ?`,
    [userId]
  )
  for (const p of uPerms) perms.add(p.name)
  
  return { roles: roleRows.map(r => r.name), permissions: Array.from(perms) }
}

async function verifyToken(req, res, next){
  const auth = req.headers.authorization || ''
  const parts = auth.split(' ')
  if (parts.length !== 2 || parts[0] !== 'Bearer') return res.status(401).json({ error: 'missing token' })
  const token = parts[1]
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || 'dev_secret')
    req.auth = { id: payload.id, username: payload.username }
    
    const [rows] = await db.pool.query('SELECT is_active FROM users WHERE id = ? LIMIT 1', [req.auth.id])
    if (!rows.length) return res.status(401).json({ error: 'user not found' })
    
    if (Number(rows[0].is_active) !== 1) {
      return res.status(403).json({ error: 'Account inactive' })
    }
    return next()
  } catch (e) {
    return res.status(401).json({ error: 'invalid token' })
  }
}

function authorize(permission) {
  return async (req, res, next) => {
    try {
      if (!req.auth || !req.auth.id) return res.status(401).json({ error: 'unauthenticated' })
      
      const info = await getUserPermissions(req.auth.id)
      req.auth.permissions = info.permissions
      req.auth.roles = info.roles

      const requiredPermissions = Array.isArray(permission) ? permission : [permission]
      const normalizedRequired = requiredPermissions.filter(Boolean)
      if (!normalizedRequired.length) return next()

      // 1. Check for exact match (any-of)
      const hasExact = normalizedRequired.some((required) => info.permissions.includes(required))
      if (hasExact) return next()

      // 2. Check for wildcard match (any-of)
      const hasWildcard = info.permissions.some(p => {
        if (p === 'admin.*') return true
        if (p.endsWith('.*')) {
          const prefix = p.split('.')[0]
          return normalizedRequired.some((required) => String(required).startsWith(prefix + '.'))
        }
        return false
      })

      if (hasWildcard) return next()

      return res.status(403).json({ error: 'forbidden' })
    } catch (err) {
      console.error('authorize error', err)
      return res.status(500).json({ error: 'authorization failed' })
    }
  }
}

module.exports = { verifyToken, authorize, getUserPermissions }