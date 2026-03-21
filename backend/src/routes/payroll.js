const express = require('express')
const router = express.Router()
const db = require('../database')
const { verifyToken, authorize } = require('../middleware/authMiddleware')

// List payrolls (filterable by employee_id, status, period)
router.get('/', verifyToken, authorize('payroll.view'), async (req, res) => {
  try {
    const { employee_id, status, period_start, period_end } = req.query
    let sql = `SELECT p.*, e.name AS employee_name
               FROM payrolls p
               LEFT JOIN employees e ON e.id = p.employee_id
               WHERE 1=1`
    const params = []
    if (employee_id) { sql += ' AND p.employee_id = ?'; params.push(employee_id) }
    if (status) { sql += ' AND p.status = ?'; params.push(status) }
    if (period_start) { sql += ' AND p.period_start >= ?'; params.push(period_start) }
    if (period_end) { sql += ' AND p.period_end <= ?'; params.push(period_end) }
    sql += ' ORDER BY p.id DESC'
    const [rows] = await db.pool.query(sql, params)
    res.json(rows)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'failed to fetch payrolls' })
  }
})

// Get single payroll
router.get('/:id', verifyToken, authorize('payroll.view'), async (req, res) => {
  try {
    const [rows] = await db.pool.query(
      `SELECT p.*, e.name AS employee_name
       FROM payrolls p
       LEFT JOIN employees e ON e.id = p.employee_id
       WHERE p.id = ? LIMIT 1`, [req.params.id])
    if (!rows.length) return res.status(404).json({ error: 'payroll not found' })
    res.json(rows[0])
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'failed to fetch payroll' })
  }
})

// Create payroll record
router.post('/', express.json(), verifyToken, authorize('payroll.process'), async (req, res) => {
  try {
    const { employee_id, period_start, period_end, gross_pay, deductions, advances, net_pay } = req.body
    if (!employee_id) return res.status(400).json({ error: 'employee_id is required' })
    if (!period_start || !period_end) return res.status(400).json({ error: 'period_start and period_end are required' })

    const gross = parseFloat(gross_pay) || 0
    const ded = parseFloat(deductions) || 0
    const adv = parseFloat(advances) || 0
    const net = net_pay !== undefined ? parseFloat(net_pay) : (gross - ded - adv)

    const [result] = await db.pool.query(
      `INSERT INTO payrolls (employee_id, period_start, period_end, gross_pay, deductions, advances, net_pay, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING')`,
      [employee_id, period_start, period_end, gross, ded, adv, net]
    )
    res.json({ id: result.insertId })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'failed to create payroll' })
  }
})

