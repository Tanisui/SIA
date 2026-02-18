const express = require('express')
const router = express.Router()
const db = require('../database')
const { verifyToken, authorize } = require('../middleware/authMiddleware')

// ─── List all inventory transactions ───
router.get('/transactions', verifyToken, authorize('inventory.view'), async (req, res) => {
  try {
    const { type, product_id, from, to } = req.query
    let sql = `
      SELECT it.*, p.name AS product_name, p.sku, u.username AS user_name
      FROM inventory_transactions it
      LEFT JOIN products p ON p.id = it.product_id
      LEFT JOIN users u ON u.id = it.user_id
      WHERE 1=1
    `
    const params = []
    if (type) { sql += ' AND it.transaction_type = ?'; params.push(type) }
    if (product_id) { sql += ' AND it.product_id = ?'; params.push(product_id) }
    if (from) { sql += ' AND it.created_at >= ?'; params.push(from) }
    if (to) { sql += ' AND it.created_at <= ?'; params.push(to) }
    sql += ' ORDER BY it.created_at DESC'
    const [rows] = await db.pool.query(sql, params)
    res.json(rows)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'failed to fetch transactions' })
  }
})

// ─── Stock In: Direct Purchase ───
router.post('/stock-in', express.json(), verifyToken, authorize('inventory.receive'), async (req, res) => {
  const conn = await db.pool.getConnection()
  try {
    await conn.beginTransaction()
    const { product_id, quantity, cost, reference, supplier_id, date } = req.body
    if (!product_id || !quantity || quantity <= 0) return res.status(400).json({ error: 'product_id and positive quantity required' })

    // Update product stock and cost
    const [prod] = await conn.query('SELECT stock_quantity, cost AS old_cost FROM products WHERE id = ? FOR UPDATE', [product_id])
    if (!prod.length) { await conn.rollback(); conn.release(); return res.status(404).json({ error: 'product not found' }) }
    const newQty = prod[0].stock_quantity + Number(quantity)
    const updateCost = cost !== undefined ? ', cost = ?' : ''
    const costParams = cost !== undefined ? [cost] : []
    await conn.query(`UPDATE products SET stock_quantity = ?${updateCost} WHERE id = ?`, [newQty, ...costParams, product_id])

    // Record transaction
    await conn.query(
      `INSERT INTO inventory_transactions (product_id, transaction_type, quantity, reference, user_id, reason, balance_after, created_at)
       VALUES (?, 'IN', ?, ?, ?, ?, ?, ?)`,
      [product_id, quantity, reference || null, req.auth.id, `Direct purchase${supplier_id ? ' from supplier #' + supplier_id : ''}`, newQty, date || new Date()]
    )
    await conn.commit()
    conn.release()
    res.json({ success: true, new_quantity: newQty })
  } catch (err) {
    await conn.rollback()
    conn.release()
    console.error(err)
    res.status(500).json({ error: 'stock-in failed' })
  }
})

// ─── Stock In: Receive from Purchase Order ───
router.post('/stock-in/receive-po', express.json(), verifyToken, authorize('inventory.receive'), async (req, res) => {
  const conn = await db.pool.getConnection()
  try {
    await conn.beginTransaction()
    const { purchase_order_id, reference } = req.body
    if (!purchase_order_id) return res.status(400).json({ error: 'purchase_order_id required' })

    const [po] = await conn.query('SELECT * FROM purchase_orders WHERE id = ? FOR UPDATE', [purchase_order_id])
    if (!po.length) { await conn.rollback(); conn.release(); return res.status(404).json({ error: 'purchase order not found' }) }
    if (po[0].status === 'RECEIVED') { await conn.rollback(); conn.release(); return res.status(400).json({ error: 'purchase order already received' }) }
    if (po[0].status === 'CANCELLED') { await conn.rollback(); conn.release(); return res.status(400).json({ error: 'purchase order is cancelled' }) }

    // Get items
    const [items] = await conn.query('SELECT * FROM purchase_items WHERE purchase_order_id = ?', [purchase_order_id])
    for (const item of items) {
      const [prod] = await conn.query('SELECT stock_quantity FROM products WHERE id = ? FOR UPDATE', [item.product_id])
      if (!prod.length) continue
      const newQty = prod[0].stock_quantity + item.quantity
      await conn.query('UPDATE products SET stock_quantity = ?, cost = ? WHERE id = ?', [newQty, item.unit_cost, item.product_id])
      await conn.query(
        `INSERT INTO inventory_transactions (product_id, transaction_type, quantity, reference, user_id, reason, balance_after)
         VALUES (?, 'IN', ?, ?, ?, ?, ?)`,
        [item.product_id, item.quantity, reference || `PO-${po[0].po_number}`, req.auth.id, `Received from PO #${po[0].po_number}`, newQty]
      )
    }

    await conn.query("UPDATE purchase_orders SET status = 'RECEIVED' WHERE id = ?", [purchase_order_id])
    await conn.commit()
    conn.release()
    res.json({ success: true, items_received: items.length })
  } catch (err) {
    await conn.rollback()
    conn.release()
    console.error(err)
    res.status(500).json({ error: 'receive PO failed' })
  }
})

