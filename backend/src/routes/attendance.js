const express = require('express')
const router = express.Router()
const db = require('../database')
const { verifyToken, authorize } = require('../middleware/authMiddleware')
const { logAuditEventSafe } = require('../utils/auditLog')

const ATTENDANCE_VIEW_PERMS   = ['attendance.view', 'payroll.view', 'payroll.period.view', 'admin.*']
const ATTENDANCE_MANAGE_PERMS = ['attendance.manage', 'payroll.input.update', 'admin.*']

const VALID_STATUSES = ['PRESENT', 'LATE', 'HALF_DAY', 'ABSENT', 'ON_LEAVE', 'REST_DAY', 'HOLIDAY']
const TIME_RE        = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/
const DATE_RE        = /^\d{4}-\d{2}-\d{2}$/

function isBlank(v) { return v === undefined || v === null || String(v).trim() === '' }
function asText(v)  { return isBlank(v) ? null : String(v).trim() }
function padDatePart(v) { return String(v).padStart(2, '0') }
function formatDateOnly(value) {
  if (isBlank(value)) return null
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getFullYear()}-${padDatePart(value.getMonth() + 1)}-${padDatePart(value.getDate())}`
  }
  const text = String(value).trim()
  if (DATE_RE.test(text)) return text
  const parsed = new Date(text)
  if (!Number.isNaN(parsed.getTime())) {
    return `${parsed.getFullYear()}-${padDatePart(parsed.getMonth() + 1)}-${padDatePart(parsed.getDate())}`
  }
  return text.slice(0, 10)
}
function todayDateOnly() { return formatDateOnly(new Date()) }
function serializeAttendanceRow(row) {
  if (!row) return row
  return {
    ...row,
    date: formatDateOnly(row.date)
  }
}
function asDate(v, field, required = false) {
  if (isBlank(v)) {
    if (required) { const e = new Error(`${field} is required`); e.statusCode = 400; throw e }
    return null
  }
  const s = String(v).trim()
  if (!DATE_RE.test(s)) { const e = new Error(`${field} must be YYYY-MM-DD`); e.statusCode = 400; throw e }
  return s
}
function asTime(v, field) {
  if (isBlank(v)) return null
  const s = String(v).trim()
  if (!TIME_RE.test(s)) { const e = new Error(`${field} must be HH:MM or HH:MM:SS`); e.statusCode = 400; throw e }
  return s.slice(0, 5)
}
function asInt(v, fallback = 0) {
  const n = parseInt(v, 10)
  return Number.isFinite(n) && n >= 0 ? n : fallback
}

function computeMinutes(clock_in, clock_out) {
  if (!clock_in || !clock_out) return 0
  const [ih, im] = clock_in.split(':').map(Number)
  const [oh, om] = clock_out.split(':').map(Number)
  const diff = (oh * 60 + om) - (ih * 60 + im)
  return diff > 0 ? diff : 0
}

function deriveLateUndertime(clock_in, clock_out, expected_in, expected_out) {
  let late = 0
  let undertime = 0
  let overtime = 0
  if (clock_in && expected_in) {
    const [ih, im] = clock_in.split(':').map(Number)
    const [eh, em] = expected_in.split(':').map(Number)
    const diff = (ih * 60 + im) - (eh * 60 + em)
    if (diff > 0) late = diff
  }
  if (clock_out && expected_out) {
    const [oh, om] = clock_out.split(':').map(Number)
    const [eh, em] = expected_out.split(':').map(Number)
    const diff = (eh * 60 + em) - (oh * 60 + om)
    if (diff > 0) undertime = diff
    else overtime = Math.abs(diff)
  }
  return { late, undertime, overtime }
}

function deriveHoursWorked(clock_in, clock_out) {
  const mins = computeMinutes(clock_in, clock_out)
  return Math.round((mins / 60) * 100) / 100
}

// ── GET /attendance  (list, filterable by employee_id, date range) ────────
router.get('/', verifyToken, authorize(ATTENDANCE_VIEW_PERMS), async (req, res) => {
  try {
    const { employee_id, from, to, status, page = 1, limit = 100 } = req.query
    const params = []
    const conditions = []

    if (employee_id) { conditions.push('a.employee_id = ?'); params.push(Number(employee_id)) }
    if (from)        { conditions.push('a.date >= ?'); params.push(from) }
    if (to)          { conditions.push('a.date <= ?'); params.push(to) }
    if (status)      { conditions.push('a.status = ?'); params.push(status.toUpperCase()) }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
    const offset = (Math.max(Number(page), 1) - 1) * Number(limit)

    const [rows] = await db.pool.query(
      `SELECT a.*, e.name AS employee_name, e.pay_basis, e.position_title
       FROM attendance a
       LEFT JOIN employees e ON e.id = a.employee_id
       ${where}
       ORDER BY a.date DESC, a.employee_id ASC
       LIMIT ? OFFSET ?`,
      [...params, Number(limit), offset]
    )
    const [[{ total }]] = await db.pool.query(
      `SELECT COUNT(*) AS total FROM attendance a ${where}`,
      params
    )
    res.json({ data: rows.map(serializeAttendanceRow), total, page: Number(page), limit: Number(limit) })
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message })
  }
})

// ── GET /attendance/summary  (aggregate per employee for payroll sync preview) ──
router.get('/summary', verifyToken, authorize(ATTENDANCE_VIEW_PERMS), async (req, res) => {
  try {
    const { from, to } = req.query
    if (!from || !to) return res.status(400).json({ error: 'from and to dates are required' })

    const [rows] = await db.pool.query(
      `SELECT
         a.employee_id,
         e.name AS employee_name,
         COUNT(CASE WHEN a.status IN ('PRESENT','LATE','HALF_DAY') THEN 1 END)  AS days_worked,
         SUM(CASE WHEN a.status = 'ABSENT' THEN 1 ELSE 0 END)                   AS absent_days,
         ROUND(SUM(COALESCE(a.hours_worked, 0)), 2)                              AS hours_worked,
         ROUND(SUM(CASE WHEN a.overtime_minutes > 0 THEN a.overtime_minutes/60 ELSE 0 END), 2) AS overtime_hours,
         SUM(COALESCE(a.late_minutes, 0))                                        AS late_minutes,
         SUM(COALESCE(a.undertime_minutes, 0))                                   AS undertime_minutes,
         COUNT(CASE WHEN a.status = 'HOLIDAY' THEN 1 END)                        AS holiday_days,
         COUNT(CASE WHEN a.status = 'REST_DAY' THEN 1 END)                       AS rest_day_days,
         COUNT(CASE WHEN a.status = 'ON_LEAVE' THEN 1 END)                       AS paid_leave_days
       FROM attendance a
       LEFT JOIN employees e ON e.id = a.employee_id
       WHERE a.date BETWEEN ? AND ?
       GROUP BY a.employee_id, e.name
       ORDER BY e.name`,
      [from, to]
    )
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── GET /attendance/me  (employee views their own attendance records) ─────
router.get('/me', verifyToken, authorize(['attendance.view_own', 'attendance.view', 'admin.*']), async (req, res) => {
  try {
    const userId = req.auth?.id
    if (!userId) return res.status(401).json({ error: 'Not authenticated' })

    const [[employee]] = await db.pool.query(
      'SELECT id FROM employees WHERE user_id = ? LIMIT 1',
      [userId]
    )
    if (!employee) return res.status(404).json({ error: 'No employee record linked to your account' })

    const { from, to, status, page = 1, limit = 100 } = req.query
    const params = [employee.id]
    const conditions = ['a.employee_id = ?']

    if (from)   { conditions.push('a.date >= ?'); params.push(from) }
    if (to)     { conditions.push('a.date <= ?'); params.push(to) }
    if (status) { conditions.push('a.status = ?'); params.push(status.toUpperCase()) }

    const where = `WHERE ${conditions.join(' AND ')}`
    const offset = (Math.max(Number(page), 1) - 1) * Number(limit)

    const [rows] = await db.pool.query(
      `SELECT a.*, e.name AS employee_name, e.pay_basis, e.position_title
       FROM attendance a
       LEFT JOIN employees e ON e.id = a.employee_id
       ${where}
       ORDER BY a.date DESC
       LIMIT ? OFFSET ?`,
      [...params, Number(limit), offset]
    )
    const [[{ total }]] = await db.pool.query(
      `SELECT COUNT(*) AS total FROM attendance a ${where}`,
      params
    )
    res.json({ data: rows.map(serializeAttendanceRow), total, page: Number(page), limit: Number(limit) })
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message })
  }
})

// ── GET /attendance/:id ───────────────────────────────────────────────────
router.get('/:id', verifyToken, authorize(ATTENDANCE_VIEW_PERMS), async (req, res) => {
  try {
    const [[row]] = await db.pool.query(
      `SELECT a.*, e.name AS employee_name, e.pay_basis, e.position_title
       FROM attendance a LEFT JOIN employees e ON e.id = a.employee_id
       WHERE a.id = ?`,
      [req.params.id]
    )
    if (!row) return res.status(404).json({ error: 'Attendance record not found' })
    res.json(serializeAttendanceRow(row))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── POST /attendance  (create or bulk upsert via array) ───────────────────
router.post('/', verifyToken, authorize(ATTENDANCE_MANAGE_PERMS), async (req, res) => {
  try {
    const body = req.body

    if (Array.isArray(body)) {
      const results = []
      for (const entry of body) {
        results.push(await upsertRecord(entry, req.auth?.id))
      }
      return res.status(201).json(results)
    }

    const record = await upsertRecord(body, req.auth?.id)
    await logAuditEventSafe(req, 'attendance.create', 'attendance', record.id)
    res.status(201).json(serializeAttendanceRow(record))
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message })
  }
})

// ── PUT /attendance/:id  (update) ─────────────────────────────────────────
router.put('/:id', verifyToken, authorize(ATTENDANCE_MANAGE_PERMS), async (req, res) => {
  try {
    const [[existing]] = await db.pool.query('SELECT * FROM attendance WHERE id = ?', [req.params.id])
    if (!existing) return res.status(404).json({ error: 'Attendance record not found' })

    const body = req.body
    const clock_in  = asTime(body.clock_in,  'clock_in')  ?? existing.clock_in
    const clock_out = asTime(body.clock_out, 'clock_out') ?? existing.clock_out
    const exp_in    = asTime(body.expected_clock_in,  'expected_clock_in')  ?? existing.expected_clock_in
    const exp_out   = asTime(body.expected_clock_out, 'expected_clock_out') ?? existing.expected_clock_out
    const { late, undertime, overtime } = deriveLateUndertime(clock_in, clock_out, exp_in, exp_out)
    const hours_worked = body.hours_worked != null ? Number(body.hours_worked) : deriveHoursWorked(clock_in, clock_out)

    await db.pool.query(
      `UPDATE attendance SET
         date = ?, clock_in = ?, clock_out = ?, hours_worked = ?,
         expected_clock_in = ?, expected_clock_out = ?,
         status = ?, late_minutes = ?, undertime_minutes = ?, overtime_minutes = ?,
         notes = ?, updated_by = ?, updated_at = NOW()
       WHERE id = ?`,
      [
        asDate(body.date, 'date') ?? existing.date,
        clock_in, clock_out, hours_worked,
        exp_in, exp_out,
        asText(body.status) ?? existing.status,
        asInt(body.late_minutes, late), asInt(body.undertime_minutes, undertime), asInt(body.overtime_minutes, overtime),
        asText(body.notes) ?? existing.notes,
        req.auth?.id,
        req.params.id
      ]
    )
    const [[updated]] = await db.pool.query('SELECT * FROM attendance WHERE id = ?', [req.params.id])
    await logAuditEventSafe(req, 'attendance.update', 'attendance', req.params.id)
    res.json(serializeAttendanceRow(updated))
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message })
  }
})

// ── DELETE /attendance/:id ────────────────────────────────────────────────
router.delete('/:id', verifyToken, authorize(ATTENDANCE_MANAGE_PERMS), async (req, res) => {
  try {
    const [[existing]] = await db.pool.query('SELECT id FROM attendance WHERE id = ?', [req.params.id])
    if (!existing) return res.status(404).json({ error: 'Attendance record not found' })
    await db.pool.query('DELETE FROM attendance WHERE id = ?', [req.params.id])
    await logAuditEventSafe(req, 'attendance.delete', 'attendance', req.params.id)
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── POST /attendance/clock-in  (quick time-in for today) ─────────────────
router.post('/clock-in', verifyToken, authorize(ATTENDANCE_MANAGE_PERMS), async (req, res) => {
  try {
    const { employee_id, expected_clock_in, expected_clock_out } = req.body
    if (!employee_id) return res.status(400).json({ error: 'employee_id is required' })

    const today = todayDateOnly()
    const now   = new Date().toTimeString().slice(0, 5)

    const exp_in  = asTime(expected_clock_in,  'expected_clock_in')
    const exp_out = asTime(expected_clock_out, 'expected_clock_out')
    const { late } = deriveLateUndertime(now, null, exp_in, null)
    const status = late > 0 ? 'LATE' : 'PRESENT'

    const [[existing]] = await db.pool.query(
      'SELECT id FROM attendance WHERE employee_id = ? AND date = ?',
      [employee_id, today]
    )

    if (existing) {
      await db.pool.query(
        'UPDATE attendance SET clock_in = ?, status = ?, late_minutes = ?, expected_clock_in = ?, expected_clock_out = ?, updated_by = ? WHERE id = ?',
        [now, status, late, exp_in, exp_out, req.auth?.id, existing.id]
      )
      const [[updated]] = await db.pool.query('SELECT * FROM attendance WHERE id = ?', [existing.id])
      return res.json(serializeAttendanceRow(updated))
    }

    const [result] = await db.pool.query(
      `INSERT INTO attendance (employee_id, date, clock_in, status, late_minutes, expected_clock_in, expected_clock_out, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [employee_id, today, now, status, late, exp_in, exp_out, req.auth?.id]
    )
    const [[created]] = await db.pool.query('SELECT * FROM attendance WHERE id = ?', [result.insertId])
    res.status(201).json(serializeAttendanceRow(created))
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message })
  }
})

