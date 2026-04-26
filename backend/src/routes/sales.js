const express = require('express')
const router = express.Router()
const db = require('../database')
const { verifyToken, authorize } = require('../middleware/authMiddleware')
const {
  PAYMENT_METHODS,
  WALK_IN_CUSTOMER_LABEL,
  roundMoney,
  normalizeDiscountPercentage,
  calculateSaleTaxBreakdown,
  ensureSalesSchema,
  buildDateFilter,
  enrichSaleRecord,
  generateDocumentNumber,
  createWalkInCustomerProfile,
  prepareSaleItems,
  applySaleInventoryChanges,
  getSaleItems,
  getSaleById,
  getSaleByReceipt,
  processSaleReturn
} = require('../utils/salesSupport')
const { normalizeScannedCode } = require('../utils/scannerSupport')
const { getRuntimeConfig } = require('../services/runtimeConfigService')
const { ensureScannerSchema } = require('../services/scannerSchemaService')
const { logAuditEventSafe } = require('../utils/auditLog')
const {
  ensureDraftSale,
  getLockedDraftSale,
  addDraftSaleItem,
  updateDraftSaleItem,
  removeDraftSaleItem,
  updateDraftSaleCustomer,
  findRecentScanEvent,
  recordScanEvent,
  prepareDraftSaleForCheckout,
  applyDraftSaleInventoryChanges
} = require('../services/draftSaleService')

function createHttpError(statusCode, message) {
  const err = new Error(message)
  err.statusCode = statusCode
  return err
}

function getErrorStatus(err) {
  return err?.statusCode || 500
}

function getErrorMessage(err, fallback) {
  return err?.message || fallback
}

function hasPermission(permissions, required) {
  if (!required) return true
  if (!Array.isArray(permissions) || !permissions.length) return false
  if (permissions.includes('admin.*') || permissions.includes(required)) return true

  return permissions.some((permission) => {
    if (!String(permission).endsWith('.*')) return false
    const prefix = String(permission).slice(0, -2)
    return prefix && String(required).startsWith(`${prefix}.`)
  })
}

function normalizeOptionalText(value) {
  const normalized = String(value || '').trim()
  return normalized || null
}

function summarizeSaleAdjustments(processedItems, productRows) {
  let priceOverrides = 0
  let quantity = 0

  for (const item of processedItems || []) {
    quantity += Number(item.quantity) || 0
    const product = productRows?.get ? productRows.get(Number(item.product_id)) : null
    const catalogPrice = roundMoney(product?.price)
    if (product && roundMoney(item.unit_price) !== catalogPrice) priceOverrides += 1
  }

  return { priceOverrides, quantity }
}

function hasOwn(payload, key) {
  return Object.prototype.hasOwnProperty.call(payload || {}, key)
}

async function getLockedSale(conn, { saleId, receiptNo }) {
  const [rows] = saleId
    ? await conn.query("SELECT id FROM sales WHERE id = ? AND status <> 'DRAFT' FOR UPDATE", [saleId])
    : await conn.query("SELECT id FROM sales WHERE receipt_no = ? AND status <> 'DRAFT' FOR UPDATE", [String(receiptNo || '').trim()])

  if (!rows.length) return null
  return getSaleById(conn, rows[0].id)
}

async function getCustomerForSaleLink(conn, customerId) {
  const normalizedCustomerId = Number(customerId)
  if (!Number.isFinite(normalizedCustomerId) || normalizedCustomerId <= 0) return null

  const [rows] = await conn.query(
    `SELECT
       id,
       customer_code,
       COALESCE(NULLIF(full_name, ''), NULLIF(name, ''), CONCAT('Customer #', id)) AS full_name,
       phone,
       email
     FROM customers
     WHERE id = ?
     LIMIT 1`,
    [normalizedCustomerId]
  )

  return rows[0] || null
}

router.get('/config', verifyToken, authorize(['sales.view', 'sales.create']), async (req, res) => {
  try {
    await ensureSalesSchema()
    await ensureScannerSchema()
    const permissions = Array.isArray(req.auth?.permissions) ? req.auth.permissions : []
    const runtimeConfig = await getRuntimeConfig()
    res.json({
      discount_type: 'percentage',
      currency: runtimeConfig.currency,
      tax_rate: runtimeConfig.taxRate,
      configured_tax_rate: runtimeConfig.configuredTaxRate,
      tax_rate_percentage: roundMoney(runtimeConfig.taxRate * 100),
      scanner_debounce_ms: runtimeConfig.scannerDebounceMs,
      payment_methods: PAYMENT_METHODS,
      allow_discount: hasPermission(permissions, 'sales.discount'),
      allow_price_override: hasPermission(permissions, 'sales.price_override'),
      allow_customer_profile_save: hasPermission(permissions, 'customers.create'),
      walk_in_customer_label: WALK_IN_CUSTOMER_LABEL,
      invoice: runtimeConfig.invoice
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'failed to load sales configuration' })
  }
})

router.get('/products', verifyToken, authorize(['sales.view', 'sales.create', 'products.view']), async (req, res) => {
  try {
    await ensureScannerSchema()
    const [rows] = await db.pool.query(`
      SELECT p.*, c.name AS category
      FROM products p
      LEFT JOIN categories c ON c.id = p.category_id
      ORDER BY p.name ASC, p.id DESC
    `)
    res.json(rows)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'failed to load POS products' })
  }
})

