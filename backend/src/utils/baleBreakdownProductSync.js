const { getNextSequentialBarcode, getNextSequentialSKU } = require('./barcodeSupport')
const { generateProductQrImage } = require('../services/qrCodeService')
const { updateProductQrImagePath } = require('../repositories/productRepository')
const { applyProductStockDelta } = require('./inventoryStock')

const GRADE_DEFINITIONS = [
  { field: 'premium_items', conditionGrade: 'premium', label: 'Premium' },
  { field: 'standard_items', conditionGrade: 'standard', label: 'Standard' }
]

function roundMoney(value) {
  return Math.round((Number(value) || 0) * 100) / 100
}

function toWholeNumber(value) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return 0
  return Math.max(0, Math.trunc(parsed))
}

function asCreatedAt(value) {
  if (!value) return new Date()
  const normalized = String(value).trim()
  if (!normalized) return new Date()
  const parsed = new Date(`${normalized.slice(0, 10)}T00:00:00.000Z`)
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed
}

function createSyncError(message) {
  const err = new Error(message)
  err.statusCode = 400
  return err
}

function buildGeneratedProductName(baleBatchNo, gradeLabel) {
  const batchLabel = String(baleBatchNo || '').trim() || 'Bale'
  return `${batchLabel} - ${gradeLabel}`
}

function buildGeneratedProductDescription(purchase, gradeLabel) {
  const parts = [`Auto-generated from bale breakdown. Grade: ${gradeLabel}.`]
  if (purchase?.bale_batch_no) parts.push(`Batch: ${purchase.bale_batch_no}.`)
  if (purchase?.bale_category) parts.push(`Category: ${purchase.bale_category}.`)
  if (purchase?.supplier_name) parts.push(`Supplier: ${purchase.supplier_name}.`)
  parts.push('Review selling price before sale.')
  return parts.join(' ')
}

async function resolveCategoryId(conn, categoryName) {
  const normalized = String(categoryName || '').trim()
  if (!normalized) return null

  const [rows] = await conn.query(`
    SELECT id
    FROM categories
    WHERE LOWER(TRIM(name)) = LOWER(TRIM(?))
    LIMIT 1
  `, [normalized])

  return rows[0]?.id || null
}

async function findGeneratedProducts(conn, balePurchaseId, conditionGrade, options = {}) {
  const lockClause = options.forUpdate ? ' FOR UPDATE' : ''
  const [rows] = await conn.query(`
    SELECT *
    FROM products
    WHERE bale_purchase_id = ?
      AND condition_grade = ?
      AND COALESCE(product_source, 'bale_breakdown') = 'bale_breakdown'
    ORDER BY id ASC${lockClause}
  `, [Number(balePurchaseId), conditionGrade])

  return rows
}

async function ensureProductCodesAndQr(conn, productId, existingProduct = {}) {
  let nextSku = String(existingProduct?.sku || '').trim()
  let nextBarcode = String(existingProduct?.barcode || '').trim()

  if (!nextSku) {
    nextSku = await getNextSequentialSKU(conn)
    await conn.query('UPDATE products SET sku = ? WHERE id = ?', [nextSku, Number(productId)])
  }

  if (!nextBarcode) {
    nextBarcode = await getNextSequentialBarcode(conn)
    await conn.query('UPDATE products SET barcode = ? WHERE id = ?', [nextBarcode, Number(productId)])
  }

  let qrPath = String(existingProduct?.qr_image_path || '').trim()
  if (!qrPath) {
    const qrAsset = await generateProductQrImage({
      productId: Number(productId),
      code: nextBarcode || nextSku
    })
    qrPath = qrAsset.publicPath
    await updateProductQrImagePath(conn, productId, qrPath)
  }

  return {
    sku: nextSku,
    barcode: nextBarcode,
    qr_image_path: qrPath || null
  }
}

async function updateGeneratedProductMetadata(conn, options) {
  const existingProduct = options.product
  if (!existingProduct) return

  const productName = buildGeneratedProductName(options.purchase?.bale_batch_no, options.grade.label)
  const description = buildGeneratedProductDescription(options.purchase, options.grade.label)
  const nextUnitCost = roundMoney(options.unitCost)
  const existingPrice = Number(existingProduct.price) || 0
  const existingSellingPrice = Number(existingProduct.selling_price) || 0
  const nextPrice = existingPrice > 0 ? roundMoney(existingPrice) : nextUnitCost
  const nextSellingPrice = existingSellingPrice > 0 ? roundMoney(existingSellingPrice) : nextPrice
  const nextThreshold = Number.isFinite(Number(existingProduct.low_stock_threshold))
    ? Math.max(0, Number(existingProduct.low_stock_threshold))
    : 0
  const nextDateEncoded = existingProduct.date_encoded || options.breakdownDate || null

  await conn.query(`
    UPDATE products
    SET name = ?,
        description = ?,
        category_id = ?,
        price = ?,
        cost = ?,
        low_stock_threshold = ?,
        bale_purchase_id = ?,
        source_breakdown_id = ?,
        condition_grade = ?,
        product_source = 'bale_breakdown',
        allocated_cost = ?,
        selling_price = ?,
        date_encoded = ?,
        is_active = 1
    WHERE id = ?
  `, [
    productName,
    description,
    options.categoryId,
    nextPrice,
    nextUnitCost,
    nextThreshold,
    Number(options.purchase.id),
    options.breakdownId || existingProduct.source_breakdown_id || null,
    options.grade.conditionGrade,
    nextUnitCost,
    nextSellingPrice,
    nextDateEncoded,
    Number(existingProduct.id)
  ])

  await ensureProductCodesAndQr(conn, existingProduct.id, existingProduct)
}

