const express = require('express')
const router = express.Router()
const db = require('../database')
const { verifyToken, authorize } = require('../middleware/authMiddleware')
const {
  normalizeBarcode,
  isBarcodeBlank,
  validateBarcodeFormat,
  barcodeExists,
  getNextSequentialBarcode,
  getNextSequentialSKU
} = require('../utils/barcodeSupport')
const { normalizeScannedCode, isScannedCodeValid } = require('../utils/scannerSupport')
const { ensureScannerSchema } = require('../services/scannerSchemaService')
const { generateProductQrImage } = require('../services/qrCodeService')
const { applyProductStockDelta } = require('../utils/inventoryStock')
const {
  findProductByScannedCode,
  updateProductQrImagePath
} = require('../repositories/productRepository')
const { logAuditEventSafe } = require('../utils/auditLog')
const { ensureAutomatedReportsSchema } = require('../utils/automatedReports')
const {
  deriveCategoryAndTypeFromBaleCategory,
  isCategoryTableTypeForCategory,
  mergeCategoryTypeOptions
} = require('../utils/categoryClassification')

const BARCODE_FORMAT_ERROR = 'barcode must be 4-64 chars using letters, numbers, ".", "_" or "-"'
const BALE_GRADE_VALUES = new Set(['premium', 'standard'])

function roundMoney(value) {
  return Math.round((Number(value) || 0) * 100) / 100
}

function padDatePart(value) {
  return String(value).padStart(2, '0')
}

function formatLocalDateOnly(value) {
  const parsed = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(parsed.getTime())) return null
  return [
    parsed.getFullYear(),
    padDatePart(parsed.getMonth() + 1),
    padDatePart(parsed.getDate())
  ].join('-')
}

function normalizeDateOnlyValue(value) {
  if (!value) return null
  if (value instanceof Date) return formatLocalDateOnly(value)

  const normalized = String(value || '').trim()
  const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(normalized)
  if (dateOnlyMatch) return `${dateOnlyMatch[1]}-${dateOnlyMatch[2]}-${dateOnlyMatch[3]}`

  return formatLocalDateOnly(normalized)
}

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

function normalizeComparableText(value) {
  return String(value || '').trim().toLowerCase()
}

function normalizeOptionalText(value) {
  const normalized = String(value || '').trim()
  return normalized || null
}

function asPositiveWhole(value, fallback = 0) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback
  return Math.floor(parsed)
}

async function normalizeCategoryType(conn, categoryId, value) {
  const normalizedType = normalizeOptionalText(value)
  const normalizedCategoryId = Number(categoryId)
  if (!Number.isInteger(normalizedCategoryId) || normalizedCategoryId <= 0) {
    if (!normalizedType) return null
    throw createHttpError(400, 'category_id is required when type is selected')
  }

  const rows = await getCategoryTypeOptions(conn, normalizedCategoryId)

  if (!normalizedType) {
    if (rows.length > 0) throw createHttpError(400, 'type is required for the selected category')
    return null
  }

  const matchedType = rows.find((row) => (
    normalizeComparableText(row.name) === normalizeComparableText(normalizedType)
  ))

  if (!matchedType) throw createHttpError(400, 'type must match the selected category')
  return matchedType.name
}

