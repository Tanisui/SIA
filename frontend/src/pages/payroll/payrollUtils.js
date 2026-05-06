import React from 'react'
import { useSelector } from 'react-redux'

const PAYROLL_WRITE_PERMS = {
  profileWrite: ['payroll.profile.create', 'payroll.profile.update'],
  periodWrite:  ['payroll.period.create'],
  compute:      ['payroll.period.compute', 'payroll.input.update'],
  finalize:     ['payroll.period.finalize'],
  release:      ['payroll.period.release'],
  voidRun:      ['payroll.period.void'],
  settings:     ['payroll.settings.update'],
  reportExport: ['payroll.report.export']
}

function readStoredPermissions() {
  try {
    return JSON.parse(localStorage.getItem('permissions') || '[]')
  } catch (e) {
    return []
  }
}

export function usePermissions() {
  const reduxPermissions = useSelector((s) => s.auth?.permissions)
  const list = Array.isArray(reduxPermissions) ? reduxPermissions : readStoredPermissions()
  const isAdmin = list.includes('admin.*')
  function can(perms) {
    if (isAdmin) return true
    if (!Array.isArray(perms)) perms = [perms]
    return perms.some((p) => list.includes(p))
  }
  return {
    permissions: list,
    isAdmin,
    can,
    canPayrollWrite: {
      profile:  isAdmin || can(PAYROLL_WRITE_PERMS.profileWrite),
      period:   isAdmin || can(PAYROLL_WRITE_PERMS.periodWrite),
      compute:  isAdmin || can(PAYROLL_WRITE_PERMS.compute),
      finalize: isAdmin || can(PAYROLL_WRITE_PERMS.finalize),
      release:  isAdmin || can(PAYROLL_WRITE_PERMS.release),
      voidRun:  isAdmin || can(PAYROLL_WRITE_PERMS.voidRun),
      settings: isAdmin || can(PAYROLL_WRITE_PERMS.settings),
      export:   isAdmin || can(PAYROLL_WRITE_PERMS.reportExport)
    }
  }
}

export function ViewOnlyBadge({ label = 'View only' }) {
  return React.createElement(
    'span',
    {
      className: 'payroll-view-only-badge',
      title: 'You have read-only access. Contact an administrator to make changes.'
    },
    label
  )
}

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
  const message = result.message || 'Attendance sync completed.'
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
  const baseMessage = result.message || 'Attendance records were refreshed before the payroll run.'
  return {
    message: `Payroll computed. ${baseMessage}`,
    isWarning: attendanceRecordsFound === 0 || synced === 0 || skipped > 0 || profileSkipped > 0
  }
}
