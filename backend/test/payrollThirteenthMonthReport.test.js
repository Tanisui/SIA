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

test('getThirteenthMonthReport reduces monthly basic salary by unpaid time', async (t) => {
  const rows = [
    {
      user_id: 1,
      full_name: 'Monthly Employee',
      username: 'monthly.employee',
      employee_number: 'EMP-0001',
      gross_basic_pay: 15000,
      payroll_profile_snapshot_json: JSON.stringify({
        pay_basis: 'monthly',
        pay_rate: 30000,
        standard_work_days_per_month: 22,
        standard_hours_per_day: 8
      }),
      input_snapshot_json: JSON.stringify({
        absent_days: 1,
        unpaid_leave_days: 0,
        late_minutes: 60,
        undertime_minutes: 0
      }),
      payroll_period_id: 101
    },
    {
      user_id: 2,
      full_name: 'Daily Employee',
      username: 'daily.employee',
      employee_number: 'EMP-0002',
      gross_basic_pay: 5000,
      payroll_profile_snapshot_json: JSON.stringify({
        pay_basis: 'daily',
        pay_rate: 500,
        standard_work_days_per_month: 22,
        standard_hours_per_day: 8
      }),
      input_snapshot_json: JSON.stringify({ days_worked: 10 }),
      payroll_period_id: 101
    }
  ]

  const restorers = [
    mockModule('../src/database', {
      pool: {
        async query() {
          return [rows]
        }
      }
    })
  ]

  const controllerPath = require.resolve('../src/controllers/payroll.controller')
  delete require.cache[controllerPath]
  const { getThirteenthMonthReport } = require('../src/controllers/payroll.controller')

  t.after(() => {
    delete require.cache[controllerPath]
    restorers.reverse().forEach((restore) => restore())
  })

  const res = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code
      return this
    },
    json(payload) {
      this.body = payload
      return payload
    }
  }

  await getThirteenthMonthReport({ query: { year: '2026' } }, res)

  assert.equal(res.statusCode, 200)
  assert.equal(res.body.rows.length, 2)

  const monthly = res.body.rows.find((row) => row.user_id === 1)
  const daily = res.body.rows.find((row) => row.user_id === 2)

  assert.equal(monthly.total_basic_pay, 13465.9)
  assert.equal(monthly.thirteenth_month_pay, 1122.16)
  assert.equal(daily.total_basic_pay, 5000)
  assert.equal(daily.thirteenth_month_pay, 416.67)
})
