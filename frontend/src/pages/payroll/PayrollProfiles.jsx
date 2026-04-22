import React, { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import api from '../../api/api.js'
import { formatCurrency, getErrorMessage, toInputNumber } from './payrollUtils.js'

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
    user_id:                      String(profile.user_id || ''),
    employment_type:              profile.employment_type || '',
    pay_basis:                    profile.pay_basis || 'monthly',
    pay_rate:                     toInputNumber(profile.pay_rate),
    payroll_frequency:            profile.payroll_frequency || 'semi_monthly',
    standard_work_days_per_month: toInputNumber(profile.standard_work_days_per_month),
    standard_hours_per_day:       toInputNumber(profile.standard_hours_per_day),
    overtime_eligible:            Number(profile.overtime_eligible) === 1,
    late_deduction_enabled:       Number(profile.late_deduction_enabled) === 1,
    undertime_deduction_enabled:  Number(profile.undertime_deduction_enabled) === 1,
    tax_enabled:                  Number(profile.tax_enabled) === 1,
    sss_enabled:                  Number(profile.sss_enabled) === 1,
    philhealth_enabled:           Number(profile.philhealth_enabled) === 1,
    pagibig_enabled:              Number(profile.pagibig_enabled) === 1,
    payroll_method:               profile.payroll_method || 'cash',
    bank_name:                    profile.bank_name || '',
    bank_account_name:            profile.bank_account_name || '',
    bank_account_number:          profile.bank_account_number || '',
    status:                       profile.status || 'active'
  }
}

function toPayload(form) {
  return {
    user_id:                      Number(form.user_id),
    employment_type:              form.employment_type || null,
    pay_basis:                    form.pay_basis,
    pay_rate:                     Number(form.pay_rate || 0),
    payroll_frequency:            form.payroll_frequency,
    standard_work_days_per_month: form.standard_work_days_per_month === '' ? null : Number(form.standard_work_days_per_month),
    standard_hours_per_day:       form.standard_hours_per_day === '' ? null : Number(form.standard_hours_per_day),
    overtime_eligible:            form.overtime_eligible,
    late_deduction_enabled:       form.late_deduction_enabled,
    undertime_deduction_enabled:  form.undertime_deduction_enabled,
    tax_enabled:                  form.tax_enabled,
    sss_enabled:                  form.sss_enabled,
    philhealth_enabled:           form.philhealth_enabled,
    pagibig_enabled:              form.pagibig_enabled,
    payroll_method:               form.payroll_method,
    bank_name:                    form.bank_name || null,
    bank_account_name:            form.bank_account_name || null,
    bank_account_number:          form.bank_account_number || null,
    status:                       form.status
  }
}

const TOGGLE_ITEMS = [
  { key: 'overtime_eligible',          label: 'Overtime',      icon: '⏱', group: 'earnings' },
  { key: 'late_deduction_enabled',     label: 'Late',          icon: '⏰', group: 'deductions' },
  { key: 'undertime_deduction_enabled',label: 'Undertime',     icon: '📉', group: 'deductions' },
  { key: 'tax_enabled',                label: 'Withholding Tax',icon: '🏛', group: 'statutory' },
  { key: 'sss_enabled',                label: 'SSS',           icon: '🛡', group: 'statutory' },
  { key: 'philhealth_enabled',         label: 'PhilHealth',    icon: '🏥', group: 'statutory' },
  { key: 'pagibig_enabled',            label: 'Pag-IBIG',      icon: '🏠', group: 'statutory' },
]

const STATUS_STYLE = {
  active:   { bg: '#DCFCE7', color: '#15803D', label: 'Active' },
  inactive: { bg: '#F1F5F9', color: '#64748B', label: 'Inactive' },
}

function StatusPill({ status }) {
  const s = STATUS_STYLE[status] || STATUS_STYLE.inactive
  return (
    <span style={{
      display: 'inline-block', padding: '3px 12px', borderRadius: 20,
      fontSize: 11, fontWeight: 700, background: s.bg, color: s.color,
      textTransform: 'uppercase', letterSpacing: '0.04em'
    }}>
      {s.label}
    </span>
  )
}

