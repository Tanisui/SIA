const express = require('express')
const router = express.Router()
const db = require('../database')
const crypto = require('crypto')
const bcrypt = require('bcrypt')
const { verifyToken, authorize } = require('../middleware/authMiddleware')

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex')
  const derived = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex')
  return `pbkdf2_sha512$100000$${salt}$${derived}`
}

router.get('/', verifyToken, authorize('users.view'), async (req, res) => {
  try {
    const [rows] = await db.pool.query('SELECT id, username, email, full_name, is_active, created_at, updated_at, role_id FROM users ORDER BY id DESC')
    const result = []
    for (const u of rows) {
      const [rrows] = await db.pool.query(
        `SELECT name FROM roles WHERE id IN (SELECT role_id FROM user_roles WHERE user_id = ?) OR id = ?`, 
        [u.id, u.role_id]
      )
      // Get employee data if it exists
      const [empRows] = await db.pool.query(
        'SELECT id, name, role, contact_type, contact, hire_date, pay_rate, employment_status, bank_details FROM employees WHERE email = ? OR id IN (SELECT employee_id FROM users WHERE id = ?)',
        [u.email, u.id]
      )
      result.push({ 
        ...u, 
        roles: rrows.map(r => r.name),
        employee: empRows.length > 0 ? empRows[0] : null
      })
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
    const [rows] = await db.pool.query('SELECT id, username, email, full_name, is_active, created_at, updated_at, role_id FROM users WHERE id = ? LIMIT 1', [id])
    if (!rows.length) return res.status(404).json({ error: 'user not found' })
    const user = rows[0]
    const [rrows] = await db.pool.query(
      `SELECT id, name FROM roles WHERE id IN (SELECT role_id FROM user_roles WHERE user_id = ?) OR id = ?`, 
      [id, user.role_id]
    )
    // Get employee data if it exists
    const [empRows] = await db.pool.query(
      'SELECT id, name, role, contact_type, contact, hire_date, pay_rate, employment_status, bank_details FROM employees WHERE email = ? LIMIT 1',
      [user.email]
    )
    user.roles = rrows.map(r => r.name)
    user.employee = empRows.length > 0 ? empRows[0] : null
    res.json(user)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'failed to fetch user' })
  }
})

