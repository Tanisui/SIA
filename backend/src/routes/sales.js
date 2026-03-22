const express = require('express')
const router = express.Router()
const db = require('../database')
const { verifyToken, authorize } = require('../middleware/authMiddleware')
const {
  PAYMENT_METHODS,
  MOBILE_BANK_APPS,
  roundMoney,
  normalizeDiscountPercentage,
  ensureSalesSchema,
  buildDateFilter,
  enrichSaleRecord,
  generateDocumentNumber,
  prepareSaleItems,
  applySaleInventoryChanges,
  getSaleItems,
  getSaleById,
  getSaleByReceipt,
  processSaleReturn
} = require('../utils/salesSupport')

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

async function getLockedSale(conn, { saleId, receiptNo }) {
  const [rows] = saleId
    ? await conn.query('SELECT id FROM sales WHERE id = ? FOR UPDATE', [saleId])
    : await conn.query('SELECT id FROM sales WHERE receipt_no = ? FOR UPDATE', [String(receiptNo || '').trim()])

  if (!rows.length) return null
  return getSaleById(conn, rows[0].id)
}

router.get('/config', verifyToken, authorize(['sales.view', 'sales.create']), async (req, res) => {
  try {
    await ensureSalesSchema()
    res.json({
      discount_type: 'percentage',
      tax_rate: 0,
      tax_rate_percentage: 0,
      payment_methods: PAYMENT_METHODS
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'failed to load sales configuration' })
  }
})