// ─── Stock Out: Net Adjustments (shrinkage, lost items, manual corrections) ───
router.post('/stock-out/adjust', express.json(), verifyToken, authorize('inventory.adjust'), async (req, res) => {
  const conn = await db.pool.getConnection()
  try {
    await conn.beginTransaction()
    const { product_id, quantity, reason } = req.body
    if (!product_id || !quantity || quantity <= 0) return res.status(400).json({ error: 'product_id and positive quantity required' })

    const [prod] = await conn.query('SELECT stock_quantity FROM products WHERE id = ? FOR UPDATE', [product_id])
    if (!prod.length) { await conn.rollback(); conn.release(); return res.status(404).json({ error: 'product not found' }) }
    const newQty = Math.max(0, prod[0].stock_quantity - Number(quantity))
    await conn.query('UPDATE products SET stock_quantity = ? WHERE id = ?', [newQty, product_id])

    await conn.query(
      `INSERT INTO inventory_transactions (product_id, transaction_type, quantity, user_id, reason, balance_after)
       VALUES (?, 'ADJUST', ?, ?, ?, ?)`,
      [product_id, -quantity, req.auth.id, reason || 'Net adjustment', newQty]
    )
    await conn.commit()
    conn.release()
    res.json({ success: true, new_quantity: newQty })
  } catch (err) {
    await conn.rollback()
    conn.release()
    console.error(err)
    res.status(500).json({ error: 'adjustment failed' })
  }
})

// ─── Stock Out: Damage ───
router.post('/stock-out/damage', express.json(), verifyToken, authorize('inventory.adjust'), async (req, res) => {
  const conn = await db.pool.getConnection()
  try {
    await conn.beginTransaction()
    const { product_id, quantity, reason } = req.body
    if (!product_id || !quantity || quantity <= 0) return res.status(400).json({ error: 'product_id and positive quantity required' })

    const [prod] = await conn.query('SELECT stock_quantity FROM products WHERE id = ? FOR UPDATE', [product_id])
    if (!prod.length) { await conn.rollback(); conn.release(); return res.status(404).json({ error: 'product not found' }) }
    const newQty = Math.max(0, prod[0].stock_quantity - Number(quantity))
    await conn.query('UPDATE products SET stock_quantity = ? WHERE id = ?', [newQty, product_id])

    // Record in damaged_inventory
    await conn.query(
      'INSERT INTO damaged_inventory (product_id, quantity, reason, reported_by) VALUES (?, ?, ?, ?)',
      [product_id, quantity, reason || 'Damaged/defective', req.auth.id]
    )

    // Record transaction
    await conn.query(
      `INSERT INTO inventory_transactions (product_id, transaction_type, quantity, user_id, reason, balance_after)
       VALUES (?, 'OUT', ?, ?, ?, ?)`,
      [product_id, -quantity, req.auth.id, `Damaged: ${reason || 'defective stock'}`, newQty]
    )
    await conn.commit()
    conn.release()
    res.json({ success: true, new_quantity: newQty })
  } catch (err) {
    await conn.rollback()
    conn.release()
    console.error(err)
    res.status(500).json({ error: 'damage record failed' })
  }
})

