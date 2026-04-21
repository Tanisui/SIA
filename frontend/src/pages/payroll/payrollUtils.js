export function formatCurrency(value) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return 'PHP 0.00'
  return `PHP ${parsed.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function formatDate(value) {
  if (!value) return '-'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return String(value).slice(0, 10)
  return parsed.toLocaleDateString()
}

export function dateOnly(value) {
  if (!value) return ''
  return String(value).slice(0, 10)
}

export function statusBadgeClass(status) {
  const normalized = String(status || '').toLowerCase()
  if (['active', 'released', 'finalized'].includes(normalized)) return 'badge badge-success'
  if (['computed', 'draft'].includes(normalized)) return 'badge badge-info'
  if (normalized === 'void') return 'badge badge-danger'
  return 'badge badge-neutral'
}

export function getErrorMessage(err, fallback) {
  return err?.response?.data?.error || fallback
}

export function toInputNumber(value) {
  if (value === null || value === undefined) return ''
  return String(value)
}
