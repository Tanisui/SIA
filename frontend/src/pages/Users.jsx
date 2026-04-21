import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/api.js'
import { ConfirmModal } from '../components/Modal.js'

const FILTERS = [
  { key: 'all', label: 'All Users' },
  { key: 'active', label: 'Active' },
  { key: 'inactive', label: 'Inactive' },
  { key: 'eligible', label: 'Payroll Eligible' },
  { key: 'excluded', label: 'Payroll Excluded' },
  { key: 'payroll_incomplete', label: 'Payroll Incomplete' }
]

function hasValue(value) {
  return value !== null && value !== undefined && value !== ''
}

function formatDate(value) {
  if (!value) return '-'
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? '-' : parsed.toLocaleDateString()
}

function formatCurrency(value) {
  if (!hasValue(value)) return '-'
  const parsed = Number(value)
  return Number.isFinite(parsed) ? `₱${parsed.toFixed(2)}` : '-'
}

function formatEnumLabel(value) {
  if (!value) return '-'
  return String(value)
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function getPayRateLabel(payBasis) {
  const normalized = String(payBasis || '').toUpperCase()
  if (normalized === 'DAILY') return 'Daily Rate'
  if (normalized === 'MONTHLY') return 'Monthly Salary'
  if (normalized === 'HOURLY') return 'Hourly Rate'
  return 'Pay Rate'
}

function getMissingFieldLabel(field) {
  const labels = {
    pay_basis: 'Pay basis',
    pay_rate: 'Pay rate',
    payroll_frequency: 'Payroll frequency',
    payroll_method: 'Payroll method',
    tax_enabled: 'Tax flag',
    sss_enabled: 'SSS flag',
    philhealth_enabled: 'PhilHealth flag',
    pagibig_enabled: 'Pag-IBIG flag',
    payroll_eligible: 'Payroll eligible'
  }
  return labels[field] || formatEnumLabel(field)
}

function matchesFilter(user, filterKey) {
  const payroll = user?.payroll_profile || {}
  if (filterKey === 'active') return Number(user?.is_active) === 1
  if (filterKey === 'inactive') return Number(user?.is_active) !== 1
  if (filterKey === 'eligible') return Boolean(payroll?.payroll_eligible)
  if (filterKey === 'excluded') return !payroll?.payroll_eligible
  if (filterKey === 'payroll_incomplete') return payroll?.payroll_profile_status !== 'COMPLETE'
  return true
}

function matchesSearch(user, searchTerm) {
  const query = String(searchTerm || '').trim().toLowerCase()
  if (!query) return true

  const fields = [
    user?.username,
    user?.email,
    user?.full_name,
    (user?.roles || []).join(' '),
    user?.employee?.mobile_number,
    user?.employee?.contact,
    user?.employee?.employment_type,
    user?.payroll_profile?.pay_basis,
    user?.payroll_profile?.payroll_frequency,
    user?.payroll_profile?.payroll_method
  ]

  return fields.some((value) => String(value || '').toLowerCase().includes(query))
}

function getFilterCounts(users = []) {
  const counts = {
    all: users.length,
    active: 0,
    inactive: 0,
    eligible: 0,
    excluded: 0,
    payroll_incomplete: 0
  }

  for (const user of users) {
    const payroll = user?.payroll_profile || {}
    if (Number(user?.is_active) === 1) counts.active += 1
    else counts.inactive += 1
    if (payroll?.payroll_eligible) counts.eligible += 1
    else counts.excluded += 1
    if (payroll?.payroll_profile_status !== 'COMPLETE') counts.payroll_incomplete += 1
  }

  return counts
}

function renderPayRateDisplay(payroll) {
  if (!hasValue(payroll?.pay_rate)) {
    return (
      <div>
        <div className="text-muted" style={{ fontSize: 12 }}>Rate</div>
        <span className="text-muted">Not set</span>
      </div>
    )
  }

  return (
    <div>
      <div className="text-muted" style={{ fontSize: 12 }}>{getPayRateLabel(payroll?.pay_basis)}</div>
      <strong>{formatCurrency(payroll?.pay_rate)}</strong>
    </div>
  )
}

export default function Users(){
  const navigate = useNavigate()
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [activeFilter, setActiveFilter] = useState('all')
  const [selectedUser, setSelectedUser] = useState(null)
  const [showDetails, setShowDetails] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)

  useEffect(()=>{
    fetchUsers()
  }, [])

  const fetchUsers = async () => {
    setLoading(true)
    try {
      const res = await api.get('/users')
      setUsers(res.data || [])
    } catch (err) {
      setError('Failed to fetch users')
    }
    setLoading(false)
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

  const detailsRowStyle = {
    marginBottom: 12,
    borderBottom: '1px solid #eee',
    paddingBottom: 12
  }

  const filterCounts = useMemo(() => getFilterCounts(users), [users])

  const filteredUsers = useMemo(() => {
    return users.filter((user) => matchesFilter(user, activeFilter) && matchesSearch(user, searchTerm))
  }, [users, activeFilter, searchTerm])

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Users</h1>
        <button className="btn btn-primary" onClick={() => navigate('/users/new')}>
          + Create new
        </button>
      </div>

      {error && (
        <div style={{ background: '#fee', border: '1px solid #f99', color: '#c33', padding: '10px 14px', borderRadius: 6, marginBottom: 16 }}>
          {error}
        </div>
      )}
      {success && (
        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#15803d', padding: '10px 14px', borderRadius: 6, marginBottom: 16 }}>
          {success}
        </div>
      )}

      <div className="card users-toolbar-card">
        <div className="users-toolbar-row">
          <div className="users-search-wrap">
            <input
              className="form-input"
              placeholder="Search by name, username, role, contact, or payroll setup"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />
          </div>
          <div className="users-toolbar-meta text-muted">
            Showing {filteredUsers.length} of {users.length}
          </div>
        </div>

        <div className="users-filter-row">
          {FILTERS.map((filter) => (
            <button
              key={filter.key}
              type="button"
              className={`users-filter-chip ${activeFilter === filter.key ? 'is-active' : ''}`}
              onClick={() => setActiveFilter(filter.key)}
            >
              <span>{filter.label}</span>
              <span className="users-filter-chip-count">{filterCounts[filter.key] || 0}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="table-wrap responsive users-table-wrap" style={{ marginBottom: 40 }}>
        {loading ? (
          <p>Loading...</p>
        ) : (
          <table className="users-table">
            <thead>
              <tr>
                <th>Account</th>
                <th>Employment & Contact</th>
                <th>Payroll Snapshot</th>
                <th>Completeness</th>
                <th>Status</th>
                <th className="text-right users-actions-col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center text-muted">
                    No users match your filter.
                  </td>
                </tr>
              ) : (
                filteredUsers.map(u => {
                  const payroll = u.payroll_profile || {}
                  const missingFields = Array.isArray(payroll.payroll_profile_missing_fields)
                    ? payroll.payroll_profile_missing_fields
                    : []
                  const missingPreview = missingFields.slice(0, 2).map(getMissingFieldLabel).join(', ')

                  return (
                    <tr key={u.id}>
                      <td>
                        <div className="users-cell-stack">
                          <strong>{u.full_name || u.username || '-'}</strong>
                          <span className="text-muted">{u.username || '-'}</span>
                          <span className="text-muted">{u.email || '-'}</span>
                        </div>
                      </td>
                      <td>
                        <div className="users-cell-stack">
                          <span className="badge badge-neutral">{(u.roles || [])[0] || 'No role'}</span>
                          <span>
                            {hasValue(payroll.employment_type) || hasValue(u.employee?.employment_type)
                              ? formatEnumLabel(payroll.employment_type || u.employee?.employment_type)
                              : 'Type not set'}
                          </span>
                          <span className="text-muted">Contact: {u.employee?.mobile_number || u.employee?.contact || '-'}</span>
                          <span className="text-muted">Hire: {formatDate(u.employee?.hire_date)}</span>
                        </div>
                      </td>
                      <td>
                        <div className="users-payroll-chip-row">
                          <span className={payroll.payroll_eligible ? 'badge badge-success' : 'badge badge-neutral'}>
                            {payroll.payroll_eligible ? 'Eligible' : 'Excluded'}
                          </span>
                          <span className={hasValue(payroll.pay_basis) ? 'badge badge-info' : 'badge badge-warning'}>
                            {hasValue(payroll.pay_basis) ? formatEnumLabel(payroll.pay_basis) : 'No Basis'}
                          </span>
                          <span className={hasValue(payroll.payroll_frequency) ? 'badge badge-info' : 'badge badge-warning'}>
                            {hasValue(payroll.payroll_frequency) ? formatEnumLabel(payroll.payroll_frequency) : 'No Frequency'}
                          </span>
                        </div>
                        <div className="users-cell-stack users-payroll-meta">
                          {renderPayRateDisplay(payroll)}
                          <span className="text-muted">
                            Method: {hasValue(payroll.payroll_method) ? formatEnumLabel(payroll.payroll_method) : 'Not set'}
                          </span>
                        </div>
                      </td>
                      <td>
                        <div className="users-payroll-chip-row">
                          <span className={payroll.government_ids_status === 'COMPLETE' ? 'badge badge-success' : 'badge badge-warning'}>
                            Gov IDs {payroll.government_ids_status === 'COMPLETE' ? 'Complete' : 'Incomplete'}
                          </span>
                          <span className={payroll.payroll_profile_status === 'COMPLETE' ? 'badge badge-success' : 'badge badge-warning'}>
                            Profile {payroll.payroll_profile_status === 'COMPLETE' ? 'Complete' : 'Incomplete'}
                          </span>
                        </div>
                        {missingFields.length > 0 ? (
                          <div className="text-muted users-missing-text">
                            Missing: {missingPreview}{missingFields.length > 2 ? ` +${missingFields.length - 2}` : ''}
                          </div>
                        ) : null}
                      </td>
                      <td>
                        <span className={u.is_active === 1 ? 'badge badge-success' : 'badge badge-danger'}>
                          {u.is_active === 1 ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="text-right users-actions-col">
                        <div className="table-actions users-table-actions">
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => showUserDetails(u)}
                          >
                            View
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => navigate(`/users/${u.id}/edit`)}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            onClick={() => navigate(`/payroll/profiles?userId=${u.id}`)}
                          >
                            Configure Payroll
                          </button>
                          <button
                            type="button"
                            className="btn btn-danger btn-sm"
                            onClick={() => setDeleteTarget(u)}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        )}
      </div>

      {showDetails && selectedUser && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'white', padding: 30, borderRadius: 8, maxWidth: 700, maxHeight: '90vh', overflow: 'auto', width: '90%' }}>
            <h2>User Details</h2>
            <div style={{ marginBottom: 20 }}>
              {(() => {
                const payroll = selectedUser.payroll_profile || {}
                const missingFields = Array.isArray(payroll.payroll_profile_missing_fields)
                  ? payroll.payroll_profile_missing_fields
                  : []
                return (
                  <>
              <div style={detailsRowStyle}>
                <strong>Username: </strong>
                <span>{selectedUser.username}</span>
              </div>
              <div style={detailsRowStyle}>
                <strong>Email: </strong>
                <span>{selectedUser.email}</span>
              </div>
              <div style={detailsRowStyle}>
                <strong>Full Name: </strong>
                <span>{selectedUser.full_name || '-'}</span>
              </div>
              <div style={detailsRowStyle}>
                <strong>Roles: </strong>
                <span>{(selectedUser.roles || []).join(', ') || '-'}</span>
              </div>
              <div style={detailsRowStyle}>
                <strong>Active: </strong>
                <span>{selectedUser.is_active === 1 ? 'Yes' : 'No'}</span>
              </div>

              <h4 style={{ marginTop: 20, marginBottom: 10 }}>Payroll Overview</h4>
              <div style={detailsRowStyle}>
                <strong>Payroll Eligible: </strong>
                <span>{payroll.payroll_eligible ? 'Yes' : 'No'}</span>
              </div>
              <div style={detailsRowStyle}>
                <strong>Pay Basis: </strong>
                <span>{hasValue(payroll.pay_basis) ? formatEnumLabel(payroll.pay_basis) : '-'}</span>
              </div>
              <div style={detailsRowStyle}>
                <strong>Payroll Frequency: </strong>
                <span>{hasValue(payroll.payroll_frequency) ? formatEnumLabel(payroll.payroll_frequency) : '-'}</span>
              </div>
              <div style={detailsRowStyle}>
                <strong>Payroll Method: </strong>
                <span>{hasValue(payroll.payroll_method) ? formatEnumLabel(payroll.payroll_method) : '-'}</span>
              </div>
              <div style={detailsRowStyle}>
                <strong>Government IDs Status: </strong>
                <span>{payroll.government_ids_status === 'COMPLETE' ? 'Complete' : 'Incomplete'}</span>
              </div>
              <div style={detailsRowStyle}>
                <strong>Payroll Profile Status: </strong>
                <span>{payroll.payroll_profile_status === 'COMPLETE' ? 'Complete' : 'Incomplete'}</span>
              </div>
              {missingFields.length > 0 ? (
                <div style={detailsRowStyle}>
                  <strong>Missing Payroll Fields: </strong>
                  <span>{missingFields.map(getMissingFieldLabel).join(', ')}</span>
                </div>
              ) : null}
              <div style={detailsRowStyle}>
                <strong>{getPayRateLabel(payroll.pay_basis)}: </strong>
                <span>{formatCurrency(payroll.pay_rate)}</span>
              </div>

              {selectedUser.employee && (
                <>
                  <h4 style={{ marginTop: 20, marginBottom: 10 }}>Employee Information</h4>
                  <div style={detailsRowStyle}>
                    <strong>Mobile Number: </strong>
                    <span>{selectedUser.employee.mobile_number || selectedUser.employee.contact || '-'}</span>
                  </div>
                  <div style={detailsRowStyle}>
                    <strong>Position Title: </strong>
                    <span>{selectedUser.employee.position_title || '-'}</span>
                  </div>
                  <div style={detailsRowStyle}>
                    <strong>Hire Date: </strong>
                    <span>{formatDate(selectedUser.employee.hire_date)}</span>
                  </div>
                  <div style={detailsRowStyle}>
                    <strong>Employment Type: </strong>
                    <span>{selectedUser.employee.employment_type || '-'}</span>
                  </div>
                  <div style={detailsRowStyle}>
                    <strong>Pay Rate: </strong>
                    <span>{formatCurrency(selectedUser.employee.pay_rate)}</span>
                  </div>
                </>
              )}
                  </>
                )
              })()}
            </div>
            <button type="button" onClick={() => setShowDetails(false)} className="btn btn-secondary" style={{ width: '100%' }}>
              Close
            </button>
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
