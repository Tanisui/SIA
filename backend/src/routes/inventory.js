const express = require('express')
const router = express.Router()
const db = require('../database')
const { verifyToken, authorize } = require('../middleware/authMiddleware')
const { logAuditEventSafe } = require('../utils/auditLog')
const { ensureAutomatedReportsSchema } = require('../utils/automatedReports')
const { applyProductStockDelta } = require('../utils/inventoryStock')
const {
  normalizeBarcode,
  isBarcodeBlank,
  validateBarcodeFormat,
  barcodeExists,
  getNextSequentialBarcode,
  getNextSequentialSKU
} = require('../utils/barcodeSupport')
const { ensureScannerSchema } = require('../services/scannerSchemaService')
const { generateProductQrImage } = require('../services/qrCodeService')
const { updateProductQrImagePath } = require('../repositories/productRepository')

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const BARCODE_FORMAT_ERROR = 'barcode must be 4-64 chars using letters, numbers, ".", "_" or "-"'
const DAMAGE_SOURCE_TYPES = new Set(['bale_breakdown', 'manual_damage', 'sales_return'])

function normalizeDateOnly(value, label) {
  if (!value) return null
  const normalized = String(value).trim()
  if (!DATE_PATTERN.test(normalized)) {
    const err = new Error(`${label} must use YYYY-MM-DD format`)
    err.statusCode = 400
    throw err
  }
  return normalized
}

function buildDateFilter(alias, column, from, to, params) {
  let sql = ''
  if (from) {
    sql += ` AND ${alias}.${column} >= ?`
    params.push(from)
  }
  if (to) {
    sql += ` AND ${alias}.${column} < DATE_ADD(?, INTERVAL 1 DAY)`
    params.push(to)
  }
  return sql
}

function roundMoney(value) {
  return Math.round((Number(value) || 0) * 100) / 100
}

function toWholeNumber(value) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return 0
  return Math.max(0, Math.trunc(parsed))
}

function formatDateOnly(value = new Date()) {
  return new Date(value).toISOString().slice(0, 10)
}

function createHttpError(statusCode, message) {
  const err = new Error(message)
  err.statusCode = statusCode
  return err
}

async function resolveCategoryIdByName(conn, categoryName) {
  const normalized = String(categoryName || '').trim()
  if (!normalized) return null

  const [rows] = await conn.query(`
    SELECT id
    FROM categories
    WHERE LOWER(TRIM(name)) = LOWER(TRIM(?))
    LIMIT 1
  `, [normalized])

  return Number(rows?.[0]?.id) || null
}

