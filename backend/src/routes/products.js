const express = require('express')
const router = express.Router()
const db = require('../database')
const { verifyToken, authorize } = require('../middleware/authMiddleware')
const {
  normalizeBarcode,
  isBarcodeBlank,
  validateBarcodeFormat,
  barcodeExists,
  generateUniqueBarcodeForProduct,
  getNextSequentialBarcode,
  getNextSequentialSKU
} = require('../utils/barcodeSupport')
const { normalizeScannedCode, isScannedCodeValid } = require('../utils/scannerSupport')
const { ensureScannerSchema } = require('../services/scannerSchemaService')
const { generateProductQrImage } = require('../services/qrCodeService')
const {
  findProductByScannedCode,
  updateProductQrImagePath
} = require('../repositories/productRepository')

const BARCODE_FORMAT_ERROR = 'barcode must be 4-64 chars using letters, numbers, ".", "_" or "-"'

function createHttpError(statusCode, message) {
  const err = new Error(message)
  err.statusCode = statusCode
  return err
}

function duplicateFieldFromError(err) {
  const lowerMessage = String(err?.message || '').toLowerCase()
  if (lowerMessage.includes('barcode')) return 'barcode'
  if (lowerMessage.includes('sku')) return 'sku'
  return null
}

function duplicateFieldMessage(field) {
  if (field === 'barcode') return 'Barcode already exists'
  if (field === 'sku') return 'SKU already exists'
  return 'Duplicate value already exists'
}

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
    await ensureScannerSchema()
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

router.get('/by-code/:code', verifyToken, authorize(['sales.create', 'sales.view', 'products.view']), async (req, res) => {
  const conn = await db.pool.getConnection()
  try {
    await ensureScannerSchema(conn)
    const normalizedCode = normalizeScannedCode(req.params.code)
    if (!normalizedCode || !isScannedCodeValid(normalizedCode)) {
      return res.status(400).json({ error: 'invalid code' })
    }

    const product = await findProductByScannedCode(conn, normalizedCode)
    if (!product) return res.status(404).json({ error: 'unknown product' })

    res.json({
      id: product.id,
      sku: product.sku,
      name: product.name,
      price: product.price,
      stock_quantity: product.stock_quantity,
      barcode: product.barcode,
      qr_image_path: product.qr_image_path || null
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'failed to look up product code' })
  } finally {
    conn.release()
  }
})