async function getCategoryTypeOptions(conn, categoryId) {
  const normalizedCategoryId = Number(categoryId)
  if (!Number.isInteger(normalizedCategoryId) || normalizedCategoryId <= 0) return []

  const [[category]] = await conn.query(
    'SELECT id, name, description FROM categories WHERE id = ? LIMIT 1',
    [normalizedCategoryId]
  )
  if (!category) return []

  const [configuredTypeRows] = await conn.query(`
    SELECT id, category_id, name, description, 'category_types' AS source
    FROM category_types
    WHERE category_id = ?
      AND COALESCE(is_active, 1) = 1
  `, [normalizedCategoryId])

  const [savedProductTypeRows] = await conn.query(`
    SELECT
      NULL AS id,
      category_id,
      TRIM(subcategory) AS name,
      NULL AS description,
      'products' AS source
    FROM products
    WHERE category_id = ?
      AND subcategory IS NOT NULL
      AND TRIM(subcategory) <> ''
  `, [normalizedCategoryId])

  const [categoryRows] = await conn.query('SELECT id, name, description FROM categories ORDER BY name')
  const categoryTableTypeRows = categoryRows
    .filter((row) => isCategoryTableTypeForCategory(row.name, category.name))
    .map((row) => ({
      id: row.id,
      category_id: normalizedCategoryId,
      name: row.name,
      description: row.description,
      source: 'categories'
    }))

  return mergeCategoryTypeOptions(category, [
    ...configuredTypeRows,
    ...savedProductTypeRows,
    ...categoryTableTypeRows
  ])
}

async function resolveOrCreateCategoryByName(conn, name) {
  const [categoryRows] = await conn.query('SELECT id, name, description FROM categories ORDER BY name')
  const resolvedInput = deriveCategoryAndTypeFromBaleCategory(name, categoryRows)
  const normalizedName = String(resolvedInput.categoryName || '').trim().replace(/\s+/g, ' ')
  if (!normalizedName) return null

  const [existingRows] = await conn.query(`
    SELECT id
    FROM categories
    WHERE LOWER(TRIM(name)) = LOWER(TRIM(?))
    ORDER BY id ASC
    LIMIT 1
  `, [normalizedName])

  if (existingRows.length) {
    return {
      categoryId: Number(existingRows[0].id) || null,
      typeName: resolvedInput.typeName || null
    }
  }

  try {
    const [result] = await conn.query(
      'INSERT INTO categories (name, description) VALUES (?, ?)',
      [normalizedName, null]
    )
    return {
      categoryId: Number(result.insertId) || null,
      typeName: resolvedInput.typeName || null
    }
  } catch (err) {
    if (err.code !== 'ER_DUP_ENTRY') throw err
    const [rows] = await conn.query(`
      SELECT id
      FROM categories
      WHERE LOWER(TRIM(name)) = LOWER(TRIM(?))
      ORDER BY id ASC
      LIMIT 1
    `, [normalizedName])
    return {
      categoryId: Number(rows?.[0]?.id) || null,
      typeName: resolvedInput.typeName || null
    }
  }
}

async function resolveSupplierId(conn, supplierId) {
  if (supplierId === undefined || supplierId === null || String(supplierId).trim() === '') return null

  const normalizedSupplierId = Number(supplierId)
  if (!Number.isInteger(normalizedSupplierId) || normalizedSupplierId <= 0) {
    throw createHttpError(400, 'supplier_id must be a valid supplier')
  }

  const [rows] = await conn.query('SELECT id FROM suppliers WHERE id = ? LIMIT 1', [normalizedSupplierId])
  if (!rows.length) throw createHttpError(400, 'supplier not found')
  return normalizedSupplierId
}

async function resolveCategoryNameById(conn, categoryId) {
  const normalizedCategoryId = Number(categoryId)
  if (!Number.isInteger(normalizedCategoryId) || normalizedCategoryId <= 0) return null

  const [rows] = await conn.query('SELECT name FROM categories WHERE id = ? LIMIT 1', [normalizedCategoryId])
  return normalizeOptionalText(rows?.[0]?.name)
}