router.get('/reports/summary', verifyToken, authorize(['sales.view', 'reports.view', 'finance.reports.view']), async (req, res) => {
  try {
    await ensureSalesSchema()
    await ensureScannerSchema()
    const { from, to } = req.query

    const totalsParams = []
    const totalsDateFilter = buildDateFilter('s', 'date', from, to, totalsParams)

    const [totalsRows] = await db.pool.query(`
      SELECT
        COUNT(*) AS total_sales,
        COALESCE(SUM(s.subtotal), 0) AS gross_sales,
        COALESCE(SUM(s.discount), 0) AS total_discounts,
        COALESCE(SUM(s.tax), 0) AS total_tax,
        COALESCE(SUM(s.total), 0) AS total_revenue,
        SUM(CASE WHEN s.status = 'REFUNDED' THEN 1 ELSE 0 END) AS refunded_sales
      FROM sales s
      WHERE s.status <> 'DRAFT'${totalsDateFilter}
    `, totalsParams)

    const returnsParams = []
    const returnsDateFilter = buildDateFilter('sri', 'created_at', from, to, returnsParams)
    const [returnsRows] = await db.pool.query(`
      SELECT
        COUNT(*) AS total_return_transactions,
        COALESCE(SUM(sri.quantity), 0) AS total_returned_qty,
        COALESCE(SUM(sri.quantity * sri.unit_price), 0) AS total_returns
      FROM sale_return_items sri
      JOIN sales s ON s.id = sri.sale_id
      WHERE s.status <> 'DRAFT'${returnsDateFilter}
    `, returnsParams)

    const paymentParams = []
    const paymentDateFilter = buildDateFilter('s', 'date', from, to, paymentParams)
    const [byPayment] = await db.pool.query(`
      SELECT
        s.payment_method,
        COUNT(*) AS count,
        COALESCE(SUM(s.total), 0) AS total,
        COALESCE(SUM(sp.amount_received), 0) AS amount_received,
        COALESCE(SUM(sp.change_amount), 0) AS change_given
      FROM sales s
      LEFT JOIN sales_payments sp ON sp.sale_id = s.id
      WHERE s.status <> 'DRAFT'${paymentDateFilter}
      GROUP BY s.payment_method
      ORDER BY total DESC
    `, paymentParams)

    const topProductParams = []
    const topProductDateFilter = buildDateFilter('s', 'date', from, to, topProductParams)
    const [topProducts] = await db.pool.query(`
      SELECT
        p.name,
        p.sku,
        SUM(si.qty) AS total_qty,
        COALESCE(SUM(ret.returned_qty), 0) AS returned_qty,
        SUM(si.qty) - COALESCE(SUM(ret.returned_qty), 0) AS net_qty,
        SUM(si.line_total) AS gross_sales,
        SUM(si.line_total) - COALESCE(SUM(ret.returned_amount), 0) AS net_sales
      FROM sale_items si
      JOIN sales s ON s.id = si.sale_id
      LEFT JOIN products p ON p.id = si.product_id
      LEFT JOIN (
        SELECT sale_item_id, SUM(quantity) AS returned_qty, SUM(quantity * unit_price) AS returned_amount
        FROM sale_return_items
        GROUP BY sale_item_id
      ) ret ON ret.sale_item_id = si.id
      WHERE s.status <> 'DRAFT'${topProductDateFilter}
      GROUP BY si.product_id, p.name, p.sku
      ORDER BY net_sales DESC
      LIMIT 10
    `, topProductParams)

    const totals = totalsRows[0] || {}
    const returns = returnsRows[0] || {}
    const totalRevenue = roundMoney(totals.total_revenue)
    const totalReturns = roundMoney(returns.total_returns)

    res.json({
      total_sales: Number(totals.total_sales) || 0,
      total_transactions: Number(totals.total_sales) || 0,
      gross_sales: roundMoney(totals.gross_sales),
      total_discounts: roundMoney(totals.total_discounts),
      total_tax: roundMoney(totals.total_tax),
      total_revenue: totalRevenue,
      total_returns: totalReturns,
      refunded_sales: Number(totals.refunded_sales) || 0,
      total_return_transactions: Number(returns.total_return_transactions) || 0,
      total_returned_qty: Number(returns.total_returned_qty) || 0,
      net_revenue: roundMoney(totalRevenue - totalReturns),
      by_payment_method: byPayment.map((row) => ({
        ...row,
        total: roundMoney(row.total),
        amount_received: roundMoney(row.amount_received),
        change_given: roundMoney(row.change_given)
      })),
      top_products: topProducts.map((row) => ({
        ...row,
        gross_sales: roundMoney(row.gross_sales),
        net_sales: roundMoney(row.net_sales),
        total_qty: Number(row.total_qty) || 0,
        returned_qty: Number(row.returned_qty) || 0,
        net_qty: Number(row.net_qty) || 0
      }))
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'failed to generate sales report' })
  }
})