// ── POST /attendance/clock-out  (quick time-out for today) ───────────────
router.post('/clock-out', verifyToken, authorize(ATTENDANCE_MANAGE_PERMS), async (req, res) => {
  try {
    const { employee_id } = req.body
    if (!employee_id) return res.status(400).json({ error: 'employee_id is required' })

    const today = todayDateOnly()
    const now   = new Date().toTimeString().slice(0, 5)

    const [[existing]] = await db.pool.query(
      'SELECT * FROM attendance WHERE employee_id = ? AND date = ?',
      [employee_id, today]
    )
    if (!existing) return res.status(404).json({ error: 'No clock-in found for today' })

    const { undertime, overtime } = deriveLateUndertime(
      existing.clock_in, now,
      existing.expected_clock_in, existing.expected_clock_out
    )
    const hours_worked = deriveHoursWorked(existing.clock_in, now)

    await db.pool.query(
      `UPDATE attendance SET clock_out = ?, hours_worked = ?, undertime_minutes = ?, overtime_minutes = ?, updated_by = ? WHERE id = ?`,
      [now, hours_worked, undertime, overtime, req.auth?.id, existing.id]
    )
    const [[updated]] = await db.pool.query('SELECT * FROM attendance WHERE id = ?', [existing.id])
    res.json(serializeAttendanceRow(updated))
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message })
  }
})

