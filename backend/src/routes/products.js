const express = require('express')
const router = express.Router()
const db = require('../database')
const { verifyToken, authorize } = require('../middleware/authMiddleware')

// Low stock alerts — MUST be before /:id
router.get('/alerts/low-stock', verifyToken, authorize('inventory.view'), async (req, res) => {
  try {
    const [rows] = await db.pool.query(`
      SELECT p.*, c.name AS category
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

// List all products
router.get('/', verifyToken, authorize('products.view'), async (req, res) => {
  try {
    const [rows] = await db.pool.query(`
      SELECT p.*, c.name AS category
      FROM products p
      LEFT JOIN categories c ON c.id = p.category_id
      ORDER BY p.id DESC
    `)
    res.json(rows)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'failed to fetch products' })
  }
})

// Get single product
router.get('/:id', verifyToken, authorize('products.view'), async (req, res) => {
  try {
    const [rows] = await db.pool.query(`
      SELECT p.*, c.name AS category
      FROM products p
      LEFT JOIN categories c ON c.id = p.category_id
      WHERE p.id = ? LIMIT 1
    `, [req.params.id])
    if (!rows.length) return res.status(404).json({ error: 'product not found' })
    res.json(rows[0])
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'failed to fetch product' })
  }
})

// Create product
router.post('/', express.json(), verifyToken, authorize('products.create'), async (req, res) => {
  try {
    const { sku, name, description, category_id, price, cost, stock_quantity, low_stock_threshold, size, color, barcode } = req.body
    if (!name) return res.status(400).json({ error: 'name is required' })
    const [result] = await db.pool.query(
      `INSERT INTO products (sku, name, description, category_id, price, cost, stock_quantity, low_stock_threshold, size, color, barcode)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [sku || null, name, description || null, category_id || null,
       price || 0, cost || 0, stock_quantity || 0, low_stock_threshold || 10,
       size || null, color || null, barcode || null]
    )
    res.json({ id: result.insertId })
  } catch (err) {
    console.error(err)
    if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ error: 'SKU already exists' })
    res.status(500).json({ error: 'failed to create product' })
  }
})

// Update product
router.put('/:id', express.json(), verifyToken, authorize('products.update'), async (req, res) => {
  try {
    const id = req.params.id
    const { sku, name, description, category_id, price, cost, stock_quantity, low_stock_threshold, size, color, barcode, is_active } = req.body
    const updates = []
    const params = []
    if (sku !== undefined) { updates.push('sku = ?'); params.push(sku || null) }
    if (name !== undefined) { updates.push('name = ?'); params.push(name) }
    if (description !== undefined) { updates.push('description = ?'); params.push(description) }
    if (category_id !== undefined) { updates.push('category_id = ?'); params.push(category_id || null) }
    if (price !== undefined) { updates.push('price = ?'); params.push(price) }
    if (cost !== undefined) { updates.push('cost = ?'); params.push(cost) }
    if (stock_quantity !== undefined) { updates.push('stock_quantity = ?'); params.push(stock_quantity) }
    if (low_stock_threshold !== undefined) { updates.push('low_stock_threshold = ?'); params.push(low_stock_threshold) }
    if (size !== undefined) { updates.push('size = ?'); params.push(size) }
    if (color !== undefined) { updates.push('color = ?'); params.push(color) }
    if (barcode !== undefined) { updates.push('barcode = ?'); params.push(barcode) }
    if (is_active !== undefined) { updates.push('is_active = ?'); params.push(is_active ? 1 : 0) }
    if (!updates.length) return res.status(400).json({ error: 'nothing to update' })
    params.push(id)
    await db.pool.query(`UPDATE products SET ${updates.join(', ')} WHERE id = ?`, params)
    res.json({ success: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'failed to update product' })
  }
})

// Delete product
router.delete('/:id', verifyToken, authorize('products.delete'), async (req, res) => {
  try {
    await db.pool.query('DELETE FROM products WHERE id = ?', [req.params.id])
    res.json({ success: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'failed to delete product' })
  }
})

module.exports = router
