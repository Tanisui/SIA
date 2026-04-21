import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../../api/api.js'
import { formatCurrency, formatDate, getErrorMessage, statusBadgeClass } from './payrollUtils.js'

function defaultPeriodForm() {
  const today = new Date()
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() <= 15 ? 1 : 16)
  const end = new Date(today.getFullYear(), today.getMonth() + (today.getDate() <= 15 ? 0 : 1), today.getDate() <= 15 ? 15 : 0)
  return {
    code: '',
    start_date: start.toISOString().slice(0, 10),
    end_date: end.toISOString().slice(0, 10),
    payout_date: end.toISOString().slice(0, 10),
    frequency: 'semi_monthly',
    notes: ''
  }
}

export default function PayrollPeriods() {
  const navigate = useNavigate()
  const [periods, setPeriods] = useState([])
  const [form, setForm] = useState(defaultPeriodForm)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [actionId, setActionId] = useState(null)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)

  async function loadPeriods() {
    try {
      setLoading(true)
      setError(null)
      const res = await api.get('/api/payroll/periods')
      setPeriods(res.data || [])
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load payroll periods'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadPeriods()
  }, [])

  function updateField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function createPeriod(event) {
    event.preventDefault()
    setSaving(true)
    setError(null)
    setSuccess(null)
    try {
      await api.post('/api/payroll/periods', {
        code: form.code || undefined,
        start_date: form.start_date,
        end_date: form.end_date,
        payout_date: form.payout_date,
        frequency: form.frequency,
        notes: form.notes || null
      })
      setForm(defaultPeriodForm())
      setSuccess('Payroll period created.')
      await loadPeriods()
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to create payroll period'))
    } finally {
      setSaving(false)
    }
  }

  async function loadInputs(period) {
    setActionId(period.id)
    setError(null)
    setSuccess(null)
    try {
      await api.post(`/api/payroll/periods/${period.id}/load-inputs`)
      navigate(`/payroll/periods/${period.id}/inputs`)
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load payroll inputs'))
    } finally {
      setActionId(null)
    }
  }

  async function compute(period) {
    setActionId(period.id)
    setError(null)
    setSuccess(null)
    try {
      await api.post(`/api/payroll/periods/${period.id}/compute`)
      navigate(`/payroll/periods/${period.id}/preview`)
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to compute payroll'))
    } finally {
      setActionId(null)
    }
  }

  return (
    <div className="page payroll-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Payroll Periods</h1>
          <p className="page-subtitle">Semi-manual cutoffs for boutique payroll processing.</p>
        </div>
      </div>

      {error ? <div className="error-msg" style={{ marginBottom: 16 }}>{error}</div> : null}
      {success ? <div className="form-success" style={{ marginBottom: 16 }}>{success}</div> : null}

      <div className="card payroll-form-card" style={{ marginBottom: 20 }}>
        <div className="card-header">
          <h3>Create Payroll Period</h3>
        </div>
        <form onSubmit={createPeriod}>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Code</label>
              <input className="form-input" value={form.code} onChange={(event) => updateField('code', event.target.value)} placeholder="Auto-generated if blank" />
            </div>
            <div className="form-group">
              <label className="form-label required">Start Date</label>
              <input className="form-input" type="date" value={form.start_date} onChange={(event) => updateField('start_date', event.target.value)} required />
            </div>
            <div className="form-group">
              <label className="form-label required">End Date</label>
              <input className="form-input" type="date" value={form.end_date} onChange={(event) => updateField('end_date', event.target.value)} required />
            </div>
            <div className="form-group">
              <label className="form-label required">Payout Date</label>
              <input className="form-input" type="date" value={form.payout_date} onChange={(event) => updateField('payout_date', event.target.value)} required />
            </div>
            <div className="form-group">
              <label className="form-label">Frequency</label>
              <select className="form-select" value={form.frequency} onChange={(event) => updateField('frequency', event.target.value)}>
                <option value="weekly">Weekly</option>
                <option value="semi_monthly">Semi-monthly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Notes</label>
            <textarea className="form-textarea" value={form.notes} onChange={(event) => updateField('notes', event.target.value)} />
          </div>
          <button className="btn btn-primary" type="submit" disabled={saving}>{saving ? 'Creating...' : 'Create Period'}</button>
        </form>
      </div>

      <div className="card payroll-table-card">
        <div className="card-header">
          <h3>Cutoffs</h3>
          <button className="btn btn-secondary btn-sm" type="button" onClick={loadPeriods}>Refresh</button>
        </div>
        <div className="table-wrap responsive">
          <table>
            <thead>
              <tr>
                <th>Period</th>
                <th>Dates</th>
                <th>Status</th>
                <th className="text-right">Net Pay</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5}>Loading...</td></tr>
              ) : periods.length ? periods.map((period) => (
                <tr key={period.id}>
                  <td>
                    <strong>{period.code}</strong>
                    <div className="text-muted">Payout {formatDate(period.payout_date)}</div>
                  </td>
                  <td>{formatDate(period.start_date)} - {formatDate(period.end_date)}</td>
                  <td><span className={statusBadgeClass(period.status)}>{period.status}</span></td>
                  <td className="text-right">{formatCurrency(period.total_net_pay)}</td>
                  <td className="text-right">
                    <div className="payroll-row-actions">
                      <button className="btn btn-secondary btn-sm" type="button" onClick={() => navigate(`/payroll/periods/${period.id}/inputs`)}>Inputs</button>
                      <button className="btn btn-secondary btn-sm" type="button" onClick={() => loadInputs(period)} disabled={actionId === period.id || ['finalized', 'released', 'void'].includes(period.status)}>Load</button>
                      <button className="btn btn-primary btn-sm" type="button" onClick={() => compute(period)} disabled={actionId === period.id || ['finalized', 'released', 'void'].includes(period.status)}>Compute</button>
                      {period.latest_run_id ? <button className="btn btn-outline btn-sm" type="button" onClick={() => navigate(`/payroll/periods/${period.id}/preview`)}>Preview</button> : null}
                    </div>
                  </td>
                </tr>
              )) : (
                <tr><td colSpan={5} className="text-center text-muted">No payroll periods yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
