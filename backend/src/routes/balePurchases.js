const express = require('express')
const router = express.Router()
const db = require('../database')
const { verifyToken, authorize } = require('../middleware/authMiddleware')
const { ensureAutomatedReportsSchema } = require('../utils/automatedReports')
const { roundMoney } = require('../utils/salesSupport')
const { logAuditEventSafe } = require('../utils/auditLog')

const PAYMENT_STATUSES = ['PAID', 'PARTIAL', 'UNPAID']
const PO_STATUSES = ['PENDING', 'ORDERED', 'RECEIVED', 'COMPLETED', 'CANCELLED']
const BALE_VIEW_PERMISSIONS = ['inventory.view', 'inventory.receive', 'products.view', 'reports.view', 'finance.reports.view']
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

function isBlank(value) {
  return value === undefined || value === null || String(value).trim() === ''
}

function asText(value) {
  if (value === undefined) return undefined
  if (value === null) return null
  const normalized = String(value).trim()
  return normalized || null
}

function asNumber(value, fieldName) {
  if (isBlank(value)) return 0
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) {
    const err = new Error(`${fieldName} must be a valid non-negative number`)
    err.statusCode = 400
    throw err
  }
  return roundMoney(parsed)
}

function asOptionalInt(value, fieldName) {
  if (isBlank(value)) return null
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    const err = new Error(`${fieldName} must be a valid positive integer`)
    err.statusCode = 400
    throw err
  }
  return parsed
}

function asDateOnly(value, fieldName, required = false) {
  if (isBlank(value)) {
    if (required) {
      const err = new Error(`${fieldName} is required`)
      err.statusCode = 400
      throw err
    }
    return null
  }

  const normalized = String(value).trim()
  if (!DATE_PATTERN.test(normalized)) {
    const err = new Error(`${fieldName} must use YYYY-MM-DD format`)
    err.statusCode = 400
    throw err
  }

  const parsed = new Date(`${normalized}T00:00:00.000Z`)
  if (Number.isNaN(parsed.getTime())) {
    const err = new Error(`${fieldName} is not a valid date`)
    err.statusCode = 400
    throw err
  }

  return normalized
}

function asPaymentStatus(value, required = false) {
  if (isBlank(value)) {
    if (required) return 'UNPAID'
    return undefined
  }
  const normalized = String(value).trim().toUpperCase()
  if (!PAYMENT_STATUSES.includes(normalized)) {
    const err = new Error(`payment_status must be one of: ${PAYMENT_STATUSES.join(', ')}`)
    err.statusCode = 400
    throw err
  }
  return normalized
}

function asPoStatus(value, required = false) {
  if (isBlank(value)) {
    if (required) return 'PENDING'
    return undefined
  }
  const normalized = String(value).trim().toUpperCase()
  if (!PO_STATUSES.includes(normalized)) {
    const err = new Error(`po_status must be one of: ${PO_STATUSES.join(', ')}`)
    err.statusCode = 400
    throw err
  }
  return normalized
}

function asPositiveInt(value, fieldName) {
  if (isBlank(value)) return 0
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0 || !Number.isInteger(parsed)) {
    const err = new Error(`${fieldName} must be a valid non-negative integer`)
    err.statusCode = 400
    throw err
  }
  return parsed
}

function buildDateFilter(alias, column, from, to, params) {
  let clause = ''
  if (from) {
    clause += ` AND ${alias}.${column} >= ?`
    params.push(from)
  }
  if (to) {
    clause += ` AND ${alias}.${column} < DATE_ADD(?, INTERVAL 1 DAY)`
    params.push(to)
  }
  return clause
}

async function ensureSupplierExists(supplierId) {
  if (!supplierId) return
  const [rows] = await db.pool.query('SELECT id FROM suppliers WHERE id = ? LIMIT 1', [supplierId])
  if (!rows.length) {
    const err = new Error('supplier_id does not exist')
    err.statusCode = 400
    throw err
  }
}

