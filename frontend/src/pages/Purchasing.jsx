import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useSelector } from 'react-redux'
import { useLocation, useNavigate } from 'react-router-dom'
import api from '../api/api.js'
const PURCHASING_TAB_KEYS = new Set(['bale-purchases', 'bale-breakdowns'])
const DEFAULT_PURCHASING_TAB = 'bale-purchases'

function createDefaultBaleForm() {
  return {
    bale_batch_no: '',
    supplier_id: '',
    supplier_name: '',
    purchase_date: '',
    bale_category: '',
    bale_cost: '',
    quantity_ordered: '',
    notes: ''
  }
}

function createDefaultBreakdownForm() {
  return {
    bale_purchase_id: '',
    bale_category: '',
    total_pieces: '',
    premium_items: '',
    standard_items: '',
    damaged_items: '',
    breakdown_date: '',
    notes: ''
  }
}

function todayDateInput() {
  const now = new Date()
  const localDate = new Date(now.getTime() - (now.getTimezoneOffset() * 60000))
  return localDate.toISOString().slice(0, 10)
}

function toDateInput(value) {
  if (!value) return ''
  const normalizedValue = String(value).trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalizedValue)) return normalizedValue
  const normalized = new Date(normalizedValue)
  if (Number.isNaN(normalized.getTime())) return ''
  return normalized.toISOString().slice(0, 10)
}

function fmtCurrency(value) {
  return Number(value || 0).toLocaleString('en-PH', { style: 'currency', currency: 'PHP' })
}

function fmtNumber(value) {
  return Number(value || 0).toLocaleString('en-PH')
}

function fmtDate(value) {
  if (!value) return '-'
  const normalized = new Date(value)
  if (Number.isNaN(normalized.getTime())) return String(value)
  return normalized.toLocaleDateString('en-PH', { month: 'short', day: '2-digit', year: 'numeric' })
}

function toMoney(value) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) return 0
  return parsed
}

function toNonNegativeInteger(value) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) return 0
  return Math.floor(parsed)
}

function mapBreakdownToForm(row) {
  const premiumItems = Number(row?.premium_items || 0)
  const standardItems = Number(row?.standard_items || 0) + Number(row?.low_grade_items || 0)
  return {
    bale_purchase_id: row?.bale_purchase_id ? String(row.bale_purchase_id) : '',
    bale_category: row?.bale_category || '',
    total_pieces: String(row?.total_pieces ?? ''),
    premium_items: premiumItems > 0 ? String(premiumItems) : '',
    standard_items: standardItems > 0 ? String(standardItems) : '',
    damaged_items: String(row?.damaged_items ?? ''),
    breakdown_date: toDateInput(row?.breakdown_date),
    notes: row?.notes || ''
  }
}

