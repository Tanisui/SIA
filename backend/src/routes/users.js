const express = require('express')
const router = express.Router()
const db = require('../database')
const crypto = require('crypto')
const { verifyToken, authorize } = require('../middleware/authMiddleware')

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex')
  const derived = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex')
  return `pbkdf2_sha512$100000$${salt}$${derived}`
}

router.get('/', verifyToken, authorize('users.view'), async (req, res) => {
  try {
    const [rows] = await db.pool.query('SELECT id, username, email, full_name, is_active, created_at, updated_at FROM users ORDER BY id DESC')
    const result = []
    for (const u of rows) {
      const [rrows] = await db.pool.query(`SELECT r.name FROM roles r JOIN user_roles ur ON ur.role_id = r.id WHERE ur.user_id = ?`, [u.id])
      result.push({ ...u, roles: rrows.map(r => r.name) })
    }
    res.json(result)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'failed to fetch users' })
  }
})

router.get('/:id', verifyToken, authorize('users.view'), async (req, res) => {
  try {
    const id = Number(req.params.id)
    const [rows] = await db.pool.query('SELECT id, username, email, full_name, is_active, created_at, updated_at FROM users WHERE id = ? LIMIT 1', [id])
    if (!rows.length) return res.status(404).json({ error: 'user not found' })
    const user = rows[0]
    const [rrows] = await db.pool.query(`SELECT r.id, r.name FROM roles r JOIN user_roles ur ON ur.role_id = r.id WHERE ur.user_id = ?`, [id])
    user.roles = rrows.map(r => r.name)
    res.json(user)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'failed to fetch user' })
  }
})

router.post('/', express.json(), verifyToken, authorize('users.create'), async (req, res) => {
  try {
    const { username, email, password, full_name, roles } = req.body || {}
    if (!username || !email || !password) return res.status(400).json({ error: 'username,email,password required' })
    const password_hash = hashPassword(password)
    // if no roles provided, lock account (is_active = 0) until roles assigned
    const isActive = (Array.isArray(roles) && roles.length) ? 1 : 0
    const [result] = await db.pool.query('INSERT INTO users (username, email, password_hash, full_name, is_active) VALUES (?, ?, ?, ?, ?)', [username, email, password_hash, full_name || null, isActive])
    const userId = result.insertId
    if (Array.isArray(roles) && roles.length) {
      for (const r of roles) {
        if (Number(r)) {
          await db.pool.query('INSERT IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)', [userId, Number(r)])
        } else {
          const [rows] = await db.pool.query('SELECT id FROM roles WHERE name = ? LIMIT 1', [r])
          if (rows.length) await db.pool.query('INSERT IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)', [userId, rows[0].id])
        }
      }
    }
    res.json({ id: userId })
  } catch (err) {
    console.error('users POST error', err)
    if (err && err.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: 'username or email already exists' })
    }
    res.status(500).json({ error: err.message || 'failed to create user' })
  }
})

router.put('/:id', express.json(), verifyToken, authorize('users.update'), async (req, res) => {
  try {
    const id = Number(req.params.id)
    const { username, email, password, full_name, is_active, roles } = req.body || {}
    const updates = []
    const params = []
    if (username) { updates.push('username = ?'); params.push(username) }
    if (email) { updates.push('email = ?'); params.push(email) }
    if (full_name !== undefined) { updates.push('full_name = ?'); params.push(full_name) }
    
    if (is_active !== undefined) {
      const activeVal = (String(is_active) === '1' || is_active === 1 || is_active === true) ? 1 : 0
      updates.push('is_active = ?'); params.push(activeVal)
    }
    if (password) { updates.push('password_hash = ?'); params.push(hashPassword(password)) }
    if (updates.length) {
      params.push(id)
      await db.pool.query(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params)
    }
    if (Array.isArray(roles)) {
      await db.pool.query('DELETE FROM user_roles WHERE user_id = ?', [id])
      for (const r of roles) {
        if (Number(r)) {
          await db.pool.query('INSERT IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)', [id, Number(r)])
        } else {
          const [rows] = await db.pool.query('SELECT id FROM roles WHERE name = ? LIMIT 1', [r])
          if (rows.length) await db.pool.query('INSERT IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)', [id, rows[0].id])
        }
      }
    }
    res.json({ ok: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'failed to update user' })
  }
})

router.delete('/:id', verifyToken, authorize('users.delete'), async (req, res) => {
  try {
    const id = Number(req.params.id)
    await db.pool.query('UPDATE users SET is_active = 0 WHERE id = ?', [id])
    res.json({ ok: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'failed to delete user' })
  }
})

module.exports = router
