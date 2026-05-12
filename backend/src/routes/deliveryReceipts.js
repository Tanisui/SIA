const express = require('express')
const router = express.Router()
const db = require('../database')
const { verifyToken, authorize } = require('../middleware/authMiddleware')
const { logAuditEventSafe } = require('../utils/auditLog')

async function getNextDrNumber(conn) {
  const [rows] = await conn.query(
    "SELECT dr_number FROM delivery_receipts WHERE dr_number LIKE 'DR-%' ORDER BY id DESC LIMIT 200"
  )
  const maxSeq = rows.reduce((max, r) => {
    const m = String(r.dr_number || '').match(/^DR-(\d+)$/)
    return m ? Math.max(max, Number(m[1])) : max
  }, 0)

  let nextSeq = maxSeq + 1
  for (let attempts = 0; attempts < 200; attempts++) {
    const candidate = `DR-${String(nextSeq).padStart(4, '0')}`
    const [existing] = await conn.query(
      'SELECT id FROM delivery_receipts WHERE dr_number = ? LIMIT 1', [candidate]
    )
    if (!existing.length) return candidate
    nextSeq++
  }
  throw new Error('Could not generate unique DR number after 200 attempts')
}

// GET /api/delivery-receipts — list all, optionally filter by bale_purchase_id
router.get('/', verifyToken, authorize(['inventory.view', 'inventory.receive']), async (req, res) => {
  try {
    const { bale_purchase_id } = req.query
    let sql = `
      SELECT dr.*, bp.bale_batch_no, bp.supplier_name
      FROM delivery_receipts dr
      LEFT JOIN bale_purchases bp ON bp.id = dr.bale_purchase_id
      WHERE 1=1
    `
    const params = []
    if (bale_purchase_id) { sql += ' AND dr.bale_purchase_id = ?'; params.push(Number(bale_purchase_id)) }
    sql += ' ORDER BY dr.created_at DESC'
    const [rows] = await db.pool.query(sql, params)
    res.json(rows)
  } catch (err) { console.error(err); res.status(500).json({ error: 'failed to fetch delivery receipts' }) }
})

// GET /api/delivery-receipts/:id — single D.R.
router.get('/:id', verifyToken, authorize(['inventory.view', 'inventory.receive']), async (req, res) => {
  try {
    const [rows] = await db.pool.query(
      `SELECT dr.*, bp.bale_batch_no, bp.supplier_name
       FROM delivery_receipts dr
       LEFT JOIN bale_purchases bp ON bp.id = dr.bale_purchase_id
       WHERE dr.id = ? LIMIT 1`,
      [Number(req.params.id)]
    )
    if (!rows.length) return res.status(404).json({ error: 'not found' })
    res.json(rows[0])
  } catch (err) { console.error(err); res.status(500).json({ error: 'failed to fetch delivery receipt' }) }
})

// POST /api/delivery-receipts — create D.R., advances P.O. status to RECEIVED
router.post('/', express.json(), verifyToken, authorize('inventory.receive'), async (req, res) => {
  const conn = await db.pool.getConnection()
  try {
    const { bale_purchase_id, received_date, received_by, notes } = req.body || {}
    if (!bale_purchase_id || !received_date) {
      return res.status(400).json({ error: 'bale_purchase_id and received_date are required' })
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(received_date)) {
      return res.status(400).json({ error: 'received_date must be in YYYY-MM-DD format' })
    }

    const resolvedReceivedBy = received_by || String(req.auth.id)

    await conn.beginTransaction()

    const [purchaseRows] = await conn.query(
      'SELECT id, po_status FROM bale_purchases WHERE id = ? LIMIT 1 FOR UPDATE', [Number(bale_purchase_id)]
    )
    if (!purchaseRows.length) {
      await conn.rollback()
      conn.release()
      return res.status(404).json({ error: 'purchase order not found' })
    }

    const drNumber = await getNextDrNumber(conn)

    const [result] = await conn.query(
      `INSERT INTO delivery_receipts (dr_number, bale_purchase_id, received_date, received_by, status, notes)
       VALUES (?, ?, ?, ?, 'RECEIVED', ?)`,
      [drNumber, Number(bale_purchase_id), received_date, resolvedReceivedBy, notes || null]
    )

    // Advance P.O. to RECEIVED if it was PENDING or ORDERED
    if (['PENDING', 'ORDERED'].includes(purchaseRows[0].po_status)) {
      await conn.query(
        'UPDATE bale_purchases SET po_status = ?, actual_delivery_date = ? WHERE id = ?',
        ['RECEIVED', received_date, Number(bale_purchase_id)]
      )
    }

    await conn.commit()

    await logAuditEventSafe(db.pool, {
      userId: req.auth.id, action: 'DR_CREATED', resourceType: 'DeliveryReceipt',
      resourceId: result.insertId,
      details: { module: 'purchasing', severity: 'medium', summary: `Created D.R. ${drNumber}` }
    })

    res.json({ id: result.insertId, dr_number: drNumber })
  } catch (err) {
    await conn.rollback().catch(() => {})
    console.error(err)
    res.status(500).json({ error: 'failed to create delivery receipt' })
  } finally { conn.release() }
})

// PUT /api/delivery-receipts/:id/confirm — confirm D.R., sets P.O. dr_confirmed = 1
router.put('/:id/confirm', verifyToken, authorize('inventory.receive'), async (req, res) => {
  const conn = await db.pool.getConnection()
  try {
    const id = Number(req.params.id)
    await conn.beginTransaction()

    const [rows] = await conn.query(
      'SELECT * FROM delivery_receipts WHERE id = ? LIMIT 1 FOR UPDATE', [id]
    )
    if (!rows.length) { await conn.rollback(); return res.status(404).json({ error: 'not found' }) }
    if (rows[0].status === 'CONFIRMED') { await conn.rollback(); return res.status(409).json({ error: 'already confirmed' }) }

    await conn.query("UPDATE delivery_receipts SET status = 'CONFIRMED' WHERE id = ?", [id])
    await conn.query('UPDATE bale_purchases SET dr_confirmed = 1 WHERE id = ?', [rows[0].bale_purchase_id])

    await conn.commit()

    await logAuditEventSafe(db.pool, {
      userId: req.auth.id, action: 'DR_CONFIRMED', resourceType: 'DeliveryReceipt',
      resourceId: id,
      details: { module: 'purchasing', severity: 'medium', summary: `Confirmed D.R. ${rows[0].dr_number}` }
    })

    res.json({ ok: true })
  } catch (err) {
    await conn.rollback().catch(() => {})
    console.error(err)
    res.status(500).json({ error: 'failed to confirm delivery receipt' })
  } finally { conn.release() }
})

module.exports = router