router.get('/transactions', verifyToken, authorize('sales.view'), async (req, res) => {
  try {
    await ensureSalesSchema()
    await ensureScannerSchema()
    const { from, to, type, receipt_no } = req.query

    const paymentParams = []
    let paymentFilter = buildDateFilter('sp', 'received_at', from, to, paymentParams)
    if (receipt_no) {
      paymentFilter += ' AND s.receipt_no = ?'
      paymentParams.push(String(receipt_no).trim())
    }
    const [payments] = await db.pool.query(`
      SELECT
        CONCAT('PAY-', sp.id) AS transaction_id,
        'SALE_PAYMENT' AS type,
        sp.received_at AS created_at,
        s.id AS sale_id,
        s.sale_number,
        s.receipt_no,
        s.payment_method,
        s.total AS amount,
        sp.amount_received,
        sp.change_amount,
        u.username AS user_name,
        c.customer_code AS customer_code,
        COALESCE(s.customer_name_snapshot, NULLIF(c.full_name, ''), c.name) AS customer_name,
        COALESCE(s.customer_phone_snapshot, c.phone) AS customer_phone,
        COALESCE(s.customer_email_snapshot, c.email) AS customer_email
      FROM sales_payments sp
      JOIN sales s ON s.id = sp.sale_id
      LEFT JOIN users u ON u.id = sp.received_by
      LEFT JOIN customers c ON c.id = s.customer_id
      WHERE 1=1${paymentFilter}
      ORDER BY sp.received_at DESC
    `, paymentParams)

    const returnParams = []
    let returnFilter = buildDateFilter('sri', 'created_at', from, to, returnParams)
    if (receipt_no) {
      returnFilter += ' AND s.receipt_no = ?'
      returnParams.push(String(receipt_no).trim())
    }
    const [returns] = await db.pool.query(`
      SELECT
        CONCAT('RET-', sri.id) AS transaction_id,
        'SALE_RETURN' AS type,
        sri.created_at,
        s.id AS sale_id,
        s.sale_number,
        s.receipt_no,
        s.payment_method,
        (sri.quantity * sri.unit_price) AS amount,
        sri.quantity,
        sri.unit_price,
        sri.reason,
        sri.return_disposition,
        sri.accounting_reference,
        p.name AS product_name,
        p.sku,
        u.username AS user_name,
        c.customer_code AS customer_code,
        COALESCE(s.customer_name_snapshot, NULLIF(c.full_name, ''), c.name) AS customer_name,
        COALESCE(s.customer_phone_snapshot, c.phone) AS customer_phone,
        COALESCE(s.customer_email_snapshot, c.email) AS customer_email
      FROM sale_return_items sri
      JOIN sales s ON s.id = sri.sale_id
      LEFT JOIN products p ON p.id = sri.product_id
      LEFT JOIN users u ON u.id = sri.processed_by
      LEFT JOIN customers c ON c.id = s.customer_id
      WHERE 1=1${returnFilter}
      ORDER BY sri.created_at DESC
    `, returnParams)

    let transactions = [
      ...payments.map((row) => ({
        ...row,
        amount: roundMoney(row.amount),
        amount_received: roundMoney(row.amount_received),
        change_amount: roundMoney(row.change_amount)
      })),
      ...returns.map((row) => ({
        ...row,
        amount: roundMoney(row.amount),
        unit_price: roundMoney(row.unit_price)
      }))
    ]

    if (type === 'SALE_PAYMENT' || type === 'SALE_RETURN') {
      transactions = transactions.filter((row) => row.type === type)
    }

    transactions.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    res.json(transactions)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'failed to fetch sales transactions' })
  }
})

router.get('/receipt/:receiptNo', verifyToken, authorize(['sales.view', 'sales.refund']), async (req, res) => {
  try {
    await ensureSalesSchema()
    await ensureScannerSchema()
    const sale = await getSaleByReceipt(db.pool, req.params.receiptNo)
    if (!sale) return res.status(404).json({ error: 'receipt not found' })
    res.json(sale)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'failed to fetch receipt' })
  }
})

router.get('/', verifyToken, authorize('sales.view'), async (req, res) => {
  try {
    await ensureSalesSchema()
    await ensureScannerSchema()
    const {
      status, from, to, payment_method, receipt_no,
      search,
      return_status,
      page, limit
    } = req.query

    const baseSelect = `
      SELECT
        s.*,
        u.username AS clerk_name,
        c.customer_code AS customer_code,
        COALESCE(s.customer_name_snapshot, NULLIF(c.full_name, ''), c.name) AS customer_name,
        COALESCE(s.customer_phone_snapshot, c.phone) AS customer_phone,
        COALESCE(s.customer_email_snapshot, c.email) AS customer_email,
        sp.amount_received,
        sp.change_amount,
        sp.received_at AS payment_received_at,
        COALESCE(sold.sold_qty, 0) AS sold_qty,
        COALESCE(ret.returned_qty, 0) AS returned_qty,
        COALESCE(ret.returned_amount, 0) AS returned_amount
      FROM sales s
      LEFT JOIN users u ON u.id = s.clerk_id
      LEFT JOIN customers c ON c.id = s.customer_id
      LEFT JOIN sales_payments sp ON sp.sale_id = s.id
      LEFT JOIN (
        SELECT sale_id, SUM(qty) AS sold_qty
        FROM sale_items
        GROUP BY sale_id
      ) sold ON sold.sale_id = s.id
      LEFT JOIN (
        SELECT sale_id, SUM(quantity) AS returned_qty, SUM(quantity * unit_price) AS returned_amount
        FROM sale_return_items
        GROUP BY sale_id
      ) ret ON ret.sale_id = s.id
      WHERE s.status <> 'DRAFT'
    `
    const filters = []
    const params = []
    if (status) {
      filters.push(' AND s.status = ?')
      params.push(status)
    }
    if (payment_method) {
      filters.push(' AND s.payment_method = ?')
      params.push(payment_method)
    }
    if (receipt_no) {
      filters.push(' AND s.receipt_no = ?')
      params.push(String(receipt_no).trim())
    }
    if (search) {
      const needle = `%${String(search).trim()}%`
      filters.push(` AND (
        s.sale_number LIKE ? OR s.receipt_no LIKE ?
        OR s.customer_name_snapshot LIKE ? OR c.full_name LIKE ?
        OR c.name LIKE ? OR c.phone LIKE ? OR c.email LIKE ?
        OR u.username LIKE ?
      )`)
      params.push(needle, needle, needle, needle, needle, needle, needle, needle)
    }
    const dateFilter = buildDateFilter('s', 'date', from, to, params)

    let returnStatusHaving = ''
    const havingParams = []
    if (return_status) {
      const want = String(return_status).trim().toUpperCase()
      if (want === 'NONE')              returnStatusHaving = ' HAVING returned_qty = 0'
      else if (want === 'PARTIAL')      returnStatusHaving = ' HAVING returned_qty > 0 AND returned_qty < sold_qty'
      else if (want === 'FULL')         returnStatusHaving = ' HAVING returned_qty >= sold_qty AND returned_qty > 0'
    }

    const filterClause = filters.join('') + dateFilter
    const orderClause = ' ORDER BY s.date DESC, s.id DESC'

    // Pagination — opt-in. If `page` is provided, return { data, total, page, limit }.
    const wantPagination = page !== undefined
    const safeLimit = Math.max(1, Math.min(Number(limit) || 25, 200))
    const safePage  = Math.max(1, Number(page) || 1)
    const offset    = (safePage - 1) * safeLimit

    if (wantPagination) {
      // Total: wrap inner query so we can count rows after HAVING (return_status filter).
      const countSql = `
        SELECT COUNT(*) AS total FROM (
          ${baseSelect}
          ${filterClause}
          ${returnStatusHaving}
        ) AS x
      `
      const [[{ total }]] = await db.pool.query(countSql, [...params, ...havingParams])
      const pageSql = `${baseSelect}${filterClause}${returnStatusHaving}${orderClause} LIMIT ? OFFSET ?`
      const [rows] = await db.pool.query(pageSql, [...params, ...havingParams, safeLimit, offset])
      const sales = []
      for (const row of rows) {
        const sale = enrichSaleRecord(row)
        sale.items = await getSaleItems(db.pool, sale.id)
        sales.push(sale)
      }
      return res.json({ data: sales, total: Number(total) || 0, page: safePage, limit: safeLimit })
    }

    // Legacy: array response (for callers that don't paginate)
    const [rows] = await db.pool.query(`${baseSelect}${filterClause}${returnStatusHaving}${orderClause}`, [...params, ...havingParams])
    const sales = []
    for (const row of rows) {
      const sale = enrichSaleRecord(row)
      sale.items = await getSaleItems(db.pool, sale.id)
      sales.push(sale)
    }

    res.json(sales)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'failed to fetch sales' })
  }
})

