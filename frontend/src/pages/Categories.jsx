import React, { useEffect, useState, useCallback, useMemo } from 'react'
import api from '../api/api.js'
import Icon from '../components/Icons.js'

const emptyForm = { name: '', description: '' }

export default function Categories() {
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [search, setSearch] = useState('')

  const fetchCategories = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get('/categories')
      setCategories(res.data || [])
    } catch {
      setError('Failed to load categories')
    } finally {
      setLoading(false)
    }
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
      setForm(emptyForm)
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
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this category? Products using it will have their category cleared.')) return
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
    setForm(emptyForm)
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return categories
    return categories.filter((c) =>
      String(c.name || '').toLowerCase().includes(q) ||
      String(c.description || '').toLowerCase().includes(q)
    )
  }, [categories, search])

  return (
    <div className="page categories-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Categories</h1>
          <p className="page-subtitle">Group products into clean, browsable buckets used across the catalog and reports.</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary btn-sm" type="button" onClick={fetchCategories} disabled={loading}>
            {loading ? 'Refreshing…' : '↺ Refresh'}
          </button>
          <button
            className="btn btn-primary"
            type="button"
            onClick={() => { setEditing(null); setForm(emptyForm); setShowForm(true); window.scrollTo({ top: 0, behavior: 'smooth' }) }}
          >+ New Category</button>
        </div>
      </div>

      {error && <div className="error-msg" style={{ marginBottom: 14 }}>{error}</div>}
      {success && <div className="success-msg" style={{ marginBottom: 14 }}>{success}</div>}

      {showForm && (
        <div className="card" style={{ marginBottom: 18 }}>
          <div className="card-header">
            <h3>{editing ? 'Edit Category' : 'Create Category'}</h3>
            <button type="button" className="btn btn-secondary btn-sm" onClick={handleCancel}>✕ Close</button>
          </div>
          <form onSubmit={handleSave} style={{ padding: '14px 18px 18px' }}>
            <div className="category-form-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 1fr) 2fr', gap: 12 }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Name *</label>
                <input className="form-input" required value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Dresses, Accessories, Shoes" />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Description</label>
                <input className="form-input" value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="Optional description" />
              </div>
            </div>
            <div className="category-form-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
              <button type="button" className="btn btn-secondary" onClick={handleCancel}>Cancel</button>
              <button type="submit" className="btn btn-primary">{editing ? 'Update Category' : 'Create Category'}</button>
            </div>
          </form>
        </div>
      )}

      <div className="entity-toolbar">
        <div className="entity-toolbar-search">
          <input
            type="text"
            className="form-input"
            placeholder="Search categories…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="entity-toolbar-meta">
          {loading ? 'Loading…' : `${filtered.length} of ${categories.length} categories`}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="card entity-empty">
          <div className="entity-empty-icon"><Icon name="categories" size={28} /></div>
          <div className="entity-empty-title">
            {categories.length === 0 ? 'No categories yet' : 'No matching categories'}
          </div>
          <div className="entity-empty-sub">
            {categories.length === 0
              ? 'Create your first category to start grouping products.'
              : 'Try a different keyword or clear the search.'}
          </div>
        </div>
      ) : (
        <div className="category-tile-grid">
          {filtered.map((c) => (
            <div key={c.id} className="category-tile" onClick={() => startEdit(c)} role="button" tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter') startEdit(c) }}>
              <div className="category-tile-icon" aria-hidden="true">
                <Icon name="categories" size={20} />
              </div>
              <div className="category-tile-name">{c.name}</div>
              {c.description ? (
                <div className="category-tile-desc">{c.description}</div>
              ) : (
                <div className="category-tile-desc category-tile-desc-empty">No description</div>
              )}
              <div className="category-tile-actions" onClick={(e) => e.stopPropagation()}>
                <button className="btn btn-secondary btn-sm" type="button" onClick={() => startEdit(c)}>Edit</button>
                <button className="btn btn-danger btn-sm" type="button" onClick={() => handleDelete(c.id)}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
