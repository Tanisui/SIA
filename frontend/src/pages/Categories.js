import React, { useEffect, useState, useCallback } from 'react'
import api from '../api/api.js'

export default function Categories() {
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({ name: '', description: '' })

  const fetchCategories = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get('/categories')
      setCategories(res.data || [])
    } catch (e) {
      setError('Failed to load categories')
    }
    setLoading(false)
  }, [])

  useEffect(() => { fetchCategories() }, [fetchCategories])

  const clearMessages = () => { setError(null); setSuccess(null) }
  const showMsg = (msg) => { setSuccess(msg); setTimeout(() => setSuccess(null), 4000) }

  const handleSave = async (e) => {
    e.preventDefault()
    clearMessages()
    try {
      if (editing) {
        await api.put(`/categories/${editing}`, form)
        showMsg('Category updated')
      } else {
        await api.post('/categories', form)
        showMsg('Category created')
      }
      setForm({ name: '', description: '' })
      setEditing(null)
      setShowForm(false)
      fetchCategories()
    } catch (err) {
      setError(err?.response?.data?.error || 'Save failed')
    }
  }

  const startEdit = (c) => {
    setEditing(c.id)
    setForm({ name: c.name || '', description: c.description || '' })
    setShowForm(true)
  }

  const handleDelete = async (id) => {
    if (!confirm('Delete this category? Products using it will have their category cleared.')) return
    clearMessages()
    try {
      await api.delete(`/categories/${id}`)
      showMsg('Category deleted')
      fetchCategories()
    } catch (err) {
      setError(err?.response?.data?.error || 'Delete failed')
    }
  }

  const handleCancel = () => {
    setShowForm(false)
    setEditing(null)
    setForm({ name: '', description: '' })
  }

  return React.createElement('div', { className: 'page' },
    React.createElement('div', { className: 'page-header' },
      React.createElement('div', null,
        React.createElement('h1', { className: 'page-title' }, 'Categories'),
        React.createElement('p', { className: 'page-subtitle' }, 'Manage product categories for organizing your catalog')
      )
    ),

    error && React.createElement('div', { className: 'error-msg', style: { marginBottom: 16 } }, error),
    success && React.createElement('div', {
      style: { background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#15803d', padding: '10px 14px', borderRadius: 6, marginBottom: 16, fontSize: '13.5px' }
    }, success),

    React.createElement('div', { style: { marginBottom: 16 } },
      React.createElement('button', {
        className: 'btn btn-primary',
        onClick: () => { setEditing(null); setForm({ name: '', description: '' }); setShowForm(true) }
      }, '+ Add Category')
    ),

    showForm && React.createElement('div', { className: 'card', style: { marginBottom: 20 } },
      React.createElement('h3', { style: { marginBottom: 12 } }, editing ? 'Edit Category' : 'Create Category'),
      React.createElement('form', { onSubmit: handleSave },
        React.createElement('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 } },
          React.createElement('div', { className: 'form-group' },
            React.createElement('label', { className: 'form-label' }, 'Name *'),
            React.createElement('input', {
              className: 'form-input',
              value: form.name,
              onChange: e => setForm(f => ({ ...f, name: e.target.value })),
              required: true,
              placeholder: 'e.g. Dresses, Accessories, Shoes...'
            })
          ),
          React.createElement('div', { className: 'form-group' },
            React.createElement('label', { className: 'form-label' }, 'Description'),
            React.createElement('input', {
              className: 'form-input',
              value: form.description,
              onChange: e => setForm(f => ({ ...f, description: e.target.value })),
              placeholder: 'Optional description'
            })
          )
        ),
        React.createElement('div', { style: { display: 'flex', gap: 8, marginTop: 8 } },
          React.createElement('button', { type: 'submit', className: 'btn btn-primary' }, editing ? 'Update Category' : 'Create Category'),
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
                React.createElement('th', null, 'Description'),
                React.createElement('th', null, 'Actions')
              )
            ),
            React.createElement('tbody', null,
              categories.length === 0
                ? React.createElement('tr', null,
                    React.createElement('td', { colSpan: 3, style: { textAlign: 'center', color: 'var(--text-light)', padding: 24 } },
                      'No categories yet. Click "+ Add Category" to create one.'
                    )
                  )
                : categories.map(c => React.createElement('tr', { key: c.id },
                    React.createElement('td', { style: { fontWeight: 500 } }, c.name),
                    React.createElement('td', null, c.description || '—'),
                    React.createElement('td', null,
                      React.createElement('button', {
                        className: 'btn btn-secondary',
                        style: { padding: '4px 10px', fontSize: 12, marginRight: 4 },
                        onClick: () => startEdit(c)
                      }, 'Edit'),
                      React.createElement('button', {
                        className: 'btn btn-danger',
                        style: { padding: '4px 10px', fontSize: 12 },
                        onClick: () => handleDelete(c.id)
                      }, 'Delete')
                    )
                  ))
            )
          )
        )
  )
}
