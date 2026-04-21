import React, { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import api from '../../api/api.js'
import { formatCurrency, getErrorMessage, statusBadgeClass, toInputNumber } from './payrollUtils.js'

const emptyForm = {
  user_id: '',
  employment_type: '',
  pay_basis: 'monthly',
  pay_rate: '',
  payroll_frequency: 'semi_monthly',
  standard_work_days_per_month: '22',
  standard_hours_per_day: '8',
  overtime_eligible: true,
  late_deduction_enabled: true,
  undertime_deduction_enabled: true,
  tax_enabled: true,
  sss_enabled: true,
  philhealth_enabled: true,
  pagibig_enabled: true,
  payroll_method: 'cash',
  bank_name: '',
  bank_account_name: '',
  bank_account_number: '',
  status: 'active'
}

function normalizeForm(profile) {
  if (!profile) return emptyForm
  return {
    user_id: String(profile.user_id || ''),
    employment_type: profile.employment_type || '',
    pay_basis: profile.pay_basis || 'monthly',
    pay_rate: toInputNumber(profile.pay_rate),
    payroll_frequency: profile.payroll_frequency || 'semi_monthly',
    standard_work_days_per_month: toInputNumber(profile.standard_work_days_per_month),
    standard_hours_per_day: toInputNumber(profile.standard_hours_per_day),
    overtime_eligible: Number(profile.overtime_eligible) === 1,
    late_deduction_enabled: Number(profile.late_deduction_enabled) === 1,
    undertime_deduction_enabled: Number(profile.undertime_deduction_enabled) === 1,
    tax_enabled: Number(profile.tax_enabled) === 1,
    sss_enabled: Number(profile.sss_enabled) === 1,
    philhealth_enabled: Number(profile.philhealth_enabled) === 1,
    pagibig_enabled: Number(profile.pagibig_enabled) === 1,
    payroll_method: profile.payroll_method || 'cash',
    bank_name: profile.bank_name || '',
    bank_account_name: profile.bank_account_name || '',
    bank_account_number: profile.bank_account_number || '',
    status: profile.status || 'active'
  }
}

function toPayload(form) {
  return {
    user_id: Number(form.user_id),
    employment_type: form.employment_type || null,
    pay_basis: form.pay_basis,
    pay_rate: Number(form.pay_rate || 0),
    payroll_frequency: form.payroll_frequency,
    standard_work_days_per_month: form.standard_work_days_per_month === '' ? null : Number(form.standard_work_days_per_month),
    standard_hours_per_day: form.standard_hours_per_day === '' ? null : Number(form.standard_hours_per_day),
    overtime_eligible: form.overtime_eligible,
    late_deduction_enabled: form.late_deduction_enabled,
    undertime_deduction_enabled: form.undertime_deduction_enabled,
    tax_enabled: form.tax_enabled,
    sss_enabled: form.sss_enabled,
    philhealth_enabled: form.philhealth_enabled,
    pagibig_enabled: form.pagibig_enabled,
    payroll_method: form.payroll_method,
    bank_name: form.bank_name || null,
    bank_account_name: form.bank_account_name || null,
    bank_account_number: form.bank_account_number || null,
    status: form.status
  }
}

export default function PayrollProfiles() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [profiles, setProfiles] = useState([])
  const [users, setUsers] = useState([])
  const [form, setForm] = useState(emptyForm)
  const [editingId, setEditingId] = useState(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)

  async function loadProfiles() {
    try {
      setLoading(true)
      setError(null)
      const res = await api.get('/api/payroll/profiles')
      setProfiles(res.data?.profiles || [])
      setUsers(res.data?.users || [])
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load payroll profiles'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadProfiles()
  }, [])

  useEffect(() => {
    if (loading) return
    const targetUserId = Number(searchParams.get('userId'))
    if (!targetUserId) return

    const existingProfile = profiles.find((profile) => Number(profile.user_id) === targetUserId)
    if (existingProfile) {
      setEditingId(existingProfile.id)
      setForm(normalizeForm(existingProfile))
    } else {
      setEditingId(null)
      setForm({ ...emptyForm, user_id: String(targetUserId) })
    }

    setSuccess(null)
    setError(null)

    const nextParams = new URLSearchParams(searchParams)
    nextParams.delete('userId')
    setSearchParams(nextParams, { replace: true })
  }, [loading, profiles, searchParams, setSearchParams])

  const availableUsers = useMemo(() => {
    const used = new Set(profiles.filter((profile) => !editingId || profile.id !== editingId).map((profile) => Number(profile.user_id)))
    return users.filter((user) => !used.has(Number(user.id)) || Number(user.id) === Number(form.user_id))
  }, [users, profiles, editingId, form.user_id])

  function updateField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function startEdit(profile) {
    setEditingId(profile.id)
    setForm(normalizeForm(profile))
    setSuccess(null)
    setError(null)
  }

  function resetForm() {
    setEditingId(null)
    setForm(emptyForm)
  }

  async function submitForm(event) {
    event.preventDefault()
    setSaving(true)
    setError(null)
    setSuccess(null)
    try {
      const payload = toPayload(form)
      if (editingId) {
        const { user_id, ...updatePayload } = payload
        await api.put(`/api/payroll/profiles/${editingId}`, updatePayload)
        setSuccess('Payroll profile updated.')
      } else {
        await api.post('/api/payroll/profiles', payload)
        setSuccess('Payroll profile created.')
      }
      resetForm()
      await loadProfiles()
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to save payroll profile'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="page payroll-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Payroll Profiles</h1>
          <p className="page-subtitle">Payroll setup attached to existing user accounts.</p>
        </div>
      </div>

      {error ? <div className="error-msg" style={{ marginBottom: 16 }}>{error}</div> : null}
      {success ? <div className="form-success" style={{ marginBottom: 16 }}>{success}</div> : null}

      <div className="payroll-grid">
        <form className="card payroll-form-card" onSubmit={submitForm}>
          <div className="card-header">
            <h3>{editingId ? 'Edit Profile' : 'Create Profile'}</h3>
            {editingId ? <button type="button" className="btn btn-secondary btn-sm" onClick={resetForm}>Cancel</button> : null}
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label required">User</label>
              <select className="form-select" value={form.user_id} onChange={(event) => updateField('user_id', event.target.value)} disabled={Boolean(editingId)} required>
                <option value="">Select user</option>
                {availableUsers.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.full_name || user.username} ({user.email || user.username})
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Employment Type</label>
              <input className="form-input" value={form.employment_type} onChange={(event) => updateField('employment_type', event.target.value)} placeholder="Regular, part-time, seasonal" />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label required">Pay Basis</label>
              <select className="form-select" value={form.pay_basis} onChange={(event) => updateField('pay_basis', event.target.value)}>
                <option value="monthly">Monthly</option>
                <option value="daily">Daily</option>
                <option value="hourly">Hourly</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label required">Pay Rate</label>
              <input className="form-input" type="number" min="0" step="0.01" value={form.pay_rate} onChange={(event) => updateField('pay_rate', event.target.value)} required />
            </div>
            <div className="form-group">
              <label className="form-label required">Frequency</label>
              <select className="form-select" value={form.payroll_frequency} onChange={(event) => updateField('payroll_frequency', event.target.value)}>
                <option value="weekly">Weekly</option>
                <option value="semi_monthly">Semi-monthly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Work Days / Month</label>
              <input className="form-input" type="number" min="0" step="0.01" value={form.standard_work_days_per_month} onChange={(event) => updateField('standard_work_days_per_month', event.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Hours / Day</label>
              <input className="form-input" type="number" min="0" step="0.01" value={form.standard_hours_per_day} onChange={(event) => updateField('standard_hours_per_day', event.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Payroll Method</label>
              <select className="form-select" value={form.payroll_method} onChange={(event) => updateField('payroll_method', event.target.value)}>
                <option value="cash">Cash</option>
                <option value="bank_transfer">Bank Transfer</option>
                <option value="ewallet">E-wallet</option>
              </select>
            </div>
          </div>

          <div className="payroll-toggle-grid">
            {[
              ['overtime_eligible', 'Overtime'],
              ['late_deduction_enabled', 'Late Deduction'],
              ['undertime_deduction_enabled', 'Undertime'],
              ['tax_enabled', 'Tax'],
              ['sss_enabled', 'SSS'],
              ['philhealth_enabled', 'PhilHealth'],
              ['pagibig_enabled', 'Pag-IBIG']
            ].map(([key, label]) => (
              <label key={key} className="payroll-check">
                <input type="checkbox" checked={form[key]} onChange={(event) => updateField(key, event.target.checked)} />
                <span>{label}</span>
              </label>
            ))}
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Bank / Wallet</label>
              <input className="form-input" value={form.bank_name} onChange={(event) => updateField('bank_name', event.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Account Name</label>
              <input className="form-input" value={form.bank_account_name} onChange={(event) => updateField('bank_account_name', event.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Account Number</label>
              <input className="form-input" value={form.bank_account_number} onChange={(event) => updateField('bank_account_number', event.target.value)} />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Status</label>
            <select className="form-select" value={form.status} onChange={(event) => updateField('status', event.target.value)}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>

          <button className="btn btn-primary" type="submit" disabled={saving}>
            {saving ? 'Saving...' : editingId ? 'Update Profile' : 'Create Profile'}
          </button>
        </form>

        <div className="card payroll-table-card">
          <div className="card-header">
            <h3>Profiles</h3>
          </div>
          <div className="table-wrap responsive">
            <table>
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Basis</th>
                  <th className="text-right">Rate</th>
                  <th>Status</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={5}>Loading...</td></tr>
                ) : profiles.length ? profiles.map((profile) => (
                  <tr key={profile.id}>
                    <td>
                      <strong>{profile.full_name || profile.username}</strong>
                      <div className="text-muted">{profile.email || '-'}</div>
                    </td>
                    <td>{profile.pay_basis} / {profile.payroll_frequency}</td>
                    <td className="text-right">{formatCurrency(profile.pay_rate)}</td>
                    <td><span className={statusBadgeClass(profile.status)}>{profile.status}</span></td>
                    <td className="text-right">
                      <button className="btn btn-secondary btn-sm" type="button" onClick={() => startEdit(profile)}>Edit</button>
                    </td>
                  </tr>
                )) : (
                  <tr><td colSpan={5} className="text-center text-muted">No payroll profiles yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