async function upsertRecord(body, userId) {
  const employee_id = Number(body.employee_id)
  if (!employee_id) { const e = new Error('employee_id is required'); e.statusCode = 400; throw e }

  const date      = asDate(body.date, 'date', true)
  const clock_in  = asTime(body.clock_in,  'clock_in')
  const clock_out = asTime(body.clock_out, 'clock_out')
  const exp_in    = asTime(body.expected_clock_in,  'expected_clock_in')
  const exp_out   = asTime(body.expected_clock_out, 'expected_clock_out')
  const { late, undertime, overtime } = deriveLateUndertime(clock_in, clock_out, exp_in, exp_out)
  const hours_worked = body.hours_worked != null ? Number(body.hours_worked) : deriveHoursWorked(clock_in, clock_out)
  const status = asText(body.status) || (clock_in ? (late > 0 ? 'LATE' : 'PRESENT') : 'ABSENT')

  const [[existing]] = await db.pool.query(
    'SELECT id FROM attendance WHERE employee_id = ? AND date = ?',
    [employee_id, date]
  )

  if (existing) {
    await db.pool.query(
      `UPDATE attendance SET clock_in=?, clock_out=?, hours_worked=?,
        expected_clock_in=?, expected_clock_out=?,
        status=?, late_minutes=?, undertime_minutes=?, overtime_minutes=?,
        notes=?, updated_by=? WHERE id=?`,
      [clock_in, clock_out, hours_worked, exp_in, exp_out,
       status, asInt(body.late_minutes, late), asInt(body.undertime_minutes, undertime), asInt(body.overtime_minutes, overtime),
       asText(body.notes), userId, existing.id]
    )
    const [[updated]] = await db.pool.query('SELECT * FROM attendance WHERE id = ?', [existing.id])
    return serializeAttendanceRow(updated)
  }

  const [result] = await db.pool.query(
    `INSERT INTO attendance
       (employee_id, date, clock_in, clock_out, hours_worked,
        expected_clock_in, expected_clock_out,
        status, late_minutes, undertime_minutes, overtime_minutes,
        notes, created_by)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [employee_id, date, clock_in, clock_out, hours_worked,
     exp_in, exp_out,
     status, asInt(body.late_minutes, late), asInt(body.undertime_minutes, undertime), asInt(body.overtime_minutes, overtime),
     asText(body.notes), userId]
  )
  const [[created]] = await db.pool.query('SELECT * FROM attendance WHERE id = ?', [result.insertId])
  return serializeAttendanceRow(created)
}

module.exports = router