router.post('/', express.json(), verifyToken, authorize('users.create'), async (req, res) => {
  let conn
  try {
    const { username, email, full_name, roles, contact_type, contact, hire_date, pay_rate, bank_details } = req.body || {}
    if (!username || !email) return res.status(400).json({ error: 'username and email required' })
    
    // Use default password for all new users
    const defaultPassword = 'Nstyle2026!'
    const password_hash = await bcrypt.hash(defaultPassword, 10)
    const isActive = (Array.isArray(roles) && roles.length) ? 1 : 0
    
    conn = await db.pool.getConnection()
    await conn.beginTransaction()

    // Create user
    const [result] = await conn.query('INSERT INTO users (username, email, password_hash, full_name, is_active) VALUES (?, ?, ?, ?, ?)', 
      [username, email, password_hash, full_name || null, isActive])
    const userId = result.insertId

    // Assign roles if provided
    if (Array.isArray(roles) && roles.length) {
      for (const r of roles) {
        if (Number(r)) {
          await conn.query('INSERT IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)', [userId, Number(r)])
        } else {
          const [rows] = await conn.query('SELECT id FROM roles WHERE name = ? LIMIT 1', [r])
          if (rows.length) await conn.query('INSERT IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)', [userId, rows[0].id])
        }
      }
    }

    // Create employee record if any employee field is provided
    if (contact_type || contact || hire_date || pay_rate) {
      const [empResult] = await conn.query(
        `INSERT INTO employees (name, email, role, contact_type, contact, hire_date, pay_rate, employment_status, bank_details)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [full_name || username, email, roles && roles.length ? roles[0] : null, contact_type || null, contact || null, hire_date || null,
         pay_rate || 0, 'ACTIVE', bank_details ? JSON.stringify(bank_details) : null]
      )
      // Link employee to user
      await conn.query('UPDATE users SET employee_id = ? WHERE id = ?', [empResult.insertId, userId])
    }

    await conn.commit()
    res.json({ id: userId })
  } catch (err) {
    if (conn) await conn.rollback()
    console.error('users POST error', err)
    if (err && err.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: 'username or email already exists' })
    }
    res.status(500).json({ error: err.message || 'failed to create user' })
  } finally {
    if (conn) conn.release()
  }
})

router.put('/:id', express.json(), verifyToken, authorize('users.update'), async (req, res) => {
  let conn
  try {
    const id = Number(req.params.id)
    const { username, email, password, full_name, is_active, roles, contact_type, contact, hire_date, pay_rate, bank_details } = req.body || {}
    
    conn = await db.pool.getConnection()
    await conn.beginTransaction()

    // Update user
    const updates = []
    const params = []
    if (username) { updates.push('username = ?'); params.push(username) }
    if (email) { updates.push('email = ?'); params.push(email) }
    if (full_name !== undefined) { updates.push('full_name = ?'); params.push(full_name) }
    
    if (is_active !== undefined) {
      const activeVal = (String(is_active) === '1' || is_active === 1 || is_active === true) ? 1 : 0
      updates.push('is_active = ?'); params.push(activeVal)
    }
    
    if (password) { 
      updates.push('password_hash = ?'); 
      params.push(await bcrypt.hash(password, 10)) 
    }
    
    if (updates.length) {
      params.push(id)
      await conn.query(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params)
    }

    // Update roles
    if (Array.isArray(roles)) {
      await conn.query('DELETE FROM user_roles WHERE user_id = ?', [id])
      for (const r of roles) {
        if (Number(r)) {
          await conn.query('INSERT IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)', [id, Number(r)])
        } else {
          const [rows] = await conn.query('SELECT id FROM roles WHERE name = ? LIMIT 1', [r])
          if (rows.length) await conn.query('INSERT IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)', [id, rows[0].id])
        }
      }
    }

    // Update or create employee record
    const [empRows] = await conn.query('SELECT id FROM employees WHERE email = ? OR id IN (SELECT employee_id FROM users WHERE id = ?)', [email, id])
    
    if (contact_type || contact || hire_date || pay_rate) {
      if (empRows.length > 0) {
        // Update existing employee
        const empUpdates = []
        const empParams = []
        if (full_name !== undefined) { empUpdates.push('name = ?'); empParams.push(full_name) }
        if (email) { empUpdates.push('email = ?'); empParams.push(email) }
        if (contact_type !== undefined) { empUpdates.push('contact_type = ?'); empParams.push(contact_type) }
        if (contact !== undefined) { empUpdates.push('contact = ?'); empParams.push(contact) }
        if (hire_date !== undefined) { empUpdates.push('hire_date = ?'); empParams.push(hire_date) }
        if (pay_rate !== undefined) { empUpdates.push('pay_rate = ?'); empParams.push(pay_rate) }
        if (bank_details !== undefined) { empUpdates.push('bank_details = ?'); empParams.push(JSON.stringify(bank_details)) }
        
        if (empUpdates.length) {
          empParams.push(empRows[0].id)
          await conn.query(`UPDATE employees SET ${empUpdates.join(', ')} WHERE id = ?`, empParams)
        }
      } else {
        // Create new employee if doesn't exist
        const [insertResult] = await conn.query(
          `INSERT INTO employees (name, email, role, contact_type, contact, hire_date, pay_rate, employment_status, bank_details)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [full_name || username, email, roles && roles.length ? roles[0] : null, contact_type || null, contact || null, hire_date || null,
           pay_rate || 0, 'ACTIVE', bank_details ? JSON.stringify(bank_details) : null]
        )
        await conn.query('UPDATE users SET employee_id = ? WHERE id = ?', [insertResult.insertId, id])
      }
    }

    await conn.commit()
    res.json({ ok: true })
  } catch (err) {
    if (conn) await conn.rollback()
    console.error(err)
    res.status(500).json({ error: 'failed to update user' })
  } finally {
    if (conn) conn.release()
  }
})

router.delete('/:id', verifyToken, authorize('users.delete'), async (req, res) => {
  let conn
  try {
    const id = Number(req.params.id)
    conn = await db.pool.getConnection()
    await conn.beginTransaction()

    // Get employee_id if linked
    const [userRows] = await conn.query('SELECT employee_id, email FROM users WHERE id = ?', [id])
    if (userRows.length > 0 && userRows[0].employee_id) {
      // Delete employee and all related records
      await conn.query('DELETE FROM attendance WHERE employee_id = ?', [userRows[0].employee_id])
      await conn.query('DELETE FROM payrolls WHERE employee_id = ?', [userRows[0].employee_id])
      await conn.query('DELETE FROM employees WHERE id = ?', [userRows[0].employee_id])
    }

    // Delete user
    await conn.query('DELETE FROM users WHERE id = ?', [id])
    
    await conn.commit()
    res.json({ ok: true })
  } catch (err) {
    if (conn) await conn.rollback()
    console.error(err)
    res.status(500).json({ error: 'failed to delete user' })
  } finally {
    if (conn) conn.release()
  }
})

module.exports = router