router.post('/drafts', express.json(), verifyToken, authorize('sales.create'), async (req, res) => {
  const conn = await db.pool.getConnection()
  try {
    await conn.beginTransaction()
    await ensureSalesSchema()
    await ensureScannerSchema(conn)

    const rawSaleId = req.body?.sale_id
    const saleId = Number(rawSaleId)
    const forceNew = req.body?.force_new === true
      || req.body?.force_new === 'true'
      || req.body?.force_new === 1
      || req.body?.force_new === '1'
    const sale = await ensureDraftSale(conn, {
      saleId: Number.isFinite(saleId) && saleId > 0 ? saleId : null,
      clerkId: req.auth.id,
      requireExisting: rawSaleId !== undefined && rawSaleId !== null && rawSaleId !== '',
      forceNew
    })

    await conn.commit()
    res.json(sale)
  } catch (err) {
    await conn.rollback().catch(() => {})
    console.error(err)
    res.status(getErrorStatus(err)).json({ error: getErrorMessage(err, 'failed to prepare draft sale') })
  } finally {
    conn.release()
  }
})

router.patch('/drafts/:saleId/customer', express.json(), verifyToken, authorize('sales.create'), async (req, res) => {
  const conn = await db.pool.getConnection()
  try {
    await conn.beginTransaction()
    await ensureSalesSchema()
    await ensureScannerSchema(conn)

    if (!hasOwn(req.body || {}, 'customer_id')) {
      throw createHttpError(400, 'customer_id is required')
    }

    const rawCustomerId = req.body?.customer_id
    const normalizedCustomerId = rawCustomerId === null || rawCustomerId === ''
      ? null
      : Number(rawCustomerId)

    if (normalizedCustomerId !== null && (!Number.isFinite(normalizedCustomerId) || normalizedCustomerId <= 0)) {
      throw createHttpError(400, 'customer_id must be a valid positive integer or null')
    }

    const saleId = Number(req.params.saleId)
    const draftSale = await getLockedDraftSale(conn, saleId)
    if (!draftSale) throw createHttpError(404, 'draft sale not found')

    const sale = await updateDraftSaleCustomer(conn, saleId, normalizedCustomerId)

    await conn.commit()
    res.json(sale)
  } catch (err) {
    await conn.rollback().catch(() => {})
    console.error(err)
    res.status(getErrorStatus(err)).json({ error: getErrorMessage(err, 'failed to update draft customer') })
  } finally {
    conn.release()
  }
})

router.post('/:saleId/items', express.json(), verifyToken, authorize('sales.create'), async (req, res) => {
  const conn = await db.pool.getConnection()
  try {
    await conn.beginTransaction()
    await ensureSalesSchema()
    await ensureScannerSchema(conn)

    const saleId = Number(req.params.saleId)
    const draftSale = await getLockedDraftSale(conn, saleId)
    if (!draftSale) throw createHttpError(404, 'draft sale not found')

    const runtimeConfig = await getRuntimeConfig(conn)
    const rawCode = req.body?.code
    const normalizedCode = rawCode !== undefined ? normalizeScannedCode(rawCode) : null
    const duplicateScanWindowMs = 0
    if (rawCode !== undefined && (!normalizedCode || !normalizedCode.length)) {
      throw createHttpError(400, 'invalid code')
    }

    if (normalizedCode && duplicateScanWindowMs > 0) {
      const recentScan = await findRecentScanEvent(conn, saleId, normalizedCode, duplicateScanWindowMs)
      if (recentScan) {
        const sale = await getSaleById(conn, saleId)
        await conn.commit()
        return res.json({
          sale,
          ignored: true,
          duplicate_scan: true,
          scanner_debounce_ms: runtimeConfig.scannerDebounceMs
        })
      }
    }

    const { sale } = await addDraftSaleItem(conn, saleId, req.body, {
      allowPriceOverride: hasPermission(req.auth?.permissions, 'sales.price_override')
    })

    if (normalizedCode) {
      await recordScanEvent(conn, saleId, normalizedCode)
    }

    await conn.commit()
    res.json({
      sale,
      ignored: false,
      duplicate_scan: false,
      scanner_debounce_ms: runtimeConfig.scannerDebounceMs
    })
  } catch (err) {
    await conn.rollback().catch(() => {})
    console.error(err)
    res.status(getErrorStatus(err)).json({
      error: getErrorMessage(err, 'failed to add sale item'),
      sale_id: Number(req.params.saleId) || null,
      meta: err?.meta || null
    })
  } finally {
    conn.release()
  }
})