export default function Purchasing() {
  const location = useLocation()
  const navigate = useNavigate()

  const permissions = useSelector((state) =>
    state.auth && state.auth.permissions
      ? state.auth.permissions
      : JSON.parse(localStorage.getItem('permissions') || '[]')
  )

  const [bales, setBales] = useState([])
  const [breakdowns, setBreakdowns] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)

  const [baleForm, setBaleForm] = useState(createDefaultBaleForm)
  const [breakdownForm, setBreakdownForm] = useState(createDefaultBreakdownForm)
  const [editingBaleId, setEditingBaleId] = useState(null)
  const [baleFilters, setBaleFilters] = useState({ from: '', to: '', search: '' })
  const activeTab = useMemo(() => {
    const params = new URLSearchParams(location.search)
    const searchTab = String(params.get('tab') || '').trim()
    const hashTab = String(location.hash || '').replace(/^#/, '')
    if (PURCHASING_TAB_KEYS.has(searchTab)) return searchTab
    if (PURCHASING_TAB_KEYS.has(hashTab)) return hashTab
    return DEFAULT_PURCHASING_TAB
  }, [location.hash, location.search])

  const canManageBales = Array.isArray(permissions)
    ? permissions.includes('admin.*') || permissions.includes('inventory.receive')
    : false

  const canViewBales = Array.isArray(permissions)
    ? permissions.includes('admin.*')
      || permissions.includes('inventory.view')
      || permissions.includes('inventory.receive')
      || permissions.includes('products.view')
      || permissions.includes('reports.view')
      || permissions.includes('finance.reports.view')
    : false

  const clearMessages = useCallback(() => {
    setError(null)
    setSuccess(null)
  }, [])

  const showMsg = useCallback((message) => {
    setSuccess(message)
    setTimeout(() => setSuccess(null), 4200)
  }, [])

  const goToTab = useCallback((nextTab, { replace = false } = {}) => {
    if (!PURCHASING_TAB_KEYS.has(nextTab)) return
    const params = new URLSearchParams(location.search)
    const currentTab = String(params.get('tab') || '').trim()
    if (currentTab === nextTab && !location.hash) return
    params.set('tab', nextTab)
    navigate(`/purchasing?${params.toString()}`, { replace, preventScrollReset: true })
  }, [location.hash, location.search, navigate])
  const fetchBales = useCallback(async (filters = baleFilters) => {
    if (!canViewBales && !canManageBales) {
      setBales([])
      return
    }

    const query = []
    if (filters.from) query.push(`from=${encodeURIComponent(filters.from)}`)
    if (filters.to) query.push(`to=${encodeURIComponent(filters.to)}`)
    if (filters.search) query.push(`search=${encodeURIComponent(filters.search)}`)
    const endpoint = query.length ? `/bale-purchases?${query.join('&')}` : '/bale-purchases'

    const response = await api.get(endpoint)
    setBales(Array.isArray(response?.data) ? response.data : [])
  }, [baleFilters, canManageBales, canViewBales])

  const fetchBreakdowns = useCallback(async (filters = baleFilters) => {
    if (!canViewBales && !canManageBales) {
      setBreakdowns([])
      return
    }

    const query = []
    if (filters.from) query.push(`from=${encodeURIComponent(filters.from)}`)
    if (filters.to) query.push(`to=${encodeURIComponent(filters.to)}`)
    const endpoint = query.length ? `/bale-purchases/breakdowns?${query.join('&')}` : '/bale-purchases/breakdowns'
    const response = await api.get(endpoint)
    setBreakdowns(Array.isArray(response?.data) ? response.data : [])
  }, [baleFilters, canManageBales, canViewBales])

  const fetchSuppliers = useCallback(async () => {
    try {
      const response = await api.get('/suppliers')
      setSuppliers(Array.isArray(response?.data) ? response.data : [])
    } catch (err) {
      console.warn('Failed to load suppliers:', err)
      setSuppliers([])
    }
  }, [])

  const refreshAll = useCallback(async () => {
    try {
      clearMessages()
      setLoading(true)
      await Promise.all([
        fetchBales(),
        fetchBreakdowns(),
        fetchSuppliers()
      ])
    } catch (err) {
      setError(err?.response?.data?.error || 'Failed to load bale workflow data')
    } finally {
      setLoading(false)
    }
  }, [clearMessages, fetchBales, fetchBreakdowns, fetchSuppliers])

  useEffect(() => {
    refreshAll()
  }, [refreshAll])

  useEffect(() => {
    if (location.pathname !== '/purchasing') return
    goToTab(activeTab, { replace: true })
  }, [location.pathname, activeTab, goToTab])
  const baleTotalPreview = useMemo(() => {
    return Number(baleForm.bale_cost) || 0
  }, [baleForm.bale_cost])

  const selectedBreakdownBale = useMemo(
    () => bales.find((row) => String(row.id) === String(breakdownForm.bale_purchase_id)),
    [bales, breakdownForm.bale_purchase_id]
  )
  const selectedBreakdownCategory = selectedBreakdownBale
    ? String(selectedBreakdownBale.bale_category || '').trim()
    : String(breakdownForm.bale_category || '').trim()

  const baleTotals = useMemo(() => {
    return bales.reduce((acc, row) => {
      acc.bale_cost += Number(row.bale_cost || 0)
      acc.total_purchase_cost += Number(row.total_purchase_cost || 0)
      return acc
    }, { bale_cost: 0, total_purchase_cost: 0 })
  }, [bales])

  function resetBaleForm() {
    setBaleForm(createDefaultBaleForm())
    setEditingBaleId(null)
  }

  function resetBreakdownForm() {
    setBreakdownForm(createDefaultBreakdownForm())
  }

  async function refreshBaleData(event) {
    if (event) event.preventDefault()
    clearMessages()
    try {
      setLoading(true)
      await Promise.all([fetchBales(baleFilters), fetchBreakdowns(baleFilters)])
    } catch (err) {
      setError(err?.response?.data?.error || 'Failed to refresh bale purchase data.')
    } finally {
      setLoading(false)
    }
  }

  async function clearBaleFilters() {
    const nextFilters = { from: '', to: '', search: '' }
    setBaleFilters(nextFilters)
    clearMessages()
    try {
      setLoading(true)
      await Promise.all([fetchBales(nextFilters), fetchBreakdowns(nextFilters)])
    } catch (err) {
      setError(err?.response?.data?.error || 'Failed to clear bale filters.')
    } finally {
      setLoading(false)
    }
  }

  function startEditBale(row) {
    setEditingBaleId(row.id)
    setBaleForm({
      bale_batch_no: row.bale_batch_no || '',
      supplier_id: String(row.supplier_id || ''),
      supplier_name: row.supplier_name || '',
      purchase_date: toDateInput(row.purchase_date),
      bale_type: row.bale_type || '',
      bale_category: row.bale_category || '',
      bale_cost: String(row.bale_cost ?? ''),
      quantity_ordered: String(row.quantity_ordered ?? ''),
      notes: row.notes || ''
    })
    goToTab('bale-purchases')
    clearMessages()
  }

  async function saveBalePurchase(event) {
    event.preventDefault()
    clearMessages()

    if (!baleForm.bale_batch_no.trim()) {
      setError('Bale Batch No. is required.')
      return
    }
    if (!baleForm.purchase_date) {
      setError('Purchase date is required.')
      return
    }

    const selectedSupplier = suppliers.find((s) => String(s.id) === String(baleForm.supplier_id))
    const normalizedSupplierName = String(selectedSupplier?.name || baleForm.supplier_name || '').trim()
    if (!baleForm.supplier_id && !normalizedSupplierName) {
      setError('Supplier is required. Select a supplier or enter supplier name.')
      return
    }

    const payload = {
      bale_batch_no: baleForm.bale_batch_no.trim(),
      supplier_id: baleForm.supplier_id ? Number(baleForm.supplier_id) : null,
      supplier_name: normalizedSupplierName || null,
      purchase_date: baleForm.purchase_date,
      bale_type: baleForm.bale_type || null,
      bale_category: baleForm.bale_category || null,
      bale_cost: toMoney(baleForm.bale_cost),
      total_purchase_cost: toMoney(baleForm.bale_cost),
      quantity_ordered: toNonNegativeInteger(baleForm.quantity_ordered),
      notes: baleForm.notes || null
    }

    try {
      setSubmitting(true)
      if (editingBaleId) {
        await api.put(`/bale-purchases/${editingBaleId}`, payload)
      } else {
        await api.post('/bale-purchases', payload)
      }
      await Promise.all([fetchBales(baleFilters), fetchBreakdowns(baleFilters)])
      resetBaleForm()
      showMsg(editingBaleId ? 'Bale purchase updated successfully.' : 'Bale purchase saved successfully.')
    } catch (err) {
      setError(err?.response?.data?.error || 'Failed to save bale purchase.')
    } finally {
      setSubmitting(false)
    }
  }

  async function deleteBalePurchase(row) {
    clearMessages()
    const confirmed = window.confirm(`Delete bale batch ${row?.bale_batch_no || ''}? This will also remove its breakdown.`)
    if (!confirmed) return

    try {
      setSubmitting(true)
      await api.delete(`/bale-purchases/${row.id}`)
      await Promise.all([fetchBales(baleFilters), fetchBreakdowns(baleFilters)])

      if (String(editingBaleId) === String(row.id)) resetBaleForm()
      if (String(breakdownForm.bale_purchase_id) === String(row.id)) resetBreakdownForm()

      showMsg('Bale purchase deleted successfully.')
    } catch (err) {
      setError(err?.response?.data?.error || 'Failed to delete bale purchase.')
    } finally {
      setSubmitting(false)
    }
  }

  function startBreakdownFromBale(row) {
    const existing = breakdowns.find((entry) => String(entry.bale_purchase_id) === String(row.id))
    if (existing) {
      setBreakdownForm(mapBreakdownToForm(existing))
    } else {
      setBreakdownForm((prev) => ({
        ...createDefaultBreakdownForm(),
        bale_purchase_id: String(row.id),
        bale_category: row.bale_category || '',
        breakdown_date: prev.breakdown_date || todayDateInput()
      }))
    }
    goToTab('bale-breakdowns')
    clearMessages()
  }

  async function loadExistingBreakdown() {
    clearMessages()
    if (!breakdownForm.bale_purchase_id) {
      setError('Select a bale batch first to load a breakdown.')
      return
    }

    try {
      setSubmitting(true)
      const response = await api.get(`/bale-purchases/${breakdownForm.bale_purchase_id}/breakdown`)
      setBreakdownForm(mapBreakdownToForm(response?.data || {}))
      showMsg('Existing bale breakdown loaded.')
    } catch (err) {
      if (err?.response?.status === 404) {
        setBreakdownForm((prev) => ({ ...prev, breakdown_date: prev.breakdown_date || todayDateInput() }))
        setError('No breakdown has been encoded yet for the selected bale. Fill out the form and save.')
      } else {
        setError(err?.response?.data?.error || 'Failed to load bale breakdown.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  async function saveBreakdown(event) {
    event.preventDefault()
    clearMessages()

    const balePurchaseId = Number(breakdownForm.bale_purchase_id)
    if (!balePurchaseId) {
      setError('Select a bale batch before saving breakdown.')
      return
    }

    const payload = {
      total_pieces: toNonNegativeInteger(breakdownForm.total_pieces),
      premium_items: toNonNegativeInteger(breakdownForm.premium_items),
      standard_items: toNonNegativeInteger(breakdownForm.standard_items),
      damaged_items: toNonNegativeInteger(breakdownForm.damaged_items),
      breakdown_date: breakdownForm.breakdown_date || todayDateInput(),
      notes: breakdownForm.notes || null
    }

    payload.saleable_items = payload.premium_items + payload.standard_items
    const classifiedItems = payload.saleable_items + payload.damaged_items
    if (classifiedItems > 0 && payload.total_pieces <= 0) {
      setError('Total Pieces must be greater than 0 when breakdown counts are entered.')
      return
    }

    if (classifiedItems > payload.total_pieces && payload.total_pieces > 0) {
      setError('Class A - Premium + Class B - Standard + Damaged cannot exceed Total Pieces.')
      return
    }

    try {
      setSubmitting(true)
      const response = await api.put(`/bale-purchases/${balePurchaseId}/breakdown`, payload)
      setBreakdownForm(mapBreakdownToForm(response?.data || { ...payload, bale_purchase_id: balePurchaseId }))
      await fetchBreakdowns(baleFilters)
      showMsg('Bale breakdown saved successfully.')
    } catch (err) {
      setError(err?.response?.data?.error || 'Failed to save bale breakdown.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Bale Workflow</h1>
          <p className="page-subtitle">
            Manage bale purchases, bale breakdown records, and inventory cost tracking in one workspace.
          </p>
        </div>
      </div>

      {error ? <div className="error-msg" style={{ marginBottom: 16 }}>{error}</div> : null}
      {success ? (
        <div className="success-msg" style={{ marginBottom: 16 }}>{success}</div>
      ) : null}

      <div className="purchase-tabs">
        <button
          className={`purchase-tab ${activeTab === 'bale-purchases' ? 'purchase-tab-active' : ''}`}
          onClick={() => goToTab('bale-purchases')}
          type="button"
        >
          Bale Purchases
        </button>
        <button
          className={`purchase-tab ${activeTab === 'bale-breakdowns' ? 'purchase-tab-active' : ''}`}
          onClick={() => goToTab('bale-breakdowns')}
          type="button"
        >
          Bale Breakdown
        </button>
      </div>

      {activeTab === 'bale-purchases' ? (
        <>
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-header">
              <h3>Bale Purchase Filters</h3>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-secondary btn-sm" type="button" onClick={clearBaleFilters} disabled={loading}>Clear</button>
                <button className="btn btn-primary btn-sm" type="button" onClick={refreshBaleData} disabled={loading}>
                  {loading ? 'Refreshing...' : 'Refresh'}
                </button>
              </div>
            </div>
            <form onSubmit={refreshBaleData}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">From</label>
                  <input
                    className="form-input"
                    type="date"
                    value={baleFilters.from}
                    onChange={(event) => setBaleFilters((prev) => ({ ...prev, from: event.target.value }))}
                  />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">To</label>
                  <input
                    className="form-input"
                    type="date"
                    value={baleFilters.to}
                    onChange={(event) => setBaleFilters((prev) => ({ ...prev, to: event.target.value }))}
                  />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Search</label>
                  <input
                    className="form-input"
                    value={baleFilters.search}
                    onChange={(event) => setBaleFilters((prev) => ({ ...prev, search: event.target.value }))}
                    placeholder="Batch no., supplier, category"
                  />
                </div>
              </div>
            </form>
          </div>

          {canManageBales ? (
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="card-header">
                <h3>{editingBaleId ? 'Edit Bale Purchase' : 'Record Bale Purchase'}</h3>
                {editingBaleId ? (
                  <button className="btn btn-secondary btn-sm" type="button" onClick={resetBaleForm} disabled={submitting}>
                    Cancel Edit
                  </button>
                ) : null}
              </div>
              <form onSubmit={saveBalePurchase}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Bale Batch No. *</label>
                    <input
                      className="form-input"
                      required
                      value={baleForm.bale_batch_no}
                      onChange={(event) => setBaleForm((prev) => ({ ...prev, bale_batch_no: event.target.value }))}
                    />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Supplier *</label>
                    <select
                      className="form-input"
                      value={baleForm.supplier_id}
                      onChange={(event) => {
                        const supplierId = event.target.value
                        const supplier = suppliers.find((s) => String(s.id) === String(supplierId))
                        setBaleForm((prev) => ({
                          ...prev,
                          supplier_id: supplierId,
                          supplier_name: supplier ? (supplier.name || '') : prev.supplier_name
                        }))
                      }}
                    >
                      <option value="">-- Select Supplier --</option>
                      {suppliers.map((supplier) => (
                        <option key={supplier.id} value={supplier.id}>
                          {supplier.name}
                        </option>
                      ))}
                    </select>
                    {suppliers.length === 0 && (
                      <div style={{ fontSize: 12, color: 'var(--text-light)', marginTop: 4 }}>
                        No suppliers available. Create suppliers first in the Suppliers module.
                      </div>
                    )}
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Supplier Name (Fallback)</label>
                    <input
                      className="form-input"
                      value={baleForm.supplier_name}
                      onChange={(event) => setBaleForm((prev) => ({ ...prev, supplier_name: event.target.value }))}
                      placeholder="Used when supplier record was deleted"
                    />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Purchase Date *</label>
                    <input
                      className="form-input"
                      type="date"
                      required
                      value={baleForm.purchase_date}
                      onChange={(event) => setBaleForm((prev) => ({ ...prev, purchase_date: event.target.value }))}
                    />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Bale Category</label>
                    <input
                      className="form-input"
                      value={baleForm.bale_category}
                      onChange={(event) => setBaleForm((prev) => ({ ...prev, bale_category: event.target.value }))}
                    />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Bale Cost</label>
                    <input
                      className="form-input"
                      type="number"
                      step="0.01"
                      min={0}
                      value={baleForm.bale_cost}
                      onChange={(event) => setBaleForm((prev) => ({ ...prev, bale_cost: event.target.value }))}
                    />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Quantity Ordered</label>
                    <input
                      className="form-input"
                      type="number"
                      min={0}
                      value={baleForm.quantity_ordered}
                      onChange={(event) => setBaleForm((prev) => ({ ...prev, quantity_ordered: event.target.value }))}
                    />
                  </div>
                  <div className="form-group" style={{ gridColumn: '1 / -1', marginBottom: 0 }}>
                    <label className="form-label">Notes</label>
                    <textarea
                      className="form-input"
                      rows={3}
                      value={baleForm.notes}
                      onChange={(event) => setBaleForm((prev) => ({ ...prev, notes: event.target.value }))}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginTop: 12, flexWrap: 'wrap' }}>
                  <div style={{ color: 'var(--text-mid)', fontSize: 14 }}>
                    Total Purchase Cost Preview: <strong>{fmtCurrency(baleTotalPreview)}</strong>
                  </div>
                  <button className="btn btn-primary" type="submit" disabled={submitting}>
                    {submitting ? 'Saving...' : editingBaleId ? 'Update Bale Purchase' : 'Save Bale Purchase'}
                  </button>
                </div>
              </form>
            </div>
          ) : (
            <div className="card" style={{ marginBottom: 16, color: 'var(--text-light)' }}>
              Your account can view bale purchases but cannot create or edit them.
            </div>
          )}

          <div className="card">
            <div className="card-header">
              <h3>Bale Purchases ({fmtNumber(bales.length)})</h3>
            </div>
            <div className="table-wrap responsive">
              <table>
                <thead>
                  <tr>
                    <th>Bale Batch No.</th>
                    <th>Purchase Date</th>
                    <th>Supplier</th>
                    <th>Category</th>
                    <th>Bale Cost</th>
                    <th>Total Cost</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {bales.length === 0 ? (
                    <tr>
                      <td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-light)' }}>
                        {loading ? 'Loading bale purchases...' : 'No bale purchases found for this filter.'}
                      </td>
                    </tr>
                  ) : bales.map((row) => (
                    <tr key={row.id}>
                      <td style={{ fontWeight: 700 }}>{row.bale_batch_no}</td>
                      <td>{fmtDate(row.purchase_date)}</td>
                      <td>{row.supplier_name || '-'}</td>
                      <td>{row.bale_category || '-'}</td>
                      <td>{fmtCurrency(row.bale_cost)}</td>
                      <td>{fmtCurrency(row.total_purchase_cost)}</td>
                      <td>
                        <div className="table-actions">
                          <button className="btn btn-secondary btn-sm" type="button" onClick={() => startBreakdownFromBale(row)}>
                            Open Breakdown
                          </button>
                          {canManageBales ? (
                            <button className="btn btn-outline btn-sm" type="button" onClick={() => startEditBale(row)}>
                              Edit
                            </button>
                          ) : null}
                          {canManageBales ? (
                            <button className="btn btn-danger btn-sm" type="button" onClick={() => deleteBalePurchase(row)}>
                              Delete
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
                {bales.length > 0 ? (
                  <tfoot>
                    <tr>
                      <td colSpan={4}>Totals</td>
                      <td>{fmtCurrency(baleTotals.bale_cost)}</td>
                      <td>{fmtCurrency(baleTotals.total_purchase_cost)}</td>
                      <td colSpan={2}></td>
                    </tr>
                  </tfoot>
                ) : null}
              </table>
            </div>
          </div>
        </>
      ) : null}

      {activeTab === 'bale-breakdowns' ? (
        <>
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-header">
              <h3>Bale Breakdown Entry</h3>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-secondary btn-sm" type="button" onClick={loadExistingBreakdown} disabled={submitting}>
                  Load Existing Record
                </button>
                <button className="btn btn-secondary btn-sm" type="button" onClick={resetBreakdownForm} disabled={submitting}>
                  Clear Form
                </button>
              </div>
            </div>

            <form onSubmit={saveBreakdown}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Bale Batch *</label>
                  <select
                    className="form-input"
                    required
                    value={breakdownForm.bale_purchase_id}
                    onChange={(event) => {
                      const balePurchaseId = event.target.value
                      const selectedBale = bales.find((row) => String(row.id) === String(balePurchaseId))
                      setBreakdownForm((prev) => ({
                        ...prev,
                        bale_purchase_id: balePurchaseId,
                        bale_category: selectedBale?.bale_category || ''
                      }))
                    }}
                  >
                    <option value="">Choose bale batch</option>
                    {bales.map((row) => (
                      <option key={row.id} value={row.id}>
                        {`${row.bale_batch_no} - ${row.supplier_name || 'Unknown Supplier'}`}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Category</label>
                  <input
                    className="form-input"
                    readOnly
                    value={selectedBreakdownCategory}
                    placeholder="Auto-filled from selected bale"
                  />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Breakdown Date</label>
                  <input
                    className="form-input"
                    type="date"
                    value={breakdownForm.breakdown_date}
                    onChange={(event) => setBreakdownForm((prev) => ({ ...prev, breakdown_date: event.target.value }))}
                  />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Total Pieces</label>
                  <input
                    className="form-input"
                    type="number"
                    min={0}
                    value={breakdownForm.total_pieces}
                    onChange={(event) => setBreakdownForm((prev) => ({ ...prev, total_pieces: event.target.value }))}
                  />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Class A - Premium</label>
                  <input
                    className="form-input"
                    type="number"
                    min={0}
                    value={breakdownForm.premium_items}
                    onChange={(event) => setBreakdownForm((prev) => ({ ...prev, premium_items: event.target.value }))}
                  />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Class B - Standard</label>
                  <input
                    className="form-input"
                    type="number"
                    min={0}
                    value={breakdownForm.standard_items}
                    onChange={(event) => setBreakdownForm((prev) => ({ ...prev, standard_items: event.target.value }))}
                  />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Damaged / Unsellable</label>
                  <input
                    className="form-input"
                    type="number"
                    min={0}
                    value={breakdownForm.damaged_items}
                    onChange={(event) => setBreakdownForm((prev) => ({ ...prev, damaged_items: event.target.value }))}
                  />
                </div>
                <div className="form-group" style={{ gridColumn: '1 / -1', marginBottom: 0 }}>
                  <label className="form-label">Notes</label>
                  <textarea
                    className="form-input"
                    rows={3}
                    value={breakdownForm.notes}
                    onChange={(event) => setBreakdownForm((prev) => ({ ...prev, notes: event.target.value }))}
                  />
                </div>
              </div>

              <div className="card" style={{ marginTop: 14, padding: 12, background: 'var(--cream-white)', border: '1px solid var(--border-light)' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
                  <div>
                    <div style={{ color: 'var(--text-light)', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Selected Batch</div>
                    <div style={{ fontWeight: 700 }}>{selectedBreakdownBale?.bale_batch_no || '-'}</div>
                  </div>
                  <div>
                    <div style={{ color: 'var(--text-light)', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Purchase Cost</div>
                    <div style={{ fontWeight: 700 }}>{fmtCurrency(selectedBreakdownBale?.total_purchase_cost || 0)}</div>
                  </div>
                  <div>
                    <div style={{ color: 'var(--text-light)', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Bale Category</div>
                    <div style={{ fontWeight: 700 }}>{selectedBreakdownCategory || '-'}</div>
                  </div>
                  <div>
                    <div style={{ color: 'var(--text-light)', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Computed Saleable Items</div>
                    <div style={{ fontWeight: 700 }}>{fmtNumber((Number(breakdownForm.premium_items) || 0) + (Number(breakdownForm.standard_items) || 0))}</div>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
                <button className="btn btn-primary" type="submit" disabled={submitting}>
                  {submitting ? 'Saving...' : 'Save Bale Breakdown'}
                </button>
              </div>
            </form>
          </div>

          <div className="card">
            <div className="card-header">
              <h3>Bale Breakdown Records ({fmtNumber(breakdowns.length)})</h3>
              <button className="btn btn-secondary btn-sm" type="button" onClick={() => fetchBreakdowns(baleFilters)} disabled={loading}>
                Refresh
              </button>
            </div>
            <div className="table-wrap responsive">
              <table>
                <thead>
                  <tr>
                    <th>Bale Batch No.</th>
                    <th>Supplier</th>
                    <th>Category</th>
                    <th>Breakdown Date</th>
                    <th>Total Pieces</th>
                    <th>Class A - Premium</th>
                    <th>Class B - Standard</th>
                    <th>Damaged</th>
                    <th>Saleable Pieces</th>
                    <th>Damaged Pieces</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {breakdowns.length === 0 ? (
                    <tr>
                      <td colSpan={11} style={{ textAlign: 'center', color: 'var(--text-light)' }}>
                        {loading ? 'Loading bale records...' : 'No bale breakdown records found for this filter.'}
                      </td>
                    </tr>
                  ) : breakdowns.map((row) => (
                    <tr key={row.id || row.bale_purchase_id}>
                      <td style={{ fontWeight: 700 }}>{row.bale_batch_no}</td>
                      <td>{row.supplier_name || '-'}</td>
                      <td>{row.bale_category || '-'}</td>
                      <td>{fmtDate(row.breakdown_date || row.purchase_date)}</td>
                      <td>{fmtNumber(row.total_pieces)}</td>
                      <td>{fmtNumber(row.premium_items)}</td>
                      <td>{fmtNumber(Number(row.standard_items || 0) + Number(row.low_grade_items || 0))}</td>
                      <td>{fmtNumber(row.damaged_items)}</td>
                      <td>{fmtNumber(Number(row.premium_items || 0) + Number(row.standard_items || 0) + Number(row.low_grade_items || 0))}</td>
                      <td>{fmtNumber(row.damaged_items)}</td>
                      <td>
                        <button
                          className="btn btn-outline btn-sm"
                          type="button"
                          onClick={() => {
                            setBreakdownForm(mapBreakdownToForm(row))
                            goToTab('bale-breakdowns')
                            clearMessages()
                          }}
                        >
                          Edit
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : null}

    </div>
  )
}
