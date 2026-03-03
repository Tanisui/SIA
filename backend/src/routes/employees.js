const express = require('express')
const router = express.Router()
const db = require('../database')
const { verifyToken, authorize } = require('../middleware/authMiddleware')

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

// Create employee
router.post('/', express.json(), verifyToken, authorize('employees.create'), async (req, res) => {
  try {
    const { name, role, contact, hire_date, pay_rate, employment_status, bank_details } = req.body
    if (!name) return res.status(400).json({ error: 'name is required' })
    const [result] = await db.pool.query(
      `INSERT INTO employees (name, role, contact, hire_date, pay_rate, employment_status, bank_details)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [name, role || null, contact || null, hire_date || null,
       pay_rate || 0, employment_status || 'ACTIVE',
       bank_details ? JSON.stringify(bank_details) : null]
    )
    res.json({ id: result.insertId })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'failed to create employee' })
  }
})

// Update employee
router.put('/:id', express.json(), verifyToken, authorize('employees.update'), async (req, res) => {
  try {
    const id = req.params.id
    const { name, role, contact, hire_date, pay_rate, employment_status, bank_details } = req.body
    const updates = []
    const params = []
    if (name !== undefined) { updates.push('name = ?'); params.push(name) }
    if (role !== undefined) { updates.push('role = ?'); params.push(role) }
    if (contact !== undefined) { updates.push('contact = ?'); params.push(contact) }
    if (hire_date !== undefined) { updates.push('hire_date = ?'); params.push(hire_date) }
    if (pay_rate !== undefined) { updates.push('pay_rate = ?'); params.push(pay_rate) }
    if (employment_status !== undefined) { updates.push('employment_status = ?'); params.push(employment_status) }
    if (bank_details !== undefined) { updates.push('bank_details = ?'); params.push(JSON.stringify(bank_details)) }
    if (!updates.length) return res.status(400).json({ error: 'nothing to update' })
    params.push(id)
    await db.pool.query(`UPDATE employees SET ${updates.join(', ')} WHERE id = ?`, params)
    res.json({ success: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'failed to update employee' })
  }
})

// Delete employee
router.delete('/:id', verifyToken, authorize('employees.delete'), async (req, res) => {
  try {
    await db.pool.query('DELETE FROM employees WHERE id = ?', [req.params.id])
    res.json({ success: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'failed to delete employee' })
  }
})

module.exports = router
