const express = require('express')
const router = express.Router()
const db = require('../database')
const { verifyToken, authorize } = require('../middleware/authMiddleware')

const SALE_STATUSES_FOR_CUSTOMER_METRICS = ['COMPLETED', 'REFUNDED']
const MATCH_SALE_TO_CUSTOMER_SQL = `
(
  s.customer_id = c.id
  OR (
    s.customer_id IS NULL
    AND LOWER(TRIM(COALESCE(s.customer_name_snapshot, ''))) = LOWER(TRIM(COALESCE(c.name, '')))
    AND (
      COALESCE(TRIM(c.phone), '') = ''
      OR COALESCE(TRIM(s.customer_phone_snapshot), '') = COALESCE(TRIM(c.phone), '')
    )
  )
)
`

function toMoney(value) {
  return Number(Number(value || 0).toFixed(2))
}

function normalizeCustomerMetrics(row) {
  return {
    ...row,
    total_orders: Number(row?.total_orders || 0),
    gross_spent: toMoney(row?.gross_spent),
    returns_value: toMoney(row?.returns_value),
    net_spent: toMoney(row?.net_spent),
    recent_items_preview: String(row?.recent_items_preview || '').trim()
  }
}

// List customers
router.get('/', verifyToken, authorize('customers.view'), async (req, res) => {
  try {
    const [rows] = await db.pool.query(
      `SELECT
         c.*,
         COALESCE((
           SELECT COUNT(*)
           FROM sales s
           WHERE s.status IN (?, ?)
             AND ${MATCH_SALE_TO_CUSTOMER_SQL}
         ), 0) AS total_orders,
         COALESCE((
           SELECT ROUND(SUM(s.total), 2)
           FROM sales s
           WHERE s.status IN (?, ?)
             AND ${MATCH_SALE_TO_CUSTOMER_SQL}
         ), 0) AS gross_spent,
         COALESCE((
           SELECT ROUND(SUM(sri.quantity * sri.unit_price), 2)
           FROM sale_return_items sri
           JOIN sales s ON s.id = sri.sale_id
           WHERE s.status IN (?, ?)
             AND ${MATCH_SALE_TO_CUSTOMER_SQL}
         ), 0) AS returns_value,
         (
           SELECT MAX(s.date)
           FROM sales s
           WHERE s.status IN (?, ?)
             AND ${MATCH_SALE_TO_CUSTOMER_SQL}
         ) AS last_purchase_at,
         COALESCE((
           SELECT GROUP_CONCAT(
             DISTINCT COALESCE(si.product_name_snapshot, p.name, 'Item')
             ORDER BY s.date DESC
             SEPARATOR ' | '
           )
           FROM sales s
           JOIN sale_items si ON si.sale_id = s.id
           LEFT JOIN products p ON p.id = si.product_id
           WHERE s.status IN (?, ?)
             AND ${MATCH_SALE_TO_CUSTOMER_SQL}
         ), '') AS recent_items_preview
       FROM customers c
       ORDER BY c.name ASC`,
      [
        SALE_STATUSES_FOR_CUSTOMER_METRICS[0],
        SALE_STATUSES_FOR_CUSTOMER_METRICS[1],
        SALE_STATUSES_FOR_CUSTOMER_METRICS[0],
        SALE_STATUSES_FOR_CUSTOMER_METRICS[1],
        SALE_STATUSES_FOR_CUSTOMER_METRICS[0],
        SALE_STATUSES_FOR_CUSTOMER_METRICS[1],
        SALE_STATUSES_FOR_CUSTOMER_METRICS[0],
        SALE_STATUSES_FOR_CUSTOMER_METRICS[1],
        SALE_STATUSES_FOR_CUSTOMER_METRICS[0],
        SALE_STATUSES_FOR_CUSTOMER_METRICS[1]
      ]
    )
    res.json(rows.map(normalizeCustomerMetrics))
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'failed to fetch customers' })
  }
})

