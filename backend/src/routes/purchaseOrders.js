const express = require('express')
const router = express.Router()
const db = require('../database')
const { verifyToken, authorize } = require('../middleware/authMiddleware')

// List all purchase orders
router.get('/', verifyToken, authorize('purchase.view'), async (req, res) => {
  try {
    const { status } = req.query
    let sql = `
      SELECT po.*, s.name AS supplier_name
      FROM purchase_orders po
      LEFT JOIN suppliers s ON s.id = po.supplier_id
      WHERE 1=1
    `
    const params = []
    if (status) { sql += ' AND po.status = ?'; params.push(status) }
    sql += ' ORDER BY po.created_at DESC'
    const [rows] = await db.pool.query(sql, params)

    // Attach items
    for (const po of rows) {
      const [items] = await db.pool.query(`
        SELECT pi.*, p.name AS product_name, p.sku
        FROM purchase_items pi
        LEFT JOIN products p ON p.id = pi.product_id
        WHERE pi.purchase_order_id = ?
      `, [po.id])
      po.items = items
    }
    res.json(rows)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'failed to fetch purchase orders' })
  }
})

// Get single PO
router.get('/:id', verifyToken, authorize('purchase.view'), async (req, res) => {
  try {
    const [rows] = await db.pool.query(`
      SELECT po.*, s.name AS supplier_name
      FROM purchase_orders po
      LEFT JOIN suppliers s ON s.id = po.supplier_id
      WHERE po.id = ? LIMIT 1
    `, [req.params.id])
    if (!rows.length) return res.status(404).json({ error: 'purchase order not found' })
    const po = rows[0]
    const [items] = await db.pool.query(`
      SELECT pi.*, p.name AS product_name, p.sku
      FROM purchase_items pi
      LEFT JOIN products p ON p.id = pi.product_id
      WHERE pi.purchase_order_id = ?
    `, [po.id])
    po.items = items
    res.json(po)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'failed to fetch purchase order' })
  }
})

// Create PO
router.post('/', express.json(), verifyToken, authorize('purchase.create'), async (req, res) => {
  const conn = await db.pool.getConnection()
  try {
    await conn.beginTransaction()
    const { supplier_id, expected_date, items } = req.body
    if (!supplier_id) return res.status(400).json({ error: 'supplier_id required' })
    if (!items || !items.length) return res.status(400).json({ error: 'at least one item required' })

    // Generate PO number
    const [countRows] = await conn.query('SELECT COUNT(*) AS cnt FROM purchase_orders')
    const poNum = `PO-${String(countRows[0].cnt + 1).padStart(6, '0')}`

    let total = 0
    for (const item of items) {
      total += (item.quantity || 0) * (item.unit_cost || 0)
    }

    const [result] = await conn.query(
      'INSERT INTO purchase_orders (po_number, supplier_id, expected_date, total) VALUES (?, ?, ?, ?)',
      [poNum, supplier_id, expected_date || null, total]
    )
    const poId = result.insertId

    for (const item of items) {
      await conn.query(
        'INSERT INTO purchase_items (purchase_order_id, product_id, quantity, unit_cost) VALUES (?, ?, ?, ?)',
        [poId, item.product_id, item.quantity || 0, item.unit_cost || 0]
      )
    }

    await conn.commit()
    conn.release()
    res.json({ id: poId, po_number: poNum })
  } catch (err) {
    await conn.rollback()
    conn.release()
    console.error(err)
    res.status(500).json({ error: 'failed to create purchase order' })
  }
})

// Update PO (only OPEN orders)
router.put('/:id', express.json(), verifyToken, authorize('purchase.create'), async (req, res) => {
  const conn = await db.pool.getConnection()
  try {
    await conn.beginTransaction()
    const poId = req.params.id
    const [po] = await conn.query('SELECT * FROM purchase_orders WHERE id = ? FOR UPDATE', [poId])
    if (!po.length) { await conn.rollback(); conn.release(); return res.status(404).json({ error: 'purchase order not found' }) }
    if (po[0].status !== 'OPEN') { await conn.rollback(); conn.release(); return res.status(400).json({ error: 'can only update OPEN purchase orders' }) }

    const { supplier_id, expected_date, items, status } = req.body
    const updates = []
    const params = []
    if (supplier_id !== undefined) { updates.push('supplier_id = ?'); params.push(supplier_id) }
    if (expected_date !== undefined) { updates.push('expected_date = ?'); params.push(expected_date) }
    if (status !== undefined) { updates.push('status = ?'); params.push(status) }

    if (items && items.length) {
      await conn.query('DELETE FROM purchase_items WHERE purchase_order_id = ?', [poId])
      let total = 0
      for (const item of items) {
        total += (item.quantity || 0) * (item.unit_cost || 0)
        await conn.query(
          'INSERT INTO purchase_items (purchase_order_id, product_id, quantity, unit_cost) VALUES (?, ?, ?, ?)',
          [poId, item.product_id, item.quantity || 0, item.unit_cost || 0]
        )
      }
      updates.push('total = ?')
      params.push(total)
    }

    if (updates.length) {
      params.push(poId)
      await conn.query(`UPDATE purchase_orders SET ${updates.join(', ')} WHERE id = ?`, params)
    }

    await conn.commit()
    conn.release()
    res.json({ success: true })
  } catch (err) {
    await conn.rollback()
    conn.release()
    console.error(err)
    res.status(500).json({ error: 'failed to update purchase order' })
  }
})

// Cancel PO
router.post('/:id/cancel', express.json(), verifyToken, authorize('purchase.create'), async (req, res) => {
  try {
    const [po] = await db.pool.query('SELECT * FROM purchase_orders WHERE id = ?', [req.params.id])
    if (!po.length) return res.status(404).json({ error: 'purchase order not found' })
    if (po[0].status !== 'OPEN') return res.status(400).json({ error: 'can only cancel OPEN purchase orders' })
    await db.pool.query("UPDATE purchase_orders SET status = 'CANCELLED' WHERE id = ?", [req.params.id])
    res.json({ success: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'failed to cancel purchase order' })
  }
})

// Delete PO
router.delete('/:id', verifyToken, authorize('purchase.create'), async (req, res) => {
  try {
    await db.pool.query('DELETE FROM purchase_orders WHERE id = ?', [req.params.id])
    res.json({ success: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'failed to delete purchase order' })
  }
})

module.exports = router