router.put('/:saleId/items/:itemId', express.json(), verifyToken, authorize('sales.create'), async (req, res) => {
  const conn = await db.pool.getConnection()
  try {
    await conn.beginTransaction()
    await ensureSalesSchema()
    await ensureScannerSchema(conn)

    const saleId = Number(req.params.saleId)
    const draftSale = await getLockedDraftSale(conn, saleId)
    if (!draftSale) throw createHttpError(404, 'draft sale not found')

    const sale = await updateDraftSaleItem(conn, saleId, req.params.itemId, req.body, {
      allowPriceOverride: hasPermission(req.auth?.permissions, 'sales.price_override')
    })

    await conn.commit()
    res.json({ sale })
  } catch (err) {
    await conn.rollback().catch(() => {})
    console.error(err)
    res.status(getErrorStatus(err)).json({ error: getErrorMessage(err, 'failed to update sale item') })
  } finally {
    conn.release()
  }
})

router.delete('/:saleId/items/:itemId', verifyToken, authorize('sales.create'), async (req, res) => {
  const conn = await db.pool.getConnection()
  try {
    await conn.beginTransaction()
    await ensureSalesSchema()
    await ensureScannerSchema(conn)

    const saleId = Number(req.params.saleId)
    const draftSale = await getLockedDraftSale(conn, saleId)
    if (!draftSale) throw createHttpError(404, 'draft sale not found')

    const sale = await removeDraftSaleItem(conn, saleId, req.params.itemId)

    await conn.commit()
    res.json({ sale })
  } catch (err) {
    await conn.rollback().catch(() => {})
    console.error(err)
    res.status(getErrorStatus(err)).json({ error: getErrorMessage(err, 'failed to remove sale item') })
  } finally {
    conn.release()
  }
})

router.delete('/:saleId', verifyToken, authorize('sales.create'), async (req, res) => {
  const conn = await db.pool.getConnection()
  try {
    await conn.beginTransaction()
    await ensureSalesSchema()
    await ensureScannerSchema(conn)

    const saleId = Number(req.params.saleId)
    const draftSale = await getLockedDraftSale(conn, saleId)
    if (!draftSale) throw createHttpError(404, 'draft sale not found')

    await conn.query('DELETE FROM sale_scan_events WHERE sale_id = ?', [saleId]).catch(() => {})
    await conn.query('DELETE FROM sale_items WHERE sale_id = ?', [saleId])
    await conn.query(
      `DELETE FROM sales
       WHERE id = ?
         AND status = 'DRAFT'`,
      [saleId]
    )

    await conn.commit()
    res.json({ success: true })
  } catch (err) {
    await conn.rollback().catch(() => {})
    console.error(err)
    res.status(getErrorStatus(err)).json({ error: getErrorMessage(err, 'failed to delete draft sale') })
  } finally {
    conn.release()
  }
})

router.get('/:id', verifyToken, authorize('sales.view'), async (req, res) => {
  try {
    await ensureSalesSchema()
    await ensureScannerSchema()
    const sale = await getSaleById(db.pool, Number(req.params.id))
    if (!sale) return res.status(404).json({ error: 'sale not found' })
    res.json(sale)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'failed to fetch sale' })
  }
})

router.patch('/:id/customer', express.json(), verifyToken, authorize(['sales.create', 'customers.update']), async (req, res) => {
  await ensureSalesSchema()
  const conn = await db.pool.getConnection()

  try {
    await conn.beginTransaction()

    if (!hasOwn(req.body || {}, 'customer_id')) {
      throw createHttpError(400, 'customer_id is required')
    }

    const customerId = Number(req.body.customer_id)
    if (!Number.isFinite(customerId) || customerId <= 0) {
      throw createHttpError(400, 'customer_id must be a valid positive integer')
    }

    const saleId = Number(req.params.id)
    if (!Number.isFinite(saleId) || saleId <= 0) {
      throw createHttpError(400, 'sale id must be a valid positive integer')
    }

    const [saleRows] = await conn.query(
      `SELECT id, status, customer_id, receipt_no, sale_number
       FROM sales
       WHERE id = ?
       LIMIT 1
       FOR UPDATE`,
      [saleId]
    )

    if (!saleRows.length) throw createHttpError(404, 'sale not found')

    const saleRow = saleRows[0]
    const status = String(saleRow.status || '').toUpperCase()
    if (status === 'DRAFT') {
      throw createHttpError(400, 'customer can only be attached after payment is completed')
    }

    const existingCustomerId = Number(saleRow.customer_id)
    if (Number.isFinite(existingCustomerId) && existingCustomerId > 0 && existingCustomerId !== customerId) {
      throw createHttpError(409, 'sale is already linked to another customer')
    }

    const customer = await getCustomerForSaleLink(conn, customerId)
    if (!customer) throw createHttpError(404, 'customer not found')

    if (!existingCustomerId) {
      await conn.query(
        `UPDATE sales
         SET customer_id = ?,
             customer_name_snapshot = ?,
             customer_phone_snapshot = ?,
             customer_email_snapshot = ?
         WHERE id = ?`,
        [
          customer.id,
          customer.full_name || WALK_IN_CUSTOMER_LABEL,
          normalizeOptionalText(customer.phone),
          normalizeOptionalText(customer.email),
          saleId
        ]
      )
    }

    await conn.commit()

    const updatedSale = await getSaleById(db.pool, saleId)
    await logAuditEventSafe(db.pool, {
      userId: req.auth.id,
      action: 'SALE_CUSTOMER_LINKED',
      resourceType: 'Sale',
      resourceId: saleId,
      details: {
        module: 'sales',
        severity: 'low',
        target_label: updatedSale?.receipt_no || updatedSale?.sale_number || `Sale #${saleId}`,
        summary: `Linked sale "${updatedSale?.receipt_no || updatedSale?.sale_number || saleId}" to customer "${customer.full_name || customer.customer_code || customer.id}"`,
        after: {
          customer_id: customer.id,
          customer_code: customer.customer_code || null,
          customer_name: customer.full_name || null
        },
        references: {
          sale_id: saleId,
          customer_id: customer.id,
          receipt_no: updatedSale?.receipt_no || saleRow.receipt_no || null,
          sale_number: updatedSale?.sale_number || saleRow.sale_number || null
        }
      }
    })

    res.json(updatedSale)
  } catch (err) {
    await conn.rollback().catch(() => {})
    console.error(err)
    res.status(getErrorStatus(err)).json({ error: getErrorMessage(err, 'failed to link sale customer') })
  } finally {
    conn.release()
  }
})

