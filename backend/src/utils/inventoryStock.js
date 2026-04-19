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
    await conn.query(`
      INSERT INTO inventory_transactions (
        product_id, transaction_type, quantity, reference, user_id, reason, balance_after, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      productId,
      transactionType,
      deltaQuantity,
      options?.reference || null,
      options?.userId || null,
      options?.reason || null,
      nextQty,
      options?.createdAt || new Date()
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
  loadProductForStockUpdate,
  applyProductStockDelta
}
