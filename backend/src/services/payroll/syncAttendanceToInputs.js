const db = require('../../database')

async function columnExists(tableName, columnName) {
  const [rows] = await db.pool.query(
    `SELECT 1 AS found
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND COLUMN_NAME = ?
     LIMIT 1`,
    [tableName, columnName]
  )
  return rows.length > 0
}

async function syncAttendanceToInputs(periodId, userId) {
  const [[period]] = await db.pool.query(
    'SELECT * FROM payroll_periods WHERE id = ?',
    [periodId]
  )
  if (!period) throw Object.assign(new Error('Payroll period not found'), { statusCode: 404 })
  if (['finalized', 'released', 'void'].includes(period.status)) {
    throw Object.assign(new Error('Cannot sync attendance into a finalized/released/void period'), { statusCode: 400 })
  }

  // pull attendance summary for all employees in this date range
  const [summaries] = await db.pool.query(
    `SELECT
       a.employee_id,
       e.name AS employee_name,
       COUNT(CASE WHEN a.status IN ('PRESENT','LATE','HALF_DAY') THEN 1 END)    AS days_worked,
       SUM(CASE WHEN a.status = 'ABSENT' THEN 1 ELSE 0 END)                     AS absent_days,
       ROUND(SUM(COALESCE(a.hours_worked, 0)), 2)                                AS hours_worked,
       ROUND(SUM(CASE WHEN a.overtime_minutes > 0 THEN a.overtime_minutes/60.0 ELSE 0 END), 2) AS overtime_hours,
       SUM(COALESCE(a.late_minutes, 0))                                          AS late_minutes,
       SUM(COALESCE(a.undertime_minutes, 0))                                     AS undertime_minutes,
       COUNT(CASE WHEN a.status = 'HOLIDAY' THEN 1 END)                          AS regular_holiday_days,
       COUNT(CASE WHEN a.status = 'REST_DAY' THEN 1 END)                         AS rest_day_days,
       COUNT(CASE WHEN a.status = 'ON_LEAVE' THEN 1 END)                         AS paid_leave_days
     FROM attendance a
     LEFT JOIN employees e ON e.id = a.employee_id
     WHERE a.date BETWEEN ? AND ?
     GROUP BY a.employee_id, e.name`,
    [period.start_date, period.end_date]
  )

  if (summaries.length === 0) {
    return { synced: 0, message: 'No attendance records found for this period' }
  }

  // map employee_id → user_id (employees table has id, users have id; payroll uses users.id)
  // Support older and newer schemas: either side may carry the employee/user link.
  const empIds = summaries.map((s) => s.employee_id)
  const hasUsersEmployeeIdColumn = await columnExists('users', 'employee_id')
  const hasEmployeesUserIdColumn = await columnExists('employees', 'user_id')
  const joinConditions = []

  if (hasUsersEmployeeIdColumn) joinConditions.push('u.employee_id = e.id')
  if (hasEmployeesUserIdColumn) joinConditions.push('e.user_id = u.id')
  joinConditions.push('u.id = e.id')

  const [userMappings] = await db.pool.query(
    `SELECT e.id AS employee_id, u.id AS user_id
     FROM employees e
     LEFT JOIN users u ON ${joinConditions.join(' OR ')}
     WHERE e.id IN (${empIds.map(() => '?').join(',')})`,
    empIds
  )

  const empToUser = {}
  for (const m of userMappings) {
    if (m.user_id) empToUser[m.employee_id] = m.user_id
  }

  // fallback: assume employee_id maps directly to user_id
  for (const s of summaries) {
    if (!empToUser[s.employee_id]) empToUser[s.employee_id] = s.employee_id
  }

  let synced = 0
  const results = []

  for (const s of summaries) {
    const user_id = empToUser[s.employee_id]
    if (!user_id) continue

    // check if payroll profile exists for this user
    const [[profile]] = await db.pool.query(
      'SELECT id FROM payroll_profiles WHERE user_id = ? AND status = ?',
      [user_id, 'active']
    )
    if (!profile) continue

    const [[existing]] = await db.pool.query(
      'SELECT id FROM payroll_inputs WHERE payroll_period_id = ? AND user_id = ?',
      [periodId, user_id]
    )

    const payload = [
      Number(s.days_worked)         || 0,
      Number(s.hours_worked)        || 0,
      Number(s.overtime_hours)      || 0,
      Number(s.late_minutes)        || 0,
      Number(s.undertime_minutes)   || 0,
      Number(s.absent_days)         || 0,
      Number(s.regular_holiday_days)|| 0,
      0, // special_holiday_days — not tracked in attendance status yet
      Number(s.rest_day_days)       || 0,
      Number(s.paid_leave_days)     || 0,
      0, // unpaid_leave_days
      userId
    ]

    if (existing) {
      await db.pool.query(
        `UPDATE payroll_inputs SET
           days_worked=?, hours_worked=?, overtime_hours=?,
           late_minutes=?, undertime_minutes=?, absent_days=?,
           regular_holiday_days=?, special_holiday_days=?, rest_day_days=?,
           paid_leave_days=?, unpaid_leave_days=?,
           updated_by=?
         WHERE payroll_period_id=? AND user_id=?`,
        [...payload, periodId, user_id]
      )
    } else {
      await db.pool.query(
        `INSERT INTO payroll_inputs
           (payroll_period_id, user_id,
            days_worked, hours_worked, overtime_hours,
            late_minutes, undertime_minutes, absent_days,
            regular_holiday_days, special_holiday_days, rest_day_days,
            paid_leave_days, unpaid_leave_days, created_by)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [periodId, user_id, ...payload]
      )
    }

    synced++
    results.push({ employee_id: s.employee_id, user_id, employee_name: s.employee_name, days_worked: s.days_worked })
  }

  return { synced, message: `Synced attendance for ${synced} employee(s)`, employees: results }
}

module.exports = { syncAttendanceToInputs }
