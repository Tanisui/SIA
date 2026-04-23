function createStockError(statusCode, message) {
  const err = new Error(message)
  err.statusCode = statusCode
  return err
}

function toWholeNumber(value) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return 0
  return Math.trunc(parsed)
}

function padTimestampPart(value) {
  return String(value).padStart(2, '0')
}

function formatMysqlTimestamp(value) {
  const parsed = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    throw createStockError(400, 'created_at must be a valid date')
  }

  return [
    parsed.getFullYear(),
    padTimestampPart(parsed.getMonth() + 1),
    padTimestampPart(parsed.getDate())
  ].join('-') + ' ' + [
    padTimestampPart(parsed.getHours()),
    padTimestampPart(parsed.getMinutes()),
    padTimestampPart(parsed.getSeconds())
  ].join(':')
}

function createLocalTimestamp(year, month, day, hour, minute, second) {
  const parsed = new Date(year, month - 1, day, hour, minute, second)
  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day ||
    parsed.getHours() !== hour ||
    parsed.getMinutes() !== minute ||
    parsed.getSeconds() !== second
  ) {
    throw createStockError(400, 'created_at must be a valid date')
  }
  return parsed
}

function resolveStockTransactionTimestamp(value) {
  if (!value) return formatMysqlTimestamp(new Date())

  if (value instanceof Date) return formatMysqlTimestamp(value)

  const normalized = String(value || '').trim()
  if (!normalized) return formatMysqlTimestamp(new Date())

  const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(normalized)
  if (dateOnlyMatch) {
    const now = new Date()
    return formatMysqlTimestamp(createLocalTimestamp(
      Number(dateOnlyMatch[1]),
      Number(dateOnlyMatch[2]),
      Number(dateOnlyMatch[3]),
      now.getHours(),
      now.getMinutes(),
      now.getSeconds()
    ))
  }

  const localDateTimeMatch = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/.exec(normalized)
  if (localDateTimeMatch && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(normalized)) {
    return formatMysqlTimestamp(createLocalTimestamp(
      Number(localDateTimeMatch[1]),
      Number(localDateTimeMatch[2]),
      Number(localDateTimeMatch[3]),
      Number(localDateTimeMatch[4]),
      Number(localDateTimeMatch[5]),
      Number(localDateTimeMatch[6] || 0)
    ))
  }

  return formatMysqlTimestamp(new Date(normalized))
}

async function loadProductForStockUpdate(conn, productId) {
  const [rows] = await conn.query(`
    SELECT id, name, sku, stock_quantity, cost, product_source
    FROM products
    WHERE id = ?
    LIMIT 1
    FOR UPDATE
  `, [Number(productId)])

  return rows[0] || null
}

async function applyProductStockDelta(conn, options) {
  const productId = Number(options?.productId)
  if (!Number.isFinite(productId) || productId <= 0) {
    throw createStockError(400, 'valid product id is required')
  }

  const deltaQuantity = toWholeNumber(options?.deltaQuantity)
  const transactionType = options?.transactionType || (deltaQuantity >= 0 ? 'IN' : 'ADJUST')
  const product = options?.lockedProduct || await loadProductForStockUpdate(conn, productId)
  if (!product) {
    throw createStockError(404, 'product not found')
  }

  const productSource = String(product.product_source || 'manual').toLowerCase()
  if (options?.disallowedProductSources?.includes(productSource)) {
    throw createStockError(400, options?.disallowedSourceMessage || 'stock updates are not allowed for this product')
  }

  const currentQty = Number(product.stock_quantity) || 0
  const nextQty = currentQty + deltaQuantity
  if (nextQty < 0) {
    throw createStockError(400, `Insufficient stock. Available: ${currentQty}`)
  }

  const updates = [
    'stock_quantity = ?',
    'status = ?'
  ]
  const params = [
    nextQty,
    nextQty > 0 ? 'available' : 'sold'
  ]

  if (options?.cost !== undefined) {
    updates.push('cost = ?')
    params.push(options.cost)
  }

  params.push(productId)
  await conn.query(`UPDATE products SET ${updates.join(', ')} WHERE id = ?`, params)

  if (deltaQuantity !== 0 && options?.recordTransaction !== false) {
    const supplierId = Number(options?.supplierId)
    const normalizedSupplierId = Number.isInteger(supplierId) && supplierId > 0 ? supplierId : null

    await conn.query(`
      INSERT INTO inventory_transactions (
        product_id, supplier_id, transaction_type, quantity, reference, user_id, reason, balance_after, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      productId,
      normalizedSupplierId,
      transactionType,
      deltaQuantity,
      options?.reference || null,
      options?.userId || null,
      options?.reason || null,
      nextQty,
      resolveStockTransactionTimestamp(options?.createdAt)
    ])
  }

  return {
    product,
    beforeQuantity: currentQty,
    afterQuantity: nextQty,
    beforeCost: Number(product.cost) || 0,
    afterCost: options?.cost !== undefined ? Number(options.cost) || 0 : Number(product.cost) || 0
  }
}

module.exports = {
  createStockError,
  resolveStockTransactionTimestamp,
  loadProductForStockUpdate,
  applyProductStockDelta
}
