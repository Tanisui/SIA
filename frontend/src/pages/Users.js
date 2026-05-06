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
      setError('Failed to load users.')
    }
    setLoading(false)
  }

  const handleCreate = async (e) => {
    e.preventDefault()
    setError(null)
    setSuccess(null)
    try {
      await api.post('/users', formData)
      setSuccess('User account created.')
      setFormData({})
      setShowCreate(false)
      fetchUsers()
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create the user account.')
    }
  }

  const handleUpdate = async (e) => {
    e.preventDefault()
    setError(null)
    setSuccess(null)
    try {
      const { id, ...data } = formData
      await api.put(`/users/${id}`, data)
      setSuccess('User account updated.')
      setFormData({})
      setShowEdit(false)
      fetchUsers()
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update the user account.')
    }
  }

  const handleDelete = async (id) => {
    if (!confirm('Delete this user account? The associated employee record will also be removed. This action cannot be undone.')) return
    setError(null)
    try {
      await api.delete(`/users/${id}`)
      setSuccess('User account deleted.')
      fetchUsers()
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to delete the user account.')
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
      setFormData(prev => ({ ...prev, [name]: value ? [String(value)] : [] }))
    } else if (name === 'is_active') {
      setFormData(prev => ({ ...prev, [name]: value === '1' ? 1 : 0 }))
    } else {
      setFormData(prev => ({ ...prev, [name]: value }))
    }
  }

  return React.createElement('div', { className: 'page' },
    React.createElement('div', { className: 'page-header' },
      React.createElement('h1', { className: 'page-title' }, 'Users'),
      React.createElement('button', { 
        className: 'btn btn-primary',
        onClick: startCreate
      }, '+  Create new')
    ),

    error && React.createElement('div', { style: { background: '#fee', border: '1px solid #f99', color: '#c33', padding: '10px 14px', borderRadius: 6, marginBottom: 16 } }, error),
    success && React.createElement('div', { style: { background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#15803d', padding: '10px 14px', borderRadius: 6, marginBottom: 16 } }, success),

    React.createElement('div', { className: 'table-wrap', style: { marginBottom: 40 } },
      loading ? React.createElement('p', null, 'Loading...') : 
      React.createElement('table', null,
        React.createElement('thead', null,
          React.createElement('tr', null,
            React.createElement('th', null, 'Username'),
            React.createElement('th', null, 'Email'),
            React.createElement('th', null, 'Full Name'),
            React.createElement('th', null, 'Roles'),
            React.createElement('th', null, 'Status'),
            React.createElement('th', null, 'Contact'),
            React.createElement('th', null, 'Hire Date'),
            React.createElement('th', null, 'Pay Rate'),
            React.createElement('th', null, 'Actions')
          )
        ),
        React.createElement('tbody', null,
          users.map(u => React.createElement('tr', { key: u.id },
            React.createElement('td', null, u.username),
            React.createElement('td', null, u.email),
            React.createElement('td', null, u.full_name || '-'),
            React.createElement('td', null, (u.roles || []).join(', ') || '-'),
            React.createElement('td', null, u.is_active === 1 ? 'Active' : 'Inactive'),
            React.createElement('td', null, u.employee?.contact || '-'),
            React.createElement('td', null, u.employee?.hire_date ? new Date(u.employee.hire_date).toLocaleDateString() : '-'),
            React.createElement('td', null, u.employee?.pay_rate ? '₱' + parseFloat(u.employee.pay_rate).toFixed(2) : '-'),
            React.createElement('td', { style: { display: 'flex', gap: 8 } },
              React.createElement('button', { 
                className: 'btn btn-secondary',
                style: { padding: '4px 10px', fontSize: 12, marginRight: 4 },
                onClick: () => showUserDetails(u)
              }, 'View'),
              React.createElement('button', { 
                className: 'btn btn-secondary',
                style: { padding: '4px 10px', fontSize: 12, marginRight: 4 },
                onClick: () => startEdit(u)
              }, 'Edit'),
              React.createElement('button', { 
                className: 'btn btn-danger',
                style: { padding: '4px 10px', fontSize: 12 },
                onClick: () => handleDelete(u.id)
              }, 'Delete')
            )
          ))
        )
      )
    ),

    (showCreate || showEdit) && React.createElement('div', { 
      style: { 
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, 
        background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
      }
    },
      React.createElement('div', { 
        style: { 
          background: 'white', padding: 30, borderRadius: 8, maxWidth: 500, maxHeight: '90vh', overflow: 'auto', width: '90%'
        }
      },
        React.createElement('h2', null, showEdit ? 'Edit User' : 'Create User'),
        React.createElement('form', { onSubmit: showEdit ? handleUpdate : handleCreate },
          React.createElement('div', { style: { marginBottom: 15 } },
            React.createElement('label', null, 'Username'),
            React.createElement('input', { 
              type: 'text', name: 'username', value: formData.username || '',
              onChange: handleInputChange,
              style: { width: '100%', padding: 8, borderRadius: 4, border: '1px solid #ccc' }
            })
          ),
          React.createElement('div', { style: { marginBottom: 15 } },
            React.createElement('label', null, 'Email'),
            React.createElement('input', { 
              type: 'email', name: 'email', value: formData.email || '',
              onChange: handleInputChange,
              style: { width: '100%', padding: 8, borderRadius: 4, border: '1px solid #ccc' }
            })
          ),
          React.createElement('div', { style: { marginBottom: 15 } },
            React.createElement('label', null, 'Full Name'),
            React.createElement('input', { 
              type: 'text', name: 'full_name', value: formData.full_name || '',
              onChange: handleInputChange,
              style: { width: '100%', padding: 8, borderRadius: 4, border: '1px solid #ccc' }
            })
          ),
          React.createElement('div', { style: { marginBottom: 15 } },
            React.createElement('label', null, 'Roles'),
            React.createElement('select', { 
              name: 'roles',
              value: Array.isArray(formData.roles) && formData.roles[0] ? String(formData.roles[0]) : '',
              onChange: handleInputChange,
              style: { width: '100%', padding: 8, borderRadius: 4, border: '1px solid #ccc' }
            },
              React.createElement('option', { value: '' }, 'Select role'),
              rolesOptions.map(r => React.createElement('option', { key: r.value, value: r.value }, r.label))
            )
          ),
          React.createElement('div', { style: { marginBottom: 15 } },
            React.createElement('label', null, 'Active'),
            React.createElement('select', { 
              name: 'is_active', value: formData.is_active === 1 ? '1' : '0',
              onChange: handleInputChange,
              style: { width: '100%', padding: 8, borderRadius: 4, border: '1px solid #ccc' }
            },
              React.createElement('option', { value: '1' }, 'Yes'),
              React.createElement('option', { value: '0' }, 'No')
            )
          ),
          React.createElement('h4', { style: { marginTop: 20, marginBottom: 10 } }, 'Employee Information (Optional)'),
          React.createElement('div', { style: { marginBottom: 15 } },
            React.createElement('label', null, 'Contact Type'),
            React.createElement('select', { 
              name: 'contact_type', value: formData.contact_type || '',
              onChange: handleInputChange,
              style: { width: '100%', padding: 8, borderRadius: 4, border: '1px solid #ccc' }
            },
              React.createElement('option', { value: '' }, '-- None --'),
              React.createElement('option', { value: 'Mobile' }, 'Mobile Number'),
              React.createElement('option', { value: 'Telephone' }, 'Telephone Number')
            )
          ),
          React.createElement('div', { style: { marginBottom: 15 } },
            React.createElement('label', null, 'Contact Number'),
            React.createElement('input', { 
              type: 'tel', name: 'contact', value: formData.contact || '', maxLength: 11,
              onChange: handleInputChange,
              placeholder: 'e.g. 09163550310',
              style: { width: '100%', padding: 8, borderRadius: 4, border: '1px solid #ccc' }
            })
          ),
          React.createElement('div', { style: { marginBottom: 15 } },
            React.createElement('label', null, 'Hire Date'),
            React.createElement('input', { 
              type: 'date', name: 'hire_date', value: formData.hire_date || '',
              onChange: handleInputChange,
              style: { width: '100%', padding: 8, borderRadius: 4, border: '1px solid #ccc' }
            })
          ),
          React.createElement('div', { style: { marginBottom: 15 } },
            React.createElement('label', null, 'Pay Rate'),
            React.createElement('input', { 
              type: 'number', name: 'pay_rate', value: formData.pay_rate || '', step: '0.01',
              onChange: handleInputChange,
              style: { width: '100%', padding: 8, borderRadius: 4, border: '1px solid #ccc' }
            })
          ),
          React.createElement('div', { style: { display: 'flex', gap: 10, marginTop: 20 } },
            React.createElement('button', { 
              type: 'submit',
              className: 'btn btn-primary',
              style: { flex: 1 }
            }, showEdit ? 'Update' : 'Create'),
            React.createElement('button', { 
              type: 'button',
              className: 'btn btn-secondary',
              onClick: () => { setShowCreate(false); setShowEdit(false); setFormData({}) },
              style: { flex: 1 }
            }, 'Cancel')
          )
        )
      )
    ),

    showDetails && selectedUser && React.createElement('div', { 
      style: { 
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, 
        background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
      }
    },
      React.createElement('div', { 
        style: { 
          background: 'white', padding: 30, borderRadius: 8, maxWidth: 700, maxHeight: '90vh', overflow: 'auto', width: '90%'
        }
      },
        React.createElement('h2', null, 'User Details'),
        React.createElement('div', { style: { marginBottom: 20 } },
          React.createElement('div', { style: { marginBottom: 12, borderBottom: '1px solid #eee', paddingBottom: 12 } },
            React.createElement('strong', null, 'Username: '),
            React.createElement('span', null, selectedUser.username)
          ),
          React.createElement('div', { style: { marginBottom: 12, borderBottom: '1px solid #eee', paddingBottom: 12 } },
            React.createElement('strong', null, 'Email: '),
            React.createElement('span', null, selectedUser.email)
          ),
          React.createElement('div', { style: { marginBottom: 12, borderBottom: '1px solid #eee', paddingBottom: 12 } },
            React.createElement('strong', null, 'Full Name: '),
            React.createElement('span', null, selectedUser.full_name || '-')
          ),
          React.createElement('div', { style: { marginBottom: 12, borderBottom: '1px solid #eee', paddingBottom: 12 } },
            React.createElement('strong', null, 'Roles: '),
            React.createElement('span', null, (selectedUser.roles || []).join(', ') || '-')
          ),
          React.createElement('div', { style: { marginBottom: 12, borderBottom: '1px solid #eee', paddingBottom: 12 } },
            React.createElement('strong', null, 'Active: '),
            React.createElement('span', null, selectedUser.is_active === 1 ? 'Yes' : 'No')
          ),
          selectedUser.employee && React.createElement(React.Fragment, null,
            React.createElement('h4', { style: { marginTop: 20, marginBottom: 10 } }, 'Employee Information'),
            React.createElement('div', { style: { marginBottom: 12, borderBottom: '1px solid #eee', paddingBottom: 12 } },
              React.createElement('strong', null, 'Contact Type: '),
              React.createElement('span', null, selectedUser.employee.contact_type || '-')
            ),
            React.createElement('div', { style: { marginBottom: 12, borderBottom: '1px solid #eee', paddingBottom: 12 } },
              React.createElement('strong', null, 'Contact: '),
              React.createElement('span', null, selectedUser.employee.contact || '-')
            ),
            React.createElement('div', { style: { marginBottom: 12, borderBottom: '1px solid #eee', paddingBottom: 12 } },
              React.createElement('strong', null, 'Hire Date: '),
              React.createElement('span', null, selectedUser.employee.hire_date ? new Date(selectedUser.employee.hire_date).toLocaleDateString() : '-')
            ),
            React.createElement('div', { style: { marginBottom: 12, borderBottom: '1px solid #eee', paddingBottom: 12 } },
              React.createElement('strong', null, 'Pay Rate: '),
              React.createElement('span', null, selectedUser.employee.pay_rate ? '₱' + parseFloat(selectedUser.employee.pay_rate).toFixed(2) : '-')
            )
          )
        ),
        React.createElement('button', { 
          onClick: () => setShowDetails(false),
          className: 'btn btn-secondary',
          style: { width: '100%' }
        }, 'Close')
      )
    )
