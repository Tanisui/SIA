const db = require('../../database')
const { ensureProfilesForPeriod } = require('./computePayrollRun')

async function columnExists(tableName, columnName, conn = db.pool) {
  const [rows] = await conn.query(
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

function padDatePart(value) {
  return String(value).padStart(2, '0')
}

function asDateOnly(value) {
  if (!value) return null
  if (typeof value === 'string') {
    const text = String(value).trim()
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text
    const parsed = new Date(text)
    if (!Number.isNaN(parsed.getTime())) {
      return `${parsed.getFullYear()}-${padDatePart(parsed.getMonth() + 1)}-${padDatePart(parsed.getDate())}`
    }
    return text.slice(0, 10)
  }
  if (value instanceof Date) {
    return `${value.getFullYear()}-${padDatePart(value.getMonth() + 1)}-${padDatePart(value.getDate())}`
  }
  return String(value).slice(0, 10)
}

function pluralize(count, singular, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`
}

function describeSkippedEmployees(entries = [], limit = 3) {
  return entries
    .slice(0, limit)
    .map((entry) => `${entry.employee_name || entry.name || `Employee #${entry.employee_id || entry.user_id || 'unknown'}`}: ${entry.reason}`)
    .join('; ')
}

function buildSyncMessage({
  synced,
  attendanceRecordsFound,
  skipped = [],
  periodFrom,
  periodTo,
  bootstrapSummary = {}
}) {
  const parts = []
  const autoCreatedCount = Number(bootstrapSummary.auto_created_count || 0)
  const profileSkippedCount = Number(bootstrapSummary.skipped_count || 0)
  const syncSkippedCount = skipped.length

  if (attendanceRecordsFound === 0) {
    parts.push(`No attendance records found from ${periodFrom} to ${periodTo}. Sync only copies existing attendance records into payroll inputs.`)
  } else if (synced > 0) {
    parts.push(`Synced attendance for ${pluralize(synced, 'employee')} from ${periodFrom} to ${periodTo}.`)
  } else {
    parts.push(`Attendance records were found from ${periodFrom} to ${periodTo}, but none could be synced into payroll inputs.`)
  }

  if (autoCreatedCount > 0) {
    parts.push(`Created ${pluralize(autoCreatedCount, 'payroll profile')} from employee records.`)
  }

  if (profileSkippedCount > 0) {
    const sample = describeSkippedEmployees(bootstrapSummary.skipped_employees || [])
    parts.push(`Could not prepare ${pluralize(profileSkippedCount, 'employee')} for payroll profile creation.${sample ? ` ${sample}` : ''}`)
  }

  if (syncSkippedCount > 0) {
    const sample = describeSkippedEmployees(skipped)
    parts.push(`Skipped ${pluralize(syncSkippedCount, 'employee')} during attendance sync.${sample ? ` ${sample}` : ''}`)
  }

  return parts.join(' ')
}

async function syncAttendanceToInputs(periodId, userId, options = {}) {
  const executor = options.conn || db.pool

  const [[period]] = await executor.query(
    'SELECT * FROM payroll_periods WHERE id = ?',
    [periodId]
  )
  if (!period) throw Object.assign(new Error('Payroll period not found'), { statusCode: 404 })
  if (['finalized', 'released', 'void'].includes(period.status)) {
    throw Object.assign(new Error('Cannot sync attendance into a finalized/released/void period'), { statusCode: 400 })
  }

  // Keep sync aligned with the admin workflow: employees with usable employee records
  // should not be skipped just because a payroll profile has not been manually created yet.
  const bootstrapSummary = await ensureProfilesForPeriod(executor, period)

  const periodFrom = asDateOnly(period.start_date)
  const periodTo = asDateOnly(period.end_date)

  const hasNightDifferentialColumn = await columnExists('attendance', 'night_differential_minutes', executor)
  const nightDifferentialSelect = hasNightDifferentialColumn
    ? 'SUM(COALESCE(a.night_differential_minutes, 0))                             AS night_differential_minutes,'
    : '0                                                                           AS night_differential_minutes,'

  const statusKey = 'UPPER(TRIM(a.status))'

  // pull attendance summary for all employees in this date range
  const [summaries] = await executor.query(
    `SELECT
       a.employee_id,
       e.name AS employee_name,
       COUNT(CASE WHEN ${statusKey} IN ('PRESENT','LATE','HALF_DAY') THEN 1 END)    AS days_worked,
       SUM(CASE WHEN ${statusKey} = 'ABSENT' THEN 1 ELSE 0 END)                     AS absent_days,
       ROUND(SUM(COALESCE(a.hours_worked, 0)), 2)                                AS hours_worked,
       ROUND(SUM(CASE WHEN a.overtime_minutes > 0 THEN a.overtime_minutes/60.0 ELSE 0 END), 2) AS overtime_hours,
       ${nightDifferentialSelect}
       SUM(COALESCE(a.late_minutes, 0))                                          AS late_minutes,
       SUM(COALESCE(a.undertime_minutes, 0))                                     AS undertime_minutes,
       COUNT(CASE WHEN ${statusKey} = 'HOLIDAY' THEN 1 END)                          AS regular_holiday_days,
       COUNT(CASE WHEN ${statusKey} = 'REST_DAY' THEN 1 END)                         AS rest_day_days,
       COUNT(CASE WHEN ${statusKey} = 'ON_LEAVE' THEN 1 END)                         AS paid_leave_days
     FROM attendance a
     LEFT JOIN employees e ON e.id = a.employee_id
     WHERE a.date BETWEEN ? AND ?
     GROUP BY a.employee_id, e.name`,
    [periodFrom, periodTo]
  )

  await executor.query(
    `UPDATE payroll_inputs
     SET days_worked = 0,
         hours_worked = 0,
         overtime_hours = 0,
         night_differential_minutes = 0,
         late_minutes = 0,
         undertime_minutes = 0,
         absent_days = 0,
         regular_holiday_days = 0,
         special_holiday_days = 0,
         rest_day_days = 0,
         paid_leave_days = 0,
         unpaid_leave_days = 0,
         updated_by = ?
     WHERE payroll_period_id = ?`,
    [userId || null, periodId]
  )

  if (summaries.length === 0) {
    return {
      synced: 0,
      attendance_records_found: 0,
      skipped_count: 0,
      auto_created_count: Number(bootstrapSummary.auto_created_count || 0),
      profile_skipped_count: Number(bootstrapSummary.skipped_count || 0),
      profile_skipped: bootstrapSummary.skipped_employees || [],
      range: { from: periodFrom, to: periodTo },
      message: buildSyncMessage({
        synced: 0,
        attendanceRecordsFound: 0,
        skipped: [],
        periodFrom,
        periodTo,
        bootstrapSummary
      }),
      employees: [],
      skipped: []
    }
  }

  // map employee_id → user_id (employees table has id, users have id; payroll uses users.id)
  // Support older and newer schemas: either side may carry the employee/user link.
  const empIds = summaries.map((s) => s.employee_id)
  const hasUsersEmployeeIdColumn = await columnExists('users', 'employee_id', executor)
  const hasEmployeesUserIdColumn = await columnExists('employees', 'user_id', executor)
  const joinConditions = []

  if (hasUsersEmployeeIdColumn) joinConditions.push('u.employee_id = e.id')
  if (hasEmployeesUserIdColumn) joinConditions.push('e.user_id = u.id')
  joinConditions.push('u.id = e.id')

  const [userMappings] = await executor.query(
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
  const skipped = []

  for (const s of summaries) {
    const user_id = empToUser[s.employee_id]
    if (!user_id) {
      skipped.push({
        employee_id: s.employee_id,
        employee_name: s.employee_name,
        reason: 'employee is not linked to a user account'
      })
      continue
    }

    // check if payroll profile exists for this user
    const [[profile]] = await executor.query(
      'SELECT id FROM payroll_profiles WHERE user_id = ? AND status = ?',
      [user_id, 'active']
    )
    if (!profile) {
      skipped.push({
        employee_id: s.employee_id,
        user_id,
        employee_name: s.employee_name,
        reason: 'no active payroll profile for linked user'
      })
      continue
    }

    const [[existing]] = await executor.query(
      'SELECT id FROM payroll_inputs WHERE payroll_period_id = ? AND user_id = ?',
      [periodId, user_id]
    )

    const payload = [
      Number(s.days_worked)         || 0,
      Number(s.hours_worked)        || 0,
      Number(s.overtime_hours)      || 0,
      Number(s.night_differential_minutes) || 0,
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
      await executor.query(
        `UPDATE payroll_inputs SET
           days_worked=?, hours_worked=?, overtime_hours=?, night_differential_minutes=?,
           late_minutes=?, undertime_minutes=?, absent_days=?,
           regular_holiday_days=?, special_holiday_days=?, rest_day_days=?,
           paid_leave_days=?, unpaid_leave_days=?,
           updated_by=?
         WHERE payroll_period_id=? AND user_id=?`,
        [...payload, periodId, user_id]
      )
    } else {
      await executor.query(
        `INSERT INTO payroll_inputs
           (payroll_period_id, user_id,
            days_worked, hours_worked, overtime_hours, night_differential_minutes,
            late_minutes, undertime_minutes, absent_days,
            regular_holiday_days, special_holiday_days, rest_day_days,
            paid_leave_days, unpaid_leave_days, created_by)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [periodId, user_id, ...payload]
      )
    }

    synced++
    results.push({ employee_id: s.employee_id, user_id, employee_name: s.employee_name, days_worked: s.days_worked })
  }

  const attendanceRecordsFound = summaries.length
  const skippedCount = skipped.length
  const message = buildSyncMessage({
    synced,
    attendanceRecordsFound,
    skipped,
    periodFrom,
    periodTo,
    bootstrapSummary
  })

  return {
    synced,
    attendance_records_found: attendanceRecordsFound,
    skipped_count: skippedCount,
    auto_created_count: Number(bootstrapSummary.auto_created_count || 0),
    profile_skipped_count: Number(bootstrapSummary.skipped_count || 0),
    profile_skipped: bootstrapSummary.skipped_employees || [],
    range: { from: periodFrom, to: periodTo },
    message,
    employees: results,
    skipped
  }
}

module.exports = { syncAttendanceToInputs }