function normalizeBalePurchaseInput(payload, options = {}) {
  const isUpdate = options.isUpdate === true
  const body = payload || {}

  const parsed = {}
  if (!isUpdate || body.bale_batch_no !== undefined) {
    const baleBatchNo = asText(body.bale_batch_no)
    if (!baleBatchNo) {
      const err = new Error('bale_batch_no is required')
      err.statusCode = 400
      throw err
    }
    parsed.bale_batch_no = baleBatchNo
  }

  // Handle supplier_id (foreign key to suppliers table)
  if (!isUpdate || body.supplier_id !== undefined) {
    if (body.supplier_id !== undefined && body.supplier_id !== null) {
      const supplierId = Number(body.supplier_id)
      if (!Number.isFinite(supplierId) || supplierId <= 0) {
        const err = new Error('supplier_id must be a valid positive integer')
        err.statusCode = 400
        throw err
      }
      parsed.supplier_id = supplierId
    } else if (!isUpdate) {
      const err = new Error('supplier_id is required when supplier_name is not provided')
      err.statusCode = 400
      throw err
    } else {
      parsed.supplier_id = null
    }
  }

  // Handle supplier_name (for backward compatibility and display)
  if (!isUpdate || body.supplier_name !== undefined) {
    const supplierName = asText(body.supplier_name)
    if (!supplierName && !isUpdate && !body.supplier_id) {
      const err = new Error('supplier_name or supplier_id is required')
      err.statusCode = 400
      throw err
    }
    parsed.supplier_name = supplierName
  }

  if (!isUpdate || body.purchase_date !== undefined) {
    parsed.purchase_date = asDateOnly(body.purchase_date, 'purchase_date', !isUpdate)
  }

  if (!isUpdate || body.bale_category !== undefined) parsed.bale_category = asText(body.bale_category)

  if (!isUpdate || body.bale_cost !== undefined) {
    parsed.bale_cost = asNumber(body.bale_cost, 'bale_cost')
  }

  if (!isUpdate || body.total_purchase_cost !== undefined) {
    parsed.total_purchase_cost = !isBlank(body.total_purchase_cost)
      ? asNumber(body.total_purchase_cost, 'total_purchase_cost')
      : roundMoney(parsed.bale_cost || 0)
  }

  if (!isUpdate || body.payment_status !== undefined) {
    parsed.payment_status = asPaymentStatus(body.payment_status, !isUpdate)
  }

  // P.O. Workflow fields
  if (!isUpdate || body.po_status !== undefined) {
    parsed.po_status = asPoStatus(body.po_status, !isUpdate)
  }

  if (!isUpdate || body.po_number !== undefined) {
    parsed.po_number = asText(body.po_number)
  }

  if (!isUpdate || body.quantity_ordered !== undefined) {
    parsed.quantity_ordered = asPositiveInt(body.quantity_ordered, 'quantity_ordered')
  }

  if (!isUpdate || body.quantity_received !== undefined) {
    parsed.quantity_received = asPositiveInt(body.quantity_received, 'quantity_received')
  }

  if (!isUpdate || body.expected_delivery_date !== undefined) {
    parsed.expected_delivery_date = body.expected_delivery_date ? asDateOnly(body.expected_delivery_date, 'expected_delivery_date', false) : null
  }

  if (!isUpdate || body.actual_delivery_date !== undefined) {
    parsed.actual_delivery_date = body.actual_delivery_date ? asDateOnly(body.actual_delivery_date, 'actual_delivery_date', false) : null
  }

  if (!isUpdate || body.notes !== undefined) parsed.notes = asText(body.notes)
  return parsed
}