// ─── Returns: Customer Return or Supplier Return ───
router.post('/returns', express.json(), verifyToken, authorize('inventory.adjust'), async (req, res) => {
  const conn = await db.pool.getConnection()
  try {
    await conn.beginTransaction()
    const { product_id, quantity, return_type, reason, sale_id } = req.body
    // return_type: 'customer' | 'supplier'
    if (!product_id || !quantity || quantity <= 0) return res.status(400).json({ error: 'product_id and positive quantity required' })

    if (return_type === 'customer') {
      // Customer returns item → add back to inventory
      const [prod] = await conn.query('SELECT stock_quantity FROM products WHERE id = ? FOR UPDATE', [product_id])
      if (!prod.length) { await conn.rollback(); conn.release(); return res.status(404).json({ error: 'product not found' }) }
      const newQty = prod[0].stock_quantity + Number(quantity)
      await conn.query('UPDATE products SET stock_quantity = ? WHERE id = ?', [newQty, product_id])

      await conn.query(
        `INSERT INTO inventory_transactions (product_id, transaction_type, quantity, user_id, reason, balance_after, reference)
         VALUES (?, 'RETURN', ?, ?, ?, ?, ?)`,
        [product_id, quantity, req.auth.id, `Customer return: ${reason || ''}`, newQty, sale_id ? `Sale #${sale_id}` : null]
      )
      await conn.commit()
      conn.release()
      return res.json({ success: true, new_quantity: newQty })
    } else if (return_type === 'supplier') {
      // Return to supplier → remove from inventory
      const [prod] = await conn.query('SELECT stock_quantity FROM products WHERE id = ? FOR UPDATE', [product_id])
      if (!prod.length) { await conn.rollback(); conn.release(); return res.status(404).json({ error: 'product not found' }) }
      const newQty = Math.max(0, prod[0].stock_quantity - Number(quantity))
      await conn.query('UPDATE products SET stock_quantity = ? WHERE id = ?', [newQty, product_id])

      await conn.query(
        `INSERT INTO inventory_transactions (product_id, transaction_type, quantity, user_id, reason, balance_after)
         VALUES (?, 'RETURN', ?, ?, ?, ?)`,
        [product_id, -quantity, req.auth.id, `Supplier return: ${reason || ''}`, newQty]
      )
      await conn.commit()
      conn.release()
      return res.json({ success: true, new_quantity: newQty })
    }
    await conn.rollback()
    conn.release()
    res.status(400).json({ error: 'return_type must be customer or supplier' })
  } catch (err) {
    await conn.rollback()
    conn.release()
    console.error(err)
    res.status(500).json({ error: 'return failed' })
  }
})

// ─── Damaged inventory list ───
router.get('/damaged', verifyToken, authorize('inventory.view'), async (req, res) => {
  try {
    const [rows] = await db.pool.query(`
      SELECT d.*, p.name AS product_name, p.sku, u.username AS reported_by_name
      FROM damaged_inventory d
      LEFT JOIN products p ON p.id = d.product_id
      LEFT JOIN users u ON u.id = d.reported_by
      ORDER BY d.created_at DESC
    `)
    res.json(rows)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'failed to fetch damaged inventory' })
  }
})

// ─── Low stock alerts ───
router.get('/alerts/low-stock', verifyToken, authorize('inventory.view'), async (req, res) => {
  try {
    const [rows] = await db.pool.query(`
      SELECT p.id, p.sku, p.name, p.stock_quantity, p.low_stock_threshold, c.name AS category
      FROM products p
      LEFT JOIN categories c ON c.id = p.category_id
      WHERE p.stock_quantity <= p.low_stock_threshold AND p.is_active = 1
      ORDER BY p.stock_quantity ASC
    `)
    res.json(rows)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'failed to fetch low stock alerts' })
  }
})

// ─── Shrinkage report ───
router.get('/reports/shrinkage', verifyToken, authorize('inventory.view'), async (req, res) => {
  try {
    const [rows] = await db.pool.query(`
      SELECT it.product_id, p.name AS product_name, p.sku,
             SUM(ABS(it.quantity)) AS total_shrinkage, COUNT(*) AS incidents
      FROM inventory_transactions it
      LEFT JOIN products p ON p.id = it.product_id
      WHERE it.transaction_type = 'ADJUST' AND it.quantity < 0
      GROUP BY it.product_id
      ORDER BY total_shrinkage DESC
    `)
    res.json(rows)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'failed to fetch shrinkage report' })
  }
})

// ─── Inventory summary report ───
router.get('/reports/summary', verifyToken, authorize('inventory.view'), async (req, res) => {
  try {
    const [products] = await db.pool.query(`
      SELECT p.id, p.sku, p.name, p.stock_quantity, p.cost, p.price, p.low_stock_threshold,
             c.name AS category,
             (p.stock_quantity * p.cost) AS stock_value
      FROM products p
      LEFT JOIN categories c ON c.id = p.category_id
      WHERE p.is_active = 1
      ORDER BY p.name ASC
    `)
    const totalItems = products.reduce((s, p) => s + p.stock_quantity, 0)
    const totalValue = products.reduce((s, p) => s + Number(p.stock_value || 0), 0)
    const lowStock = products.filter(p => p.stock_quantity <= p.low_stock_threshold)
    res.json({ products, totalItems, totalValue, lowStockCount: lowStock.length })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'failed to fetch inventory summary' })
  }
})

module.exports = router