async function createGeneratedProduct(conn, options) {
  const initialUnitCost = roundMoney(options.unitCost)
  const initialPrice = initialUnitCost
  const breakdownDate = options.breakdownDate || null
  const productName = buildGeneratedProductName(options.purchase?.bale_batch_no, options.grade.label)
  const description = buildGeneratedProductDescription(options.purchase, options.grade.label)
  const initialSku = await getNextSequentialSKU(conn)
  const initialBarcode = await getNextSequentialBarcode(conn)

  const [result] = await conn.query(`
    INSERT INTO products (
      sku, name, brand, description, category_id, price, cost, stock_quantity,
      low_stock_threshold, size, color, barcode, bale_purchase_id, source_breakdown_id,
      condition_grade, product_source, allocated_cost, selling_price, status, date_encoded, is_active
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    initialSku,
    productName,
    null,
    description,
    options.categoryId,
    initialPrice,
    initialUnitCost,
    0,
    0,
    null,
    null,
    initialBarcode,
    Number(options.purchase.id),
    options.breakdownId || null,
    options.grade.conditionGrade,
    'bale_breakdown',
    initialUnitCost,
    initialPrice,
    'available',
    breakdownDate,
    1
  ])

  await ensureProductCodesAndQr(conn, result.insertId, { sku: initialSku, barcode: initialBarcode })

  await applyProductStockDelta(conn, {
    productId: result.insertId,
    deltaQuantity: 1,
    userId: options.userId,
    reference: `${options.reference}|product_id=${Number(result.insertId)}`,
    reason: `Auto-created from bale breakdown (${options.grade.label})`,
    createdAt: asCreatedAt(breakdownDate),
    transactionType: 'IN'
  })

  return result.insertId
}

async function reduceGeneratedGradeStock(conn, options) {
  let remaining = toWholeNumber(options.removeCount)
  if (remaining <= 0) return

  const createdAt = asCreatedAt(options.breakdownDate)
  const candidates = [...(options.products || [])].sort((left, right) => Number(right.id) - Number(left.id))

  for (const product of candidates) {
    let available = toWholeNumber(product.stock_quantity)
    while (available > 0 && remaining > 0) {
      const stockResult = await applyProductStockDelta(conn, {
        productId: product.id,
        lockedProduct: product,
        deltaQuantity: -1,
        userId: options.userId,
        reference: options.reference,
        reason: `Auto-synced from bale breakdown (${options.grade.label})`,
        createdAt,
        transactionType: 'ADJUST'
      })

      available = toWholeNumber(stockResult.afterQuantity)
      product.stock_quantity = available
      remaining -= 1
    }

    if (remaining <= 0) break
  }

  if (remaining > 0) {
    throw createSyncError(`Cannot reduce ${options.grade.label} below the remaining stock for bale batch ${options.purchase?.bale_batch_no || options.purchase.id}`)
  }
}

async function syncGradeProduct(conn, options) {
  const currentQuantity = toWholeNumber(options.breakdown?.[options.grade.field])
  const previousQuantity = toWholeNumber(options.previousBreakdown?.[options.grade.field])
  const delta = currentQuantity - previousQuantity
  const breakdownDate = options.breakdown?.breakdown_date || null
  const existingProducts = await findGeneratedProducts(conn, options.purchase.id, options.grade.conditionGrade, { forUpdate: true })

  if (!existingProducts.length && currentQuantity > 0) {
    for (let index = 0; index < currentQuantity; index += 1) {
      await createGeneratedProduct(conn, {
        purchase: options.purchase,
        grade: options.grade,
        unitCost: options.unitCost,
        categoryId: options.categoryId,
        userId: options.userId,
        reference: `${options.reference}|event=create`,
        breakdownDate,
        breakdownId: options.breakdownId
      })
    }
    return
  }

  for (const product of existingProducts) {
    await updateGeneratedProductMetadata(conn, {
      product,
      purchase: options.purchase,
      grade: options.grade,
      unitCost: options.unitCost,
      categoryId: options.categoryId,
      breakdownDate,
      breakdownId: options.breakdownId
    })
  }

  if (delta > 0) {
    for (let index = 0; index < delta; index += 1) {
      await createGeneratedProduct(conn, {
        purchase: options.purchase,
        grade: options.grade,
        unitCost: options.unitCost,
        categoryId: options.categoryId,
        userId: options.userId,
        reference: `${options.reference}|event=sync_increase`,
        breakdownDate,
        breakdownId: options.breakdownId
      })
    }
  } else if (delta < 0) {
    await reduceGeneratedGradeStock(conn, {
      products: existingProducts,
      removeCount: Math.abs(delta),
      grade: options.grade,
      purchase: options.purchase,
      userId: options.userId,
      reference: `${options.reference}|event=sync_reduce`,
      breakdownDate
    })
  }
}

async function syncGeneratedProductsForBreakdown(conn, options) {
  const purchase = options?.purchase || {}
  const breakdown = options?.breakdown || {}
  const previousBreakdown = options?.previousBreakdown || {}
  const categoryId = await resolveCategoryId(conn, purchase.bale_category)
  const unitCost = roundMoney(breakdown.cost_per_saleable_item)
  const reference = `BALE_BREAKDOWN|bale_purchase_id=${Number(purchase.id)}${options?.breakdownId ? `|breakdown_id=${Number(options.breakdownId)}` : ''}`

  for (const grade of GRADE_DEFINITIONS) {
    await syncGradeProduct(conn, {
      purchase,
      breakdown,
      previousBreakdown,
      grade,
      categoryId,
      unitCost,
      userId: options?.userId,
      reference: `${reference}|grade=${grade.conditionGrade}`,
      breakdownId: options?.breakdownId
    })
  }
}

async function backfillMissingGeneratedProductsFromBreakdowns(conn) {
  const [rows] = await conn.query(`
    SELECT
      bp.id,
      bp.bale_batch_no,
      bp.bale_category,
      bp.supplier_name,
      bp.purchase_date,
      bb.id AS breakdown_id,
      bb.breakdown_date,
      bb.cost_per_saleable_item,
      bb.premium_items,
      bb.standard_items
    FROM bale_breakdowns bb
    JOIN bale_purchases bp ON bp.id = bb.bale_purchase_id
    ORDER BY bp.id ASC
  `)

  for (const row of rows) {
    const purchase = {
      id: row.id,
      bale_batch_no: row.bale_batch_no,
      bale_category: row.bale_category,
      supplier_name: row.supplier_name,
      purchase_date: row.purchase_date
    }
    const breakdown = {
      id: row.breakdown_id,
      breakdown_date: row.breakdown_date,
      cost_per_saleable_item: row.cost_per_saleable_item,
      premium_items: row.premium_items,
      standard_items: row.standard_items
    }

    const categoryId = await resolveCategoryId(conn, purchase.bale_category)
    for (const grade of GRADE_DEFINITIONS) {
      const existingProducts = await findGeneratedProducts(conn, purchase.id, grade.conditionGrade, { forUpdate: true })
      if (existingProducts.length) {
        for (const product of existingProducts) {
          await conn.query(`
            UPDATE products
            SET product_source = 'bale_breakdown',
                source_breakdown_id = COALESCE(source_breakdown_id, ?),
                bale_purchase_id = COALESCE(bale_purchase_id, ?),
                condition_grade = COALESCE(condition_grade, ?),
                is_active = COALESCE(is_active, 1)
            WHERE id = ?
              AND (
                COALESCE(product_source, '') <> 'bale_breakdown'
                OR source_breakdown_id IS NULL
                OR bale_purchase_id IS NULL
                OR condition_grade IS NULL
                OR is_active = 0
              )
          `, [
            row.breakdown_id,
            Number(purchase.id),
            grade.conditionGrade,
            Number(product.id)
          ])

          if (!String(product.sku || '').trim() || !String(product.barcode || '').trim() || !String(product.qr_image_path || '').trim()) {
            await ensureProductCodesAndQr(conn, product.id, product)
          }
        }
        continue
      }

      const quantityToCreate = toWholeNumber(breakdown[grade.field])
      for (let index = 0; index < quantityToCreate; index += 1) {
        await createGeneratedProduct(conn, {
          purchase,
          grade,
          unitCost: breakdown.cost_per_saleable_item,
          categoryId,
          userId: null,
          reference: `BALE_BREAKDOWN|bale_purchase_id=${Number(purchase.id)}|breakdown_id=${Number(breakdown.id)}|grade=${grade.conditionGrade}|event=backfill`,
          breakdownDate: breakdown.breakdown_date || purchase.purchase_date || null,
          breakdownId: breakdown.id
        })
      }
    }
  }
}

module.exports = {
  syncGeneratedProductsForBreakdown,
  backfillMissingGeneratedProductsFromBreakdowns
}