router.get('/products', verifyToken, authorize(['sales.view', 'sales.create', 'products.view']), async (req, res) => {
  try {
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
      WHERE 1=1${totalsDateFilter}
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
      WHERE 1=1${returnsDateFilter}
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
      WHERE 1=1${paymentDateFilter}
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
      WHERE 1=1${topProductDateFilter}
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
        sp.bank_app_used,
        sp.reference_number,
        u.username AS user_name,
        COALESCE(s.customer_name_snapshot, c.name) AS customer_name,
        COALESCE(s.customer_phone_snapshot, c.phone) AS customer_phone
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
        u.username AS user_name
      FROM sale_return_items sri
      JOIN sales s ON s.id = sri.sale_id
      LEFT JOIN products p ON p.id = sri.product_id
      LEFT JOIN users u ON u.id = sri.processed_by
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
    const { status, from, to, payment_method, receipt_no } = req.query

    let sql = `
      SELECT
        s.*,
        u.username AS clerk_name,
        COALESCE(s.customer_name_snapshot, c.name) AS customer_name,
        COALESCE(s.customer_phone_snapshot, c.phone) AS customer_phone,
        sp.amount_received,
        sp.change_amount,
        sp.bank_app_used,
        sp.reference_number,
        sp.reference_number AS payment_reference,
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
      WHERE 1=1
    `
    const params = []
    if (status) {
      sql += ' AND s.status = ?'
      params.push(status)
    }
    if (payment_method) {
      sql += ' AND s.payment_method = ?'
      params.push(payment_method)
    }
    if (receipt_no) {
      sql += ' AND s.receipt_no = ?'
      params.push(String(receipt_no).trim())
    }
    sql += buildDateFilter('s', 'date', from, to, params)
    sql += ' ORDER BY s.date DESC, s.id DESC'

    const [rows] = await db.pool.query(sql, params)
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

router.get('/:id', verifyToken, authorize('sales.view'), async (req, res) => {
  try {
    await ensureSalesSchema()
    const sale = await getSaleById(db.pool, Number(req.params.id))
    if (!sale) return res.status(404).json({ error: 'sale not found' })
    res.json(sale)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'failed to fetch sale' })
  }
})

router.post('/', express.json(), verifyToken, authorize('sales.create'), async (req, res) => {
  await ensureSalesSchema()
  const conn = await db.pool.getConnection()

  try {
    await conn.beginTransaction()

    const {
      customer_id,
      customer,
      items,
      payment_method,
      payment_amount,
      discount_percentage,
      bank_app_used,
      reference_number,
      payment_reference
    } = req.body || {}

    if (!PAYMENT_METHODS.includes(String(payment_method))) {
      throw createHttpError(400, 'invalid payment_method')
    }

    const tenderedAmount = Number(payment_amount)
    if (!Number.isFinite(tenderedAmount) || tenderedAmount <= 0) {
      throw createHttpError(400, 'payment_amount must be greater than 0')
    }

    const { processedItems, subtotal, productRows } = await prepareSaleItems(conn, items)
    const discountPct = normalizeDiscountPercentage(discount_percentage)
    const discountAmt = roundMoney(subtotal * (discountPct / 100))
    const taxableBase = Math.max(subtotal - discountAmt, 0)
    const taxAmt = 0
    const total = roundMoney(taxableBase)

    if (total <= 0) {
      throw createHttpError(400, 'total must be greater than 0')
    }

    const amountReceived = roundMoney(tenderedAmount)
    if (amountReceived < total) {
      throw createHttpError(400, 'payment must be greater than or equal to total amount')
    }

    let normalizedBankApp = null
    let normalizedReferenceNumber = null
    if (String(payment_method) === 'mobile_bank_transfer') {
      normalizedBankApp = String(bank_app_used || '').trim()
      if (!normalizedBankApp || !MOBILE_BANK_APPS.includes(normalizedBankApp)) {
        throw createHttpError(400, 'bank_app_used is required and must be a supported mobile banking app')
      }

      normalizedReferenceNumber = String(reference_number || payment_reference || '').trim()
      if (!normalizedReferenceNumber) {
        throw createHttpError(400, 'reference_number is required')
      }
    }

    const changeAmount = roundMoney(amountReceived - total)
    const saleNumber = await generateDocumentNumber(conn, 'sales', 'sale_number', 'SAL')
    const receiptNo = await generateDocumentNumber(conn, 'sales', 'receipt_no', 'RCT')

    let customerNameSnapshot = String(customer?.name || '').trim()
    let customerPhoneSnapshot = String(customer?.phone || '').trim() || null
    const orderNote = String(customer?.order_note || '').trim() || null

    if (!customerNameSnapshot && customer_id) {
      const [customerRows] = await conn.query('SELECT name, phone FROM customers WHERE id = ? LIMIT 1', [Number(customer_id)])
      if (customerRows.length) {
        customerNameSnapshot = String(customerRows[0].name || '').trim()
        if (!customerPhoneSnapshot) customerPhoneSnapshot = String(customerRows[0].phone || '').trim() || null
      }
    }

    if (!customerNameSnapshot) {
      throw createHttpError(400, 'customer.name is required')
    }

    let resolvedCustomerId = customer_id ? Number(customer_id) : null
    if (!resolvedCustomerId) {
      const [existingCustomers] = await conn.query(
        `SELECT id
         FROM customers
         WHERE LOWER(TRIM(name)) = LOWER(TRIM(?))
           AND COALESCE(TRIM(phone), '') = COALESCE(TRIM(?), '')
         ORDER BY id ASC
         LIMIT 1`,
        [customerNameSnapshot, customerPhoneSnapshot]
      )

      if (existingCustomers.length) {
        resolvedCustomerId = Number(existingCustomers[0].id)
      } else {
        const [customerInsert] = await conn.query(
          'INSERT INTO customers (name, phone, notes) VALUES (?, ?, ?)',
          [customerNameSnapshot, customerPhoneSnapshot, orderNote || null]
        )
        resolvedCustomerId = Number(customerInsert.insertId)
      }
    }

    const [saleResult] = await conn.query(
      `INSERT INTO sales (
        sale_number, clerk_id, customer_id, customer_name_snapshot, customer_phone_snapshot, order_note,
        subtotal, tax, discount, total, payment_method, receipt_no, status
      )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'COMPLETED')`,
      [
        saleNumber,
        req.auth.id,
        resolvedCustomerId,
        customerNameSnapshot,
        customerPhoneSnapshot,
        orderNote,
        subtotal,
        taxAmt,
        discountAmt,
        total,
        payment_method,
        receiptNo
      ]
    )

    const saleId = saleResult.insertId

    await conn.query(
      `INSERT INTO sales_payments (sale_id, amount_received, change_amount, payment_method, bank_app_used, reference_number, received_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [saleId, amountReceived, changeAmount, payment_method, normalizedBankApp, normalizedReferenceNumber, req.auth.id]
    )

    await applySaleInventoryChanges(conn, processedItems, productRows, req.auth.id, {
      saleId,
      saleNumber,
      receiptNo
    })

    await conn.commit()

    const sale = await getSaleById(conn, saleId)
    res.json({
      ...sale,
      discount_percentage: discountPct,
      tax_rate: 0
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

    const { receipt_no, sale_id, items, reason, accounting_reference, return_disposition } = req.body || {}
    if (!receipt_no && !sale_id) {
      throw createHttpError(400, 'receipt_no or sale_id is required')
    }

    const sale = await getLockedSale(conn, { saleId: sale_id ? Number(sale_id) : null, receiptNo: receipt_no })
    if (!sale) throw createHttpError(404, 'sale not found')

    const returnedItems = await processSaleReturn(conn, sale, items, req.auth.id, reason, accounting_reference, return_disposition)
    const updatedSale = await getSaleById(conn, sale.id)

    await conn.commit()
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
