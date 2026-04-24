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

function buildWithholdingTaxSettings() {
  return {
    withholding_tax: {
      enabled: 1,
      brackets: {
        weekly: [
          { from: 0, to: 4808, base_tax: 0, excess_over: 0, rate: 0 },
          { from: 4808, to: 7691, base_tax: 0, excess_over: 4808, rate: 0.15 },
          { from: 7691, to: 15384, base_tax: 432.45, excess_over: 7691, rate: 0.2 }
        ],
        semi_monthly: [
          { from: 0, to: 10417, base_tax: 0, excess_over: 0, rate: 0 }
        ],
        monthly: [
          { from: 0, to: 20833, base_tax: 0, excess_over: 0, rate: 0 }
        ]
      }
    },
    overtime_multiplier: 1.25,
    night_differential_multiplier: 0.1,
    regular_holiday_multiplier: 2,
    special_holiday_multiplier: 1.3,
    rest_day_multiplier: 1.3
  }
}

function buildRegisterRow(overrides = {}) {
  const profileSnapshot = {
    user_id: 9,
    pay_basis: 'daily',
    pay_rate: 600,
    payroll_frequency: 'weekly',
    payroll_method: 'cash',
    standard_work_days_per_month: 22,
    standard_hours_per_day: 8,
    late_deduction_enabled: 1,
    undertime_deduction_enabled: 1,
    tax_enabled: 1,
    sss_enabled: 1,
    philhealth_enabled: 1,
    pagibig_enabled: 1,
    status: 'active',
    ...(overrides.profileSnapshot || {})
  }

  const inputSnapshot = {
    days_worked: 0,
    hours_worked: 0,
    overtime_hours: 0,
    late_minutes: 0,
    undertime_minutes: 0,
    night_differential_minutes: 0,
    regular_holiday_days: 0,
    special_holiday_days: 0,
    rest_day_days: 0,
    absent_days: 0,
    unpaid_leave_days: 0,
    loan_deduction: 0,
    manual_deduction: 0,
    ...(overrides.inputSnapshot || {})
  }

  const settingsSnapshot = buildWithholdingTaxSettings()
  if (overrides.settingsSnapshot) {
    Object.assign(settingsSnapshot, overrides.settingsSnapshot)
  }

  return {
    payroll_run_id: 501,
    run_number: 'PAYRUN-001',
    run_status: 'released',
    payroll_period_id: 71,
    period_code: 'PAY-2026-04-15-2026-04-29-R1',
    start_date: '2026-04-15',
    end_date: '2026-04-29',
    period_frequency: 'weekly',
    payout_date: '2026-04-30',
    user_id: 9,
    username: 'anon.clerk',
    full_name: 'Anon Clerk',
    payroll_run_item_id: 8001,
    payroll_profile_snapshot_json: JSON.stringify(profileSnapshot),
    input_snapshot_json: JSON.stringify(inputSnapshot),
    settings_snapshot_json: JSON.stringify(settingsSnapshot),
    gross_basic_pay: 0,
    gross_overtime_pay: 0,
    gross_holiday_pay: 0,
    gross_rest_day_pay: 0,
    gross_bonus: 0,
    gross_commission: 0,
    gross_allowances: 0,
    gross_pay: 0,
    taxable_income: 0,
    withholding_tax: 0,
    employee_sss: 0,
    employee_philhealth: 0,
    employee_pagibig: 0,
    other_deductions: 0,
    total_deductions: 0,
    net_pay: 0,
    ...overrides
  }
}

function buildDatabaseMock(registerRows = []) {
  return {
    pool: {
      async query(sql, params = []) {
        const normalizedSql = String(sql).replace(/\s+/g, ' ').trim()

        if (normalizedSql.includes('FROM information_schema.TABLES')) {
          return [[{ found: 1 }]]
        }

        if (normalizedSql.includes('FROM information_schema.COLUMNS')) {
          return [[{ found: 1 }]]
        }

        if (normalizedSql.includes('FROM payroll_run_items items')) {
          return [registerRows]
        }

        throw new Error(`Unexpected query: ${normalizedSql} :: ${JSON.stringify(params)}`)
      }
    }
  }
}

function loadPayrollRegisterWithRows(rows) {
  const restorers = [
    mockModule('../src/database', buildDatabaseMock(rows))
  ]
  const servicePath = require.resolve('../src/services/payroll/computePayrollRun')
  delete require.cache[servicePath]
  const { getPayrollRegister } = require('../src/services/payroll/computePayrollRun')

  return {
    getPayrollRegister,
    cleanup() {
      delete require.cache[servicePath]
      restorers.reverse().forEach((restore) => restore())
    }
  }
}

