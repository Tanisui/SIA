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

function createHarness({ inputRows = [], syncSummary, profileOverrides = {}, periodOverrides = {} }) {
  const period = {
    id: 7,
    code: 'PAY-2026-04-15-2026-04-29',
    frequency: 'weekly',
    start_date: '2026-04-15',
    end_date: '2026-04-29',
    payout_date: '2026-04-29',
    status: 'draft',
    branch_id: null,
    ...periodOverrides
  }

  const profile = {
    id: 91,
    user_id: 11,
    username: 'anon',
    full_name: 'Anon Clerk',
    email: 'anon@example.com',
    status: 'active',
    pay_basis: 'daily',
    pay_rate: 300,
    payroll_frequency: period.frequency,
    payroll_method: 'cash',
    standard_hours_per_day: 8,
    standard_work_days_per_month: 22,
    overtime_eligible: 1,
    late_deduction_enabled: 1,
    undertime_deduction_enabled: 1,
    tax_enabled: 0,
    sss_enabled: 0,
    philhealth_enabled: 0,
    pagibig_enabled: 0,
    ...profileOverrides
  }

  const settingsVersion = {
    id: 301,
    version_name: 'Default',
    effective_from: '2026-01-01',
    effective_to: null,
    settings_json: {
      overtime_multiplier: 1.25,
      night_differential_multiplier: 0.1,
      regular_holiday_multiplier: 2,
      special_holiday_multiplier: 1.3,
      rest_day_multiplier: 1.3
    }
  }

  const state = {
    run: null,
    item: null,
    lines: [],
    syncCalls: []
  }

  const conn = {
    async beginTransaction() {},
    async commit() {},
    async rollback() {},
    release() {},
    async query(sql, params = []) {
      const normalizedSql = String(sql).replace(/\s+/g, ' ').trim()

      if (normalizedSql === 'SELECT * FROM payroll_periods WHERE id = ? LIMIT 1 FOR UPDATE') {
        return [[period]]
      }

      if (normalizedSql === 'SELECT * FROM payroll_runs WHERE payroll_period_id = ? FOR UPDATE') {
        return [[]]
      }

      if (normalizedSql.startsWith('SELECT * FROM payroll_settings_versions WHERE is_active = 1')) {
        return [[settingsVersion]]
      }

      if (normalizedSql.startsWith("SELECT pp.*, u.username, u.full_name, u.email FROM payroll_profiles pp")) {
        return [[profile]]
      }

      if (normalizedSql === 'SELECT COUNT(*) AS count FROM payroll_runs WHERE payroll_period_id = ?') {
        return [[{ count: 0 }]]
      }

      if (normalizedSql.startsWith("INSERT INTO payroll_runs (payroll_period_id, run_number, status, created_by) VALUES (?, ?, 'draft', ?)")) {
        state.run = {
          id: 100,
          payroll_period_id: params[0],
          run_number: params[1],
          status: 'draft',
          created_by: params[2],
          total_gross_pay: 0,
          total_employee_deductions: 0,
          total_employer_contributions: 0,
          total_net_pay: 0,
          employee_count: 0
        }
        return [{ insertId: 100 }]
      }

      if (normalizedSql === 'SELECT * FROM payroll_runs WHERE id = ? LIMIT 1 FOR UPDATE') {
        return [[state.run]]
      }

      if (normalizedSql === 'SELECT * FROM payroll_inputs WHERE payroll_period_id = ?') {
        return [inputRows]
      }

      if (normalizedSql.startsWith('INSERT INTO payroll_run_items (')) {
        state.item = {
          id: 200,
          payroll_run_id: params[0],
          user_id: params[1],
          payroll_profile_snapshot_json: params[2],
          input_snapshot_json: params[3],
          settings_snapshot_json: params[4],
          gross_basic_pay: params[5],
          gross_overtime_pay: params[6],
          gross_holiday_pay: params[7],
          gross_rest_day_pay: params[8],
          gross_bonus: params[9],
          gross_commission: params[10],
          gross_allowances: params[11],
          gross_pay: params[12],
          taxable_income: params[13],
          withholding_tax: params[14],
          employee_sss: params[15],
          employer_sss: params[16],
          ec_contribution: params[17],
          employee_philhealth: params[18],
          employer_philhealth: params[19],
          employee_pagibig: params[20],
          employer_pagibig: params[21],
          other_deductions: params[22],
          total_deductions: params[23],
          net_pay: params[24],
          status: 'draft',
          username: profile.username,
          full_name: profile.full_name,
          email: profile.email
        }
        return [{ insertId: 200 }]
      }

      if (normalizedSql.startsWith('INSERT INTO payroll_item_lines (')) {
        state.lines.push({
          id: state.lines.length + 1,
          payroll_run_item_id: params[0],
          line_type: params[1],
          code: params[2],
          label: params[3],
          amount: params[4],
          sort_order: params[5],
          metadata_json: params[6]
        })
        return [{ insertId: state.lines.length }]
      }

      if (normalizedSql.startsWith('UPDATE payroll_runs SET total_gross_pay = ?, total_employee_deductions = ?, total_employer_contributions = ?, total_net_pay = ?, employee_count = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')) {
        state.run = {
          ...state.run,
          total_gross_pay: params[0],
          total_employee_deductions: params[1],
          total_employer_contributions: params[2],
          total_net_pay: params[3],
          employee_count: params[4]
        }
        return [{ affectedRows: 1 }]
      }

      if (normalizedSql === "UPDATE payroll_periods SET status = 'computed' WHERE id = ?") {
        period.status = 'computed'
        return [{ affectedRows: 1 }]
      }

      throw new Error(`Unexpected connection query: ${normalizedSql}`)
    }
  }

  const pool = {
    async getConnection() {
      return conn
    },
    async query(sql, params = []) {
      const normalizedSql = String(sql).replace(/\s+/g, ' ').trim()

      if (normalizedSql === 'SELECT * FROM payroll_runs WHERE id = ? LIMIT 1') {
        return [[state.run]]
      }

      if (normalizedSql.startsWith('SELECT pri.*, u.username, u.full_name, u.email FROM payroll_run_items pri')) {
        return [[state.item]]
      }

      if (normalizedSql === 'SELECT * FROM payroll_item_lines WHERE payroll_run_item_id = ? ORDER BY sort_order, id') {
        return [state.lines.filter((line) => line.payroll_run_item_id === params[0])]
      }

      throw new Error(`Unexpected pool query: ${normalizedSql}`)
    }
  }

  return {
    conn,
    state,
    databaseMock: { pool },
    syncModuleMock: {
      async syncAttendanceToInputs(periodId, actorId, options = {}) {
        state.syncCalls.push({ periodId, actorId, options })
        return syncSummary
      }
    }
  }
}