function Avatar({ name }) {
  const ch = (name || '?')[0]?.toUpperCase()
  return (
    <div style={{
      width: 40, height: 40, borderRadius: '50%',
      background: 'var(--gold-light)', color: 'var(--gold-dark)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontWeight: 700, fontSize: 15, flexShrink: 0
    }}>
      {ch}
    </div>
  )
}

export default function PayrollProfiles() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [profiles,    setProfiles]    = useState([])
  const [users,       setUsers]       = useState([])
  const [form,        setForm]        = useState(emptyForm)
  const [editingId,   setEditingId]   = useState(null)
  const [loading,     setLoading]     = useState(false)
  const [saving,      setSaving]      = useState(false)
  const [error,       setError]       = useState(null)
  const [success,     setSuccess]     = useState(null)
  const [showForm,    setShowForm]    = useState(false)

  async function loadProfiles() {
    try {
      setLoading(true); setError(null)
      const res = await api.get('/api/payroll/profiles')
      setProfiles(res.data?.profiles || [])
      setUsers(res.data?.users || [])
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load payroll profiles'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadProfiles() }, [])

  useEffect(() => {
    if (loading) return
    const targetUserId = Number(searchParams.get('userId'))
    if (!targetUserId) return
    const existing = profiles.find((p) => Number(p.user_id) === targetUserId)
    if (existing) {
      setEditingId(existing.id); setForm(normalizeForm(existing))
    } else {
      setEditingId(null); setForm({ ...emptyForm, user_id: String(targetUserId) })
    }
    setShowForm(true); setSuccess(null); setError(null)
    const next = new URLSearchParams(searchParams)
    next.delete('userId')
    setSearchParams(next, { replace: true })
  }, [loading, profiles, searchParams, setSearchParams])

  const availableUsers = useMemo(() => {
    const used = new Set(profiles.filter((p) => !editingId || p.id !== editingId).map((p) => Number(p.user_id)))
    return users.filter((u) => !used.has(Number(u.id)) || Number(u.id) === Number(form.user_id))
  }, [users, profiles, editingId, form.user_id])

  function set(key, val) { setForm((p) => ({ ...p, [key]: val })) }

  function startEdit(profile) {
    setEditingId(profile.id); setForm(normalizeForm(profile))
    setShowForm(true); setSuccess(null); setError(null)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function openNew() {
    setEditingId(null); setForm(emptyForm)
    setShowForm(true); setSuccess(null); setError(null)
  }

  function cancelForm() {
    setEditingId(null); setForm(emptyForm); setShowForm(false)
  }

  async function submitForm(e) {
    e.preventDefault(); setSaving(true); setError(null); setSuccess(null)
    try {
      const payload = toPayload(form)
      if (editingId) {
        const { user_id, ...update } = payload
        await api.put(`/api/payroll/profiles/${editingId}`, update)
        setSuccess('Profile updated successfully.')
      } else {
        await api.post('/api/payroll/profiles', payload)
        setSuccess('Profile created successfully.')
      }
      cancelForm()
      await loadProfiles()
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to save payroll profile'))
    } finally {
      setSaving(false)
    }
  }

  const selectedUser = users.find((u) => String(u.id) === String(form.user_id))

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Payroll Profiles</h1>
          <p className="page-subtitle">Configure pay rates, deductions, and payroll settings per employee.</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary btn-sm" onClick={loadProfiles} disabled={loading}>↺ Refresh</button>
          {!showForm && (
            <button className="btn btn-primary" onClick={openNew}>+ New Profile</button>
          )}
        </div>
      </div>

      {error   && <div className="error-msg"   style={{ marginBottom: 14 }}>{error}</div>}
      {success && <div className="success-msg" style={{ marginBottom: 14 }}>{success}</div>}

      {/* ── Create / Edit Form ────────────────────────────────── */}
      {showForm && (
        <form onSubmit={submitForm}>
          <div className="card" style={{ marginBottom: 20 }}>
            {/* Card header */}
            <div className="card-header">
              <h3 style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {selectedUser && <Avatar name={selectedUser.full_name || selectedUser.username} />}
                {editingId
                  ? `Edit — ${selectedUser?.full_name || selectedUser?.username || 'Employee'}`
                  : 'New Payroll Profile'}
              </h3>
              <button type="button" className="btn btn-secondary btn-sm" onClick={cancelForm}>✕ Cancel</button>
            </div>

            {/* Section: Employee & Pay */}
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-light)' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--gold-dark)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
                Employee &amp; Pay
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Employee *</label>
                  <select className="form-input" value={form.user_id}
                    onChange={(e) => set('user_id', e.target.value)}
                    disabled={Boolean(editingId)} required>
                    <option value="">— Select employee —</option>
                    {availableUsers.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.full_name || u.username}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Employment Type</label>
                  <input className="form-input" value={form.employment_type}
                    onChange={(e) => set('employment_type', e.target.value)}
                    placeholder="Regular, Part-time, Seasonal…" />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Pay Basis *</label>
                  <select className="form-input" value={form.pay_basis} onChange={(e) => set('pay_basis', e.target.value)}>
                    <option value="monthly">Monthly</option>
                    <option value="daily">Daily</option>
                    <option value="hourly">Hourly</option>
                  </select>
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">
                    Pay Rate *
                    <span style={{ fontWeight: 400, color: 'var(--text-light)', marginLeft: 4 }}>
                      ₱ / {form.pay_basis === 'monthly' ? 'mo' : form.pay_basis === 'daily' ? 'day' : 'hr'}
                    </span>
                  </label>
                  <input className="form-input" type="number" min="0" step="0.01"
                    value={form.pay_rate} onChange={(e) => set('pay_rate', e.target.value)} required />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Frequency *</label>
                  <select className="form-input" value={form.payroll_frequency}
                    onChange={(e) => set('payroll_frequency', e.target.value)}>
                    <option value="weekly">Weekly</option>
                    <option value="semi_monthly">Semi-Monthly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Work Days / Month</label>
                  <input className="form-input" type="number" min="0" step="0.5"
                    value={form.standard_work_days_per_month}
                    onChange={(e) => set('standard_work_days_per_month', e.target.value)} />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Hours / Day</label>
                  <input className="form-input" type="number" min="0" step="0.5"
                    value={form.standard_hours_per_day}
                    onChange={(e) => set('standard_hours_per_day', e.target.value)} />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Status</label>
                  <select className="form-input" value={form.status} onChange={(e) => set('status', e.target.value)}>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Section: Deductions & Benefits */}
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-light)' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--gold-dark)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
                Deductions &amp; Benefits
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                {TOGGLE_ITEMS.map(({ key, label, icon, group }) => {
                  const active = form[key]
                  const groupColor = group === 'earnings'
                    ? { bg: active ? '#DCFCE7' : '#F1F5F9', border: active ? '#16A34A' : '#D1D5DB', text: active ? '#15803D' : '#9CA3AF' }
                    : group === 'deductions'
                    ? { bg: active ? '#FEE2E2' : '#F1F5F9', border: active ? '#DC2626' : '#D1D5DB', text: active ? '#DC2626' : '#9CA3AF' }
                    : { bg: active ? '#EFF6FF' : '#F1F5F9', border: active ? '#2563EB' : '#D1D5DB', text: active ? '#1D4ED8' : '#9CA3AF' }
                  return (
                    <label key={key} style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '8px 14px', borderRadius: 8, cursor: 'pointer',
                      background: groupColor.bg, border: `2px solid ${groupColor.border}`,
                      color: groupColor.text, fontWeight: 600, fontSize: 13,
                      userSelect: 'none', transition: 'all 0.15s'
                    }}>
                      <input type="checkbox" checked={form[key]}
                        onChange={(e) => set(key, e.target.checked)}
                        style={{ display: 'none' }} />
                      <span>{icon}</span>
                      <span>{label}</span>
                      <span style={{
                        width: 16, height: 16, borderRadius: '50%',
                        background: active ? groupColor.border : '#D1D5DB',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 10, color: '#fff', flexShrink: 0
                      }}>
                        {active ? '✓' : ''}
                      </span>
                    </label>
                  )
                })}
              </div>
            </div>

            {/* Section: Payment Method */}
            <div style={{ padding: '16px 20px' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--gold-dark)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
                Payment Method
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Payout Method</label>
                  <select className="form-input" value={form.payroll_method}
                    onChange={(e) => set('payroll_method', e.target.value)}>
                    <option value="cash">Cash</option>
                    <option value="bank_transfer">Bank Transfer</option>
                    <option value="ewallet">E-Wallet</option>
                  </select>
                </div>
                {form.payroll_method !== 'cash' && (
                  <>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">Bank / Wallet Name</label>
                      <input className="form-input" value={form.bank_name}
                        onChange={(e) => set('bank_name', e.target.value)}
                        placeholder="BDO, BPI, GCash…" />
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">Account Name</label>
                      <input className="form-input" value={form.bank_account_name}
                        onChange={(e) => set('bank_account_name', e.target.value)} />
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">Account Number</label>
                      <input className="form-input" value={form.bank_account_number}
                        onChange={(e) => set('bank_account_number', e.target.value)} />
                    </div>
                  </>
                )}
              </div>
            </div>

            <div style={{ padding: '0 20px 20px', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button type="button" className="btn btn-secondary" onClick={cancelForm}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? 'Saving…' : editingId ? 'Update Profile' : 'Create Profile'}
              </button>
            </div>
          </div>
        </form>
      )}

      {/* ── Profiles list ────────────────────────────────────────── */}
      <div className="card">
        <div className="card-header">
          <h3>Payroll Profiles ({profiles.length})</h3>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-light)' }}>Loading…</div>
        ) : profiles.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <div style={{ color: 'var(--text-light)', marginBottom: 12 }}>No payroll profiles yet.</div>
            <button className="btn btn-primary" onClick={openNew}>+ Create First Profile</button>
          </div>
        ) : (
          <div>
            {profiles.map((profile) => {
              const enabledDeductions = TOGGLE_ITEMS.filter((t) => profile[t.key])
              const disabledDeductions = TOGGLE_ITEMS.filter((t) => !profile[t.key])
              return (
                <div key={profile.id} style={{
                  borderBottom: '1px solid var(--border-light)',
                  padding: '14px 20px',
                  display: 'flex', alignItems: 'flex-start', gap: 14,
                  background: editingId === profile.id ? 'var(--cream-white)' : 'var(--white)'
                }}>
                  <Avatar name={profile.full_name || profile.username} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
                      <span style={{ fontWeight: 700, fontSize: 15 }}>{profile.full_name || profile.username}</span>
                      <StatusPill status={profile.status} />
                      {profile.employment_type && (
                        <span style={{ fontSize: 11, color: 'var(--text-light)', padding: '2px 8px', borderRadius: 10, background: 'var(--cream-white)' }}>
                          {profile.employment_type}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--text-mid)', marginBottom: 8 }}>
                      <span style={{ fontWeight: 600, color: 'var(--gold-dark)' }}>{formatCurrency(profile.pay_rate)}</span>
                      <span style={{ color: 'var(--text-light)' }}>
                        /{profile.pay_basis === 'monthly' ? 'mo' : profile.pay_basis === 'daily' ? 'day' : 'hr'}
                      </span>
                      <span style={{ margin: '0 6px', color: 'var(--border-mid)' }}>·</span>
                      {profile.payroll_frequency?.replace('_', '-')}
                      {profile.standard_work_days_per_month && (
                        <>
                          <span style={{ margin: '0 6px', color: 'var(--border-mid)' }}>·</span>
                          {profile.standard_work_days_per_month} days/mo
                        </>
                      )}
                      {profile.standard_hours_per_day && (
                        <>
                          <span style={{ margin: '0 6px', color: 'var(--border-mid)' }}>·</span>
                          {profile.standard_hours_per_day}h/day
                        </>
                      )}
                    </div>
                    {/* Toggle chips */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {enabledDeductions.map(({ key, label, icon }) => (
                        <span key={key} style={{
                          fontSize: 11, padding: '2px 8px', borderRadius: 10,
                          background: '#EFF6FF', color: '#2563EB', fontWeight: 600
                        }}>
                          {icon} {label}
                        </span>
                      ))}
                      {disabledDeductions.map(({ key, label }) => (
                        <span key={key} style={{
                          fontSize: 11, padding: '2px 8px', borderRadius: 10,
                          background: '#F1F5F9', color: '#9CA3AF', fontWeight: 500,
                          textDecoration: 'line-through'
                        }}>
                          {label}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                    <button className="btn btn-secondary btn-sm" onClick={() => startEdit(profile)}>Edit</button>
                    <span style={{ fontSize: 11, color: 'var(--text-light)' }}>
                      {profile.payroll_method?.replace('_', ' ')}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
