import React, { useEffect, useState } from 'react'
import api from '../api/api.js'

const ROLE_TEMPLATES = {
  Cashier: ['products.view', 'inventory.view', 'sales.view', 'sales.create', 'sales.print_receipt', 'customers.view', 'customers.create'],
  'Warehouse Manager': ['products.view', 'products.create', 'products.update', 'inventory.view', 'inventory.receive', 'inventory.dispatch', 'inventory.adjust', 'inventory.reconcile', 'suppliers.view', 'suppliers.create'],
  Admin: ['admin.*']
}

const GROUPS = {
  admin: { title: 'Administration', description: 'Users, roles, sign-in, and system-wide controls', accent: '#7c3aed', order: 1 },
  sales: { title: 'Sales', description: 'POS, receipts, refunds, discounts, and checkout controls', accent: '#db2777', order: 2 },
  inventory: { title: 'Inventory', description: 'Stock movement, reconciliation, and low-stock management', accent: '#0f766e', order: 3 },
  catalog: { title: 'Catalog', description: 'Product records, imports, and exports', accent: '#2563eb', order: 4 },
  customers: { title: 'Customers', description: 'Customer profiles and relationship data', accent: '#ea580c', order: 5 },
  purchasing: { title: 'Suppliers & Purchasing', description: 'Suppliers and purchase-order workflow', accent: '#4f46e5', order: 6 },
  staff: { title: 'Staff & Attendance', description: 'Employee records and attendance tracking', accent: '#059669', order: 7 },
  finance: { title: 'Finance', description: 'Payroll and finance reporting', accent: '#b45309', order: 8 },
  reports: { title: 'Reports', description: 'Operational and analytics reports', accent: '#1d4ed8', order: 9 },
  other: { title: 'Other', description: 'Uncategorized access rules', accent: '#475569', order: 10 }
}

const PREFIX_TO_GROUP = {
  admin: 'admin',
  auth: 'admin',
  users: 'admin',
  roles: 'admin',
  system: 'admin',
  sales: 'sales',
  inventory: 'inventory',
  products: 'catalog',
  customers: 'customers',
  suppliers: 'purchasing',
  purchase_orders: 'purchasing',
  employees: 'staff',
  attendance: 'staff',
  payroll: 'finance',
  finance: 'finance',
  reports: 'reports'
}

const SUBJECTS = {
  auth: 'system access',
  users: 'user accounts',
  roles: 'roles',
  products: 'products',
  inventory: 'inventory',
  sales: 'sales history',
  customers: 'customers',
  suppliers: 'suppliers',
  purchase_orders: 'purchase orders',
  employees: 'employee records',
  attendance: 'attendance history',
  payroll: 'payroll',
  reports: 'reports',
  finance: 'finance reports',
  system: 'system status'
}

const ACTIONS = {
  view: { label: (subject) => `View ${subject}`, hint: (subject) => `See and review ${subject}.` },
  create: { label: (subject) => `Add ${subject}`, hint: (subject) => `Create new ${subject}.` },
  update: { label: (subject) => `Edit ${subject}`, hint: (subject) => `Update existing ${subject}.` },
  delete: { label: (subject) => `Delete ${subject}`, hint: (subject) => `Remove ${subject} from the system.` },
  import: { label: (subject) => `Import ${subject}`, hint: (subject) => `Bring ${subject} in from external files.` },
  export: { label: (subject) => `Export ${subject}`, hint: (subject) => `Download ${subject} for reporting or backup.` }
}

