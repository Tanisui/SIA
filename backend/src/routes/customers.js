const express = require('express')
const router = express.Router()
const db = require('../database')
const { verifyToken, authorize } = require('../middleware/authMiddleware')

// List customers
router.get('/', verifyToken, authorize('customers.view'), async (req, res) => {
  try {
    const [rows] = await db.pool.query('SELECT * FROM customers ORDER BY name ASC')
    res.json(rows)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'failed to fetch customers' })
  }
})

// Get single customer
router.get('/:id', verifyToken, authorize('customers.view'), async (req, res) => {
  try {
    const [rows] = await db.pool.query('SELECT * FROM customers WHERE id = ? LIMIT 1', [req.params.id])
    if (!rows.length) return res.status(404).json({ error: 'customer not found' })
    res.json(rows[0])
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'failed to fetch customer' })
  }
})

// Create customer
router.post('/', express.json(), verifyToken, authorize('customers.create'), async (req, res) => {
  try {
    const { name, phone, email, address, notes } = req.body
    if (!name) return res.status(400).json({ error: 'name is required' })
    const [result] = await db.pool.query(
      'INSERT INTO customers (name, phone, email, address, notes) VALUES (?, ?, ?, ?, ?)',
      [name, phone || null, email || null, address || null, notes || null]
    )
    res.json({ id: result.insertId })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'failed to create customer' })
  }
})

// Update customer
router.put('/:id', express.json(), verifyToken, authorize('customers.update'), async (req, res) => {
  try {
    const { name, phone, email, address, notes, loyalty_points } = req.body
    const updates = []
    const params = []
    if (name !== undefined) { updates.push('name = ?'); params.push(name) }
    if (phone !== undefined) { updates.push('phone = ?'); params.push(phone) }
    if (email !== undefined) { updates.push('email = ?'); params.push(email) }
    if (address !== undefined) { updates.push('address = ?'); params.push(address) }
    if (notes !== undefined) { updates.push('notes = ?'); params.push(notes) }
    if (loyalty_points !== undefined) { updates.push('loyalty_points = ?'); params.push(loyalty_points) }
    if (!updates.length) return res.status(400).json({ error: 'nothing to update' })
    params.push(req.params.id)
    await db.pool.query(`UPDATE customers SET ${updates.join(', ')} WHERE id = ?`, params)
    res.json({ success: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'failed to update customer' })
  }
})

// Delete customer
router.delete('/:id', verifyToken, authorize('customers.delete'), async (req, res) => {
  try {
    await db.pool.query('DELETE FROM customers WHERE id = ?', [req.params.id])
    res.json({ success: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'failed to delete customer' })
  }
})

module.exports = router
