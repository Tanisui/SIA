const express = require('express')
const router = express.Router()
const db = require('../database')
const { verifyToken, authorize } = require('../middleware/authMiddleware')

// List saved reports
router.get('/', verifyToken, authorize('reports.view'), async (req, res) => {
  try {
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

// Get single report
router.get('/:id', verifyToken, authorize('reports.view'), async (req, res) => {
  try {
    const [rows] = await db.pool.query(
      `SELECT r.*, u.username AS owner_name
       FROM saved_reports r
       LEFT JOIN users u ON u.id = r.owner_id
       WHERE r.id = ? LIMIT 1`, [req.params.id])
    if (!rows.length) return res.status(404).json({ error: 'report not found' })
    res.json(rows[0])
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'failed to fetch report' })
  }
})

// Create saved report
router.post('/', express.json(), verifyToken, authorize('reports.generate'), async (req, res) => {
  try {
    const { name, filters } = req.body
    if (!name) return res.status(400).json({ error: 'name is required' })
    const owner_id = req.user.id
    const [result] = await db.pool.query(
      `INSERT INTO saved_reports (name, filters, owner_id) VALUES (?, ?, ?)`,
      [name, filters ? JSON.stringify(filters) : null, owner_id]
    )
    res.json({ id: result.insertId })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'failed to create report' })
  }
})

// Update saved report
router.put('/:id', express.json(), verifyToken, authorize('reports.generate'), async (req, res) => {
  try {
    const { name, filters } = req.body
    const updates = []
    const params = []
    if (name !== undefined) { updates.push('name = ?'); params.push(name) }
    if (filters !== undefined) { updates.push('filters = ?'); params.push(JSON.stringify(filters)) }
    if (!updates.length) return res.status(400).json({ error: 'nothing to update' })
    params.push(req.params.id)
    await db.pool.query(`UPDATE saved_reports SET ${updates.join(', ')} WHERE id = ?`, params)
    res.json({ success: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'failed to update report' })
  }
})

// Delete saved report
router.delete('/:id', verifyToken, authorize('reports.generate'), async (req, res) => {
  try {
    await db.pool.query('DELETE FROM saved_reports WHERE id = ?', [req.params.id])
    res.json({ success: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'failed to delete report' })
  }
})

module.exports = router