// Get single customer
router.get('/:id', verifyToken, authorize('customers.view'), async (req, res) => {
  try {
    const customerId = Number(req.params.id)
    if (!Number.isInteger(customerId) || customerId <= 0) {
      return res.status(400).json({ error: 'invalid customer id' })
    }

    const [rows] = await db.pool.query(
      `SELECT
         c.*,
         COALESCE((
           SELECT COUNT(*)
           FROM sales s
           WHERE s.status IN (?, ?)
             AND ${MATCH_SALE_TO_CUSTOMER_SQL}
         ), 0) AS total_orders,
         COALESCE((
           SELECT ROUND(SUM(s.total), 2)
           FROM sales s
           WHERE s.status IN (?, ?)
             AND ${MATCH_SALE_TO_CUSTOMER_SQL}
         ), 0) AS gross_spent,
         COALESCE((
           SELECT ROUND(SUM(sri.quantity * sri.unit_price), 2)
           FROM sale_return_items sri
           JOIN sales s ON s.id = sri.sale_id
           WHERE s.status IN (?, ?)
             AND ${MATCH_SALE_TO_CUSTOMER_SQL}
         ), 0) AS returns_value,
         (
           SELECT MAX(s.date)
           FROM sales s
           WHERE s.status IN (?, ?)
             AND ${MATCH_SALE_TO_CUSTOMER_SQL}
         ) AS last_purchase_at,
         COALESCE((
           SELECT GROUP_CONCAT(
             DISTINCT COALESCE(si.product_name_snapshot, p.name, 'Item')
             ORDER BY s.date DESC
             SEPARATOR ' | '
           )
           FROM sales s
           JOIN sale_items si ON si.sale_id = s.id
           LEFT JOIN products p ON p.id = si.product_id
           WHERE s.status IN (?, ?)
             AND ${MATCH_SALE_TO_CUSTOMER_SQL}
         ), '') AS recent_items_preview
       FROM customers c
       WHERE c.id = ?
       LIMIT 1`,
      [
        SALE_STATUSES_FOR_CUSTOMER_METRICS[0],
        SALE_STATUSES_FOR_CUSTOMER_METRICS[1],
        SALE_STATUSES_FOR_CUSTOMER_METRICS[0],
        SALE_STATUSES_FOR_CUSTOMER_METRICS[1],
        SALE_STATUSES_FOR_CUSTOMER_METRICS[0],
        SALE_STATUSES_FOR_CUSTOMER_METRICS[1],
        SALE_STATUSES_FOR_CUSTOMER_METRICS[0],
        SALE_STATUSES_FOR_CUSTOMER_METRICS[1],
        SALE_STATUSES_FOR_CUSTOMER_METRICS[0],
        SALE_STATUSES_FOR_CUSTOMER_METRICS[1],
        customerId
      ]
    )
    if (!rows.length) return res.status(404).json({ error: 'customer not found' })

    const [purchaseLines] = await db.pool.query(
      `SELECT
         si.id AS sale_item_id,
         si.sale_id,
         s.sale_number,
         s.receipt_no,
         s.date AS purchased_at,
         si.qty,
         si.unit_price,
         si.line_total,
         COALESCE(si.product_name_snapshot, p.name, 'Item') AS product_name,
         COALESCE(si.sku_snapshot, p.sku, '') AS sku,
         COALESCE(si.brand_snapshot, p.brand, '') AS brand,
         COALESCE(si.barcode_snapshot, p.barcode, '') AS barcode,
         COALESCE(si.size_snapshot, p.size, '') AS size,
         COALESCE(si.color_snapshot, p.color, '') AS color
       FROM sales s
       JOIN sale_items si ON si.sale_id = s.id
       LEFT JOIN products p ON p.id = si.product_id
       JOIN customers c ON c.id = ?
       WHERE s.status IN (?, ?)
         AND ${MATCH_SALE_TO_CUSTOMER_SQL}
       ORDER BY s.date DESC, si.id DESC
       LIMIT 200`,
      [
        customerId,
        SALE_STATUSES_FOR_CUSTOMER_METRICS[0],
        SALE_STATUSES_FOR_CUSTOMER_METRICS[1]
      ]
    )

    res.json({
      ...normalizeCustomerMetrics(rows[0]),
      recent_purchase_lines: purchaseLines.map((line) => ({
        ...line,
        qty: Number(line.qty || 0),
        unit_price: toMoney(line.unit_price),
        line_total: toMoney(line.line_total)
      }))
    })
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
    const { name, phone, email, address, notes } = req.body
    const updates = []
    const params = []
    if (name !== undefined) { updates.push('name = ?'); params.push(name) }
    if (phone !== undefined) { updates.push('phone = ?'); params.push(phone) }
    if (email !== undefined) { updates.push('email = ?'); params.push(email) }
    if (address !== undefined) { updates.push('address = ?'); params.push(address) }
    if (notes !== undefined) { updates.push('notes = ?'); params.push(notes) }
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
