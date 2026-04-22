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
