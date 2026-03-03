const express = require('express')
const router = express.Router()
const db = require('../database')
const { verifyToken, authorize } = require('../middleware/authMiddleware')

// List notifications (for current user or all if admin)
router.get('/', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id
    const perms = req.user.permissions || []
    const isAdmin = perms.includes('admin.*')
    let sql, params

    if (isAdmin) {
      sql = `SELECT n.*, u.username AS recipient_username
             FROM notifications n
             LEFT JOIN users u ON u.id = n.recipient_user_id
             ORDER BY n.id DESC LIMIT 200`
      params = []
    } else {
      sql = `SELECT * FROM notifications WHERE recipient_user_id = ? ORDER BY id DESC LIMIT 100`
      params = [userId]
    }
    const [rows] = await db.pool.query(sql, params)
    res.json(rows)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'failed to fetch notifications' })
  }
})

// Get single notification
router.get('/:id', verifyToken, async (req, res) => {
  try {
    const [rows] = await db.pool.query('SELECT * FROM notifications WHERE id = ? LIMIT 1', [req.params.id])
    if (!rows.length) return res.status(404).json({ error: 'notification not found' })
    res.json(rows[0])
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'failed to fetch notification' })
  }
})

// Create notification
router.post('/', express.json(), verifyToken, async (req, res) => {
  try {
    const { type, recipient_user_id, payload } = req.body
    if (!recipient_user_id) return res.status(400).json({ error: 'recipient_user_id is required' })
    const [result] = await db.pool.query(
      `INSERT INTO notifications (type, recipient_user_id, payload, status)
       VALUES (?, ?, ?, 'PENDING')`,
      [type || 'general', recipient_user_id, payload ? JSON.stringify(payload) : null]
    )
    res.json({ id: result.insertId })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'failed to create notification' })
  }
})

// Mark notification as sent
router.put('/:id/send', express.json(), verifyToken, async (req, res) => {
  try {
    await db.pool.query(
      `UPDATE notifications SET status = 'SENT', sent_at = NOW() WHERE id = ?`,
      [req.params.id]
    )
    res.json({ success: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'failed to update notification' })
  }
})

// Update notification
router.put('/:id', express.json(), verifyToken, async (req, res) => {
  try {
    const { type, recipient_user_id, payload, status } = req.body
    const updates = []
    const params = []
    if (type !== undefined) { updates.push('type = ?'); params.push(type) }
    if (recipient_user_id !== undefined) { updates.push('recipient_user_id = ?'); params.push(recipient_user_id) }
    if (payload !== undefined) { updates.push('payload = ?'); params.push(JSON.stringify(payload)) }
    if (status !== undefined) { updates.push('status = ?'); params.push(status) }
    if (!updates.length) return res.status(400).json({ error: 'nothing to update' })
    params.push(req.params.id)
    await db.pool.query(`UPDATE notifications SET ${updates.join(', ')} WHERE id = ?`, params)
    res.json({ success: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'failed to update notification' })
  }
})

// Delete notification
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    await db.pool.query('DELETE FROM notifications WHERE id = ?', [req.params.id])
    res.json({ success: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'failed to delete notification' })
  }
})

module.exports = router
