import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import api from '../../api/api.js'
import { formatDate, getErrorMessage, statusBadgeClass, toInputNumber } from './payrollUtils.js'

const inputFields = [
  ['days_worked', 'Days'],
  ['hours_worked', 'Hours'],
  ['overtime_hours', 'OT'],
  ['late_minutes', 'Late Min'],
  ['undertime_minutes', 'UT Min'],
  ['absent_days', 'Absent'],
  ['regular_holiday_days', 'Reg Hol'],
  ['special_holiday_days', 'Spec Hol'],
  ['rest_day_days', 'Rest Day'],
  ['paid_leave_days', 'Paid Leave'],
  ['unpaid_leave_days', 'Unpaid Leave'],
  ['manual_bonus', 'Bonus'],
  ['manual_commission', 'Commission'],
  ['manual_allowance', 'Allowance'],
  ['manual_deduction', 'Deduction']
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
  const navigate = useNavigate()
  const [period, setPeriod] = useState(null)
  const [drafts, setDrafts] = useState({})
  const [loading, setLoading] = useState(false)
  const [savingUserId, setSavingUserId] = useState(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)

  async function loadPeriod() {
    try {
      setLoading(true)
      setError(null)
      const res = await api.get(`/api/payroll/periods/${periodId}`)
      const nextPeriod = res.data
      setPeriod(nextPeriod)
      const nextDrafts = {}
      for (const row of nextPeriod.inputs || []) nextDrafts[row.user_id] = rowToDraft(row)
      setDrafts(nextDrafts)
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load payroll input sheet'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadPeriod()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodId])

  const locked = useMemo(() => ['finalized', 'released', 'void'].includes(String(period?.status || '')), [period?.status])

  function updateDraft(userId, key, value) {
    setDrafts((prev) => ({
      ...prev,
      [userId]: {
        ...(prev[userId] || {}),
        [key]: value
      }
    }))
  }

  async function loadInputs() {
    setActionLoading(true)
    setError(null)
    setSuccess(null)
    try {
      await api.post(`/api/payroll/periods/${periodId}/load-inputs`)
      setSuccess('Payroll inputs loaded.')
      await loadPeriod()
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load payroll inputs'))
    } finally {
      setActionLoading(false)
    }
  }

  async function saveRow(row) {
    setSavingUserId(row.user_id)
    setError(null)
    setSuccess(null)
    try {
      await api.put(`/api/payroll/periods/${periodId}/inputs/${row.user_id}`, draftToPayload(drafts[row.user_id] || {}))
      setSuccess(`Saved input for ${row.full_name || row.username}.`)
      await loadPeriod()
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to save payroll input'))
    } finally {
      setSavingUserId(null)
    }
  }

  async function compute() {
    setActionLoading(true)
    setError(null)
    setSuccess(null)
    try {
      await api.post(`/api/payroll/periods/${periodId}/compute`)
      navigate(`/payroll/periods/${periodId}/preview`)
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to compute payroll'))
    } finally {
      setActionLoading(false)
    }
  }

  return (
    <div className="page payroll-page payroll-input-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Payroll Input Sheet</h1>
          <p className="page-subtitle">
            {period ? `${period.code} | ${formatDate(period.start_date)} - ${formatDate(period.end_date)}` : 'Loading period...'}
          </p>
        </div>
        <div className="payroll-header-actions">
          <button className="btn btn-secondary" type="button" onClick={() => navigate('/payroll/periods')}>Back</button>
          <button className="btn btn-secondary" type="button" onClick={loadInputs} disabled={locked || actionLoading}>Load Inputs</button>
          <button className="btn btn-primary" type="button" onClick={compute} disabled={locked || actionLoading || !(period?.inputs || []).length}>Compute</button>
        </div>
      </div>

      {period ? (
        <div className="payroll-status-line">
          <span className={statusBadgeClass(period.status)}>{period.status}</span>
          <span>Payout {formatDate(period.payout_date)}</span>
        </div>
      ) : null}

      {error ? <div className="error-msg" style={{ marginBottom: 16 }}>{error}</div> : null}
      {success ? <div className="form-success" style={{ marginBottom: 16 }}>{success}</div> : null}

      <div className="card payroll-table-card">
        <div className="card-header">
          <h3>Inputs</h3>
          <button className="btn btn-secondary btn-sm" type="button" onClick={loadPeriod}>Refresh</button>
        </div>
        <div className="table-wrap responsive payroll-wide-table">
          <table>
            <thead>
              <tr>
                <th>Employee</th>
                {inputFields.map(([, label]) => <th key={label}>{label}</th>)}
                <th>Remarks</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={inputFields.length + 3}>Loading...</td></tr>
              ) : period?.inputs?.length ? period.inputs.map((row) => {
                const draft = drafts[row.user_id] || rowToDraft(row)
                return (
                  <tr key={row.user_id}>
                    <td className="payroll-employee-cell">
                      <strong>{row.full_name || row.username}</strong>
                      <div className="text-muted">{row.pay_basis || 'no profile'} / {row.pay_rate || '0.00'}</div>
                    </td>
                    {inputFields.map(([key]) => (
                      <td key={key}>
                        <input
                          className="form-input payroll-sheet-input"
                          type="number"
                          min="0"
                          step={key.includes('minutes') ? '1' : '0.01'}
                          value={draft[key]}
                          disabled={locked}
                          onChange={(event) => updateDraft(row.user_id, key, event.target.value)}
                        />
                      </td>
                    ))}
                    <td>
                      <input className="form-input payroll-remarks-input" value={draft.remarks || ''} disabled={locked} onChange={(event) => updateDraft(row.user_id, 'remarks', event.target.value)} />
                    </td>
                    <td className="text-right">
                      <button className="btn btn-primary btn-sm" type="button" onClick={() => saveRow(row)} disabled={locked || savingUserId === row.user_id}>
                        {savingUserId === row.user_id ? 'Saving...' : 'Save'}
                      </button>
                    </td>
                  </tr>
                )
              }) : (
                <tr><td colSpan={inputFields.length + 3} className="text-center text-muted">No input rows loaded for this period.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
