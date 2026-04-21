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

function getDailyRate(profile) {
  const payRate = num(profile.pay_rate)
  const workDays = num(profile.standard_work_days_per_month, 22) || 22
  if (profile.pay_basis === 'monthly') return roundMoney(payRate / workDays)
  if (profile.pay_basis === 'daily') return roundMoney(payRate)
  return roundMoney(num(profile.standard_hours_per_day, 8) * payRate)
}

function getHourlyRate(profile) {
  const hoursPerDay = num(profile.standard_hours_per_day, 8) || 8
  if (profile.pay_basis === 'hourly') return roundMoney(profile.pay_rate)
  return roundMoney(getDailyRate(profile) / hoursPerDay)
}

function getMonthlyBasicEquivalent(profile) {
  const payRate = num(profile.pay_rate)
  const workDays = num(profile.standard_work_days_per_month, 22) || 22
  const hoursPerDay = num(profile.standard_hours_per_day, 8) || 8
  if (profile.pay_basis === 'monthly') return roundMoney(payRate)
  if (profile.pay_basis === 'daily') return roundMoney(payRate * workDays)
  return roundMoney(payRate * workDays * hoursPerDay)
}

function getPayPeriodsPerMonth(frequency) {
  if (frequency === 'weekly') return 52 / 12
  if (frequency === 'monthly') return 1
  return 2
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

function computeEmployeePayroll({ profile, input, settings, period }) {
  const normalizedProfile = normalizeProfile(profile)
  const normalizedInput = input || {}
  const normalizedSettings = settings || {}
  const lines = []

  const dailyRate = getDailyRate(normalizedProfile)
  const hourlyRate = getHourlyRate(normalizedProfile)
  const monthlyBasicEquivalent = getMonthlyBasicEquivalent(normalizedProfile)
  const periodFrequency = period?.frequency || normalizedProfile.payroll_frequency || 'semi_monthly'
  const payPeriodsPerMonth = getPayPeriodsPerMonth(periodFrequency)
  const basicPay = getBasicPay(normalizedProfile, normalizedInput, period)

  const overtimeMultiplier = num(normalizedSettings.overtime_multiplier, 1.25)
  const regularHolidayMultiplier = num(normalizedSettings.regular_holiday_multiplier, 2)
  const specialHolidayMultiplier = num(normalizedSettings.special_holiday_multiplier, 1.3)
  const restDayMultiplier = num(normalizedSettings.rest_day_multiplier, 1.3)

  const overtimePay = normalizedProfile.overtime_eligible
    ? roundMoney(num(normalizedInput.overtime_hours) * hourlyRate * overtimeMultiplier)
    : 0
  const holidayPay = roundMoney(
    (num(normalizedInput.regular_holiday_days) * dailyRate * regularHolidayMultiplier)
    + (num(normalizedInput.special_holiday_days) * dailyRate * specialHolidayMultiplier)
  )
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
  const manualDeduction = roundMoney(normalizedInput.manual_deduction)

  const grossPay = roundMoney(basicPay + overtimePay + holidayPay + restDayPay + bonus + commission + allowance)
  const contributionBase = Math.max(roundMoney(grossPay - absenceDeduction - lateDeduction - undertimeDeduction), 0)

  const monthlyContributionBase = Math.max(monthlyBasicEquivalent, roundMoney(contributionBase * payPeriodsPerMonth))
  const sss = computeSSS({
    taxableIncome: contributionBase,
    monthlyCompensation: monthlyContributionBase,
    payPeriodsPerMonth,
    profile: normalizedProfile,
    settings: normalizedSettings
  })
  const philhealth = computePhilHealth({
    taxableIncome: contributionBase,
    monthlyBasicSalary: monthlyBasicEquivalent,
    payPeriodsPerMonth,
    profile: normalizedProfile,
    settings: normalizedSettings
  })
  const pagibig = computePagibig({
    taxableIncome: contributionBase,
    monthlyCompensation: monthlyContributionBase,
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

  const otherDeductions = roundMoney(absenceDeduction + lateDeduction + undertimeDeduction + manualDeduction)
  const totalDeductions = roundMoney(
    otherDeductions
    + tax.withholding_tax
    + sss.employee_sss
    + philhealth.employee_philhealth
    + pagibig.employee_pagibig
  )
  const netPay = Math.max(roundMoney(grossPay - totalDeductions), 0)

  line(lines, 'earning', 'BASIC_PAY', 'Basic Pay', basicPay, 10, { pay_basis: normalizedProfile.pay_basis })
  line(lines, 'earning', 'OVERTIME_PAY', 'Overtime Pay', overtimePay, 20, { overtime_hours: num(normalizedInput.overtime_hours), multiplier: overtimeMultiplier })
  line(lines, 'earning', 'HOLIDAY_PAY', 'Holiday Pay', holidayPay, 30)
  line(lines, 'earning', 'REST_DAY_PAY', 'Rest Day Pay', restDayPay, 40)
  line(lines, 'earning', 'BONUS', 'Bonus', bonus, 50)
  line(lines, 'earning', 'COMMISSION', 'Commission', commission, 60)
  line(lines, 'earning', 'ALLOWANCE', 'Allowance', allowance, 70)

  line(lines, 'deduction', 'ABSENCES', 'Absences / Unpaid Leave', absenceDeduction, 110)
  line(lines, 'deduction', 'LATE', 'Late Deduction', lateDeduction, 120)
  line(lines, 'deduction', 'UNDERTIME', 'Undertime Deduction', undertimeDeduction, 130)
  line(lines, 'deduction', 'SSS_EMPLOYEE', 'SSS Employee Share', sss.employee_sss, 140)
  line(lines, 'deduction', 'PHILHEALTH_EMPLOYEE', 'PhilHealth Employee Share', philhealth.employee_philhealth, 150)
  line(lines, 'deduction', 'PAGIBIG_EMPLOYEE', 'Pag-IBIG Employee Share', pagibig.employee_pagibig, 160)
  line(lines, 'deduction', 'WITHHOLDING_TAX', 'Withholding Tax', tax.withholding_tax, 170)
  line(lines, 'deduction', 'MANUAL_DEDUCTION', 'Manual Deductions', manualDeduction, 180)

  line(lines, 'employer_share', 'SSS_EMPLOYER', 'SSS Employer Share', sss.employer_sss, 210)
  line(lines, 'employer_share', 'SSS_EC', 'SSS EC Contribution', sss.ec_contribution, 220)
  line(lines, 'employer_share', 'PHILHEALTH_EMPLOYER', 'PhilHealth Employer Share', philhealth.employer_philhealth, 230)
  line(lines, 'employer_share', 'PAGIBIG_EMPLOYER', 'Pag-IBIG Employer Share', pagibig.employer_pagibig, 240)
  line(lines, 'info', 'MONTHLY_BASIC_EQUIVALENT', 'Monthly Basic Equivalent', monthlyBasicEquivalent, 300, { pay_periods_per_month: payPeriodsPerMonth })

  return {
    payroll_profile_snapshot: normalizedProfile,
    input_snapshot: normalizedInput,
    settings_snapshot: normalizedSettings,
    gross_basic_pay: basicPay,
    gross_overtime_pay: overtimePay,
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
    other_deductions: otherDeductions,
    total_deductions: totalDeductions,
    net_pay: netPay,
    employer_contributions: roundMoney(sss.employer_sss + sss.ec_contribution + philhealth.employer_philhealth + pagibig.employer_pagibig),
    lines
  }
}

module.exports = {
  computeEmployeePayroll,
  getDailyRate,
  getHourlyRate,
  getMonthlyBasicEquivalent,
  roundMoney
}
