const {
  WALK_IN_CUSTOMER_LABEL,
  roundMoney,
  generateDocumentNumber,
  getSaleById
} = require('../utils/salesSupport')
const { findProductByScannedCode, findProductByIdForUpdate } = require('../repositories/productRepository')
const { normalizeScannedCode, isScannedCodeValid } = require('../utils/scannerSupport')

function createHttpError(statusCode, message) {
  const error = new Error(message)
  error.statusCode = statusCode
  return error
}

function parseQuantity(value, defaultValue = 1) {
  if (value === undefined || value === null || value === '') return defaultValue
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw createHttpError(400, 'quantity must be greater than 0')
  }
  return Math.max(1, Math.floor(parsed))
}

function parseUnitPrice(value, defaultUnitPrice, allowPriceOverride) {
  if (value === undefined || value === null || value === '') return roundMoney(defaultUnitPrice)
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw createHttpError(400, 'unit_price must be zero or greater')
  }

  const normalized = roundMoney(parsed)
  const catalogPrice = roundMoney(defaultUnitPrice)
  if (!allowPriceOverride && normalized !== catalogPrice) {
    throw createHttpError(403, 'Price override is not allowed for this product')
  }
  return normalized
}

function buildDraftItemPayload(product, quantity, unitPrice) {
  return {
    product_id: product.id,
    quantity,
    unit_price: roundMoney(unitPrice),
    line_total: roundMoney(quantity * unitPrice),
    product_name: product.name || null,
    sku: product.sku || null,
    brand: product.brand || null,
    barcode: product.barcode || null,
    size: product.size || null,
    color: product.color || null
  }
}

async function getLockedDraftSale(conn, saleId) {
  const normalizedId = Number(saleId)
  if (!Number.isFinite(normalizedId) || normalizedId <= 0) return null

  const [rows] = await conn.query(
    `SELECT id
     FROM sales
     WHERE id = ?
       AND status = 'DRAFT'
     LIMIT 1
     FOR UPDATE`,
    [normalizedId]
  )

  if (!rows.length) return null
  return getSaleById(conn, normalizedId)
}

async function createDraftSale(conn, clerkId) {
  const saleNumber = await generateDocumentNumber(conn, 'sales', 'sale_number', 'DRF')
  const [result] = await conn.query(
    `INSERT INTO sales (
      sale_number,
      clerk_id,
      customer_id,
      customer_name_snapshot,
      customer_phone_snapshot,
      customer_email_snapshot,
      order_note,
      subtotal,
      tax,
      discount,
      total,
      payment_method,
      receipt_no,
      status
    )
    VALUES (?, ?, NULL, ?, NULL, NULL, NULL, 0, 0, 0, 0, NULL, NULL, 'DRAFT')`,
    [saleNumber, clerkId || null, WALK_IN_CUSTOMER_LABEL]
  )

  return getSaleById(conn, result.insertId)
}

async function ensureDraftSale(conn, { saleId, clerkId }) {
  const existingDraft = saleId ? await getLockedDraftSale(conn, saleId) : null
  if (existingDraft) return existingDraft
  return createDraftSale(conn, clerkId)
}

async function syncDraftSaleTotals(conn, saleId) {
  const [rows] = await conn.query(
    `SELECT COALESCE(SUM(line_total), 0) AS subtotal
     FROM sale_items
     WHERE sale_id = ?`,
    [saleId]
  )

  const subtotal = roundMoney(rows[0]?.subtotal)
  await conn.query(
    `UPDATE sales
     SET subtotal = ?, tax = 0, discount = 0, total = ?, payment_method = NULL, receipt_no = NULL
     WHERE id = ?
       AND status = 'DRAFT'`,
    [subtotal, subtotal, saleId]
  )

  return getSaleById(conn, saleId)
}

async function loadDraftItem(conn, saleId, itemId, { forUpdate = false } = {}) {
  const [rows] = await conn.query(
    `SELECT *
     FROM sale_items
     WHERE sale_id = ?
       AND id = ?
     LIMIT 1
     ${forUpdate ? 'FOR UPDATE' : ''}`,
    [Number(saleId), Number(itemId)]
  )
  return rows[0] || null
}

async function getDraftProductRows(conn, saleId, productId) {
  const [rows] = await conn.query(
    `SELECT id, qty, unit_price
     FROM sale_items
     WHERE sale_id = ?
       AND product_id = ?
     FOR UPDATE`,
    [Number(saleId), Number(productId)]
  )
  return rows
}

