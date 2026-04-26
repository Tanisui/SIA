const express = require('express')
const router = express.Router()
const db = require('../database')
const { verifyToken, authorize, getUserPermissions } = require('../middleware/authMiddleware')

function serializeRow(row) {
  if (!row) return row
  let payload = row.payload
  if (payload && typeof payload === 'string') {
    try { payload = JSON.parse(payload) } catch { /* leave as-is */ }
  }
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    recipient_user_id: row.recipient_user_id,
    payload,
    status: row.status,
    sent_at: row.sent_at,
    read_at: row.read_at,
    created_at: row.created_at,
    recipient_username: row.recipient_username
  }
}

// ── GET /notifications  (current user, or all if admin) ───────────────────
router.get('/', verifyToken, async (req, res) => {
  try {
    const userId = req.auth.id
    const info = await getUserPermissions(userId)
    const perms = info.permissions || []
    const isAdmin = perms.includes('admin.*')
    const all = String(req.query.all || '').trim() === '1'
    const limit = Math.max(1, Math.min(Number(req.query.limit) || 20, 100))
    let sql, params

    if (isAdmin && all) {
      sql = `SELECT n.*, u.username AS recipient_username
             FROM notifications n
             LEFT JOIN users u ON u.id = n.recipient_user_id
             ORDER BY COALESCE(n.created_at, n.sent_at) DESC, n.id DESC
             LIMIT ?`
      params = [limit]
    } else {
      sql = `SELECT *
             FROM notifications
             WHERE recipient_user_id = ?
             ORDER BY COALESCE(created_at, sent_at) DESC, id DESC
             LIMIT ?`
      params = [userId, limit]
    }
    const [rows] = await db.pool.query(sql, params)
    res.json(rows.map(serializeRow))
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'failed to fetch notifications' })
  }
})

// ── GET /notifications/unread-count  (just my unread tally) ───────────────
router.get('/unread-count', verifyToken, async (req, res) => {
  try {
    const [[{ unread = 0 }]] = await db.pool.query(
      `SELECT COUNT(*) AS unread
       FROM notifications
       WHERE recipient_user_id = ? AND read_at IS NULL`,
      [req.auth.id]
    )
    res.json({ unread: Number(unread) || 0 })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'failed to fetch unread count' })
  }
})

// ── POST /notifications/:id/read  (mark one as read; only own) ───────────
router.post('/:id/read', verifyToken, async (req, res) => {
  try {
    const id = Number(req.params.id)
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid id' })
    const [result] = await db.pool.query(
      `UPDATE notifications
       SET read_at = NOW()
       WHERE id = ? AND recipient_user_id = ? AND read_at IS NULL`,
      [id, req.auth.id]
    )
    res.json({ success: true, updated: result.affectedRows })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'failed to mark notification as read' })
  }
})

// ── POST /notifications/read-all  (mark all my unread as read) ───────────
router.post('/read-all', verifyToken, async (req, res) => {
  try {
    const [result] = await db.pool.query(
      `UPDATE notifications SET read_at = NOW()
       WHERE recipient_user_id = ? AND read_at IS NULL`,
      [req.auth.id]
    )
    res.json({ success: true, updated: result.affectedRows })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'failed to mark notifications as read' })
  }
})

// ── GET /notifications/:id ────────────────────────────────────────────────
router.get('/:id', verifyToken, async (req, res) => {
  try {
    const [rows] = await db.pool.query(
      `SELECT * FROM notifications WHERE id = ? LIMIT 1`,
      [req.params.id]
    )
    if (!rows.length) return res.status(404).json({ error: 'notification not found' })
    res.json(serializeRow(rows[0]))
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'failed to fetch notification' })
  }
})

// ── POST /notifications  (admin/manager creates) ─────────────────────────
router.post('/', express.json(), verifyToken, async (req, res) => {
  try {
    const { type, title, body, recipient_user_id, payload, status } = req.body || {}
    if (!recipient_user_id) return res.status(400).json({ error: 'recipient_user_id is required' })
    const [result] = await db.pool.query(
      `INSERT INTO notifications (type, title, body, recipient_user_id, payload, status, sent_at)
       VALUES (?, ?, ?, ?, ?, ?, NOW())`,
      [
        type || 'general',
        title || null,
        body  || null,
        recipient_user_id,
        payload ? JSON.stringify(payload) : null,
        status || 'SENT'
      ]
    )
    res.json({ id: result.insertId })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'failed to create notification' })
  }
})

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

router.put('/:id', express.json(), verifyToken, async (req, res) => {
  try {
    const { type, title, body, recipient_user_id, payload, status } = req.body || {}
    const updates = []
    const params = []
    if (type !== undefined)              { updates.push('type = ?');              params.push(type) }
    if (title !== undefined)             { updates.push('title = ?');             params.push(title) }
    if (body !== undefined)              { updates.push('body = ?');              params.push(body) }
    if (recipient_user_id !== undefined) { updates.push('recipient_user_id = ?'); params.push(recipient_user_id) }
    if (payload !== undefined)           { updates.push('payload = ?');           params.push(JSON.stringify(payload)) }
    if (status !== undefined)            { updates.push('status = ?');            params.push(status) }
    if (!updates.length) return res.status(400).json({ error: 'nothing to update' })
    params.push(req.params.id)
    await db.pool.query(`UPDATE notifications SET ${updates.join(', ')} WHERE id = ?`, params)
    res.json({ success: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'failed to update notification' })
  }
})

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