async function getBaleStockedByGrade(conn, balePurchaseId) {
  const [rows] = await conn.query(`
    SELECT
      p.condition_grade,
      COALESCE(bale_create.stocked_units, 0) AS stocked_units
    FROM products p
    LEFT JOIN (
      SELECT
        it.product_id,
        SUM(
          CASE
            WHEN it.transaction_type = 'IN'
              AND it.reference LIKE 'BALE_PRODUCT_CREATE|%'
              AND COALESCE(it.quantity, 0) > 0
              THEN it.quantity
            ELSE 0
          END
        ) AS stocked_units
      FROM inventory_transactions it
      GROUP BY it.product_id
    ) bale_create ON bale_create.product_id = p.id
    WHERE p.bale_purchase_id = ?
      AND p.condition_grade IN ('premium', 'standard')
    FOR UPDATE
  `, [Number(balePurchaseId)])

  const stockedByGrade = { premium: 0, standard: 0 }
  for (const row of rows) {
    const grade = String(row.condition_grade || '').trim().toLowerCase()
    if (!BALE_GRADE_VALUES.has(grade)) continue

    // Older rows may not have historical BALE_PRODUCT_CREATE entries.
    const stockedUnits = asPositiveWhole(row.stocked_units, 0)
    stockedByGrade[grade] += stockedUnits > 0 ? stockedUnits : 1
  }

  return stockedByGrade
}

