const express = require('express')
const router = express.Router()
const db = require('../database')
const { verifyToken, authorize } = require('../middleware/authMiddleware')

// Ensure ledger table exists
const initTable = async () => {
  try {
    await db.pool.query(`
      CREATE TABLE IF NOT EXISTS ledger (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        account_code VARCHAR(100),
        entry_date DATE NOT NULL,
        description TEXT,
        debit DECIMAL(12,2) DEFAULT 0.00,
        credit DECIMAL(12,2) DEFAULT 0.00,
        reference VARCHAR(255),
        created_by BIGINT UNSIGNED,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `)
  } catch (err) {
    console.error('ledger table init error:', err.message)
  }
}
initTable()

// List ledger entries
router.get('/', verifyToken, authorize('finance.reports.view'), async (req, res) => {
  try {
    const { account_code, start_date, end_date } = req.query
    let sql = `SELECT l.*, u.username AS created_by_name FROM ledger l LEFT JOIN users u ON u.id = l.created_by WHERE 1=1`
    const params = []
    if (account_code) { sql += ' AND l.account_code = ?'; params.push(account_code) }
    if (start_date) { sql += ' AND l.entry_date >= ?'; params.push(start_date) }
    if (end_date) { sql += ' AND l.entry_date <= ?'; params.push(end_date) }
    sql += ' ORDER BY l.entry_date DESC, l.id DESC'
    const [rows] = await db.pool.query(sql, params)
    res.json(rows)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'failed to fetch ledger entries' })
  }
})

// Get single entry
router.get('/:id', verifyToken, authorize('finance.reports.view'), async (req, res) => {
  try {
    const [rows] = await db.pool.query('SELECT * FROM ledger WHERE id = ? LIMIT 1', [req.params.id])
    if (!rows.length) return res.status(404).json({ error: 'entry not found' })
    res.json(rows[0])
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'failed to fetch ledger entry' })
  }
})

// Create ledger entry
router.post('/', express.json(), verifyToken, authorize('finance.reports.view'), async (req, res) => {
  try {
    const { account_code, entry_date, description, debit, credit, reference } = req.body
    if (!entry_date) return res.status(400).json({ error: 'entry_date is required' })
    const created_by = req.user.id
    const [result] = await db.pool.query(
      `INSERT INTO ledger (account_code, entry_date, description, debit, credit, reference, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [account_code || null, entry_date, description || null, debit || 0, credit || 0, reference || null, created_by]
    )
    res.json({ id: result.insertId })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'failed to create ledger entry' })
  }
})

// Update ledger entry
router.put('/:id', express.json(), verifyToken, authorize('finance.reports.view'), async (req, res) => {
  try {
    const id = req.params.id
    const { account_code, entry_date, description, debit, credit, reference } = req.body
    const updates = []
    const params = []
    if (account_code !== undefined) { updates.push('account_code = ?'); params.push(account_code) }
    if (entry_date !== undefined) { updates.push('entry_date = ?'); params.push(entry_date) }
    if (description !== undefined) { updates.push('description = ?'); params.push(description) }
    if (debit !== undefined) { updates.push('debit = ?'); params.push(debit) }
    if (credit !== undefined) { updates.push('credit = ?'); params.push(credit) }
    if (reference !== undefined) { updates.push('reference = ?'); params.push(reference) }
    if (!updates.length) return res.status(400).json({ error: 'nothing to update' })
    params.push(id)
    await db.pool.query(`UPDATE ledger SET ${updates.join(', ')} WHERE id = ?`, params)
    res.json({ success: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'failed to update ledger entry' })
  }
})

// Delete ledger entry
router.delete('/:id', verifyToken, authorize('finance.reports.view'), async (req, res) => {
  try {
    await db.pool.query('DELETE FROM ledger WHERE id = ?', [req.params.id])
    res.json({ success: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'failed to delete ledger entry' })
  }
})

module.exports = router
