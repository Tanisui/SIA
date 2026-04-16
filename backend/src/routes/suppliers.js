const express = require('express')
const router = express.Router()
const db = require('../database')
const { verifyToken, authorize } = require('../middleware/authMiddleware')
const { logAuditEventSafe } = require('../utils/auditLog')

// List suppliers
router.get('/', verifyToken, authorize(['suppliers.view', 'inventory.receive']), async (req, res) => {
  try {
    const [rows] = await db.pool.query('SELECT * FROM suppliers ORDER BY name ASC')
    res.json(rows)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'failed to fetch suppliers' })
  }
})

// Get single supplier
router.get('/:id', verifyToken, authorize('suppliers.view'), async (req, res) => {
  try {
    const [rows] = await db.pool.query('SELECT * FROM suppliers WHERE id = ? LIMIT 1', [req.params.id])
    if (!rows.length) return res.status(404).json({ error: 'supplier not found' })
    res.json(rows[0])
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'failed to fetch supplier' })
  }
})

// Create supplier
router.post('/', express.json(), verifyToken, authorize('suppliers.create'), async (req, res) => {
  try {
    const { name, contact_person, phone, email, address } = req.body
    if (!name) return res.status(400).json({ error: 'name is required' })
    const [result] = await db.pool.query(
      'INSERT INTO suppliers (name, contact_person, phone, email, address) VALUES (?, ?, ?, ?, ?)',
      [name, contact_person || null, phone || null, email || null, address || null]
    )

    await logAuditEventSafe(db.pool, {
      userId: req.auth.id,
      action: 'SUPPLIER_CREATED',
      resourceType: 'Supplier',
      resourceId: result.insertId,
      details: {
        module: 'purchasing',
        severity: 'medium',
        target_label: name,
        summary: `Created supplier "${name}"`,
        after: { name, contact_person: contact_person || null, phone: phone || null, email: email || null, address: address || null }
      }
    })
    res.json({ id: result.insertId })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'failed to create supplier' })
  }
})

// Update supplier
router.put('/:id', express.json(), verifyToken, authorize('suppliers.update'), async (req, res) => {
  try {
    const { name, contact_person, phone, email, address } = req.body
    const [beforeRows] = await db.pool.query('SELECT * FROM suppliers WHERE id = ? LIMIT 1', [req.params.id])
    if (!beforeRows.length) return res.status(404).json({ error: 'supplier not found' })
    const updates = []
    const params = []
    if (name !== undefined) { updates.push('name = ?'); params.push(name) }
    if (contact_person !== undefined) { updates.push('contact_person = ?'); params.push(contact_person) }
    if (phone !== undefined) { updates.push('phone = ?'); params.push(phone) }
    if (email !== undefined) { updates.push('email = ?'); params.push(email) }
    if (address !== undefined) { updates.push('address = ?'); params.push(address) }
    if (!updates.length) return res.status(400).json({ error: 'nothing to update' })
    params.push(req.params.id)
    await db.pool.query(`UPDATE suppliers SET ${updates.join(', ')} WHERE id = ?`, params)

    const [afterRows] = await db.pool.query('SELECT * FROM suppliers WHERE id = ? LIMIT 1', [req.params.id])
    await logAuditEventSafe(db.pool, {
      userId: req.auth.id,
      action: 'SUPPLIER_UPDATED',
      resourceType: 'Supplier',
      resourceId: req.params.id,
      details: {
        module: 'purchasing',
        severity: 'medium',
        target_label: afterRows[0].name,
        summary: `Updated supplier "${afterRows[0].name}"`,
        before: beforeRows[0],
        after: afterRows[0]
      }
    })
    res.json({ success: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'failed to update supplier' })
  }
})

// Delete supplier
router.delete('/:id', verifyToken, authorize('suppliers.delete'), async (req, res) => {
  try {
    const [beforeRows] = await db.pool.query('SELECT * FROM suppliers WHERE id = ? LIMIT 1', [req.params.id])
    if (!beforeRows.length) return res.status(404).json({ error: 'supplier not found' })
    await db.pool.query('DELETE FROM suppliers WHERE id = ?', [req.params.id])

    await logAuditEventSafe(db.pool, {
      userId: req.auth.id,
      action: 'SUPPLIER_DELETED',
      resourceType: 'Supplier',
      resourceId: req.params.id,
      details: {
        module: 'purchasing',
        severity: 'high',
        target_label: beforeRows[0].name,
        summary: `Deleted supplier "${beforeRows[0].name}"`,
        before: beforeRows[0]
      }
    })
    res.json({ success: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'failed to delete supplier' })
  }
})

module.exports = router