router.post('/', express.json(), verifyToken, authorize('sales.create'), async (req, res) => {
  await ensureSalesSchema()
  const conn = await db.pool.getConnection()

  try {
    await conn.beginTransaction()
    await ensureScannerSchema(conn)

    const {
      draft_sale_id,
      items,
      payment_method,
      payment_amount,
      discount_percentage
    } = req.body || {}
    const permissions = Array.isArray(req.auth?.permissions) ? req.auth.permissions : []
    const canApplyDiscount = hasPermission(permissions, 'sales.discount')
    const canOverridePrice = hasPermission(permissions, 'sales.price_override')

    if (hasOwn(req.body, 'customer_id') || hasOwn(req.body, 'customer')) {
      throw createHttpError(400, 'customer_id and customer fields are no longer supported in sales payload')
    }

    if (!PAYMENT_METHODS.includes(String(payment_method))) {
      throw createHttpError(400, 'invalid payment_method')
    }

    const tenderedAmount = Number(payment_amount)
    if (!Number.isFinite(tenderedAmount) || tenderedAmount <= 0) {
      throw createHttpError(400, 'payment_amount must be greater than 0')
    }

    const runtimeConfig = await getRuntimeConfig(conn)
    let processedItems
    let subtotal
    let productRows
    let saleId = null
    let resolvedCustomerId = null
    let customerNameSnapshot = WALK_IN_CUSTOMER_LABEL
    let customerPhoneSnapshot = null
    let customerEmailSnapshot = null

    if (draft_sale_id !== undefined && draft_sale_id !== null && draft_sale_id !== '') {
      const preparedDraft = await prepareDraftSaleForCheckout(conn, Number(draft_sale_id), {
        allowPriceOverride: canOverridePrice
      })
      processedItems = preparedDraft.processedItems
      subtotal = preparedDraft.subtotal
      productRows = preparedDraft.productRows
      saleId = preparedDraft.sale.id
      resolvedCustomerId = Number(preparedDraft.sale.customer_id) > 0 ? Number(preparedDraft.sale.customer_id) : null
      customerNameSnapshot = normalizeOptionalText(preparedDraft.sale.customer_name_snapshot || preparedDraft.sale.customer_name) || WALK_IN_CUSTOMER_LABEL
      customerPhoneSnapshot = normalizeOptionalText(preparedDraft.sale.customer_phone_snapshot || preparedDraft.sale.customer_phone)
      customerEmailSnapshot = normalizeOptionalText(preparedDraft.sale.customer_email_snapshot || preparedDraft.sale.customer_email)
    } else {
      const preparedItems = await prepareSaleItems(conn, items, {
        allowPriceOverride: canOverridePrice
      })
      processedItems = preparedItems.processedItems
      subtotal = preparedItems.subtotal
      productRows = preparedItems.productRows
    }

    const discountPct = normalizeDiscountPercentage(discount_percentage)
    if (discountPct > 0 && !canApplyDiscount) {
      throw createHttpError(403, 'You do not have permission to apply discounts')
    }

    const discountAmt = roundMoney(subtotal * (discountPct / 100))
    const subtotalAfterDiscount = Math.max(subtotal - discountAmt, 0)
    const taxBreakdown = calculateSaleTaxBreakdown(subtotalAfterDiscount, runtimeConfig.taxRate)
    
    // Philippine VAT (12% Inclusive)
    // Formula: If total is ₱500, customer pays ₱500
    // Vatable Sales = Total / 1.12
    // VAT Amount = Total - Vatable Sales
    const vatableSales = taxBreakdown.vatableSales
    const taxAmt = taxBreakdown.vatAmount
    const total = taxBreakdown.total

    if (total <= 0) {
      throw createHttpError(400, 'total must be greater than 0')
    }

    const amountReceived = roundMoney(tenderedAmount)
    if (amountReceived < total) {
      throw createHttpError(400, 'payment must be greater than or equal to total amount')
    }

    const changeAmount = roundMoney(amountReceived - total)
    const orderNote = null
    const saleNumber = await generateDocumentNumber(conn, 'sales', 'sale_number', 'SAL')
    const receiptNo = await generateDocumentNumber(conn, 'sales', 'receipt_no', 'RCT')

    if (!resolvedCustomerId) {
      const walkInCustomer = await createWalkInCustomerProfile(conn, { receiptNo, saleNumber, saleId })
      resolvedCustomerId = walkInCustomer.id
      customerNameSnapshot = WALK_IN_CUSTOMER_LABEL
      customerPhoneSnapshot = null
      customerEmailSnapshot = null
    }

    if (saleId) {
      await conn.query(
        `UPDATE sales
         SET sale_number = ?,
             clerk_id = ?,
             customer_id = ?,
             customer_name_snapshot = ?,
             customer_phone_snapshot = ?,
             customer_email_snapshot = ?,
             order_note = ?,
             subtotal = ?,
             vatable_sales = ?,
             vat_amount = ?,
             tax_calculation_method = ?,
             tax = ?,
             discount = ?,
             total = ?,
             payment_method = ?,
             receipt_no = ?,
             status = 'COMPLETED'
         WHERE id = ?
           AND status = 'DRAFT'`,
        [
          saleNumber,
          req.auth.id,
          resolvedCustomerId,
          customerNameSnapshot,
          customerPhoneSnapshot,
          customerEmailSnapshot,
          orderNote,
          subtotal,
          vatableSales,
          taxAmt,
          taxBreakdown.taxCalculationMethod,
          taxAmt,
          discountAmt,
          total,
          payment_method,
          receiptNo,
          saleId
        ]
      )
    } else {
      const [saleResult] = await conn.query(
        `INSERT INTO sales (
          sale_number, clerk_id, customer_id, customer_name_snapshot, customer_phone_snapshot, customer_email_snapshot, order_note,
          subtotal, vatable_sales, vat_amount, tax_calculation_method, tax, discount, total, payment_method, receipt_no, status
        )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'COMPLETED')`,
        [
          saleNumber,
          req.auth.id,
          resolvedCustomerId,
          customerNameSnapshot,
          customerPhoneSnapshot,
          customerEmailSnapshot,
          orderNote,
          subtotal,
          vatableSales,
          taxAmt,
          taxBreakdown.taxCalculationMethod,
          taxAmt,
          discountAmt,
          total,
          payment_method,
          receiptNo
        ]
      )

      saleId = saleResult.insertId
    }

    await conn.query(
      `INSERT INTO sales_payments (sale_id, amount_received, change_amount, payment_method, received_by)
       VALUES (?, ?, ?, ?, ?)`,
      [saleId, amountReceived, changeAmount, payment_method, req.auth.id]
    )

    if (draft_sale_id !== undefined && draft_sale_id !== null && draft_sale_id !== '') {
      await applyDraftSaleInventoryChanges(conn, processedItems, productRows, req.auth.id, {
        saleId,
        saleNumber,
        receiptNo
      })
    } else {
      await applySaleInventoryChanges(conn, processedItems, productRows, req.auth.id, {
        saleId,
        saleNumber,
        receiptNo
      })
    }

    await conn.commit()

    const sale = await getSaleById(conn, saleId)
    const saleAdjustments = summarizeSaleAdjustments(processedItems, productRows)

    await logAuditEventSafe(db.pool, {
      userId: req.auth.id,
      action: 'SALE_COMPLETED',
      resourceType: 'Sale',
      resourceId: saleId,
      details: {
        module: 'sales',
        severity: discountPct > 0 || saleAdjustments.priceOverrides > 0 ? 'high' : 'medium',
        target_label: sale?.receipt_no || sale?.sale_number || `Sale #${saleId}`,
        summary: `Completed sale "${sale?.receipt_no || sale?.sale_number || saleId}"`,
        after: {
          sale_number: sale?.sale_number || null,
          receipt_no: sale?.receipt_no || null,
          payment_method: sale?.payment_method || null,
          total: sale?.total || 0,
          discount: sale?.discount || 0,
          tax: sale?.tax || 0,
          status: sale?.status || null
        },
        metrics: {
          items_sold: saleAdjustments.quantity,
          price_overrides_count: saleAdjustments.priceOverrides,
          discount_percentage: discountPct,
          total: sale?.total || 0
        },
        references: {
          sale_id: saleId,
          sale_number: sale?.sale_number || null,
          receipt_no: sale?.receipt_no || null
        },
        metadata: {
          has_discount: discountPct > 0,
          has_price_override: saleAdjustments.priceOverrides > 0
        }
      }
    })

    if (discountPct > 0) {
      await logAuditEventSafe(db.pool, {
        userId: req.auth.id,
        action: 'DISCOUNT_APPLIED',
        resourceType: 'Sale',
        resourceId: saleId,
        details: {
          module: 'sales',
          severity: 'medium',
          result: 'adjusted',
          target_label: sale?.receipt_no || sale?.sale_number || `Sale #${saleId}`,
          summary: `Applied ${discountPct}% discount to "${sale?.receipt_no || sale?.sale_number || saleId}"`,
          metrics: {
            discount_percentage: discountPct,
            discount_amount: sale?.discount || 0
          },
          references: {
            sale_id: saleId,
            sale_number: sale?.sale_number || null,
            receipt_no: sale?.receipt_no || null
          }
        }
      })
    }

    res.json({
      ...sale,
      discount_percentage: discountPct,
      tax_rate: runtimeConfig.taxRate,
      tax_rate_percentage: roundMoney(runtimeConfig.taxRate * 100),
      currency: runtimeConfig.currency
    })
  } catch (err) {
    await conn.rollback()
    console.error(err)
    res.status(getErrorStatus(err)).json({ error: getErrorMessage(err, 'sale creation failed') })
  } finally {
    conn.release()
  }
})