const OVERRIDES = {
  'admin.*': { label: 'Full administrator access', hint: 'Gives this role access to every screen, setting, and high-impact action.' },
  'auth.login': { label: 'Sign in to the system', hint: 'Allows staff to access the app using their account.' },
  'auth.logout': { label: 'Sign out of the system', hint: 'Allows staff to end their session safely.' },
  'inventory.receive': { label: 'Receive stock', hint: 'Record incoming stock from purchases or deliveries.' },
  'inventory.dispatch': { label: 'Dispatch stock', hint: 'Record stock going out for transfers or controlled release.' },
  'inventory.adjust': { label: 'Adjust stock quantities', hint: 'Correct stock levels when counts or records need changes.' },
  'inventory.reconcile': { label: 'Reconcile inventory', hint: 'Match physical counts to the system and finalize stock checks.' },
  'inventory.lowstock_alert_manage': { label: 'Manage low-stock alerts', hint: 'Maintain warning thresholds for low inventory.' },
  'sales.create': { label: 'Create sales in POS', hint: 'Use the POS screen to build and complete sales.' },
  'sales.refund': { label: 'Process refunds', hint: 'Handle returns, reversals, and refund transactions.' },
  'sales.print_receipt': { label: 'Print receipts', hint: 'Print customer receipts from the sales flow.' },
  'sales.discount': { label: 'Apply discounts', hint: 'Reduce prices during checkout using approved discounts.' },
  'sales.price_override': { label: 'Override selling prices', hint: 'Change item prices directly during checkout.' },
  'attendance.record': { label: 'Record attendance', hint: 'Log time in, time out, or attendance entries for staff.' },
  'payroll.process': { label: 'Process payroll', hint: 'Run payroll calculations and finalize payouts.' },
  'payroll.adjust': { label: 'Adjust payroll entries', hint: 'Correct payroll values before or after processing.' },
  'finance.reports.view': { label: 'View finance reports', hint: 'Open finance-focused reports for management review.' },
  'purchase_orders.create': { label: 'Create purchase orders', hint: 'Prepare and issue purchase orders to suppliers.' },
  'system.health': { label: 'View system health', hint: 'Check the status of system operations and services.' },
  'system.config.update': { label: 'Update system settings', hint: 'Change important configuration values for the system.' },
  'system.audit.view': { label: 'View audit trail', hint: 'Review activity logs and sensitive system events.' }
}

const SENSITIVE = new Set(['admin.*', 'users.delete', 'roles.delete', 'sales.refund', 'sales.price_override', 'payroll.process', 'payroll.adjust', 'system.config.update', 'system.audit.view'])

