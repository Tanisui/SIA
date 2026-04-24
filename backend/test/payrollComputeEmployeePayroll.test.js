const test = require('node:test')
const assert = require('node:assert/strict')

const { computeEmployeePayroll } = require('../src/services/payroll/computeEmployeePayroll')

test('computeEmployeePayroll includes night differential and loan deduction in the payslip breakdown', () => {
  const result = computeEmployeePayroll({
    profile: {
      user_id: 12,
      pay_basis: 'daily',
      pay_rate: 500,
      payroll_frequency: 'semi_monthly',
      standard_hours_per_day: 8,
      standard_work_days_per_month: 22,
      overtime_eligible: 1,
      late_deduction_enabled: 1,
      undertime_deduction_enabled: 1,
      tax_enabled: 0,
      sss_enabled: 0,
      philhealth_enabled: 0,
      pagibig_enabled: 0
    },
    input: {
      days_worked: 1,
      overtime_hours: 1,
      night_differential_minutes: 60,
      regular_holiday_days: 0.5,
      late_minutes: 15,
      loan_deduction: 100,
      manual_deduction: 50
    },
    settings: {
      overtime_multiplier: 1.25,
      night_differential_multiplier: 0.1,
      regular_holiday_multiplier: 2,
      special_holiday_multiplier: 1.3,
      rest_day_multiplier: 1.3
    },
    period: {
      code: 'PAY-2026-04A',
      frequency: 'semi_monthly',
      start_date: '2026-04-01',
      end_date: '2026-04-15',
      payout_date: '2026-04-15'
    }
  })

  assert.equal(result.gross_basic_pay, 500)
  assert.equal(result.gross_overtime_pay, 78.13)
  assert.equal(result.gross_night_differential_pay, 6.25)
  assert.equal(result.gross_holiday_pay, 500)
  assert.equal(result.gross_pay, 1084.38)
  assert.equal(result.loan_deduction, 100)
  assert.equal(result.total_deductions, 165.63)
  assert.equal(result.net_pay, 918.75)

  const nightDiffLine = result.lines.find((entry) => entry.code === 'NIGHT_DIFFERENTIAL')
  const loanLine = result.lines.find((entry) => entry.code === 'LOAN')
  assert.equal(nightDiffLine.amount, 6.25)
  assert.equal(loanLine.amount, 100)

  assert.equal(result.payslip_view.attendance.night_differential_minutes, 60)
  assert.equal(result.payslip_view.totals.net_pay, 918.75)
})

test('computeEmployeePayroll allows negative net pay when deductions exceed gross earnings', () => {
  const result = computeEmployeePayroll({
    profile: {
      user_id: 44,
      pay_basis: 'daily',
      pay_rate: 500,
      payroll_frequency: 'semi_monthly',
      standard_hours_per_day: 8,
      standard_work_days_per_month: 22,
      overtime_eligible: 1,
      late_deduction_enabled: 1,
      undertime_deduction_enabled: 1,
      tax_enabled: 0,
      sss_enabled: 0,
      philhealth_enabled: 0,
      pagibig_enabled: 0
    },
    input: {
      days_worked: 1,
      loan_deduction: 1200
    },
    settings: {
      overtime_multiplier: 1.25,
      night_differential_multiplier: 0.1,
      regular_holiday_multiplier: 2,
      special_holiday_multiplier: 1.3,
      rest_day_multiplier: 1.3
    },
    period: {
      code: 'PAY-2026-04B',
      frequency: 'semi_monthly',
      start_date: '2026-04-16',
      end_date: '2026-04-30',
      payout_date: '2026-04-30'
    }
  })

  assert.equal(result.gross_pay, 500)
  assert.equal(result.total_deductions, 1200)
  assert.equal(result.net_pay, -700)
  assert.equal(result.payslip_view.calculation.net_pay, -700)
})

test('computeEmployeePayroll does not deduct statutory contributions for zero-earned daily payroll periods', () => {
  const result = computeEmployeePayroll({
    profile: {
      user_id: 55,
      pay_basis: 'daily',
      pay_rate: 2000,
      payroll_frequency: 'weekly',
      standard_hours_per_day: 8,
      standard_work_days_per_month: 22,
      overtime_eligible: 1,
      late_deduction_enabled: 1,
      undertime_deduction_enabled: 1,
      tax_enabled: 1,
      sss_enabled: 1,
      philhealth_enabled: 1,
      pagibig_enabled: 1
    },
    input: {
      days_worked: 0,
      hours_worked: 0,
      overtime_hours: 0,
      night_differential_minutes: 0,
      late_minutes: 0,
      undertime_minutes: 0,
      absent_days: 0,
      unpaid_leave_days: 0,
      loan_deduction: 0,
      manual_deduction: 0
    },
    settings: {
      overtime_multiplier: 1.25,
      night_differential_multiplier: 0.1,
      regular_holiday_multiplier: 2,
      special_holiday_multiplier: 1.3,
      rest_day_multiplier: 1.3,
      sss: {
        enabled: true,
        employee_rate: 0.05,
        employer_rate: 0.1,
        monthly_salary_credit_floor: 5000,
        monthly_salary_credit_cap: 35000,
        monthly_salary_credit_increment: 500,
        min_employee_contribution: 0,
        min_employer_contribution: 0,
        ec_threshold: 14500,
        ec_low_amount: 10,
        ec_high_amount: 30
      },
      philhealth: {
        enabled: true,
        premium_rate: 0.05,
        employee_share_rate: 0.5,
        employer_share_rate: 0.5,
        monthly_salary_floor: 10000,
        monthly_salary_cap: 100000
      },
      pagibig: {
        enabled: true,
        employee_rate: 0.02,
        employer_rate: 0.02,
        monthly_compensation_cap: 10000
      },
      withholding_tax: {
        enabled: true,
        brackets: {
          weekly: [
            { from: 0, to: 4808, base_tax: 0, excess_over: 0, rate: 0 }
          ]
        }
      }
    },
    period: {
      code: 'PAY-2026-05-01-2026-05-08',
      frequency: 'weekly',
      start_date: '2026-05-01',
      end_date: '2026-05-08',
      payout_date: '2026-05-08'
    }
  })

  assert.equal(result.gross_basic_pay, 0)
  assert.equal(result.gross_pay, 0)
  assert.equal(result.employee_sss, 0)
  assert.equal(result.employee_philhealth, 0)
  assert.equal(result.employee_pagibig, 0)
  assert.equal(result.total_deductions, 0)
  assert.equal(result.net_pay, 0)
})