async function findSimilarProductForMerge(conn, options = {}) {
  const normalizedName = normalizeComparableText(options.name)
  if (!normalizedName) return null

  const normalizedBrand = normalizeComparableText(options.brand)
  const normalizedSize = normalizeComparableText(options.size)
  const normalizedSource = String(options.productSource || 'manual').trim().toLowerCase() || 'manual'
  const normalizedCategoryId = Number.isInteger(Number(options.categoryId)) && Number(options.categoryId) > 0
    ? Number(options.categoryId)
    : null
  const normalizedSubcategory = normalizeComparableText(options.subcategory)
  const normalizedBalePurchaseId = Number.isInteger(Number(options.balePurchaseId)) && Number(options.balePurchaseId) > 0
    ? Number(options.balePurchaseId)
    : null
  const normalizedConditionGrade = String(options.conditionGrade || '').trim().toLowerCase() || null
  const normalizedPrice = roundMoney(options.price)

  const [rows] = await conn.query(`
    SELECT
      p.id,
      p.sku,
      p.name,
      p.barcode,
      p.qr_image_path,
      p.stock_quantity
    FROM products p
    WHERE COALESCE(p.is_active, 1) = 1
      AND LOWER(TRIM(COALESCE(p.name, ''))) = ?
      AND LOWER(TRIM(COALESCE(p.brand, ''))) = ?
      AND LOWER(TRIM(COALESCE(p.size, ''))) = ?
      AND COALESCE(NULLIF(LOWER(TRIM(p.product_source)), ''), 'manual') = ?
      AND ((? IS NULL AND p.category_id IS NULL) OR p.category_id = ?)
      AND LOWER(TRIM(COALESCE(p.subcategory, ''))) = ?
      AND ((? IS NULL AND p.bale_purchase_id IS NULL) OR p.bale_purchase_id = ?)
      AND ((? IS NULL AND p.condition_grade IS NULL) OR p.condition_grade = ?)
      AND ROUND(COALESCE(p.price, 0), 2) = ?
    ORDER BY p.id ASC
    LIMIT 1
    FOR UPDATE
  `, [
    normalizedName,
    normalizedBrand,
    normalizedSize,
    normalizedSource,
    normalizedCategoryId,
    normalizedCategoryId,
    normalizedSubcategory,
    normalizedBalePurchaseId,
    normalizedBalePurchaseId,
    normalizedConditionGrade,
    normalizedConditionGrade,
    normalizedPrice
  ])

  return rows[0] || null
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
router.get('/', verifyToken, authorize(['products.view', 'inventory.view', 'inventory.adjust']), async (req, res) => {
  const conn = await db.pool.getConnection()
  try {
    await ensureScannerSchema()
    await ensureAutomatedReportsSchema()

    const [rows] = await conn.query(`
      SELECT p.*, c.name AS category
      FROM products p
      LEFT JOIN categories c ON c.id = p.category_id
      ORDER BY p.id DESC
    `)
    res.json(rows)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'failed to fetch products' })
  } finally {
    conn.release()
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
router.get('/:id', verifyToken, authorize(['products.view', 'inventory.view', 'inventory.adjust']), async (req, res) => {
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
    await ensureAutomatedReportsSchema()
    await conn.beginTransaction()
    await ensureScannerSchema(conn)

    const {
      sku,
      name,
      brand,
      description,
      category_id,
      subcategory,
      price,
      cost,
      stock_quantity,
      low_stock_threshold,
      size,
      color,
      barcode,
      product_source,
      supplier_id,
      bale_purchase_id,
      condition_grade
    } = req.body || {}

    const requestedSku = String(sku || '').trim()
    const requestedBarcode = String(barcode || '').trim()

    let normalizedName = String(name || '').trim()

    const normalizedBrand = String(brand || '').trim() || null
    const normalizedDescription = String(description || '').trim() || null
    const normalizedSize = String(size || '').trim() || null
    const normalizedColor = String(color || '').trim() || null

    // Auto-generate SKU if not provided
    let normalizedSku = requestedSku || null
    if (!normalizedSku) {
      normalizedSku = await getNextSequentialSKU(conn)
    }

    let normalizedBarcode = null
    const requestedInitialStock = Number(stock_quantity)
    if (stock_quantity !== undefined && (!Number.isFinite(requestedInitialStock) || requestedInitialStock < 0)) {
      throw createHttpError(400, 'stock_quantity must be zero or greater')
    }
    let normalizedStockQuantity = Number.isFinite(requestedInitialStock)
      ? Math.floor(requestedInitialStock)
      : 1

    const normalizedSourceInput = String(product_source || '').trim().toLowerCase()
    const isBaleSourceCreate = normalizedSourceInput === 'bale_breakdown'
      || bale_purchase_id !== undefined
      || condition_grade !== undefined

    let normalizedProductSource = isBaleSourceCreate ? 'bale_breakdown' : 'manual'
    let normalizedCategoryId = category_id ? Number(category_id) : null
    if (normalizedCategoryId !== null && (!Number.isInteger(normalizedCategoryId) || normalizedCategoryId <= 0)) {
      throw createHttpError(400, 'category_id must be a valid positive integer')
    }
    let normalizedSubcategory = null
    let normalizedSubcategoryInput = subcategory

    const normalizedPrice = roundMoney(price)
    const normalizedLowStockThreshold = Number.isFinite(Number(low_stock_threshold))
      ? Math.max(0, Number(low_stock_threshold))
      : 10
    const normalizedCostInput = Number.isFinite(Number(cost))
      ? roundMoney(cost)
      : 0
    let requestedBaleQuantity = 1

    let normalizedBalePurchaseId = null
    let normalizedConditionGrade = null
    let normalizedSourceBreakdownId = null
    let normalizedAllocatedCost = normalizedCostInput
    let normalizedCost = normalizedCostInput
    let normalizedDateEncoded = null
    let stockInReference = null
    let stockInReason = null
    let stockInCreatedAt = new Date()
    let normalizedManualSupplierId = null

    if (!isBarcodeBlank(requestedBarcode)) {
      normalizedBarcode = normalizeBarcode(requestedBarcode)
      if (!validateBarcodeFormat(normalizedBarcode)) throw createHttpError(400, BARCODE_FORMAT_ERROR)
      if (await barcodeExists(conn, normalizedBarcode)) throw createHttpError(400, 'Barcode already exists')
    }

    if (isBaleSourceCreate) {
      // Bale-linked create applies stock through inventory transactions.
      normalizedStockQuantity = 0
      requestedBaleQuantity = Number.isFinite(requestedInitialStock)
        ? Math.floor(requestedInitialStock)
        : 1
      if (requestedBaleQuantity <= 0) {
        throw createHttpError(400, 'Quantity must be a positive whole number for bale products')
      }

      normalizedBalePurchaseId = Number(bale_purchase_id)
      if (!Number.isInteger(normalizedBalePurchaseId) || normalizedBalePurchaseId <= 0) {
        throw createHttpError(400, 'bale_purchase_id must be a valid positive integer')
      }

      normalizedConditionGrade = String(condition_grade || '').trim().toLowerCase()
      if (!BALE_GRADE_VALUES.has(normalizedConditionGrade)) {
        throw createHttpError(400, 'condition_grade must be either premium or standard')
      }

      const [breakdownRows] = await conn.query(`
        SELECT
          bb.id AS breakdown_id,
          bb.bale_purchase_id,
          COALESCE(bb.premium_items, 0) AS premium_items,
          COALESCE(bb.standard_items, 0) AS standard_items,
          COALESCE(bb.cost_per_saleable_item, 0) AS cost_per_saleable_item,
          COALESCE(bb.breakdown_date, bp.purchase_date) AS breakdown_event_date,
          bp.bale_batch_no,
          bp.bale_category
        FROM bale_breakdowns bb
        JOIN bale_purchases bp ON bp.id = bb.bale_purchase_id
        WHERE bb.bale_purchase_id = ?
        LIMIT 1
        FOR UPDATE
      `, [normalizedBalePurchaseId])
      if (!breakdownRows.length) {
        throw createHttpError(404, 'bale breakdown not found for selected bale_purchase_id')
      }

      const breakdown = breakdownRows[0]

      const stockedByGrade = await getBaleStockedByGrade(conn, normalizedBalePurchaseId)

      const totalsByGrade = {
        premium: Number(breakdown.premium_items) || 0,
        standard: Number(breakdown.standard_items) || 0
      }
      const pendingByGrade = {
        premium: Math.max(totalsByGrade.premium - stockedByGrade.premium, 0),
        standard: Math.max(totalsByGrade.standard - stockedByGrade.standard, 0)
      }
      const pendingForRequestedGrade = pendingByGrade[normalizedConditionGrade]
      const gradeLabel = normalizedConditionGrade === 'premium' ? 'Premium' : 'Standard'

      if (pendingForRequestedGrade <= 0) {
        throw createHttpError(400, `No more ${gradeLabel} quantity available for this bale record.`)
      }
      if (requestedBaleQuantity > pendingForRequestedGrade) {
        throw createHttpError(400, `Requested ${gradeLabel} quantity (${requestedBaleQuantity}) exceeds available (${pendingForRequestedGrade}).`)
      }

      normalizedSourceBreakdownId = Number(breakdown.breakdown_id) || null
      normalizedAllocatedCost = roundMoney(Number(breakdown.cost_per_saleable_item) || 0)
      normalizedCost = normalizedCostInput > 0 ? normalizedCostInput : normalizedAllocatedCost

      if (!normalizedCategoryId && breakdown.bale_category) {
        const resolvedCategory = await resolveOrCreateCategoryByName(conn, breakdown.bale_category)
        normalizedCategoryId = resolvedCategory?.categoryId || null
        if (!subcategory && resolvedCategory?.typeName) {
          normalizedSubcategoryInput = resolvedCategory.typeName
        }
      }

      normalizedDateEncoded = normalizeDateOnlyValue(breakdown.breakdown_event_date)

      stockInReference = `BALE_PRODUCT_CREATE|bale_purchase_id=${normalizedBalePurchaseId}|breakdown_id=${normalizedSourceBreakdownId || ''}|grade=${normalizedConditionGrade}`
      stockInReason = `Created from bale record (${gradeLabel})`
      normalizedProductSource = 'bale_breakdown'
    }

    if (normalizedProductSource === 'manual') {
      normalizedManualSupplierId = await resolveSupplierId(conn, supplier_id)
    }

    normalizedSubcategory = await normalizeCategoryType(conn, normalizedCategoryId, normalizedSubcategoryInput)
    if (!normalizedName) {
      normalizedName = normalizedSubcategory || await resolveCategoryNameById(conn, normalizedCategoryId) || ''
    }
    if (!normalizedName) {
      throw createHttpError(400, 'category or type is required when product name is not provided')
    }

    const shouldAttemptSimilarMerge = !requestedSku && !requestedBarcode
    const mergeDeltaQuantity = isBaleSourceCreate ? requestedBaleQuantity : normalizedStockQuantity

    if (shouldAttemptSimilarMerge && mergeDeltaQuantity > 0) {
      const mergeCandidate = await findSimilarProductForMerge(conn, {
        name: normalizedName,
        brand: normalizedBrand,
        size: normalizedSize,
        categoryId: normalizedCategoryId,
        subcategory: normalizedSubcategory,
        productSource: normalizedProductSource,
        balePurchaseId: normalizedBalePurchaseId,
        conditionGrade: normalizedConditionGrade,
        price: normalizedPrice
      })

      if (mergeCandidate) {
        const mergeReference = isBaleSourceCreate ? stockInReference : 'PRODUCT_SIMILAR_MERGE'
        const mergeReason = isBaleSourceCreate
          ? stockInReason
          : 'Quantity adjusted from similar product create'

        const stockResult = await applyProductStockDelta(conn, {
          productId: mergeCandidate.id,
          deltaQuantity: mergeDeltaQuantity,
          supplierId: normalizedManualSupplierId,
          userId: req.auth.id,
          reference: mergeReference,
          reason: mergeReason,
          createdAt: stockInCreatedAt,
          transactionType: 'IN'
        })

        const [mergedRows] = await conn.query(
          `SELECT id, sku, name, brand, description, category_id, subcategory, price, cost, stock_quantity, low_stock_threshold, size, color, barcode, is_active, qr_image_path, product_source, source_breakdown_id, bale_purchase_id, condition_grade
           FROM products
           WHERE id = ?
           LIMIT 1`,
          [mergeCandidate.id]
        )
        const mergedProduct = mergedRows[0] || mergeCandidate

        await conn.commit()

        await logAuditEventSafe(db.pool, {
          userId: req.auth.id,
          action: 'PRODUCT_QUANTITY_ADJUSTED',
          resourceType: 'Product',
          resourceId: mergeCandidate.id,
          details: {
            module: 'catalog',
            severity: 'low',
            result: 'adjusted',
            target_label: mergedProduct?.sku ? `${mergedProduct.name} (${mergedProduct.sku})` : mergedProduct?.name,
            summary: `Adjusted quantity for "${mergedProduct?.name || normalizedName}" by ${mergeDeltaQuantity}`,
            before: { stock_quantity: stockResult.beforeQuantity },
            after: { stock_quantity: stockResult.afterQuantity },
            metrics: { quantity_adjusted: mergeDeltaQuantity },
            context: {
              merged_from_create: true,
              product_source: normalizedProductSource,
              bale_purchase_id: normalizedBalePurchaseId,
              condition_grade: normalizedConditionGrade
            }
          }
        })

        return res.json({
          id: mergeCandidate.id,
          barcode: mergedProduct?.barcode || null,
          qr_image_path: mergedProduct?.qr_image_path || null,
          merged: true,
          adjusted_quantity: mergeDeltaQuantity,
          stock_quantity: stockResult.afterQuantity
        })
      }
    }

    const shouldRecordManualInitialStock = normalizedProductSource === 'manual'
      && normalizedManualSupplierId
      && normalizedStockQuantity > 0
    const insertStockQuantity = shouldRecordManualInitialStock ? 0 : normalizedStockQuantity

    const [result] = await conn.query(
      `INSERT INTO products (
        sku, name, brand, description, category_id, subcategory, price, cost, stock_quantity,
        low_stock_threshold, size, color, barcode, product_source, source_breakdown_id,
        bale_purchase_id, condition_grade, allocated_cost, status, date_encoded
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        normalizedSku,
        normalizedName,
        normalizedBrand,
        normalizedDescription,
        normalizedCategoryId,
        normalizedSubcategory,
        normalizedPrice || 0,
        normalizedCost || 0,
        insertStockQuantity,
        normalizedLowStockThreshold,
        normalizedSize,
        normalizedColor,
        normalizedBarcode,
        normalizedProductSource,
        normalizedSourceBreakdownId,
        normalizedBalePurchaseId,
        normalizedConditionGrade,
        normalizedAllocatedCost || 0,
        'available',
        normalizedDateEncoded
      ]
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

    if (isBaleSourceCreate) {
      await applyProductStockDelta(conn, {
        productId: result.insertId,
        deltaQuantity: requestedBaleQuantity,
        userId: req.auth.id,
        reference: stockInReference,
        reason: stockInReason,
        createdAt: stockInCreatedAt,
        transactionType: 'IN'
      })
    } else if (shouldRecordManualInitialStock) {
      await applyProductStockDelta(conn, {
        productId: result.insertId,
        deltaQuantity: normalizedStockQuantity,
        supplierId: normalizedManualSupplierId,
        userId: req.auth.id,
        reference: 'PRODUCT_CREATE_INITIAL_STOCK',
        reason: 'Initial manual stock from product create',
        createdAt: new Date(),
        transactionType: 'IN'
      })
    }

    const [createdRows] = await conn.query(
      `SELECT id, sku, name, brand, description, category_id, subcategory, price, cost, stock_quantity, low_stock_threshold, size, color, barcode, is_active, product_source, source_breakdown_id, bale_purchase_id, condition_grade
       FROM products
       WHERE id = ?
       LIMIT 1`,
      [result.insertId]
    )
    const createdProduct = createdRows[0] || null

    await conn.commit()

    await logAuditEventSafe(db.pool, {
      userId: req.auth.id,
      action: 'PRODUCT_CREATED',
      resourceType: 'Product',
      resourceId: result.insertId,
      details: {
        module: 'catalog',
        severity: 'medium',
        result: 'success',
        target_label: createdProduct?.sku ? `${createdProduct.name} (${createdProduct.sku})` : createdProduct?.name,
        summary: `Added product "${createdProduct?.name || normalizedName}"`,
        after: createdProduct
      }
    })

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
    await ensureAutomatedReportsSchema()
    await conn.beginTransaction()
    await ensureScannerSchema(conn)

    const id = Number(req.params.id)
    if (!Number.isFinite(id) || id <= 0) throw createHttpError(400, 'invalid product id')

    const [existingRows] = await conn.query(
      `SELECT id, sku, name, brand, description, category_id, subcategory, price, cost, stock_quantity, low_stock_threshold, size, color, barcode, is_active, qr_image_path, product_source, source_breakdown_id, bale_purchase_id, condition_grade
       FROM products
       WHERE id = ?
       LIMIT 1
       FOR UPDATE`,
      [id]
    )
    if (!existingRows.length) throw createHttpError(404, 'product not found')
    const beforeProduct = { ...existingRows[0] }
    const existingProductSource = String(beforeProduct.product_source || 'manual').trim().toLowerCase() || 'manual'

    const {
      sku,
      name,
      brand,
      description,
      category_id,
      subcategory,
      price,
      cost,
      stock_quantity,
      low_stock_threshold,
      size,
      color,
      barcode,
      is_active,
      product_source,
      source_breakdown_id,
      bale_purchase_id,
      condition_grade
    } = req.body || {}

    if (
      product_source !== undefined
      || source_breakdown_id !== undefined
      || bale_purchase_id !== undefined
      || condition_grade !== undefined
    ) {
      throw createHttpError(400, 'Product type and bale source link cannot be changed after creation.')
    }

    if (stock_quantity !== undefined && existingProductSource !== 'manual') {
      const sourceLabel = existingProductSource === 'repaired_damage'
        ? 'received repaired'
        : 'bale-linked'
      throw createHttpError(400, `Stock quantity for ${sourceLabel} products is managed by its dedicated intake flow.`)
    }

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
    const nextCategoryId = category_id !== undefined
      ? (category_id ? Number(category_id) : null)
      : (beforeProduct.category_id ? Number(beforeProduct.category_id) : null)
    if (category_id !== undefined) {
      if (nextCategoryId !== null && (!Number.isInteger(nextCategoryId) || nextCategoryId <= 0)) {
        throw createHttpError(400, 'category_id must be a valid positive integer')
      }
      updates.push('category_id = ?')
      params.push(nextCategoryId)
    }
    const categoryChanged = category_id !== undefined && String(nextCategoryId || '') !== String(beforeProduct.category_id || '')
    if (subcategory !== undefined || categoryChanged) {
      updates.push('subcategory = ?')
      params.push(await normalizeCategoryType(conn, nextCategoryId, subcategory !== undefined ? subcategory : ''))
    }
    if (price !== undefined) { updates.push('price = ?'); params.push(price) }
    if (cost !== undefined) { updates.push('cost = ?'); params.push(cost) }
    if (stock_quantity !== undefined) {
      const parsedStockQuantity = Number(stock_quantity)
      if (!Number.isFinite(parsedStockQuantity) || parsedStockQuantity < 0) {
        throw createHttpError(400, 'stock_quantity must be zero or greater')
      }
      updates.push('stock_quantity = ?')
      params.push(Math.floor(parsedStockQuantity))
    }
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

    const [updatedRows] = await conn.query(
      `SELECT id, sku, name, brand, description, category_id, subcategory, price, cost, stock_quantity, low_stock_threshold, size, color, barcode, is_active, product_source, source_breakdown_id, bale_purchase_id, condition_grade
       FROM products
       WHERE id = ?
       LIMIT 1`,
      [id]
    )
    const updatedProduct = updatedRows[0] || null

    await conn.commit()

    await logAuditEventSafe(db.pool, {
      userId: req.auth.id,
      action: 'PRODUCT_UPDATED',
      resourceType: 'Product',
      resourceId: id,
      details: {
        module: 'catalog',
        severity: 'medium',
        result: 'adjusted',
        target_label: updatedProduct?.sku ? `${updatedProduct.name} (${updatedProduct.sku})` : updatedProduct?.name,
        summary: `Updated product "${updatedProduct?.name || beforeProduct?.name || id}"`,
        before: beforeProduct,
        after: updatedProduct
      }
    })

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
    await ensureAutomatedReportsSchema()
    const id = Number(req.params.id)
    const [beforeRows] = await db.pool.query(
      `SELECT id, sku, name, brand, description, category_id, subcategory, price, cost, stock_quantity, low_stock_threshold, size, color, barcode, is_active, product_source, source_breakdown_id
       FROM products
       WHERE id = ?
       LIMIT 1`,
      [id]
    )
    if (!beforeRows.length) return res.status(404).json({ error: 'product not found' })

    await db.pool.query('DELETE FROM products WHERE id = ?', [id])

    await logAuditEventSafe(db.pool, {
      userId: req.auth.id,
      action: 'PRODUCT_DELETED',
      resourceType: 'Product',
      resourceId: id,
      details: {
        module: 'catalog',
        severity: 'high',
        result: 'reversed',
        target_label: beforeRows[0].sku ? `${beforeRows[0].name} (${beforeRows[0].sku})` : beforeRows[0].name,
        summary: `Deleted product "${beforeRows[0].name}"`,
        before: beforeRows[0]
      }
    })

    res.json({ success: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'failed to delete product' })
  }
})

module.exports = router
