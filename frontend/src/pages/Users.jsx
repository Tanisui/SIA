import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/api.js'
import { ConfirmModal } from '../components/Modal.js'

export default function Users(){
  const navigate = useNavigate()
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(false)
  const [selectedUser, setSelectedUser] = useState(null)
  const [showDetails, setShowDetails] = useState(false)
  const [archiveTarget, setArchiveTarget] = useState(null)
  const [archiveLoading, setArchiveLoading] = useState(false)
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

  const handleArchive = async () => {
    if (!archiveTarget || archiveLoading) return
    setArchiveLoading(true)
    setError(null)
    try {
      await api.put(`/users/${archiveTarget.id}`, { is_active: 0 })
      setSuccess('User archived successfully')
      setArchiveTarget(null)
      await fetchUsers()
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to archive user')
    } finally {
      setArchiveLoading(false)
    }
  }

  const showUserDetails = (user) => {
    setSelectedUser(user)
    setShowDetails(true)
  }

  return (
    <div className="page">
      {/* Header */}
      <div className="page-header">
        <h1 className="page-title">Users & Employees</h1>
        <button className="btn btn-primary" onClick={() => navigate('/users/new')}>
          + Create new
        </button>
      </div>

      {/* Messages */}
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

      {/* Users Table */}
      <div className="table-wrap" style={{ marginBottom: 40 }}>
        {loading ? (
          <p>Loading...</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Username</th>
                <th>Email</th>
                <th>Full Name</th>
                <th>Primary Role</th>
                <th>Status</th>
                <th>Contact</th>
                <th>Hire Date</th>
                <th>Pay Rate</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id}>
                  <td>{u.username}</td>
                  <td>{u.email}</td>
                  <td>{u.full_name || '-'}</td>
                  <td>{(u.roles || [])[0] || '-'}</td>
                  <td>{u.is_active === 1 ? 'Active' : 'Inactive'}</td>
                  <td>{u.employee?.contact || '-'}</td>
                  <td>{u.employee?.hire_date ? new Date(u.employee.hire_date).toLocaleDateString() : '-'}</td>
                  <td>{u.employee?.pay_rate ? '₱' + parseFloat(u.employee.pay_rate).toFixed(2) : '-'}</td>
                  <td style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: 12, marginRight: 4 }} onClick={() => showUserDetails(u)}>
                      View
                    </button>
                    <button className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: 12, marginRight: 4 }} onClick={() => navigate(`/users/${u.id}/edit`)}>
                      Edit
                    </button>
                    <button className="btn btn-danger" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => setArchiveTarget(u)}>
                      Archive
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Details Modal */}
      {showDetails && selectedUser && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'white', padding: 30, borderRadius: 8, maxWidth: 700, maxHeight: '90vh', overflow: 'auto', width: '90%' }}>
            <h2>User Details</h2>
            <div style={{ marginBottom: 20 }}>
              <div style={{ marginBottom: 12, borderBottom: '1px solid #eee', paddingBottom: 12 }}>
                <strong>Username: </strong>
                <span>{selectedUser.username}</span>
              </div>
              <div style={{ marginBottom: 12, borderBottom: '1px solid #eee', paddingBottom: 12 }}>
                <strong>Email: </strong>
                <span>{selectedUser.email}</span>
              </div>
              <div style={{ marginBottom: 12, borderBottom: '1px solid #eee', paddingBottom: 12 }}>
                <strong>Full Name: </strong>
                <span>{selectedUser.full_name || '-'}</span>
              </div>
              <div style={{ marginBottom: 12, borderBottom: '1px solid #eee', paddingBottom: 12 }}>
                <strong>Roles: </strong>
                <span>{(selectedUser.roles || []).join(', ') || '-'}</span>
              </div>
              <div style={{ marginBottom: 12, borderBottom: '1px solid #eee', paddingBottom: 12 }}>
                <strong>Active: </strong>
                <span>{selectedUser.is_active === 1 ? 'Yes' : 'No'}</span>
              </div>

              {selectedUser.employee && (
                <>
                  <h4 style={{ marginTop: 20, marginBottom: 10 }}>Employee Information</h4>
                  <div style={{ marginBottom: 12, borderBottom: '1px solid #eee', paddingBottom: 12 }}>
                    <strong>Contact Type: </strong>
                    <span>{selectedUser.employee.contact_type || '-'}</span>
                  </div>
                  <div style={{ marginBottom: 12, borderBottom: '1px solid #eee', paddingBottom: 12 }}>
                    <strong>Contact: </strong>
                    <span>{selectedUser.employee.contact || '-'}</span>
                  </div>
                  <div style={{ marginBottom: 12, borderBottom: '1px solid #eee', paddingBottom: 12 }}>
                    <strong>Hire Date: </strong>
                    <span>{selectedUser.employee.hire_date ? new Date(selectedUser.employee.hire_date).toLocaleDateString() : '-'}</span>
                  </div>
                  <div style={{ marginBottom: 12, borderBottom: '1px solid #eee', paddingBottom: 12 }}>
                    <strong>Pay Rate: </strong>
                    <span>{selectedUser.employee.pay_rate ? '₱' + parseFloat(selectedUser.employee.pay_rate).toFixed(2) : '-'}</span>
                  </div>
                </>
              )}
            </div>
            <button onClick={() => setShowDetails(false)} className="btn btn-secondary" style={{ width: '100%' }}>
              Close
            </button>
          </div>
        </div>
      )}

      <ConfirmModal
        open={!!archiveTarget}
        onClose={() => setArchiveTarget(null)}
        title="Archive User"
        message={archiveTarget ? `Archive ${archiveTarget.username}? This will set the account inactive.` : ''}
        onConfirm={handleArchive}
        loading={archiveLoading}
        danger
      />
    </div>
  )
}
