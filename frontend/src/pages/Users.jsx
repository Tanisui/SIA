import React, { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import api from '../api/api.js'
import { ConfirmModal } from '../components/Modal.js'
import Icon from '../components/Icons.js'

function getInitials(text) {
  const trimmed = String(text || '').trim()
  if (!trimmed) return '·'
  const parts = trimmed.split(/\s+/).filter(Boolean)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function composeDisplayName(user = {}) {
  if (user.display_name) return user.display_name
  const composed = [user.first_name, user.last_name]
    .map((part) => String(part || '').trim())
    .filter(Boolean)
    .join(' ')
  return composed || user.full_name || user.employee?.name || user.username || '—'
}

function formatDate(value) {
  if (!value) return '—'
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? '—' : parsed.toLocaleDateString()
}

function formatCurrency(value) {
  if (value === null || value === undefined || value === '') return '—'
  const parsed = Number(value)
  return Number.isFinite(parsed) ? `₱${parsed.toFixed(2)}` : '—'
}

export default function Users() {
  const location = useLocation()
  const navigate = useNavigate()
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(false)
  const [selectedUser, setSelectedUser] = useState(null)
  const [showDetails, setShowDetails] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [error, setError] = useState(location.state?.flashError || null)
  const [success, setSuccess] = useState(location.state?.flashSuccess || null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [roleFilter, setRoleFilter] = useState('')

  useEffect(() => { fetchUsers() }, [])

  useEffect(() => {
    const flashSuccess = location.state?.flashSuccess || null
    const flashError = location.state?.flashError || null
    if (!flashSuccess && !flashError) return
    setSuccess(flashSuccess)
    setError(flashError)
    navigate(location.pathname, { replace: true, state: null })
  }, [location.pathname, location.state, navigate])

  const fetchUsers = async () => {
    setLoading(true)
    try {
      const res = await api.get('/users')
      setUsers(res.data || [])
    } catch {
      setError('Failed to fetch users')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget || deleteLoading) return
    setDeleteLoading(true)
    setError(null)
    try {
      await api.delete(`/users/${deleteTarget.id}`)
      setSuccess('User deleted successfully')
      setDeleteTarget(null)
      await fetchUsers()
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to delete user')
    } finally {
      setDeleteLoading(false)
    }
  }

  const showUserDetails = (user) => {
    setSelectedUser(user)
    setShowDetails(true)
  }

  const allRoles = useMemo(() => {
    const set = new Set()
    users.forEach((u) => {
      const r = u.primary_role || (u.roles || [])[0]
      if (r) set.add(r)
    })
    return Array.from(set).sort()
  }, [users])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return users.filter((u) => {
      const isActive = u.is_active === 1
      if (statusFilter === 'active' && !isActive) return false
      if (statusFilter === 'inactive' && isActive) return false
      const role = u.primary_role || (u.roles || [])[0] || ''
      if (roleFilter && role !== roleFilter) return false
      if (!q) return true
      const haystack = [
        u.username, u.email, u.first_name, u.last_name, u.display_name, u.full_name,
        u.employee?.mobile_number, u.employee?.contact, u.employee?.position_title,
        u.employee?.department_name, role
      ].map((v) => String(v || '').toLowerCase()).join(' ')
      return haystack.includes(q)
    })
  }, [users, search, statusFilter, roleFilter])

  const stats = useMemo(() => {
    const total = users.length
    const active = users.filter((u) => u.is_active === 1).length
    const inactive = total - active
    return { total, active, inactive }
  }, [users])

  return (
    <div className="page users-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Users</h1>
          <p className="page-subtitle">All accounts that can sign in to the POS — including their roles and employment details.</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary btn-sm" type="button" onClick={fetchUsers} disabled={loading}>
            {loading ? 'Refreshing…' : '↺ Refresh'}
          </button>
          <button className="btn btn-primary" type="button" onClick={() => navigate('/users/new')}>
            + New User
          </button>
        </div>
      </div>

      {error && <div className="error-msg" style={{ marginBottom: 14 }}>{error}</div>}
      {success && <div className="success-msg" style={{ marginBottom: 14 }}>{success}</div>}

      <div className="users-stat-row">
        <div className="users-stat"><span className="users-stat-label">Total</span><span className="users-stat-value">{stats.total}</span></div>
        <div className="users-stat tone-success"><span className="users-stat-label">Active</span><span className="users-stat-value">{stats.active}</span></div>
        <div className="users-stat tone-muted"><span className="users-stat-label">Inactive</span><span className="users-stat-value">{stats.inactive}</span></div>
        <div className="users-stat tone-gold"><span className="users-stat-label">Roles in use</span><span className="users-stat-value">{allRoles.length}</span></div>
      </div>

      <div className="entity-toolbar users-toolbar">
        <div className="entity-toolbar-search">
          <input
            type="text"
            className="form-input"
            placeholder="Search username, name, email, position, role…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select className="form-input users-toolbar-select" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
          <option value="">All Roles</option>
          {allRoles.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <select className="form-input users-toolbar-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All Statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
        <div className="entity-toolbar-meta">
          {loading ? 'Loading…' : `${filtered.length} of ${users.length}`}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="card entity-empty">
          <div className="entity-empty-icon"><Icon name="users" size={28} /></div>
          <div className="entity-empty-title">
            {users.length === 0 ? 'No users yet' : 'No matching users'}
          </div>
          <div className="entity-empty-sub">
            {users.length === 0
              ? 'Create the first account to start using the POS.'
              : 'Try a different search term or clear the filters.'}
          </div>
          {users.length === 0 && (
            <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={() => navigate('/users/new')}>
              + New User
            </button>
          )}
        </div>
      ) : (
        <div className="user-card-grid">
          {filtered.map((user) => {
            const primaryRole = user.primary_role || (user.roles || [])[0] || '—'
            const isActive = user.is_active === 1
            const displayName = composeDisplayName(user)
            const positionLabel = user.position_label || user.employee?.position_title || user.employee?.role || ''
            const contactNumber = user.contact_number || user.employee?.mobile_number || user.employee?.contact || ''
            const employmentType = user.employment_type || user.employee?.employment_type || ''
            return (
              <div key={user.id} className={`user-card ${!isActive ? 'is-inactive' : ''}`}
                   onClick={() => showUserDetails(user)} role="button" tabIndex={0}
                   onKeyDown={(e) => { if (e.key === 'Enter') showUserDetails(user) }}>
                <div className="user-card-head">
                  <div className="user-card-avatar" aria-hidden="true">{getInitials(displayName)}</div>
                  <div className="user-card-id">
                    <div className="user-card-name">{displayName}</div>
                    <div className="user-card-handle">@{user.username || '—'}</div>
                  </div>
                  <span className={`badge ${isActive ? 'badge-success' : 'badge-neutral'} user-card-status`}>
                    {isActive ? 'Active' : 'Inactive'}
                  </span>
                </div>

                <div className="user-card-role-chip">{primaryRole}</div>

                <div className="user-card-meta">
                  {positionLabel && (
                    <div className="user-card-meta-row">
                      <span className="user-card-meta-label">Position</span>
                      <span className="user-card-meta-value">{positionLabel}</span>
                    </div>
                  )}
                  {user.email && (
                    <div className="user-card-meta-row">
                      <span className="user-card-meta-label">Email</span>
                      <span className="user-card-meta-value user-card-meta-truncate">{user.email}</span>
                    </div>
                  )}
                  {contactNumber && (
                    <div className="user-card-meta-row">
                      <span className="user-card-meta-label">Mobile</span>
                      <span className="user-card-meta-value">{contactNumber}</span>
                    </div>
                  )}
                  {(employmentType || user.employee?.hire_date) && (
                    <div className="user-card-meta-row">
                      <span className="user-card-meta-label">Employment</span>
                      <span className="user-card-meta-value">
                        {employmentType || '—'}{user.employee?.hire_date ? ` · since ${formatDate(user.employee.hire_date)}` : ''}
                      </span>
                    </div>
                  )}
                </div>

                <div className="user-card-actions" onClick={(e) => e.stopPropagation()}>
                  <button className="btn btn-secondary btn-sm" type="button" onClick={() => showUserDetails(user)}>View</button>
                  <button className="btn btn-outline btn-sm" type="button" onClick={() => navigate(`/users/${user.id}/edit`)}>Edit</button>
                  <button className="btn btn-danger btn-sm" type="button" onClick={() => setDeleteTarget(user)}>Delete</button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {showDetails && selectedUser && (
        <div className="user-detail-overlay" onClick={() => setShowDetails(false)}>
          <div className="user-detail-paper" onClick={(e) => e.stopPropagation()}>
            <div className="user-detail-head">
              <div className="user-card-avatar" aria-hidden="true">{getInitials(composeDisplayName(selectedUser))}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <h2 className="user-detail-name">{composeDisplayName(selectedUser)}</h2>
                <div className="user-detail-handle">@{selectedUser.username}</div>
              </div>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowDetails(false)}>✕ Close</button>
            </div>
            <div className="user-detail-body">
              <div className="user-detail-section">
                <div className="user-detail-section-title">Account</div>
                <div className="user-detail-grid">
                  <div><span className="user-detail-k">Email</span><span className="user-detail-v">{selectedUser.email || '—'}</span></div>
                  <div><span className="user-detail-k">Status</span><span className="user-detail-v">{selectedUser.is_active === 1 ? 'Active' : 'Inactive'}</span></div>
                  <div><span className="user-detail-k">Role(s)</span><span className="user-detail-v">{(selectedUser.roles || []).join(', ') || '—'}</span></div>
                  <div><span className="user-detail-k">First Name</span><span className="user-detail-v">{selectedUser.first_name || '—'}</span></div>
                  <div><span className="user-detail-k">Last Name</span><span className="user-detail-v">{selectedUser.last_name || '—'}</span></div>
                </div>
              </div>
              {selectedUser.employee && (
                <div className="user-detail-section">
                  <div className="user-detail-section-title">Employee</div>
                  <div className="user-detail-grid">
                    <div><span className="user-detail-k">Mobile</span><span className="user-detail-v">{selectedUser.employee.mobile_number || selectedUser.employee.contact || '—'}</span></div>
                    <div><span className="user-detail-k">Position</span><span className="user-detail-v">{selectedUser.employee.position_title || '—'}</span></div>
                    <div><span className="user-detail-k">Department</span><span className="user-detail-v">{selectedUser.employee.department_name || '—'}</span></div>
                    <div><span className="user-detail-k">Hire Date</span><span className="user-detail-v">{formatDate(selectedUser.employee.hire_date)}</span></div>
                    <div><span className="user-detail-k">Type</span><span className="user-detail-v">{selectedUser.employee.employment_type || '—'}</span></div>
                    <div><span className="user-detail-k">Pay Rate</span><span className="user-detail-v">{formatCurrency(selectedUser.employee.pay_rate)}</span></div>
                  </div>
                </div>
              )}
            </div>
            <div className="user-detail-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setShowDetails(false)}>Close</button>
              <button type="button" className="btn btn-primary" onClick={() => { setShowDetails(false); navigate(`/users/${selectedUser.id}/edit`) }}>Edit User</button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Delete User"
        message={deleteTarget ? `Delete ${deleteTarget.username} permanently? This action cannot be undone.` : ''}
        onConfirm={handleDelete}
        loading={deleteLoading}
        danger
      />
    </div>
  )
}
