import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../../api/api.js'
import {
  buildAttendanceSyncFeedback,
  buildComputeSyncFeedback,
  buildLoadInputsMessage,
  formatCurrency,
  formatDate,
  getErrorMessage,
  statusBadgeClass,
  usePermissions,
  ViewOnlyBadge
} from './payrollUtils.js'

const FREQ_LABEL = { daily: 'Daily', weekly: 'Weekly', semi_monthly: 'Semi-Monthly', monthly: 'Monthly' }
const STATUS_STYLES = {
  draft:     { bg: '#F1F5F9', color: '#64748B' },
  computed:  { bg: '#DBEAFE', color: '#1D4ED8' },
  finalized: { bg: '#FEF3C7', color: '#B45309' },
  released:  { bg: '#DCFCE7', color: '#15803D' },
  void:      { bg: '#FEE2E2', color: '#DC2626' }
}
const STATUS_FILTER_OPTIONS = ['all', 'draft', 'computed', 'finalized', 'released', 'void']

function toDateInput(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function parseDateInput(value) {
  const [year, month, day] = String(value || '').split('-').map(Number)
  return new Date(year, month - 1, day || 1)
}

function endOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0)
}

function buildCutoffRange(frequency, startValue) {
  const base = parseDateInput(startValue || toDateInput(new Date()))
  if (frequency === 'daily') {
    return { start_date: toDateInput(base), end_date: toDateInput(base), payout_date: toDateInput(base) }
  }
  if (frequency === 'weekly') {
    const end = new Date(base)
    end.setDate(base.getDate() + 6)
    return { start_date: toDateInput(base), end_date: toDateInput(end), payout_date: toDateInput(end) }
  }
  if (frequency === 'monthly') {
    const start = new Date(base.getFullYear(), base.getMonth(), 1)
    const end = endOfMonth(base)
    return { start_date: toDateInput(start), end_date: toDateInput(end), payout_date: toDateInput(end) }
  }
  const start = new Date(base.getFullYear(), base.getMonth(), base.getDate() <= 15 ? 1 : 16)
  const end = base.getDate() <= 15 ? new Date(base.getFullYear(), base.getMonth(), 15) : endOfMonth(base)
  return { start_date: toDateInput(start), end_date: toDateInput(end), payout_date: toDateInput(end) }
}

