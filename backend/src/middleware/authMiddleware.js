const jwt = require('jsonwebtoken')
const db = require('../database')

async function getUserPermissions(userId){
  const [roleRows] = await db.pool.query(
    `SELECT r.id, r.name FROM roles r JOIN user_roles ur ON ur.role_id = r.id WHERE ur.user_id = ?`,
    [userId]
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
  if (parts.length !==2 || parts[0] !== 'Bearer') return res.status(401).json({ error: 'missing token' })
  const token = parts[1]
  try{
    const payload = jwt.verify(token, process.env.JWT_SECRET || 'dev_secret')
    req.auth = { id: payload.id, username: payload.username, roles: payload.roles }
    try{
      const [rows] = await db.pool.query('SELECT is_active FROM users WHERE id = ? LIMIT 1', [req.auth.id])
      if (!rows.length) return res.status(401).json({ error: 'user not found' })
      const u = rows[0]
      const activeFlag = Number(u.is_active)
      if (activeFlag !== 1) return res.status(403).json({ error: 'Account inactive — contact the administrator to activate your account' })
      return next()
    }catch(err){
      console.error('verifyToken DB check error', err)
      return res.status(500).json({ error: 'auth check failed' })
    }
  }catch(e){
    return res.status(401).json({ error: 'invalid token' })
  }
}

function authorize(permission){
  return async (req, res, next) => {
    try{
      if (!req.auth || !req.auth.id) return res.status(401).json({ error: 'unauthenticated' })
      const info = await getUserPermissions(req.auth.id)
      req.auth.permissions = info.permissions
      req.auth.roles = info.roles
      // allow if permission present
      if (info.permissions.includes(permission)) return next()
      // also allow if user has admin.* (seeder expands admin but keep safe check)
      if (info.permissions.includes('admin.*')) return next()
      return res.status(403).json({ error: 'forbidden' })
    }catch(err){
      console.error('authorize error', err)
      return res.status(500).json({ error: 'authorization failed' })
    }
  }
}

module.exports = { verifyToken, authorize, getUserPermissions }
