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

test('loadInputsForPeriod bootstraps payroll profiles from active employee records', async (t) => {
  const restorers = []
  let insertedProfile = null
  const insertedInputs = []

  const conn = {
    async beginTransaction() {},
    async commit() {},
    async rollback() {},
    release() {},
    async query(sql, params = []) {
      const normalizedSql = String(sql).replace(/\s+/g, ' ').trim()

      if (normalizedSql === 'SELECT * FROM payroll_periods WHERE id = ? LIMIT 1 FOR UPDATE') {
        return [[{
          id: 7,
          code: 'PAY-2026-04-15-2026-04-29',
          frequency: 'weekly',
          status: 'draft',
          branch_id: null
        }]]
      }

      if (normalizedSql.includes('FROM information_schema.TABLES')) {
        const [tableName] = params
        if (tableName === 'employees') return [[{ found: 1 }]]
      }

      if (normalizedSql.includes('FROM information_schema.COLUMNS')) {
        const [tableName, columnName] = params
        if (tableName === 'employees' && columnName === 'user_id') return [[{ found: 1 }]]
        if (tableName === 'users' && columnName === 'employee_id') return [[]]
      }

      if (normalizedSql.startsWith('SELECT DISTINCT u.id AS user_id,')) {
        return [[{
          user_id: 11,
          username: 'salesclerk@example.com',
          full_name: 'Sales Clerk',
          email: 'salesclerk@example.com',
          employee_id: 13,
          employee_name: 'Sales Clerk',
          employment_type: 'REGULAR',
          pay_basis: null,
          pay_rate: 400,
          payroll_method: null,
          bank_details: null
        }]]
      }

      if (normalizedSql.startsWith('INSERT INTO payroll_profiles')) {
        const [
          user_id,
          employment_type,
          pay_basis,
          pay_rate,
          payroll_frequency,
          standard_work_days_per_month,
          standard_hours_per_day,
          overtime_eligible,
          late_deduction_enabled,
          undertime_deduction_enabled,
          tax_enabled,
          sss_enabled,
          philhealth_enabled,
          pagibig_enabled,
          payroll_method,
          bank_name,
          bank_account_name,
          bank_account_number,
          status
        ] = params

        insertedProfile = {
          id: 91,
          user_id,
          employment_type,
          pay_basis,
          pay_rate,
          payroll_frequency,
          standard_work_days_per_month,
          standard_hours_per_day,
          overtime_eligible,
          late_deduction_enabled,
          undertime_deduction_enabled,
          tax_enabled,
          sss_enabled,
          philhealth_enabled,
          pagibig_enabled,
          payroll_method,
          bank_name,
          bank_account_name,
          bank_account_number,
          status,
          username: 'salesclerk@example.com',
          full_name: 'Sales Clerk',
          email: 'salesclerk@example.com'
        }
        return [{ insertId: 91 }]
      }

      if (normalizedSql.startsWith('SELECT pp.*, u.username, u.full_name, u.email FROM payroll_profiles pp')) {
        return [insertedProfile ? [insertedProfile] : []]
      }

      if (normalizedSql.startsWith('INSERT IGNORE INTO payroll_inputs')) {
        insertedInputs.push(params)
        return [{ insertId: 701 }]
      }

      throw new Error(`Unexpected query: ${normalizedSql}`)
    }
  }

  restorers.push(mockModule('../src/database', {
    pool: {
      async getConnection() {
        return conn
      }
    }
  }))

  const servicePath = require.resolve('../src/services/payroll/computePayrollRun')
  delete require.cache[servicePath]
  const { loadInputsForPeriod } = require('../src/services/payroll/computePayrollRun')

  t.after(() => {
    delete require.cache[servicePath]
    restorers.reverse().forEach((restore) => restore())
  })

  const result = await loadInputsForPeriod(7, 99)

  assert.equal(result.loaded_count, 1)
  assert.equal(result.auto_created_count, 1)
  assert.equal(result.skipped_count, 0)
  assert.equal(insertedProfile.pay_basis, 'daily')
  assert.equal(insertedProfile.payroll_frequency, 'weekly')
  assert.equal(insertedProfile.payroll_method, 'cash')
  assert.equal(insertedProfile.status, 'active')
  assert.deepEqual(insertedInputs, [[7, 11, 99, 99]])
})
