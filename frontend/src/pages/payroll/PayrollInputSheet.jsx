import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import api from '../../api/api.js'
import {
  buildAttendanceSyncFeedback,
  buildComputeSyncFeedback,
  buildLoadInputsMessage,
  formatCurrency,
  formatDate,
  getErrorMessage,
  statusBadgeClass,
  toInputNumber,
  usePermissions,
  ViewOnlyBadge
} from './payrollUtils.js'

const inputFields = [
  ['days_worked',           'Days Worked'],
  ['hours_worked',          'Hours Worked'],
  ['overtime_hours',        'OT Hours'],
  ['night_differential_minutes', 'Night Diff (min)'],
  ['late_minutes',          'Late (min)'],
  ['undertime_minutes',     'UT (min)'],
  ['absent_days',           'Absent'],
  ['regular_holiday_days',  'Reg Holiday'],
  ['special_holiday_days',  'Spec Holiday'],
  ['rest_day_days',         'Rest Day'],
  ['paid_leave_days',       'Paid Leave'],
  ['unpaid_leave_days',     'Unpaid Leave'],
  ['manual_bonus',          'Bonus'],
  ['manual_commission',     'Commission'],
  ['manual_allowance',      'Allowance'],
  ['loan_deduction',        'Loan'],
  ['manual_deduction',      'Other Deduction']
]

function rowToDraft(row) {
  const draft = { remarks: row.remarks || '' }
  for (const [key] of inputFields) draft[key] = toInputNumber(row[key])
  return draft
}
function draftToPayload(draft) {
  const payload = { remarks: draft.remarks || null }
  for (const [key] of inputFields) payload[key] = Number(draft[key] || 0)
  return payload
}

