const express = require('express')
const router = express.Router()
const db = require('../database')
const { verifyToken, authorize } = require('../middleware/authMiddleware')

// List audit logs (filterable by user, action, resource_type, date range)
router.get('/', verifyToken, authorize('system.audit.view'), async (req, res) => {
  try {
    const { user_id, action, resource_type, start_date, end_date, limit: lim } = req.query
    let sql = `SELECT a.*, u.username, u.full_name
               FROM audit_logs a
               LEFT JOIN users u ON u.id = a.user_id
               WHERE 1=1`
    const params = []
    if (user_id) { sql += ' AND a.user_id = ?'; params.push(user_id) }
    if (action) { sql += ' AND a.action LIKE ?'; params.push(`%${action}%`) }
    if (resource_type) { sql += ' AND a.resource_type = ?'; params.push(resource_type) }
    if (start_date) { sql += ' AND a.created_at >= ?'; params.push(start_date) }
    if (end_date) { sql += ' AND a.created_at <= ?'; params.push(end_date + ' 23:59:59') }
    sql += ' ORDER BY a.created_at DESC'
    if (lim) sql += ` LIMIT ${parseInt(lim) || 100}`
    else sql += ' LIMIT 500'
    const [rows] = await db.pool.query(sql, params)
    res.json(rows)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'failed to fetch audit logs' })
  }
})

// Get single audit log entry
router.get('/:id', verifyToken, authorize('system.audit.view'), async (req, res) => {
  try {
    const [rows] = await db.pool.query(
      `SELECT a.*, u.username, u.full_name
       FROM audit_logs a
       LEFT JOIN users u ON u.id = a.user_id
       WHERE a.id = ? LIMIT 1`, [req.params.id])
    if (!rows.length) return res.status(404).json({ error: 'audit log not found' })
    res.json(rows[0])
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'failed to fetch audit log' })
  }
})

module.exports = router
