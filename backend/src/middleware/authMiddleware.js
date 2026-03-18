const jwt = require('jsonwebtoken')
const db = require('../database')

async function getUserPermissions(userId){
  // Check both user_roles table AND the direct role_id column in users table
  const [roleRows] = await db.pool.query(
    `SELECT id, name FROM roles WHERE id IN (SELECT role_id FROM user_roles WHERE user_id = ?) OR id = (SELECT role_id FROM users WHERE id = ?)`,
    [userId, userId]
  )
  
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

      // 1. Check for exact match
      if (info.permissions.includes(permission)) return next()

      // 2. Check for Wildcard match
      const hasWildcard = info.permissions.some(p => {
        if (p === 'admin.*') return true
        if (p.endsWith('.*')) {
          const prefix = p.split('.')[0]
          return permission.startsWith(prefix + '.')
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