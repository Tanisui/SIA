const express = require('express')
const router = express.Router()
const db = require('../database')
const { verifyToken, authorize } = require('../middleware/authMiddleware')
const {
  ensureSalesSchema,
  buildDateFilter,
  roundMoney
} = require('../utils/salesSupport')
const {
  getAutomatedReports,
  buildAutomatedReportsCsv
} = require('../utils/automatedReports')

let ensureReportsSchemaPromise = null

async function ensureReportsSchema() {
  if (ensureReportsSchemaPromise) return ensureReportsSchemaPromise

  ensureReportsSchemaPromise = (async () => {
    await db.pool.query(`
      CREATE TABLE IF NOT EXISTS saved_reports (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        filters JSON,
        owner_id BIGINT UNSIGNED,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `)

    await db.pool.query(`
      CREATE TABLE IF NOT EXISTS expenses (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        expense_date DATE NOT NULL,
        category VARCHAR(255),
        description TEXT,
        amount DECIMAL(12,2) DEFAULT 0.00,
        vendor VARCHAR(255),
        employee_id BIGINT UNSIGNED,
        status ENUM('PENDING','APPROVED','REJECTED','PAID') DEFAULT 'PENDING',
        approved_by BIGINT UNSIGNED,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE SET NULL,
        FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `)
  })().catch((err) => {
    ensureReportsSchemaPromise = null
    throw err
  })

  return ensureReportsSchemaPromise
}

