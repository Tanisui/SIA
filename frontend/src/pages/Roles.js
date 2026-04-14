import React, { useEffect, useState } from 'react'
import api from '../api/api.js'

// --- ROLE TEMPLATES CONFIGURATION ---
// These names must match the permission names in your database
const ROLE_TEMPLATES = {
  'Cashier': ['products.view', 'sales.create', 'sales.view', 'customers.view'],
  'Warehouse Manager': ['products.view', 'products.create', 'inventory.update', 'suppliers.view', 'purchase_orders.create'],
  'Admin': 'all' 
};

export default function Roles() {
  const [roles, setRoles] = useState([])
  const [permissions, setPermissions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)
  
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(null)
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  const [perms, setPerms] = useState([])

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true)
        const [rolesRes, permsRes] = await Promise.all([
          api.get('/roles'),
          api.get('/rbac/permissions')
        ])
        setRoles(rolesRes.data || [])
        // Safety check to ensure we get an array
        setPermissions(permsRes.data?.permissions || permsRes.data || [])
      } catch (e) {
        setError('Failed to load roles or permissions')
      }
      setLoading(false)
    }
    load()
  }, [])

  const applyTemplate = (templateName) => {
    if (!templateName) return;
    setError(null);

    if (templateName === 'Admin') {
      // Select everything
      const allPermNames = permissions.map(p => typeof p === 'string' ? p : p.name);
      setPerms(allPermNames);
    } else {
      // Select specific preset
      const preset = ROLE_TEMPLATES[templateName] || [];
      setPerms(preset);
    }
  };

  const save = async (e) => {
    e.preventDefault()
    if (!name.trim()) return setError('Role name is required')
    if (perms.length === 0) return setError('Please select at least one permission')

    try {
      if (editing) {
        await api.put(`/roles/${editing}`, { name, description: desc, permissions: perms })
        setSuccess('Role updated successfully')
      } else {
        await api.post('/roles', { name, description: desc, permissions: perms })
        setSuccess('New role created successfully')
      }
      
      setTimeout(() => {
        setShowForm(false)
        setEditing(null)
        setName('')
        setDesc('')
        setPerms([])
        setError(null)
        const reload = async () => {
          const r = await api.get('/roles')
          setRoles(r.data || [])
        }
        reload()
      }, 500)
    } catch (err) {
      setError(err?.response?.data?.error || 'Failed to save role')
    }
  }

  const startEdit = (r) => {
    setEditing(r.id)
    setName(r.name)
    setDesc(r.description || '')
    setPerms(r.permissions || [])
    setShowForm(true)
    setError(null)
    setSuccess(null)
  }

  const startNew = () => {
    setEditing(null)
    setName('')
    setDesc('')
    setPerms([])
    setShowForm(true)
    setError(null)
    setSuccess(null)
  }

  const deleteRole = async (id) => {
    if (!confirm('Are you sure you want to delete this role?')) return
    try {
      await api.delete(`/roles/${id}`)
      setSuccess('Role deleted')
      const r = await api.get('/roles')
      setRoles(r.data || [])
    } catch (e) {
      setError('Delete failed')
    }
  }

  const togglePerm = (p) => {
    setPerms(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p])
  }

  return React.createElement('div', { className: 'page' },
    React.createElement('div', { className: 'page-header' },
      React.createElement('h1', { className: 'page-title' }, 'Roles & Permissions'),
      React.createElement('p', { className: 'page-subtitle' }, 'Define what your staff can and cannot do')
    ),

    error ? React.createElement('div', { className: 'error-msg', style: { marginBottom: 12, padding: '10px', background: '#fee2e2', color: '#b91c1c', borderRadius: '6px', fontSize: '13px' } }, error) : null,
    success ? React.createElement('div', { style: { background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#15803d', padding: '10px 12px', borderRadius: 6, marginBottom: 12, fontSize: 13 } }, success) : null,

    loading
      ? React.createElement('div', { style: { textAlign: 'center', padding: 30, color: '#64748b' } }, 'Loading configuration...')
      : showForm
        ? React.createElement('div', { className: 'card', style: { marginBottom: 20 } },
          React.createElement('h3', { style: { marginBottom: 15 } }, editing ? 'Modify Existing Role' : 'Create New System Role'),
          React.createElement('form', { onSubmit: save },
            React.createElement('div', { style: { display: 'flex', gap: '15px', marginBottom: 15 } },
              React.createElement('div', { style: { flex: 1 } },
                React.createElement('label', { className: 'form-label' }, 'Role Name *'),
                React.createElement('input', { className: 'form-input', value: name, onChange: e => setName(e.target.value), placeholder: 'e.g. Senior Cashier' })
              ),
              React.createElement('div', { style: { flex: 1 } },
                React.createElement('label', { className: 'form-label' }, 'Description'),
                React.createElement('input', { className: 'form-input', value: desc, onChange: e => setDesc(e.target.value), placeholder: 'Briefly explain this role' })
              )
            ),

            // --- THE NEW TEMPLATE SECTION ---
            React.createElement('div', { style: { marginBottom: 15, padding: '10px', background: '#f8fafc', borderRadius: '6px', border: '1px dashed #cbd5e1' } },
              React.createElement('label', { className: 'form-label', style: { color: '#475569' } }, 'Quick-Fill Template'),
              React.createElement('select', { 
                className: 'form-input', 
                style: { cursor: 'pointer' },
                onChange: (e) => applyTemplate(e.target.value) 
              },
                React.createElement('option', { value: '' }, '-- Select a job preset --'),
                React.createElement('option', { value: 'Cashier' }, 'Standard Cashier (Sales & POS)'),
                React.createElement('option', { value: 'Warehouse Manager' }, 'Warehouse Manager (Inventory & Suppliers)'),
                React.createElement('option', { value: 'Admin' }, 'Full Administrator (Everything)')
              ),
              React.createElement('p', { style: { fontSize: '11px', color: '#94a3b8', marginTop: '5px' } }, 'Selecting a template will auto-check the necessary boxes below.')
            ),

            React.createElement('div', { style: { marginBottom: 20 } },
              React.createElement('label', { className: 'form-label' }, `Specific Permissions * (${perms.length} assigned)`),
              React.createElement('div', { style: { border: '1px solid #e2e8f0', borderRadius: 6, height: 250, overflow: 'auto', background: '#ffffff' } },
                (!permissions || permissions.length === 0)
                  ? React.createElement('div', { style: { padding: 20, textAlign: 'center', color: '#94a3b8' } }, 'No permissions loaded from database.')
                  : permissions.map(p => {
                      const pName = typeof p === 'string' ? p : p.name;
                      const pDesc = p.description ? ` — ${p.description}` : '';
                      const isChecked = perms.includes(pName);

                      return React.createElement('label', { 
                        key: pName, 
                        style: { 
                          display: 'flex', 
                          alignItems: 'center', 
                          padding: '10px 12px', 
                          fontSize: '12px', 
                          cursor: 'pointer', 
                          borderBottom: '1px solid #f1f5f9', 
                          background: isChecked ? '#eff6ff' : 'transparent',
                          transition: 'background 0.2s'
                        } 
                      },
                        React.createElement('input', { 
                          type: 'checkbox', 
                          checked: isChecked, 
                          onChange: () => togglePerm(pName), 
                          style: { marginRight: 10, width: 16, height: 16, cursor: 'pointer' } 
                        }),
                        React.createElement('div', null,
                          React.createElement('strong', { style: { color: isChecked ? '#1d4ed8' : '#334155' } }, pName),
                          React.createElement('span', { style: { color: '#64748b', marginLeft: '5px' } }, pDesc)
                        )
                      )
                    })
              )
            ),

            React.createElement('div', { style: { display: 'flex', gap: 10 } },
              React.createElement('button', { type: 'submit', className: 'btn btn-primary', style: { padding: '10px 24px' } }, editing ? 'Update Changes' : 'Create Role'),
              React.createElement('button', { type: 'button', className: 'btn btn-secondary', onClick: () => setShowForm(false) }, 'Cancel')
            )
          )
        )
        : React.createElement('div', null,
          React.createElement('div', { style: { marginBottom: 15 } },
            React.createElement('button', { className: 'btn btn-primary', onClick: startNew }, '+ Add New Role')
          ),
          React.createElement('div', { className: 'table-wrap' },
            React.createElement('table', null,
              React.createElement('thead', null,
                React.createElement('tr', null,
                  React.createElement('th', null, 'Role Name'),
                  React.createElement('th', null, 'Description'),
                  React.createElement('th', null, 'Access Level'),
                  React.createElement('th', null, 'Actions')
                )
              ),
              React.createElement('tbody', null,
                roles.length === 0
                  ? React.createElement('tr', null, React.createElement('td', { colSpan: 4, style: { textAlign: 'center', padding: 24, color: '#94a3b8' } }, 'No roles defined yet.'))
                  : roles.map(r => React.createElement('tr', { key: r.id },
                      React.createElement('td', { style: { fontWeight: 600, color: '#0f172a' } }, r.name),
                      React.createElement('td', null, r.description || '—'),
                      React.createElement('td', null, 
                        React.createElement('span', { style: { background: '#f1f5f9', padding: '2px 8px', borderRadius: '10px', fontSize: '11px' } }, `${r.permissions?.length || 0} Perms`)
                      ),
                      React.createElement('td', null,
                        React.createElement('button', { className: 'btn btn-secondary', style: { padding: '4px 10px', fontSize: 11, marginRight: 6 }, onClick: () => startEdit(r) }, 'Edit'),
                        React.createElement('button', { className: 'btn btn-danger', style: { padding: '4px 10px', fontSize: 11 }, onClick: () => deleteRole(r.id) }, 'Delete')
                      )
                    ))
              )
            )
          )
        )
  )
}