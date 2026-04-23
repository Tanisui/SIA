import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/api.js'
import { ConfirmModal } from '../components/Modal.js'

function ActionIcon({ children }) {
  return (
    <span className="users-action-icon" aria-hidden="true">
      {children}
    </span>
  )
}

function ViewIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z" />
      <circle cx="12" cy="12" r="2.8" />
    </svg>
  )
}

function EditIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" />
      <path d="m16.5 3.5 4 4L8 20l-5 1 1-5 12.5-12.5Z" />
    </svg>
  )
}

function DeleteIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="m19 6-1 14H6L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  )
}

function composeDisplayName(user = {}) {
  const composed = [user.first_name, user.last_name]
    .map((part) => String(part || '').trim())
    .filter(Boolean)
    .join(' ')
  return composed || user.full_name || user.employee?.name || '-'
}

export default function Users() {
  const navigate = useNavigate()
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(false)
  const [selectedUser, setSelectedUser] = useState(null)
  const [showDetails, setShowDetails] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)

  useEffect(() => {
    fetchUsers()
  }, [])

  const fetchUsers = async () => {
    setLoading(true)
    try {
      const res = await api.get('/users')
      setUsers(res.data || [])
    } catch {
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

  const formatDate = (value) => {
    if (!value) return '-'
    const parsed = new Date(value)
    return Number.isNaN(parsed.getTime()) ? '-' : parsed.toLocaleDateString()
  }

  const formatCurrency = (value) => {
    if (value === null || value === undefined || value === '') return '-'
    const parsed = Number(value)
    return Number.isFinite(parsed) ? `\u20b1${parsed.toFixed(2)}` : '-'
  }

  const detailsRowStyle = {
    marginBottom: 12,
    borderBottom: '1px solid #eee',
    paddingBottom: 12
  }

  return (
    <div className="page users-page">
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

      <div className="table-wrap responsive users-table-wrap" style={{ marginBottom: 40 }}>
        {loading ? (
          <p>Loading...</p>
        ) : (
          <table className="users-table">
            <thead>
              <tr>
                <th>Account</th>
                <th>Profile</th>
                <th>Status</th>
                <th>Contact</th>
                <th>Employment</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center text-muted">
                    No users found.
                  </td>
                </tr>
              ) : (
                users.map((user) => {
                  const primaryRole = (user.roles || [])[0] || '-'
                  const isActive = user.is_active === 1
                  const contactNumber = user.employee?.mobile_number || user.employee?.contact || '-'
                  const displayName = composeDisplayName(user)

                  return (
                    <tr key={user.id}>
                      <td>
                        <div className="users-cell-stack">
                          <div className="users-cell-primary">{user.username || '-'}</div>
                          <div className="users-cell-secondary">{user.email || '-'}</div>
                        </div>
                      </td>
                      <td>
                        <div className="users-cell-stack">
                          <div className="users-cell-primary">{displayName}</div>
                          <div className="users-cell-secondary">{primaryRole}</div>
                        </div>
                      </td>
                      <td>
                        <span className={`badge ${isActive ? 'badge-success' : 'badge-neutral'}`}>
                          {isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td>
                        <div className="users-cell-stack">
                          <div className="users-cell-primary">{contactNumber}</div>
                          <div className="users-cell-secondary">{user.employee?.employment_type || 'No employment type'}</div>
                        </div>
                      </td>
                      <td>
                        <div className="users-cell-stack">
                          <div className="users-cell-primary">{formatDate(user.employee?.hire_date)}</div>
                          <div className="users-cell-secondary">Pay Rate {formatCurrency(user.employee?.pay_rate)}</div>
                        </div>
                      </td>
                      <td className="text-right users-actions-cell">
                        <div className="table-actions users-table-actions">
                          <button
                            type="button"
                            className="btn btn-secondary btn-icon users-action-btn"
                            title={`View ${user.username || 'user'}`}
                            aria-label={`View ${user.username || 'user'}`}
                            onClick={() => showUserDetails(user)}
                          >
                            <ActionIcon><ViewIcon /></ActionIcon>
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary btn-icon users-action-btn"
                            title={`Edit ${user.username || 'user'}`}
                            aria-label={`Edit ${user.username || 'user'}`}
                            onClick={() => navigate(`/users/${user.id}/edit`)}
                          >
                            <ActionIcon><EditIcon /></ActionIcon>
                          </button>
                          <button
                            type="button"
                            className="btn btn-danger btn-icon users-action-btn"
                            title={`Delete ${user.username || 'user'}`}
                            aria-label={`Delete ${user.username || 'user'}`}
                            onClick={() => setDeleteTarget(user)}
                          >
                            <ActionIcon><DeleteIcon /></ActionIcon>
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
              <div style={detailsRowStyle}>
                <strong>Username: </strong>
                <span>{selectedUser.username}</span>
              </div>
              <div style={detailsRowStyle}>
                <strong>Email: </strong>
                <span>{selectedUser.email}</span>
              </div>
              <div style={detailsRowStyle}>
                <strong>First Name: </strong>
                <span>{selectedUser.first_name || '-'}</span>
              </div>
              <div style={detailsRowStyle}>
                <strong>Last Name: </strong>
                <span>{selectedUser.last_name || '-'}</span>
              </div>
              <div style={detailsRowStyle}>
                <strong>Access Role: </strong>
                <span>{(selectedUser.roles || []).join(', ') || '-'}</span>
              </div>
              <div style={detailsRowStyle}>
                <strong>Active: </strong>
                <span>{selectedUser.is_active === 1 ? 'Yes' : 'No'}</span>
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
                    <strong>Department / Store: </strong>
                    <span>{selectedUser.employee.department_name || '-'}</span>
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
