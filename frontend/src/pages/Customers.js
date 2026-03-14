import React, { useEffect, useState } from 'react'
import api from '../api/api.js'

const schema = [
  { name: 'id', label: 'ID', hidden: true },
  { name: 'name', label: 'Name' },
  { name: 'phone', label: 'Phone' },
  { name: 'email', label: 'Email' },
  { name: 'address', label: 'Address', type: 'textarea' },
  { name: 'notes', label: 'Notes', type: 'textarea' }
]

function FieldInput({ field, value, onChange }){
  const { name, label, type } = field
  if (type === 'textarea') return React.createElement('textarea', { value: value||'', onChange: e => onChange(name, e.target.value), style:{ width:'100%', minHeight:80 } })
  return React.createElement('input', { value: value||'', onChange: e => onChange(name, e.target.value), type: type === 'number' ? 'number' : 'text', style:{ width:'100%', padding:8 } })
}

export default function Customers(){
  const pk = 'id'
  const [allCustomers, setAllCustomers] = useState([])
  const [displayedCustomers, setDisplayedCustomers] = useState([])
  const [loading, setLoading] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({})
  const [error, setError] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [sortBy, setSortBy] = useState('name')

  const fetchAll = async () => {
    setLoading(true)
    try {
      const res = await api.get('/customers')
      const data = res.data || []
      setAllCustomers(data)
      applyFiltersAndSearch(data, searchTerm, sortBy)
    } catch (err) {
      setError('Failed to load customers')
    } finally {
      setLoading(false)
    }
  }

  const applyFiltersAndSearch = (customers, search, sort) => {
    let filtered = customers

    // Apply search filter
    if (search.trim()) {
      const term = search.toLowerCase()
      filtered = filtered.filter(c =>
        c.name.toLowerCase().includes(term) ||
        c.email.toLowerCase().includes(term) ||
        c.phone.includes(term)
      )
    }



    // Apply sorting
    filtered.sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name)
      if (sort === 'email') return a.email.localeCompare(b.email)
      return 0
    })

    setDisplayedCustomers(filtered)
  }

  useEffect(() => {
    fetchAll()
  }, [])

  useEffect(() => {
    applyFiltersAndSearch(allCustomers, searchTerm, sortBy)
  }, [searchTerm, sortBy, allCustomers])

  const onChange = (name, value) => setForm(prev => ({ ...prev, [name]: value }))

  const startCreate = () => {
    setEditing('create')
    setForm({})
  }
  const startEdit = (it) => {
    setEditing('edit')
    setForm(it)
  }
  const cancel = () => {
    setEditing(null)
    setForm({})
    setError(null)
  }

  const submit = async (e) => {
    e && e.preventDefault()
    setError(null)
    try {
      const payload = { ...form }
      if (editing === 'create') {
        await api.post('/customers', payload)
      } else {
        await api.put(`/customers/${form[pk]}`, payload)
      }
      await fetchAll()
      cancel()
    } catch (err) {
      console.error(err)
      const msg = err?.response?.data?.error || err?.message || 'Save failed'
      setError(String(msg))
    }
  }

  const remove = async (id) => {
    if (!confirm('Confirm to delete this customer')) return
    try {
      await api.delete(`/customers/${id}`)
      await fetchAll()
      setError(null)
    } catch (e) {
      console.error(e)
      const msg = e?.response?.data?.error || e.message || 'Delete failed'
      setError(String(msg))
    }
  }

  const visibleSchema = schema.filter(f => !f.hidden && !f.hideInList)

  return React.createElement(
    'div',
    { className: 'page' },
    React.createElement(
      'div',
      { className: 'page-header' },
      React.createElement(
        'div',
        null,
        React.createElement('h1', { className: 'page-title' }, 'Customers'),
        React.createElement('p', { className: 'page-subtitle' }, 'Manage and track your customers')
      )
    ),
    React.createElement(
      'div',
      { className: 'card', style: { marginBottom: 16 } },
      React.createElement(
        'div',
        { style: { display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' } },
        React.createElement('button', { className: 'btn btn-primary', onClick: startCreate }, '+ Create new'),
        React.createElement(
          'div',
          { style: { flex: 1, minWidth: 250, display: 'flex', alignItems: 'center', gap: 8 } },
          React.createElement('input', {
            type: 'text',
            placeholder: '🔍 Search by name, email, or phone...',
            value: searchTerm,
            onChange: e => setSearchTerm(e.target.value),
            style: {
              flex: 1,
              padding: '8px 12px',
              border: '1px solid #ddd',
              borderRadius: 4,
              fontSize: 14
            }
          })
        ),

        React.createElement(
          'select',
          {
            value: sortBy,
            onChange: e => setSortBy(e.target.value),
            style: {
              padding: '8px 12px',
              border: '1px solid #ddd',
              borderRadius: 4,
              fontSize: 14,
              backgroundColor: '#fff',
              cursor: 'pointer'
            }
          },
          React.createElement('option', { value: 'name' }, '↔️ Sort: Name'),
          React.createElement('option', { value: 'email' }, '↔️ Sort: Email')
        )
      ),
      error && React.createElement('div', { className: 'error-msg', style: { marginBottom: 12 } }, error),
      React.createElement(
        'div',
        { style: { color: '#666', fontSize: 13, marginBottom: 12 } },
        `Showing ${displayedCustomers.length} of ${allCustomers.length} customers`
      ),
      loading
        ? React.createElement(
          'div',
          { style: { padding: 40, textAlign: 'center', color: 'var(--text-light)' } },
          'Loading...'
        )
        : React.createElement(
          'div',
          { className: 'table-wrap' },
          React.createElement(
            'table',
            null,
            React.createElement(
              'thead',
              null,
              React.createElement(
                'tr',
                null,
                visibleSchema.map(f => React.createElement('th', { key: f.name }, f.label || f.name)),
                React.createElement('th', { style: { textAlign: 'right' } }, 'Actions')
              )
            ),
            React.createElement(
              'tbody',
              null,
              displayedCustomers.length === 0
                ? React.createElement(
                  'tr',
                  null,
                  React.createElement(
                    'td',
                    { colSpan: visibleSchema.length + 1, style: { textAlign: 'center', padding: 20, color: '#999' } },
                    'No customers found'
                  )
                )
                : displayedCustomers.map(it =>
                  React.createElement(
                    'tr',
                    { key: it[pk] },
                    visibleSchema.map(f =>
                      React.createElement(
                        'td',
                        { key: f.name },
                        (() => {
                          const val = it[f.name]
                          if (Array.isArray(val)) return val.join(', ')
                          return val === null || val === undefined ? '' : String(val)
                        })()
                      )
                    ),
                    React.createElement(
                      'td',
                      { style: { textAlign: 'right' } },
                      React.createElement(
                        'button',
                        { className: 'btn btn-secondary', onClick: () => startEdit(it), style: { marginRight: 8, padding: '6px 12px', fontSize: 12 } },
                        'Edit'
                      ),
                      React.createElement(
                        'button',
                        { className: 'btn btn-danger', onClick: () => remove(it[pk]), style: { padding: '6px 12px', fontSize: 12 } },
                        'Delete'
                      )
                    )
                  )
                )
            )
          )
        )
    ),
    editing &&
    React.createElement(
      'div',
      { className: 'card', style: { marginTop: 20 } },
      React.createElement('h3', null, editing === 'create' ? 'Create new customer' : 'Edit customer'),
      React.createElement(
        'form',
        { onSubmit: submit },
        schema
          .filter(f => !f.hidden && !f.hideInForm)
          .map(f =>
            React.createElement(
              'div',
              { key: f.name, style: { marginBottom: 10 } },
              React.createElement('label', null, f.label || f.name),
              React.createElement(FieldInput, { field: f, value: form[f.name], onChange })
            )
          ),
        React.createElement(
          'div',
          null,
          React.createElement('button', { type: 'submit', style: { marginRight: 8 } }, 'Save'),
          React.createElement('button', { type: 'button', onClick: cancel }, 'Cancel')
        )
      )
    )
  )
}