async function createInventoryProductRecord(conn, options) {
  let normalizedSku = String(options?.sku || '').trim() || null
  if (!normalizedSku) {
    normalizedSku = await getNextSequentialSKU(conn)
  }

  let normalizedBarcode = null
  if (!isBarcodeBlank(options?.barcode)) {
    normalizedBarcode = normalizeBarcode(options.barcode)
    if (!validateBarcodeFormat(normalizedBarcode)) throw createHttpError(400, BARCODE_FORMAT_ERROR)
    if (await barcodeExists(conn, normalizedBarcode)) throw createHttpError(400, 'Barcode already exists')
  }

  const normalizedCategoryId = Number(options?.categoryId)
  if (!Number.isInteger(normalizedCategoryId) || normalizedCategoryId <= 0) {
    throw createHttpError(400, 'category_id must be a valid positive integer')
  }

  const normalizedPrice = roundMoney(options?.price)
  if (normalizedPrice <= 0) {
    throw createHttpError(400, 'price must be greater than 0')
  }

  const normalizedLowStockThreshold = Number.isFinite(Number(options?.lowStockThreshold))
    ? Math.max(0, Number(options.lowStockThreshold))
    : 0
  const normalizedCost = Number.isFinite(Number(options?.cost))
    ? roundMoney(options.cost)
    : 0
  const normalizedSource = String(options?.productSource || 'manual').trim().toLowerCase() || 'manual'

  const [result] = await conn.query(`
    INSERT INTO products (
      sku, name, brand, description, category_id, price, cost, stock_quantity,
      low_stock_threshold, size, color, barcode, product_source, source_breakdown_id,
      bale_purchase_id, condition_grade, allocated_cost, status, date_encoded
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    normalizedSku,
    String(options?.name || '').trim(),
    String(options?.brand || '').trim() || null,
    String(options?.description || '').trim() || null,
    normalizedCategoryId,
    normalizedPrice,
    normalizedCost,
    0,
    normalizedLowStockThreshold,
    String(options?.size || '').trim() || null,
    null,
    normalizedBarcode,
    normalizedSource,
    options?.sourceBreakdownId ? Number(options.sourceBreakdownId) : null,
    options?.balePurchaseId ? Number(options.balePurchaseId) : null,
    String(options?.conditionGrade || '').trim().toLowerCase() || null,
    normalizedCost,
    'sold',
    options?.dateEncoded || formatDateOnly()
  ])

  if (!normalizedBarcode) {
    normalizedBarcode = await getNextSequentialBarcode(conn)
    await conn.query('UPDATE products SET barcode = ? WHERE id = ?', [normalizedBarcode, result.insertId])
  }

  const qrAsset = await generateProductQrImage({
    productId: result.insertId,
    code: normalizedBarcode || normalizedSku
  })
  await updateProductQrImagePath(conn, result.insertId, qrAsset.publicPath)

  const [createdRows] = await conn.query(`
    SELECT id, sku, name, brand, description, category_id, price, cost, stock_quantity,
           low_stock_threshold, size, color, barcode, is_active, product_source,
           source_breakdown_id, bale_purchase_id, condition_grade, qr_image_path
    FROM products
    WHERE id = ?
    LIMIT 1
  `, [result.insertId])

  return {
    product: createdRows[0] || null,
    barcode: normalizedBarcode,
    qrImagePath: qrAsset.publicPath
  }
}

function getInventoryTransactionSourceMeta(row) {
  const transactionType = String(row?.transaction_type || '').trim().toUpperCase()
  const reference = String(row?.reference || '').trim()
  const reason = String(row?.reason || '').trim()

  if (transactionType === 'IN') {
    if (/^BALE_BREAKDOWN\|/i.test(reference)) {
      return { source_type: 'bale_breakdown', source_label: 'Bale Breakdown' }
    }
    if (/^DAMAGE_REPAIR\|/i.test(reference)) {
      return { source_type: 'damage_repair', source_label: 'Damage Repair' }
    }
    return { source_type: 'manual_stock_in', source_label: 'Manual Stock In' }
  }

  if (transactionType === 'OUT') {
    if (/^STOCK_OUT\|disposition=DAMAGE/i.test(reference) && /(?:^|\|)receipt=/i.test(reference)) {
      return { source_type: 'sales_return', source_label: 'Sales Return' }
    }
    if (/^STOCK_OUT:DAMAGE/i.test(reason)) {
      return { source_type: 'manual_damage', source_label: 'Manual Damage' }
    }
    if (/^STOCK_OUT:SHRINKAGE/i.test(reason)) {
      return { source_type: 'manual_shrinkage', source_label: 'Manual Shrinkage' }
    }
  }

  if (transactionType === 'RETURN' && /^SALE_RETURN\|/i.test(reference)) {
    return { source_type: 'sales_return', source_label: 'Sales Return' }
  }

  return { source_type: 'inventory', source_label: 'Inventory' }
}

async function getDamageRepairCountMap(conn) {
  const [rows] = await conn.query(`
    SELECT damage_source_type, damage_source_id, COALESCE(SUM(quantity), COUNT(*)) AS repaired_quantity
    FROM damage_repair_events
    GROUP BY damage_source_type, damage_source_id
  `)

  const counts = new Map()
  for (const row of rows) {
    counts.set(
      `${String(row.damage_source_type || '').trim().toLowerCase()}:${Number(row.damage_source_id) || 0}`,
      Number(row.repaired_quantity) || 0
    )
  }
  return counts
}

function mapResolvedDamageSource(row, repairedQuantity = 0) {
  const originalQuantity = toWholeNumber(row?.quantity)
  const repaired = Math.min(originalQuantity, toWholeNumber(repairedQuantity))
  const remaining = Math.max(originalQuantity - repaired, 0)

  return {
    ...row,
    original_quantity: originalQuantity,
    repaired_quantity: repaired,
    remaining_quantity: remaining,
    repair_allowed: remaining > 0
  }
}

async function loadTransactionDamageSource(conn, transactionId) {
  const [rows] = await conn.query(`
    SELECT
      it.id,
      it.created_at,
      it.product_id,
      ABS(it.quantity) AS quantity,
      it.reason,
      it.reference,
      p.name AS product_name,
      p.sku,
      p.brand,
      p.description,
      p.category_id,
      c.name AS category_name,
      p.price,
      p.cost,
      p.low_stock_threshold,
      p.size,
      p.bale_purchase_id,
      p.source_breakdown_id,
      p.condition_grade,
      u.username AS reported_by_name
    FROM inventory_transactions it
    LEFT JOIN products p ON p.id = it.product_id
    LEFT JOIN categories c ON c.id = p.category_id
    LEFT JOIN users u ON u.id = it.user_id
    WHERE it.id = ?
      AND it.transaction_type = 'OUT'
      AND (
        it.reason LIKE 'STOCK_OUT:DAMAGE%'
        OR it.reference LIKE 'STOCK_OUT|disposition=DAMAGE%'
      )
    LIMIT 1
  `, [Number(transactionId)])

  const row = rows[0]
  if (!row) return null

  const sourceMeta = getInventoryTransactionSourceMeta({
    transaction_type: 'OUT',
    reference: row.reference,
    reason: row.reason
  })

  if (sourceMeta.source_type !== 'manual_damage' && sourceMeta.source_type !== 'sales_return') {
    return null
  }

  const productName = String(row.product_name || '').trim()
  const suggestedName = productName || 'Repaired Item'
  return {
    ...row,
    source_type: sourceMeta.source_type,
    source_label: sourceMeta.source_label,
    damage_source_type: sourceMeta.source_type,
    damage_source_id: Number(row.id),
    suggested_name: suggestedName,
    brand: String(row.brand || '').trim() || null,
    description: String(row.description || '').trim() || null,
    category_id: row.category_id ? Number(row.category_id) : null,
    category_name: String(row.category_name || '').trim() || null,
    price: roundMoney(row.price),
    default_cost: roundMoney(row.cost),
    low_stock_threshold: Number.isFinite(Number(row.low_stock_threshold))
      ? Math.max(0, Number(row.low_stock_threshold))
      : 0,
    size: String(row.size || '').trim() || null
  }
}

async function loadBaleBreakdownDamageSource(conn, breakdownId) {
  const [rows] = await conn.query(`
    SELECT
      bb.id,
      COALESCE(bb.breakdown_date, bp.purchase_date) AS created_at,
      NULL AS product_id,
      COALESCE(bb.damaged_items, 0) AS quantity,
      'Auto-recorded from bale breakdown' AS reason,
      CONCAT('BALE_BREAKDOWN|bale_purchase_id=', bp.id, '|breakdown_id=', bb.id, '|disposition=DAMAGE') AS reference,
      CONCAT('Bale Batch ', bp.bale_batch_no, ' - Damaged / Unsellable') AS product_name,
      NULL AS sku,
      u.username AS reported_by_name,
      bp.id AS bale_purchase_record_id,
      bp.bale_batch_no,
      bp.supplier_name,
      bp.bale_category,
      COALESCE(bb.cost_per_saleable_item, 0) AS cost_per_saleable_item
    FROM bale_breakdowns bb
    JOIN bale_purchases bp ON bp.id = bb.bale_purchase_id
    LEFT JOIN users u ON u.id = bb.encoded_by
    WHERE bb.id = ?
      AND COALESCE(bb.damaged_items, 0) > 0
    LIMIT 1
  `, [Number(breakdownId)])

  const row = rows[0]
  if (!row) return null

  const categoryName = String(row.bale_category || '').trim() || null
  const categoryId = await resolveCategoryIdByName(conn, categoryName)
  const batchNo = String(row.bale_batch_no || '').trim()
  const suggestedName = batchNo ? `${batchNo} - Repaired Item` : 'Repaired Bale Item'
  const descriptionParts = ['Repaired from damaged bale breakdown item.']
  if (batchNo) descriptionParts.push(`Batch: ${batchNo}.`)
  if (row.supplier_name) descriptionParts.push(`Supplier: ${row.supplier_name}.`)
  if (categoryName) descriptionParts.push(`Category: ${categoryName}.`)

  return {
    ...row,
    source_type: 'bale_breakdown',
    source_label: 'Bale Breakdown',
    damage_source_type: 'bale_breakdown',
    damage_source_id: Number(row.id),
    suggested_name: suggestedName,
    brand: null,
    description: descriptionParts.join(' '),
    category_id: categoryId,
    category_name: categoryName,
    price: roundMoney(row.cost_per_saleable_item),
    default_cost: roundMoney(row.cost_per_saleable_item),
    low_stock_threshold: 0,
    size: null,
    bale_purchase_id: Number(row.bale_purchase_record_id) || null,
    source_breakdown_id: Number(row.id) || null
  }
}

async function resolveDamageSourceRecord(conn, sourceType, sourceId, repairCountMap = null) {
  const normalizedType = String(sourceType || '').trim().toLowerCase()
  const normalizedSourceId = Number(sourceId)
  if (!DAMAGE_SOURCE_TYPES.has(normalizedType)) {
    throw createHttpError(400, 'damage_source_type must be bale_breakdown, manual_damage, or sales_return')
  }
  if (!Number.isInteger(normalizedSourceId) || normalizedSourceId <= 0) {
    throw createHttpError(400, 'damage_source_id must be a valid positive integer')
  }

  let resolved = null
  if (normalizedType === 'bale_breakdown') {
    resolved = await loadBaleBreakdownDamageSource(conn, normalizedSourceId)
  } else {
    resolved = await loadTransactionDamageSource(conn, normalizedSourceId)
    if (resolved && resolved.source_type !== normalizedType) {
      resolved = null
    }
  }

  if (!resolved) {
    throw createHttpError(404, 'damage source not found')
  }

  const counts = repairCountMap || await getDamageRepairCountMap(conn)
  const repairedQuantity = counts.get(`${normalizedType}:${normalizedSourceId}`) || 0
  return mapResolvedDamageSource(resolved, repairedQuantity)
}

// ─── List all inventory transactions (Allow products.view to see history) ───
router.get('/transactions', verifyToken, authorize(['inventory.view', 'products.view']), async (req, res) => {
  try {
    const { type, product_id, source } = req.query
    const from = normalizeDateOnly(req.query.from, 'from')
    const to = normalizeDateOnly(req.query.to, 'to')
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
    sql += buildDateFilter('it', 'created_at', from, to, params)
    sql += ' ORDER BY it.created_at DESC'
    const [rows] = await db.pool.query(sql, params)
    const mappedRows = rows
      .map((row) => ({
        ...row,
        ...getInventoryTransactionSourceMeta(row)
      }))
      .filter((row) => !source || row.source_type === String(source).trim())

    res.json(mappedRows)
  } catch (err) {
    console.error(err)
    res.status(err?.statusCode || 500).json({ error: err?.message || 'failed to fetch transactions' })
  }
})

// ─── Bale Stock In Options ───
router.get('/stock-in/bale-options', verifyToken, authorize('inventory.receive'), async (req, res) => {
  try {
    await ensureAutomatedReportsSchema()
    const from = normalizeDateOnly(req.query.from, 'from')
    const to = normalizeDateOnly(req.query.to, 'to')
    const includeAll = String(req.query.include_all || '').trim() === '1'
    const params = []

    let sql = `
      SELECT
        bb.id AS breakdown_id,
        bb.bale_purchase_id,
        bp.bale_batch_no,
        bp.supplier_name,
        bp.purchase_date,
        bb.breakdown_date,
        COALESCE(bb.cost_per_saleable_item, 0) AS cost_per_saleable_item,
        COALESCE(bb.premium_items, 0) AS premium_items,
        COALESCE(bb.standard_items, 0) AS standard_items,
        COALESCE(bb.damaged_items, 0) AS damaged_items,
        COALESCE(pg.premium_stocked, 0) AS premium_stocked,
        COALESCE(pg.standard_stocked, 0) AS standard_stocked,
        COALESCE(pg.premium_ready, 0) AS premium_ready,
        COALESCE(pg.standard_ready, 0) AS standard_ready
      FROM bale_breakdowns bb
      JOIN bale_purchases bp ON bp.id = bb.bale_purchase_id
      LEFT JOIN (
        SELECT
          p.bale_purchase_id,
          SUM(
            CASE
              WHEN p.condition_grade = 'premium'
                THEN COALESCE(NULLIF(bale_create.stocked_units, 0), 1)
              ELSE 0
            END
          ) AS premium_stocked,
          SUM(
            CASE
              WHEN p.condition_grade = 'standard'
                THEN COALESCE(NULLIF(bale_create.stocked_units, 0), 1)
              ELSE 0
            END
          ) AS standard_stocked,
          SUM(
            CASE
              WHEN p.condition_grade = 'premium' AND COALESCE(p.is_active, 1) = 1
                THEN GREATEST(COALESCE(p.stock_quantity, 0), 0)
              ELSE 0
            END
          ) AS premium_ready,
          SUM(
            CASE
              WHEN p.condition_grade = 'standard' AND COALESCE(p.is_active, 1) = 1
                THEN GREATEST(COALESCE(p.stock_quantity, 0), 0)
              ELSE 0
            END
          ) AS standard_ready
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
        WHERE p.bale_purchase_id IS NOT NULL
          AND p.condition_grade IN ('premium', 'standard')
        GROUP BY p.bale_purchase_id
      ) pg ON pg.bale_purchase_id = bb.bale_purchase_id
      WHERE 1=1
    `

    sql += buildDateFilter('bb', 'breakdown_date', from, to, params)
    sql += ' ORDER BY COALESCE(bb.breakdown_date, bp.purchase_date) DESC, bb.id DESC'

    const [rows] = await db.pool.query(sql, params)
    const mapped = rows
      .map((row) => {
        const premiumTotal = Number(row.premium_items) || 0
        const standardTotal = Number(row.standard_items) || 0
        const premiumStocked = Number(row.premium_stocked) || 0
        const standardStocked = Number(row.standard_stocked) || 0
        const premiumReady = Number(row.premium_ready) || 0
        const standardReady = Number(row.standard_ready) || 0
        const pendingPremium = Math.max(premiumTotal - premiumStocked, 0)
        const pendingStandard = Math.max(standardTotal - standardStocked, 0)
        const saleableTotal = premiumTotal + standardTotal
        const stockedTotal = premiumStocked + standardStocked
        const readyTotal = premiumReady + standardReady
        const pendingTotal = pendingPremium + pendingStandard

        return {
          ...row,
          premium_total: premiumTotal,
          standard_total: standardTotal,
          saleable_total: saleableTotal,
          premium_stocked: premiumStocked,
          standard_stocked: standardStocked,
          stocked_total: stockedTotal,
          premium_ready: premiumReady,
          standard_ready: standardReady,
          ready_for_product_management: readyTotal,
          pending_premium: pendingPremium,
          pending_standard: pendingStandard,
          pending_total: pendingTotal,
          left_to_stock_in: pendingTotal
        }
      })
      .filter((row) => includeAll || row.pending_total > 0)

    res.json(mapped)
  } catch (err) {
    console.error(err)
    res.status(err?.statusCode || 500).json({ error: err?.message || 'failed to load bale stock-in options' })
  }
})

// ─── Bale Stock In: disabled to enforce detailed one-by-one product entry ───
router.post('/stock-in/bale', express.json(), verifyToken, authorize('inventory.receive'), async (req, res) => {
  const balePurchaseId = Number(req.body?.bale_purchase_id)
  if (!Number.isInteger(balePurchaseId) || balePurchaseId <= 0) {
    return res.status(400).json({ error: 'bale_purchase_id must be a valid positive integer' })
  }

  return res.status(400).json({
    error: 'Automatic bale stock-in is disabled. Create products one by one from Product Management with full details.'
  })
})

// ─── Stock In: Direct Purchase ───
router.post('/stock-in', express.json(), verifyToken, authorize('inventory.receive'), async (req, res) => {
  const conn = await db.pool.getConnection()
  try {
    await ensureAutomatedReportsSchema()
    await conn.beginTransaction()
    const { product_id, quantity, cost, reference, supplier_id, date } = req.body
    if (!product_id || !quantity || quantity <= 0) return res.status(400).json({ error: 'product_id and positive quantity required' })
    if (supplier_id) {
      await conn.rollback(); conn.release()
      return res.status(400).json({ error: 'Direct stock-in does not accept supplier details. Record supplier activity outside this inventory flow.' })
    }

    const stockResult = await applyProductStockDelta(conn, {
      productId: product_id,
      deltaQuantity: quantity,
      cost,
      userId: req.auth.id,
      reference: reference || null,
      reason: 'Manual stock in',
      createdAt: date || new Date(),
      transactionType: 'IN',
      disallowedProductSources: ['bale_breakdown', 'repaired_damage'],
      disallowedSourceMessage: 'Stock for bale breakdown and repaired-damage products is managed through their dedicated creation flow.'
    })

    await logAuditEventSafe(conn, {
      userId: req.auth.id,
      action: 'INVENTORY_STOCK_IN',
      resourceType: 'Product',
      resourceId: product_id,
      details: {
        module: 'inventory',
        severity: 'low',
        target_label: stockResult.product.sku ? `${stockResult.product.name} (${stockResult.product.sku})` : stockResult.product.name,
        summary: `Recorded stock in for ${stockResult.product.name}`,
        before: { stock_quantity: stockResult.beforeQuantity, cost: stockResult.beforeCost },
        after: { stock_quantity: stockResult.afterQuantity, cost: stockResult.afterCost },
        metrics: { quantity_received: Number(quantity) || 0 },
        references: { reference: reference || null }
      }
    })
    await conn.commit()
    conn.release()
    res.json({ success: true, new_quantity: stockResult.afterQuantity })
  } catch (err) {
    await conn.rollback()
    conn.release()
    console.error(err)
    res.status(err?.statusCode || 500).json({ error: err?.message || 'stock-in failed' })
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

    const [prod] = await conn.query('SELECT stock_quantity, name, sku FROM products WHERE id = ? FOR UPDATE', [product_id])
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
    const [transactionResult] = await conn.query(
      `INSERT INTO inventory_transactions (product_id, transaction_type, quantity, reference, user_id, reason, balance_after)
       VALUES (?, 'OUT', ?, ?, ?, ?, ?)`,
      [product_id, -qtyToRemove, reference || null, req.auth.id, fullReason, newQty]
    )

    await logAuditEventSafe(conn, {
      userId: req.auth.id,
      action: 'INVENTORY_SHRINKAGE_OUT',
      resourceType: 'Product',
      resourceId: product_id,
      details: {
        module: 'inventory',
        severity: 'high',
        target_label: prod[0].sku ? `${prod[0].name} (${prod[0].sku})` : prod[0].name,
        summary: `Recorded shrinkage for ${prod[0].name}`,
        reason: reason || 'Shrinkage/manual adjustment',
        before: { stock_quantity: currentQty },
        after: { stock_quantity: newQty },
        metrics: { quantity_removed: qtyToRemove },
        references: { transaction_id: transactionResult.insertId, reference: reference || null, employee_id: employee_id || null }
      }
    })
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

    const [prod] = await conn.query('SELECT stock_quantity, name, sku FROM products WHERE id = ? FOR UPDATE', [product_id])
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
    const [transactionResult] = await conn.query(
      `INSERT INTO inventory_transactions (product_id, transaction_type, quantity, reference, user_id, reason, balance_after)
       VALUES (?, 'OUT', ?, ?, ?, ?, ?)`,
      [product_id, -qtyToRemove, reference || null, req.auth.id, fullReason, newQty]
    )

    await logAuditEventSafe(conn, {
      userId: req.auth.id,
      action: 'INVENTORY_DAMAGE_OUT',
      resourceType: 'Product',
      resourceId: product_id,
      details: {
        module: 'inventory',
        severity: 'high',
        target_label: prod[0].sku ? `${prod[0].name} (${prod[0].sku})` : prod[0].name,
        summary: `Recorded damaged stock for ${prod[0].name}`,
        reason: reason || 'Damaged/defective stock',
        before: { stock_quantity: currentQty },
        after: { stock_quantity: newQty },
        metrics: { quantity_removed: qtyToRemove },
        references: { transaction_id: transactionResult.insertId, reference: reference || null, employee_id: employee_id || null }
      }
    })
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
    await ensureAutomatedReportsSchema()
    const source = String(req.query.source || '').trim().toLowerCase()
    const from = normalizeDateOnly(req.query.from, 'from')
    const to = normalizeDateOnly(req.query.to, 'to')
    const repairCounts = await getDamageRepairCountMap(db.pool)

    const transactionParams = []
    const transactionDateFilter = buildDateFilter('it', 'created_at', from, to, transactionParams)
    const [transactionRows] = await db.pool.query(`
      SELECT
        it.id,
        it.created_at,
        it.product_id,
        ABS(it.quantity) AS quantity,
        it.reason,
        it.reference,
        p.name AS product_name,
        p.sku,
        p.brand,
        p.description,
        p.category_id,
        c.name AS category_name,
        p.price,
        p.cost AS default_cost,
        p.low_stock_threshold,
        p.size,
        p.bale_purchase_id,
        p.source_breakdown_id,
        p.condition_grade,
        u.username AS reported_by_name
      FROM inventory_transactions it
      LEFT JOIN products p ON p.id = it.product_id
      LEFT JOIN categories c ON c.id = p.category_id
      LEFT JOIN users u ON u.id = it.user_id
      WHERE it.transaction_type = 'OUT'
        AND (
          it.reason LIKE 'STOCK_OUT:DAMAGE%'
          OR it.reference LIKE 'STOCK_OUT|disposition=DAMAGE%'
        )
        ${transactionDateFilter}
      ORDER BY it.created_at DESC
    `, transactionParams)

    const damagedTransactions = transactionRows
      .map((row) => {
        const sourceMeta = getInventoryTransactionSourceMeta({
          transaction_type: 'OUT',
          reference: row.reference,
          reason: row.reason
        })

        return mapResolvedDamageSource({
          ...row,
          record_key: `txn-${row.id}`,
          ...sourceMeta,
          damage_source_type: sourceMeta.source_type,
          damage_source_id: Number(row.id),
          suggested_name: String(row.product_name || '').trim() || 'Repaired Item',
          brand: String(row.brand || '').trim() || null,
          description: String(row.description || '').trim() || null,
          category_id: row.category_id ? Number(row.category_id) : null,
          category_name: String(row.category_name || '').trim() || null,
          price: roundMoney(row.price),
          default_cost: roundMoney(row.default_cost),
          low_stock_threshold: Number.isFinite(Number(row.low_stock_threshold))
            ? Math.max(0, Number(row.low_stock_threshold))
            : 0,
          size: String(row.size || '').trim() || null
        }, repairCounts.get(`${sourceMeta.source_type}:${Number(row.id)}`) || 0)
      })
      .filter((row) => row.source_type === 'sales_return' || row.source_type === 'manual_damage')

    const breakdownParams = []
    const breakdownDateFilter = buildDateFilter('x', 'event_date', from, to, breakdownParams)
    const [breakdownRows] = await db.pool.query(`
      SELECT
        bb.id,
        COALESCE(bb.breakdown_date, bp.purchase_date) AS created_at,
        NULL AS product_id,
        COALESCE(bb.damaged_items, 0) AS quantity,
        'Auto-recorded from bale breakdown' AS reason,
        CONCAT('BALE_BREAKDOWN|bale_purchase_id=', bp.id, '|breakdown_id=', bb.id, '|disposition=DAMAGE') AS reference,
        CONCAT('Bale Batch ', bp.bale_batch_no, ' - Damaged / Unsellable') AS product_name,
        NULL AS sku,
        u.username AS reported_by_name,
        bp.id AS bale_purchase_id,
        bb.id AS source_breakdown_id,
        bp.bale_batch_no,
        bp.supplier_name,
        bp.bale_category,
        c.id AS category_id,
        c.name AS category_name,
        COALESCE(bb.cost_per_saleable_item, 0) AS price,
        COALESCE(bb.cost_per_saleable_item, 0) AS default_cost,
        0 AS low_stock_threshold,
        NULL AS size,
        CONCAT(COALESCE(bp.bale_batch_no, 'Bale'), ' - Repaired Item') AS suggested_name,
        CONCAT(
          'Repaired from damaged bale breakdown item.',
          CASE WHEN bp.bale_batch_no IS NOT NULL AND TRIM(bp.bale_batch_no) <> '' THEN CONCAT(' Batch: ', bp.bale_batch_no, '.') ELSE '' END,
          CASE WHEN bp.supplier_name IS NOT NULL AND TRIM(bp.supplier_name) <> '' THEN CONCAT(' Supplier: ', bp.supplier_name, '.') ELSE '' END,
          CASE WHEN bp.bale_category IS NOT NULL AND TRIM(bp.bale_category) <> '' THEN CONCAT(' Category: ', bp.bale_category, '.') ELSE '' END
        ) AS description
      FROM bale_breakdowns bb
      JOIN bale_purchases bp ON bp.id = bb.bale_purchase_id
      LEFT JOIN users u ON u.id = bb.encoded_by
      LEFT JOIN categories c ON LOWER(TRIM(c.name)) = LOWER(TRIM(bp.bale_category))
      JOIN (
        SELECT
          bb2.id,
          COALESCE(bb2.breakdown_date, bp2.purchase_date) AS event_date
        FROM bale_breakdowns bb2
        JOIN bale_purchases bp2 ON bp2.id = bb2.bale_purchase_id
      ) x ON x.id = bb.id
      WHERE COALESCE(bb.damaged_items, 0) > 0
        ${breakdownDateFilter}
      ORDER BY created_at DESC, bb.id DESC
    `, breakdownParams)

    const damagedBreakdowns = breakdownRows.map((row) => mapResolvedDamageSource({
      ...row,
      record_key: `bale-${row.id}`,
      quantity: Number(row.quantity) || 0,
      source_type: 'bale_breakdown',
      source_label: 'Bale Breakdown',
      damage_source_type: 'bale_breakdown',
      damage_source_id: Number(row.id),
      brand: null,
      description: String(row.description || '').trim() || null,
      category_id: row.category_id ? Number(row.category_id) : null,
      category_name: String(row.category_name || '').trim() || String(row.bale_category || '').trim() || null,
      price: roundMoney(row.price),
      default_cost: roundMoney(row.default_cost),
      low_stock_threshold: 0,
      size: null,
      suggested_name: String(row.suggested_name || '').trim() || 'Repaired Bale Item'
    }, repairCounts.get(`bale_breakdown:${Number(row.id)}`) || 0))

    const rows = [...damagedTransactions, ...damagedBreakdowns]
      .filter((row) => !source || row.source_type === source)
      .sort((left, right) => new Date(right.created_at) - new Date(left.created_at))

    res.json(rows)
  } catch (err) {
    console.error(err)
    res.status(err?.statusCode || 500).json({ error: err?.message || 'failed to fetch damaged inventory' })
  }
})

// ─── Low stock alerts (Allow products.view to access) ───
router.post('/damaged/repair', express.json(), verifyToken, authorize('inventory.adjust'), async (req, res) => {
  const conn = await db.pool.getConnection()
  try {
    await ensureAutomatedReportsSchema()
    await ensureScannerSchema(conn)
    await conn.beginTransaction()

    const damageSourceType = String(req.body?.damage_source_type || '').trim().toLowerCase()
    const damageSourceId = Number(req.body?.damage_source_id)
    const repairCounts = await getDamageRepairCountMap(conn)
    const sourceRecord = await resolveDamageSourceRecord(conn, damageSourceType, damageSourceId, repairCounts)

    if (!sourceRecord.repair_allowed || Number(sourceRecord.remaining_quantity) <= 0) {
      throw createHttpError(400, 'No remaining damaged quantity is available to receive')
    }

    const normalizedName = String(req.body?.name ?? sourceRecord.suggested_name ?? '').trim()
    if (!normalizedName) throw createHttpError(400, 'name is required')

    const requestedCategoryId = req.body?.category_id !== undefined && req.body?.category_id !== ''
      ? Number(req.body.category_id)
      : Number(sourceRecord.category_id || 0)
    if (!Number.isInteger(requestedCategoryId) || requestedCategoryId <= 0) {
      throw createHttpError(400, 'category_id is required')
    }

    const requestedPrice = req.body?.price !== undefined && req.body?.price !== ''
      ? req.body.price
      : sourceRecord.price
    const normalizedPrice = roundMoney(requestedPrice)
    if (normalizedPrice <= 0) throw createHttpError(400, 'price must be greater than 0')

    const normalizedLowStockThreshold = req.body?.low_stock_threshold !== undefined && req.body?.low_stock_threshold !== ''
      ? Math.max(0, Number(req.body.low_stock_threshold))
      : Math.max(0, Number(sourceRecord.low_stock_threshold || 0))

    const normalizedBrand = String(req.body?.brand ?? sourceRecord.brand ?? '').trim()
    const normalizedDescription = String(req.body?.description ?? sourceRecord.description ?? '').trim()
    const normalizedSize = String(req.body?.size ?? sourceRecord.size ?? '').trim()
    const normalizedCost = roundMoney(sourceRecord.default_cost)
    const requestedQuantity = Number(req.body?.quantity)
    const normalizedQuantity = Number.isInteger(requestedQuantity)
      ? requestedQuantity
      : Math.trunc(Number(req.body?.quantity || 1))

    if (!Number.isInteger(normalizedQuantity) || normalizedQuantity <= 0) {
      throw createHttpError(400, 'quantity must be a positive whole number')
    }
    if (normalizedQuantity > Number(sourceRecord.remaining_quantity || 0)) {
      throw createHttpError(400, `quantity cannot exceed remaining damaged units (${Number(sourceRecord.remaining_quantity || 0)})`)
    }

    const created = await createInventoryProductRecord(conn, {
      sku: req.body?.sku,
      name: normalizedName,
      brand: normalizedBrand,
      description: normalizedDescription,
      categoryId: requestedCategoryId,
      price: normalizedPrice,
      cost: normalizedCost,
      lowStockThreshold: normalizedLowStockThreshold,
      size: normalizedSize,
      barcode: req.body?.barcode,
      productSource: 'repaired_damage',
      dateEncoded: formatDateOnly()
    })

    const createdProduct = created.product
    await conn.query(`
      INSERT INTO damage_repair_events (
        damage_source_type, damage_source_id, product_id, quantity, created_by
      ) VALUES (?, ?, ?, ?, ?)
    `, [
      damageSourceType,
      damageSourceId,
      Number(createdProduct.id),
      normalizedQuantity,
      req.auth.id
    ])

    const reference = `DAMAGE_REPAIR|source_type=${damageSourceType}|source_id=${damageSourceId}|product_id=${Number(createdProduct.id)}`
    const stockResult = await applyProductStockDelta(conn, {
      productId: createdProduct.id,
      deltaQuantity: normalizedQuantity,
      userId: req.auth.id,
      reference,
      reason: `Received repaired item from ${sourceRecord.source_label}`,
      createdAt: new Date(),
      transactionType: 'IN'
    })

    const [updatedRows] = await conn.query(`
      SELECT id, sku, name, brand, description, category_id, price, cost, stock_quantity,
             low_stock_threshold, size, color, barcode, is_active, product_source,
             source_breakdown_id, bale_purchase_id, condition_grade, qr_image_path
      FROM products
      WHERE id = ?
      LIMIT 1
    `, [createdProduct.id])
    const updatedProduct = updatedRows[0] || createdProduct

    await logAuditEventSafe(conn, {
      userId: req.auth.id,
      action: 'PRODUCT_CREATED',
      resourceType: 'Product',
      resourceId: createdProduct.id,
      details: {
        module: 'inventory',
        severity: 'medium',
        result: 'success',
        target_label: updatedProduct?.sku ? `${updatedProduct.name} (${updatedProduct.sku})` : updatedProduct?.name,
        summary: `Received repaired product "${updatedProduct?.name || normalizedName}" into Product Management`,
        after: updatedProduct,
        references: {
          damage_source_type: damageSourceType,
          damage_source_id: damageSourceId,
          inventory_reference: reference
        },
        metrics: {
          stock_quantity_before: stockResult.beforeQuantity,
          stock_quantity_after: stockResult.afterQuantity,
          quantity_received: normalizedQuantity
        }
      }
    })

    await conn.commit()
    conn.release()
    res.json({
      success: true,
      product: updatedProduct,
      source: {
        damage_source_type: damageSourceType,
        damage_source_id: damageSourceId,
        source_label: sourceRecord.source_label
      },
      quantity_received: normalizedQuantity
    })
  } catch (err) {
    await conn.rollback().catch(() => {})
    conn.release()
    console.error(err)
    if (err?.statusCode) return res.status(err.statusCode).json({ error: err.message })
    res.status(500).json({ error: err?.message || 'failed to receive repaired product' })
  }
})

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
