const { computeSSS } = require('./statutory/computeSSS')
const { computePhilHealth } = require('./statutory/computePhilHealth')
const { computePagibig } = require('./statutory/computePagibig')
const { computeWithholdingTax } = require('./statutory/computeWithholdingTax')

function roundMoney(value) {
  return Math.round((Number(value) || 0) * 100) / 100
}

function num(value, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function intNum(value, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.round(parsed) : fallback
}

function boolFlag(value) {
  return value === true || Number(value) === 1
}

function line(lines, lineType, code, label, amount, sortOrder, metadata = null) {
  const normalizedAmount = roundMoney(amount)
  if (normalizedAmount === 0 && lineType !== 'info') return
  lines.push({
    line_type: lineType,
    code,
    label,
    amount: normalizedAmount,
    sort_order: sortOrder,
    metadata_json: metadata
  })
}

function getStandardHoursPerDay(profile = {}) {
  return num(profile.standard_hours_per_day, 8) || 8
}

function getDailyRate(profile) {
  const payRate = num(profile.pay_rate)
  const workDays = num(profile.standard_work_days_per_month, 22) || 22
  if (profile.pay_basis === 'monthly') return roundMoney(payRate / workDays)
  if (profile.pay_basis === 'daily') return roundMoney(payRate)
  return roundMoney(getStandardHoursPerDay(profile) * payRate)
}

function getHourlyRate(profile) {
  const hoursPerDay = getStandardHoursPerDay(profile)
  if (profile.pay_basis === 'hourly') return roundMoney(profile.pay_rate)
  return roundMoney(getDailyRate(profile) / hoursPerDay)
}

function getMonthlyBasicEquivalent(profile) {
  const payRate = num(profile.pay_rate)
  const workDays = num(profile.standard_work_days_per_month, 22) || 22
  const hoursPerDay = getStandardHoursPerDay(profile)
  if (profile.pay_basis === 'monthly') return roundMoney(payRate)
  if (profile.pay_basis === 'daily') return roundMoney(payRate * workDays)
  return roundMoney(payRate * workDays * hoursPerDay)
}

function getPayPeriodsPerMonth(frequency) {
  if (frequency === 'weekly') return 52 / 12
  if (frequency === 'monthly') return 1
  return 2
}

function getStatutoryMonthlyBases({ profile, basicPay, contributionBase, payPeriodsPerMonth, monthlyBasicEquivalent }) {
  const monthlyizedContributionBase = roundMoney(contributionBase * payPeriodsPerMonth)
  const monthlyizedBasicPay = roundMoney(basicPay * payPeriodsPerMonth)

  if (profile.pay_basis === 'monthly') {
    return {
      monthlyCompensation: Math.max(monthlyBasicEquivalent, monthlyizedContributionBase),
      monthlyBasicSalary: monthlyBasicEquivalent
    }
  }

  return {
    monthlyCompensation: monthlyizedContributionBase,
    monthlyBasicSalary: monthlyizedBasicPay
  }
}

function getBasicPay(profile, input, period) {
  const payRate = num(profile.pay_rate)
  if (profile.pay_basis === 'monthly') {
    if (period?.frequency === 'weekly') return roundMoney((payRate * 12) / 52)
    if (period?.frequency === 'monthly') return roundMoney(payRate)
    return roundMoney(payRate / 2)
  }
  if (profile.pay_basis === 'daily') return roundMoney(num(input.days_worked) * payRate)
  return roundMoney(num(input.hours_worked) * payRate)
}

function normalizeProfile(profile = {}) {
  return {
    ...profile,
    overtime_eligible: boolFlag(profile.overtime_eligible),
    late_deduction_enabled: boolFlag(profile.late_deduction_enabled),
    undertime_deduction_enabled: boolFlag(profile.undertime_deduction_enabled),
    tax_enabled: boolFlag(profile.tax_enabled),
    sss_enabled: boolFlag(profile.sss_enabled),
    philhealth_enabled: boolFlag(profile.philhealth_enabled),
    pagibig_enabled: boolFlag(profile.pagibig_enabled)
  }
}

function normalizeSettingsPayload(settings = {}) {
  if (settings && typeof settings === 'object' && settings.settings && typeof settings.settings === 'object') {
    return settings.settings
  }
  return settings || {}
}

function buildLineAmountMap(lines = []) {
  const map = new Map()
  for (const itemLine of lines) {
    map.set(itemLine.code, roundMoney(itemLine.amount))
  }
  return map
}

function getLineAmount(lineAmounts, code, fallback = 0) {
  if (!lineAmounts) return roundMoney(fallback)
  return lineAmounts.has(code) ? roundMoney(lineAmounts.get(code)) : roundMoney(fallback)
}

function getEmployeeNumber(employee = {}, item = {}) {
  const rawValue = employee.employee_id
    || employee.id
    || employee.employee_record_id
    || employee.employee_number
    || item.employee_id
    || item.user_id
  const numericValue = Number(rawValue)
  if (Number.isInteger(numericValue) && numericValue > 0) {
    return String(numericValue).padStart(4, '0')
  }
  return rawValue ? String(rawValue) : null
}

function buildFormulaParts(parts = []) {
  return parts.filter((part) => roundMoney(part.amount) !== 0)
}

function buildPayslipView({ item = {}, profile = {}, input = {}, settings = {}, lines = [], employee = {} }) {
  const effectiveSettings = normalizeSettingsPayload(settings)
  const lineAmounts = buildLineAmountMap(lines)
  const standardHoursPerDay = getStandardHoursPerDay(profile)
  const dailyRate = getDailyRate(profile)
  const hourlyRate = getHourlyRate(profile)
  const daysWorked = num(input.days_worked)
  const paidLeaveDays = num(input.paid_leave_days)
  const workedMinutes = intNum(num(input.hours_worked) * 60)
  const overtimeMinutes = intNum(num(input.overtime_hours) * 60)
  const nightDifferentialMinutes = intNum(input.night_differential_minutes)
  const holidayMinutes = intNum(
    (num(input.regular_holiday_days) + num(input.special_holiday_days) + num(input.rest_day_days)) * standardHoursPerDay * 60
  )

  const basicPay = getLineAmount(lineAmounts, 'BASIC_PAY', item.gross_basic_pay)
  const overtimePay = getLineAmount(lineAmounts, 'OVERTIME_PAY', item.gross_overtime_pay)
  const nightDifferentialPay = getLineAmount(lineAmounts, 'NIGHT_DIFFERENTIAL', item.gross_night_differential_pay)
  const holidayPay = getLineAmount(lineAmounts, 'HOLIDAY_PAY', item.gross_holiday_pay)
  const restDayPay = getLineAmount(lineAmounts, 'REST_DAY_PAY', item.gross_rest_day_pay)
  const bonus = getLineAmount(lineAmounts, 'BONUS', item.gross_bonus)
  const commission = getLineAmount(lineAmounts, 'COMMISSION', item.gross_commission)
  const allowance = getLineAmount(lineAmounts, 'ALLOWANCE', item.gross_allowances)
  const adjustments = roundMoney(bonus + commission + allowance)

  const absenceDeduction = getLineAmount(lineAmounts, 'ABSENCES')
  const lateDeduction = getLineAmount(lineAmounts, 'LATE')
  const undertimeDeduction = getLineAmount(lineAmounts, 'UNDERTIME')
  const loanDeduction = getLineAmount(lineAmounts, 'LOAN', input.loan_deduction)
  const manualDeduction = getLineAmount(lineAmounts, 'MANUAL_DEDUCTION', input.manual_deduction)
  const employeeSSS = getLineAmount(lineAmounts, 'SSS_EMPLOYEE', item.employee_sss)
  const employeePhilHealth = getLineAmount(lineAmounts, 'PHILHEALTH_EMPLOYEE', item.employee_philhealth)
  const employeePagibig = getLineAmount(lineAmounts, 'PAGIBIG_EMPLOYEE', item.employee_pagibig)
  const withholdingTax = getLineAmount(lineAmounts, 'WITHHOLDING_TAX', item.withholding_tax)

  const grossPay = roundMoney(item.gross_pay)
  const totalDeductions = roundMoney(item.total_deductions)
  const netPay = roundMoney(item.net_pay)

  const overtimeMultiplier = num(effectiveSettings.overtime_multiplier, 1.25)
  const nightDifferentialMultiplier = num(effectiveSettings.night_differential_multiplier, 0.1)
  const regularHolidayMultiplier = num(effectiveSettings.regular_holiday_multiplier, 2)
  const specialHolidayMultiplier = num(effectiveSettings.special_holiday_multiplier, 1.3)
  const restDayMultiplier = num(effectiveSettings.rest_day_multiplier, 1.3)

  const earnings = [
    { code: 'BASE_AMOUNT', label: 'Base Amount', amount: basicPay },
    { code: 'OVERTIME_PAY', label: 'Overtime Pay', amount: overtimePay },
    { code: 'NIGHT_DIFFERENTIAL', label: 'Night Differential', amount: nightDifferentialPay },
    { code: 'HOLIDAY_PAY', label: 'Holiday Pay', amount: holidayPay },
    { code: 'REST_DAY_PAY', label: 'Rest Day Pay', amount: restDayPay },
    { code: 'ADJUSTMENTS', label: 'Adjustments', amount: adjustments }
  ]

  const deductions = [
    { code: 'LOAN', label: 'Loan', amount: loanDeduction },
    { code: 'ABSENCES', label: 'Absences / Unpaid Leave', amount: absenceDeduction },
    { code: 'LATE', label: 'Late', amount: lateDeduction },
    { code: 'UNDERTIME', label: 'Undertime', amount: undertimeDeduction },
    { code: 'SSS_EMPLOYEE', label: 'SSS', amount: employeeSSS },
    { code: 'PHILHEALTH_EMPLOYEE', label: 'PHIC', amount: employeePhilHealth },
    { code: 'PAGIBIG_EMPLOYEE', label: 'PAGIBIG', amount: employeePagibig },
    { code: 'WITHHOLDING_TAX', label: 'Withholding Tax', amount: withholdingTax },
    { code: 'MANUAL_DEDUCTION', label: 'Other Deductions', amount: manualDeduction }
  ]

  return {
    employee: {
      display_name: employee.display_name
        || employee.full_name
        || employee.username
        || profile.full_name
        || profile.username
        || `User #${item.user_id || 'Unknown'}`,
      employee_number: getEmployeeNumber(employee, item),
      rate_type: String(profile.pay_basis || '').toUpperCase() || 'UNSPECIFIED',
      basic_rate: dailyRate,
      daily_rate: dailyRate,
      hourly_rate: hourlyRate,
      standard_hours_per_day: standardHoursPerDay,
      email: employee.email || item.email || profile.email || null
    },
    period: {
      code: item.period_code || null,
      start_date: item.start_date || null,
      end_date: item.end_date || null,
      payout_date: item.payout_date || null
    },
    attendance: {
      days_present: daysWorked,
      paid_leave_days: paidLeaveDays,
      worked_minutes: workedMinutes,
      late_minutes: intNum(input.late_minutes),
      undertime_minutes: intNum(input.undertime_minutes),
      overtime_minutes: overtimeMinutes,
      night_differential_minutes: nightDifferentialMinutes,
      holiday_minutes: holidayMinutes,
      basic_rate: dailyRate
    },
    earnings,
    deductions,
    totals: {
      gross_earnings: grossPay,
      total_deductions: totalDeductions,
      net_pay: netPay
    },
    calculation: {
      expression: 'gross_earnings - total_deductions',
      gross_earnings: grossPay,
      total_deductions: totalDeductions,
      net_pay: netPay
    },
    formula_notes: [
      {
        code: 'BASE_AMOUNT',
        label: 'Base Amount',
        result: basicPay,
        parts: buildFormulaParts([
          {
            label: profile.pay_basis === 'hourly' ? 'Hours Worked' : 'Days Worked',
            quantity: profile.pay_basis === 'hourly' ? num(input.hours_worked) : daysWorked,
            rate: profile.pay_basis === 'hourly' ? num(profile.pay_rate) : (profile.pay_basis === 'monthly' ? num(profile.pay_rate) / (item.period_frequency === 'weekly' ? 52 / 12 : (item.period_frequency === 'monthly' ? 1 : 2)) : dailyRate),
            multiplier: 1,
            amount: basicPay
          }
        ])
      },
      {
        code: 'OVERTIME_PAY',
        label: 'Overtime Pay',
        result: overtimePay,
        parts: buildFormulaParts([
          {
            label: 'Ordinary Day OT',
            quantity: num(input.overtime_hours),
            rate: hourlyRate,
            multiplier: overtimeMultiplier,
            amount: overtimePay
          }
        ])
      },
      {
        code: 'NIGHT_DIFFERENTIAL',
        label: 'Night Differential',
        result: nightDifferentialPay,
        parts: buildFormulaParts([
          {
            label: 'Night Shift Differential',
            quantity: roundMoney(nightDifferentialMinutes / 60),
            rate: hourlyRate,
            multiplier: nightDifferentialMultiplier,
            amount: nightDifferentialPay
          }
        ])
      },
      {
        code: 'HOLIDAY_PREMIUMS',
        label: 'Holiday / Premium Pay',
        result: roundMoney(holidayPay + restDayPay),
        parts: buildFormulaParts([
          {
            label: 'Regular Holiday',
            quantity: num(input.regular_holiday_days),
            rate: dailyRate,
            multiplier: regularHolidayMultiplier,
            amount: roundMoney(num(input.regular_holiday_days) * dailyRate * regularHolidayMultiplier)
          },
          {
            label: 'Special Holiday',
            quantity: num(input.special_holiday_days),
            rate: dailyRate,
            multiplier: specialHolidayMultiplier,
            amount: roundMoney(num(input.special_holiday_days) * dailyRate * specialHolidayMultiplier)
          },
          {
            label: 'Rest Day',
            quantity: num(input.rest_day_days),
            rate: dailyRate,
            multiplier: restDayMultiplier,
            amount: restDayPay
          }
        ])
      },
      {
        code: 'ADJUSTMENTS',
        label: 'Adjustments',
        result: adjustments,
        parts: buildFormulaParts([
          { label: 'Bonus', quantity: 1, rate: bonus, multiplier: 1, amount: bonus },
          { label: 'Commission', quantity: 1, rate: commission, multiplier: 1, amount: commission },
          { label: 'Allowance', quantity: 1, rate: allowance, multiplier: 1, amount: allowance }
        ])
      },
      {
        code: 'TOTAL_DEDUCTIONS',
        label: 'Total Deductions',
        result: totalDeductions,
        parts: buildFormulaParts(deductions.map((entry) => ({
          label: entry.label,
          quantity: 1,
          rate: entry.amount,
          multiplier: 1,
          amount: entry.amount
        })))
      }
    ],
    statutory_basis: {
      overtime_multiplier: overtimeMultiplier,
      night_differential_multiplier: nightDifferentialMultiplier,
      regular_holiday_multiplier: regularHolidayMultiplier,
      special_holiday_multiplier: specialHolidayMultiplier,
      rest_day_multiplier: restDayMultiplier
    }
  }
}

function computeEmployeePayroll({ profile, input, settings, period }) {
  const normalizedProfile = normalizeProfile(profile)
  const normalizedInput = input || {}
  const normalizedSettings = normalizeSettingsPayload(settings)
  const lines = []

  const dailyRate = getDailyRate(normalizedProfile)
  const hourlyRate = getHourlyRate(normalizedProfile)
  const monthlyBasicEquivalent = getMonthlyBasicEquivalent(normalizedProfile)
  const periodFrequency = period?.frequency || normalizedProfile.payroll_frequency || 'semi_monthly'
  const payPeriodsPerMonth = getPayPeriodsPerMonth(periodFrequency)
  const basicPay = getBasicPay(normalizedProfile, normalizedInput, period)

  const overtimeMultiplier = num(normalizedSettings.overtime_multiplier, 1.25)
  const nightDifferentialMultiplier = num(normalizedSettings.night_differential_multiplier, 0.1)
  const regularHolidayMultiplier = num(normalizedSettings.regular_holiday_multiplier, 2)
  const specialHolidayMultiplier = num(normalizedSettings.special_holiday_multiplier, 1.3)
  const restDayMultiplier = num(normalizedSettings.rest_day_multiplier, 1.3)

  const overtimeHours = num(normalizedInput.overtime_hours)
  const nightDifferentialMinutes = intNum(normalizedInput.night_differential_minutes)
  const nightDifferentialHours = roundMoney(nightDifferentialMinutes / 60)

  const overtimePay = normalizedProfile.overtime_eligible
    ? roundMoney(overtimeHours * hourlyRate * overtimeMultiplier)
    : 0
  const nightDifferentialPay = roundMoney(nightDifferentialHours * hourlyRate * nightDifferentialMultiplier)
  const regularHolidayPay = roundMoney(
    num(normalizedInput.regular_holiday_days) * dailyRate * regularHolidayMultiplier
  )
  const specialHolidayPay = roundMoney(
    num(normalizedInput.special_holiday_days) * dailyRate * specialHolidayMultiplier
  )
  const holidayPay = roundMoney(regularHolidayPay + specialHolidayPay)
  const restDayPay = roundMoney(num(normalizedInput.rest_day_days) * dailyRate * restDayMultiplier)
  const bonus = roundMoney(normalizedInput.manual_bonus)
  const commission = roundMoney(normalizedInput.manual_commission)
  const allowance = roundMoney(normalizedInput.manual_allowance)

  const absenceDeduction = roundMoney((num(normalizedInput.absent_days) + num(normalizedInput.unpaid_leave_days)) * dailyRate)
  const lateDeduction = normalizedProfile.late_deduction_enabled
    ? roundMoney((num(normalizedInput.late_minutes) / 60) * hourlyRate)
    : 0
  const undertimeDeduction = normalizedProfile.undertime_deduction_enabled
    ? roundMoney((num(normalizedInput.undertime_minutes) / 60) * hourlyRate)
    : 0
  const loanDeduction = roundMoney(normalizedInput.loan_deduction)
  const manualDeduction = roundMoney(normalizedInput.manual_deduction)

  const grossPay = roundMoney(
    basicPay
    + overtimePay
    + nightDifferentialPay
    + holidayPay
    + restDayPay
    + bonus
    + commission
    + allowance
  )
  const contributionBase = Math.max(roundMoney(grossPay - absenceDeduction - lateDeduction - undertimeDeduction), 0)
  const statutoryBases = getStatutoryMonthlyBases({
    profile: normalizedProfile,
    basicPay,
    contributionBase,
    payPeriodsPerMonth,
    monthlyBasicEquivalent
  })
  const sss = computeSSS({
    taxableIncome: contributionBase,
    monthlyCompensation: statutoryBases.monthlyCompensation,
    payPeriodsPerMonth,
    profile: normalizedProfile,
    settings: normalizedSettings
  })
  const philhealth = computePhilHealth({
    taxableIncome: contributionBase,
    monthlyBasicSalary: statutoryBases.monthlyBasicSalary,
    payPeriodsPerMonth,
    profile: normalizedProfile,
    settings: normalizedSettings
  })
  const pagibig = computePagibig({
    taxableIncome: contributionBase,
    monthlyCompensation: statutoryBases.monthlyCompensation,
    payPeriodsPerMonth,
    profile: normalizedProfile,
    settings: normalizedSettings
  })

  const taxableIncome = Math.max(roundMoney(
    contributionBase
    - sss.employee_sss
    - philhealth.employee_philhealth
    - pagibig.employee_pagibig
  ), 0)
  const tax = computeWithholdingTax({
    taxableIncome,
    periodFrequency,
    profile: normalizedProfile,
    settings: normalizedSettings
  })

  const otherDeductions = roundMoney(
    absenceDeduction
    + lateDeduction
    + undertimeDeduction
    + loanDeduction
    + manualDeduction
  )
  const totalDeductions = roundMoney(
    otherDeductions
    + tax.withholding_tax
    + sss.employee_sss
    + philhealth.employee_philhealth
    + pagibig.employee_pagibig
  )
  const netPay = roundMoney(grossPay - totalDeductions)

  line(lines, 'earning', 'BASIC_PAY', 'Basic Pay', basicPay, 10, { pay_basis: normalizedProfile.pay_basis })
  line(lines, 'earning', 'OVERTIME_PAY', 'Overtime Pay', overtimePay, 20, { overtime_hours: overtimeHours, multiplier: overtimeMultiplier })
  line(lines, 'earning', 'NIGHT_DIFFERENTIAL', 'Night Differential', nightDifferentialPay, 30, { minutes: nightDifferentialMinutes, multiplier: nightDifferentialMultiplier })
  line(lines, 'earning', 'HOLIDAY_PAY', 'Holiday Pay', holidayPay, 40)
  line(lines, 'earning', 'REST_DAY_PAY', 'Rest Day Pay', restDayPay, 50)
  line(lines, 'earning', 'BONUS', 'Bonus', bonus, 60)
  line(lines, 'earning', 'COMMISSION', 'Commission', commission, 70)
  line(lines, 'earning', 'ALLOWANCE', 'Allowance', allowance, 80)

  line(lines, 'deduction', 'ABSENCES', 'Absences / Unpaid Leave', absenceDeduction, 110)
  line(lines, 'deduction', 'LATE', 'Late Deduction', lateDeduction, 120)
  line(lines, 'deduction', 'UNDERTIME', 'Undertime Deduction', undertimeDeduction, 130)
  line(lines, 'deduction', 'LOAN', 'Loan', loanDeduction, 140)
  line(lines, 'deduction', 'SSS_EMPLOYEE', 'SSS Employee Share', sss.employee_sss, 150)
  line(lines, 'deduction', 'PHILHEALTH_EMPLOYEE', 'PhilHealth Employee Share', philhealth.employee_philhealth, 160)
  line(lines, 'deduction', 'PAGIBIG_EMPLOYEE', 'Pag-IBIG Employee Share', pagibig.employee_pagibig, 170)
  line(lines, 'deduction', 'WITHHOLDING_TAX', 'Withholding Tax', tax.withholding_tax, 180)
  line(lines, 'deduction', 'MANUAL_DEDUCTION', 'Manual Deductions', manualDeduction, 190)

  line(lines, 'employer_share', 'SSS_EMPLOYER', 'SSS Employer Share', sss.employer_sss, 210)
  line(lines, 'employer_share', 'SSS_EC', 'SSS EC Contribution', sss.ec_contribution, 220)
  line(lines, 'employer_share', 'PHILHEALTH_EMPLOYER', 'PhilHealth Employer Share', philhealth.employer_philhealth, 230)
  line(lines, 'employer_share', 'PAGIBIG_EMPLOYER', 'Pag-IBIG Employer Share', pagibig.employer_pagibig, 240)
  line(lines, 'info', 'MONTHLY_BASIC_EQUIVALENT', 'Monthly Basic Equivalent', monthlyBasicEquivalent, 300, { pay_periods_per_month: payPeriodsPerMonth })

  const computed = {
    payroll_profile_snapshot: normalizedProfile,
    input_snapshot: normalizedInput,
    settings_snapshot: normalizedSettings,
    gross_basic_pay: basicPay,
    gross_overtime_pay: overtimePay,
    gross_night_differential_pay: nightDifferentialPay,
    gross_holiday_pay: holidayPay,
    gross_rest_day_pay: restDayPay,
    gross_bonus: bonus,
    gross_commission: commission,
    gross_allowances: allowance,
    gross_pay: grossPay,
    monthly_basic_equivalent: monthlyBasicEquivalent,
    taxable_income: taxableIncome,
    withholding_tax: tax.withholding_tax,
    employee_sss: sss.employee_sss,
    employer_sss: sss.employer_sss,
    ec_contribution: sss.ec_contribution,
    employee_philhealth: philhealth.employee_philhealth,
    employer_philhealth: philhealth.employer_philhealth,
    employee_pagibig: pagibig.employee_pagibig,
    employer_pagibig: pagibig.employer_pagibig,
    loan_deduction: loanDeduction,
    other_deductions: otherDeductions,
    total_deductions: totalDeductions,
    net_pay: netPay,
    employer_contributions: roundMoney(sss.employer_sss + sss.ec_contribution + philhealth.employer_philhealth + pagibig.employer_pagibig),
    lines
  }

  computed.payslip_view = buildPayslipView({
    item: {
      ...computed,
      user_id: normalizedProfile.user_id,
      period_code: period?.code || null,
      period_frequency: periodFrequency,
      start_date: period?.start_date || null,
      end_date: period?.end_date || null,
      payout_date: period?.payout_date || null
    },
    profile: normalizedProfile,
    input: normalizedInput,
    settings: normalizedSettings,
    lines,
    employee: normalizedProfile
  })

  return computed
}

module.exports = {
  buildPayslipView,
  computeEmployeePayroll,
  getDailyRate,
  getHourlyRate,
  getMonthlyBasicEquivalent,
  roundMoney
}