function titleCase(value) {
  return String(value || '')
    .split(/[_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function buildPermissionMeta(permission) {
  const key = typeof permission === 'string' ? permission : String(permission?.name || '')
  if (!key) return null

  const override = OVERRIDES[key]
  const prefix = key.split('.')[0]
  const groupKey = PREFIX_TO_GROUP[prefix] || 'other'
  const group = GROUPS[groupKey] || GROUPS.other
  const rawDescription = typeof permission === 'object' ? String(permission?.description || '').trim() : ''
  const description = rawDescription && rawDescription !== key ? rawDescription : ''

  if (override) {
    return {
      key,
      label: override.label,
      hint: description || override.hint,
      groupKey,
      groupTitle: group.title,
      groupDescription: group.description,
      groupAccent: group.accent,
      groupOrder: group.order,
      isSensitive: SENSITIVE.has(key),
      searchText: `${key} ${override.label} ${override.hint} ${group.title}`.toLowerCase()
    }
  }

  const parts = key.split('.')
  const action = parts[parts.length - 1]
  const subjectKey = parts.length > 2 ? parts.slice(0, parts.length - 1).join('.') : parts[0]
  const subject = SUBJECTS[subjectKey] || SUBJECTS[parts[0]] || titleCase(subjectKey)
  const actionMeta = ACTIONS[action] || { label: () => `${titleCase(action)} ${subject}`, hint: () => 'Access to this part of the system.' }

  return {
    key,
    label: actionMeta.label(subject),
    hint: description || actionMeta.hint(subject),
    groupKey,
    groupTitle: group.title,
    groupDescription: group.description,
    groupAccent: group.accent,
    groupOrder: group.order,
    isSensitive: SENSITIVE.has(key),
    searchText: `${key} ${actionMeta.label(subject)} ${description || actionMeta.hint(subject)} ${group.title}`.toLowerCase()
  }
}

function summarizeRoleAccess(permissionNames) {
  const permissions = Array.isArray(permissionNames) ? permissionNames : []
  if (!permissions.length) return { badge: 'No access', detail: 'No permissions assigned yet' }
  if (permissions.includes('admin.*')) return { badge: 'Full access', detail: 'All areas and sensitive actions' }

  const areas = new Map()
  permissions.forEach((permissionName) => {
    const meta = buildPermissionMeta(permissionName)
    if (meta && !areas.has(meta.groupKey)) areas.set(meta.groupKey, meta.groupTitle)
  })

  const areaTitles = Array.from(areas.values())
  return {
    badge: `${permissions.length} access rule${permissions.length === 1 ? '' : 's'}`,
    detail: areaTitles.slice(0, 3).join(', ') + (areaTitles.length > 3 ? ` +${areaTitles.length - 3} more` : '')
  }
}

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
  const [permissionSearch, setPermissionSearch] = useState('')

  const reloadRoles = async () => {
    const rolesRes = await api.get('/roles')
    setRoles(rolesRes.data || [])
  }

  const resetForm = () => {
    setShowForm(false)
    setEditing(null)
    setName('')
    setDesc('')
    setPerms([])
    setPermissionSearch('')
    setError(null)
  }

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true)
        const [rolesRes, permsRes] = await Promise.all([api.get('/roles'), api.get('/rbac/permissions')])
        setRoles(rolesRes.data || [])
        setPermissions(permsRes.data?.permissions || permsRes.data || [])
      } catch (loadError) {
        setError('Failed to load roles or permissions')
      }
      setLoading(false)
    }
    load()
  }, [])

  const permissionItems = Array.from(
    permissions.reduce((map, permission) => {
      const meta = buildPermissionMeta(permission)
      if (meta) map.set(meta.key, meta)
      return map
    }, new Map()).values()
  ).sort((left, right) => {
    if (left.groupOrder !== right.groupOrder) return left.groupOrder - right.groupOrder
    if (left.isSensitive !== right.isSensitive) return left.isSensitive ? -1 : 1
    return left.label.localeCompare(right.label)
  })

  const selectedSet = new Set(perms)
  const hasFullAccess = selectedSet.has('admin.*')
  const searchText = permissionSearch.trim().toLowerCase()
  const filteredPermissions = permissionItems.filter((permission) => !searchText || permission.searchText.includes(searchText))
  const groupedPermissions = Array.from(
    filteredPermissions.reduce((map, permission) => {
      if (!map.has(permission.groupKey)) {
        map.set(permission.groupKey, {
          key: permission.groupKey,
          title: permission.groupTitle,
          description: permission.groupDescription,
          accent: permission.groupAccent,
          order: permission.groupOrder,
          permissions: []
        })
      }
      map.get(permission.groupKey).permissions.push(permission)
      return map
    }, new Map()).values()
  ).sort((left, right) => left.order - right.order)

  const selectedAreas = Array.from(
    permissionItems.reduce((map, permission) => {
      if (!selectedSet.has(permission.key)) return map
      if (!map.has(permission.groupKey)) {
        map.set(permission.groupKey, { key: permission.groupKey, title: permission.groupTitle, count: 0, order: permission.groupOrder })
      }
      map.get(permission.groupKey).count += 1
      return map
    }, new Map()).values()
  ).sort((left, right) => left.order - right.order)

  const applyTemplate = (templateName) => {
    if (!templateName) return
    setError(null)
    const available = new Set(permissionItems.map((permission) => permission.key))
    if (templateName === 'Admin' && available.has('admin.*')) return setPerms(['admin.*'])
    setPerms((ROLE_TEMPLATES[templateName] || []).filter((permissionName) => available.has(permissionName)))
  }

  const save = async (e) => {
    e.preventDefault()
    if (!name.trim()) return setError('Role name is required')
    if (!perms.length) return setError('Please select at least one permission')

    try {
      if (editing) {
        await api.put(`/roles/${editing}`, { name, description: desc, permissions: perms })
        setSuccess('Role updated successfully')
      } else {
        await api.post('/roles', { name, description: desc, permissions: perms })
        setSuccess('New role created successfully')
      }
      setTimeout(async () => {
        resetForm()
        await reloadRoles()
      }, 500)
    } catch (saveError) {
      setError(saveError?.response?.data?.error || 'Failed to save role')
    }
  }

  const startEdit = (role) => {
    setEditing(role.id)
    setName(role.name)
    setDesc(role.description || '')
    setPerms(role.permissions || [])
    setPermissionSearch('')
    setShowForm(true)
    setError(null)
    setSuccess(null)
  }

  const startNew = () => {
    setEditing(null)
    setName('')
    setDesc('')
    setPerms([])
    setPermissionSearch('')
    setShowForm(true)
    setError(null)
    setSuccess(null)
  }

  const deleteRole = async (id) => {
    if (!confirm('Are you sure you want to delete this role?')) return
    try {
      await api.delete(`/roles/${id}`)
      setSuccess('Role deleted')
      await reloadRoles()
    } catch (deleteError) {
      setError('Delete failed')
    }
  }

  const togglePerm = (permissionName) => {
    setPerms((currentPerms) => currentPerms.includes(permissionName) ? currentPerms.filter((value) => value !== permissionName) : [...currentPerms, permissionName])
  }

  const addPermissions = (permissionNames) => {
    setPerms((currentPerms) => Array.from(new Set([...currentPerms, ...permissionNames.filter(Boolean)])))
  }

  const removePermissions = (permissionNames) => {
    const namesToRemove = new Set(permissionNames)
    setPerms((currentPerms) => currentPerms.filter((permissionName) => !namesToRemove.has(permissionName)))
  }

  const renderPermissionCard = (permission) => (
    <label
      key={permission.key}
      title={permission.key}
      style={{
        display: 'flex',
        gap: 12,
        alignItems: 'flex-start',
        padding: '12px 14px',
        borderRadius: 12,
        border: `1px solid ${selectedSet.has(permission.key) ? '#bfdbfe' : '#e2e8f0'}`,
        background: selectedSet.has(permission.key) ? '#eff6ff' : '#ffffff',
        cursor: 'pointer'
      }}
    >
      <input type="checkbox" checked={selectedSet.has(permission.key)} onChange={() => togglePerm(permission.key)} style={{ marginTop: 2, width: 16, height: 16, cursor: 'pointer', flexShrink: 0 }} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <strong style={{ color: selectedSet.has(permission.key) ? '#1d4ed8' : '#0f172a' }}>{permission.label}</strong>
          {permission.isSensitive ? <span style={{ background: '#fff7ed', color: '#c2410c', border: '1px solid #fdba74', borderRadius: 999, padding: '2px 8px', fontSize: 11, fontWeight: 600 }}>Sensitive</span> : null}
        </div>
        <div style={{ marginTop: 4, color: '#64748b', fontSize: 12, lineHeight: 1.45 }}>{permission.hint}</div>
      </div>
    </label>
  )

  if (loading) {
    return (
      <div className="page">
        <div className="page-header">
          <h1 className="page-title">Roles & Permissions</h1>
          <p className="page-subtitle">Define what your staff can do with clear, business-friendly access controls</p>
        </div>
        {error ? <div className="error-msg" style={{ marginBottom: 12, padding: '10px 12px', background: '#fee2e2', color: '#b91c1c', borderRadius: 6, fontSize: 13 }}>{error}</div> : null}
        <div style={{ textAlign: 'center', padding: 30, color: '#64748b' }}>Loading configuration...</div>
      </div>
    )
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Roles & Permissions</h1>
        <p className="page-subtitle">Define what your staff can do with clear, business-friendly access controls</p>
      </div>

      {error ? <div className="error-msg" style={{ marginBottom: 12, padding: '10px 12px', background: '#fee2e2', color: '#b91c1c', borderRadius: 6, fontSize: 13 }}>{error}</div> : null}
      {success ? <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#15803d', padding: '10px 12px', borderRadius: 6, marginBottom: 12, fontSize: 13 }}>{success}</div> : null}

      {showForm ? (
        <div style={{ display: 'grid', gap: 20 }}>
          <div className="card" style={{ marginBottom: 0 }}>
            <h3 style={{ marginBottom: 16 }}>{editing ? 'Edit Role' : 'Create New Role'}</h3>
            <form onSubmit={save}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 15, marginBottom: 15 }}>
                <div>
                  <label className="form-label">Role Name *</label>
                  <input className="form-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Senior Cashier" />
                </div>
                <div>
                  <label className="form-label">Description</label>
                  <input className="form-input" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="What is this role responsible for?" />
                </div>
              </div>

              <div style={{ marginBottom: 18, padding: 14, background: '#f8fafc', borderRadius: 12, border: '1px dashed #cbd5e1' }}>
                <label className="form-label" style={{ color: '#475569' }}>Quick start template</label>
                <select className="form-input" style={{ cursor: 'pointer' }} onChange={(e) => applyTemplate(e.target.value)}>
                  <option value="">-- Select a job preset --</option>
                  <option value="Cashier">Cashier - POS and customer service</option>
                  <option value="Warehouse Manager">Warehouse Manager - products and stock</option>
                  <option value="Admin">Administrator - full system access</option>
                </select>
                <p style={{ fontSize: 12, color: '#64748b', margin: '8px 0 0' }}>Pick a starting point, then fine-tune the role below.</p>
              </div>

              <div style={{ marginBottom: 18, padding: '14px 16px', borderRadius: 14, border: `1px solid ${hasFullAccess ? '#d8b4fe' : '#cbd5e1'}`, background: hasFullAccess ? '#faf5ff' : '#f8fafc' }}>
                <div style={{ fontWeight: 700, color: hasFullAccess ? '#6b21a8' : '#0f172a' }}>
                  {hasFullAccess ? 'Full administrator access is enabled' : perms.length ? `${perms.length} permission${perms.length === 1 ? '' : 's'} selected across ${selectedAreas.length} area${selectedAreas.length === 1 ? '' : 's'}` : 'No access selected yet'}
                </div>
                <p style={{ margin: '6px 0 0', color: hasFullAccess ? '#7e22ce' : '#64748b', fontSize: 12 }}>
                  {hasFullAccess ? 'This role can reach every screen, setting, and high-impact action in the app.' : selectedAreas.length ? `Areas included: ${selectedAreas.map((area) => area.title).join(', ')}` : 'Use a template or select permissions below.'}
                </p>
                {selectedAreas.length ? (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                    {selectedAreas.map((area) => <span key={area.key} style={{ background: '#ffffff', border: '1px solid #dbeafe', color: '#1e3a8a', borderRadius: 999, padding: '4px 10px', fontSize: 11, fontWeight: 600 }}>{`${area.title} (${area.count})`}</span>)}
                  </div>
                ) : null}
              </div>

              <div style={{ marginBottom: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 10, flexWrap: 'wrap' }}>
                  <label className="form-label" style={{ marginBottom: 0 }}>What this role can do *</label>
                  <div style={{ color: '#64748b', fontSize: 12 }}>Tip: hover a permission to see its system key</div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto auto', gap: 10, alignItems: 'end', marginBottom: 14 }}>
                  <div style={{ minWidth: 0 }}>
                    <label className="form-label">Find an access rule</label>
                    <input className="form-input" value={permissionSearch} onChange={(e) => setPermissionSearch(e.target.value)} placeholder="Search sales, attendance, customer, inventory..." />
                  </div>
                  <button type="button" className="btn btn-secondary" style={{ padding: '10px 14px' }} onClick={() => addPermissions(filteredPermissions.map((permission) => permission.key))} disabled={!filteredPermissions.length}>Select shown</button>
                  <button type="button" className="btn btn-secondary" style={{ padding: '10px 14px' }} onClick={() => setPerms([])} disabled={!perms.length}>Clear all</button>
                </div>

                {!permissionItems.length ? (
                  <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8', border: '1px solid #e2e8f0', borderRadius: 12, background: '#ffffff' }}>No permissions loaded from the database.</div>
                ) : !groupedPermissions.length ? (
                  <div style={{ padding: 24, textAlign: 'center', color: '#64748b', border: '1px solid #e2e8f0', borderRadius: 12, background: '#ffffff' }}>No access rules match your search.</div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
                    {groupedPermissions.map((group) => {
                      const groupKeys = group.permissions.map((permission) => permission.key)
                      const selectedCount = group.permissions.filter((permission) => selectedSet.has(permission.key)).length
                      return (
                        <div key={group.key} className="card" style={{ marginBottom: 0, borderTop: `4px solid ${group.accent}` }}>
                          <div style={{ display: 'flex', gap: 12, justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                <h3 style={{ margin: 0, color: '#0f172a', fontSize: 18 }}>{group.title}</h3>
                                <span style={{ background: '#f8fafc', color: '#334155', borderRadius: 999, padding: '3px 9px', fontSize: 11, fontWeight: 700 }}>{`${selectedCount} of ${group.permissions.length} selected`}</span>
                              </div>
                              <p style={{ margin: '6px 0 0', color: '#64748b', fontSize: 12 }}>{group.description}</p>
                            </div>
                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', flexShrink: 0 }}>
                              <button type="button" className="btn btn-secondary" style={{ padding: '6px 10px', fontSize: 11 }} onClick={() => addPermissions(groupKeys)}>Select all</button>
                              <button type="button" className="btn btn-secondary" style={{ padding: '6px 10px', fontSize: 11 }} onClick={() => removePermissions(groupKeys)}>Clear</button>
                            </div>
                          </div>
                          <div style={{ display: 'grid', gap: 10 }}>
                            {group.permissions.map(renderPermissionCard)}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button type="submit" className="btn btn-primary" style={{ padding: '10px 24px' }}>{editing ? 'Save role changes' : 'Create role'}</button>
                <button type="button" className="btn btn-secondary" onClick={resetForm}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      ) : (
        <div>
          <div style={{ marginBottom: 15 }}>
            <button className="btn btn-primary" onClick={startNew}>+ Add New Role</button>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Role Name</th>
                  <th>Description</th>
                  <th>Access Level</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {!roles.length ? (
                  <tr>
                    <td colSpan={4} style={{ textAlign: 'center', padding: 24, color: '#94a3b8' }}>No roles defined yet.</td>
                  </tr>
                ) : roles.map((role) => {
                  const summary = summarizeRoleAccess(role.permissions)
                  return (
                    <tr key={role.id}>
                      <td style={{ fontWeight: 600, color: '#0f172a' }}>{role.name}</td>
                      <td>{role.description || '-'}</td>
                      <td>
                        <div style={{ display: 'grid', gap: 4 }}>
                          <span style={{ background: role.permissions?.includes('admin.*') ? '#faf5ff' : '#f1f5f9', color: role.permissions?.includes('admin.*') ? '#7e22ce' : '#334155', padding: '4px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700, justifySelf: 'start' }}>{summary.badge}</span>
                          <span style={{ color: '#64748b', fontSize: 12 }}>{summary.detail}</span>
                        </div>
                      </td>
                      <td>
                        <button className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: 11, marginRight: 6 }} onClick={() => startEdit(role)}>Edit</button>
                        <button className="btn btn-danger" style={{ padding: '4px 10px', fontSize: 11 }} onClick={() => deleteRole(role.id)}>Delete</button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