function normalizeBreakdownInput(payload, existing = {}) {
  const body = payload || {}
  const totalPieces = body.total_pieces !== undefined ? Number(body.total_pieces) : Number(existing.total_pieces || 0)
  const standardItems = body.standard_items !== undefined ? Number(body.standard_items) : Number(existing.standard_items || 0)
  const lowGradeItems = body.low_grade_items !== undefined ? Number(body.low_grade_items) : Number(existing.low_grade_items || 0)
  const damagedItems = body.damaged_items !== undefined ? Number(body.damaged_items) : Number(existing.damaged_items || 0)
  const saleableItems = standardItems + lowGradeItems
  const premiumItems = 0

  const integerFields = [
    ['total_pieces', totalPieces],
    ['standard_items', standardItems],
    ['low_grade_items', lowGradeItems],
    ['damaged_items', damagedItems]
  ]
  for (const [fieldName, value] of integerFields) {
    if (!Number.isFinite(value) || value < 0 || Math.floor(value) !== value) {
      const err = new Error(`${fieldName} must be a non-negative integer`)
      err.statusCode = 400
      throw err
    }
  }

  if ((saleableItems + damagedItems) > totalPieces && totalPieces > 0) {
    const err = new Error('saleable_items + damaged_items cannot exceed total_pieces')
    err.statusCode = 400
    throw err
  }

  return {
    total_pieces: totalPieces,
    saleable_items: saleableItems,
    premium_items: premiumItems,
    standard_items: standardItems,
    low_grade_items: lowGradeItems,
    damaged_items: damagedItems,
    cost_per_saleable_item: !isBlank(body.cost_per_saleable_item)
      ? asNumber(body.cost_per_saleable_item, 'cost_per_saleable_item')
      : null,
    encoded_by: body.encoded_by !== undefined ? asOptionalInt(body.encoded_by, 'encoded_by') : undefined,
    breakdown_date: body.breakdown_date !== undefined ? asDateOnly(body.breakdown_date, 'breakdown_date', false) : undefined,
    notes: body.notes !== undefined ? asText(body.notes) : undefined
  }
}

async function getBalePurchaseById(id) {
  const [rows] = await db.pool.query(`
    SELECT bp.*
    FROM bale_purchases bp
    WHERE bp.id = ?
    LIMIT 1
  `, [id])
  return rows[0] || null
}

router.get('/', verifyToken, authorize(BALE_VIEW_PERMISSIONS), async (req, res) => {
  try {
    await ensureAutomatedReportsSchema()
    const { from, to, payment_status, search } = req.query
    const params = []
    let sql = `
      SELECT bp.*
      FROM bale_purchases bp
      WHERE 1=1
    `

    const fromDate = asDateOnly(from, 'from')
    const toDate = asDateOnly(to, 'to')
    sql += buildDateFilter('bp', 'purchase_date', fromDate, toDate, params)

    if (!isBlank(payment_status)) {
      params.push(asPaymentStatus(payment_status))
      sql += ' AND bp.payment_status = ?'
    }

    if (!isBlank(search)) {
      const needle = `%${String(search).trim()}%`
      params.push(needle, needle)
      sql += ' AND (bp.bale_batch_no LIKE ? OR bp.supplier_name LIKE ?)'
    }

    sql += ' ORDER BY bp.purchase_date DESC, bp.id DESC'
    const [rows] = await db.pool.query(sql, params)
    res.json(rows)
  } catch (err) {
    console.error(err)
    res.status(err?.statusCode || 500).json({ error: err?.message || 'failed to fetch bale purchases' })
  }
})

router.get('/breakdowns', verifyToken, authorize(BALE_VIEW_PERMISSIONS), async (req, res) => {
  try {
    await ensureAutomatedReportsSchema()
    const { from, to, bale_purchase_id } = req.query
    const params = []
    let sql = `
      SELECT
        bb.*,
        bp.bale_batch_no,
        bp.purchase_date,
        bp.supplier_name,
        COALESCE(bp.total_purchase_cost, bp.bale_cost) AS total_purchase_cost
      FROM bale_breakdowns bb
      JOIN bale_purchases bp ON bp.id = bb.bale_purchase_id
      WHERE 1=1
    `

    const fromDate = asDateOnly(from, 'from')
    const toDate = asDateOnly(to, 'to')
    sql += buildDateFilter('bb', 'breakdown_date', fromDate, toDate, params)

    if (!isBlank(bale_purchase_id)) {
      params.push(asOptionalInt(bale_purchase_id, 'bale_purchase_id'))
      sql += ' AND bb.bale_purchase_id = ?'
    }

    sql += ' ORDER BY COALESCE(bb.breakdown_date, bp.purchase_date) DESC, bb.id DESC'
    const [rows] = await db.pool.query(sql, params)
    res.json(rows)
  } catch (err) {
    console.error(err)
    res.status(err?.statusCode || 500).json({ error: err?.message || 'failed to fetch bale breakdowns' })
  }
})

