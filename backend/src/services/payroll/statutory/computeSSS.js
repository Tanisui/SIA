function roundMoney(value) {
  return Math.round((Number(value) || 0) * 100) / 100
}

function num(value, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function findBracket(brackets, monthlyCompensation) {
  if (!Array.isArray(brackets)) return null
  return brackets.find((row) => {
    const from = num(row.from, 0)
    const to = row.to === null || row.to === undefined ? Number.MAX_SAFE_INTEGER : num(row.to, Number.MAX_SAFE_INTEGER)
    return monthlyCompensation >= from && monthlyCompensation <= to
  }) || null
}

function splitMonthlyAmount(amount, payPeriodsPerMonth) {
  const divisor = Math.max(num(payPeriodsPerMonth, 1), 1)
  return roundMoney(amount / divisor)
}

function resolveMonthlySalaryCredit(monthlyCompensation, sss) {
  const floor = num(sss.monthly_salary_credit_floor, 0)
  const cap = num(sss.monthly_salary_credit_cap, Number.MAX_SAFE_INTEGER)
  const increment = num(sss.monthly_salary_credit_increment, 0)
  const clamped = Math.min(Math.max(monthlyCompensation, floor), cap)
  if (increment > 0) {
    return Math.min(Math.max(Math.round(clamped / increment) * increment, floor), cap)
  }
  return clamped
}

function computeSSS({ taxableIncome, monthlyCompensation, payPeriodsPerMonth = 1, profile, settings }) {
  if (!profile?.sss_enabled || !settings?.sss?.enabled) {
    return { employee_sss: 0, employer_sss: 0, ec_contribution: 0 }
  }

  const sss = settings.sss || {}
  const monthlyBaseInput = Math.max(num(monthlyCompensation, taxableIncome), 0)
  if (monthlyBaseInput <= 0) {
    return { employee_sss: 0, employer_sss: 0, ec_contribution: 0 }
  }
  const bracket = findBracket(sss.brackets, monthlyBaseInput)

  if (bracket) {
    return {
      employee_sss: splitMonthlyAmount(num(bracket.employee_share), payPeriodsPerMonth),
      employer_sss: splitMonthlyAmount(num(bracket.employer_share), payPeriodsPerMonth),
      ec_contribution: splitMonthlyAmount(num(bracket.ec_contribution), payPeriodsPerMonth)
    }
  }

  const base = resolveMonthlySalaryCredit(monthlyBaseInput, sss)
  const ecThreshold = num(sss.ec_threshold, 14500)
  const monthlyEmployee = Math.max(base * num(sss.employee_rate), num(sss.min_employee_contribution))
  const monthlyEmployer = Math.max(base * num(sss.employer_rate), num(sss.min_employer_contribution))
  const monthlyEc = base <= ecThreshold ? num(sss.ec_low_amount, 10) : num(sss.ec_high_amount, 30)

  return {
    employee_sss: splitMonthlyAmount(monthlyEmployee, payPeriodsPerMonth),
    employer_sss: splitMonthlyAmount(monthlyEmployer, payPeriodsPerMonth),
    ec_contribution: splitMonthlyAmount(monthlyEc, payPeriodsPerMonth)
  }
}

module.exports = { computeSSS }
