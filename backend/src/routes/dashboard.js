const express = require('express')
const router = express.Router()
const db = require('../database')
const { verifyToken, getUserPermissions } = require('../middleware/authMiddleware')

// Dashboard summary stats
router.get('/stats', verifyToken, async (req, res) => {
  try {
    const results = {}
    const permissionInfo = await getUserPermissions(req.auth.id)
    const roleNames = Array.isArray(permissionInfo?.roles) ? permissionInfo.roles : []
    const isSalesClerk = roleNames.some((roleName) => String(roleName || '').trim().toLowerCase() === 'sales clerk')

    results.dashboard_profile = isSalesClerk ? 'sales_clerk' : 'default'

    // Cards visible to every dashboard profile
    const [todaySales] = await db.pool.query(
      `SELECT COALESCE(SUM(total), 0) AS today_sales, COUNT(*) AS today_orders
       FROM sales WHERE status = 'COMPLETED' AND DATE(date) = CURDATE()`
    )
    results.today_sales = parseFloat(todaySales[0].today_sales) || 0
    results.today_orders = todaySales[0].today_orders || 0

    // Active products count
    const [prodCount] = await db.pool.query(
      `SELECT COUNT(*) AS count FROM products WHERE is_active = 1`
    )
    results.products_count = prodCount[0].count || 0

    // Low stock count
    const [lowStock] = await db.pool.query(
      `SELECT COUNT(*) AS count FROM products WHERE stock_quantity <= low_stock_threshold AND is_active = 1`
    )
    results.low_stock_count = lowStock[0].count || 0

    if (!isSalesClerk) {
      // Total sales (all time revenue)
      const [salesTotal] = await db.pool.query(
        `SELECT COALESCE(SUM(total), 0) AS total_sales, COUNT(*) AS total_orders FROM sales WHERE status = 'COMPLETED'`
      )
      results.total_sales = parseFloat(salesTotal[0].total_sales) || 0
      results.total_orders = salesTotal[0].total_orders || 0

      // Customer count
      const [custCount] = await db.pool.query(
        `SELECT COUNT(*) AS count FROM customers`
      )
      results.customers_count = custCount[0].count || 0

      // Active employees count
      const [empCount] = await db.pool.query(
        `SELECT COUNT(*) AS count FROM employees WHERE employment_status = 'ACTIVE'`
      )
      results.employees_count = empCount[0].count || 0

      // Payroll this month (from finalized/released runs)
      results.payroll_month_total = 0
      results.payroll_month_employees = 0
      results.payroll_period_count = 0
      try {
        const [payrollMonth] = await db.pool.query(
          `SELECT
             COALESCE(SUM(items.net_pay), 0) AS net_total,
             COALESCE(SUM(items.gross_pay), 0) AS gross_total,
             COUNT(DISTINCT items.user_id) AS employee_count,
             COUNT(DISTINCT periods.id) AS period_count
           FROM payroll_run_items items
           JOIN payroll_runs runs ON runs.id = items.payroll_run_id
           JOIN payroll_periods periods ON periods.id = runs.payroll_period_id
           WHERE runs.status IN ('finalized', 'released')
             AND periods.start_date >= DATE_FORMAT(CURDATE(), '%Y-%m-01')
             AND periods.start_date < DATE_ADD(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL 1 MONTH)`
        )
        results.payroll_month_total = parseFloat(payrollMonth[0]?.net_total) || 0
        results.payroll_month_gross = parseFloat(payrollMonth[0]?.gross_total) || 0
        results.payroll_month_employees = Number(payrollMonth[0]?.employee_count) || 0
        results.payroll_period_count = Number(payrollMonth[0]?.period_count) || 0
      } catch (err) {
        if (err?.code !== 'ER_NO_SUCH_TABLE') {
          console.error('dashboard payroll month query error:', err)
        }
      }

      // Draft/computed periods (pending payroll action)
      results.pending_payroll_count = 0
      try {
        const [pendingPeriods] = await db.pool.query(
          `SELECT COUNT(*) AS count FROM payroll_periods WHERE status IN ('draft', 'computed')`
        )
        results.pending_payroll_count = pendingPeriods[0].count || 0
      } catch (err) {
        if (err?.code !== 'ER_NO_SUCH_TABLE') {
          console.error('dashboard pending payroll query error:', err)
        }
      }

      // Lean bale snapshot (current calendar month)
      results.bales_month_count = 0
      results.bale_spend_month = 0
      results.bales_30d_count = 0
      results.bale_spend_30d = 0

      try {
        const [baleSnapshot] = await db.pool.query(
          `SELECT
             COALESCE(SUM(
               CASE WHEN bp.purchase_date >= DATE_FORMAT(CURDATE(), '%Y-%m-01')
                      AND bp.purchase_date < DATE_ADD(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL 1 MONTH)
                 THEN 1 ELSE 0 END
             ), 0) AS bales_month_count,
             COALESCE(SUM(
               CASE WHEN bp.purchase_date >= DATE_FORMAT(CURDATE(), '%Y-%m-01')
                      AND bp.purchase_date < DATE_ADD(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL 1 MONTH)
                 THEN COALESCE(bp.total_purchase_cost, bp.bale_cost, 0)
                 ELSE 0
               END
             ), 0) AS bale_spend_month
           FROM bale_purchases bp`
        )
        results.bales_month_count = Number(baleSnapshot[0]?.bales_month_count) || 0
        results.bale_spend_month = parseFloat(baleSnapshot[0]?.bale_spend_month) || 0
        results.bales_30d_count = results.bales_month_count
        results.bale_spend_30d = results.bale_spend_month
      } catch (err) {
        if (err?.code !== 'ER_NO_SUCH_TABLE') {
          console.error('dashboard bale month snapshot query error:', err)
        }
      }
    }

    // Recent sales (last 5)
    const [recentSales] = await db.pool.query(
      `SELECT s.id, s.sale_number, s.total, s.payment_method, s.date, u.username AS clerk
       FROM sales s LEFT JOIN users u ON u.id = s.clerk_id
       WHERE s.status = 'COMPLETED'
       ORDER BY s.date DESC LIMIT 5`
    )
    results.recent_sales = recentSales

    // Top selling products (last 30 days)
    const [topProducts] = await db.pool.query(
      `SELECT p.name, SUM(si.qty) AS total_qty, SUM(si.line_total) AS total_revenue
       FROM sale_items si
       JOIN sales s ON s.id = si.sale_id
       JOIN products p ON p.id = si.product_id
       WHERE s.status = 'COMPLETED' AND s.date >= DATE_SUB(NOW(), INTERVAL 30 DAY)
       GROUP BY si.product_id, p.name
       ORDER BY total_qty DESC LIMIT 5`
    )
    results.top_products = topProducts

    res.json(results)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'failed to fetch dashboard stats' })
  }
})

module.exports = router
