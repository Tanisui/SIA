const express = require('express')
const router = express.Router()
const db = require('../database')
const { verifyToken, authorize } = require('../middleware/authMiddleware')
const { logAuditEventSafe } = require('../utils/auditLog')

const VIEW_PERMS   = ['purchase.view', 'purchase.create', 'purchase.update', 'purchase.delete', 'reports.view', 'admin.*']
const MANAGE_PERMS = ['purchase.create', 'purchase.update', 'admin.*']
const DELETE_PERMS = ['purchase.delete', 'admin.*']

const VALID_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'PROCESSED']
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function isBlank(v) { return v === undefined || v === null || String(v).trim() === '' }
function asText(v)  { return isBlank(v) ? null : String(v).trim() }
function asDate(v, field, required = false) {
  if (isBlank(v)) {
    if (required) { const e = new Error(`${field} is required`); e.statusCode = 400; throw e }
    return null
  }
  const s = String(v).trim()
  if (!DATE_RE.test(s)) { const e = new Error(`${field} must be YYYY-MM-DD`); e.statusCode = 400; throw e }
  return s
}
function asMoney(v) {
  const n = Number(v)
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : 0
}
function generateReturnNumber() {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  const rand = String(Math.floor(Math.random() * 9000) + 1000)
  return `RET-${y}${m}${d}-${rand}`
}

