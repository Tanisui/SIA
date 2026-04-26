import React, { useEffect, useState, useCallback, useMemo } from 'react'
import api from '../api/api.js'
import Icon from '../components/Icons.js'

function getInitials(name) {
  const text = String(name || '').trim()
  if (!text) return '·'
  const parts = text.split(/\s+/).filter(Boolean)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

const emptyForm = { name: '', contact_person: '', phone: '', email: '', address: '' }

export default function Suppliers() {
  const [suppliers, setSuppliers] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [search, setSearch] = useState('')

  const fetchSuppliers = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get('/suppliers')
      setSuppliers(res.data || [])
    } catch {
      setError('Failed to load suppliers')
    } finally {
      setLoading(false)
    }
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
      setForm(emptyForm)
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
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this supplier? Bale purchases using it will have their supplier cleared.')) return
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
    setForm(emptyForm)
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return suppliers
    return suppliers.filter((s) => {
      const haystack = [s.name, s.contact_person, s.phone, s.email, s.address]
        .map((v) => String(v || '').toLowerCase()).join(' ')
      return haystack.includes(q)
    })
  }, [suppliers, search])

  return (
    <div className="page suppliers-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Suppliers</h1>
          <p className="page-subtitle">Vendor directory used by purchasing orders. Click a card to update contact details.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="btn btn-secondary btn-sm" type="button" onClick={fetchSuppliers} disabled={loading}>
            {loading ? 'Refreshing…' : '↺ Refresh'}
          </button>
          <button
            className="btn btn-primary"
            type="button"
            onClick={() => { setEditing(null); setForm(emptyForm); setShowForm(true); window.scrollTo({ top: 0, behavior: 'smooth' }) }}
          >
            + New Supplier
          </button>
        </div>
      </div>

      {error && <div className="error-msg" style={{ marginBottom: 14 }}>{error}</div>}
      {success && <div className="success-msg" style={{ marginBottom: 14 }}>{success}</div>}

      {showForm && (
        <div className="card" style={{ marginBottom: 18 }}>
          <div className="card-header">
            <h3>{editing ? 'Edit Supplier' : 'Create Supplier'}</h3>
            <button type="button" className="btn btn-secondary btn-sm" onClick={handleCancel}>✕ Close</button>
          </div>
          <form onSubmit={handleSave} style={{ padding: '14px 18px 18px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Name *</label>
                <input className="form-input" required value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. ABC Wholesale" />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Contact Person</label>
                <input className="form-input" value={form.contact_person}
                  onChange={(e) => setForm((f) => ({ ...f, contact_person: e.target.value }))}
                  placeholder="e.g. John Doe" />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Phone</label>
                <input className="form-input" value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  placeholder="+63 912 345 6789" />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Email</label>
                <input className="form-input" type="email" value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  placeholder="contact@supplier.com" />
              </div>
            </div>
            <div className="form-group" style={{ marginTop: 12, marginBottom: 0 }}>
              <label className="form-label">Address</label>
              <textarea className="form-input" rows={2} value={form.address}
                onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                placeholder="Full address of supplier" />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
              <button type="button" className="btn btn-secondary" onClick={handleCancel}>Cancel</button>
              <button type="submit" className="btn btn-primary">{editing ? 'Update Supplier' : 'Create Supplier'}</button>
            </div>
          </form>
        </div>
      )}

      <div className="entity-toolbar">
        <div className="entity-toolbar-search">
          <input
            type="text"
            className="form-input"
            placeholder="Search by name, contact, phone, email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="entity-toolbar-meta">
          {loading ? 'Loading…' : `${filtered.length} of ${suppliers.length} suppliers`}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="card entity-empty">
          <div className="entity-empty-icon">
            <Icon name="suppliers" size={28} />
          </div>
          <div className="entity-empty-title">
            {suppliers.length === 0 ? 'No suppliers yet' : 'No matching suppliers'}
          </div>
          <div className="entity-empty-sub">
            {suppliers.length === 0
              ? 'Add your first supplier to start placing purchase orders.'
              : 'Try a different keyword or clear the search.'}
          </div>
          {suppliers.length === 0 && (
            <button
              className="btn btn-primary"
              type="button"
              style={{ marginTop: 12 }}
              onClick={() => { setEditing(null); setForm(emptyForm); setShowForm(true) }}
            >
              + New Supplier
            </button>
          )}
        </div>
      ) : (
        <div className="entity-card-grid">
          {filtered.map((s) => (
            <div key={s.id} className="entity-card" onClick={() => startEdit(s)} role="button" tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter') startEdit(s) }}>
              <div className="entity-card-head">
                <div className="entity-card-avatar" aria-hidden="true">{getInitials(s.name)}</div>
                <div className="entity-card-id">
                  <div className="entity-card-name">{s.name}</div>
                  {s.contact_person && <div className="entity-card-sub">{s.contact_person}</div>}
                </div>
              </div>
              <div className="entity-card-body">
                {s.phone && (
                  <div className="entity-card-row">
                    <span className="entity-card-row-label">Phone</span>
                    <span className="entity-card-row-value">{s.phone}</span>
                  </div>
                )}
                {s.email && (
                  <div className="entity-card-row">
                    <span className="entity-card-row-label">Email</span>
                    <span className="entity-card-row-value entity-card-row-truncate">{s.email}</span>
                  </div>
                )}
                {s.address && (
                  <div className="entity-card-row">
                    <span className="entity-card-row-label">Address</span>
                    <span className="entity-card-row-value entity-card-row-truncate">{s.address}</span>
                  </div>
                )}
                {!s.phone && !s.email && !s.address && (
                  <div className="entity-card-empty-line">No contact info on file</div>
                )}
              </div>
              <div className="entity-card-actions" onClick={(e) => e.stopPropagation()}>
                <button className="btn btn-secondary btn-sm" type="button" onClick={() => startEdit(s)}>Edit</button>
                <button className="btn btn-danger btn-sm" type="button" onClick={() => handleDelete(s.id)}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
