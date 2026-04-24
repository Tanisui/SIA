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

function computePagibig({ taxableIncome, monthlyCompensation, payPeriodsPerMonth = 1, profile, settings }) {
  if (!profile?.pagibig_enabled || !settings?.pagibig?.enabled) {
    return { employee_pagibig: 0, employer_pagibig: 0 }
  }

  const pagibig = settings.pagibig || {}
  const baseInput = Math.max(num(monthlyCompensation, taxableIncome), 0)
  if (baseInput <= 0) {
    return { employee_pagibig: 0, employer_pagibig: 0 }
  }
  const base = Math.min(
    baseInput,
    num(pagibig.monthly_compensation_cap, Number.MAX_SAFE_INTEGER)
  )

  return {
    employee_pagibig: splitMonthlyAmount(base * num(pagibig.employee_rate), payPeriodsPerMonth),
    employer_pagibig: splitMonthlyAmount(base * num(pagibig.employer_rate), payPeriodsPerMonth)
  }
}

module.exports = { computePagibig }