// ── GET /bale-returns ─────────────────────────────────────────────────────
router.get('/', verifyToken, authorize(VIEW_PERMS), async (req, res) => {
  try {
    const { from, to, status, supplier_id, bale_purchase_id, page = 1, limit = 100 } = req.query
    const params = []
    const conds  = []

    if (from)             { conds.push('r.return_date >= ?'); params.push(from) }
    if (to)               { conds.push('r.return_date <= ?'); params.push(to) }
    if (status)           { conds.push('r.status = ?'); params.push(status.toUpperCase()) }
    if (supplier_id)      { conds.push('r.supplier_id = ?'); params.push(Number(supplier_id)) }
    if (bale_purchase_id) { conds.push('r.bale_purchase_id = ?'); params.push(Number(bale_purchase_id)) }

    const where  = conds.length ? `WHERE ${conds.join(' AND ')}` : ''
    const offset = (Math.max(Number(page), 1) - 1) * Number(limit)

    const [rows] = await db.pool.query(
      `SELECT r.*,
              bp.bale_batch_no,
              s.name  AS supplier_name_ref,
              u.name  AS processed_by_name,
              cb.name AS created_by_name
       FROM bale_returns r
       LEFT JOIN bale_purchases bp ON bp.id = r.bale_purchase_id
       LEFT JOIN suppliers      s  ON s.id  = r.supplier_id
       LEFT JOIN users          u  ON u.id  = r.processed_by
       LEFT JOIN users          cb ON cb.id = r.created_by
       ${where}
       ORDER BY r.return_date DESC, r.id DESC
       LIMIT ? OFFSET ?`,
      [...params, Number(limit), offset]
    )

    const [[{ total }]] = await db.pool.query(
      `SELECT COUNT(*) AS total FROM bale_returns r ${where}`,
      params
    )

    const data = rows.map((r) => ({
      ...r,
      supplier_name: r.supplier_name || r.supplier_name_ref || null,
      items: safeJson(r.items_json)
    }))

    res.json({ data, total, page: Number(page), limit: Number(limit) })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── GET /bale-returns/:id ─────────────────────────────────────────────────
router.get('/:id', verifyToken, authorize(VIEW_PERMS), async (req, res) => {
  try {
    const [[row]] = await db.pool.query(
      `SELECT r.*,
              bp.bale_batch_no, bp.bale_category, bp.total_purchase_cost,
              s.name  AS supplier_name_ref,
              u.name  AS processed_by_name,
              cb.name AS created_by_name
       FROM bale_returns r
       LEFT JOIN bale_purchases bp ON bp.id = r.bale_purchase_id
       LEFT JOIN suppliers      s  ON s.id  = r.supplier_id
       LEFT JOIN users          u  ON u.id  = r.processed_by
       LEFT JOIN users          cb ON cb.id = r.created_by
       WHERE r.id = ?`,
      [req.params.id]
    )
    if (!row) return res.status(404).json({ error: 'Bale return not found' })
    res.json({ ...row, supplier_name: row.supplier_name || row.supplier_name_ref || null, items: safeJson(row.items_json) })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── POST /bale-returns ────────────────────────────────────────────────────
router.post('/', verifyToken, authorize(MANAGE_PERMS), async (req, res) => {
  try {
    const body = req.body
    const return_date    = asDate(body.return_date, 'return_date', true)
    const bale_purchase_id = body.bale_purchase_id ? Number(body.bale_purchase_id) : null
    const supplier_id    = body.supplier_id ? Number(body.supplier_id) : null

    let supplier_name = asText(body.supplier_name)
    if (!supplier_name && supplier_id) {
      const [[s]] = await db.pool.query('SELECT name FROM suppliers WHERE id = ?', [supplier_id])
      supplier_name = s?.name || null
    }

    const items       = Array.isArray(body.items) ? body.items : []
    const subtotal    = asMoney(body.subtotal || items.reduce((sum, i) => sum + asMoney(i.line_total || (Number(i.quantity || 1) * Number(i.unit_price || 0))), 0))
    const return_amount = asMoney(body.return_amount || subtotal)
    const status      = VALID_STATUSES.includes(String(body.status || '').toUpperCase()) ? String(body.status).toUpperCase() : 'PENDING'
    const return_number = body.return_number || generateReturnNumber()

    const [result] = await db.pool.query(
      `INSERT INTO bale_returns
         (return_number, bale_purchase_id, supplier_id, supplier_name, return_date,
          reason, items_json, subtotal, return_amount, status, notes, created_by)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        return_number, bale_purchase_id, supplier_id, supplier_name, return_date,
        asText(body.reason), JSON.stringify(items), subtotal, return_amount,
        status, asText(body.notes), req.user?.id
      ]
    )

    const [[created]] = await db.pool.query(
      `SELECT r.*, s.name AS supplier_name_ref FROM bale_returns r LEFT JOIN suppliers s ON s.id = r.supplier_id WHERE r.id = ?`,
      [result.insertId]
    )
    await logAuditEventSafe(req, 'bale_return.create', 'bale_returns', result.insertId)
    res.status(201).json({ ...created, supplier_name: created.supplier_name || created.supplier_name_ref, items: safeJson(created.items_json) })
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message })
  }
})

// ── PUT /bale-returns/:id ─────────────────────────────────────────────────
router.put('/:id', verifyToken, authorize(MANAGE_PERMS), async (req, res) => {
  try {
    const [[existing]] = await db.pool.query('SELECT * FROM bale_returns WHERE id = ?', [req.params.id])
    if (!existing) return res.status(404).json({ error: 'Bale return not found' })

    const body = req.body
    const items     = Array.isArray(body.items) ? body.items : safeJson(existing.items_json)
    const subtotal  = asMoney(body.subtotal || items.reduce((sum, i) => sum + asMoney(i.line_total || (Number(i.quantity || 1) * Number(i.unit_price || 0))), 0))
    const status    = VALID_STATUSES.includes(String(body.status || '').toUpperCase()) ? String(body.status).toUpperCase() : existing.status

    const processedBy = status === 'PROCESSED' && existing.status !== 'PROCESSED' ? req.user?.id : existing.processed_by
    const processedAt = status === 'PROCESSED' && existing.status !== 'PROCESSED' ? new Date() : existing.processed_at

    await db.pool.query(
      `UPDATE bale_returns SET
         return_date = ?, reason = ?, items_json = ?,
         subtotal = ?, return_amount = ?, status = ?,
         notes = ?, processed_by = ?, processed_at = ?,
         supplier_id = ?, supplier_name = ?
       WHERE id = ?`,
      [
        asDate(body.return_date, 'return_date') || existing.return_date,
        asText(body.reason) ?? existing.reason,
        JSON.stringify(items),
        subtotal,
        asMoney(body.return_amount) || subtotal,
        status,
        asText(body.notes) ?? existing.notes,
        processedBy, processedAt,
        body.supplier_id ? Number(body.supplier_id) : existing.supplier_id,
        asText(body.supplier_name) ?? existing.supplier_name,
        req.params.id
      ]
    )

    const [[updated]] = await db.pool.query(
      `SELECT r.*, s.name AS supplier_name_ref FROM bale_returns r LEFT JOIN suppliers s ON s.id = r.supplier_id WHERE r.id = ?`,
      [req.params.id]
    )
    await logAuditEventSafe(req, 'bale_return.update', 'bale_returns', req.params.id)
    res.json({ ...updated, supplier_name: updated.supplier_name || updated.supplier_name_ref, items: safeJson(updated.items_json) })
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message })
  }
})

// ── DELETE /bale-returns/:id ──────────────────────────────────────────────
router.delete('/:id', verifyToken, authorize(DELETE_PERMS), async (req, res) => {
  try {
    const [[existing]] = await db.pool.query('SELECT id, status FROM bale_returns WHERE id = ?', [req.params.id])
    if (!existing) return res.status(404).json({ error: 'Bale return not found' })
    if (existing.status === 'PROCESSED') return res.status(400).json({ error: 'Cannot delete a processed return' })
    await db.pool.query('DELETE FROM bale_returns WHERE id = ?', [req.params.id])
    await logAuditEventSafe(req, 'bale_return.delete', 'bale_returns', req.params.id)
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

function safeJson(v) {
  if (!v) return []
  if (Array.isArray(v)) return v
  try { return JSON.parse(v) } catch { return [] }
}

module.exports = router
