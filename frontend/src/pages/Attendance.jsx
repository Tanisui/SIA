import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useSelector } from 'react-redux'
import api from '../api/api.js'
import { buildAttendanceSyncFeedback } from './payroll/payrollUtils.js'

const STATUS_OPTIONS = ['PRESENT', 'LATE', 'HALF_DAY', 'ABSENT', 'ON_LEAVE', 'REST_DAY', 'HOLIDAY']
const STATUS_COLORS  = {
  PRESENT:  { bg: '#DCFCE7', color: '#15803D', label: 'Present' },
  LATE:     { bg: '#FEF3C7', color: '#B45309', label: 'Late' },
  HALF_DAY: { bg: '#DBEAFE', color: '#1D4ED8', label: 'Half Day' },
  ABSENT:   { bg: '#FEE2E2', color: '#DC2626', label: 'Absent' },
  ON_LEAVE: { bg: '#F3E8FF', color: '#7C3AED', label: 'On Leave' },
  REST_DAY: { bg: '#F1F5F9', color: '#64748B', label: 'Rest Day' },
  HOLIDAY:  { bg: '#FFF7ED', color: '#C2410C', label: 'Holiday' }
}

function padDatePart(v) { return String(v).padStart(2, '0') }
function toDateInputValue(value) {
  if (!value) return ''
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getFullYear()}-${padDatePart(value.getMonth() + 1)}-${padDatePart(value.getDate())}`
  }
  const text = String(value).trim()
  if (!text) return ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text
  const parsed = new Date(text)
  if (!Number.isNaN(parsed.getTime())) {
    return `${parsed.getFullYear()}-${padDatePart(parsed.getMonth() + 1)}-${padDatePart(parsed.getDate())}`
  }
  return text.slice(0, 10)
}
function todayStr() { return toDateInputValue(new Date()) }
function fmtDate(v) {
  const normalized = toDateInputValue(v)
  if (!normalized) return '-'
  const parsed = new Date(`${normalized}T00:00:00`)
  if (Number.isNaN(parsed.getTime())) return normalized
  return parsed.toLocaleDateString('en-PH', { month: 'short', day: '2-digit', year: 'numeric' })
}
function fmtTime(v) { return v ? String(v).slice(0, 5) : '-' }
function fmtHours(v) {
  const h = Number(v || 0)
  if (!h) return '-'
  const hrs  = Math.floor(h)
  const mins = Math.round((h - hrs) * 60)
  return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`
}
function fmtMins(v) {
  const m = Number(v || 0)
  if (!m) return '-'
  const h = Math.floor(m / 60)
  const r = m % 60
  return h > 0 ? `${h}h ${r}m` : `${r}m`
}

function defaultForm(employeeId = '') {
  return {
    employee_id: String(employeeId),
    date: todayStr(),
    clock_in: '',
    clock_out: '',
    expected_clock_in: '08:00',
    expected_clock_out: '17:00',
    status: 'PRESENT',
    late_minutes: '',
    undertime_minutes: '',
    overtime_minutes: '',
    notes: ''
  }
}

function StatusBadge({ status }) {
  const cfg = STATUS_COLORS[status] || { bg: '#F1F5F9', color: '#64748B', label: status }
  return (
    <span style={{
      display: 'inline-block', padding: '2px 10px', borderRadius: 20,
      fontSize: 12, fontWeight: 600, background: cfg.bg, color: cfg.color
    }}>
      {cfg.label}
    </span>
  )
}