// Auto-generate payroll from attendance, revenue, and supplier purchases
router.post('/generate', express.json(), verifyToken, authorize('payroll.process'), async (req, res) => {
  try {
    const { employee_id, period_start, period_end } = req.body
    if (!employee_id || !period_start || !period_end) {
      return res.status(400).json({ error: 'employee_id, period_start, and period_end are required' })
    }

    // Get employee pay rate
    const [emp] = await db.pool.query('SELECT pay_rate FROM employees WHERE id = ?', [employee_id])
    if (!emp.length) return res.status(404).json({ error: 'employee not found' })
    const payRate = parseFloat(emp[0].pay_rate) || 0

    // Sum hours from attendance
    const [att] = await db.pool.query(
      `SELECT COALESCE(SUM(hours_worked), 0) AS total_hours
       FROM attendance WHERE employee_id = ? AND date BETWEEN ? AND ?`,
      [employee_id, period_start, period_end]
    )
    const totalHours = parseFloat(att[0].total_hours) || 0
    const attendanceBase = (totalHours * payRate)

    // Get revenue from sales (where this employee is the clerk)
    const [sales] = await db.pool.query(
      `SELECT COALESCE(SUM(total), 0) AS total_revenue
       FROM sales WHERE clerk_id = ? AND date BETWEEN ? AND ? AND status = 'COMPLETED'`,
      [employee_id, period_start, period_end]
    )
    const totalRevenue = parseFloat(sales[0].total_revenue) || 0

    // Get total supplier purchase costs in period (for reference/deduction)
    const [purchases] = await db.pool.query(
      `SELECT COALESCE(SUM(total), 0) AS total_cost
       FROM purchase_orders WHERE created_at BETWEEN ? AND ? AND status IN ('RECEIVED', 'CANCELLED')`,
      [period_start, period_end]
    )
    const totalPurchaseCost = parseFloat(purchases[0].total_cost) || 0

    // Calculate gross pay: attendance base + (5% of revenue) - overhead (0.5% of purchase costs)
    const revenueBonus = totalRevenue * 0.05
    const costDeduction = totalPurchaseCost * 0.005
    const gross = (attendanceBase + revenueBonus - costDeduction).toFixed(2)

    const [result] = await db.pool.query(
      `INSERT INTO payrolls (employee_id, period_start, period_end, gross_pay, deductions, advances, net_pay, status)
       VALUES (?, ?, ?, ?, 0, 0, ?, 'PENDING')`,
      [employee_id, period_start, period_end, gross, gross]
    )
    res.json({ 
      id: result.insertId, 
      total_hours: totalHours, 
      attendance_base: attendanceBase.toFixed(2),
      total_revenue: totalRevenue.toFixed(2),
      revenue_bonus: revenueBonus.toFixed(2),
      total_purchase_cost: totalPurchaseCost.toFixed(2),
      overhead_deduction: costDeduction.toFixed(2),
      gross_pay: gross 
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'failed to generate payroll' })
  }
})

// Update payroll (edit deductions, advances, etc.)
router.put('/:id', express.json(), verifyToken, authorize('payroll.adjust'), async (req, res) => {
  try {
    const id = req.params.id
    const { gross_pay, deductions, advances, net_pay, status } = req.body
    const updates = []
    const params = []
    if (gross_pay !== undefined) { updates.push('gross_pay = ?'); params.push(gross_pay) }
    if (deductions !== undefined) { updates.push('deductions = ?'); params.push(deductions) }
    if (advances !== undefined) { updates.push('advances = ?'); params.push(advances) }
    if (net_pay !== undefined) { updates.push('net_pay = ?'); params.push(net_pay) }
    if (status !== undefined) { updates.push('status = ?'); params.push(status) }
    if (!updates.length) return res.status(400).json({ error: 'nothing to update' })
    params.push(id)
    await db.pool.query(`UPDATE payrolls SET ${updates.join(', ')} WHERE id = ?`, params)
    res.json({ success: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'failed to update payroll' })
  }
})

// Process payroll (mark as PROCESSED)
router.post('/:id/process', express.json(), verifyToken, authorize('payroll.process'), async (req, res) => {
  try {
    const userId = req.auth.id
    await db.pool.query(
      `UPDATE payrolls SET status = 'PROCESSED', processed_by = ?, processed_at = NOW() WHERE id = ? AND status = 'PENDING'`,
      [userId, req.params.id]
    )
    res.json({ success: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'failed to process payroll' })
  }
})

// Mark payroll as PAID
router.post('/:id/pay', express.json(), verifyToken, authorize('payroll.process'), async (req, res) => {
  try {
    await db.pool.query(
      `UPDATE payrolls SET status = 'PAID' WHERE id = ? AND status = 'PROCESSED'`,
      [req.params.id]
    )
    res.json({ success: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'failed to mark payroll as paid' })
  }
})

// Delete payroll
router.delete('/:id', verifyToken, authorize('payroll.process'), async (req, res) => {
  try {
    const [rows] = await db.pool.query('SELECT status FROM payrolls WHERE id = ?', [req.params.id])
    if (rows.length && rows[0].status === 'PAID') {
      return res.status(400).json({ error: 'cannot delete a paid payroll record' })
    }
    await db.pool.query('DELETE FROM payrolls WHERE id = ?', [req.params.id])
    res.json({ success: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'failed to delete payroll' })
  }
})

module.exports = router
