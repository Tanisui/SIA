const express = require('express')
const router = express.Router()
const db = require('../database')
const { verifyToken, authorize } = require('../middleware/authMiddleware')

// Helper: Normalize SKU
function normalizeProvidedSku(sku) {
  const raw = String(sku || '').trim()
  if (!raw) return null
  if (/^\d+$/.test(raw)) return raw.padStart(8, '0')
  return raw.toUpperCase()
}

// Helper: Normalize Barcode
function normalizeProvidedBarcode(barcode) {
  const raw = String(barcode || '').trim()
  return raw || null
}

// Helper: Generate Category Prefix for SKU
function categoryPrefix(name) {
  const clean = String(name || '').replace(/[^a-zA-Z0-9\s]/g, ' ').trim()
  if (!clean) return 'PRD'

  const initials = clean.split(/\s+/).map((w) => w[0]).join('').toUpperCase()
  if (initials.length >= 3) return initials.slice(0, 3)

  const compact = clean.replace(/[^a-zA-Z0-9]/g, '').toUpperCase()
  if (compact.length >= 3) return compact.slice(0, 3)
  if (compact.length > 0) return compact.padEnd(3, 'X')
  return 'PRD'
}

// Helper: Auto-generate SKU
async function generateSku(categoryId) {
  let prefix = 'PRD'
  if (categoryId) {
    const [catRows] = await db.pool.query('SELECT name FROM categories WHERE id = ? LIMIT 1', [categoryId])
    if (catRows.length) prefix = categoryPrefix(catRows[0].name)
  }

  const [rows] = await db.pool.query('SELECT sku FROM products WHERE sku LIKE ?', [`${prefix}-%`])
  let maxSeq = 0
  for (const row of rows) {
    const sku = String(row.sku || '').toUpperCase()
    const m = sku.match(new RegExp(`^${prefix}-(\\d+)$`))
    if (m) {
      const seq = Number(m[1])
      if (Number.isFinite(seq) && seq > maxSeq) maxSeq = seq
    }
  }
  return `${prefix}-${String(maxSeq + 1).padStart(4, '0')}`
}

// Helper: Auto-generate Barcode
async function generateBarcode() {
  const [rows] = await db.pool.query(
    "SELECT barcode FROM products WHERE barcode REGEXP '^[0-9]{12}$' ORDER BY barcode DESC LIMIT 1"
  )
  const last = rows.length ? Number(rows[0].barcode) : 0
  const next = Number.isFinite(last) ? last + 1 : 1
  return String(next).padStart(12, '0')
}

// ─── ROUTES ───

// Low stock alerts (Updated to allow products.view)
router.get('/alerts/low-stock', verifyToken, authorize('products.view'), async (req, res) => {
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
    const { sku, name, brand, description, category_id, price, cost, stock_quantity, low_stock_threshold, size, color, barcode } = req.body
    const cleanName = String(name || '').trim()
    const sellingPrice = Number(price)
    const quantity = Number(stock_quantity)
    const lowStock = low_stock_threshold === undefined || low_stock_threshold === '' ? 10 : Number(low_stock_threshold)

    if (!cleanName) return res.status(400).json({ error: 'Product name is required' })
    if (!Number.isFinite(sellingPrice) || sellingPrice <= 0) return res.status(400).json({ error: 'Selling price must be greater than 0' })

    let finalSku = normalizeProvidedSku(sku)
    if (!finalSku) finalSku = await generateSku(category_id || null)

    let finalBarcode = normalizeProvidedBarcode(barcode)
    if (!finalBarcode) finalBarcode = await generateBarcode()

    const [result] = await db.pool.query(
      `INSERT INTO products (sku, name, brand, description, category_id, price, cost, stock_quantity, low_stock_threshold, size, color, barcode)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [finalSku, cleanName, brand || null, description || null, category_id || null,
       sellingPrice, cost || 0, Number.isFinite(quantity) ? quantity : 0, Number.isFinite(lowStock) ? lowStock : 10,
       size || null, color || null, finalBarcode]
    )
    res.json({ id: result.insertId })
  } catch (err) {
    console.error(err)
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: 'SKU or Barcode already exists' })
    }
    res.status(500).json({ error: 'failed to create product' })
  }
})

// Update product
router.put('/:id', express.json(), verifyToken, authorize('products.edit'), async (req, res) => {
  try {
    const id = req.params.id
    const { sku, name, brand, description, category_id, price, cost, stock_quantity, low_stock_threshold, size, color, barcode, is_active } = req.body
    const updates = []
    const params = []

    if (sku !== undefined) { updates.push('sku = ?'); params.push(normalizeProvidedSku(sku)) }
    if (name !== undefined) { updates.push('name = ?'); params.push(String(name || '').trim()) }
    if (brand !== undefined) { updates.push('brand = ?'); params.push(brand || null) }
    if (description !== undefined) { updates.push('description = ?'); params.push(description) }
    if (category_id !== undefined) { updates.push('category_id = ?'); params.push(category_id || null) }
    if (price !== undefined) { updates.push('price = ?'); params.push(Number(price)) }
    if (cost !== undefined) { updates.push('cost = ?'); params.push(cost) }
    if (stock_quantity !== undefined) { updates.push('stock_quantity = ?'); params.push(Number(stock_quantity)) }
    if (low_stock_threshold !== undefined) { updates.push('low_stock_threshold = ?'); params.push(low_stock_threshold) }
    if (size !== undefined) { updates.push('size = ?'); params.push(size) }
    if (color !== undefined) { updates.push('color = ?'); params.push(color) }
    if (is_active !== undefined) { updates.push('is_active = ?'); params.push(is_active ? 1 : 0) }
    
    if (barcode !== undefined) {
      let finalBarcode = normalizeProvidedBarcode(barcode)
      if (!finalBarcode) finalBarcode = await generateBarcode()
      updates.push('barcode = ?')
      params.push(finalBarcode)
    }

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