export default function Attendance() {
  const permissions = useSelector((s) =>
    s.auth?.permissions || JSON.parse(localStorage.getItem('permissions') || '[]')
  )
  const can = (perms) => {
    if (!Array.isArray(permissions)) return false
    if (permissions.includes('admin.*')) return true
    return perms.some((p) => permissions.includes(p))
  }
  const canView   = can(['attendance.view', 'payroll.view', 'payroll.period.view', 'attendance.manage', 'payroll.input.update'])
  const canManage = can(['attendance.manage', 'payroll.input.update'])

  const [employees,   setEmployees]   = useState([])
  const [records,     setRecords]     = useState([])
  const [total,       setTotal]       = useState(0)
  const [loading,     setLoading]     = useState(false)
  const [submitting,  setSubmitting]  = useState(false)
  const [error,       setError]       = useState(null)
  const [success,     setSuccess]     = useState(null)
  const [editingId,   setEditingId]   = useState(null)
  const [form,        setForm]        = useState(defaultForm)
  const [syncing,     setSyncing]     = useState(false)

  const [filters, setFilters] = useState({
    employee_id: '', from: todayStr(), to: todayStr(), status: '', page: 1
  })

  const showMsg = (msg) => { setSuccess(msg); setTimeout(() => setSuccess(null), 4000) }
  const clearMsg = () => { setError(null); setSuccess(null) }

  const loadEmployees = useCallback(async () => {
    try {
      const res = await api.get('/employees')
      const data = Array.isArray(res.data) ? res.data : (res.data?.data || [])
      setEmployees(data.filter((e) => e.employment_status !== 'TERMINATED'))
    } catch { setEmployees([]) }
  }, [])

  const loadRecords = useCallback(async (f = filters) => {
    if (!canView) return
    try {
      setLoading(true)
      const params = new URLSearchParams({ limit: 200, page: f.page || 1 })
      if (f.employee_id) params.set('employee_id', f.employee_id)
      if (f.from)        params.set('from', f.from)
      if (f.to)          params.set('to', f.to)
      if (f.status)      params.set('status', f.status)
      const res = await api.get(`/attendance?${params}`)
      setRecords(Array.isArray(res.data?.data) ? res.data.data : (Array.isArray(res.data) ? res.data : []))
      setTotal(res.data?.total || 0)
    } catch (err) {
      setError(err?.response?.data?.error || 'Failed to load attendance records')
    } finally {
      setLoading(false)
    }
  }, [canView, filters])

  useEffect(() => { loadEmployees() }, [loadEmployees])
  useEffect(() => { loadRecords() }, [loadRecords])

  function startEdit(row) {
    clearMsg()
    setEditingId(row.id)
    setForm({
      employee_id:       String(row.employee_id || ''),
      date:              toDateInputValue(row.date),
      clock_in:          fmtTime(row.clock_in) === '-' ? '' : fmtTime(row.clock_in),
      clock_out:         fmtTime(row.clock_out) === '-' ? '' : fmtTime(row.clock_out),
      expected_clock_in: fmtTime(row.expected_clock_in) === '-' ? '08:00' : fmtTime(row.expected_clock_in),
      expected_clock_out:fmtTime(row.expected_clock_out) === '-' ? '17:00' : fmtTime(row.expected_clock_out),
      status:            row.status || 'PRESENT',
      late_minutes:      String(row.late_minutes || ''),
      undertime_minutes: String(row.undertime_minutes || ''),
      overtime_minutes:  String(row.overtime_minutes || ''),
      notes:             row.notes || ''
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function resetForm() { setEditingId(null); setForm(defaultForm()); clearMsg() }

  async function handleSubmit(e) {
    e.preventDefault(); clearMsg()
    if (!form.employee_id) return setError('Employee is required')
    if (!form.date)        return setError('Date is required')

    const payload = {
      employee_id:        Number(form.employee_id),
      date:               form.date,
      clock_in:           form.clock_in  || null,
      clock_out:          form.clock_out || null,
      expected_clock_in:  form.expected_clock_in  || null,
      expected_clock_out: form.expected_clock_out || null,
      status:             form.status,
      late_minutes:       form.late_minutes      ? Number(form.late_minutes)      : undefined,
      undertime_minutes:  form.undertime_minutes ? Number(form.undertime_minutes) : undefined,
      overtime_minutes:   form.overtime_minutes  ? Number(form.overtime_minutes)  : undefined,
      notes:              form.notes || null
    }

    try {
      setSubmitting(true)
      if (editingId) {
        await api.put(`/attendance/${editingId}`, payload)
        showMsg('Attendance record updated.')
      } else {
        await api.post('/attendance', payload)
        showMsg('Attendance record saved.')
      }
      resetForm()
      await loadRecords(filters)
    } catch (err) {
      setError(err?.response?.data?.error || 'Failed to save attendance record')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete(row) {
    if (!window.confirm(`Delete attendance record for ${row.employee_name || row.employee_id} on ${fmtDate(row.date)}?`)) return
    clearMsg()
    try {
      await api.delete(`/attendance/${row.id}`)
      showMsg('Record deleted.')
      await loadRecords(filters)
    } catch (err) {
      setError(err?.response?.data?.error || 'Failed to delete record')
    }
  }

  async function handleSyncToPayroll() {
    if (!filters.from || !filters.to) return setError('Set a date range first to sync attendance to payroll.')
    const periods = prompt(`Enter the Payroll Period ID to sync attendance (${filters.from} → ${filters.to}) into:`)
    if (!periods) return
    try {
      setSyncing(true); clearMsg()
      const res = await api.post(`/api/payroll/periods/${periods.trim()}/inputs/sync-attendance`)
      const feedback = buildAttendanceSyncFeedback(res.data || {})
      if (feedback.isError) setError(feedback.message)
      else showMsg(feedback.message)
    } catch (err) {
      setError(err?.response?.data?.error || 'Sync failed')
    } finally {
      setSyncing(false)
    }
  }

  const summaryStats = useMemo(() => {
    const stats = { PRESENT: 0, LATE: 0, ABSENT: 0, HALF_DAY: 0, ON_LEAVE: 0, REST_DAY: 0, HOLIDAY: 0 }
    records.forEach((r) => { if (stats[r.status] !== undefined) stats[r.status]++ })
    return stats
  }, [records])

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Attendance</h1>
          <p className="page-subtitle">Track employee time-in / time-out and sync to payroll.</p>
        </div>
        {canManage && (
          <button
            className="btn btn-secondary"
            type="button"
            onClick={handleSyncToPayroll}
            disabled={syncing}
            style={{ display: 'flex', alignItems: 'center', gap: 8 }}
          >
            {syncing ? 'Syncing…' : '⟳ Sync to Payroll Period'}
          </button>
        )}
      </div>

      {error   && <div className="error-msg"   style={{ marginBottom: 14 }}>{error}</div>}
      {success && <div className="success-msg" style={{ marginBottom: 14 }}>{success}</div>}

      {/* Summary Stats */}
      {records.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 20 }}>
          {Object.entries(summaryStats).filter(([, v]) => v > 0).map(([status, count]) => {
            const cfg = STATUS_COLORS[status]
            return (
              <div key={status} style={{
                background: cfg.bg, color: cfg.color,
                borderRadius: 10, padding: '8px 16px',
                fontWeight: 700, fontSize: 14
              }}>
                {cfg.label}: {count}
              </div>
            )
          })}
        </div>
      )}

      {/* Filters */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-header"><h3>Filters</h3>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-secondary btn-sm" onClick={() => { const f = { employee_id: '', from: todayStr(), to: todayStr(), status: '', page: 1 }; setFilters(f); loadRecords(f) }}>Clear</button>
            <button className="btn btn-primary btn-sm" onClick={() => loadRecords(filters)} disabled={loading}>{loading ? 'Loading…' : 'Search'}</button>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Employee</label>
            <select className="form-input" value={filters.employee_id}
              onChange={(e) => setFilters((p) => ({ ...p, employee_id: e.target.value }))}>
              <option value="">All Employees</option>
              {employees.map((emp) => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">From</label>
            <input className="form-input" type="date" value={filters.from}
              onChange={(e) => setFilters((p) => ({ ...p, from: e.target.value }))} />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">To</label>
            <input className="form-input" type="date" value={filters.to}
              onChange={(e) => setFilters((p) => ({ ...p, to: e.target.value }))} />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Status</label>
            <select className="form-input" value={filters.status}
              onChange={(e) => setFilters((p) => ({ ...p, status: e.target.value }))}>
              <option value="">All Statuses</option>
              {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{STATUS_COLORS[s]?.label || s}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Entry Form */}
      {canManage && (
        <div className="card" style={{ marginBottom: 14 }}>
          <div className="card-header">
            <h3>{editingId ? 'Edit Attendance Record' : 'Add Attendance Record'}</h3>
            {editingId && <button className="btn btn-secondary btn-sm" onClick={resetForm}>Cancel Edit</button>}
          </div>
          <form onSubmit={handleSubmit}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Employee *</label>
                <select className="form-input" required value={form.employee_id}
                  onChange={(e) => setForm((p) => ({ ...p, employee_id: e.target.value }))}>
                  <option value="">— Select —</option>
                  {employees.map((emp) => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Date *</label>
                <input className="form-input" type="date" required value={form.date}
                  onChange={(e) => setForm((p) => ({ ...p, date: e.target.value }))} />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Status</label>
                <select className="form-input" value={form.status}
                  onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))}>
                  {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{STATUS_COLORS[s]?.label || s}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Clock In</label>
                <input className="form-input" type="time" value={form.clock_in}
                  onChange={(e) => setForm((p) => ({ ...p, clock_in: e.target.value }))} />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Clock Out</label>
                <input className="form-input" type="time" value={form.clock_out}
                  onChange={(e) => setForm((p) => ({ ...p, clock_out: e.target.value }))} />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Expected In</label>
                <input className="form-input" type="time" value={form.expected_clock_in}
                  onChange={(e) => setForm((p) => ({ ...p, expected_clock_in: e.target.value }))} />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Expected Out</label>
                <input className="form-input" type="time" value={form.expected_clock_out}
                  onChange={(e) => setForm((p) => ({ ...p, expected_clock_out: e.target.value }))} />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Late (mins) override</label>
                <input className="form-input" type="number" min={0} value={form.late_minutes}
                  onChange={(e) => setForm((p) => ({ ...p, late_minutes: e.target.value }))}
                  placeholder="Auto-computed" />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Undertime (mins) override</label>
                <input className="form-input" type="number" min={0} value={form.undertime_minutes}
                  onChange={(e) => setForm((p) => ({ ...p, undertime_minutes: e.target.value }))}
                  placeholder="Auto-computed" />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Overtime (mins) override</label>
                <input className="form-input" type="number" min={0} value={form.overtime_minutes}
                  onChange={(e) => setForm((p) => ({ ...p, overtime_minutes: e.target.value }))}
                  placeholder="Auto-computed" />
              </div>
              <div className="form-group" style={{ gridColumn: '1 / -1', marginBottom: 0 }}>
                <label className="form-label">Notes</label>
                <input className="form-input" value={form.notes}
                  onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
              <button className="btn btn-primary" type="submit" disabled={submitting}>
                {submitting ? 'Saving…' : editingId ? 'Update Record' : 'Save Record'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Records Table */}
      <div className="card">
        <div className="card-header">
          <h3>Records {total > 0 ? `(${total})` : ''}</h3>
        </div>
        <div className="table-wrap responsive">
          <table>
            <thead>
              <tr>
                <th>Employee</th>
                <th>Date</th>
                <th>Status</th>
                <th>Clock In</th>
                <th>Clock Out</th>
                <th>Hours</th>
                <th>Late</th>
                <th>Undertime</th>
                <th>Overtime</th>
                {canManage && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {records.length === 0 ? (
                <tr><td colSpan={canManage ? 10 : 9} style={{ textAlign: 'center', color: 'var(--text-light)', padding: 32 }}>
                  {loading ? 'Loading…' : 'No records found. Adjust filters or add new records.'}
                </td></tr>
              ) : records.map((row) => (
                <tr key={row.id}>
                  <td style={{ fontWeight: 600 }}>{row.employee_name || `Employee #${row.employee_id}`}</td>
                  <td>{fmtDate(row.date)}</td>
                  <td><StatusBadge status={row.status} /></td>
                  <td style={{ fontFamily: 'monospace', fontSize: 13 }}>{fmtTime(row.clock_in)}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: 13 }}>{fmtTime(row.clock_out)}</td>
                  <td>{fmtHours(row.hours_worked)}</td>
                  <td style={{ color: Number(row.late_minutes) > 0 ? 'var(--warning)' : undefined }}>{fmtMins(row.late_minutes)}</td>
                  <td style={{ color: Number(row.undertime_minutes) > 0 ? 'var(--warning)' : undefined }}>{fmtMins(row.undertime_minutes)}</td>
                  <td style={{ color: Number(row.overtime_minutes) > 0 ? 'var(--success)' : undefined }}>{fmtMins(row.overtime_minutes)}</td>
                  {canManage && (
                    <td>
                      <div className="table-actions">
                        <button className="btn btn-outline btn-sm" onClick={() => startEdit(row)}>Edit</button>
                        <button className="btn btn-danger btn-sm" onClick={() => handleDelete(row)}>Delete</button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