router.post('/returns', express.json(), verifyToken, authorize('sales.refund'), async (req, res) => {
  await ensureSalesSchema()
  const conn = await db.pool.getConnection()

  try {
    await conn.beginTransaction()
    await ensureScannerSchema(conn)

    const { receipt_no, sale_id, items, reason, accounting_reference, return_disposition } = req.body || {}
    if (!receipt_no && !sale_id) {
      throw createHttpError(400, 'receipt_no or sale_id is required')
    }

    const sale = await getLockedSale(conn, { saleId: sale_id ? Number(sale_id) : null, receiptNo: receipt_no })
    if (!sale) throw createHttpError(404, 'sale not found')

    const returnedItems = await processSaleReturn(conn, sale, items, req.auth.id, reason, accounting_reference, return_disposition)
    const updatedSale = await getSaleById(conn, sale.id)

    await conn.commit()

    await logAuditEventSafe(db.pool, {
      userId: req.auth.id,
      action: 'SALE_RETURN',
      resourceType: 'Sale',
      resourceId: sale.id,
      details: {
        module: 'sales',
        severity: 'high',
        target_label: updatedSale?.receipt_no || updatedSale?.sale_number || `Sale #${sale.id}`,
        summary: `Processed return for "${updatedSale?.receipt_no || updatedSale?.sale_number || sale.id}"`,
        reason: reason || null,
        after: {
          sale_number: updatedSale?.sale_number || null,
          receipt_no: updatedSale?.receipt_no || null,
          status: updatedSale?.status || null,
          returned_qty: updatedSale?.returned_qty || 0,
          returned_amount: updatedSale?.returned_amount || 0
        },
        metrics: {
          returned_items_count: returnedItems.length,
          returned_quantity: returnedItems.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0)
        },
        references: {
          sale_id: sale.id,
          sale_number: updatedSale?.sale_number || null,
          receipt_no: updatedSale?.receipt_no || null,
          accounting_reference: accounting_reference || null,
          return_disposition: return_disposition || null
        }
      }
    })

    res.json({
      success: true,
      returned_items: returnedItems,
      sale: updatedSale
    })
  } catch (err) {
    await conn.rollback()
    console.error(err)
    res.status(getErrorStatus(err)).json({ error: getErrorMessage(err, 'return failed') })
  } finally {
    conn.release()
  }
})

