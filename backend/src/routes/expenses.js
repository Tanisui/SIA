const express = require('express')
const router = express.Router()
const db = require('../database')
const { verifyToken, authorize } = require('../middleware/authMiddleware')

// Ensure expenses table exists
const initTable = async () => {
  try {
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
  } catch (err) {
    console.error('expenses table init error:', err.message)
  }
}
initTable()

// List expenses
router.get('/', verifyToken, authorize('finance.reports.view'), async (req, res) => {
  try {
    const { status, category, start_date, end_date } = req.query
    let sql = `SELECT ex.*, e.name AS employee_name
               FROM expenses ex
               LEFT JOIN employees e ON e.id = ex.employee_id
               WHERE 1=1`
    const params = []
    if (status) { sql += ' AND ex.status = ?'; params.push(status) }
    if (category) { sql += ' AND ex.category = ?'; params.push(category) }
    if (start_date) { sql += ' AND ex.expense_date >= ?'; params.push(start_date) }
    if (end_date) { sql += ' AND ex.expense_date <= ?'; params.push(end_date) }
    sql += ' ORDER BY ex.expense_date DESC, ex.id DESC'
    const [rows] = await db.pool.query(sql, params)
    res.json(rows)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'failed to fetch expenses' })
  }
})

// Get single expense
router.get('/:id', verifyToken, authorize('finance.reports.view'), async (req, res) => {
  try {
    const [rows] = await db.pool.query(
      `SELECT ex.*, e.name AS employee_name
       FROM expenses ex
       LEFT JOIN employees e ON e.id = ex.employee_id
       WHERE ex.id = ? LIMIT 1`, [req.params.id])
    if (!rows.length) return res.status(404).json({ error: 'expense not found' })
    res.json(rows[0])
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'failed to fetch expense' })
  }
})

// Create expense
router.post('/', express.json(), verifyToken, authorize('finance.reports.view'), async (req, res) => {
  try {
    const { expense_date, category, description, amount, vendor, employee_id } = req.body
    if (!expense_date) return res.status(400).json({ error: 'expense_date is required' })
    const [result] = await db.pool.query(
      `INSERT INTO expenses (expense_date, category, description, amount, vendor, employee_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [expense_date, category || null, description || null, amount || 0, vendor || null, employee_id || null]
    )
    res.json({ id: result.insertId })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'failed to create expense' })
  }
})

// Update expense
router.put('/:id', express.json(), verifyToken, authorize('finance.reports.view'), async (req, res) => {
  try {
    const id = req.params.id
    const { expense_date, category, description, amount, vendor, employee_id, status } = req.body
    const updates = []
    const params = []
    if (expense_date !== undefined) { updates.push('expense_date = ?'); params.push(expense_date) }
    if (category !== undefined) { updates.push('category = ?'); params.push(category) }
    if (description !== undefined) { updates.push('description = ?'); params.push(description) }
    if (amount !== undefined) { updates.push('amount = ?'); params.push(amount) }
    if (vendor !== undefined) { updates.push('vendor = ?'); params.push(vendor) }
    if (employee_id !== undefined) { updates.push('employee_id = ?'); params.push(employee_id) }
    if (status !== undefined) { updates.push('status = ?'); params.push(status) }
    if (!updates.length) return res.status(400).json({ error: 'nothing to update' })
    params.push(id)
    await db.pool.query(`UPDATE expenses SET ${updates.join(', ')} WHERE id = ?`, params)
    res.json({ success: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'failed to update expense' })
  }
})

// Delete expense
router.delete('/:id', verifyToken, authorize('finance.reports.view'), async (req, res) => {
  try {
    await db.pool.query('DELETE FROM expenses WHERE id = ?', [req.params.id])
    res.json({ success: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'failed to delete expense' })
  }
})

module.exports = router
