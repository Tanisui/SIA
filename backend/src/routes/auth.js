const express = require('express')
const router = express.Router()
const db = require('../database')
const crypto = require('crypto')
const jwt = require('jsonwebtoken')

function verifyPassword(storedHash, password) {
  if (!storedHash || !storedHash.startsWith('pbkdf2_sha512$')) return false
  const parts = storedHash.split('$')
  if (parts.length !== 4) return false
  const iterations = Number(parts[1])
  const salt = parts[2]
  const derived = parts[3]
  const derivedCheck = crypto.pbkdf2Sync(password, salt, iterations, 64, 'sha512').toString('hex')
  return crypto.timingSafeEqual(Buffer.from(derivedCheck, 'hex'), Buffer.from(derived, 'hex'))
}

async function getUserPermissions(userId) {
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

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body || {}
    if (!username || !password) return res.status(400).json({ error: 'username and password required' })

    const [rows] = await db.pool.query('SELECT id, username, email, password_hash, full_name, is_active FROM users WHERE username = ? LIMIT 1', [username])
    if (!rows.length) return res.status(401).json({ error: 'invalid credentials' })
    const user = rows[0]

    try {
      console.log('login attempt for', username, '-> rows.length=', rows.length)
      console.log('db user row:', JSON.stringify(user))
      console.log('type of is_active:', typeof user.is_active, 'value:', user.is_active)
    } catch (e) { console.log('login debug log error', e) }

    const activeFlag = Number(user.is_active)
    if (activeFlag !== 1) {
      console.log('login denied for', username, 'because is_active!=1 (db value=', user.is_active, ')')
      return res.status(403).json({ error: 'Account inactive — contact the administrator to activate your account' })
    }

    if (!verifyPassword(user.password_hash, password)) return res.status(401).json({ error: 'invalid credentials' })

    const permInfo = await getUserPermissions(user.id)

    try {
      console.log('permissions for user', user.username, '=', JSON.stringify(permInfo))
    } catch (e) { }

    const payload = { id: user.id, username: user.username, roles: permInfo.roles }
    const token = jwt.sign(payload, process.env.JWT_SECRET || 'dev_secret', { expiresIn: '8h' })

    res.json({ token, user: { id: user.id, username: user.username, full_name: user.full_name, email: user.email, roles: permInfo.roles, permissions: permInfo.permissions } })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'login failed' })
  }
})

router.get('/me', async (req, res) => {
  try {
    const auth = req.headers.authorization || ''
    const parts = auth.split(' ')
    if (parts.length !== 2 || parts[0] !== 'Bearer') return res.status(401).json({ error: 'missing token' })
    const token = parts[1]
    let payload
    try { payload = jwt.verify(token, process.env.JWT_SECRET || 'dev_secret') } catch(e) { return res.status(401).json({ error: 'invalid token' }) }
    const info = await getUserPermissions(payload.id)
    return res.json({ id: payload.id, username: payload.username, roles: info.roles, permissions: info.permissions })
  } catch (err) {
    console.error('me route error', err)
    res.status(500).json({ error: 'failed' })
  }
})

router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body || {}
    if (!email) return res.status(400).json({ error: 'email required' })
    const [rows] = await db.pool.query('SELECT id, email FROM users WHERE email = ? LIMIT 1', [email])
    if (!rows.length) return res.status(200).json({ message: 'If the email exists, a reset link was sent' })
    const user = rows[0]
    console.log('Password reset requested for user id', user.id)
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
    const [rows] = await db.pool.query('SELECT id, email FROM users WHERE username = ? LIMIT 1', [username])
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
