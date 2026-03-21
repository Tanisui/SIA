const express = require('express')
const router = express.Router()
const db = require('../database')
const bcrypt = require('bcrypt') // Needed for secure password hashing
const { verifyToken, authorize } = require('../middleware/authMiddleware')
const { getDefaultNewUserPassword } = require('../config/security')

let hasUsersRoleIdColumnCache = null
let hasUsersEmployeeIdColumnCache = null

async function hasUsersRoleIdColumn(conn) {
  if (hasUsersRoleIdColumnCache !== null) return hasUsersRoleIdColumnCache
  const [rows] = await conn.query(
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

async function hasUsersEmployeeIdColumn(conn) {
  if (hasUsersEmployeeIdColumnCache !== null) return hasUsersEmployeeIdColumnCache
  const [rows] = await conn.query(
    `SELECT 1 AS found
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'users'
       AND COLUMN_NAME = 'employee_id'
     LIMIT 1`
  )
  hasUsersEmployeeIdColumnCache = rows.length > 0
  return hasUsersEmployeeIdColumnCache
}

// List all employees
router.get('/', verifyToken, authorize('employees.view'), async (req, res) => {
  try {
    const [rows] = await db.pool.query('SELECT * FROM employees ORDER BY id DESC')
    res.json(rows)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'failed to fetch employees' })
  }
})

// Get single employee
router.get('/:id', verifyToken, authorize('employees.view'), async (req, res) => {
  try {
    const [rows] = await db.pool.query('SELECT * FROM employees WHERE id = ? LIMIT 1', [req.params.id])
    if (!rows.length) return res.status(404).json({ error: 'employee not found' })
    res.json(rows[0])
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'failed to fetch employee' })
  }
})

// Create employee AND Auto-Create User Account
router.post('/', express.json(), verifyToken, authorize('employees.create'), async (req, res) => {
  let conn; // We use a specific connection to run a Database Transaction
  try {
    const { name, email, role, contact_type, contact, hire_date, pay_rate, employment_status, bank_details } = req.body
    
    if (!name || !email) return res.status(400).json({ error: 'Name and Email are required' })

    conn = await db.pool.getConnection()
    await conn.beginTransaction() // Start Transaction

    // 1. Validate if email already exists
    const [existing] = await conn.query('SELECT id FROM employees WHERE email = ?', [email])
    if (existing.length > 0) {
      await conn.rollback()
      return res.status(400).json({ error: 'Email is already in use by another employee' })
    }

    // 2. Insert into employees table
    const [empResult] = await conn.query(
      `INSERT INTO employees (name, email, role, contact_type, contact, hire_date, pay_rate, employment_status, bank_details)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [name, email, role || null, contact_type || null, contact || null, hire_date || null,
       pay_rate || 0, employment_status || 'ACTIVE',
       bank_details ? JSON.stringify(bank_details) : null]
    )

    const employeeId = empResult.insertId

    // 3. Find Role ID based on Role Name
    let roleId = null;
    if (role) {
      const [roleRows] = await conn.query('SELECT id FROM roles WHERE name = ? LIMIT 1', [role])
      if (roleRows.length > 0) roleId = roleRows[0].id;
    }

    // 4. Generate & hash configured/default fallback password
    const defaultPassword = getDefaultNewUserPassword()
    const passwordHash = await bcrypt.hash(defaultPassword, 10)

    // 5. Insert into users table (schema-compatible)
    const includeRoleId = await hasUsersRoleIdColumn(conn)
    const includeEmployeeId = await hasUsersEmployeeIdColumn(conn)

    if (includeRoleId && includeEmployeeId) {
      await conn.query(
        `INSERT INTO users (username, email, password_hash, full_name, is_active, employee_id, role_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [email, email, passwordHash, name, 1, employeeId, roleId]
      )
    } else if (includeRoleId) {
      await conn.query(
        `INSERT INTO users (username, email, password_hash, full_name, is_active, role_id)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [email, email, passwordHash, name, 1, roleId]
      )
    } else if (includeEmployeeId) {
      await conn.query(
        `INSERT INTO users (username, email, password_hash, full_name, is_active, employee_id)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [email, email, passwordHash, name, 1, employeeId]
      )
    } else {
      await conn.query(
        `INSERT INTO users (username, email, password_hash, full_name, is_active)
         VALUES (?, ?, ?, ?, ?)`,
        [email, email, passwordHash, name, 1]
      )
    }

    await conn.commit() // Save everything to the database
    res.json({ id: employeeId, message: 'Employee and Login Credentials generated successfully' })

  } catch (err) {
    if (conn) await conn.rollback() // If ANY error happens, undo everything
    console.error('Transaction Failed:', err)
    res.status(500).json({ error: 'failed to create employee and user account' })
  } finally {
    if (conn) conn.release()
  }
})