router.get('/:id', verifyToken, authorize(BALE_VIEW_PERMISSIONS), async (req, res) => {
  try {
    await ensureAutomatedReportsSchema()
    const id = asOptionalInt(req.params.id, 'id')
    const row = await getBalePurchaseById(id)
    if (!row) return res.status(404).json({ error: 'bale purchase not found' })
    res.json(row)
  } catch (err) {
    console.error(err)
    res.status(err?.statusCode || 500).json({ error: err?.message || 'failed to fetch bale purchase' })
  }
})

router.post('/', express.json(), verifyToken, authorize('inventory.receive'), async (req, res) => {
  try {
    await ensureAutomatedReportsSchema()
    const payload = normalizeBalePurchaseInput(req.body, { isUpdate: false })

    // Validate supplier_id if provided
    if (payload.supplier_id) {
      await ensureSupplierExists(payload.supplier_id)
    }

    const [dup] = await db.pool.query('SELECT id FROM bale_purchases WHERE bale_batch_no = ? LIMIT 1', [payload.bale_batch_no])
    if (dup.length) return res.status(400).json({ error: 'bale_batch_no already exists' })

    const [result] = await db.pool.query(`
      INSERT INTO bale_purchases (
        supplier_id, bale_batch_no, po_number, supplier_name, purchase_date, bale_category,
        bale_cost, total_purchase_cost, quantity_ordered,
        payment_status, po_status, expected_delivery_date, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      payload.supplier_id || null,
      payload.bale_batch_no,
      payload.po_number || null,
      payload.supplier_name,
      payload.purchase_date,
      payload.bale_category,
      payload.bale_cost,
      payload.total_purchase_cost,
      payload.quantity_ordered,
      payload.payment_status,
      payload.po_status || 'PENDING',
      payload.expected_delivery_date || null,
      payload.notes
    ])

    const created = await getBalePurchaseById(result.insertId)

    await logAuditEventSafe(db.pool, {
      userId: req.auth.id,
      action: 'BALE_PURCHASE_CREATED',
      resourceType: 'PurchaseOrder',
      resourceId: result.insertId,
      details: {
        module: 'purchasing',
        severity: 'medium',
        target_label: created?.po_number || created?.bale_batch_no || `Purchase order #${result.insertId}`,
        summary: `Created purchase order "${created?.po_number || created?.bale_batch_no || result.insertId}"`,
        after: created
      }
    })
    res.json(created)
  } catch (err) {
    console.error(err)
    if (err?.code === 'ER_DUP_ENTRY') return res.status(400).json({ error: 'bale_batch_no must be unique' })
    res.status(err?.statusCode || 500).json({ error: err?.message || 'failed to create bale purchase' })
  }
})