function PeriodBadge({ status }) {
  const s = STATUS_STYLES[status?.toLowerCase()] || STATUS_STYLES.draft
  return (
    <span style={{ background: s.bg, color: s.color, padding: '3px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>
      {status || 'draft'}
    </span>
  )
}

function defaultPeriodForm() {
  const today = new Date()
  const range = buildCutoffRange('semi_monthly', toDateInput(today))
  return {
    code: '',
    ...range,
    frequency: 'semi_monthly', notes: '',
    _datesManuallySet: false
  }
}

function getNextStepHint(period) {
  const s = String(period.status || 'draft').toLowerCase()
  const hasEmp = Number(period.employee_count) > 0
  if (s === 'draft' && !hasEmp)  return { text: 'Start by loading employees', color: '#64748B' }
  if (s === 'draft' && hasEmp)   return { text: 'Ready to compute payroll', color: '#1D4ED8' }
  if (s === 'computed')          return { text: 'Review, then finalize', color: '#B45309' }
  if (s === 'finalized')         return { text: 'Release to notify employees', color: '#B45309' }
  if (s === 'released')          return { text: 'Payslips visible to employees', color: '#15803D' }
  if (s === 'void')              return { text: 'This period was voided', color: '#DC2626' }
  return null
}

export default function PayrollPeriods() {
  const navigate = useNavigate()
  const { canPayrollWrite } = usePermissions()
  const canWriteAny = canPayrollWrite.period || canPayrollWrite.compute
  const [periods,        setPeriods]        = useState([])
  const [form,           setForm]           = useState(defaultPeriodForm)
  const [showCreateForm, setShowCreateForm] = useState(null)
  const [statusFilter,   setStatusFilter]   = useState('all')
  const [loading,        setLoading]        = useState(false)
  const [saving,         setSaving]         = useState(false)
  const [actionId,       setActionId]       = useState(null)
  const [syncingId,      setSyncingId]      = useState(null)
  const [error,          setError]          = useState(null)
  const [success,        setSuccess]        = useState(null)

  const showMsg = (m) => { setSuccess(m); setTimeout(() => setSuccess(null), 4200) }

  async function loadPeriods() {
    try {
      setLoading(true); setError(null)
      const r = await api.get('/api/payroll/periods')
      setPeriods(r.data || [])
    } catch (err) { setError(getErrorMessage(err, 'Failed to load payroll periods.')) }
    finally { setLoading(false) }
  }

  useEffect(() => { loadPeriods() }, [])

  // Auto-expand form only on first load when no periods exist
  useEffect(() => {
    if (showCreateForm === null && !loading) {
      setShowCreateForm(periods.length === 0 && canPayrollWrite.period)
    }
  }, [periods.length, loading]) // eslint-disable-line

  async function createPeriod(e) {
    e.preventDefault(); setSaving(true); setError(null); setSuccess(null)
    try {
      await api.post('/api/payroll/periods', { code: form.code || undefined, start_date: form.start_date, end_date: form.end_date, payout_date: form.payout_date, frequency: form.frequency, notes: form.notes || null })
      setForm(defaultPeriodForm())
      setShowCreateForm(false)
      showMsg('Payroll period created.')
      await loadPeriods()
    } catch (err) { setError(getErrorMessage(err, 'Failed to create the payroll period.')) }
    finally { setSaving(false) }
  }

  async function loadInputs(period) {
    setActionId(period.id); setError(null)
    try {
      const r = await api.post(`/api/payroll/periods/${period.id}/load-inputs`)
      const message = buildLoadInputsMessage(r.data || {})
      const inputCount = Number(r.data?.period?.inputs?.length || 0)
      if (inputCount > 0) {
        showMsg(message)
        navigate(`/payroll/periods/${period.id}/inputs`)
      } else {
        setError(message)
        await loadPeriods()
      }
    }
    catch (err) { setError(getErrorMessage(err, 'Failed to load payroll inputs.')) }
    finally { setActionId(null) }
  }

  async function syncAttendance(period) {
    setSyncingId(period.id); setError(null)
    try {
      const r = await api.post(`/api/payroll/periods/${period.id}/inputs/sync-attendance`)
      const feedback = buildAttendanceSyncFeedback(r.data || {})
      if (feedback.isError) setError(feedback.message)
      else showMsg(feedback.message)
      await loadPeriods()
    } catch (err) { setError(getErrorMessage(err, 'Attendance sync failed.')) }
    finally { setSyncingId(null) }
  }

  async function compute(period) {
    setActionId(period.id); setError(null)
    try {
      const r = await api.post(`/api/payroll/periods/${period.id}/compute`)
      const feedback = buildComputeSyncFeedback(r.data?.sync_summary || {})
      navigate(`/payroll/periods/${period.id}/preview`, {
        state: feedback.isWarning
          ? { flashWarning: feedback.message }
          : { flashSuccess: feedback.message }
      })
    }
    catch (err) { setError(getErrorMessage(err, 'Failed to compute the payroll.')) }
    finally { setActionId(null) }
  }

  async function deletePeriod(period) {
    if (!window.confirm(`Delete draft period "${period.code}"? This cannot be undone.`)) return
    setActionId(period.id); setError(null)
    try {
      await api.delete(`/api/payroll/periods/${period.id}`)
      showMsg(`Period "${period.code}" deleted.`)
      await loadPeriods()
    } catch (err) { setError(getErrorMessage(err, 'Failed to delete the payroll period.')) }
    finally { setActionId(null) }
  }

  const locked = (p) => ['finalized', 'released', 'void'].includes(String(p.status || '').toLowerCase())

  const overlappingIds = useMemo(() => {
    const active = periods.filter((p) => String(p.status || '').toLowerCase() !== 'void')
    const ids = new Set()
    for (let i = 0; i < active.length; i++) {
      for (let j = i + 1; j < active.length; j++) {
        const a = active[i], b = active[j]
        if (a.frequency === b.frequency && a.start_date <= b.end_date && a.end_date >= b.start_date) {
          ids.add(a.id); ids.add(b.id)
        }
      }
    }
    return ids
  }, [periods])

  const filteredPeriods = useMemo(() =>
    statusFilter === 'all' ? periods : periods.filter((p) => String(p.status || 'draft').toLowerCase() === statusFilter),
    [periods, statusFilter]
  )

  const statusCounts = useMemo(() => {
    const counts = { all: periods.length }
    for (const s of ['draft', 'computed', 'finalized', 'released', 'void'])
      counts[s] = periods.filter((p) => String(p.status || 'draft').toLowerCase() === s).length
    return counts
  }, [periods])

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">
            Payroll Periods
            {!canWriteAny && <span style={{ marginLeft: 10 }}><ViewOnlyBadge /></span>}
          </h1>
          <p className="page-subtitle">
            {canWriteAny
              ? 'Create payroll cutoffs, load employees, and compute payroll.'
              : 'Browse payroll cutoffs and computed runs. Only admins can create or compute periods.'}
          </p>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={loadPeriods} disabled={loading}>↺ Refresh</button>
      </div>

      {error   && <div className="error-msg"   style={{ marginBottom: 14 }}>{error}</div>}
      {success && <div className="success-msg" style={{ marginBottom: 14 }}>{success}</div>}

      {!canWriteAny && (
        <div className="payroll-view-only-banner">
          You are viewing payroll in read-only mode. Period creation, attendance sync, and compute are restricted to administrators.
        </div>
      )}

      {/* Create Period — collapsible */}
      {canPayrollWrite.period && (
        <div style={{ marginBottom: 20 }}>
          {!showCreateForm ? (
            <button className="btn btn-primary" onClick={() => setShowCreateForm(true)}>
              ＋ New Payroll Period
            </button>
          ) : (
            <div className="card">
              <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3>Create Payroll Period</h3>
                <button className="btn btn-secondary btn-sm" type="button" onClick={() => setShowCreateForm(false)}>✕ Cancel</button>
              </div>
              <form onSubmit={createPeriod}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Period Code</label>
                    <input className="form-input" value={form.code} onChange={(e) => setForm((p) => ({ ...p, code: e.target.value }))} placeholder="Auto-generated if blank" />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Start Date *</label>
                    <input className="form-input" type="date" required value={form.start_date}
                      onChange={(e) => {
                        const newStart = e.target.value
                        setForm((p) => {
                          if (p._datesManuallySet) return { ...p, start_date: newStart, _datesManuallySet: true }
                          const suggested = buildCutoffRange(p.frequency, newStart)
                          return { ...p, ...suggested, _datesManuallySet: false }
                        })
                      }} />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">End Date *</label>
                    <input className="form-input" type="date" required value={form.end_date}
                      onChange={(e) => setForm((p) => ({ ...p, end_date: e.target.value, _datesManuallySet: true }))} />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Payout Date *</label>
                    <input className="form-input" type="date" required value={form.payout_date}
                      onChange={(e) => setForm((p) => ({ ...p, payout_date: e.target.value, _datesManuallySet: true }))} />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Frequency</label>
                    <select className="form-input" value={form.frequency}
                      onChange={(e) => {
                        const newFreq = e.target.value
                        setForm((p) => {
                          if (p._datesManuallySet) return { ...p, frequency: newFreq }
                          const suggested = buildCutoffRange(newFreq, p.start_date)
                          return { ...p, frequency: newFreq, ...suggested }
                        })
                      }}>
                      <option value="daily">Daily</option>
                      <option value="weekly">Weekly</option>
                      <option value="semi_monthly">Semi-Monthly</option>
                      <option value="monthly">Monthly</option>
                    </select>
                    {form.frequency === 'monthly' && (
                      <div style={{ marginTop: 6, fontSize: 12, color: 'var(--warning-dark, #B45309)' }}>
                        Monthly payroll is only for employees whose policy permits a full-month payout. Semi-monthly is the safer default.
                      </div>
                    )}
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Notes</label>
                    <input className="form-input" value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} />
                  </div>
                </div>
                <div style={{ marginTop: 14, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                  <button className="btn btn-secondary" type="button" onClick={() => setShowCreateForm(false)}>Cancel</button>
                  <button className="btn btn-primary" type="submit" disabled={saving}>{saving ? 'Creating…' : 'Create Period'}</button>
                </div>
              </form>
            </div>
          )}
        </div>
      )}

      {/* Overlap warning */}
      {overlappingIds.size > 0 && (
        <div className="warning-msg" style={{ marginBottom: 14 }}>
          <strong>Overlapping periods detected.</strong> {overlappingIds.size} period(s) marked below share the same frequency and date range. Employees may have been counted twice. Void the duplicate periods to correct this.
        </div>
      )}

      {/* Status filter tabs */}
      <div style={{ marginBottom: 10 }}>
        <div className="payroll-period-tabs">
          {STATUS_FILTER_OPTIONS.map((s) => (
            <button
              key={s}
              type="button"
              className={`payroll-period-tab${statusFilter === s ? ' payroll-period-tab-active' : ''}`}
              onClick={() => setStatusFilter(s)}
            >
              {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
              {statusCounts[s] > 0 && <span className="payroll-period-tab-count">{statusCounts[s]}</span>}
            </button>
          ))}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-light)', marginTop: 6 }}>
          {loading ? 'Loading…' : `${filteredPeriods.length} of ${periods.length} period${periods.length === 1 ? '' : 's'}`}
        </div>
      </div>

      {filteredPeriods.length === 0 && !loading ? (
        <div className="card entity-empty">
          <div className="entity-empty-icon" style={{ background: 'var(--gold-light)', color: 'var(--gold-dark)' }}>
            <span style={{ fontFamily: 'Nunito', fontWeight: 800, fontSize: 18 }}>P</span>
          </div>
          <div className="entity-empty-title">
            {statusFilter === 'all' ? 'No payroll periods yet' : `No ${statusFilter} periods`}
          </div>
          <div className="entity-empty-sub">
            {statusFilter !== 'all'
              ? `There are no ${statusFilter} periods to show.`
              : canPayrollWrite.period
                ? 'Click "＋ New Payroll Period" above to create your first payroll cutoff.'
                : 'Once an admin creates a payroll cutoff, it will appear here.'}
          </div>
        </div>
      ) : (
        <div className="period-card-grid">
          {filteredPeriods.map((period) => {
            const status = String(period.status || 'draft').toLowerCase()
            const isLocked = locked(period)
            const hint = getNextStepHint(period)
            const canDelete = canPayrollWrite.period &&
              status === 'draft' &&
              (!period.latest_run_id || String(period.latest_run_status || '').toLowerCase() === 'draft')

            return (
              <div key={period.id} className={`period-card status-${status}`} style={overlappingIds.has(period.id) ? { outline: '2px solid #f59e0b', outlineOffset: -2 } : {}}>
                <div className="period-card-head">
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="period-card-code" title={period.code}>{period.code}</div>
                    <div className="period-card-dates">
                      {formatDate(period.start_date)} — {formatDate(period.end_date)}
                    </div>
                    {overlappingIds.has(period.id) && (
                      <div style={{ fontSize: 11, color: '#b45309', fontWeight: 600, marginTop: 2 }}>
                        Overlapping — may double-count employees
                      </div>
                    )}
                  </div>
                  <PeriodBadge status={period.status} />
                </div>

                {hint && (
                  <div className="period-card-hint" style={{ color: hint.color }}>{hint.text}</div>
                )}

                <div className="period-card-body">
                  <div className="period-card-row">
                    <span className="period-card-row-label">Frequency</span>
                    <span className="period-card-row-value">{FREQ_LABEL[period.frequency] || period.frequency}</span>
                  </div>
                  <div className="period-card-row">
                    <span className="period-card-row-label">Payout</span>
                    <span className="period-card-row-value">{formatDate(period.payout_date)}</span>
                  </div>
                  <div className="period-card-stats">
                    <div className="period-card-stat">
                      <span className="period-card-stat-label">Employees</span>
                      <span className="period-card-stat-value">{period.employee_count > 0 ? period.employee_count : '—'}</span>
                    </div>
                    <div className="period-card-stat tone-gold">
                      <span className="period-card-stat-label">Net Pay</span>
                      <span className="period-card-stat-value">{period.total_net_pay > 0 ? formatCurrency(period.total_net_pay) : '—'}</span>
                    </div>
                  </div>
                </div>

                <div className="period-card-actions">
                  {/* Inputs — always available */}
                  <button className="btn btn-secondary btn-sm" onClick={() => navigate(`/payroll/periods/${period.id}/inputs`)}>
                    Inputs
                  </button>

                  {/* Smart primary action */}
                  {!isLocked && canPayrollWrite.compute && (
                    Number(period.employee_count) > 0 ? (
                      <>
                        <button
                          className="btn btn-primary btn-sm"
                          onClick={() => compute(period)}
                          disabled={actionId === period.id}
                        >
                          {actionId === period.id ? 'Computing…' : 'Compute →'}
                        </button>
                        <button
                          className="btn btn-outline btn-sm"
                          title="Re-sync attendance data before computing"
                          onClick={() => syncAttendance(period)}
                          disabled={syncingId === period.id}
                        >
                          {syncingId === period.id ? 'Syncing…' : 'Re-sync'}
                        </button>
                      </>
                    ) : (
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={() => loadInputs(period)}
                        disabled={actionId === period.id}
                      >
                        {actionId === period.id ? 'Loading…' : 'Load Employees'}
                      </button>
                    )
                  )}

                  {/* View run */}
                  {period.latest_run_id && (
                    <button className="btn btn-outline btn-sm" onClick={() => navigate(`/payroll/periods/${period.id}/preview`)}>
                      View Run →
                    </button>
                  )}

                  {/* Delete draft — destructive, pushed right */}
                  {canDelete && (
                    <button
                      className="btn btn-danger btn-sm"
                      style={{ marginLeft: 'auto' }}
                      onClick={() => deletePeriod(period)}
                      disabled={actionId === period.id}
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Workflow guide */}
      <div className="card" style={{ marginTop: 20, background: 'var(--cream-white)', border: '1px solid var(--border-light)' }}>
        <div className="card-header"><h3>Payroll Workflow</h3></div>
        <div style={{ display: 'flex', gap: 0, overflowX: 'auto', paddingBottom: 4 }}>
          {[
            { step: '1', label: 'Create Period', desc: 'Set start/end dates and frequency' },
            { step: '2', label: 'Record Attendance', desc: 'Go to Attendance → add time-in/out records' },
            { step: '3', label: 'Load Employees', desc: 'Creates payroll input rows for all active employees' },
            { step: '4', label: 'Edit Inputs', desc: 'Adjust bonuses, loans, and manual payroll fields' },
            { step: '5', label: 'Compute', desc: 'Syncs attendance then runs all statutory deductions' },
            { step: '6', label: 'Finalize', desc: 'Lock the run before releasing' },
            { step: '7', label: 'Release', desc: 'Payslips become visible to employees' }
          ].map((item, i, arr) => (
            <div key={item.step} style={{ display: 'flex', alignItems: 'center', minWidth: 'fit-content' }}>
              <div style={{ textAlign: 'center', padding: '10px 16px' }}>
                <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--gold)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14, margin: '0 auto 6px' }}>{item.step}</div>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-dark)' }}>{item.label}</div>
                <div style={{ fontSize: 11, color: 'var(--text-light)', maxWidth: 110 }}>{item.desc}</div>
              </div>
              {i < arr.length - 1 && <div style={{ color: 'var(--gold)', fontSize: 20, paddingBottom: 20 }}>→</div>}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
