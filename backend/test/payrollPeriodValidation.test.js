const test = require('node:test')
const assert = require('node:assert/strict')

const { validatePeriodPayload } = require('../src/validators/payroll.validators')

function payload(overrides = {}) {
  return {
    start_date: '2026-05-01',
    end_date: '2026-05-15',
    payout_date: '2026-05-15',
    frequency: 'semi_monthly',
    ...overrides
  }
}

test('validatePeriodPayload accepts a one-day daily payroll period', () => {
  const period = validatePeriodPayload(payload({
    start_date: '2026-05-09',
    end_date: '2026-05-09',
    payout_date: '2026-05-09',
    frequency: 'daily'
  }))

  assert.equal(period.frequency, 'daily')
  assert.equal(period.start_date, '2026-05-09')
  assert.equal(period.end_date, '2026-05-09')
})

test('validatePeriodPayload rejects invalid frequency cutoff lengths', () => {
  assert.throws(
    () => validatePeriodPayload(payload({
      start_date: '2026-05-09',
      end_date: '2026-05-10',
      payout_date: '2026-05-10',
      frequency: 'daily'
    })),
    /daily payroll periods must start and end on the same date/
  )

  assert.throws(
    () => validatePeriodPayload(payload({
      start_date: '2026-05-04',
      end_date: '2026-05-15',
      payout_date: '2026-05-15',
      frequency: 'weekly'
    })),
    /weekly payroll periods must cover exactly 7 calendar days/
  )
})

test('validatePeriodPayload enforces semi-monthly and monthly Philippine cutoffs', () => {
  assert.equal(validatePeriodPayload(payload()).frequency, 'semi_monthly')
  assert.equal(validatePeriodPayload(payload({
    start_date: '2026-02-16',
    end_date: '2026-02-28',
    payout_date: '2026-02-28',
    frequency: 'semi_monthly'
  })).end_date, '2026-02-28')

  assert.throws(
    () => validatePeriodPayload(payload({
      start_date: '2026-05-05',
      end_date: '2026-05-20',
      payout_date: '2026-05-20',
      frequency: 'semi_monthly'
    })),
    /semi-monthly payroll periods must be either day 1-15 or day 16/
  )

  assert.equal(validatePeriodPayload(payload({
    start_date: '2026-05-01',
    end_date: '2026-05-31',
    payout_date: '2026-05-31',
    frequency: 'monthly'
  })).frequency, 'monthly')
})
