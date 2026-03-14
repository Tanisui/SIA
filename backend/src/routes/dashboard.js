const express = require('express')
const router = express.Router()
const db = require('../database')
const { verifyToken } = require('../middleware/authMiddleware')

// Dashboard summary stats
router.get('/stats', verifyToken, async (req, res) => {
  try {
    const results = {}

    // Total sales (all time revenue)
    try {
      const [salesTotal] = await db.pool.query(
        `SELECT COALESCE(SUM(total), 0) AS total_sales, COUNT(*) AS total_orders FROM sales WHERE status = 'COMPLETED'`
      )
      results.total_sales = parseFloat(salesTotal[0]?.total_sales) || 0
      results.total_orders = salesTotal[0]?.total_orders || 0
    } catch (e) {
      console.error('Error fetching total sales:', e.message)
      results.total_sales = 0
      results.total_orders = 0
    }

    // Today's sales
    try {
      const [todaySales] = await db.pool.query(
        `SELECT COALESCE(SUM(total), 0) AS today_sales, COUNT(*) AS today_orders
         FROM sales WHERE status = 'COMPLETED' AND DATE(\`date\`) = CURDATE()`
      )
      results.today_sales = parseFloat(todaySales[0]?.today_sales) || 0
      results.today_orders = todaySales[0]?.today_orders || 0
    } catch (e) {
      console.error('Error fetching today sales:', e.message)
      results.today_sales = 0
      results.today_orders = 0
    }

    // Active products count
    try {
      const [prodCount] = await db.pool.query(
        `SELECT COUNT(*) AS count FROM products WHERE is_active = 1`
      )
      results.products_count = prodCount[0]?.count || 0
    } catch (e) {
      console.error('Error fetching products:', e.message)
      results.products_count = 0
    }

    // Low stock count
    try {
      const [lowStock] = await db.pool.query(
        `SELECT COUNT(*) AS count FROM products WHERE stock_quantity <= low_stock_threshold AND is_active = 1`
      )
      results.low_stock_count = lowStock[0]?.count || 0
    } catch (e) {
      console.error('Error fetching low stock:', e.message)
      results.low_stock_count = 0
    }

    // Customer count
    try {
      const [custCount] = await db.pool.query(
        `SELECT COUNT(*) AS count FROM customers`
      )
      results.customers_count = custCount[0]?.count || 0
    } catch (e) {
      console.error('Error fetching customers:', e.message)
      results.customers_count = 0
    }

    // Active employees count
    try {
      const [empCount] = await db.pool.query(
        `SELECT COUNT(*) AS count FROM employees WHERE employment_status = 'ACTIVE'`
      )
      results.employees_count = empCount[0]?.count || 0
    } catch (e) {
      console.error('Error fetching employees:', e.message)
      results.employees_count = 0
    }

    // Pending payroll count
    try {
      const [pendingPayroll] = await db.pool.query(
        `SELECT COUNT(*) AS count, COALESCE(SUM(net_pay), 0) AS total FROM payrolls WHERE status = 'PENDING'`
      )
      results.pending_payroll_count = pendingPayroll[0]?.count || 0
      results.pending_payroll_total = parseFloat(pendingPayroll[0]?.total) || 0
    } catch (e) {
      console.error('Error fetching payroll:', e.message)
      results.pending_payroll_count = 0
      results.pending_payroll_total = 0
    }

    // Open purchase orders
    try {
      const [openPO] = await db.pool.query(
        `SELECT COUNT(*) AS count FROM purchase_orders WHERE status = 'OPEN'`
      )
      results.open_po_count = openPO[0]?.count || 0
    } catch (e) {
      console.error('Error fetching purchase orders:', e.message)
      results.open_po_count = 0
    }

    // Recent sales (last 5)
    try {
      const [recentSales] = await db.pool.query(
        `SELECT s.id, s.sale_number, s.total, s.payment_method, s.\`date\`, u.username AS clerk
         FROM sales s LEFT JOIN users u ON u.id = s.clerk_id
         WHERE s.status = 'COMPLETED'
         ORDER BY s.\`date\` DESC LIMIT 5`
      )
      results.recent_sales = recentSales || []
    } catch (e) {
      console.error('Error fetching recent sales:', e.message)
      results.recent_sales = []
    }

    // Top selling products (last 30 days)
    try {
      const [topProducts] = await db.pool.query(
        `SELECT p.name, SUM(si.qty) AS total_qty, SUM(si.line_total) AS total_revenue
         FROM sale_items si
         JOIN sales s ON s.id = si.sale_id
         JOIN products p ON p.id = si.product_id
         WHERE s.status = 'COMPLETED' AND s.\`date\` >= DATE_SUB(NOW(), INTERVAL 30 DAY)
         GROUP BY si.product_id, p.name
         ORDER BY total_qty DESC LIMIT 5`
      )
      results.top_products = topProducts || []
    } catch (e) {
      console.error('Error fetching top products:', e.message)
      results.top_products = []
    }

    console.log('Dashboard stats retrieved successfully:', results)
    res.json(results)
  } catch (err) {
    console.error('Dashboard error:', err)
    res.status(500).json({ error: 'failed to fetch dashboard stats', details: err.message })
  }
})

module.exports = router
