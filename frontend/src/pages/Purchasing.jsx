import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useSelector } from 'react-redux'
import { useLocation, useNavigate } from 'react-router-dom'
import api from '../api/api.js'

const PURCHASING_TAB_KEYS = new Set(['bale-breakdowns'])
const DEFAULT_PURCHASING_TAB = 'bale-breakdowns'

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
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)
  const [breakdownForm, setBreakdownForm] = useState(createDefaultBreakdownForm)

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

  const fetchBales = useCallback(async () => {
    if (!canViewBales && !canManageBales) {
      setBales([])
      return
    }

    const response = await api.get('/bale-purchases')
    setBales(Array.isArray(response?.data) ? response.data : [])
  }, [canManageBales, canViewBales])

  const fetchBreakdowns = useCallback(async () => {
    if (!canViewBales && !canManageBales) {
      setBreakdowns([])
      return
    }

    const response = await api.get('/bale-purchases/breakdowns')
    setBreakdowns(Array.isArray(response?.data) ? response.data : [])
  }, [canManageBales, canViewBales])

  const refreshAll = useCallback(async () => {
    try {
      clearMessages()
      setLoading(true)
      await Promise.all([
        fetchBales(),
        fetchBreakdowns()
      ])
    } catch (err) {
      setError(err?.response?.data?.error || 'Failed to load bale breakdown data')
    } finally {
      setLoading(false)
    }
  }, [clearMessages, fetchBales, fetchBreakdowns])

  useEffect(() => {
    refreshAll()
  }, [refreshAll])

  useEffect(() => {
    if (location.pathname !== '/purchasing') return
    const params = new URLSearchParams(location.search)
    const currentTab = String(params.get('tab') || '').trim()
    if (currentTab === activeTab && activeTab === DEFAULT_PURCHASING_TAB && !location.hash) return
    params.set('tab', activeTab)
    navigate(`/purchasing?${params.toString()}`, { replace: true, preventScrollReset: true })
  }, [location.hash, location.pathname, location.search, activeTab, navigate])

  const selectedBreakdownBale = useMemo(
    () => bales.find((row) => String(row.id) === String(breakdownForm.bale_purchase_id)),
    [bales, breakdownForm.bale_purchase_id]
  )
  const selectedBreakdownCategory = selectedBreakdownBale
    ? String(selectedBreakdownBale.bale_category || '').trim()
    : String(breakdownForm.bale_category || '').trim()

  function resetBreakdownForm() {
    setBreakdownForm(createDefaultBreakdownForm())
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
      await fetchBreakdowns()
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
          <h1 className="page-title">Bale Breakdown</h1>
          <p className="page-subtitle">
            Classify received purchase order bales into saleable and damaged inventory records.
          </p>
        </div>
      </div>

      {error ? <div className="error-msg" style={{ marginBottom: 16 }}>{error}</div> : null}
      {success ? (
        <div className="success-msg" style={{ marginBottom: 16 }}>{success}</div>
      ) : null}

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
          <button className="btn btn-secondary btn-sm" type="button" onClick={refreshAll} disabled={loading}>
            {loading ? 'Refreshing...' : 'Refresh'}
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
                    {loading ? 'Loading bale records...' : 'No bale breakdown records found.'}
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
    </div>
  )
}
