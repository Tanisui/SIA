const express = require('express')
const router = express.Router()
const db = require('../database')
const { verifyToken, authorize } = require('../middleware/authMiddleware')

// List attendance records (filterable by employee_id, date range)
router.get('/', verifyToken, authorize('attendance.view'), async (req, res) => {
  try {
    const { employee_id, start_date, end_date } = req.query
    let sql = `SELECT a.*, e.name AS employee_name
               FROM attendance a
               LEFT JOIN employees e ON e.id = a.employee_id
               WHERE 1=1`
    const params = []
    if (employee_id) { sql += ' AND a.employee_id = ?'; params.push(employee_id) }
    if (start_date) { sql += ' AND a.date >= ?'; params.push(start_date) }
    if (end_date) { sql += ' AND a.date <= ?'; params.push(end_date) }
    sql += ' ORDER BY a.date DESC, a.id DESC'
    const [rows] = await db.pool.query(sql, params)
    res.json(rows)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'failed to fetch attendance' })
  }
})

// Get single attendance record
router.get('/:id', verifyToken, authorize('attendance.view'), async (req, res) => {
  try {
    const [rows] = await db.pool.query(
      `SELECT a.*, e.name AS employee_name
       FROM attendance a
       LEFT JOIN employees e ON e.id = a.employee_id
       WHERE a.id = ? LIMIT 1`, [req.params.id])
    if (!rows.length) return res.status(404).json({ error: 'record not found' })
    res.json(rows[0])
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'failed to fetch attendance record' })
  }
})

// Clock in / Create attendance record
router.post('/', express.json(), verifyToken, authorize('attendance.record'), async (req, res) => {
  try {
    const { employee_id, date, clock_in, clock_out, hours_worked, notes } = req.body
    if (!employee_id) return res.status(400).json({ error: 'employee_id is required' })
    if (!date) return res.status(400).json({ error: 'date is required' })

    // Calculate hours if clock_in and clock_out provided but hours_worked not
    let hours = hours_worked
    if (!hours && clock_in && clock_out) {
      const inParts = clock_in.split(':').map(Number)
      const outParts = clock_out.split(':').map(Number)
      const inMin = inParts[0] * 60 + (inParts[1] || 0)
      const outMin = outParts[0] * 60 + (outParts[1] || 0)
      hours = Math.max(0, (outMin - inMin) / 60).toFixed(2)
    }

    const [result] = await db.pool.query(
      `INSERT INTO attendance (employee_id, date, clock_in, clock_out, hours_worked, notes)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [employee_id, date, clock_in || null, clock_out || null, hours || null, notes || null]
    )
    res.json({ id: result.insertId })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'failed to create attendance record' })
  }
})

// Update attendance record
router.put('/:id', express.json(), verifyToken, authorize('attendance.record'), async (req, res) => {
  try {
    const id = req.params.id
    const { employee_id, date, clock_in, clock_out, hours_worked, notes } = req.body
    const updates = []
    const params = []
    if (employee_id !== undefined) { updates.push('employee_id = ?'); params.push(employee_id) }
    if (date !== undefined) { updates.push('date = ?'); params.push(date) }
    if (clock_in !== undefined) { updates.push('clock_in = ?'); params.push(clock_in) }
    if (clock_out !== undefined) { updates.push('clock_out = ?'); params.push(clock_out) }
    if (hours_worked !== undefined) { updates.push('hours_worked = ?'); params.push(hours_worked) }
    if (notes !== undefined) { updates.push('notes = ?'); params.push(notes) }
    if (!updates.length) return res.status(400).json({ error: 'nothing to update' })
    params.push(id)
    await db.pool.query(`UPDATE attendance SET ${updates.join(', ')} WHERE id = ?`, params)
    res.json({ success: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'failed to update attendance record' })
  }
})

// Delete attendance record
router.delete('/:id', verifyToken, authorize('attendance.record'), async (req, res) => {
  try {
    await db.pool.query('DELETE FROM attendance WHERE id = ?', [req.params.id])
    res.json({ success: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'failed to delete attendance record' })
  }
})

module.exports = router
