function roundMoney(value) {
  return Math.round((Number(value) || 0) * 100) / 100
}

function getBrackets(taxSettings, periodFrequency) {
  const configured = taxSettings.brackets
  if (Array.isArray(configured)) return configured
  if (configured && typeof configured === 'object') {
    return configured[periodFrequency] || configured.monthly || []
  }
  return []
}

function computeWithholdingTax({ taxableIncome, periodFrequency = 'semi_monthly', profile, settings }) {
  if (!profile?.tax_enabled || !settings?.withholding_tax?.enabled) return { withholding_tax: 0 }

  const taxSettings = settings.withholding_tax || {}
  const income = Math.max(Number(taxableIncome) || 0, 0)
  const brackets = getBrackets(taxSettings, periodFrequency)
  const bracket = brackets
    .filter((row) => income >= (Number(row.from) || 0) && (row.to === null || row.to === undefined || income <= Number(row.to)))
    .sort((a, b) => (Number(b.from) || 0) - (Number(a.from) || 0))[0]

  if (!bracket) return { withholding_tax: 0 }

  const baseTax = Number(bracket.base_tax) || 0
  const excessOver = Number(bracket.excess_over) || Number(bracket.from) || 0
  const rate = Number(bracket.rate) || 0
  return { withholding_tax: roundMoney(baseTax + Math.max(income - excessOver, 0) * rate) }
}

module.exports = { computeWithholdingTax }
