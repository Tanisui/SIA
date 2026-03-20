const express = require('express')
const router = express.Router()
const db = require('../database')
const crypto = require('crypto')
const jwt = require('jsonwebtoken')
const bcrypt = require('bcrypt')

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

/**
 * Helper to verify passwords supporting both legacy PBKDF2 (Django style) 
 * and modern BCrypt hashes.
 */
async function verifyPassword(storedHash, password) {
  if (!storedHash) return false
  
  if (storedHash.startsWith('pbkdf2_sha512$')) {
    const parts = storedHash.split('$')
    if (parts.length !== 4) return false
    const iterations = Number(parts[1])
    const salt = parts[2]
    const derived = parts[3]
    const derivedCheck = crypto.pbkdf2Sync(password, salt, iterations, 64, 'sha512').toString('hex')
    return crypto.timingSafeEqual(Buffer.from(derivedCheck, 'hex'), Buffer.from(derived, 'hex'))
  }
  
  return await bcrypt.compare(password, storedHash)
}

/**
 * Fetches all roles and flattened permissions for a user.
 * Checks both the user_roles table and the users.role_id column.
 */
async function getUserPermissions(userId) {
  // 1. Get roles from mapping table, and optionally users.role_id when present
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
  
  // 2. Get Permissions linked to those Roles
  for (const r of roleRows) {
    const [pRows] = await db.pool.query(
      `SELECT p.name FROM permissions p 
       JOIN role_permissions rp ON rp.permission_id = p.id 
       WHERE rp.role_id = ?`,
      [r.id]
    )
    for (const p of pRows) perms.add(p.name)
  }

  // 3. Get Direct User Permissions (Overhead/Individual overrides)
  const [uPerms] = await db.pool.query(
    `SELECT p.name FROM permissions p 
     JOIN user_permissions up ON up.permission_id = p.id 
     WHERE up.user_id = ?`,
    [userId]
  )
  for (const p of uPerms) perms.add(p.name)

  return { 
    roles: roleRows.map(r => r.name), 
    permissions: Array.from(perms) 
  }
}

// --- ROUTES ---

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body || {}
    if (!username || !password) {
      return res.status(400).json({ error: 'username and password required' })
    }

    const [rows] = await db.pool.query(
      'SELECT id, username, email, password_hash, full_name, is_active FROM users WHERE username = ? LIMIT 1', 
      [username]
    )

    if (!rows.length) return res.status(401).json({ error: 'invalid credentials' })
    const user = rows[0]

    // Check account status
    const activeFlag = Number(user.is_active)
    if (activeFlag !== 1) {
      return res.status(403).json({ error: 'Account inactive — contact the administrator to activate your account' })
    }

    // Check password
    if (!(await verifyPassword(user.password_hash, password))) {
      return res.status(401).json({ error: 'invalid credentials' })
    }

    // Gather permissions for the token and response
    const permInfo = await getUserPermissions(user.id)

    const payload = { 
      id: user.id, 
      username: user.username 
    }
    
    const token = jwt.sign(payload, process.env.JWT_SECRET || 'dev_secret', { expiresIn: '8h' })

    // Return full user object including permissions for frontend LocalStorage
    res.json({ 
      token, 
      user: { 
        id: user.id, 
        username: user.username, 
        full_name: user.full_name, 
        email: user.email, 
        roles: permInfo.roles, 
        permissions: permInfo.permissions 
      } 
    })
  } catch (err) {
    console.error('Login error:', err)
    res.status(500).json({ error: 'login failed' })
  }
})

router.get('/me', async (req, res) => {
  try {
    const auth = req.headers.authorization || ''
    const parts = auth.split(' ')
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      return res.status(401).json({ error: 'missing token' })
    }
    
    const token = parts[1]
    let payload
    try { 
      payload = jwt.verify(token, process.env.JWT_SECRET || 'dev_secret') 
    } catch(e) { 
      return res.status(401).json({ error: 'invalid token' }) 
    }

    const info = await getUserPermissions(payload.id)
    return res.json({ 
      id: payload.id, 
      username: payload.username, 
      roles: info.roles, 
      permissions: info.permissions 
    })
  } catch (err) {
    console.error('me route error', err)
    res.status(500).json({ error: 'failed' })
  }
})

router.post('/change-password', async (req, res) => {
  try {
    const auth = req.headers.authorization || ''
    const parts = auth.split(' ')
    if (parts.length !== 2 || parts[0] !== 'Bearer') return res.status(401).json({ error: 'missing token' })
    
    const token = parts[1]
    let payload
    try { 
      payload = jwt.verify(token, process.env.JWT_SECRET || 'dev_secret') 
    } catch(e) { 
      return res.status(401).json({ error: 'Session expired. Please log in again.' }) 
    }

    const { oldPassword, newPassword } = req.body
    if (!oldPassword || !newPassword) {
      return res.status(400).json({ error: 'Both old and new passwords are required' })
    }

    const userId = payload.id
    const [rows] = await db.pool.query('SELECT password_hash FROM users WHERE id = ?', [userId])
    if (!rows.length) return res.status(404).json({ error: 'User not found' })

    const isValid = await verifyPassword(rows[0].password_hash, oldPassword)
    if (!isValid) return res.status(401).json({ error: 'Incorrect current password' })

    const hashedNew = await bcrypt.hash(newPassword, 10)
    await db.pool.query('UPDATE users SET password_hash = ? WHERE id = ?', [hashedNew, userId])

    res.json({ message: 'Password updated successfully' })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to change password' })
  }
})

router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body || {}
    if (!email) return res.status(400).json({ error: 'email required' })
    // Placeholder logic for email reset
    return res.json({ message: 'If the email exists, a reset link was sent' })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'failed' })
  }
})

router.post('/forgot-email', async (req, res) => {
  try {
    const { username } = req.body || {}
    if (!username) return res.status(400).json({ error: 'username required' })
    const [rows] = await db.pool.query('SELECT email FROM users WHERE username = ? LIMIT 1', [username])
    if (!rows.length) return res.status(404).json({ error: 'user not found' })
    
    const email = rows[0].email || ''
    const masked = email.replace(/(.{2}).+(@.+)/, '$1***$2')
    return res.json({ message: 'Email found', email: masked })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'failed' })
  }
})

module.exports = router