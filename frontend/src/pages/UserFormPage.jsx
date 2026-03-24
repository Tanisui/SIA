import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import api from '../api/api.js'
import { ConfirmModal } from '../components/Modal.js'

const DEFAULT_FORM = {
  email: '',
  full_name: '',
  is_active: 1,
  roles: [],
  contact_type: '',
  contact: '',
  hire_date: '',
  pay_rate: ''
}

export default function UserFormPage({ mode = 'create' }) {
  const navigate = useNavigate()
  const { id } = useParams()
  const isEdit = mode === 'edit'

  const [rolesOptions, setRolesOptions] = useState([])                                                                              
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formData, setFormData] = useState(DEFAULT_FORM)
  const [originalForm, setOriginalForm] = useState(DEFAULT_FORM)
  const [error, setError] = useState(null)

  const [openSaveConfirm, setOpenSaveConfirm] = useState(false)
  const [openCancelConfirm, setOpenCancelConfirm] = useState(false)
  const [openArchiveConfirm, setOpenArchiveConfirm] = useState(false)

  useEffect(() => {
    let mounted = true

    const fetchRoles = async () => {
      try {
        const res = await api.get('/roles')
        if (!mounted) return
        const opts = (res.data || []).map((r) => ({ value: String(r.id), label: r.name }))
        setRolesOptions(opts)
      } catch (err) {
        if (!mounted) return
        setError('Failed to fetch roles')
      }
    }

    fetchRoles()
    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => {
    if (!isEdit || !id) return
    let mounted = true

    const fetchUser = async () => {
      setLoading(true)
      try {
        const res = await api.get(`/users/${id}`)
        if (!mounted) return
        const user = res.data || {}
        const roleIds = []
        const userRoleNames = user.roles || []
        for (const roleName of userRoleNames) {
          const roleMatch = (rolesOptions || []).find((r) => String(r.label) === String(roleName))
          if (roleMatch) roleIds.push(String(roleMatch.value))
        }

        const nextForm = {
          email: user.email || '',
          full_name: user.full_name || '',
          is_active: user.is_active === 0 ? 0 : 1,
          roles: roleIds,
          contact_type: user.employee?.contact_type || '',
          contact: user.employee?.contact || '',
          hire_date: user.employee?.hire_date || '',
          pay_rate: user.employee?.pay_rate || ''
        }

        setFormData(nextForm)
        setOriginalForm(nextForm)
      } catch (err) {
        if (!mounted) return
        setError(err?.response?.data?.error || 'Failed to load user')
      } finally {
        if (mounted) setLoading(false)
      }
    }

    fetchUser()
    return () => {
      mounted = false
    }
  }, [isEdit, id, rolesOptions])

  const isDirty = useMemo(() => {
    return JSON.stringify(formData) !== JSON.stringify(originalForm)
  }, [formData, originalForm])

  const handleInputChange = (e) => {
    const { name, value } = e.target

    if (name === 'roles') {
      const selected = Array.from(e.target.selectedOptions, (option) => String(option.value))
      setFormData((prev) => ({ ...prev, roles: selected }))
      return
    }

    if (name === 'is_active') {
      setFormData((prev) => ({ ...prev, is_active: value === '1' ? 1 : 0 }))
      return
    }

    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  const saveRecord = async () => {
    if (saving) return
    setSaving(true)
    setError(null)

    try {
      const payload = {
        email: String(formData.email || '').trim(),
        full_name: formData.full_name || null,
        is_active: formData.is_active,
        roles: formData.roles || [],
        contact_type: formData.contact_type || null,
        contact: formData.contact || null,
        hire_date: formData.hire_date || null,
        pay_rate: formData.pay_rate === '' ? null : Number(formData.pay_rate)
      }

      if (!payload.email) {
        setError('Email is required')
        return
      }

      if (isEdit) {
        await api.put(`/users/${id}`, payload)
      } else {
        await api.post('/users', payload)
      }

      navigate('/users')
    } catch (err) {
      setError(err?.response?.data?.error || 'Failed to save user')
    } finally {
      setSaving(false)
      setOpenSaveConfirm(false)
    }
  }

  const archiveRecord = async () => {
    if (!isEdit || saving) return
    setSaving(true)
    setError(null)
    try {
      await api.put(`/users/${id}`, { is_active: 0 })
      navigate('/users')
    } catch (err) {
      setError(err?.response?.data?.error || 'Failed to archive user')
    } finally {
      setSaving(false)
      setOpenArchiveConfirm(false)
    }
  }

  const askCancel = () => {
    if (!isDirty) {
      navigate('/users')
      return
    }
    setOpenCancelConfirm(true)
  }

  return (
    <div className="page">
      <div className="page-header user-form-shell">
        <div>
          <h1 className="page-title">{isEdit ? 'Edit User & Employee' : 'Create User & Employee'}</h1>
          <p className="page-subtitle">
            Credentials are generated automatically. Username will use the email address.
          </p>
        </div>
      </div>

      <div className="card user-form-card">
        {error && (
          <div style={{ background: '#fee', border: '1px solid #f99', color: '#c33', padding: '10px 14px', borderRadius: 6, marginBottom: 16 }}>
            {error}
          </div>
        )}

        {loading ? (
          <p>Loading...</p>
        ) : (
          <form onSubmit={(e) => { e.preventDefault(); setOpenSaveConfirm(true) }}>
            <div className="user-form-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(220px, 1fr))', gap: 12 }}>
              <div>
                <label>Email *</label>
                <input type="email" name="email" value={formData.email || ''} onChange={handleInputChange} style={{ width: '100%', padding: 8, borderRadius: 4, border: '1px solid #ccc' }} />
              </div>

              <div>
                <label>Full Name</label>
                <input type="text" name="full_name" value={formData.full_name || ''} onChange={handleInputChange} style={{ width: '100%', padding: 8, borderRadius: 4, border: '1px solid #ccc' }} />
              </div>

              <div>
                <label>Roles</label>
                <select name="roles" multiple value={Array.isArray(formData.roles) ? formData.roles : []} onChange={handleInputChange} style={{ width: '100%', padding: 8, borderRadius: 4, border: '1px solid #ccc', minHeight: 90 }}>
                  {rolesOptions.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>

              <div>
                <label>Active</label>
                <select name="is_active" value={formData.is_active === 1 ? '1' : '0'} onChange={handleInputChange} style={{ width: '100%', padding: 8, borderRadius: 4, border: '1px solid #ccc' }}>
                  <option value="1">Yes</option>
                  <option value="0">No</option>
                </select>
              </div>

              <div>
                <label>Contact Type</label>
                <select name="contact_type" value={formData.contact_type || ''} onChange={handleInputChange} style={{ width: '100%', padding: 8, borderRadius: 4, border: '1px solid #ccc' }}>
                  <option value="">-- None --</option>
                  <option value="Mobile">Mobile Number</option>
                  <option value="Telephone">Telephone Number</option>
                </select>
              </div>

              <div>
                <label>Contact Number</label>
                <input type="tel" name="contact" value={formData.contact || ''} maxLength="11" onChange={handleInputChange} placeholder="e.g. 09163550310" style={{ width: '100%', padding: 8, borderRadius: 4, border: '1px solid #ccc' }} />
              </div>

              <div>
                <label>Hire Date</label>
                <input type="date" name="hire_date" value={formData.hire_date || ''} onChange={handleInputChange} style={{ width: '100%', padding: 8, borderRadius: 4, border: '1px solid #ccc' }} />
              </div>

              <div>
                <label>Pay Rate</label>
                <input type="number" name="pay_rate" value={formData.pay_rate || ''} step="0.01" onChange={handleInputChange} style={{ width: '100%', padding: 8, borderRadius: 4, border: '1px solid #ccc' }} />
              </div>
            </div>

            <div className="user-form-actions" style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? 'Saving...' : 'Save'}
              </button>
              <button type="button" className="btn btn-secondary" onClick={askCancel} disabled={saving}>
                Cancel
              </button>
              {isEdit && (
                <button type="button" className="btn btn-danger" onClick={() => setOpenArchiveConfirm(true)} disabled={saving}>
                  Archive
                </button>
              )}
            </div>
          </form>
        )}
      </div>

      <ConfirmModal
        open={openSaveConfirm}
        onClose={() => setOpenSaveConfirm(false)}
        title={isEdit ? 'Confirm Save Changes' : 'Confirm Create User'}
        message={isEdit ? 'Save all updates to this user and employee record?' : 'Create this user and employee record now?'}
        onConfirm={saveRecord}
        loading={saving}
      />

      <ConfirmModal
        open={openCancelConfirm}
        onClose={() => setOpenCancelConfirm(false)}
        title="Discard Changes"
        message="You have unsaved changes. Leave this page and discard them?"
        onConfirm={() => navigate('/users')}
      />

      <ConfirmModal
        open={openArchiveConfirm}
        onClose={() => setOpenArchiveConfirm(false)}
        title="Archive User"
        message="Archive this user now? The account will be inactive."
        onConfirm={archiveRecord}
        loading={saving}
        danger
      />
    </div>
  )
}