// Get single product
router.get('/:id', verifyToken, authorize('products.view'), async (req, res) => {
  try {
    await ensureScannerSchema()
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
  const conn = await db.pool.getConnection()
  try {
    await conn.beginTransaction()
    await ensureScannerSchema(conn)

    const { sku, name, brand, description, category_id, price, cost, stock_quantity, low_stock_threshold, size, color, barcode } = req.body

    const normalizedName = String(name || '').trim()
    if (!normalizedName) throw createHttpError(400, 'name is required')

    // Auto-generate SKU if not provided
    let normalizedSku = String(sku || '').trim() || null
    if (!normalizedSku) {
      normalizedSku = await getNextSequentialSKU(conn)
    }

    let normalizedBarcode = null

    if (!isBarcodeBlank(barcode)) {
      normalizedBarcode = normalizeBarcode(barcode)
      if (!validateBarcodeFormat(normalizedBarcode)) throw createHttpError(400, BARCODE_FORMAT_ERROR)
      if (await barcodeExists(conn, normalizedBarcode)) throw createHttpError(400, 'Barcode already exists')
    }

    const [result] = await conn.query(
      `INSERT INTO products (sku, name, brand, description, category_id, price, cost, stock_quantity, low_stock_threshold, size, color, barcode)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [normalizedSku, normalizedName, brand || null, description || null, category_id || null,
       price || 0, cost || 0, stock_quantity || 0, low_stock_threshold || 10,
       size || null, color || null, normalizedBarcode]
    )

    if (!normalizedBarcode) {
      normalizedBarcode = await getNextSequentialBarcode(conn)
      await conn.query(
        'UPDATE products SET barcode = ? WHERE id = ?',
        [normalizedBarcode, result.insertId]
      )
    }

    const qrAsset = await generateProductQrImage({
      productId: result.insertId,
      code: normalizedBarcode || normalizedSku
    })
    await updateProductQrImagePath(conn, result.insertId, qrAsset.publicPath)

    await conn.commit()
    res.json({ id: result.insertId, barcode: normalizedBarcode, qr_image_path: qrAsset.publicPath })
  } catch (err) {
    await conn.rollback().catch(() => {})
    console.error(err)
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: duplicateFieldMessage(duplicateFieldFromError(err)) })
    }
    if (err?.statusCode) return res.status(err.statusCode).json({ error: err.message })
    res.status(500).json({ error: err.message || 'failed to create product' })
  } finally {
    conn.release()
  }
})

// Update product
router.put('/:id', express.json(), verifyToken, authorize('products.edit'), async (req, res) => {
  const conn = await db.pool.getConnection()
  try {
    await conn.beginTransaction()
    await ensureScannerSchema(conn)

    const id = Number(req.params.id)
    if (!Number.isFinite(id) || id <= 0) throw createHttpError(400, 'invalid product id')

    const [existingRows] = await conn.query(
      'SELECT id, barcode, sku, qr_image_path FROM products WHERE id = ? LIMIT 1 FOR UPDATE',
      [id]
    )
    if (!existingRows.length) throw createHttpError(404, 'product not found')

    const { sku, name, brand, description, category_id, price, cost, stock_quantity, low_stock_threshold, size, color, barcode, is_active } = req.body
    const updates = []
    const params = []

    if (sku !== undefined) {
      const normalizedSku = String(sku || '').trim() || null
      updates.push('sku = ?')
      params.push(normalizedSku)
    }
    if (name !== undefined) {
      const normalizedName = String(name || '').trim()
      if (!normalizedName) throw createHttpError(400, 'name is required')
      updates.push('name = ?')
      params.push(normalizedName)
    }
    if (brand !== undefined) { updates.push('brand = ?'); params.push(brand || null) }
    if (description !== undefined) { updates.push('description = ?'); params.push(description) }
    if (category_id !== undefined) { updates.push('category_id = ?'); params.push(category_id || null) }
    if (price !== undefined) { updates.push('price = ?'); params.push(price) }
    if (cost !== undefined) { updates.push('cost = ?'); params.push(cost) }
    if (stock_quantity !== undefined) { updates.push('stock_quantity = ?'); params.push(stock_quantity) }
    if (low_stock_threshold !== undefined) { updates.push('low_stock_threshold = ?'); params.push(low_stock_threshold) }
    if (size !== undefined) { updates.push('size = ?'); params.push(size) }
    if (color !== undefined) { updates.push('color = ?'); params.push(color) }
    if (barcode !== undefined) {
      if (isBarcodeBlank(barcode)) {
        throw createHttpError(400, 'barcode cannot be empty once assigned')
      }
      const normalizedBarcode = normalizeBarcode(barcode)
      if (!validateBarcodeFormat(normalizedBarcode)) throw createHttpError(400, BARCODE_FORMAT_ERROR)
      if (await barcodeExists(conn, normalizedBarcode, id)) throw createHttpError(400, 'Barcode already exists')
      updates.push('barcode = ?')
      params.push(normalizedBarcode)
    }
    if (is_active !== undefined) { updates.push('is_active = ?'); params.push(is_active ? 1 : 0) }
    if (!updates.length) throw createHttpError(400, 'nothing to update')
    params.push(id)
    await conn.query(`UPDATE products SET ${updates.join(', ')} WHERE id = ?`, params)

    let autoGeneratedBarcode = null
    if (barcode === undefined && isBarcodeBlank(existingRows[0].barcode)) {
      autoGeneratedBarcode = await getNextSequentialBarcode(conn)
      await conn.query(
        'UPDATE products SET barcode = ? WHERE id = ?',
        [autoGeneratedBarcode, id]
      )
    }

    const nextCode = autoGeneratedBarcode
      || (barcode !== undefined
        ? normalizeBarcode(barcode)
        : normalizeBarcode(existingRows[0].barcode || sku || existingRows[0].sku))
    const skuChanged = sku !== undefined && String(sku || '').trim() !== String(existingRows[0].sku || '').trim()
    const barcodeChanged = Boolean(autoGeneratedBarcode) || (barcode !== undefined && nextCode !== normalizeBarcode(existingRows[0].barcode))

    if (barcodeChanged || skuChanged || !existingRows[0].qr_image_path) {
      const qrAsset = await generateProductQrImage({
        productId: id,
        code: nextCode || String(sku || existingRows[0].sku || '').trim()
      })
      await updateProductQrImagePath(conn, id, qrAsset.publicPath)
    }

    await conn.commit()
    res.json({ success: true })
  } catch (err) {
    await conn.rollback().catch(() => {})
    console.error(err)
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: duplicateFieldMessage(duplicateFieldFromError(err)) })
    }
    if (err?.statusCode) return res.status(err.statusCode).json({ error: err.message })
    res.status(500).json({ error: 'failed to update product' })
  } finally {
    conn.release()
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