test('getPayrollRegister returns an empty report with a setup notice when payroll report tables are missing', async (t) => {
  const restorers = []

  restorers.push(mockModule('../src/database', {
    pool: {
      async query(sql, params = []) {
        const normalizedSql = String(sql).replace(/\s+/g, ' ').trim()

        if (normalizedSql.includes('FROM information_schema.TABLES')) {
          const [tableName] = params
          if (tableName === 'payroll_run_items') return [[]]
          return [[{ found: 1 }]]
        }

        throw new Error(`Unexpected query: ${normalizedSql}`)
      }
    }
  }))

  const servicePath = require.resolve('../src/services/payroll/computePayrollRun')
  delete require.cache[servicePath]
  const { getPayrollRegister } = require('../src/services/payroll/computePayrollRun')

  t.after(() => {
    delete require.cache[servicePath]
    restorers.reverse().forEach((restore) => restore())
  })

  const result = await getPayrollRegister({ from: '2026-04-01', to: '2026-04-30' })

  assert.deepEqual(result.rows, [])
  assert.deepEqual(result.totals, {
    gross_pay: 0,
    total_deductions: 0,
    net_pay: 0,
    withholding_tax: 0,
    employee_sss: 0,
    employee_philhealth: 0,
    employee_pagibig: 0
  })
  assert.match(result.notice, /Payroll reporting tables are not fully available yet/)
})

test('getPayrollRegister explains zero gross pay for daily rows and preserves stored zero earning components', async (t) => {
  const row = buildRegisterRow({
    inputSnapshot: {
      days_worked: 0,
      regular_holiday_days: 1
    },
    gross_holiday_pay: 0
  })
  const harness = loadPayrollRegisterWithRows([row])
  t.after(harness.cleanup)

  const result = await harness.getPayrollRegister({ from: '2026-04-01', to: '2026-04-30' })
  const basis = result.rows[0].basis_details

  assert.match(basis.gross_zero_reason || '', /0 days worked/i)
  assert.equal(basis.gross_holiday_pay, 0)
  assert.equal(basis.gross_pay, 0)
  assert.equal(result.totals.gross_pay, 0)
})

test('getPayrollRegister returns withholding tax bracket and formula for taxed rows', async (t) => {
  const row = buildRegisterRow({
    inputSnapshot: {
      days_worked: 5
    },
    gross_basic_pay: 6500,
    gross_pay: 6500,
    taxable_income: 6000,
    withholding_tax: 178.8,
    total_deductions: 178.8,
    net_pay: 6321.2
  })
  const harness = loadPayrollRegisterWithRows([row])
  t.after(harness.cleanup)

  const result = await harness.getPayrollRegister({ from: '2026-04-01', to: '2026-04-30' })
  const basis = result.rows[0].basis_details

  assert.equal(basis.withholding_tax_bracket.from, 4808)
  assert.equal(basis.withholding_tax_bracket.to, 7691)
  assert.equal(basis.withholding_tax_bracket.base_tax, 0)
  assert.equal(basis.withholding_tax_bracket.excess_over, 4808)
  assert.equal(basis.withholding_tax_bracket.rate, 0.15)
  assert.equal(basis.withholding_tax_formula.computed_amount, 178.8)
  assert.match(basis.withholding_tax_formula.text, /15\.00%/)
  assert.equal(basis.withholding_tax_formula.stored_amount, 178.8)
})

test('getPayrollRegister returns zero-tax bracket context for rows below the threshold', async (t) => {
  const row = buildRegisterRow({
    inputSnapshot: {
      days_worked: 4
    },
    gross_basic_pay: 4000,
    gross_pay: 4000,
    taxable_income: 4000,
    withholding_tax: 0,
    net_pay: 4000
  })
  const harness = loadPayrollRegisterWithRows([row])
  t.after(harness.cleanup)

  const result = await harness.getPayrollRegister({ from: '2026-04-01', to: '2026-04-30' })
  const basis = result.rows[0].basis_details

  assert.deepEqual(basis.withholding_tax_bracket, {
    from: 0,
    to: 4808,
    base_tax: 0,
    excess_over: 0,
    rate: 0
  })
  assert.equal(basis.withholding_tax_formula.computed_amount, 0)
  assert.match(basis.withholding_tax_formula.text, /PHP 0\.00 \+ max\(PHP 4,000\.00 - PHP 0\.00, 0\) x 0\.00% = PHP 0\.00/)
})
