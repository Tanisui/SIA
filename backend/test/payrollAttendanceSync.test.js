const test = require('node:test')
const assert = require('node:assert/strict')

function mockModule(modulePath, exportsValue) {
  const resolved = require.resolve(modulePath)
  const original = require.cache[resolved]

  require.cache[resolved] = {
    id: resolved,
    filename: resolved,
    loaded: true,
    exports: exportsValue
  }

  return () => {
    if (original) require.cache[resolved] = original
    else delete require.cache[resolved]
  }
}

test('syncAttendanceToInputs writes attendance summaries into payroll inputs', async (t) => {
  const restorers = []
  let insertParams = null

  restorers.push(mockModule('../src/database', {
    pool: {
      async query(sql, params = []) {
        const normalizedSql = String(sql).replace(/\s+/g, ' ').trim()

        if (normalizedSql === 'SELECT * FROM payroll_periods WHERE id = ?') {
          return [[{
            id: 7,
            start_date: '2026-04-01',
            end_date: '2026-04-15',
            status: 'draft'
          }]]
        }

        if (normalizedSql.includes('FROM information_schema.COLUMNS')) {
          const [tableName, columnName] = params
          if (tableName === 'users' && columnName === 'employee_id') return [[{ found: 1 }]]
          if (tableName === 'employees' && columnName === 'user_id') return [[]]
        }

        if (normalizedSql.includes('FROM attendance a') && normalizedSql.includes('GROUP BY a.employee_id, e.name')) {
          return [[{
            employee_id: 12,
            employee_name: 'Ana Reyes',
            days_worked: 10,
            absent_days: 1,
            hours_worked: 80,
            overtime_hours: 2.5,
            late_minutes: 15,
            undertime_minutes: 5,
            regular_holiday_days: 1,
            rest_day_days: 0,
            paid_leave_days: 0
          }]]
        }

        if (normalizedSql.startsWith('SELECT e.id AS employee_id, u.id AS user_id')) {
          return [[{ employee_id: 12, user_id: 34 }]]
        }

        if (normalizedSql === 'SELECT id FROM payroll_profiles WHERE user_id = ? AND status = ?') {
          return [[{ id: 99 }]]
        }

        if (normalizedSql === 'SELECT id FROM payroll_inputs WHERE payroll_period_id = ? AND user_id = ?') {
          return [[]]
        }

        if (normalizedSql.startsWith('INSERT INTO payroll_inputs')) {
          insertParams = params
          return [{ insertId: 501 }]
        }

        throw new Error(`Unexpected query: ${normalizedSql}`)
      }
    }
  }))

  const servicePath = require.resolve('../src/services/payroll/syncAttendanceToInputs')
  delete require.cache[servicePath]
  const { syncAttendanceToInputs } = require('../src/services/payroll/syncAttendanceToInputs')

  t.after(() => {
    delete require.cache[servicePath]
    restorers.reverse().forEach((restore) => restore())
  })

  const result = await syncAttendanceToInputs(7, 88)

  assert.equal(result.synced, 1)
  assert.equal(result.employees.length, 1)
  assert.deepEqual(result.employees[0], {
    employee_id: 12,
    user_id: 34,
    employee_name: 'Ana Reyes',
    days_worked: 10
  })
  assert.deepEqual(insertParams, [
    7,
    34,
    10,
    80,
    2.5,
    15,
    5,
    1,
    1,
    0,
    0,
    0,
    0,
    88
  ])
})