router.post('/:id/refund', express.json(), verifyToken, authorize('sales.refund'), async (req, res) => {
  await ensureSalesSchema()
  const conn = await db.pool.getConnection()

  try {
    await conn.beginTransaction()
    await ensureScannerSchema(conn)

    const { accounting_reference, return_disposition } = req.body || {}

    const sale = await getLockedSale(conn, { saleId: Number(req.params.id) })
    if (!sale) throw createHttpError(404, 'sale not found')

    const remainingItems = (sale.items || [])
      .filter((item) => Number(item.available_to_return) > 0)
      .map((item) => ({
        sale_item_id: item.id,
        quantity: Number(item.available_to_return)
      }))

    if (!remainingItems.length) {
      throw createHttpError(400, 'sale already fully refunded')
    }

    const returnedItems = await processSaleReturn(conn, sale, remainingItems, req.auth.id, 'full refund', accounting_reference, return_disposition)
    const updatedSale = await getSaleById(conn, sale.id)

    await conn.commit()

    await logAuditEventSafe(db.pool, {
      userId: req.auth.id,
      action: 'SALE_REFUND',
      resourceType: 'Sale',
      resourceId: sale.id,
      details: {
        module: 'sales',
        severity: 'high',
        target_label: updatedSale?.receipt_no || updatedSale?.sale_number || `Sale #${sale.id}`,
        summary: `Refunded sale "${updatedSale?.receipt_no || updatedSale?.sale_number || sale.id}"`,
        reason: 'full refund',
        after: {
          sale_number: updatedSale?.sale_number || null,
          receipt_no: updatedSale?.receipt_no || null,
          status: updatedSale?.status || null,
          returned_qty: updatedSale?.returned_qty || 0,
          returned_amount: updatedSale?.returned_amount || 0
        },
        metrics: {
          refunded_items_count: returnedItems.length,
          refunded_quantity: returnedItems.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0)
        },
        references: {
          sale_id: sale.id,
          sale_number: updatedSale?.sale_number || null,
          receipt_no: updatedSale?.receipt_no || null,
          accounting_reference: accounting_reference || null,
          return_disposition: return_disposition || null
        }
      }
    })

    await logAuditEventSafe(db.pool, {
      userId: req.auth.id,
      action: 'SALE_VOIDED',
      resourceType: 'Sale',
      resourceId: sale.id,
      details: {
        module: 'sales',
        severity: 'high',
        result: 'reversed',
        target_label: updatedSale?.receipt_no || updatedSale?.sale_number || `Sale #${sale.id}`,
        summary: `Voided sale "${updatedSale?.receipt_no || updatedSale?.sale_number || sale.id}" via full refund`,
        reason: 'full refund',
        after: {
          sale_number: updatedSale?.sale_number || null,
          receipt_no: updatedSale?.receipt_no || null,
          status: updatedSale?.status || null,
          returned_qty: updatedSale?.returned_qty || 0,
          returned_amount: updatedSale?.returned_amount || 0
        },
        references: {
          sale_id: sale.id,
          sale_number: updatedSale?.sale_number || null,
          receipt_no: updatedSale?.receipt_no || null,
          accounting_reference: accounting_reference || null,
          return_disposition: return_disposition || null
        }
      }
    })

    res.json({
      success: true,
      returned_items: returnedItems,
      sale: updatedSale
    })
  } catch (err) {
    await conn.rollback()
    console.error(err)
    res.status(getErrorStatus(err)).json({ error: getErrorMessage(err, 'refund failed') })
  } finally {
    conn.release()
  }
})

module.exports = router
