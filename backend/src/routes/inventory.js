const express = require('express')
const router = express.Router()
const db = require('../database')
const { verifyToken, authorize } = require('../middleware/authMiddleware')

// ─── List all inventory transactions (Allow products.view to see history) ───
router.get('/transactions', verifyToken, authorize(['inventory.view', 'products.view']), async (req, res) => {
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
    if (supplier_id) {
      await conn.rollback(); conn.release()
      return res.status(400).json({ error: 'Direct stock-in does not accept supplier details. Record supplier activity outside this inventory flow.' })
    }

    const [prod] = await conn.query('SELECT stock_quantity, cost AS old_cost FROM products WHERE id = ? FOR UPDATE', [product_id])
    if (!prod.length) { await conn.rollback(); conn.release(); return res.status(404).json({ error: 'product not found' }) }
    const newQty = prod[0].stock_quantity + Number(quantity)
    const updateCost = cost !== undefined ? ', cost = ?' : ''
    const costParams = cost !== undefined ? [cost] : []
    await conn.query(`UPDATE products SET stock_quantity = ?${updateCost} WHERE id = ?`, [newQty, ...costParams, product_id])

    await conn.query(
      `INSERT INTO inventory_transactions (product_id, transaction_type, quantity, reference, user_id, reason, balance_after, created_at)
       VALUES (?, 'IN', ?, ?, ?, ?, ?, ?)`,
      [product_id, quantity, reference || null, req.auth.id, 'Direct purchase (no supplier)', newQty, date || new Date()]
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

// ─── Stock Out: Adjustments ───
router.post('/stock-out/adjust', express.json(), verifyToken, authorize('inventory.adjust'), async (req, res) => {
  const conn = await db.pool.getConnection()
  try {
    await conn.beginTransaction()
    const { product_id, quantity, reason, reference, employee_id } = req.body
    if (!product_id || !quantity || quantity <= 0) return res.status(400).json({ error: 'product_id and positive quantity required' })

    const qtyToRemove = Number(quantity)
    if (!Number.isFinite(qtyToRemove) || qtyToRemove <= 0) {
      await conn.rollback(); conn.release()
      return res.status(400).json({ error: 'quantity must be a positive number' })
    }

    const [prod] = await conn.query('SELECT stock_quantity FROM products WHERE id = ? FOR UPDATE', [product_id])
    if (!prod.length) { await conn.rollback(); conn.release(); return res.status(404).json({ error: 'product not found' }) }
    const currentQty = Number(prod[0].stock_quantity) || 0
    if (currentQty <= 0) {
      await conn.rollback(); conn.release()
      return res.status(400).json({ error: 'No stock available for this product' })
    }
    if (qtyToRemove > currentQty) {
      await conn.rollback(); conn.release()
      return res.status(400).json({ error: `Insufficient stock. Available: ${currentQty}` })
    }

    const newQty = currentQty - qtyToRemove
    await conn.query('UPDATE products SET stock_quantity = ? WHERE id = ?', [newQty, product_id])

    const fullReason = employee_id
      ? `STOCK_OUT:SHRINKAGE | ${reason || 'Shrinkage/manual adjustment'} (Employee #${employee_id})`
      : `STOCK_OUT:SHRINKAGE | ${reason || 'Shrinkage/manual adjustment'}`
    await conn.query(
      `INSERT INTO inventory_transactions (product_id, transaction_type, quantity, reference, user_id, reason, balance_after)
       VALUES (?, 'OUT', ?, ?, ?, ?, ?)`,
      [product_id, -qtyToRemove, reference || null, req.auth.id, fullReason, newQty]
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
    const { product_id, quantity, reason, reference, employee_id } = req.body
    if (!product_id || !quantity || quantity <= 0) return res.status(400).json({ error: 'product_id and positive quantity required' })

    const qtyToRemove = Number(quantity)
    if (!Number.isFinite(qtyToRemove) || qtyToRemove <= 0) {
      await conn.rollback(); conn.release()
      return res.status(400).json({ error: 'quantity must be a positive number' })
    }

    const [prod] = await conn.query('SELECT stock_quantity FROM products WHERE id = ? FOR UPDATE', [product_id])
    if (!prod.length) { await conn.rollback(); conn.release(); return res.status(404).json({ error: 'product not found' }) }
    const currentQty = Number(prod[0].stock_quantity) || 0
    if (currentQty <= 0) {
      await conn.rollback(); conn.release()
      return res.status(400).json({ error: 'No stock available for this product' })
    }
    if (qtyToRemove > currentQty) {
      await conn.rollback(); conn.release()
      return res.status(400).json({ error: `Insufficient stock. Available: ${currentQty}` })
    }

    const newQty = currentQty - qtyToRemove
    await conn.query('UPDATE products SET stock_quantity = ? WHERE id = ?', [newQty, product_id])

    const fullReason = employee_id
      ? `STOCK_OUT:DAMAGE | ${reason || 'Damaged/defective stock'} (Employee #${employee_id})`
      : `STOCK_OUT:DAMAGE | ${reason || 'Damaged/defective stock'}`
    await conn.query(
      `INSERT INTO inventory_transactions (product_id, transaction_type, quantity, reference, user_id, reason, balance_after)
       VALUES (?, 'OUT', ?, ?, ?, ?, ?)`,
      [product_id, -qtyToRemove, reference || null, req.auth.id, fullReason, newQty]
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

// ─── Damaged inventory list from unified inventory_transactions table ───
router.get('/damaged', verifyToken, authorize(['inventory.view', 'products.view']), async (req, res) => {
  try {
    const [rows] = await db.pool.query(`
      SELECT it.id, it.created_at, it.product_id, ABS(it.quantity) AS quantity,
             it.reason, it.reference,
             p.name AS product_name, p.sku,
             u.username AS reported_by_name
      FROM inventory_transactions it
      LEFT JOIN products p ON p.id = it.product_id
      LEFT JOIN users u ON u.id = it.user_id
      WHERE it.transaction_type = 'OUT'
        AND (
          it.reason LIKE 'STOCK_OUT:DAMAGE%'
          OR it.reference LIKE 'STOCK_OUT|disposition=DAMAGE%'
        )
      ORDER BY it.created_at DESC
    `)
    res.json(rows)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'failed to fetch damaged inventory' })
  }
})

// ─── Low stock alerts (Allow products.view to access) ───
router.get('/alerts/low-stock', verifyToken, authorize('products.view'), async (req, res) => {
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

// ─── Shrinkage report (unified source) ───
router.get('/reports/shrinkage', verifyToken, authorize('inventory.view'), async (req, res) => {
  try {
    const [rows] = await db.pool.query(`
      SELECT it.product_id, p.name AS product_name, p.sku,
             SUM(ABS(it.quantity)) AS total_shrinkage,
             COUNT(*) AS incidents,
             COALESCE(
               GROUP_CONCAT(DISTINCT it.reason ORDER BY it.created_at DESC SEPARATOR ' | '),
               ''
             ) AS reasons
      FROM inventory_transactions it
      LEFT JOIN products p ON p.id = it.product_id
      WHERE it.transaction_type = 'OUT'
        AND it.quantity < 0
        AND (
          it.reason LIKE 'STOCK_OUT:SHRINKAGE%'
          OR it.reference LIKE 'STOCK_OUT|disposition=SHRINKAGE%'
        )
      GROUP BY it.product_id
      ORDER BY total_shrinkage DESC
    `)
    res.json(rows)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'failed to fetch shrinkage report' })
  }
})

// ─── Unified stock-out report (Shrinkage + Damage) ───
router.get('/reports/stock-out', verifyToken, authorize(['inventory.view', 'products.view']), async (req, res) => {
  try {
    const [rows] = await db.pool.query(`
      SELECT
        it.id,
        it.created_at,
        it.product_id,
        p.name AS product_name,
        p.sku,
        ABS(it.quantity) AS quantity,
        CASE
          WHEN it.reason LIKE 'STOCK_OUT:DAMAGE%' OR it.reference LIKE 'STOCK_OUT|disposition=DAMAGE%' THEN 'DAMAGE'
          WHEN it.reason LIKE 'STOCK_OUT:SHRINKAGE%' OR it.reference LIKE 'STOCK_OUT|disposition=SHRINKAGE%' THEN 'SHRINKAGE'
          ELSE 'OTHER'
        END AS stock_out_type,
        it.reference,
        it.reason,
        u.username AS user_name
      FROM inventory_transactions it
      LEFT JOIN products p ON p.id = it.product_id
      LEFT JOIN users u ON u.id = it.user_id
      WHERE it.transaction_type = 'OUT'
        AND (
          it.reason LIKE 'STOCK_OUT:DAMAGE%'
          OR it.reason LIKE 'STOCK_OUT:SHRINKAGE%'
          OR it.reference LIKE 'STOCK_OUT|disposition=DAMAGE%'
          OR it.reference LIKE 'STOCK_OUT|disposition=SHRINKAGE%'
        )
      ORDER BY it.created_at DESC
    `)
    res.json(rows)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'failed to fetch stock out report' })
  }
})

// ─── Inventory summary report (Allow products.view to access) ───
router.get('/reports/summary', verifyToken, authorize(['inventory.view', 'products.view']), async (req, res) => {
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
