const CURRENCY_FORMATTER = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
})

const NUMBER_FORMATTER = new Intl.NumberFormat('en-PH')

const DATE_FORMATTER = new Intl.DateTimeFormat('en-PH', {
  year: 'numeric',
  month: 'short',
  day: 'numeric'
})

export function toNumber(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export function formatCurrency(value) {
  return CURRENCY_FORMATTER.format(toNumber(value))
}

export function formatNumber(value) {
  return NUMBER_FORMATTER.format(toNumber(value))
}

export function formatDate(value) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return DATE_FORMATTER.format(date)
}

export function formatPercent(value) {
  return `${toNumber(value).toFixed(2)}%`
}

export function getFriendlyReportError(err) {
  const apiError = err?.response?.data?.error
  const apiDetails = err?.response?.data?.details
  if (apiError && apiDetails) return `${apiError} ${apiDetails}`
  if (apiError) return apiError
  if (err?.message) return err.message
  return 'Unable to load automated reports right now. Please try again.'
}
