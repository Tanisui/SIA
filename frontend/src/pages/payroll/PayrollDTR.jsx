import React, { useEffect, useMemo, useState } from 'react'
import { useSelector } from 'react-redux'
import api from '../../api/api.js'
import cecilleLogo from '../../assets/cecille-logo.png'
import { getErrorMessage } from './payrollUtils.js'

const MONTH_LABELS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
]

const STATUS_LABEL = {
  PRESENT:  'Present',
  LATE:     'Late',
  HALF_DAY: 'Half Day',
  ABSENT:   'Absent',
  ON_LEAVE: 'On Leave',
  REST_DAY: 'Rest Day',
  HOLIDAY:  'Holiday'
}

function pad2(n) {
  return String(n).padStart(2, '0')
}

function daysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate()
}

function dateKey(year, month, day) {
  return `${year}-${pad2(month + 1)}-${pad2(day)}`
}

function formatTime12(value) {
  if (!value) return ''
  const text = String(value).trim()
  if (!text || text === '-') return ''
  const [hRaw, mRaw] = text.split(':')
  const hour = Number(hRaw)
  const minute = Number(mRaw)
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return ''
  const period = hour >= 12 ? 'PM' : 'AM'
  const display = hour % 12 === 0 ? 12 : hour % 12
  return `${display}:${pad2(minute)} ${period}`
}

function isAfterNoon(value) {
  if (!value) return false
  const text = String(value).trim()
  const [hRaw] = text.split(':')
  const hour = Number(hRaw)
  return Number.isFinite(hour) && hour >= 12
}

function splitUndertime(totalMinutes) {
  const total = Math.max(0, Number(totalMinutes) || 0)
  return {
    hours: Math.floor(total / 60),
    minutes: total % 60
  }
}

