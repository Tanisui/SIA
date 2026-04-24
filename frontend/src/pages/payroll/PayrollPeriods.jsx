import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../../api/api.js'
import {
  buildAttendanceSyncFeedback,
  buildComputeSyncFeedback,
  buildLoadInputsMessage,
  formatCurrency,
  formatDate,
  getErrorMessage,
  statusBadgeClass
} from './payrollUtils.js'

const FREQ_LABEL = { weekly: 'Weekly', semi_monthly: 'Semi-Monthly', monthly: 'Monthly' }
const STATUS_STYLES = {
  draft:     { bg: '#F1F5F9', color: '#64748B' },
  computed:  { bg: '#DBEAFE', color: '#1D4ED8' },
  finalized: { bg: '#FEF3C7', color: '#B45309' },
  released:  { bg: '#DCFCE7', color: '#15803D' },
  void:      { bg: '#FEE2E2', color: '#DC2626' }
}

function PeriodBadge({ status }) {
  const s = STATUS_STYLES[status?.toLowerCase()] || STATUS_STYLES.draft
  return (
    <span style={{ background: s.bg, color: s.color, padding: '3px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
      {status || 'draft'}
    </span>
  )
}

function defaultPeriodForm() {
  const today = new Date()
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() <= 15 ? 1 : 16)
  const end   = new Date(today.getFullYear(), today.getMonth() + (today.getDate() <= 15 ? 0 : 1), today.getDate() <= 15 ? 15 : 0)
  return {
    code: '', start_date: start.toISOString().slice(0, 10),
    end_date: end.toISOString().slice(0, 10), payout_date: end.toISOString().slice(0, 10),
    frequency: 'semi_monthly', notes: ''
  }
}

export default function PayrollPeriods() {
  const navigate = useNavigate()
  const [periods,   setPeriods]   = useState([])
  const [form,      setForm]      = useState(defaultPeriodForm)
  const [loading,   setLoading]   = useState(false)
  const [saving,    setSaving]    = useState(false)
  const [actionId,  setActionId]  = useState(null)
  const [syncingId, setSyncingId] = useState(null)
  const [error,     setError]     = useState(null)
  const [success,   setSuccess]   = useState(null)

  const showMsg = (m) => { setSuccess(m); setTimeout(() => setSuccess(null), 4200) }

  async function loadPeriods() {
    try { setLoading(true); setError(null); const r = await api.get('/api/payroll/periods'); setPeriods(r.data || []) }
    catch (err) { setError(getErrorMessage(err, 'Failed to load payroll periods')) }
    finally { setLoading(false) }
  }

  useEffect(() => { loadPeriods() }, [])

  async function createPeriod(e) {
    e.preventDefault(); setSaving(true); setError(null); setSuccess(null)
    try {
      await api.post('/api/payroll/periods', { code: form.code || undefined, start_date: form.start_date, end_date: form.end_date, payout_date: form.payout_date, frequency: form.frequency, notes: form.notes || null })
      setForm(defaultPeriodForm()); showMsg('Payroll period created.')
      await loadPeriods()
    } catch (err) { setError(getErrorMessage(err, 'Failed to create payroll period')) }
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
    catch (err) { setError(getErrorMessage(err, 'Failed to load payroll inputs')) }
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
    } catch (err) { setError(getErrorMessage(err, 'Attendance sync failed')) }
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
    catch (err) { setError(getErrorMessage(err, 'Failed to compute payroll')) }
    finally { setActionId(null) }
  }

  const locked = (p) => ['finalized', 'released', 'void'].includes(String(p.status || '').toLowerCase())

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Payroll Periods</h1>
          <p className="page-subtitle">Create payroll cutoffs, load profiles, and compute payroll. Compute refreshes attendance before deductions are applied.</p>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={loadPeriods} disabled={loading}>↺ Refresh</button>
      </div>

      {error   && <div className="error-msg"   style={{ marginBottom: 14 }}>{error}</div>}
      {success && <div className="success-msg" style={{ marginBottom: 14 }}>{success}</div>}

      {/* Create Period Card */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header">
          <h3>Create Payroll Period</h3>
        </div>
        <form onSubmit={createPeriod}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Period Code</label>
              <input className="form-input" value={form.code} onChange={(e) => setForm((p) => ({ ...p, code: e.target.value }))} placeholder="Auto-generated if blank" />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Start Date *</label>
              <input className="form-input" type="date" required value={form.start_date} onChange={(e) => setForm((p) => ({ ...p, start_date: e.target.value }))} />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">End Date *</label>
              <input className="form-input" type="date" required value={form.end_date} onChange={(e) => setForm((p) => ({ ...p, end_date: e.target.value }))} />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Payout Date *</label>
              <input className="form-input" type="date" required value={form.payout_date} onChange={(e) => setForm((p) => ({ ...p, payout_date: e.target.value }))} />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Frequency</label>
              <select className="form-input" value={form.frequency} onChange={(e) => setForm((p) => ({ ...p, frequency: e.target.value }))}>
                <option value="weekly">Weekly</option>
                <option value="semi_monthly">Semi-Monthly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Notes</label>
              <input className="form-input" value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} />
            </div>
          </div>
          <div style={{ marginTop: 14, display: 'flex', justifyContent: 'flex-end' }}>
            <button className="btn btn-primary" type="submit" disabled={saving}>{saving ? 'Creating…' : 'Create Period'}</button>
          </div>
        </form>
      </div>

      {/* Periods table */}
      <div className="card">
        <div className="card-header"><h3>Payroll Cutoffs ({periods.length})</h3></div>
        <div className="table-wrap responsive">
          <table>
            <thead><tr>
              <th>Period Code</th><th>Dates</th><th>Frequency</th><th>Status</th>
              <th style={{ textAlign: 'right' }}>Employees</th>
              <th style={{ textAlign: 'right' }}>Net Pay</th>
              <th>Actions</th>
            </tr></thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} style={{ textAlign: 'center', padding: 32, color: 'var(--text-light)' }}>Loading…</td></tr>
              ) : periods.length === 0 ? (
                <tr><td colSpan={7} style={{ textAlign: 'center', padding: 32, color: 'var(--text-light)' }}>No payroll periods yet. Create one above.</td></tr>
              ) : periods.map((period) => (
                <tr key={period.id}>
                  <td>
                    <span style={{ fontWeight: 700 }}>{period.code}</span>
                    <div style={{ fontSize: 12, color: 'var(--text-light)', marginTop: 2 }}>Payout: {formatDate(period.payout_date)}</div>
                  </td>
                  <td style={{ fontSize: 13 }}>{formatDate(period.start_date)} — {formatDate(period.end_date)}</td>
                  <td style={{ fontSize: 13 }}>{FREQ_LABEL[period.frequency] || period.frequency}</td>
                  <td><PeriodBadge status={period.status} /></td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>{period.employee_count > 0 ? period.employee_count : '-'}</td>
                  <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--gold-dark)' }}>{period.total_net_pay > 0 ? formatCurrency(period.total_net_pay) : '-'}</td>
                  <td>
                    <div className="table-actions" style={{ flexWrap: 'wrap' }}>
                      <button className="btn btn-secondary btn-sm" onClick={() => navigate(`/payroll/periods/${period.id}/inputs`)} title="View/Edit Inputs">
                        Inputs
                      </button>
                      {!locked(period) && (
                        <button className="btn btn-outline btn-sm" onClick={() => syncAttendance(period)} disabled={syncingId === period.id} title="Sync attendance records for this period">
                          {syncingId === period.id ? '⟳ Syncing…' : '⟳ Sync Attendance'}
                        </button>
                      )}
                      {!locked(period) && (
                        <button className="btn btn-outline btn-sm" onClick={() => loadInputs(period)} disabled={actionId === period.id}>
                          {actionId === period.id ? '…' : 'Load Profiles'}
                        </button>
                      )}
                      {!locked(period) && (
                        <button className="btn btn-primary btn-sm" onClick={() => compute(period)} disabled={actionId === period.id}>
                          {actionId === period.id ? 'Computing…' : 'Compute'}
                        </button>
                      )}
                      {period.latest_run_id && (
                        <button className="btn btn-outline btn-sm" onClick={() => navigate(`/payroll/periods/${period.id}/preview`)}>
                          Preview
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Workflow guide */}
      <div className="card" style={{ marginTop: 20, background: 'var(--cream-white)', border: '1px solid var(--border-light)' }}>
        <div className="card-header"><h3>Payroll Workflow</h3></div>
        <div style={{ display: 'flex', gap: 0, overflowX: 'auto', paddingBottom: 4 }}>
          {[
            { step: '1', label: 'Create Period', desc: 'Set start/end dates and frequency' },
            { step: '2', label: 'Record Attendance', desc: 'Go to Attendance → add time-in/out records' },
            { step: '3', label: 'Load Profiles', desc: 'Create payroll input rows and bootstrap missing payroll profiles' },
            { step: '4', label: 'Sync Attendance', desc: 'Optional pre-check to review attendance before compute' },
            { step: '5', label: 'Edit Inputs', desc: 'Adjust bonuses, loans, and other manual payroll fields' },
            { step: '6', label: 'Compute', desc: 'Compute refreshes attendance fields, then runs statutory deductions' },
            { step: '7', label: 'Preview & Release', desc: 'Finalize and release payslips' }
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
