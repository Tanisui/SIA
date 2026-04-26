const db = require('../database')

// Lightweight emitter so other modules can drop a notification for a user.
// Schema columns: type, title, body, recipient_user_id, payload, status, sent_at, read_at, created_at.
async function emitNotification({
  type = 'general',
  title = null,
  body = null,
  recipientUserId,
  payload = null,
  status = 'SENT'
} = {}) {
  if (!recipientUserId) return null
  try {
    const [result] = await db.pool.query(
      `INSERT INTO notifications (type, title, body, recipient_user_id, payload, status, sent_at)
       VALUES (?, ?, ?, ?, ?, ?, NOW())`,
      [type, title, body, recipientUserId, payload ? JSON.stringify(payload) : null, status]
    )
    return result.insertId
  } catch (err) {
    console.error('emitNotification failed:', err.message)
    return null
  }
}

// Broadcast to every user who holds any of the listed permissions.
async function broadcastToPerms(perms, payload = {}) {
  if (!Array.isArray(perms) || !perms.length) return 0
  try {
    const placeholders = perms.map(() => '?').join(',')
    const [rows] = await db.pool.query(
      `SELECT DISTINCT u.id
       FROM users u
       JOIN user_roles ur ON ur.user_id = u.id
       JOIN role_permissions rp ON rp.role_id = ur.role_id
       JOIN permissions p ON p.id = rp.permission_id
       WHERE u.is_active = 1 AND (p.name IN (${placeholders}) OR p.name = 'admin.*')`,
      perms
    )
    let count = 0
    for (const row of rows) {
      const id = await emitNotification({ ...payload, recipientUserId: row.id })
      if (id) count += 1
    }
    return count
  } catch (err) {
    console.error('broadcastToPerms failed:', err.message)
    return 0
  }
}

module.exports = { emitNotification, broadcastToPerms }