router.put('/:id', express.json(), verifyToken, authorize('inventory.receive'), async (req, res) => {
  try {
    await ensureAutomatedReportsSchema()
    const id = asOptionalInt(req.params.id, 'id')
    const existing = await getBalePurchaseById(id)
    if (!existing) return res.status(404).json({ error: 'bale purchase not found' })

    const body = req.body || {}
    const payload = normalizeBalePurchaseInput(body, { isUpdate: true })

    // Validate supplier_id if provided
    if (payload.supplier_id) {
      await ensureSupplierExists(payload.supplier_id)
    }

    const hasCostInputs = body.bale_cost !== undefined
    const hasExplicitTotal = body.total_purchase_cost !== undefined && !isBlank(body.total_purchase_cost)
    if (!hasExplicitTotal && (hasCostInputs || body.total_purchase_cost !== undefined)) {
      const baleCost = payload.bale_cost !== undefined ? payload.bale_cost : Number(existing.bale_cost || 0)
      payload.total_purchase_cost = roundMoney(baleCost)
    }

    const updates = []
    const params = []
    const allowedFields = [
      'supplier_id',
      'bale_batch_no',
      'po_number',
      'supplier_name',
      'purchase_date',
      'bale_category',
      'bale_cost',
      'total_purchase_cost',
      'quantity_ordered',
      'quantity_received',
      'payment_status',
      'po_status',
      'expected_delivery_date',
      'actual_delivery_date',
      'notes'
    ]

    for (const field of allowedFields) {
      if (payload[field] !== undefined) {
        updates.push(`${field} = ?`)
        params.push(payload[field])
      }
    }

    if (!updates.length) return res.status(400).json({ error: 'nothing to update' })
    params.push(id)
    await db.pool.query(`UPDATE bale_purchases SET ${updates.join(', ')} WHERE id = ?`, params)

    const updated = await getBalePurchaseById(id)
    await logAuditEventSafe(db.pool, {
      userId: req.auth.id,
      action: 'BALE_PURCHASE_UPDATED',
      resourceType: 'PurchaseOrder',
      resourceId: id,
      details: {
        module: 'purchasing',
        severity: String(existing.po_status || '').toUpperCase() !== String(updated.po_status || '').toUpperCase() ? 'high' : 'medium',
        target_label: updated?.po_number || updated?.bale_batch_no || `Purchase order #${id}`,
        summary: `Updated purchase order "${updated?.po_number || updated?.bale_batch_no || id}"`,
        before: existing,
        after: updated
      }
    })
    res.json(updated)
  } catch (err) {
    console.error(err)
    if (err?.code === 'ER_DUP_ENTRY') return res.status(400).json({ error: 'bale_batch_no must be unique' })
    res.status(err?.statusCode || 500).json({ error: err?.message || 'failed to update bale purchase' })
  }
})

router.delete('/:id', verifyToken, authorize('inventory.receive'), async (req, res) => {
  const conn = await db.pool.getConnection()
  try {
    await ensureAutomatedReportsSchema()
    const id = asOptionalInt(req.params.id, 'id')
    await conn.beginTransaction()

    const [exists] = await conn.query('SELECT id FROM bale_purchases WHERE id = ? LIMIT 1 FOR UPDATE', [id])
    if (!exists.length) {
      await conn.rollback()
      conn.release()
      return res.status(404).json({ error: 'bale purchase not found' })
    }

    const beforeDelete = await getBalePurchaseById(id)
    await conn.query('DELETE FROM bale_purchases WHERE id = ?', [id])
    await conn.commit()
    conn.release()

    await logAuditEventSafe(db.pool, {
      userId: req.auth.id,
      action: 'BALE_PURCHASE_DELETED',
      resourceType: 'PurchaseOrder',
      resourceId: id,
      details: {
        module: 'purchasing',
        severity: 'high',
        target_label: beforeDelete?.po_number || beforeDelete?.bale_batch_no || `Purchase order #${id}`,
        summary: `Deleted purchase order "${beforeDelete?.po_number || beforeDelete?.bale_batch_no || id}"`,
        before: beforeDelete
      }
    })
    res.json({ success: true })
  } catch (err) {
    await conn.rollback()
    conn.release()
    console.error(err)
    res.status(err?.statusCode || 500).json({ error: err?.message || 'failed to delete bale purchase' })
  }
})

router.get('/:id/breakdown', verifyToken, authorize(BALE_VIEW_PERMISSIONS), async (req, res) => {
  try {
    await ensureAutomatedReportsSchema()
    const id = asOptionalInt(req.params.id, 'id')
    const [rows] = await db.pool.query(`
      SELECT
        bb.*,
        bp.bale_batch_no,
        COALESCE(bp.total_purchase_cost, bp.bale_cost) AS total_purchase_cost
      FROM bale_breakdowns bb
      JOIN bale_purchases bp ON bp.id = bb.bale_purchase_id
      WHERE bb.bale_purchase_id = ?
      LIMIT 1
    `, [id])
    if (!rows.length) return res.status(404).json({ error: 'bale breakdown not found' })
    res.json(rows[0])
  } catch (err) {
    console.error(err)
    res.status(err?.statusCode || 500).json({ error: err?.message || 'failed to fetch bale breakdown' })
  }
})

