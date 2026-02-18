const express = require('express')
const router = express.Router()
const db = require('../database')
const { verifyToken, authorize } = require('../middleware/authMiddleware')

// ─── Sales report ─── (MUST be before /:id)
router.get('/reports/summary', verifyToken, authorize('sales.view'), async (req, res) => {
  try {
    const { from, to } = req.query
    let dateFilter = ''
    const params = []
    if (from) { dateFilter += ' AND s.date >= ?'; params.push(from) }
    if (to) { dateFilter += ' AND s.date <= ?'; params.push(to) }

    const [totals] = await db.pool.query(`
      SELECT
        COUNT(*) AS total_transactions,
        COALESCE(SUM(s.total), 0) AS total_revenue,
        COALESCE(SUM(s.discount), 0) AS total_discounts,
        COALESCE(SUM(s.tax), 0) AS total_tax
      FROM sales s
      WHERE s.status = 'COMPLETED'${dateFilter}
    `, params)

    const [byPayment] = await db.pool.query(`
      SELECT s.payment_method, COUNT(*) AS count, COALESCE(SUM(s.total), 0) AS total
      FROM sales s
      WHERE s.status = 'COMPLETED'${dateFilter}
      GROUP BY s.payment_method
    `, params)

    const [topProducts] = await db.pool.query(`
      SELECT p.name, p.sku, SUM(si.qty) AS total_qty, SUM(si.line_total) AS total_sales
      FROM sale_items si
      JOIN sales s ON s.id = si.sale_id
      JOIN products p ON p.id = si.product_id
      WHERE s.status = 'COMPLETED'${dateFilter}
      GROUP BY si.product_id
      ORDER BY total_sales DESC
      LIMIT 10
    `, params)

    res.json({
      ...totals[0],
      by_payment_method: byPayment,
      top_products: topProducts
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'failed to generate sales report' })
  }
})

// ─── List all sales ───
router.get('/', verifyToken, authorize('sales.view'), async (req, res) => {
  try {
    const { status, from, to, payment_method } = req.query
    let sql = `
      SELECT s.*, u.username AS clerk_name, c.name AS customer_name
      FROM sales s
      LEFT JOIN users u ON u.id = s.clerk_id
      LEFT JOIN customers c ON c.id = s.customer_id
      WHERE 1=1
    `
    const params = []
    if (status) { sql += ' AND s.status = ?'; params.push(status) }
    if (payment_method) { sql += ' AND s.payment_method = ?'; params.push(payment_method) }
    if (from) { sql += ' AND s.date >= ?'; params.push(from) }
    if (to) { sql += ' AND s.date <= ?'; params.push(to) }
    sql += ' ORDER BY s.date DESC'
    const [rows] = await db.pool.query(sql, params)

    // Attach items
    for (const sale of rows) {
      const [items] = await db.pool.query(`
        SELECT si.*, p.name AS product_name, p.sku
        FROM sale_items si
        LEFT JOIN products p ON p.id = si.product_id
        WHERE si.sale_id = ?
      `, [sale.id])
      sale.items = items
    }
    res.json(rows)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'failed to fetch sales' })
  }
})

// ─── Get single sale / receipt ───
router.get('/:id', verifyToken, authorize('sales.view'), async (req, res) => {
  try {
    const [rows] = await db.pool.query(`
      SELECT s.*, u.username AS clerk_name, c.name AS customer_name
      FROM sales s
      LEFT JOIN users u ON u.id = s.clerk_id
      LEFT JOIN customers c ON c.id = s.customer_id
      WHERE s.id = ? LIMIT 1
    `, [req.params.id])
    if (!rows.length) return res.status(404).json({ error: 'sale not found' })
    const sale = rows[0]
    const [items] = await db.pool.query(`
      SELECT si.*, p.name AS product_name, p.sku
      FROM sale_items si
      LEFT JOIN products p ON p.id = si.product_id
      WHERE si.sale_id = ?
    `, [sale.id])
    sale.items = items
    res.json(sale)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'failed to fetch sale' })
  }
})

