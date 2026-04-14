import React, { useEffect, useState, useCallback } from 'react'
import api from '../api/api.js'

export default function Suppliers() {
  const [suppliers, setSuppliers] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({ name: '', contact_person: '', phone: '', email: '', address: '' })

  const fetchSuppliers = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get('/suppliers')
      setSuppliers(res.data || [])
    } catch (e) {
      setError('Failed to load suppliers')
    }
    setLoading(false)
  }, [])

  useEffect(() => { fetchSuppliers() }, [fetchSuppliers])

  const clearMessages = () => { setError(null); setSuccess(null) }
  const showMsg = (msg) => { setSuccess(msg); setTimeout(() => setSuccess(null), 4000) }

  const handleSave = async (e) => {
    e.preventDefault()
    clearMessages()
    try {
      if (editing) {
        await api.put(`/suppliers/${editing}`, form)
        showMsg('Supplier updated')
      } else {
        await api.post('/suppliers', form)
        showMsg('Supplier created')
      }
      setForm({ name: '', contact_person: '', phone: '', email: '', address: '' })
      setEditing(null)
      setShowForm(false)
      fetchSuppliers()
    } catch (err) {
      setError(err?.response?.data?.error || 'Save failed')
    }
  }

  const startEdit = (s) => {
    setEditing(s.id)
    setForm({
      name: s.name || '',
      contact_person: s.contact_person || '',
      phone: s.phone || '',
      email: s.email || '',
      address: s.address || ''
    })
    setShowForm(true)
  }

  const handleDelete = async (id) => {
    if (!confirm('Delete this supplier? Bale purchases using it will have their supplier cleared.')) return
    clearMessages()
    try {
      await api.delete(`/suppliers/${id}`)
      showMsg('Supplier deleted')
      fetchSuppliers()
    } catch (err) {
      setError(err?.response?.data?.error || 'Delete failed')
    }
  }

  const handleCancel = () => {
    setShowForm(false)
    setEditing(null)
    setForm({ name: '', contact_person: '', phone: '', email: '', address: '' })
  }

  return React.createElement('div', { className: 'page' },
    React.createElement('div', { className: 'page-header' },
      React.createElement('div', null,
        React.createElement('h1', { className: 'page-title' }, 'Suppliers'),
        React.createElement('p', { className: 'page-subtitle' }, 'Manage suppliers and vendor information for purchasing orders')
      )
    ),

    error && React.createElement('div', { className: 'error-msg', style: { marginBottom: 16 } }, error),
    success && React.createElement('div', {
      style: { background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#15803d', padding: '10px 14px', borderRadius: 6, marginBottom: 16, fontSize: '13.5px' }
    }, success),

    React.createElement('div', { style: { marginBottom: 16 } },
      React.createElement('button', {
        className: 'btn btn-primary',
        onClick: () => { setEditing(null); setForm({ name: '', contact_person: '', phone: '', email: '', address: '' }); setShowForm(true) }
      }, '+ Add Supplier')
    ),

    showForm && React.createElement('div', { className: 'card', style: { marginBottom: 20 } },
      React.createElement('h3', { style: { marginBottom: 12 } }, editing ? 'Edit Supplier' : 'Create Supplier'),
      React.createElement('form', { onSubmit: handleSave },
        React.createElement('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 } },
          React.createElement('div', { className: 'form-group' },
            React.createElement('label', { className: 'form-label' }, 'Name *'),
            React.createElement('input', {
              className: 'form-input',
              value: form.name,
              onChange: e => setForm(f => ({ ...f, name: e.target.value })),
              required: true,
              placeholder: 'e.g. ABC Wholesale, XYZ Garments...'
            })
          ),
          React.createElement('div', { className: 'form-group' },
            React.createElement('label', { className: 'form-label' }, 'Contact Person'),
            React.createElement('input', {
              className: 'form-input',
              value: form.contact_person,
              onChange: e => setForm(f => ({ ...f, contact_person: e.target.value })),
              placeholder: 'e.g. John Doe'
            })
          ),
          React.createElement('div', { className: 'form-group' },
            React.createElement('label', { className: 'form-label' }, 'Phone'),
            React.createElement('input', {
              className: 'form-input',
              value: form.phone,
              onChange: e => setForm(f => ({ ...f, phone: e.target.value })),
              placeholder: 'e.g. +63 912 345 6789'
            })
          ),
          React.createElement('div', { className: 'form-group' },
            React.createElement('label', { className: 'form-label' }, 'Email'),
            React.createElement('input', {
              className: 'form-input',
              type: 'email',
              value: form.email,
              onChange: e => setForm(f => ({ ...f, email: e.target.value })),
              placeholder: 'e.g. contact@supplier.com'
            })
          )
        ),
        React.createElement('div', { className: 'form-group' },
          React.createElement('label', { className: 'form-label' }, 'Address'),
          React.createElement('textarea', {
            className: 'form-input',
            value: form.address,
            onChange: e => setForm(f => ({ ...f, address: e.target.value })),
            placeholder: 'Full address of supplier',
            rows: 2
          })
        ),
        React.createElement('div', { style: { display: 'flex', gap: 8, marginTop: 8 } },
          React.createElement('button', { type: 'submit', className: 'btn btn-primary' }, editing ? 'Update Supplier' : 'Create Supplier'),
          React.createElement('button', { type: 'button', className: 'btn btn-secondary', onClick: handleCancel }, 'Cancel')
        )
      )
    ),

    loading
      ? React.createElement('div', null, 'Loading...')
      : React.createElement('div', { className: 'table-wrap' },
          React.createElement('table', null,
            React.createElement('thead', null,
              React.createElement('tr', null,
                React.createElement('th', null, 'Name'),
                React.createElement('th', null, 'Contact Person'),
                React.createElement('th', null, 'Phone'),
                React.createElement('th', null, 'Email'),
                React.createElement('th', null, 'Address'),
                React.createElement('th', null, 'Actions')
              )
            ),
            React.createElement('tbody', null,
              suppliers.length === 0
                ? React.createElement('tr', null,
                    React.createElement('td', { colSpan: 6, style: { textAlign: 'center', color: 'var(--text-light)', padding: 24 } },
                      'No suppliers yet. Click "+ Add Supplier" to create one. Suppliers will be inherited in Purchase Orders.'
                    )
                  )
                : suppliers.map(s => React.createElement('tr', { key: s.id },
                    React.createElement('td', { style: { fontWeight: 500 } }, s.name),
                    React.createElement('td', null, s.contact_person || '—'),
                    React.createElement('td', null, s.phone || '—'),
                    React.createElement('td', null, s.email || '—'),
                    React.createElement('td', null, s.address || '—'),
                    React.createElement('td', null,
                      React.createElement('button', {
                        className: 'btn btn-secondary',
                        style: { padding: '4px 10px', fontSize: 12, marginRight: 4 },
                        onClick: () => startEdit(s)
                      }, 'Edit'),
                      React.createElement('button', {
                        className: 'btn btn-danger',
                        style: { padding: '4px 10px', fontSize: 12 },
                        onClick: () => handleDelete(s.id)
                      }, 'Delete')
                    )
                  ))
            )
          )
        )
  )
}