function getCurrentMonthValue() {
  const now = new Date()
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}`
}

function parseMonthValue(value) {
  if (!value) {
    const now = new Date()
    return { year: now.getFullYear(), month: now.getMonth() }
  }
  const [yearRaw, monthRaw] = String(value).split('-')
  const year = Number(yearRaw)
  const month = Number(monthRaw) - 1
  if (!Number.isFinite(year) || !Number.isFinite(month)) {
    const now = new Date()
    return { year: now.getFullYear(), month: now.getMonth() }
  }
  return { year, month }
}

function buildDtrRows(year, month, recordsByDate) {
  const total = daysInMonth(year, month)
  const rows = []
  for (let day = 1; day <= total; day += 1) {
    const key = dateKey(year, month, day)
    const record = recordsByDate.get(key) || null
    const status = String(record?.status || '').toUpperCase()
    const isWorked = ['PRESENT', 'LATE', 'HALF_DAY'].includes(status)
    const clockIn = record?.clock_in || null
    const clockOut = record?.clock_out || null
    const hasAfternoonOut = clockOut && isAfterNoon(clockOut)
    const undertime = splitUndertime(record?.undertime_minutes)

    rows.push({
      day,
      dateKey: key,
      weekday: new Date(year, month, day).getDay(),
      record,
      status,
      isWorked,
      amArrival:   isWorked && clockIn ? formatTime12(clockIn) : '',
      amDeparture: '',
      pmArrival:   '',
      pmDeparture: isWorked && hasAfternoonOut ? formatTime12(clockOut) : '',
      undertimeHours:   isWorked ? undertime.hours : '',
      undertimeMinutes: isWorked ? undertime.minutes : '',
      remark: !record ? '' : (status === 'PRESENT' ? '' : (STATUS_LABEL[status] || ''))
    })
  }
  return rows
}

export default function PayrollDTR() {
  const currentUser = useSelector((s) => s.auth?.user) || null
  const permissions = useSelector((s) => s.auth?.permissions) || []
  const canViewAll = useMemo(() => {
    if (!Array.isArray(permissions)) return false
    if (permissions.includes('admin.*')) return true
    return ['attendance.view', 'payroll.view', 'payroll.period.view'].some((p) => permissions.includes(p))
  }, [permissions])

  const [employees, setEmployees] = useState([])
  const [employeeId, setEmployeeId] = useState('')
  const [monthValue, setMonthValue] = useState(getCurrentMonthValue())
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [meEmployeeFallback, setMeEmployeeFallback] = useState(null)

  const { year, month } = parseMonthValue(monthValue)
  const monthLabel = MONTH_LABELS[month] || ''

  useEffect(() => {
    if (!canViewAll) return
    let cancelled = false
    async function loadEmployees() {
      try {
        const res = await api.get('/employees')
        if (cancelled) return
        const data = Array.isArray(res.data) ? res.data : (res.data?.data || [])
        const active = data.filter((e) => e.employment_status !== 'TERMINATED')
        setEmployees(active)
        if (active.length && !employeeId) {
          setEmployeeId(String(active[0].id))
        }
      } catch (err) {
        if (!cancelled) setError(getErrorMessage(err, 'Failed to load employees'))
      }
    }
    loadEmployees()
    return () => { cancelled = true }
  }, [canViewAll, employeeId])

  useEffect(() => {
    let cancelled = false
    async function loadRecords() {
      try {
        setLoading(true)
        setError(null)
        const lastDay = daysInMonth(year, month)
        const from = dateKey(year, month, 1)
        const to = dateKey(year, month, lastDay)
        const params = new URLSearchParams({ from, to, limit: 500, page: 1 })

        let res
        if (canViewAll) {
          if (!employeeId) { setRecords([]); return }
          params.set('employee_id', employeeId)
          res = await api.get(`/attendance?${params}`)
        } else {
          res = await api.get(`/attendance/me?${params}`)
        }
        if (cancelled) return
        const list = Array.isArray(res.data?.data) ? res.data.data
                    : (Array.isArray(res.data) ? res.data : [])
        setRecords(list)
        if (!canViewAll && list.length) {
          setMeEmployeeFallback({
            id: list[0].employee_id,
            name: list[0].employee_name,
            position_title: list[0].position_title
          })
        }
      } catch (err) {
        if (!cancelled) setError(getErrorMessage(err, 'Failed to load attendance for this month'))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    loadRecords()
    return () => { cancelled = true }
  }, [canViewAll, employeeId, year, month])

  const recordsByDate = useMemo(() => {
    const map = new Map()
    for (const row of records) {
      const key = String(row?.date || '').slice(0, 10)
      if (key) map.set(key, row)
    }
    return map
  }, [records])

  const dtrRows = useMemo(() => buildDtrRows(year, month, recordsByDate), [year, month, recordsByDate])

  const totals = useMemo(() => {
    let totalHours = 0
    let totalMinutes = 0
    let daysPresent = 0
    let daysAbsent = 0
    for (const row of dtrRows) {
      if (row.isWorked) daysPresent += 1
      if (row.status === 'ABSENT') daysAbsent += 1
      const h = Number(row.undertimeHours)
      const m = Number(row.undertimeMinutes)
      if (Number.isFinite(h)) totalHours += h
      if (Number.isFinite(m)) totalMinutes += m
    }
    totalHours += Math.floor(totalMinutes / 60)
    totalMinutes = totalMinutes % 60
    return { totalHours, totalMinutes, daysPresent, daysAbsent }
  }, [dtrRows])

  const employeeMeta = useMemo(() => {
    if (canViewAll) {
      const match = employees.find((e) => String(e.id) === String(employeeId))
      return {
        name: match?.name || '',
        position: match?.position_title || ''
      }
    }
    if (meEmployeeFallback) {
      return {
        name: meEmployeeFallback.name || currentUser?.full_name || currentUser?.username || '',
        position: meEmployeeFallback.position_title || ''
      }
    }
    return {
      name: currentUser?.full_name || currentUser?.username || '',
      position: ''
    }
  }, [canViewAll, currentUser, employeeId, employees, meEmployeeFallback])

  return (
    <div className="page payroll-page payroll-dtr-page">
      <div className="page-header no-print">
        <div>
          <h1 className="page-title">Daily Time Record</h1>
          <p className="page-subtitle">
            View and print the monthly DTR. Each row mirrors the employee&apos;s recorded clock-in / clock-out.
          </p>
        </div>
        <div className="payroll-header-actions">
          <button className="btn btn-primary" type="button" onClick={() => window.print()} disabled={loading}>
            Print DTR
          </button>
        </div>
      </div>

      <div className="card payroll-dtr-controls no-print">
        <div className="form-grid">
          {canViewAll ? (
            <div className="form-group">
              <label className="form-label">Employee</label>
              <select
                className="form-input"
                value={employeeId}
                onChange={(e) => setEmployeeId(e.target.value)}
              >
                <option value="">— Select employee —</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.name}{emp.position_title ? ` — ${emp.position_title}` : ''}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <div className="form-group">
            <label className="form-label">Month</label>
            <input
              type="month"
              className="form-input"
              value={monthValue}
              onChange={(e) => setMonthValue(e.target.value || getCurrentMonthValue())}
            />
          </div>
        </div>
        {error ? <div className="error-msg" style={{ marginTop: 12 }}>{error}</div> : null}
      </div>

      <div className="payroll-dtr-shell">
        <div className="card payroll-dtr-paper">
          <div className="payroll-dtr-header">
            <div className="payroll-dtr-brand">
              <img src={cecilleLogo} alt="Cecille's N'Style" className="payroll-dtr-brand-logo" />
              <div className="payroll-dtr-brand-text">
                <div className="payroll-dtr-brand-name">Cecille&apos;s N&apos;Style</div>
                <div className="payroll-dtr-brand-tag">HR &middot; Payroll</div>
              </div>
            </div>
            <div className="payroll-dtr-title-block">
              <div className="payroll-dtr-title">DAILY TIME RECORD</div>
              <div className="payroll-dtr-divider">— oOo —</div>
            </div>
            <div className="payroll-dtr-doc-id">
              <span>Form</span>
              <strong>DTR-CN-001</strong>
            </div>
          </div>

          <div className="payroll-dtr-meta">
            <div className="payroll-dtr-name-row">
              <div className="payroll-dtr-field-line">
                <span className="payroll-dtr-field-value">{employeeMeta.name || '—'}</span>
                <span className="payroll-dtr-field-caption">(Name)</span>
              </div>
              {employeeMeta.position ? (
                <div className="payroll-dtr-field-line payroll-dtr-position">
                  <span className="payroll-dtr-field-value">{employeeMeta.position}</span>
                  <span className="payroll-dtr-field-caption">(Position)</span>
                </div>
              ) : null}
            </div>
            <div className="payroll-dtr-month-row">
              <div className="payroll-dtr-month-label">For the month of</div>
              <div className="payroll-dtr-month-value">{monthLabel.toUpperCase()} {year}</div>
            </div>
          </div>

          <div className="payroll-dtr-hours">
            <div className="payroll-dtr-hours-title">Official hours for arrival and departure</div>
            <table className="payroll-dtr-hours-table">
              <tbody>
                <tr>
                  <td className="payroll-dtr-hours-label">Regular days</td>
                  <td>8:00 AM – 12:00 PM &nbsp;&middot;&nbsp; 1:00 PM – 5:00 PM</td>
                </tr>
                <tr>
                  <td className="payroll-dtr-hours-label">Saturdays</td>
                  <td>As Required</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="payroll-dtr-table-wrap">
            <table className="payroll-dtr-table">
              <thead>
                <tr>
                  <th rowSpan={2} className="payroll-dtr-day-col">Day</th>
                  <th colSpan={2}>A.M.</th>
                  <th colSpan={2}>P.M.</th>
                  <th colSpan={2}>Undertime</th>
                  <th rowSpan={2}>Remarks</th>
                </tr>
                <tr>
                  <th>Arrival</th>
                  <th>Departure</th>
                  <th>Arrival</th>
                  <th>Departure</th>
                  <th>Hours</th>
                  <th>Minutes</th>
                </tr>
              </thead>
              <tbody>
                {dtrRows.map((row) => {
                  const isWeekend = row.weekday === 0 || row.weekday === 6
                  const rowClass = [
                    'payroll-dtr-row',
                    isWeekend ? 'payroll-dtr-row-weekend' : '',
                    row.status === 'ABSENT' ? 'payroll-dtr-row-absent' : '',
                    row.status === 'HOLIDAY' ? 'payroll-dtr-row-holiday' : ''
                  ].filter(Boolean).join(' ')
                  return (
                    <tr key={row.dateKey} className={rowClass}>
                      <td className="payroll-dtr-day-cell">{row.day}</td>
                      <td>{row.amArrival}</td>
                      <td>{row.amDeparture}</td>
                      <td>{row.pmArrival}</td>
                      <td>{row.pmDeparture}</td>
                      <td>{row.undertimeHours === '' ? '' : row.undertimeHours}</td>
                      <td>{row.undertimeMinutes === '' ? '' : row.undertimeMinutes}</td>
                      <td className="payroll-dtr-remark-cell">{row.remark}</td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={5} className="payroll-dtr-totals-label">
                    Days present: <strong>{totals.daysPresent}</strong>
                    {' '}&middot;{' '}
                    Days absent: <strong>{totals.daysAbsent}</strong>
                  </td>
                  <td className="payroll-dtr-totals-value">{totals.totalHours}</td>
                  <td className="payroll-dtr-totals-value">{totals.totalMinutes}</td>
                  <td className="payroll-dtr-totals-label">Total Undertime</td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="payroll-dtr-certify">
            I certify on my honor that the above is a true record of the hours of work performed,
            record of which was made daily at the time of arrival and departure from the office.
          </div>

          <div className="payroll-dtr-signatures">
            <div>
              <div className="payroll-dtr-signature-line" />
              <span>Employee Signature</span>
            </div>
            <div>
              <div className="payroll-dtr-signature-line" />
              <span>Verified by Supervisor</span>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="card no-print" style={{ textAlign: 'center', padding: 16, color: 'var(--text-light)' }}>
            Loading attendance for {monthLabel} {year}…
          </div>
        ) : null}
      </div>
    </div>
  )
}
