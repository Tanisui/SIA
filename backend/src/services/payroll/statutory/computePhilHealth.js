function roundMoney(value) {
  return Math.round((Number(value) || 0) * 100) / 100
}

function num(value, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function splitMonthlyAmount(amount, payPeriodsPerMonth) {
  const divisor = Math.max(num(payPeriodsPerMonth, 1), 1)
  return roundMoney(amount / divisor)
}

function computePhilHealth({ taxableIncome, monthlyBasicSalary, payPeriodsPerMonth = 1, profile, settings }) {
  if (!profile?.philhealth_enabled || !settings?.philhealth?.enabled) {
    return { employee_philhealth: 0, employer_philhealth: 0 }
  }

  const ph = settings.philhealth || {}
  const floor = num(ph.monthly_salary_floor, 0)
  const cap = num(ph.monthly_salary_cap, Number.MAX_SAFE_INTEGER)
  const baseInput = Math.max(num(monthlyBasicSalary, taxableIncome), 0)
  if (baseInput <= 0) {
    return { employee_philhealth: 0, employer_philhealth: 0 }
  }
  const base = Math.min(Math.max(baseInput, floor), cap)
  const monthlyPremium = roundMoney(base * num(ph.premium_rate))

  return {
    employee_philhealth: splitMonthlyAmount(monthlyPremium * num(ph.employee_share_rate, 0.5), payPeriodsPerMonth),
    employer_philhealth: splitMonthlyAmount(monthlyPremium * num(ph.employer_share_rate, 0.5), payPeriodsPerMonth)
  }
}

module.exports = { computePhilHealth }