// Update employee AND Sync changes to User Account
router.put('/:id', express.json(), verifyToken, authorize('employees.update'), async (req, res) => {
  let conn;
  try {
    const id = req.params.id
    const { name, email, role, contact_type, contact, hire_date, pay_rate, employment_status, bank_details } = req.body
    
    conn = await db.pool.getConnection()
    await conn.beginTransaction()

    // 1. Update Employees Table
    const updates = []
    const params = []
    if (name !== undefined) { updates.push('name = ?'); params.push(name) }
    if (email !== undefined) { updates.push('email = ?'); params.push(email) }
    if (role !== undefined) { updates.push('role = ?'); params.push(role) }
    if (contact_type !== undefined) { updates.push('contact_type = ?'); params.push(contact_type) }
    if (contact !== undefined) { updates.push('contact = ?'); params.push(contact) }
    if (hire_date !== undefined) { updates.push('hire_date = ?'); params.push(hire_date) }
    if (pay_rate !== undefined) { updates.push('pay_rate = ?'); params.push(pay_rate) }
    if (employment_status !== undefined) { updates.push('employment_status = ?'); params.push(employment_status) }
    if (bank_details !== undefined) { updates.push('bank_details = ?'); params.push(JSON.stringify(bank_details)) }
    
    if (!updates.length) return res.status(400).json({ error: 'nothing to update' })
    
    params.push(id)
    await conn.query(`UPDATE employees SET ${updates.join(', ')} WHERE id = ?`, params)

    // 2. Sync to Users Table (If name, email, role, or status changed)
    const userUpdates = []
    const userParams = []
    if (name !== undefined) { userUpdates.push('full_name = ?'); userParams.push(name) }
    if (email !== undefined) { 
      userUpdates.push('email = ?'); userUpdates.push('username = ?')
      userParams.push(email, email) 
    }
    if (employment_status !== undefined) {
      userUpdates.push('is_active = ?')
      userParams.push(employment_status === 'ACTIVE' ? 1 : 0) // Deactivates user if terminated
    }
    if (role !== undefined) {
      const [roleRows] = await conn.query('SELECT id FROM roles WHERE name = ? LIMIT 1', [role])
      if (roleRows.length > 0 && await hasUsersRoleIdColumn(conn)) {
        userUpdates.push('role_id = ?'); userParams.push(roleRows[0].id)
      }
    }

    if (userUpdates.length > 0) {
      if (await hasUsersEmployeeIdColumn(conn)) {
        userParams.push(id) // Link via employee_id
        await conn.query(`UPDATE users SET ${userUpdates.join(', ')} WHERE employee_id = ?`, userParams)
      } else if (email !== undefined) {
        userParams.push(email)
        await conn.query(`UPDATE users SET ${userUpdates.join(', ')} WHERE email = ?`, userParams)
      }
    }

    await conn.commit()
    res.json({ success: true })
  } catch (err) {
    if (conn) await conn.rollback()
    console.error('Update Failed:', err)
    res.status(500).json({ error: 'failed to update employee' })
  } finally {
    if (conn) conn.release()
  }
})

// Delete employee (Also deletes linked user)
router.delete('/:id', verifyToken, authorize('employees.delete'), async (req, res) => {
  try {
    const conn = await db.pool.getConnection()
    const includeEmployeeId = await hasUsersEmployeeIdColumn(conn)
    conn.release()

    // Because of foreign keys, we must delete the user first
    if (includeEmployeeId) {
      await db.pool.query('DELETE FROM users WHERE employee_id = ?', [req.params.id])
    } else {
      const [empRows] = await db.pool.query('SELECT email FROM employees WHERE id = ? LIMIT 1', [req.params.id])
      if (empRows.length && empRows[0].email) {
        await db.pool.query('DELETE FROM users WHERE email = ?', [empRows[0].email])
      }
    }
    await db.pool.query('DELETE FROM employees WHERE id = ?', [req.params.id])
    res.json({ success: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'failed to delete employee' })
  }
})

module.exports = router