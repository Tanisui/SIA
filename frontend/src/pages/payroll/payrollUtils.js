export function formatCurrency(value) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return 'PHP 0.00'
  return `PHP ${parsed.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function formatPeso(value) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return '₱0.00'
  const absolute = Math.abs(parsed).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })
  return `${parsed < 0 ? '-' : ''}₱${absolute}`
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

export function buildLoadInputsMessage(result = {}) {
  const loaded = Number(result.loaded_count || 0)
  const autoCreated = Number(result.auto_created_count || 0)
  const skipped = Number(result.skipped_count || 0)

  if (!loaded) {
    if (skipped > 0) {
      return `No payroll inputs were loaded. ${skipped} employee${skipped === 1 ? '' : 's'} were skipped because required payroll data is missing.`
    }
    return 'No payroll inputs were loaded. No active employee payroll records matched this payroll period.'
  }

  const parts = [
    `Loaded ${loaded} employee${loaded === 1 ? '' : 's'} into payroll inputs.`
  ]
  if (autoCreated > 0) {
    parts.push(`Created ${autoCreated} payroll profile${autoCreated === 1 ? '' : 's'} from employee records.`)
  }
  if (skipped > 0) {
    parts.push(`Skipped ${skipped} employee${skipped === 1 ? '' : 's'} with incomplete payroll data.`)
  }
  return parts.join(' ')
}

export function buildAttendanceSyncFeedback(result = {}) {
  const synced = Number(result.synced || 0)
  const skipped = Number(result.skipped_count || 0)
  const profileSkipped = Number(result.profile_skipped_count || 0)
  const message = result.message || 'Attendance sync finished.'
  return {
    message,
    isError: synced === 0,
    isWarning: skipped > 0 || profileSkipped > 0
  }
}

export function buildComputeSyncFeedback(result = {}) {
  const synced = Number(result.synced || 0)
  const attendanceRecordsFound = Number(result.attendance_records_found || 0)
  const skipped = Number(result.skipped_count || 0)
  const profileSkipped = Number(result.profile_skipped_count || 0)
  const baseMessage = result.message || 'Attendance refresh finished before payroll compute.'
  return {
    message: `Payroll computed. ${baseMessage}`,
    isWarning: attendanceRecordsFound === 0 || synced === 0 || skipped > 0 || profileSkipped > 0
  }
}