// ─── Create / finalize a sale ───
router.post('/', express.json(), verifyToken, authorize('sales.create'), async (req, res) => {
  const conn = await db.pool.getConnection()
  try {
    await conn.beginTransaction()
    const { customer_id, items, payment_method, discount, tax } = req.body
    if (!items || !items.length) return res.status(400).json({ error: 'at least one item required' })
    if (!payment_method) return res.status(400).json({ error: 'payment_method required (cash, card, e-wallet)' })

    // Generate sale number and receipt
    const [countRows] = await conn.query('SELECT COUNT(*) AS cnt FROM sales')
    const saleNum = `SAL-${String(countRows[0].cnt + 1).padStart(6, '0')}`
    const receiptNo = `RCT-${String(countRows[0].cnt + 1).padStart(6, '0')}`

    let subtotal = 0
    const processedItems = []

    for (const item of items) {
      if (!item.product_id || !item.quantity || item.quantity <= 0) continue
      // Get product price
      const [prod] = await conn.query('SELECT id, name, price, stock_quantity FROM products WHERE id = ? FOR UPDATE', [item.product_id])
      if (!prod.length) { await conn.rollback(); conn.release(); return res.status(400).json({ error: `product ${item.product_id} not found` }) }
      const unitPrice = item.unit_price !== undefined ? Number(item.unit_price) : Number(prod[0].price)
      const lineTotal = unitPrice * item.quantity

      // Check stock
      if (prod[0].stock_quantity < item.quantity) {
        await conn.rollback(); conn.release()
        return res.status(400).json({ error: `Insufficient stock for ${prod[0].name}. Available: ${prod[0].stock_quantity}` })
      }

      subtotal += lineTotal
      processedItems.push({ ...item, unitPrice, lineTotal, productName: prod[0].name })

      // Decrease stock
      const newQty = prod[0].stock_quantity - item.quantity
      await conn.query('UPDATE products SET stock_quantity = ? WHERE id = ?', [newQty, item.product_id])

      // Record inventory transaction
      await conn.query(
        `INSERT INTO inventory_transactions (product_id, transaction_type, quantity, user_id, reason, balance_after)
         VALUES (?, 'OUT', ?, ?, ?, ?)`,
        [item.product_id, -item.quantity, req.auth.id, `Sale ${saleNum}`, newQty]
      )
    }

    const discountAmt = Number(discount) || 0
    const taxAmt = Number(tax) || 0
    const total = subtotal - discountAmt + taxAmt

    const [saleResult] = await conn.query(
      `INSERT INTO sales (sale_number, clerk_id, customer_id, subtotal, tax, discount, total, payment_method, receipt_no)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [saleNum, req.auth.id, customer_id || null, subtotal, taxAmt, discountAmt, total, payment_method, receiptNo]
    )
    const saleId = saleResult.insertId

    for (const item of processedItems) {
      await conn.query(
        'INSERT INTO sale_items (sale_id, product_id, qty, unit_price, line_total) VALUES (?, ?, ?, ?, ?)',
        [saleId, item.product_id, item.quantity, item.unitPrice, item.lineTotal]
      )
    }

    await conn.commit()
    conn.release()

    res.json({
      id: saleId,
      sale_number: saleNum,
      receipt_no: receiptNo,
      subtotal,
      tax: taxAmt,
      discount: discountAmt,
      total,
      payment_method,
      items: processedItems
    })
  } catch (err) {
    await conn.rollback()
    conn.release()
    console.error(err)
    res.status(500).json({ error: 'sale creation failed' })
  }
})

// ─── Refund / cancel sale ───
router.post('/:id/refund', express.json(), verifyToken, authorize('sales.refund'), async (req, res) => {
  const conn = await db.pool.getConnection()
  try {
    await conn.beginTransaction()
    const saleId = req.params.id
    const [saleRows] = await conn.query('SELECT * FROM sales WHERE id = ? FOR UPDATE', [saleId])
    if (!saleRows.length) { await conn.rollback(); conn.release(); return res.status(404).json({ error: 'sale not found' }) }
    if (saleRows[0].status === 'REFUNDED') { await conn.rollback(); conn.release(); return res.status(400).json({ error: 'sale already refunded' }) }

    // Return items to inventory
    const [items] = await conn.query('SELECT * FROM sale_items WHERE sale_id = ?', [saleId])
    for (const item of items) {
      const [prod] = await conn.query('SELECT stock_quantity FROM products WHERE id = ? FOR UPDATE', [item.product_id])
      if (!prod.length) continue
      const newQty = prod[0].stock_quantity + item.qty
      await conn.query('UPDATE products SET stock_quantity = ? WHERE id = ?', [newQty, item.product_id])
      await conn.query(
        `INSERT INTO inventory_transactions (product_id, transaction_type, quantity, user_id, reason, balance_after)
         VALUES (?, 'RETURN', ?, ?, ?, ?)`,
        [item.product_id, item.qty, req.auth.id, `Refund for sale #${saleRows[0].sale_number}`, newQty]
      )
    }

    await conn.query("UPDATE sales SET status = 'REFUNDED' WHERE id = ?", [saleId])
    await conn.commit()
    conn.release()
    res.json({ success: true })
  } catch (err) {
    await conn.rollback()
    conn.release()
    console.error(err)
    res.status(500).json({ error: 'refund failed' })
  }
})

module.exports = router