async function upsertBreakdown(req, res) {
  const conn = await db.pool.getConnection()
  try {
    await ensureAutomatedReportsSchema()
    const balePurchaseId = asOptionalInt(req.params.id, 'id')
    await conn.beginTransaction()

    const [purchaseRows] = await conn.query(`
      SELECT
        id,
        COALESCE(total_purchase_cost, bale_cost) AS total_purchase_cost
      FROM bale_purchases
      WHERE id = ?
      LIMIT 1
      FOR UPDATE
    `, [balePurchaseId])
    if (!purchaseRows.length) {
      await conn.rollback()
      conn.release()
      return res.status(404).json({ error: 'bale purchase not found' })
    }

    const [existingRows] = await conn.query('SELECT * FROM bale_breakdowns WHERE bale_purchase_id = ? LIMIT 1 FOR UPDATE', [balePurchaseId])
    const existing = existingRows[0] || {}
    const payload = normalizeBreakdownInput(req.body, existing)

    const saleableItems = payload.saleable_items
    const computedCostPerSaleableItem = saleableItems > 0
      ? roundMoney(Number(purchaseRows[0].total_purchase_cost || 0) / saleableItems)
      : 0
    const costPerSaleableItem = payload.cost_per_saleable_item === null
      ? computedCostPerSaleableItem
      : payload.cost_per_saleable_item
    const encodedBy = payload.encoded_by === undefined ? (existing.encoded_by || req.auth.id) : payload.encoded_by
    const breakdownDate = payload.breakdown_date === undefined
      ? (existing.breakdown_date || new Date().toISOString().slice(0, 10))
      : payload.breakdown_date
    const notes = payload.notes === undefined ? existing.notes || null : payload.notes

    if (!existingRows.length) {
      await conn.query(`
        INSERT INTO bale_breakdowns (
          bale_purchase_id, total_pieces, saleable_items, premium_items,
          standard_items, low_grade_items, damaged_items, cost_per_saleable_item,
          encoded_by, breakdown_date, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        balePurchaseId,
        payload.total_pieces,
        payload.saleable_items,
        payload.premium_items,
        payload.standard_items,
        payload.low_grade_items,
        payload.damaged_items,
        costPerSaleableItem,
        encodedBy,
        breakdownDate,
        notes
      ])
    } else {
      await conn.query(`
        UPDATE bale_breakdowns
        SET total_pieces = ?,
            saleable_items = ?,
            premium_items = ?,
            standard_items = ?,
            low_grade_items = ?,
            damaged_items = ?,
            cost_per_saleable_item = ?,
            encoded_by = ?,
            breakdown_date = ?,
            notes = ?
        WHERE bale_purchase_id = ?
      `, [
        payload.total_pieces,
        payload.saleable_items,
        payload.premium_items,
        payload.standard_items,
        payload.low_grade_items,
        payload.damaged_items,
        costPerSaleableItem,
        encodedBy,
        breakdownDate,
        notes,
        balePurchaseId
      ])
    }

    await conn.commit()
    conn.release()

    const [rows] = await db.pool.query(`
      SELECT
        bb.*,
        bp.bale_batch_no,
        COALESCE(bp.total_purchase_cost, bp.bale_cost) AS total_purchase_cost
      FROM bale_breakdowns bb
      JOIN bale_purchases bp ON bp.id = bb.bale_purchase_id
      WHERE bb.bale_purchase_id = ?
      LIMIT 1
    `, [balePurchaseId])

    await logAuditEventSafe(db.pool, {
      userId: req.auth.id,
      action: 'BALE_BREAKDOWN_SAVED',
      resourceType: 'BaleBreakdown',
      resourceId: balePurchaseId,
      details: {
        module: 'purchasing',
        severity: 'medium',
        target_label: rows[0]?.bale_batch_no || `Bale breakdown #${balePurchaseId}`,
        summary: `Saved bale breakdown for "${rows[0]?.bale_batch_no || balePurchaseId}"`,
        after: rows[0] || null,
        metrics: {
          total_pieces: rows[0]?.total_pieces || 0,
          saleable_items: rows[0]?.saleable_items || 0,
          damaged_items: rows[0]?.damaged_items || 0
        }
      }
    })

    res.json(rows[0] || null)
  } catch (err) {
    await conn.rollback()
    conn.release()
    console.error(err)
    res.status(err?.statusCode || 500).json({ error: err?.message || 'failed to save bale breakdown' })
  }
}