export default function PayrollInputSheet() {
  const { periodId } = useParams()
  const navigate     = useNavigate()
  const { canPayrollWrite } = usePermissions()
  const canWrite = canPayrollWrite.compute
  const [period,       setPeriod]       = useState(null)
  const [drafts,       setDrafts]       = useState({})
  const [loading,      setLoading]      = useState(false)
  const [savingUserId, setSavingUserId] = useState(null)
  const [actionLoading,setActionLoading]= useState(false)
  const [syncing,      setSyncing]      = useState(false)
  const [error,        setError]        = useState(null)
  const [success,      setSuccess]      = useState(null)
  const [expandedUser, setExpandedUser] = useState(null)

  const showMsg = (m) => { setSuccess(m); setTimeout(() => setSuccess(null), 4200) }

  async function loadPeriod() {
    try {
      setLoading(true); setError(null)
      const res = await api.get(`/api/payroll/periods/${periodId}`)
      const nextPeriod = res.data
      setPeriod(nextPeriod)
      const nextDrafts = {}
      for (const row of nextPeriod.inputs || []) nextDrafts[row.user_id] = rowToDraft(row)
      setDrafts(nextDrafts)
    } catch (err) { setError(getErrorMessage(err, 'Failed to load payroll input sheet')) }
    finally { setLoading(false) }
  }

  useEffect(() => { loadPeriod() }, [periodId]) // eslint-disable-line

  const locked = useMemo(() => ['finalized', 'released', 'void'].includes(String(period?.status || '')), [period?.status])

  function updateDraft(userId, key, value) {
    setDrafts((prev) => ({ ...prev, [userId]: { ...(prev[userId] || {}), [key]: value } }))
  }

  async function loadInputs() {
    setActionLoading(true); setError(null)
    try {
      const r = await api.post(`/api/payroll/periods/${periodId}/load-inputs`)
      const message = buildLoadInputsMessage(r.data || {})
      await loadPeriod()
      if (Number(r.data?.period?.inputs?.length || 0) > 0) showMsg(message)
      else setError(message)
    }
    catch (err) { setError(getErrorMessage(err, 'Failed to load payroll inputs.')) }
    finally { setActionLoading(false) }
  }

  async function syncAttendance() {
    setSyncing(true); setError(null)
    try {
      const r = await api.post(`/api/payroll/periods/${periodId}/inputs/sync-attendance`)
      const feedback = buildAttendanceSyncFeedback(r.data || {})
      if (feedback.isError) setError(feedback.message)
      else showMsg(feedback.message)
      await loadPeriod()
    } catch (err) { setError(getErrorMessage(err, 'Attendance sync failed.')) }
    finally { setSyncing(false) }
  }

  async function saveRow(row) {
    setSavingUserId(row.user_id); setError(null)
    try {
      await api.put(`/api/payroll/periods/${periodId}/inputs/${row.user_id}`, draftToPayload(drafts[row.user_id] || {}))
      showMsg(`Saved — ${row.full_name || row.username}.`)
      await loadPeriod()
    } catch (err) { setError(getErrorMessage(err, 'Failed to save payroll input')) }
    finally { setSavingUserId(null) }
  }

  async function compute() {
    setActionLoading(true); setError(null)
    try {
      const r = await api.post(`/api/payroll/periods/${periodId}/compute`)
      const feedback = buildComputeSyncFeedback(r.data?.sync_summary || {})
      navigate(`/payroll/periods/${periodId}/preview`, {
        state: feedback.isWarning
          ? { flashWarning: feedback.message }
          : { flashSuccess: feedback.message }
      })
    }
    catch (err) { setError(getErrorMessage(err, 'Failed to compute the payroll.')) }
    finally { setActionLoading(false) }
  }

  const inputs = period?.inputs || []
  const DEDUCTION_FIELDS  = ['late_minutes', 'undertime_minutes', 'absent_days', 'unpaid_leave_days', 'loan_deduction', 'manual_deduction']
  const EARNING_FIELDS    = ['overtime_hours', 'night_differential_minutes', 'regular_holiday_days', 'special_holiday_days', 'rest_day_days', 'paid_leave_days', 'manual_bonus', 'manual_commission', 'manual_allowance']

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">
            Payroll Input Sheet
            {!canWrite && <span style={{ marginLeft: 10 }}><ViewOnlyBadge /></span>}
          </h1>
          <p className="page-subtitle">
            {period
              ? `${period.code} · ${formatDate(period.start_date)} – ${formatDate(period.end_date)}`
              : 'Loading…'}
          </p>
          <div style={{ fontSize: 12, color: 'var(--text-light)', marginTop: 4 }}>
            {canWrite
              ? 'Compute refreshes attendance-derived fields first. Bonuses, loans, deductions, and remarks stay as entered.'
              : 'You can review the input rows. Editing, syncing, and compute are restricted to administrators.'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-secondary" onClick={() => navigate('/payroll/periods')}>← Back</button>
          {!locked && canWrite && (
            <button className="btn btn-outline" onClick={syncAttendance} disabled={syncing || actionLoading}>
              {syncing ? '⟳ Syncing…' : '⟳ Sync Attendance'}
            </button>
          )}
          {!locked && canWrite && (
            <button className="btn btn-secondary" onClick={loadInputs} disabled={actionLoading}>
              {actionLoading ? 'Loading…' : 'Load Profiles'}
            </button>
          )}
          {!locked && canWrite && inputs.length > 0 && (
            <button className="btn btn-primary" onClick={compute} disabled={actionLoading}>
              {actionLoading ? 'Computing…' : 'Compute Payroll →'}
            </button>
          )}
        </div>
      </div>

      {period && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
          <span className={statusBadgeClass(period.status)} style={{ textTransform: 'uppercase', fontSize: 12 }}>{period.status}</span>
          <span style={{ fontSize: 13, color: 'var(--text-mid)' }}>
            {period.frequency?.replace('_', '-')} · Payout {formatDate(period.payout_date)}
          </span>
          {period.employee_count > 0 && (
            <span style={{ fontSize: 13, color: 'var(--text-mid)' }}>{period.employee_count} employee(s)</span>
          )}
          {period.total_net_pay > 0 && (
            <span style={{ fontWeight: 700, color: 'var(--gold-dark)', fontSize: 14 }}>
              Pay: {formatCurrency(period.total_net_pay)}
            </span>
          )}
        </div>
      )}

      {error   && <div className="error-msg"   style={{ marginBottom: 14 }}>{error}</div>}
      {success && <div className="success-msg" style={{ marginBottom: 14 }}>{success}</div>}

      <div className="card">
        <div className="card-header">
          <h3>Employee Inputs ({inputs.length})</h3>
          <button className="btn btn-secondary btn-sm" onClick={loadPeriod}>↺ Refresh</button>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-light)' }}>Loading inputs…</div>
        ) : inputs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <div style={{ color: 'var(--text-light)', marginBottom: 14 }}>No input rows loaded for this period yet.</div>
            {canWrite && (
              <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
                <button className="btn btn-outline" onClick={syncAttendance} disabled={syncing}>⟳ Sync from Attendance</button>
                <button className="btn btn-primary"  onClick={loadInputs} disabled={actionLoading}>Load Employee Profiles</button>
              </div>
            )}
          </div>
        ) : (
          <div>
            {inputs.map((row) => {
              const draft = drafts[row.user_id] || rowToDraft(row)
              const isExpanded = expandedUser === row.user_id
              return (
                <div key={row.user_id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                  {/* Employee header row */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: isExpanded ? 'var(--cream-white)' : 'var(--white)', cursor: 'pointer' }}
                    onClick={() => setExpandedUser(isExpanded ? null : row.user_id)}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                      <div style={{ width: 38, height: 38, borderRadius: '50%', background: 'var(--gold-light)', color: 'var(--gold-dark)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14 }}>
                        {(row.full_name || row.username || '?')[0]?.toUpperCase()}
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 14 }}>{row.full_name || row.username}</div>
                        <div style={{ fontSize: 12, color: 'var(--text-light)' }}>
                          {row.pay_basis} · ₱{Number(row.pay_rate || 0).toLocaleString()}/
                          {row.pay_basis === 'monthly' ? 'mo' : row.pay_basis === 'daily' ? 'day' : 'hr'}
                          {draft.days_worked ? ` · ${draft.days_worked} days` : ''}
                          {draft.late_minutes > 0 ? ` · ${draft.late_minutes}min late` : ''}
                          {draft.overtime_hours > 0 ? ` · ${draft.overtime_hours}h OT` : ''}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      {!locked && canWrite && (
                        <button className="btn btn-primary btn-sm" type="button"
                          onClick={(e) => { e.stopPropagation(); saveRow(row) }}
                          disabled={savingUserId === row.user_id}>
                          {savingUserId === row.user_id ? 'Saving…' : 'Save'}
                        </button>
                      )}
                      <span style={{ color: 'var(--text-light)', fontSize: 20 }}>{isExpanded ? '▲' : '▼'}</span>
                    </div>
                  </div>

                  {/* Expanded input fields */}
                  {isExpanded && (
                    <div style={{ padding: '14px 16px', background: 'var(--cream-white)', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10 }}>
                      {inputFields.map(([key, label]) => {
                        const isDeduction = DEDUCTION_FIELDS.includes(key)
                        const isEarning   = EARNING_FIELDS.includes(key)
                        return (
                          <div key={key} className="form-group" style={{ marginBottom: 0 }}>
                            <label className="form-label" style={{
                              fontSize: 11,
                              color: isDeduction ? 'var(--error)' : isEarning ? 'var(--success)' : 'var(--text-mid)'
                            }}>
                              {isDeduction ? '−' : isEarning ? '+' : ''}  {label}
                            </label>
                            <input
                              className="form-input"
                              type="number" min="0"
                              step={key.includes('minutes') ? '1' : '0.01'}
                              value={draft[key]}
                              disabled={locked || !canWrite}
                              style={{ fontSize: 13, padding: '6px 10px' }}
                              onChange={(e) => updateDraft(row.user_id, key, e.target.value)}
                            />
                          </div>
                        )
                      })}
                      <div className="form-group" style={{ marginBottom: 0, gridColumn: '1 / -1' }}>
                        <label className="form-label" style={{ fontSize: 11 }}>Remarks</label>
                        <input className="form-input" value={draft.remarks || ''} disabled={locked || !canWrite}
                          style={{ fontSize: 13 }}
                          onChange={(e) => updateDraft(row.user_id, 'remarks', e.target.value)} />
                      </div>
                      {!locked && canWrite && (
                        <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
                          <button className="btn btn-primary btn-sm" onClick={() => saveRow(row)} disabled={savingUserId === row.user_id}>
                            {savingUserId === row.user_id ? 'Saving…' : 'Save Row'}
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