function validateRequestedStock(product, requestedQty, existingRows, excludingItemId = null) {
  const stockQuantity = Number(product?.stock_quantity) || 0
  const alreadyReserved = existingRows.reduce((sum, row) => {
    if (excludingItemId && Number(row.id) === Number(excludingItemId)) return sum
    return sum + (Number(row.qty) || 0)
  }, 0)

  if (requestedQty + alreadyReserved > stockQuantity) {
    throw createHttpError(409, 'out of stock')
  }
}

async function addDraftSaleItem(conn, saleId, payload, options = {}) {
  const quantity = parseQuantity(payload?.quantity, 1)
  let product = null
  let normalizedCode = null

  if (payload?.code !== undefined) {
    normalizedCode = normalizeScannedCode(payload.code)
    if (!normalizedCode || !isScannedCodeValid(normalizedCode)) {
      throw createHttpError(400, 'invalid code')
    }
    product = await findProductByScannedCode(conn, normalizedCode)
    if (!product) throw createHttpError(404, 'unknown product')
    product = await findProductByIdForUpdate(conn, product.id)
  } else {
    const productId = Number(payload?.product_id)
    if (!Number.isFinite(productId) || productId <= 0) {
      throw createHttpError(400, 'product_id is required')
    }
    product = await findProductByIdForUpdate(conn, productId)
  }

  if (!product) throw createHttpError(404, 'unknown product')
  if ((Number(product.stock_quantity) || 0) <= 0) throw createHttpError(409, 'out of stock')

  const requestedUnitPrice = parseUnitPrice(payload?.unit_price, product.price, options.allowPriceOverride === true)
  const existingRows = await getDraftProductRows(conn, saleId, product.id)
  validateRequestedStock(product, quantity, existingRows)

  const mergeTarget = existingRows.find((row) => roundMoney(row.unit_price) === requestedUnitPrice)
  if (mergeTarget) {
    const nextQty = (Number(mergeTarget.qty) || 0) + quantity
    await conn.query(
      `UPDATE sale_items
       SET qty = ?, unit_price = ?, line_total = ?
       WHERE id = ? AND sale_id = ?`,
      [nextQty, requestedUnitPrice, roundMoney(nextQty * requestedUnitPrice), mergeTarget.id, saleId]
    )
  } else {
    const item = buildDraftItemPayload(product, quantity, requestedUnitPrice)
    await conn.query(
      `INSERT INTO sale_items (
        sale_id,
        product_id,
        qty,
        unit_price,
        line_total,
        product_name_snapshot,
        sku_snapshot,
        brand_snapshot,
        barcode_snapshot,
        size_snapshot,
        color_snapshot
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        saleId,
        item.product_id,
        item.quantity,
        item.unit_price,
        item.line_total,
        item.product_name,
        item.sku,
        item.brand,
        item.barcode,
        item.size,
        item.color
      ]
    )
  }

  const sale = await syncDraftSaleTotals(conn, saleId)
  return { sale, normalizedCode }
}

async function updateDraftSaleItem(conn, saleId, itemId, payload, options = {}) {
  const saleItem = await loadDraftItem(conn, saleId, itemId, { forUpdate: true })
  if (!saleItem) throw createHttpError(404, 'sale item not found')

  const product = await findProductByIdForUpdate(conn, saleItem.product_id)
  if (!product) throw createHttpError(404, 'unknown product')

  const quantity = parseQuantity(payload?.quantity, Number(saleItem.qty) || 1)
  const unitPrice = parseUnitPrice(
    payload?.unit_price === undefined ? saleItem.unit_price : payload.unit_price,
    product.price,
    options.allowPriceOverride === true
  )

  const existingRows = await getDraftProductRows(conn, saleId, saleItem.product_id)
  validateRequestedStock(product, quantity, existingRows, saleItem.id)

  await conn.query(
    `UPDATE sale_items
     SET qty = ?, unit_price = ?, line_total = ?
     WHERE sale_id = ? AND id = ?`,
    [quantity, unitPrice, roundMoney(quantity * unitPrice), saleId, itemId]
  )

  return syncDraftSaleTotals(conn, saleId)
}

async function removeDraftSaleItem(conn, saleId, itemId) {
  const [result] = await conn.query(
    'DELETE FROM sale_items WHERE sale_id = ? AND id = ?',
    [Number(saleId), Number(itemId)]
  )

  if (!result.affectedRows) {
    throw createHttpError(404, 'sale item not found')
  }

  return syncDraftSaleTotals(conn, saleId)
}

async function findRecentScanEvent(conn, saleId, normalizedCode, debounceMs) {
  if (!debounceMs || debounceMs <= 0) return null
  const threshold = new Date(Date.now() - Number(debounceMs))
  const [rows] = await conn.query(
    `SELECT id, created_at
     FROM sale_scan_events
     WHERE sale_id = ?
       AND normalized_code = ?
       AND created_at >= ?
     ORDER BY created_at DESC
     LIMIT 1`,
    [Number(saleId), normalizedCode, threshold]
  )
  return rows[0] || null
}

async function recordScanEvent(conn, saleId, normalizedCode) {
  await conn.query(
    `INSERT INTO sale_scan_events (sale_id, normalized_code)
     VALUES (?, ?)`,
    [Number(saleId), normalizedCode]
  )
}

async function loadDraftItemsForCheckout(conn, saleId) {
  const [rows] = await conn.query(
    `SELECT *
     FROM sale_items
     WHERE sale_id = ?
     ORDER BY id ASC
     FOR UPDATE`,
    [Number(saleId)]
  )
  return rows
}

async function prepareDraftSaleForCheckout(conn, saleId, options = {}) {
  const draftSale = await getLockedDraftSale(conn, saleId)
  if (!draftSale) throw createHttpError(404, 'draft sale not found')

  const draftItems = await loadDraftItemsForCheckout(conn, saleId)
  if (!draftItems.length) throw createHttpError(400, 'at least one valid item is required')

  const productRows = new Map()
  const requestedQtyByProduct = new Map()

  for (const draftItem of draftItems) {
    const product = await findProductByIdForUpdate(conn, draftItem.product_id)
    if (!product) throw createHttpError(400, `product ${draftItem.product_id} not found`)
    productRows.set(product.id, product)
    requestedQtyByProduct.set(product.id, (requestedQtyByProduct.get(product.id) || 0) + (Number(draftItem.qty) || 0))
  }

  for (const [productId, requestedQty] of requestedQtyByProduct.entries()) {
    const product = productRows.get(productId)
    const availableStock = Number(product.stock_quantity) || 0
    if (requestedQty > availableStock) {
      throw createHttpError(409, `Insufficient stock for ${product.name}. Available: ${availableStock}`)
    }
  }

  let subtotal = 0
  const processedItems = draftItems.map((draftItem) => {
    const product = productRows.get(Number(draftItem.product_id))
    const catalogPrice = roundMoney(product.price)
    const unitPrice = roundMoney(draftItem.unit_price)
    if (!options.allowPriceOverride && unitPrice !== catalogPrice) {
      throw createHttpError(403, `Price override is not allowed for ${product.name}`)
    }

    const quantity = Number(draftItem.qty) || 0
    const lineTotal = roundMoney(unitPrice * quantity)
    subtotal = roundMoney(subtotal + lineTotal)

    return {
      draft_item_id: draftItem.id,
      product_id: draftItem.product_id,
      quantity,
      unit_price: unitPrice,
      line_total: lineTotal,
      product_name: draftItem.product_name_snapshot || product.name || null,
      sku: draftItem.sku_snapshot || product.sku || null,
      brand: draftItem.brand_snapshot || product.brand || null,
      barcode: draftItem.barcode_snapshot || product.barcode || null,
      size: draftItem.size_snapshot || product.size || null,
      color: draftItem.color_snapshot || product.color || null
    }
  })

  return { sale: draftSale, processedItems, subtotal, productRows }
}

async function applyDraftSaleInventoryChanges(conn, processedItems, productRows, userId, saleInfo) {
  const currentQtyByProduct = new Map()
  for (const [productId, product] of productRows.entries()) {
    currentQtyByProduct.set(productId, Number(product.stock_quantity) || 0)
  }

  for (const item of processedItems) {
    const currentQty = currentQtyByProduct.get(item.product_id)
    const newQty = currentQty - item.quantity
    currentQtyByProduct.set(item.product_id, newQty)

    await conn.query(
      `UPDATE products
       SET stock_quantity = ?,
           status = CASE
             WHEN ? <= 0 THEN 'sold'
             ELSE COALESCE(status, 'available')
           END
       WHERE id = ?`,
      [newQty, newQty, item.product_id]
    )
    await conn.query(
      `INSERT INTO inventory_transactions (product_id, transaction_type, quantity, user_id, reason, balance_after, reference)
       VALUES (?, 'OUT', ?, ?, ?, ?, ?)`,
      [
        item.product_id,
        -item.quantity,
        userId,
        'POS sale deduction',
        newQty,
        `SALE_LINK|sale_id=${saleInfo.saleId}|sale_no=${saleInfo.saleNumber}|receipt=${saleInfo.receiptNo}`
      ]
    )
  }
}

module.exports = {
  createDraftSale,
  ensureDraftSale,
  getLockedDraftSale,
  syncDraftSaleTotals,
  addDraftSaleItem,
  updateDraftSaleItem,
  removeDraftSaleItem,
  findRecentScanEvent,
  recordScanEvent,
  prepareDraftSaleForCheckout,
  applyDraftSaleInventoryChanges
}
