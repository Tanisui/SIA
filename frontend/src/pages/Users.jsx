import React, { useEffect, useState } from 'react'
import api from '../api/api.js'

export default function Users(){
  const [rolesOptions, setRolesOptions] = useState([])
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(false)
  const [selectedUser, setSelectedUser] = useState(null)
  const [showCreate, setShowCreate] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const [showDetails, setShowDetails] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)
  const [formData, setFormData] = useState({})

  useEffect(()=>{
    fetchRoles()
    fetchUsers()
  }, [])

  const fetchRoles = async () => {
    try {
      const res = await api.get('/roles')
      const opts = (res.data || []).map(r => ({ value: r.id, label: r.name }))
      setRolesOptions(opts)
    } catch (err) {
      console.error('Failed to fetch roles:', err)
    }
  }

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

  const handleCreate = async (e) => {
    e.preventDefault()
    setError(null)
    setSuccess(null)
    try {
      await api.post('/users', formData)
      setSuccess('User created successfully')
      setFormData({})
      setShowCreate(false)
      fetchUsers()
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create user')
    }
  }

  const handleUpdate = async (e) => {
    e.preventDefault()
    setError(null)
    setSuccess(null)
    try {
      const { id, ...data } = formData
      await api.put(`/users/${id}`, data)
      setSuccess('User updated successfully')
      setFormData({})
      setShowEdit(false)
      fetchUsers()
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update user')
    }
  }

  const handleDelete = async (id) => {
    if (!confirm('Delete this user? Related employee data will also be deleted.')) return
    setError(null)
    try {
      await api.delete(`/users/${id}`)
      setSuccess('User deleted successfully')
      fetchUsers()
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to delete user')
    }
  }

  const startEdit = (user) => {
    setSelectedUser(user)
    setFormData({
      id: user.id,
      username: user.username,
      email: user.email,
      full_name: user.full_name || '',
      is_active: user.is_active,
      roles: user.roles || [],
      contact_type: user.employee?.contact_type || '',
      contact: user.employee?.contact || '',
      hire_date: user.employee?.hire_date || '',
      pay_rate: user.employee?.pay_rate || ''
    })
    setShowEdit(true)
  }

  const startCreate = () => {
    setFormData({
      username: '',
      email: '',
      full_name: '',
      is_active: 1,
      roles: [],
      contact_type: '',
      contact: '',
      hire_date: '',
      pay_rate: ''
    })
    setShowCreate(true)
  }

  const showUserDetails = (user) => {
    setSelectedUser(user)
    setShowDetails(true)
  }

  const handleInputChange = (e) => {
    const { name, value } = e.target
    if (name === 'roles') {
      const selected = Array.from(e.target.selectedOptions, option => option.value)
      setFormData(prev => ({ ...prev, [name]: selected }))
    } else if (name === 'is_active') {
      setFormData(prev => ({ ...prev, [name]: value === '1' ? 1 : 0 }))
    } else {
      setFormData(prev => ({ ...prev, [name]: value }))
    }
  }

  return (
    <div className="page">
      {/* Header */}
      <div className="page-header">
        <h1 className="page-title">Users & Employees</h1>
        <button className="btn btn-primary" onClick={startCreate}>
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
                <th>Roles</th>
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
                  <td>{(u.roles || []).join(', ') || '-'}</td>
                  <td>{u.is_active === 1 ? 'Active' : 'Inactive'}</td>
                  <td>{u.employee?.contact || '-'}</td>
                  <td>{u.employee?.hire_date ? new Date(u.employee.hire_date).toLocaleDateString() : '-'}</td>
                  <td>{u.employee?.pay_rate ? '₱' + parseFloat(u.employee.pay_rate).toFixed(2) : '-'}</td>
                  <td style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: 12, marginRight: 4 }} onClick={() => showUserDetails(u)}>
                      View
                    </button>
                    <button className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: 12, marginRight: 4 }} onClick={() => startEdit(u)}>
                      Edit
                    </button>
                    <button className="btn btn-danger" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => handleDelete(u.id)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Create/Edit Modal */}
      {(showCreate || showEdit) && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'white', padding: 30, borderRadius: 8, maxWidth: 700, maxHeight: '90vh', overflow: 'auto', width: '90%' }}>
            <h2>{showEdit ? 'Edit User' : 'Create User'}</h2>
            <form onSubmit={showEdit ? handleUpdate : handleCreate}>
              <div style={{ marginBottom: 15 }}>
                <label>Username</label>
                <input type="text" name="username" value={formData.username || ''} onChange={handleInputChange} style={{ width: '100%', padding: 8, borderRadius: 4, border: '1px solid #ccc' }} />
              </div>
              <div style={{ marginBottom: 15 }}>
                <label>Email</label>
                <input type="email" name="email" value={formData.email || ''} onChange={handleInputChange} style={{ width: '100%', padding: 8, borderRadius: 4, border: '1px solid #ccc' }} />
              </div>
              <div style={{ marginBottom: 15 }}>
                <label>Full Name</label>
                <input type="text" name="full_name" value={formData.full_name || ''} onChange={handleInputChange} style={{ width: '100%', padding: 8, borderRadius: 4, border: '1px solid #ccc' }} />
              </div>
              <div style={{ marginBottom: 15 }}>
                <label>Roles</label>
                <select name="roles" multiple value={Array.isArray(formData.roles) ? formData.roles.map(String) : []} onChange={handleInputChange} style={{ width: '100%', padding: 8, borderRadius: 4, border: '1px solid #ccc' }}>
                  {rolesOptions.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>
              <div style={{ marginBottom: 15 }}>
                <label>Active</label>
                <select name="is_active" value={formData.is_active === 1 ? '1' : '0'} onChange={handleInputChange} style={{ width: '100%', padding: 8, borderRadius: 4, border: '1px solid #ccc' }}>
                  <option value="1">Yes</option>
                  <option value="0">No</option>
                </select>
              </div>

              <h4 style={{ marginTop: 20, marginBottom: 10 }}>Employee Information (Optional)</h4>
              <div style={{ marginBottom: 15 }}>
                <label>Contact Type</label>
                <select name="contact_type" value={formData.contact_type || ''} onChange={handleInputChange} style={{ width: '100%', padding: 8, borderRadius: 4, border: '1px solid #ccc' }}>
                  <option value="">-- None --</option>
                  <option value="Mobile">Mobile Number</option>
                  <option value="Telephone">Telephone Number</option>
                </select>
              </div>
              <div style={{ marginBottom: 15 }}>
                <label>Contact Number</label>
                <input type="tel" name="contact" value={formData.contact || ''} maxLength="11" onChange={handleInputChange} placeholder="e.g. 09163550310" style={{ width: '100%', padding: 8, borderRadius: 4, border: '1px solid #ccc' }} />
              </div>
              <div style={{ marginBottom: 15 }}>
                <label>Hire Date</label>
                <input type="date" name="hire_date" value={formData.hire_date || ''} onChange={handleInputChange} style={{ width: '100%', padding: 8, borderRadius: 4, border: '1px solid #ccc' }} />
              </div>
              <div style={{ marginBottom: 15 }}>
                <label>Pay Rate</label>
                <input type="number" name="pay_rate" value={formData.pay_rate || ''} step="0.01" onChange={handleInputChange} style={{ width: '100%', padding: 8, borderRadius: 4, border: '1px solid #ccc' }} />
              </div>

              <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>
                  {showEdit ? 'Update' : 'Create'}
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => { setShowCreate(false); setShowEdit(false); setFormData({}) }} style={{ flex: 1 }}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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
    </div>
  )
}