router.get('/overview', verifyToken, authorize(['reports.view', 'finance.reports.view']), async (req, res) => {
  try {
    await ensureSalesSchema()
    await ensureReportsSchema()

    const { from, to } = req.query

    const salesParams = []
    const salesDateFilter = buildDateFilter('s', 'date', from, to, salesParams)
    const [salesTotalsRows] = await db.pool.query(`
      SELECT
        COUNT(*) AS total_orders,
        COALESCE(SUM(s.subtotal), 0) AS gross_sales,
        COALESCE(SUM(s.discount), 0) AS total_discounts,
        COALESCE(SUM(s.tax), 0) AS tax_collected,
        COALESCE(SUM(s.total), 0) AS total_sales,
        SUM(CASE WHEN s.status = 'REFUNDED' THEN 1 ELSE 0 END) AS refunded_orders
      FROM sales s
      WHERE 1=1${salesDateFilter}
    `, salesParams)

    const returnParams = []
    const returnDateFilter = buildDateFilter('sri', 'created_at', from, to, returnParams)
    const [returnsRows] = await db.pool.query(`
      SELECT
        COUNT(*) AS return_transactions,
        COALESCE(SUM(sri.quantity), 0) AS returned_units,
        COALESCE(SUM(sri.quantity * sri.unit_price), 0) AS returns_total
      FROM sale_return_items sri
      JOIN sales s ON s.id = sri.sale_id
      WHERE 1=1${returnDateFilter}
    `, returnParams)

    const paymentParams = []
    const paymentDateFilter = buildDateFilter('s', 'date', from, to, paymentParams)
    const [paymentBreakdown] = await db.pool.query(`
      SELECT
        s.payment_method,
        COUNT(*) AS count,
        COALESCE(SUM(s.total), 0) AS total
      FROM sales s
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

    const expenseParams = []
    const expenseDateFilter = buildDateFilter('ex', 'expense_date', from, to, expenseParams)
    const [expenseTotalsRows] = await db.pool.query(`
      SELECT
        COALESCE(SUM(ex.amount), 0) AS total_expenses,
        COALESCE(SUM(CASE WHEN ex.status IN ('APPROVED', 'PAID') THEN ex.amount ELSE 0 END), 0) AS approved_paid_expenses,
        COALESCE(SUM(CASE WHEN ex.status = 'PENDING' THEN ex.amount ELSE 0 END), 0) AS pending_expenses,
        COALESCE(SUM(CASE WHEN ex.status = 'REJECTED' THEN ex.amount ELSE 0 END), 0) AS rejected_expenses,
        COUNT(*) AS expense_entries
      FROM expenses ex
      WHERE 1=1${expenseDateFilter}
    `, expenseParams)

    const expenseCategoryParams = []
    const expenseCategoryDateFilter = buildDateFilter('ex', 'expense_date', from, to, expenseCategoryParams)
    const [expensesByCategory] = await db.pool.query(`
      SELECT
        COALESCE(NULLIF(ex.category, ''), 'Uncategorized') AS category,
        COUNT(*) AS count,
        COALESCE(SUM(ex.amount), 0) AS total
      FROM expenses ex
      WHERE 1=1${expenseCategoryDateFilter}
      GROUP BY COALESCE(NULLIF(ex.category, ''), 'Uncategorized')
      ORDER BY total DESC
    `, expenseCategoryParams)

    const salesTotals = salesTotalsRows[0] || {}
    const returnTotals = returnsRows[0] || {}
    const expenseTotals = expenseTotalsRows[0] || {}
    const totalSales = roundMoney(salesTotals.total_sales)
    const returnsTotal = roundMoney(returnTotals.returns_total)
    const approvedPaidExpenses = roundMoney(expenseTotals.approved_paid_expenses)

    res.json({
      generated_at: new Date().toISOString(),
      filters: {
        from: from || null,
        to: to || null
      },
      revenue_report: {
        gross_sales: roundMoney(salesTotals.gross_sales),
        total_discounts: roundMoney(salesTotals.total_discounts),
        tax_collected: roundMoney(salesTotals.tax_collected),
        total_sales,
        returns_total: returnsTotal,
        net_revenue: roundMoney(totalSales - returnsTotal),
        net_after_expenses: roundMoney(totalSales - returnsTotal - approvedPaidExpenses)
      },
      expenses_report: {
        total_expenses: roundMoney(expenseTotals.total_expenses),
        approved_paid_expenses: approvedPaidExpenses,
        pending_expenses: roundMoney(expenseTotals.pending_expenses),
        rejected_expenses: roundMoney(expenseTotals.rejected_expenses),
        expense_entries: Number(expenseTotals.expense_entries) || 0,
        by_category: expensesByCategory.map((row) => ({
          ...row,
          total: roundMoney(row.total)
        }))
      },
      sales_report: {
        total_orders: Number(salesTotals.total_orders) || 0,
        refunded_orders: Number(salesTotals.refunded_orders) || 0,
        return_transactions: Number(returnTotals.return_transactions) || 0,
        returned_units: Number(returnTotals.returned_units) || 0,
        by_payment_method: paymentBreakdown.map((row) => ({
          ...row,
          total: roundMoney(row.total)
        })),
        top_products: topProducts.map((row) => ({
          ...row,
          total_qty: Number(row.total_qty) || 0,
          returned_qty: Number(row.returned_qty) || 0,
          net_qty: Number(row.net_qty) || 0,
          net_sales: roundMoney(row.net_sales)
        }))
      }
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'failed to generate automated reports' })
  }
})

/**
 * Bale-aware automated reports response shape:
 * {
 *   generated_at, filters: { from, to },
 *   summary,
 *   balePurchases, balePurchasesTotals,
 *   baleBreakdowns,
 *   salesByBale, salesByBaleTotals,
 *   baleProfitability, profitabilityHighlights,
 *   supplierPerformance,
 *   inventoryMovement
 * }
 */
router.get('/automated', verifyToken, authorize(['reports.view', 'finance.reports.view']), async (req, res) => {
  try {
    const payload = await getAutomatedReports(req.query?.from, req.query?.to)
    res.json(payload)
  } catch (err) {
    console.error(err)
    const statusCode = err?.statusCode || 500
    const isValidationError = statusCode >= 400 && statusCode < 500

    res.status(statusCode).json({
      error: isValidationError
        ? err.message
        : 'Unable to generate bale-aware automated reports right now.',
      details: isValidationError
        ? 'Please review your date range and try again.'
        : 'Check database connectivity and report table schema, then retry.',
      code: isValidationError ? 'REPORT_INPUT_INVALID' : 'REPORT_GENERATION_FAILED'
    })
  }
})

router.get('/automated/export', verifyToken, authorize(['reports.export', 'finance.reports.view', 'reports.view']), async (req, res) => {
  try {
    const format = String(req.query?.format || 'csv').trim().toLowerCase()
    if (format !== 'csv') {
      return res.status(400).json({
        error: 'Unsupported export format. Use format=csv.',
        details: 'Only CSV export is currently available for automated bale reports.'
      })
    }

    const payload = await getAutomatedReports(req.query?.from, req.query?.to)
    const csv = buildAutomatedReportsCsv(payload)
    const from = payload?.filters?.from || 'from'
    const to = payload?.filters?.to || 'to'
    const filename = `automated-bale-reports-${from}-to-${to}.csv`

    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.send(csv)
  } catch (err) {
    console.error(err)
    const statusCode = err?.statusCode || 500
    const isValidationError = statusCode >= 400 && statusCode < 500

    res.status(statusCode).json({
      error: isValidationError
        ? err.message
        : 'Unable to export bale-aware automated reports right now.',
      details: isValidationError
        ? 'Please review your date range and export format.'
        : 'Retry in a few moments after confirming report data is available.',
      code: isValidationError ? 'REPORT_EXPORT_INPUT_INVALID' : 'REPORT_EXPORT_FAILED'
    })
  }
})

router.get('/', verifyToken, authorize('reports.view'), async (req, res) => {
  try {
    await ensureReportsSchema()
    const [rows] = await db.pool.query(
      `SELECT r.*, u.username AS owner_name
       FROM saved_reports r
       LEFT JOIN users u ON u.id = r.owner_id
       ORDER BY r.created_at DESC`
    )
    res.json(rows)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'failed to fetch reports' })
  }
})

router.get('/:id', verifyToken, authorize('reports.view'), async (req, res) => {
  try {
    await ensureReportsSchema()
    const [rows] = await db.pool.query(
      `SELECT r.*, u.username AS owner_name
       FROM saved_reports r
       LEFT JOIN users u ON u.id = r.owner_id
       WHERE r.id = ? LIMIT 1`,
      [req.params.id]
    )
    if (!rows.length) return res.status(404).json({ error: 'report not found' })
    res.json(rows[0])
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'failed to fetch report' })
  }
})

router.post('/', express.json(), verifyToken, authorize('reports.generate'), async (req, res) => {
  try {
    await ensureReportsSchema()
    const { name, filters } = req.body || {}
    if (!name) return res.status(400).json({ error: 'name is required' })

    const [result] = await db.pool.query(
      `INSERT INTO saved_reports (name, filters, owner_id) VALUES (?, ?, ?)`,
      [name, filters ? JSON.stringify(filters) : null, req.auth.id]
    )
    res.json({ id: result.insertId })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'failed to create report' })
  }
})

router.put('/:id', express.json(), verifyToken, authorize('reports.generate'), async (req, res) => {
  try {
    await ensureReportsSchema()
    const { name, filters } = req.body || {}
    const updates = []
    const params = []
    if (name !== undefined) {
      updates.push('name = ?')
      params.push(name)
    }
    if (filters !== undefined) {
      updates.push('filters = ?')
      params.push(JSON.stringify(filters))
    }
    if (!updates.length) return res.status(400).json({ error: 'nothing to update' })

    params.push(req.params.id)
    await db.pool.query(`UPDATE saved_reports SET ${updates.join(', ')} WHERE id = ?`, params)
    res.json({ success: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'failed to update report' })
  }
})

router.delete('/:id', verifyToken, authorize('reports.generate'), async (req, res) => {
  try {
    await ensureReportsSchema()
    await db.pool.query('DELETE FROM saved_reports WHERE id = ?', [req.params.id])
    res.json({ success: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'failed to delete report' })
  }
})

module.exports = router