test('computePayrollRun auto-syncs attendance before calculating daily payroll', async (t) => {
  const syncSummary = {
    synced: 1,
    attendance_records_found: 1,
    skipped_count: 0,
    range: { from: '2026-04-15', to: '2026-04-29' },
    message: 'Synced attendance for 1 employee(s) from 2026-04-15 to 2026-04-29.',
    employees: [{ employee_id: 11, user_id: 11, employee_name: 'Anon Clerk', days_worked: 4 }],
    skipped: []
  }

  const harness = createHarness({
    syncSummary,
    inputRows: [{
      payroll_period_id: 7,
      user_id: 11,
      days_worked: 4,
      manual_bonus: 50,
      loan_deduction: 25,
      manual_deduction: 10,
      remarks: 'carry'
    }]
  })

  const restorers = [
    mockModule('../src/database', harness.databaseMock),
    mockModule('../src/services/payroll/syncAttendanceToInputs', harness.syncModuleMock)
  ]

  const servicePath = require.resolve('../src/services/payroll/computePayrollRun')
  delete require.cache[servicePath]
  const { computePayrollRun } = require('../src/services/payroll/computePayrollRun')

  t.after(() => {
    delete require.cache[servicePath]
    restorers.reverse().forEach((restore) => restore())
  })

  const result = await computePayrollRun(7, 88)

  assert.equal(harness.state.syncCalls.length, 1)
  assert.equal(harness.state.syncCalls[0].periodId, 7)
  assert.equal(harness.state.syncCalls[0].actorId, 88)
  assert.equal(harness.state.syncCalls[0].options.conn, harness.conn)

  assert.deepEqual(result.sync_summary, syncSummary)
  assert.equal(result.items.length, 1)
  assert.equal(result.items[0].gross_basic_pay, 1200)
  assert.equal(result.items[0].gross_pay, 1250)
  assert.equal(result.items[0].total_deductions, 35)
  assert.equal(result.items[0].net_pay, 1215)
  assert.equal(result.items[0].input_snapshot_json.days_worked, 4)
  assert.equal(result.items[0].input_snapshot_json.manual_bonus, 50)
  assert.equal(result.items[0].input_snapshot_json.loan_deduction, 25)
  assert.equal(result.items[0].input_snapshot_json.manual_deduction, 10)
})

