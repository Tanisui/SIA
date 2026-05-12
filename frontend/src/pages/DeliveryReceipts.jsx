import React, { useEffect, useState } from 'react'
import api from '../api/api.js'

function todayDateInput() {
  return new Date().toISOString().slice(0, 10)
}

function defaultForm() {
  return { bale_purchase_id: '', received_date: todayDateInput(), received_by: '', notes: '' }
}

export default function DeliveryReceipts() {
  const [receipts, setReceipts]   = useState([])
  const [orders, setOrders]       = useState([])
  const [form, setForm]           = useState(defaultForm)
  const [showForm, setShowForm]   = useState(false)
  const [saving, setSaving]       = useState(false)
  const [confirming, setConfirming] = useState(null)
  const [error, setError]         = useState(null)
  const [success, setSuccess]     = useState(null)

  async function load() {
    const [drRes, poRes] = await Promise.allSettled([
      api.get('/api/delivery-receipts'),
      api.get('/api/bale-purchases')
    ])
    if (drRes.status === 'fulfilled') setReceipts(drRes.value.data || [])
    if (poRes.status === 'fulfilled') setOrders(poRes.value.data || [])
  }

  useEffect(() => { load() }, [])

  async function createDR(e) {
    e.preventDefault(); setSaving(true); setError(null)
    try {
      await api.post('/api/delivery-receipts', form)
      setSuccess('Delivery Receipt created.')
      setForm(defaultForm()); setShowForm(false)
      await load()
    } catch (err) { setError(err?.response?.data?.error || 'Failed to create D.R.') }
    finally { setSaving(false) }
  }

  async function confirmDR(id) {
    if (!window.confirm('Confirm this Delivery Receipt? This unlocks bale breakdown for the linked Purchase Order.')) return
    setError(null); setSuccess(null)
    setConfirming(id)
    try {
      await api.put(`/api/delivery-receipts/${id}/confirm`)
      setSuccess('D.R. confirmed. Bale breakdown is now unlocked.')
      await load()
    } catch (err) { setError(err?.response?.data?.error || 'Failed to confirm') }
    finally { setConfirming(null) }
  }

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h2 style={{ margin: 0 }}>Delivery Receipts</h2>
        <button onClick={() => setShowForm(f => !f)}
          style={{ padding: '8px 20px', borderRadius: 6, background: '#1e40af', color: '#fff', border: 'none', cursor: 'pointer' }}>
          {showForm ? 'Cancel' : '+ New D.R.'}
        </button>
      </div>

      {error && <div style={{ background: '#fee2e2', color: '#dc2626', padding: 12, borderRadius: 6, marginBottom: 12 }}>{error}</div>}
      {success && <div style={{ background: '#dcfce7', color: '#15803d', padding: 12, borderRadius: 6, marginBottom: 12 }}>{success}</div>}

      {showForm && (
        <form onSubmit={createDR} style={{ background: '#f8fafc', padding: 20, borderRadius: 8, marginBottom: 20, border: '1px solid #e2e8f0' }}>
          <h3 style={{ margin: '0 0 16px' }}>Create Delivery Receipt</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <label style={{ display: 'block' }}>
              <span style={{ fontSize: 13, fontWeight: 500 }}>Purchase Order *</span>
              <select required value={form.bale_purchase_id}
                onChange={e => setForm(f => ({ ...f, bale_purchase_id: e.target.value }))}
                style={{ display: 'block', width: '100%', marginTop: 4, padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5e1' }}>
                <option value="">— Select P.O. —</option>
                {orders.map(o => (
                  <option key={o.id} value={o.id}>
                    {o.bale_batch_no} — {o.supplier_name || 'No supplier'} ({o.po_status})
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: 'block' }}>
              <span style={{ fontSize: 13, fontWeight: 500 }}>Received Date *</span>
              <input required type="date" value={form.received_date}
                onChange={e => setForm(f => ({ ...f, received_date: e.target.value }))}
                style={{ display: 'block', width: '100%', marginTop: 4, padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5e1' }} />
            </label>
            <label style={{ display: 'block' }}>
              <span style={{ fontSize: 13, fontWeight: 500 }}>Received By</span>
              <input value={form.received_by} placeholder="Leave blank to use your account name"
                onChange={e => setForm(f => ({ ...f, received_by: e.target.value }))}
                style={{ display: 'block', width: '100%', marginTop: 4, padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5e1' }} />
            </label>
            <label style={{ display: 'block' }}>
              <span style={{ fontSize: 13, fontWeight: 500 }}>Notes</span>
              <input value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                style={{ display: 'block', width: '100%', marginTop: 4, padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5e1' }} />
            </label>
          </div>
          <button type="submit" disabled={saving}
            style={{ marginTop: 16, padding: '8px 24px', background: saving ? '#94a3b8' : '#1e40af', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
            {saving ? 'Saving…' : 'Create D.R.'}
          </button>
        </form>
      )}

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
        <thead>
          <tr style={{ background: '#f1f5f9' }}>
            {['D.R. #', 'P.O. Batch', 'Supplier', 'Received Date', 'Received By', 'Status', 'Actions'].map(h => (
              <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600 }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {receipts.map(dr => (
            <tr key={dr.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
              <td style={{ padding: '10px 12px', fontWeight: 600 }}>{dr.dr_number}</td>
              <td style={{ padding: '10px 12px' }}>{dr.bale_batch_no || '—'}</td>
              <td style={{ padding: '10px 12px' }}>{dr.supplier_name || '—'}</td>
              <td style={{ padding: '10px 12px' }}>{dr.received_date ? String(dr.received_date).slice(0, 10) : '—'}</td>
              <td style={{ padding: '10px 12px' }}>{dr.received_by || '—'}</td>
              <td style={{ padding: '10px 12px' }}>
                <span style={{
                  padding: '2px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600,
                  background: dr.status === 'CONFIRMED' ? '#dcfce7' : dr.status === 'RECEIVED' ? '#dbeafe' : '#f1f5f9',
                  color: dr.status === 'CONFIRMED' ? '#15803d' : dr.status === 'RECEIVED' ? '#1d4ed8' : '#64748b'
                }}>{dr.status}</span>
              </td>
              <td style={{ padding: '10px 12px' }}>
                {dr.status !== 'CONFIRMED' && (
                  <button onClick={() => confirmDR(dr.id)}
                    disabled={confirming === dr.id}
                    style={{ padding: '4px 14px', borderRadius: 4, background: confirming === dr.id ? '#94a3b8' : '#15803d', color: '#fff', border: 'none', cursor: confirming === dr.id ? 'default' : 'pointer', fontSize: 12 }}>
                    {confirming === dr.id ? 'Confirming…' : 'Confirm'}
                  </button>
                )}
              </td>
            </tr>
          ))}
          {!receipts.length && (
            <tr>
              <td colSpan={7} style={{ padding: 32, textAlign: 'center', color: '#94a3b8' }}>
                No delivery receipts yet. Create one after receiving a Purchase Order.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