router.post('/:id/breakdown', express.json(), verifyToken, authorize('inventory.receive'), upsertBreakdown)
router.put('/:id/breakdown', express.json(), verifyToken, authorize('inventory.receive'), upsertBreakdown)

// Receive P.O. order: Mark as COMPLETED and increment product stock
router.post('/:id/receive', express.json(), verifyToken, authorize('inventory.receive'), async (req, res) => {
  const conn = await db.pool.getConnection()
  try {
    await ensureAutomatedReportsSchema()
    const id = asOptionalInt(req.params.id, 'id')
    const body = req.body || {}
    const quantityToReceive = asPositiveInt(body.quantity_received, 'quantity_received')

    await conn.beginTransaction()

    const [purchaseRows] = await conn.query(`
      SELECT id, po_status, quantity_ordered, bale_purchase_id, product_id
      FROM bale_purchases
      WHERE id = ?
      LIMIT 1
      FOR UPDATE
    `, [id])

    if (!purchaseRows.length) {
      await conn.rollback()
      conn.release()
      return res.status(404).json({ error: 'purchase order not found' })
    }

    const purchase = purchaseRows[0]
    if (String(purchase.po_status).toUpperCase() === 'COMPLETED') {
      await conn.rollback()
      conn.release()
      return res.status(400).json({ error: 'purchase order is already completed' })
    }

    if (quantityToReceive <= 0) {
      await conn.rollback()
      conn.release()
      return res.status(400).json({ error: 'quantity_received must be greater than 0' })
    }

    // Update P.O. status to COMPLETED
    const today = new Date().toISOString().slice(0, 10)
    await conn.query(`
      UPDATE bale_purchases
      SET po_status = ?, quantity_received = ?, actual_delivery_date = ?
      WHERE id = ?
    `, ['COMPLETED', quantityToReceive, today, id])

    // Get products associated with this P.O. (if any) and increment stock
    // If no specific product, store as a generic inventory update
    const [poDetails] = await conn.query(`
      SELECT product_id, quantity_ordered
      FROM bale_purchases
      WHERE id = ?
      LIMIT 1
    `, [id])

    if (poDetails.length && poDetails[0].product_id) {
      // Increment specific product's stock
      await conn.query(`
        UPDATE products
        SET stock_quantity = stock_quantity + ?
        WHERE id = ?
      `, [quantityToReceive, poDetails[0].product_id])
    } else {
      // For bale/generic purchases, track in inventory adjustments
      // This allows flexibility for multi-item P.O.s in future
      const [adjustmentTable] = await conn.query(`
        SELECT 1 FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'inventory_adjustments'
        LIMIT 1
      `)

      if (adjustmentTable.length) {
        await conn.query(`
          INSERT INTO inventory_adjustments (
            bale_purchase_id, adjustment_type, quantity, reason, adjustment_date
          ) VALUES (?, ?, ?, ?, ?)
        `, [id, 'received', quantityToReceive, 'P.O. received and recorded', today])
      }
    }

    await conn.commit()
    conn.release()

    const updated = await getBalePurchaseById(id)
    await logAuditEventSafe(db.pool, {
      userId: req.auth.id,
      action: 'PURCHASE_ORDER_RECEIVED',
      resourceType: 'PurchaseOrder',
      resourceId: id,
      details: {
        module: 'purchasing',
        severity: 'high',
        target_label: updated?.po_number || updated?.bale_batch_no || `Purchase order #${id}`,
        summary: `Received purchase order "${updated?.po_number || updated?.bale_batch_no || id}"`,
        after: updated,
        metrics: { quantity_received: quantityToReceive }
      }
    })
    res.json({
      success: true,
      message: `Purchase order completed. ${quantityToReceive} units received.`,
      purchase_order: updated
    })
  } catch (err) {
    await conn.rollback()
    conn.release()
    console.error(err)
    res.status(err?.statusCode || 500).json({ error: err?.message || 'failed to receive purchase order' })
  }
})

module.exports = router