test('computePayrollRun keeps zero-attendance runs computable and returns the sync warning', async (t) => {
  const syncSummary = {
    synced: 0,
    attendance_records_found: 0,
    skipped_count: 0,
    range: { from: '2026-04-15', to: '2026-04-29' },
    message: 'No attendance records found from 2026-04-15 to 2026-04-29. Sync only copies existing attendance records into payroll inputs.',
    employees: [],
    skipped: []
  }

  const harness = createHarness({
    syncSummary,
    inputRows: []
  })

  const restorers = [
    mockModule('../src/database', harness.databaseMock),
    mockModule('../src/services/payroll/syncAttendanceToInputs', harness.syncModuleMock)
  ]

  const servicePath = require.resolve('../src/services/payroll/computePayrollRun')
  delete require.cache[servicePath]
  const { computePayrollRun } = require('../src/services/payroll/computePayrollRun')

  t.after(() => {
    delete require.cache[servicePath]
    restorers.reverse().forEach((restore) => restore())
  })

  const result = await computePayrollRun(7, 88)

  assert.equal(result.items.length, 1)
  assert.equal(result.items[0].gross_basic_pay, 0)
  assert.equal(result.items[0].gross_pay, 0)
  assert.equal(result.items[0].net_pay, 0)
  assert.deepEqual(result.sync_summary, syncSummary)
})

test('computePayrollRun normalizes legacy payroll profile fields before validation', async (t) => {
  const syncSummary = {
    synced: 1,
    attendance_records_found: 1,
    skipped_count: 0,
    range: { from: '2026-04-15', to: '2026-04-29' },
    message: 'Synced attendance for 1 employee(s) from 2026-04-15 to 2026-04-29.',
    employees: [{ employee_id: 11, user_id: 11, employee_name: 'Anon Clerk', days_worked: 2 }],
    skipped: []
  }

  const harness = createHarness({
    syncSummary,
    profileOverrides: {
      payroll_frequency: null,
      payroll_method: '',
      tax_enabled: null,
      sss_enabled: null,
      philhealth_enabled: null,
      pagibig_enabled: null
    },
    inputRows: [{
      payroll_period_id: 7,
      user_id: 11,
      days_worked: 2
    }]
  })

  const restorers = [
    mockModule('../src/database', harness.databaseMock),
    mockModule('../src/services/payroll/syncAttendanceToInputs', harness.syncModuleMock)
  ]

  const servicePath = require.resolve('../src/services/payroll/computePayrollRun')
  delete require.cache[servicePath]
  const { computePayrollRun } = require('../src/services/payroll/computePayrollRun')

  t.after(() => {
    delete require.cache[servicePath]
    restorers.reverse().forEach((restore) => restore())
  })

  const result = await computePayrollRun(7, 88)

  assert.equal(result.items.length, 1)
  assert.equal(result.items[0].gross_basic_pay, 600)
  assert.equal(result.items[0].payroll_profile_snapshot_json.payroll_frequency, 'weekly')
  assert.equal(result.items[0].payroll_profile_snapshot_json.payroll_method, 'cash')
  assert.equal(result.items[0].payroll_profile_snapshot_json.tax_enabled, true)
  assert.equal(result.items[0].payroll_profile_snapshot_json.sss_enabled, true)
  assert.equal(result.items[0].payroll_profile_snapshot_json.philhealth_enabled, true)
  assert.equal(result.items[0].payroll_profile_snapshot_json.pagibig_enabled, true)
})
