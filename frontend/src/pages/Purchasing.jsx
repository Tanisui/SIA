import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSelector } from 'react-redux'
import { useLocation, useNavigate } from 'react-router-dom'
import { pdf } from '@react-pdf/renderer'
import { PODocument } from '../components/PODocument.jsx'
import api from '../api/api.js'

// ── constants ─────────────────────────────────────────────────────────────
const TABS = ['bale-purchases', 'purchase-orders', 'bale-breakdowns', 'bale-returns']
const DEFAULT_TAB = 'bale-purchases'
const PO_STATUSES = ['PENDING', 'ORDERED', 'RECEIVED', 'COMPLETED', 'CANCELLED']
const PAYMENT_METHODS = [
  { value: 'CASH',             label: 'Cash' },
  { value: 'GCASH',            label: 'GCash' },
  { value: 'BANK_TRANSFER',    label: 'Bank Transfer' },
  { value: 'PURCHASE_ORDER',   label: 'Purchase Order (Credit)' },
  { value: 'CHECK',            label: 'Check' }
]
const RETURN_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'PROCESSED']
const TERMS_OPTIONS   = [
  { value: 0,  label: 'Cash / COD' },
  { value: 7,  label: 'Net 7 days' },
  { value: 15, label: 'Net 15 days' },
  { value: 30, label: 'Net 30 days' },
  { value: 45, label: 'Net 45 days' },
  { value: 60, label: 'Net 60 days' }
]

// ── helpers ───────────────────────────────────────────────────────────────
function todayStr() {
  const n = new Date()
  return new Date(n.getTime() - n.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}
function toDateInput(v) {
  if (!v) return ''
  const s = String(v).trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  const d = new Date(s)
  return isNaN(d) ? '' : d.toISOString().slice(0, 10)
}
function fmtDate(v) {
  if (!v) return '-'
  const d = new Date(String(v).trim() + 'T00:00:00')
  return isNaN(d) ? String(v) : d.toLocaleDateString('en-PH', { month: 'short', day: '2-digit', year: 'numeric' })
}
function fmtCurrency(v) {
  return '₱' + Number(v || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function toMoney(v) { const n = Number(v); return Number.isFinite(n) && n >= 0 ? n : 0 }
function toInt(v)   { const n = Number(v); return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0 }
function poStatusColor(s) {
  if (s === 'COMPLETED') return { bg: '#DCFCE7', color: '#15803D' }
  if (s === 'ORDERED')   return { bg: '#DBEAFE', color: '#1D4ED8' }
  if (s === 'RECEIVED')  return { bg: '#FEF3C7', color: '#B45309' }
  if (s === 'CANCELLED') return { bg: '#FEE2E2', color: '#DC2626' }
  return { bg: '#F1F5F9', color: '#64748B' }
}
function retStatusColor(s) {
  if (s === 'APPROVED')  return { bg: '#DCFCE7', color: '#15803D' }
  if (s === 'PROCESSED') return { bg: '#DBEAFE', color: '#1D4ED8' }
  if (s === 'REJECTED')  return { bg: '#FEE2E2', color: '#DC2626' }
  return { bg: '#FEF3C7', color: '#B45309' }
}
function addDays(dateStr, days) {
  if (!dateStr || !days) return ''
  const d = new Date(dateStr + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

// ── default forms ─────────────────────────────────────────────────────────
function defaultBaleForm() {
  return {
    bale_batch_no: '', supplier_id: '', supplier_name: '', purchase_date: todayStr(),
    bale_type: '', bale_category: '', bale_cost: '', quantity_ordered: '',
    payment_status: 'UNPAID', po_status: 'PENDING',
    payment_method: 'CASH', payment_terms_days: 0, po_due_date: '',
    amount_paid: '', tax_amount: '', shipping_handling: '',
    special_instructions: '', authorized_by: '', ship_via: '',
    fob_point: '', shipping_terms: '', ship_to_name: '', ship_to_address: '',
    notes: ''
  }
}
function defaultBreakdownForm() {
  return { bale_purchase_id: '', total_pieces: '', premium_items: '', standard_items: '', damaged_items: '', breakdown_date: '', notes: '' }
}
function defaultReturnForm() {
  return {
    bale_purchase_id: '', supplier_id: '', supplier_name: '', return_date: todayStr(),
    reason: '', status: 'PENDING', notes: '',
    items: [{ item_code: '', description: '', quantity: 1, unit: 'PCS', unit_price: '', line_total: '' }]
  }
}
function defaultPoItem() {
  return { item_code: '', description: '', quantity: 1, unit: 'PCS', unit_price: '', line_total: '' }
}

// ── PO PDF Generator (react-pdf/renderer) ────────────────────────────────
async function generatePOPDF(bale, supplier, items, companyInfo) {
  const doc = React.createElement(PODocument, { bale, supplier, items, company: companyInfo })
  const blob = await pdf(doc).toBlob()
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = `PO-${bale.po_number || bale.bale_batch_no || bale.id}.pdf`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}

// ── Product search combobox for PO line items ────────────────────────────
function ProductSearchInput({ value, products, onTextChange, onSelect }) {
  const { useState: useS, useEffect: useE, useMemo: useM, useRef } = React
  const [query, setQuery]   = useS(value || '')
  const [open,  setOpen]    = useS(false)
  const containerRef        = useRef(null)

  useE(() => { setQuery(value || '') }, [value])

  const filtered = useM(() => {
    const q = (query || '').toLowerCase().trim()
    if (!q) return products.slice(0, 10)
    return products.filter((p) =>
      p.name?.toLowerCase().includes(q) ||
      p.sku?.toLowerCase().includes(q)  ||
      p.brand?.toLowerCase().includes(q)
    ).slice(0, 10)
  }, [query, products])

  function handleText(e) {
    setQuery(e.target.value)
    onTextChange(e.target.value)
    setOpen(true)
  }

  function handlePick(product) {
    const desc = [product.name, product.brand, product.size ? `(${product.size})` : ''].filter(Boolean).join(' ')
    setQuery(desc)
    setOpen(false)
    onSelect(product, desc)
  }

  return (
    <div ref={containerRef} style={{ position: 'relative', flex: 1 }}>
      <input
        className="form-input"
        style={{ padding: '4px 8px', fontSize: 13, width: '100%' }}
        placeholder="Description or search inventory…"
        value={query}
        onChange={handleText}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 160)}
      />
      {open && products.length > 0 && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 2px)', left: 0, right: 0,
          background: '#fff', border: '1px solid var(--border)',
          borderRadius: 6, boxShadow: '0 6px 18px rgba(0,0,0,0.12)',
          zIndex: 1000, maxHeight: 220, overflowY: 'auto'
        }}>
          <div style={{ padding: '5px 10px', fontSize: 10, color: 'var(--text-light)', borderBottom: '1px solid var(--border-light)', background: 'var(--cream-white)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Inventory Products
          </div>
          {filtered.length === 0 ? (
            <div style={{ padding: '10px', fontSize: 12, color: 'var(--text-light)', textAlign: 'center' }}>No matches</div>
          ) : filtered.map((p) => (
            <div
              key={p.id}
              onMouseDown={() => handlePick(p)}
              style={{ padding: '7px 10px', cursor: 'pointer', borderBottom: '1px solid var(--border-light)', display: 'flex', alignItems: 'center', gap: 8 }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--cream-white)' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = '#fff' }}
            >
              <span style={{ fontSize: 10, background: 'var(--gold-light)', padding: '1px 6px', borderRadius: 4, color: 'var(--gold-dark)', fontWeight: 700, flexShrink: 0 }}>
                {p.sku || '—'}
              </span>
              <span style={{ fontSize: 12, fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
              {p.brand && <span style={{ fontSize: 11, color: 'var(--text-light)', flexShrink: 0 }}>{p.brand}</span>}
              {p.size  && <span style={{ fontSize: 11, color: 'var(--text-light)', flexShrink: 0 }}>• {p.size}</span>}
              <span style={{ fontSize: 11, color: 'var(--gold-dark)', fontWeight: 700, flexShrink: 0 }}>
                ₱{Number(p.cost || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
export default function Purchasing() {
  const location   = useLocation()
  const navigate   = useNavigate()
  const permissions = useSelector((s) =>
    s.auth?.permissions || JSON.parse(localStorage.getItem('permissions') || '[]')
  )

  const hasAny = useCallback((perms) => {
    if (!Array.isArray(permissions)) return false
    if (permissions.includes('admin.*')) return true
    return perms.some((p) => permissions.includes(p))
  }, [permissions])

  const canView   = hasAny(['purchase.view', 'purchase.create', 'purchase.update', 'purchase.delete', 'purchase.receive', 'inventory.view', 'inventory.receive', 'reports.view', 'finance.reports.view'])
  const canManage = hasAny(['purchase.create', 'purchase.update', 'purchase.delete', 'purchase.receive', 'inventory.receive'])

  // ── state ──────────────────────────────────────────────────────────────
  const [bales,      setBales]      = useState([])
  const [breakdowns, setBreakdowns] = useState([])
  const [suppliers,  setSuppliers]  = useState([])
  const [returns,    setReturns]    = useState([])
  const [products,   setProducts]   = useState([])
  const [poItems,    setPoItems]    = useState([defaultPoItem()])
  const [loading,    setLoading]    = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error,      setError]      = useState(null)
  const [success,    setSuccess]    = useState(null)

  const [baleForm,       setBaleForm]       = useState(defaultBaleForm)
  const [breakdownForm,  setBreakdownForm]  = useState(defaultBreakdownForm)
  const [returnForm,     setReturnForm]     = useState(defaultReturnForm)
  const [editingBaleId,  setEditingBaleId]  = useState(null)
  const [editingReturnId,setEditingReturnId]= useState(null)
  const [baleFilters,    setBaleFilters]    = useState({ from: '', to: '', search: '' })
  const [generatingPdf,  setGeneratingPdf]  = useState(null)
  const [lastSaved,      setLastSaved]      = useState(null)  // { bale, isEdit }

  const activeTab = useMemo(() => {
    const p = new URLSearchParams(location.search)
    const t = String(p.get('tab') || '').trim()
    return TABS.includes(t) ? t : DEFAULT_TAB
  }, [location.search])

  const clearMsg = useCallback(() => { setError(null); setSuccess(null) }, [])
  const showMsg  = useCallback((m) => { setSuccess(m); setTimeout(() => setSuccess(null), 4000) }, [])
  const goToTab  = useCallback((t) => {
    if (!TABS.includes(t)) return
    const p = new URLSearchParams(location.search)
    p.set('tab', t)
    navigate(`/purchasing?${p}`, { replace: true, preventScrollReset: true })
  }, [location.search, navigate])

  // ── data loading ────────────────────────────────────────────────────────
  const fetchBales = useCallback(async (f = baleFilters) => {
    if (!canView) return
    const q = []
    if (f.from)   q.push(`from=${f.from}`)
    if (f.to)     q.push(`to=${f.to}`)
    if (f.search) q.push(`search=${encodeURIComponent(f.search)}`)
    const res = await api.get(`/bale-purchases${q.length ? '?' + q.join('&') : ''}`)
    setBales(Array.isArray(res.data) ? res.data : [])
  }, [baleFilters, canView])

  const fetchBreakdowns = useCallback(async (f = baleFilters) => {
    if (!canView) return
    const q = []
    if (f.from) q.push(`from=${f.from}`)
    if (f.to)   q.push(`to=${f.to}`)
    const res = await api.get(`/bale-purchases/breakdowns${q.length ? '?' + q.join('&') : ''}`)
    setBreakdowns(Array.isArray(res.data) ? res.data : [])
  }, [baleFilters, canView])

  const fetchSuppliers = useCallback(async () => {
    try {
      const res = await api.get('/suppliers')
      setSuppliers(Array.isArray(res.data) ? res.data : [])
    } catch { setSuppliers([]) }
  }, [])

  const fetchProducts = useCallback(async () => {
    try {
      const res = await api.get('/products')
      setProducts(Array.isArray(res.data) ? res.data : [])
    } catch { setProducts([]) }
  }, [])

  const fetchReturns = useCallback(async (f = baleFilters) => {
    if (!canView) return
    const q = []
    if (f.from) q.push(`from=${f.from}`)
    if (f.to)   q.push(`to=${f.to}`)
    const res = await api.get(`/bale-returns${q.length ? '?' + q.join('&') : ''}`)
    setReturns(Array.isArray(res.data?.data) ? res.data.data : [])
  }, [baleFilters, canView])

  const refreshAll = useCallback(async () => {
    clearMsg(); setLoading(true)
    try {
      await Promise.all([fetchBales(), fetchBreakdowns(), fetchSuppliers(), fetchProducts(), fetchReturns()])
    } catch (err) {
      setError(err?.response?.data?.error || 'Failed to load data')
    } finally { setLoading(false) }
  }, [clearMsg, fetchBales, fetchBreakdowns, fetchSuppliers, fetchProducts, fetchReturns])

  useEffect(() => { refreshAll() }, []) // eslint-disable-line

  // ── bale purchase handlers ───────────────────────────────────────────────
  function resetBaleForm() { setBaleForm(defaultBaleForm()); setEditingBaleId(null); setPoItems([defaultPoItem()]) }

  function startEditBale(row) {
    setEditingBaleId(row.id)
    setBaleForm({
      bale_batch_no:       row.bale_batch_no       || '',
      supplier_id:         String(row.supplier_id   || ''),
      supplier_name:       row.supplier_name        || '',
      purchase_date:       toDateInput(row.purchase_date),
      bale_type:           row.bale_type            || '',
      bale_category:       row.bale_category        || '',
      bale_cost:           String(row.bale_cost      ?? ''),
      quantity_ordered:    String(row.quantity_ordered ?? ''),
      payment_status:      row.payment_status       || 'UNPAID',
      po_status:           row.po_status            || 'PENDING',
      payment_method:      row.payment_method       || 'CASH',
      payment_terms_days:  row.payment_terms_days   ?? 0,
      po_due_date:         toDateInput(row.po_due_date),
      amount_paid:         String(row.amount_paid    ?? ''),
      tax_amount:          String(row.tax_amount     ?? ''),
      shipping_handling:   String(row.shipping_handling ?? ''),
      special_instructions:row.special_instructions || '',
      authorized_by:       row.authorized_by        || '',
      ship_via:            row.ship_via             || '',
      fob_point:           row.fob_point            || '',
      shipping_terms:      row.shipping_terms       || '',
      ship_to_name:        row.ship_to_name         || '',
      ship_to_address:     row.ship_to_address      || '',
      notes:               row.notes                || ''
    })
    // load PO line items
    api.get(`/bale-purchases/${row.id}/items`).then((res) => {
      setPoItems(Array.isArray(res.data) && res.data.length ? res.data.map((i) => ({
        item_code: i.item_code || '', description: i.description || '',
        quantity: i.quantity || 1, unit: i.unit || 'PCS',
        unit_price: String(i.unit_price ?? ''), line_total: String(i.line_total ?? '')
      })) : [defaultPoItem()])
    }).catch(() => setPoItems([defaultPoItem()]))
    goToTab('purchase-orders')
    clearMsg()
  }

  async function saveBalePurchase(e) {
    e.preventDefault(); clearMsg()
    if (!baleForm.bale_batch_no.trim()) return setError('Batch No. is required.')
    if (!baleForm.purchase_date)        return setError('Purchase date is required.')
    const selSupplier = suppliers.find((s) => String(s.id) === String(baleForm.supplier_id))
    const supplierName = String(selSupplier?.name || baleForm.supplier_name || '').trim()
    if (!baleForm.supplier_id && !supplierName) return setError('Supplier is required.')

    const validItems = poItems.filter((i) => i.description?.trim())
    const subtotal   = validItems.reduce((s, i) => s + toMoney(i.line_total || (toMoney(i.quantity || 1) * toMoney(i.unit_price))), 0)
    const totalCost  = subtotal || toMoney(baleForm.bale_cost)

    const payload = {
      bale_batch_no:       baleForm.bale_batch_no.trim(),
      supplier_id:         baleForm.supplier_id ? Number(baleForm.supplier_id) : null,
      supplier_name:       supplierName || null,
      purchase_date:       baleForm.purchase_date,
      bale_type:           baleForm.bale_type     || null,
      bale_category:       baleForm.bale_category || null,
      bale_cost:           toMoney(baleForm.bale_cost || subtotal),
      total_purchase_cost: totalCost,
      quantity_ordered:    toInt(baleForm.quantity_ordered),
      payment_status:      baleForm.payment_status || 'UNPAID',
      po_status:           baleForm.po_status      || 'PENDING',
      payment_method:      baleForm.payment_method || 'CASH',
      payment_terms_days:  Number(baleForm.payment_terms_days || 0),
      po_due_date:         baleForm.po_due_date || null,
      amount_paid:         toMoney(baleForm.amount_paid),
      tax_amount:          toMoney(baleForm.tax_amount),
      shipping_handling:   toMoney(baleForm.shipping_handling),
      special_instructions:baleForm.special_instructions || null,
      authorized_by:       baleForm.authorized_by   || null,
      ship_via:            baleForm.ship_via         || null,
      fob_point:           baleForm.fob_point        || null,
      shipping_terms:      baleForm.shipping_terms   || null,
      ship_to_name:        baleForm.ship_to_name     || null,
      ship_to_address:     baleForm.ship_to_address  || null,
      notes:               baleForm.notes            || null
    }
    try {
      setSubmitting(true)
      let savedId = editingBaleId
      if (editingBaleId) {
        await api.put(`/bale-purchases/${editingBaleId}`, payload)
      } else {
        const res = await api.post('/bale-purchases', payload)
        savedId = res.data?.id
      }
      // save line items
      if (savedId && validItems.length > 0) {
        await api.post(`/bale-purchases/${savedId}/items`, validItems.map((i) => ({
          ...i, quantity: toMoney(i.quantity || 1), unit_price: toMoney(i.unit_price),
          line_total: toMoney(i.line_total || (toMoney(i.quantity || 1) * toMoney(i.unit_price)))
        })))
      }
      const isEdit = Boolean(editingBaleId)
      await Promise.all([fetchBales(baleFilters), fetchBreakdowns(baleFilters)])
      // find the saved row from the refreshed list to use in the next-steps card
      const savedRow = isEdit
        ? { id: savedId, bale_batch_no: baleForm.bale_batch_no, supplier_name: supplierName, total_purchase_cost: totalCost, po_status: baleForm.po_status }
        : { id: savedId, bale_batch_no: payload.bale_batch_no, supplier_name: supplierName, total_purchase_cost: totalCost, po_status: payload.po_status }
      setLastSaved({ bale: savedRow, isEdit })
      resetBaleForm()
      goToTab('bale-purchases')
    } catch (err) {
      setError(err?.response?.data?.error || 'Failed to save bale purchase.')
    } finally { setSubmitting(false) }
  }

  async function deleteBalePurchase(row) {
    if (!window.confirm(`Delete bale batch "${row.bale_batch_no}"?`)) return
    clearMsg()
    try {
      setSubmitting(true)
      await api.delete(`/bale-purchases/${row.id}`)
      await Promise.all([fetchBales(baleFilters), fetchBreakdowns(baleFilters)])
      if (String(editingBaleId) === String(row.id)) resetBaleForm()
      showMsg('Deleted.')
    } catch (err) { setError(err?.response?.data?.error || 'Failed to delete.') }
    finally { setSubmitting(false) }
  }

  // ── PO item row helpers ──────────────────────────────────────────────────
  function updatePoItem(idx, key, val) {
    setPoItems((prev) => {
      const next = prev.map((r, i) => {
        if (i !== idx) return r
        const updated = { ...r, [key]: val }
        const qty   = toMoney(updated.quantity   || 1)
        const price = toMoney(updated.unit_price || 0)
        updated.line_total = (qty * price).toFixed(2)
        return updated
      })
      return next
    })
  }
  function addPoItem()       { setPoItems((p) => [...p, defaultPoItem()]) }
  function removePoItem(idx) { setPoItems((p) => p.filter((_, i) => i !== idx)) }

  function selectProductForPoItem(idx, product, desc) {
    setPoItems((prev) => prev.map((item, i) => {
      if (i !== idx) return item
      const price = Number(product.cost || 0)
      const qty   = toMoney(item.quantity || 1)
      return { ...item, item_code: product.sku || item.item_code, description: desc, unit_price: String(price), line_total: (qty * price).toFixed(2) }
    }))
  }

  function selectProductForReturnItem(idx, product, desc) {
    setReturnForm((prev) => {
      const items = prev.items.map((item, i) => {
        if (i !== idx) return item
        const price = Number(product.cost || 0)
        const qty   = toMoney(item.quantity || 1)
        return { ...item, item_code: product.sku || item.item_code, description: desc, unit_price: String(price), line_total: (qty * price).toFixed(2) }
      })
      return { ...prev, items }
    })
  }

  const poSubtotal = useMemo(() =>
    poItems.reduce((s, i) => s + toMoney(i.line_total), 0), [poItems])
  const poTotalDue = useMemo(() =>
    poSubtotal + toMoney(baleForm.tax_amount) + toMoney(baleForm.shipping_handling), [poSubtotal, baleForm])

  // ── generate PDF ─────────────────────────────────────────────────────────
  async function handleGeneratePDF(bale) {
    setGeneratingPdf(bale.id); clearMsg()
    try {
      const [itemsRes, poRes] = await Promise.all([
        api.get(`/bale-purchases/${bale.id}/items`).catch(() => ({ data: [] })),
        api.get(`/bale-purchases/${bale.id}/po-report`).catch(() => ({ data: { supplier: null } }))
      ])
      const items    = Array.isArray(itemsRes.data) ? itemsRes.data : []
      const supplier = poRes.data?.supplier || null
      const companyInfo = { name: "Cecille's N'Style", address: '', phone: '' }
      await generatePOPDF(bale, supplier, items, companyInfo)
    } catch (err) {
      setError('PDF generation failed: ' + (err.message || ''))
    } finally { setGeneratingPdf(null) }
  }

  // ── breakdown ────────────────────────────────────────────────────────────
  function resetBreakdownForm() { setBreakdownForm(defaultBreakdownForm()) }
  function startBreakdownFromBale(row) {
    const existing = breakdowns.find((b) => String(b.bale_purchase_id) === String(row.id))
    if (existing) {
      const premItems = Number(existing.premium_items || 0)
      const stdItems  = Number(existing.standard_items || 0) + Number(existing.low_grade_items || 0)
      setBreakdownForm({
        bale_purchase_id: String(existing.bale_purchase_id),
        total_pieces:     String(existing.total_pieces ?? ''),
        premium_items:    premItems > 0 ? String(premItems) : '',
        standard_items:   stdItems  > 0 ? String(stdItems)  : '',
        damaged_items:    String(existing.damaged_items ?? ''),
        breakdown_date:   toDateInput(existing.breakdown_date),
        notes:            existing.notes || ''
      })
    } else {
      setBreakdownForm({ ...defaultBreakdownForm(), bale_purchase_id: String(row.id), breakdown_date: todayStr() })
    }
    goToTab('bale-breakdowns'); clearMsg()
  }

  async function saveBreakdown(e) {
    e.preventDefault(); clearMsg()
    const bpId = Number(breakdownForm.bale_purchase_id)
    if (!bpId) return setError('Select a bale batch.')
    const payload = {
      total_pieces:   toInt(breakdownForm.total_pieces),
      premium_items:  toInt(breakdownForm.premium_items),
      standard_items: toInt(breakdownForm.standard_items),
      damaged_items:  toInt(breakdownForm.damaged_items),
      breakdown_date: breakdownForm.breakdown_date || todayStr(),
      notes: breakdownForm.notes || null
    }
    payload.saleable_items = payload.premium_items + payload.standard_items
    if (payload.saleable_items + payload.damaged_items > payload.total_pieces && payload.total_pieces > 0)
      return setError('Total exceeds total pieces.')
    try {
      setSubmitting(true)
      await api.put(`/bale-purchases/${bpId}/breakdown`, payload)
      await fetchBreakdowns(baleFilters)
      showMsg('Breakdown saved.')
    } catch (err) { setError(err?.response?.data?.error || 'Failed to save breakdown.') }
    finally { setSubmitting(false) }
  }

  // ── returns ──────────────────────────────────────────────────────────────
  function resetReturnForm() { setReturnForm(defaultReturnForm()); setEditingReturnId(null) }
  function startEditReturn(row) {
    setEditingReturnId(row.id)
    setReturnForm({
      bale_purchase_id: String(row.bale_purchase_id || ''),
      supplier_id:      String(row.supplier_id || ''),
      supplier_name:    row.supplier_name || '',
      return_date:      toDateInput(row.return_date),
      reason:           row.reason || '',
      status:           row.status || 'PENDING',
      notes:            row.notes || '',
      items:            (Array.isArray(row.items) && row.items.length ? row.items : [defaultPoItem()]).map((i) => ({
        item_code: i.item_code || '', description: i.description || '',
        quantity: i.quantity || 1, unit: i.unit || 'PCS',
        unit_price: String(i.unit_price ?? ''), line_total: String(i.line_total ?? '')
      }))
    })
    goToTab('bale-returns'); clearMsg()
  }

  function updateReturnItem(idx, key, val) {
    setReturnForm((prev) => ({
      ...prev,
      items: prev.items.map((r, i) => {
        if (i !== idx) return r
        const updated = { ...r, [key]: val }
        updated.line_total = (toMoney(updated.quantity || 1) * toMoney(updated.unit_price || 0)).toFixed(2)
        return updated
      })
    }))
  }
  function addReturnItem()       { setReturnForm((p) => ({ ...p, items: [...p.items, defaultPoItem()] })) }
  function removeReturnItem(idx) { setReturnForm((p) => ({ ...p, items: p.items.filter((_, i) => i !== idx) })) }

  const returnSubtotal = useMemo(() =>
    returnForm.items.reduce((s, i) => s + toMoney(i.line_total), 0), [returnForm.items])

  async function saveReturn(e) {
    e.preventDefault(); clearMsg()
    if (!returnForm.return_date) return setError('Return date is required.')
    const selSupplier = suppliers.find((s) => String(s.id) === String(returnForm.supplier_id))
    const payload = {
      bale_purchase_id: returnForm.bale_purchase_id ? Number(returnForm.bale_purchase_id) : null,
      supplier_id:      returnForm.supplier_id ? Number(returnForm.supplier_id) : null,
      supplier_name:    selSupplier?.name || returnForm.supplier_name || null,
      return_date:      returnForm.return_date,
      reason:           returnForm.reason  || null,
      status:           returnForm.status,
      notes:            returnForm.notes   || null,
      items:            returnForm.items.filter((i) => i.description?.trim()).map((i) => ({
        ...i, quantity: toMoney(i.quantity || 1), unit_price: toMoney(i.unit_price),
        line_total: toMoney(i.line_total)
      })),
      subtotal:         returnSubtotal,
      return_amount:    returnSubtotal
    }
    try {
      setSubmitting(true)
      if (editingReturnId) { await api.put(`/bale-returns/${editingReturnId}`, payload) }
      else                  { await api.post('/bale-returns', payload) }
      await fetchReturns(baleFilters)
      resetReturnForm()
      showMsg(editingReturnId ? 'Return updated.' : 'Return saved.')
    } catch (err) { setError(err?.response?.data?.error || 'Failed to save return.') }
    finally { setSubmitting(false) }
  }

  async function deleteReturn(row) {
    if (!window.confirm(`Delete return ${row.return_number}?`)) return
    try {
      await api.delete(`/bale-returns/${row.id}`)
      await fetchReturns(baleFilters)
      showMsg('Return deleted.')
    } catch (err) { setError(err?.response?.data?.error || 'Failed to delete.') }
  }

  // ── computed totals ──────────────────────────────────────────────────────
  const baleTotals = useMemo(() =>
    bales.reduce((a, r) => ({ bale_cost: a.bale_cost + Number(r.bale_cost || 0), total_purchase_cost: a.total_purchase_cost + Number(r.total_purchase_cost || 0) }), { bale_cost: 0, total_purchase_cost: 0 }),
    [bales])

  const selectedBreakdownBale = useMemo(() =>
    bales.find((r) => String(r.id) === String(breakdownForm.bale_purchase_id)), [bales, breakdownForm.bale_purchase_id])

  // ────────────────────────────────────────────────────────────────────────
  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Purchasing</h1>
          <p className="page-subtitle">Manage bale purchases, purchase orders, bale breakdowns, and supplier returns.</p>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={refreshAll} disabled={loading}>
          {loading ? 'Loading…' : '↺ Refresh'}
        </button>
      </div>

      {error   && <div className="error-msg"   style={{ marginBottom: 14 }}>{error}</div>}
      {success && <div className="success-msg" style={{ marginBottom: 14 }}>{success}</div>}

      {/* Tabs */}
      <div className="purchase-tabs" style={{ marginBottom: 20 }}>
        {[
          { key: 'bale-purchases',   label: 'Bale Purchases' },
          { key: 'purchase-orders',  label: 'Purchase Orders' },
          { key: 'bale-breakdowns',  label: 'Bale Breakdown' },
          { key: 'bale-returns',     label: 'Bale Returns' }
        ].map((t) => (
          <button key={t.key}
            className={`purchase-tab ${activeTab === t.key ? 'purchase-tab-active' : ''}`}
            type="button" onClick={() => goToTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── POST-SAVE NEXT STEPS CARD ─────────────────────────────────── */}
      {lastSaved && activeTab === 'bale-purchases' && (
        <div style={{
          background: 'linear-gradient(135deg, #FDF8F2 0%, #FEF3C7 100%)',
          border: '2px solid var(--gold)',
          borderRadius: 10, padding: '16px 20px', marginBottom: 18,
          display: 'flex', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap'
        }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span style={{ fontSize: 18 }}>✅</span>
              <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--gold-dark)' }}>
                {lastSaved.isEdit ? 'Purchase Order Updated' : 'Purchase Order Saved'}
              </span>
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-mid)', marginBottom: 4 }}>
              <strong>{lastSaved.bale.bale_batch_no}</strong>
              {lastSaved.bale.supplier_name ? ` · ${lastSaved.bale.supplier_name}` : ''}
              {lastSaved.bale.total_purchase_cost > 0 ? ` · ${fmtCurrency(lastSaved.bale.total_purchase_cost)}` : ''}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-light)' }}>What would you like to do next?</div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <button className="btn btn-primary btn-sm"
              onClick={() => handleGeneratePDF(lastSaved.bale)}
              disabled={generatingPdf === lastSaved.bale.id}>
              {generatingPdf === lastSaved.bale.id ? '…' : '📄 Generate PDF'}
            </button>
            <button className="btn btn-secondary btn-sm"
              onClick={() => {
                const row = bales.find((b) => b.id === lastSaved.bale.id) || lastSaved.bale
                startBreakdownFromBale(row)
              }}>
              🔧 Do Breakdown
            </button>
            <button className="btn btn-outline btn-sm"
              onClick={() => {
                const row = bales.find((b) => b.id === lastSaved.bale.id) || lastSaved.bale
                startEditBale(row)
              }}>
              ✏️ Edit PO
            </button>
            <button className="btn btn-outline btn-sm"
              onClick={() => { resetBaleForm(); setLastSaved(null); goToTab('purchase-orders') }}>
              + New PO
            </button>
            <button type="button" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: 'var(--text-light)', padding: '0 4px' }}
              onClick={() => setLastSaved(null)} title="Dismiss">
              ×
            </button>
          </div>
        </div>
      )}

      {/* ── BALE PURCHASES TAB ─────────────────────────────────────────── */}
      {activeTab === 'bale-purchases' && (
        <>
          {/* Filters */}
          <div className="card" style={{ marginBottom: 14 }}>
            <div className="card-header"><h3>Filters</h3>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-secondary btn-sm" onClick={() => { const f = { from: '', to: '', search: '' }; setBaleFilters(f); fetchBales(f) }}>Clear</button>
                <button className="btn btn-primary btn-sm" onClick={() => fetchBales(baleFilters)} disabled={loading}>{loading ? '…' : 'Search'}</button>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
              {[['from', 'From', 'date'], ['to', 'To', 'date']].map(([key, lbl, type]) => (
                <div key={key} className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">{lbl}</label>
                  <input className="form-input" type={type} value={baleFilters[key]}
                    onChange={(e) => setBaleFilters((p) => ({ ...p, [key]: e.target.value }))} />
                </div>
              ))}
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Search</label>
                <input className="form-input" value={baleFilters.search}
                  onChange={(e) => setBaleFilters((p) => ({ ...p, search: e.target.value }))}
                  placeholder="Batch no., supplier, category" />
              </div>
            </div>
          </div>

          {/* Bale Purchases Table */}
          <div className="card">
            <div className="card-header">
              <h3>Bale Purchases ({bales.length})</h3>
              {canManage && (
                <button className="btn btn-primary btn-sm" onClick={() => { resetBaleForm(); setLastSaved(null); goToTab('purchase-orders') }}>
                  + New Purchase Order
                </button>
              )}
            </div>
            <div className="table-wrap responsive">
              <table>
                <thead><tr>
                  <th>Batch No.</th><th>Date</th><th>Supplier</th><th>Category</th>
                  <th>PO Status</th><th>Payment</th><th>Bale Cost</th><th>Total Cost</th><th>Due Date</th><th>Actions</th>
                </tr></thead>
                <tbody>
                  {bales.length === 0 ? (
                    <tr><td colSpan={10} style={{ textAlign: 'center', color: 'var(--text-light)', padding: 32 }}>
                      {loading ? 'Loading…' : 'No bale purchases found.'}
                    </td></tr>
                  ) : bales.map((row) => {
                    const sc = poStatusColor(row.po_status)
                    const overdue = row.po_due_date && row.payment_status !== 'PAID' && new Date(row.po_due_date) < new Date()
                    const isJustSaved = lastSaved?.bale?.id === row.id
                    return (
                      <tr key={row.id} style={isJustSaved ? { background: '#FFFBEB', outline: '2px solid var(--gold)', outlineOffset: '-2px' } : undefined}>
                        <td style={{ fontWeight: 700 }}>
                          {row.bale_batch_no}
                          {isJustSaved && <span style={{ marginLeft: 6, fontSize: 10, background: 'var(--gold)', color: '#fff', padding: '1px 6px', borderRadius: 10, verticalAlign: 'middle' }}>NEW</span>}
                        </td>
                        <td>{fmtDate(row.purchase_date)}</td>
                        <td>{row.supplier_name || '-'}</td>
                        <td>{row.bale_category || '-'}</td>
                        <td>
                          <span style={{ background: sc.bg, color: sc.color, padding: '2px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600 }}>
                            {row.po_status || '-'}
                          </span>
                        </td>
                        <td>
                          <span style={{ fontSize: 12 }}>
                            {row.payment_method === 'PURCHASE_ORDER' ? 'PO Credit' : (row.payment_method || 'Cash')}
                            {row.payment_terms_days > 0 ? ` (Net ${row.payment_terms_days})` : ''}
                          </span>
                        </td>
                        <td>{fmtCurrency(row.bale_cost)}</td>
                        <td>{fmtCurrency(row.total_purchase_cost)}</td>
                        <td style={{ color: overdue ? 'var(--error)' : undefined, fontWeight: overdue ? 700 : undefined }}>
                          {row.po_due_date ? fmtDate(row.po_due_date) : '-'}
                          {overdue ? ' ⚠' : ''}
                        </td>
                        <td>
                          <div className="table-actions">
                            <button className="btn btn-secondary btn-sm" onClick={() => startBreakdownFromBale(row)}>Breakdown</button>
                            <button className="btn btn-outline btn-sm" onClick={() => handleGeneratePDF(row)} disabled={generatingPdf === row.id}>
                              {generatingPdf === row.id ? '…' : 'PDF'}
                            </button>
                            {canManage && <button className="btn btn-outline btn-sm" onClick={() => startEditBale(row)}>Edit</button>}
                            {canManage && <button className="btn btn-danger btn-sm"  onClick={() => deleteBalePurchase(row)}>Delete</button>}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                {bales.length > 0 && (
                  <tfoot><tr>
                    <td colSpan={6} style={{ fontWeight: 600 }}>Totals</td>
                    <td style={{ fontWeight: 700 }}>{fmtCurrency(baleTotals.bale_cost)}</td>
                    <td style={{ fontWeight: 700 }}>{fmtCurrency(baleTotals.total_purchase_cost)}</td>
                    <td colSpan={2}></td>
                  </tr></tfoot>
                )}
              </table>
            </div>
          </div>
        </>
      )}

      {/* ── PURCHASE ORDER FORM TAB ────────────────────────────────────── */}
      {activeTab === 'purchase-orders' && canManage && (
        <>
          <div className="card" style={{ marginBottom: 14 }}>
            <div className="card-header">
              <h3 style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ background: 'var(--gold)', color: '#fff', padding: '3px 12px', borderRadius: 20, fontSize: 13 }}>
                  PURCHASE ORDER
                </span>
                {editingBaleId ? `Edit — ${baleForm.bale_batch_no}` : 'New Purchase Order'}
              </h3>
              {editingBaleId && (
                <button className="btn btn-secondary btn-sm" onClick={resetBaleForm}>Cancel Edit</button>
              )}
            </div>

            <form onSubmit={saveBalePurchase}>
              {/* Section: PO Header */}
              <div style={{ background: 'var(--cream-white)', border: '1px solid var(--border-light)', borderRadius: 8, padding: '14px 16px', marginBottom: 16 }}>
                <p style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-light)', marginBottom: 10, fontWeight: 600 }}>Order Details</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Batch / PO No. *</label>
                    <input className="form-input" required value={baleForm.bale_batch_no}
                      onChange={(e) => setBaleForm((p) => ({ ...p, bale_batch_no: e.target.value }))} />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Purchase Date *</label>
                    <input className="form-input" type="date" required value={baleForm.purchase_date}
                      onChange={(e) => setBaleForm((p) => ({ ...p, purchase_date: e.target.value }))} />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">PO Status</label>
                    <select className="form-input" value={baleForm.po_status}
                      onChange={(e) => setBaleForm((p) => ({ ...p, po_status: e.target.value }))}>
                      {PO_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Category</label>
                    <input className="form-input" value={baleForm.bale_category}
                      onChange={(e) => setBaleForm((p) => ({ ...p, bale_category: e.target.value }))} />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Authorized By</label>
                    <input className="form-input" value={baleForm.authorized_by}
                      onChange={(e) => setBaleForm((p) => ({ ...p, authorized_by: e.target.value }))} />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Qty Ordered</label>
                    <input className="form-input" type="number" min={0} value={baleForm.quantity_ordered}
                      onChange={(e) => setBaleForm((p) => ({ ...p, quantity_ordered: e.target.value }))} />
                  </div>
                </div>
              </div>

              {/* Section: Vendor */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
                <div style={{ background: 'var(--cream-white)', border: '1px solid var(--border-light)', borderRadius: 8, padding: '14px 16px' }}>
                  <p style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-light)', marginBottom: 10, fontWeight: 600 }}>Vendor</p>
                  <div className="form-group" style={{ marginBottom: 10 }}>
                    <label className="form-label">Supplier *</label>
                    <select className="form-input" value={baleForm.supplier_id}
                      onChange={(e) => {
                        const s = suppliers.find((x) => String(x.id) === String(e.target.value))
                        setBaleForm((p) => ({
                          ...p, supplier_id: e.target.value,
                          supplier_name: s?.name || p.supplier_name,
                          payment_terms_days: s?.default_payment_terms_days ?? p.payment_terms_days
                        }))
                      }}>
                      <option value="">— Select Supplier —</option>
                      {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Supplier Name (override)</label>
                    <input className="form-input" value={baleForm.supplier_name}
                      onChange={(e) => setBaleForm((p) => ({ ...p, supplier_name: e.target.value }))} />
                  </div>
                </div>
                <div style={{ background: 'var(--cream-white)', border: '1px solid var(--border-light)', borderRadius: 8, padding: '14px 16px' }}>
                  <p style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-light)', marginBottom: 10, fontWeight: 600 }}>Ship To</p>
                  <div className="form-group" style={{ marginBottom: 10 }}>
                    <label className="form-label">Ship To Name</label>
                    <input className="form-input" value={baleForm.ship_to_name}
                      onChange={(e) => setBaleForm((p) => ({ ...p, ship_to_name: e.target.value }))} />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Ship To Address</label>
                    <textarea className="form-input" rows={2} value={baleForm.ship_to_address}
                      onChange={(e) => setBaleForm((p) => ({ ...p, ship_to_address: e.target.value }))} />
                  </div>
                </div>
              </div>

              {/* Shipping row */}
              <div style={{ background: 'var(--cream-white)', border: '1px solid var(--border-light)', borderRadius: 8, padding: '14px 16px', marginBottom: 16 }}>
                <p style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-light)', marginBottom: 10, fontWeight: 600 }}>Shipping Info</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
                  {[
                    ['ship_via', 'Ship Via'], ['fob_point', 'FOB Point'], ['shipping_terms', 'Shipping Terms']
                  ].map(([key, lbl]) => (
                    <div key={key} className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">{lbl}</label>
                      <input className="form-input" value={baleForm[key]}
                        onChange={(e) => setBaleForm((p) => ({ ...p, [key]: e.target.value }))} />
                    </div>
                  ))}
                </div>
              </div>

              {/* Line Items */}
              <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', marginBottom: 16 }}>
                <div style={{ background: 'var(--gold)', padding: '8px 14px', display: 'grid', gridTemplateColumns: '90px 1fr 70px 55px 100px 90px 34px', gap: 6 }}>
                  {['ITEM CODE', 'DESCRIPTION / PRODUCT', 'QTY', 'UNIT', 'UNIT PRICE', 'TOTAL', ''].map((h) => (
                    <span key={h} style={{ color: '#fff', fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</span>
                  ))}
                </div>
                {poItems.map((item, idx) => (
                  <div key={idx} style={{ display: 'grid', gridTemplateColumns: '90px 1fr 70px 55px 100px 90px 34px', gap: 6, padding: '6px 14px', background: idx % 2 === 0 ? 'var(--white)' : 'var(--cream-white)', borderTop: '1px solid var(--border-light)', alignItems: 'start' }}>
                    <input className="form-input" style={{ padding: '4px 8px', fontSize: 13 }} placeholder="SKU / Code"
                      value={item.item_code} onChange={(e) => updatePoItem(idx, 'item_code', e.target.value)} />
                    <ProductSearchInput
                      value={item.description}
                      products={products}
                      onTextChange={(v) => updatePoItem(idx, 'description', v)}
                      onSelect={(product, desc) => selectProductForPoItem(idx, product, desc)}
                    />
                    <input className="form-input" style={{ padding: '4px 8px', fontSize: 13 }} type="number" min={0} step="0.01"
                      value={item.quantity} onChange={(e) => updatePoItem(idx, 'quantity', e.target.value)} />
                    <input className="form-input" style={{ padding: '4px 8px', fontSize: 13 }} placeholder="PCS"
                      value={item.unit} onChange={(e) => updatePoItem(idx, 'unit', e.target.value)} />
                    <input className="form-input" style={{ padding: '4px 8px', fontSize: 13 }} type="number" min={0} step="0.01" placeholder="0.00"
                      value={item.unit_price} onChange={(e) => updatePoItem(idx, 'unit_price', e.target.value)} />
                    <input className="form-input" style={{ padding: '4px 8px', fontSize: 13, background: 'var(--cream-light)' }}
                      value={item.line_total} readOnly />
                    <button type="button" className="btn btn-danger btn-sm" style={{ padding: '4px 8px', fontSize: 13 }}
                      onClick={() => removePoItem(idx)} disabled={poItems.length === 1}>×</button>
                  </div>
                ))}
                <div style={{ padding: '8px 14px', background: 'var(--cream-white)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <button type="button" className="btn btn-outline btn-sm" onClick={addPoItem}>+ Add Row</button>
                  <span style={{ fontSize: 11, color: 'var(--text-light)' }}>Type or click Description to search from inventory</span>
                </div>
              </div>

              {/* Totals + Payment */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                <div style={{ background: 'var(--cream-white)', border: '1px solid var(--border-light)', borderRadius: 8, padding: '14px 16px' }}>
                  <p style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-light)', marginBottom: 10, fontWeight: 600 }}>Payment</p>
                  <div className="form-group" style={{ marginBottom: 10 }}>
                    <label className="form-label">Mode of Payment</label>
                    <select className="form-input" value={baleForm.payment_method}
                      onChange={(e) => setBaleForm((p) => ({ ...p, payment_method: e.target.value }))}>
                      {PAYMENT_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                    </select>
                  </div>
                  {baleForm.payment_method === 'PURCHASE_ORDER' && (
                    <>
                      <div className="form-group" style={{ marginBottom: 10 }}>
                        <label className="form-label">Payment Terms</label>
                        <select className="form-input" value={baleForm.payment_terms_days}
                          onChange={(e) => {
                            const days = Number(e.target.value)
                            setBaleForm((p) => ({ ...p, payment_terms_days: days, po_due_date: addDays(p.purchase_date, days) }))
                          }}>
                          {TERMS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      </div>
                      <div className="form-group" style={{ marginBottom: 10 }}>
                        <label className="form-label">Due Date (auto-computed)</label>
                        <input className="form-input" type="date" value={baleForm.po_due_date}
                          onChange={(e) => setBaleForm((p) => ({ ...p, po_due_date: e.target.value }))} />
                      </div>
                    </>
                  )}
                  <div className="form-group" style={{ marginBottom: 10 }}>
                    <label className="form-label">Payment Status</label>
                    <select className="form-input" value={baleForm.payment_status}
                      onChange={(e) => setBaleForm((p) => ({ ...p, payment_status: e.target.value }))}>
                      {['UNPAID', 'PARTIAL', 'PAID'].map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Amount Paid</label>
                    <input className="form-input" type="number" min={0} step="0.01" value={baleForm.amount_paid}
                      onChange={(e) => setBaleForm((p) => ({ ...p, amount_paid: e.target.value }))} />
                  </div>
                </div>

                <div style={{ background: 'var(--cream-white)', border: '1px solid var(--border-light)', borderRadius: 8, padding: '14px 16px' }}>
                  <p style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-light)', marginBottom: 10, fontWeight: 600 }}>Summary</p>
                  {[
                    ['Tax Amount', 'tax_amount'], ['Shipping & Handling', 'shipping_handling']
                  ].map(([lbl, key]) => (
                    <div key={key} className="form-group" style={{ marginBottom: 10 }}>
                      <label className="form-label">{lbl}</label>
                      <input className="form-input" type="number" min={0} step="0.01" value={baleForm[key]}
                        onChange={(e) => setBaleForm((p) => ({ ...p, [key]: e.target.value }))} />
                    </div>
                  ))}
                  <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10, marginTop: 6 }}>
                    {[
                      { label: 'Subtotal', value: poSubtotal },
                      { label: 'Tax',      value: toMoney(baleForm.tax_amount) },
                      { label: 'S&H',      value: toMoney(baleForm.shipping_handling) }
                    ].map((r) => (
                      <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 13, color: 'var(--text-mid)' }}>
                        <span>{r.label}</span><span>{fmtCurrency(r.value)}</span>
                      </div>
                    ))}
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, background: 'var(--gold)', color: '#fff', padding: '8px 12px', borderRadius: 6, fontWeight: 700, fontSize: 15 }}>
                      <span>TOTAL DUE</span><span>{fmtCurrency(poTotalDue)}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Special Instructions + Notes */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Special Instructions</label>
                  <textarea className="form-input" rows={3} value={baleForm.special_instructions}
                    onChange={(e) => setBaleForm((p) => ({ ...p, special_instructions: e.target.value }))} />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Notes</label>
                  <textarea className="form-input" rows={3} value={baleForm.notes}
                    onChange={(e) => setBaleForm((p) => ({ ...p, notes: e.target.value }))} />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button className="btn btn-secondary" type="button" onClick={resetBaleForm} disabled={submitting}>Cancel</button>
                <button className="btn btn-primary" type="submit" disabled={submitting}>
                  {submitting ? 'Saving…' : editingBaleId ? 'Update Purchase Order' : 'Save Purchase Order'}
                </button>
              </div>
            </form>
          </div>
        </>
      )}

      {/* ── BALE BREAKDOWN TAB ─────────────────────────────────────────── */}
      {activeTab === 'bale-breakdowns' && (
        <>
          <div className="card" style={{ marginBottom: 14 }}>
            <div className="card-header">
              <h3>Bale Breakdown Entry</h3>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-secondary btn-sm" onClick={resetBreakdownForm}>Clear</button>
              </div>
            </div>
            <form onSubmit={saveBreakdown}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Bale Batch *</label>
                  <select className="form-input" required value={breakdownForm.bale_purchase_id}
                    onChange={(e) => setBreakdownForm((p) => ({ ...p, bale_purchase_id: e.target.value }))}>
                    <option value="">Choose bale batch</option>
                    {bales.map((r) => <option key={r.id} value={r.id}>{r.bale_batch_no} — {r.supplier_name || 'Unknown'}</option>)}
                  </select>
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Breakdown Date</label>
                  <input className="form-input" type="date" value={breakdownForm.breakdown_date}
                    onChange={(e) => setBreakdownForm((p) => ({ ...p, breakdown_date: e.target.value }))} />
                </div>
                {[['total_pieces', 'Total Pieces'], ['premium_items', 'Class A — Premium'], ['standard_items', 'Class B — Standard'], ['damaged_items', 'Damaged / Unsellable']].map(([key, lbl]) => (
                  <div key={key} className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">{lbl}</label>
                    <input className="form-input" type="number" min={0} value={breakdownForm[key]}
                      onChange={(e) => setBreakdownForm((p) => ({ ...p, [key]: e.target.value }))} />
                  </div>
                ))}
                <div className="form-group" style={{ gridColumn: '1 / -1', marginBottom: 0 }}>
                  <label className="form-label">Notes</label>
                  <textarea className="form-input" rows={2} value={breakdownForm.notes}
                    onChange={(e) => setBreakdownForm((p) => ({ ...p, notes: e.target.value }))} />
                </div>
              </div>

              {selectedBreakdownBale && (
                <div style={{ display: 'flex', gap: 16, marginTop: 12, padding: '10px 14px', background: 'var(--cream-white)', borderRadius: 8, border: '1px solid var(--border-light)', flexWrap: 'wrap' }}>
                  {[
                    ['Batch', selectedBreakdownBale.bale_batch_no],
                    ['Purchase Cost', fmtCurrency(selectedBreakdownBale.total_purchase_cost || selectedBreakdownBale.bale_cost)],
                    ['Saleable', (toInt(breakdownForm.premium_items) + toInt(breakdownForm.standard_items)).toString()]
                  ].map(([lbl, val]) => (
                    <div key={lbl}>
                      <div style={{ color: 'var(--text-light)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{lbl}</div>
                      <div style={{ fontWeight: 700 }}>{val}</div>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
                <button className="btn btn-primary" type="submit" disabled={submitting}>
                  {submitting ? 'Saving…' : 'Save Breakdown'}
                </button>
              </div>
            </form>
          </div>

          <div className="card">
            <div className="card-header"><h3>Breakdown Records ({breakdowns.length})</h3></div>
            <div className="table-wrap responsive">
              <table>
                <thead><tr>
                  <th>Batch No.</th><th>Supplier</th><th>Breakdown Date</th>
                  <th>Total</th><th>Class A</th><th>Class B</th><th>Damaged</th><th>Saleable</th><th>Action</th>
                </tr></thead>
                <tbody>
                  {breakdowns.length === 0 ? (
                    <tr><td colSpan={9} style={{ textAlign: 'center', color: 'var(--text-light)', padding: 24 }}>{loading ? 'Loading…' : 'No records.'}</td></tr>
                  ) : breakdowns.map((row) => (
                    <tr key={row.id || row.bale_purchase_id}>
                      <td style={{ fontWeight: 700 }}>{row.bale_batch_no}</td>
                      <td>{row.supplier_name || '-'}</td>
                      <td>{fmtDate(row.breakdown_date || row.purchase_date)}</td>
                      <td>{Number(row.total_pieces || 0).toLocaleString()}</td>
                      <td>{Number(row.premium_items || 0).toLocaleString()}</td>
                      <td>{(Number(row.standard_items || 0) + Number(row.low_grade_items || 0)).toLocaleString()}</td>
                      <td>{Number(row.damaged_items || 0).toLocaleString()}</td>
                      <td style={{ fontWeight: 600 }}>{(Number(row.premium_items || 0) + Number(row.standard_items || 0) + Number(row.low_grade_items || 0)).toLocaleString()}</td>
                      <td>
                        <button className="btn btn-outline btn-sm" onClick={() => {
                          const prem = Number(row.premium_items || 0)
                          const std  = Number(row.standard_items || 0) + Number(row.low_grade_items || 0)
                          setBreakdownForm({
                            bale_purchase_id: String(row.bale_purchase_id),
                            total_pieces: String(row.total_pieces ?? ''),
                            premium_items: prem > 0 ? String(prem) : '',
                            standard_items: std > 0 ? String(std) : '',
                            damaged_items: String(row.damaged_items ?? ''),
                            breakdown_date: toDateInput(row.breakdown_date),
                            notes: row.notes || ''
                          }); clearMsg()
                        }}>Edit</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ── BALE RETURNS TAB ──────────────────────────────────────────── */}
      {activeTab === 'bale-returns' && (
        <>
          {canManage && (
            <div className="card" style={{ marginBottom: 14 }}>
              <div className="card-header">
                <h3>{editingReturnId ? 'Edit Return' : 'New Bale Return'}</h3>
                {editingReturnId && <button className="btn btn-secondary btn-sm" onClick={resetReturnForm}>Cancel</button>}
              </div>
              <form onSubmit={saveReturn}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 14 }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Return Date *</label>
                    <input className="form-input" type="date" required value={returnForm.return_date}
                      onChange={(e) => setReturnForm((p) => ({ ...p, return_date: e.target.value }))} />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Related Bale Batch</label>
                    <select className="form-input" value={returnForm.bale_purchase_id}
                      onChange={(e) => setReturnForm((p) => ({ ...p, bale_purchase_id: e.target.value }))}>
                      <option value="">— None —</option>
                      {bales.map((r) => <option key={r.id} value={r.id}>{r.bale_batch_no}</option>)}
                    </select>
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Supplier</label>
                    <select className="form-input" value={returnForm.supplier_id}
                      onChange={(e) => setReturnForm((p) => ({ ...p, supplier_id: e.target.value }))}>
                      <option value="">— Select —</option>
                      {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Status</label>
                    <select className="form-input" value={returnForm.status}
                      onChange={(e) => setReturnForm((p) => ({ ...p, status: e.target.value }))}>
                      {RETURN_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div className="form-group" style={{ gridColumn: '1 / -1', marginBottom: 0 }}>
                    <label className="form-label">Reason</label>
                    <input className="form-input" value={returnForm.reason}
                      onChange={(e) => setReturnForm((p) => ({ ...p, reason: e.target.value }))} />
                  </div>
                </div>

                {/* Return Items */}
                <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', marginBottom: 14 }}>
                  <div style={{ background: 'var(--gold)', padding: '8px 14px', display: 'grid', gridTemplateColumns: '90px 1fr 70px 55px 100px 90px 34px', gap: 6 }}>
                    {['ITEM CODE', 'DESCRIPTION / PRODUCT', 'QTY', 'UNIT', 'UNIT PRICE', 'TOTAL', ''].map((h) => (
                      <span key={h} style={{ color: '#fff', fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</span>
                    ))}
                  </div>
                  {returnForm.items.map((item, idx) => (
                    <div key={idx} style={{ display: 'grid', gridTemplateColumns: '90px 1fr 70px 55px 100px 90px 34px', gap: 6, padding: '6px 14px', background: idx % 2 === 0 ? 'var(--white)' : 'var(--cream-white)', borderTop: '1px solid var(--border-light)', alignItems: 'start' }}>
                      <input className="form-input" style={{ padding: '4px 8px', fontSize: 13 }} placeholder="SKU / Code"
                        value={item.item_code} onChange={(e) => updateReturnItem(idx, 'item_code', e.target.value)} />
                      <ProductSearchInput
                        value={item.description}
                        products={products}
                        onTextChange={(v) => updateReturnItem(idx, 'description', v)}
                        onSelect={(product, desc) => selectProductForReturnItem(idx, product, desc)}
                      />
                      <input className="form-input" style={{ padding: '4px 8px', fontSize: 13 }} type="number" min={0} step="0.01"
                        value={item.quantity} onChange={(e) => updateReturnItem(idx, 'quantity', e.target.value)} />
                      <input className="form-input" style={{ padding: '4px 8px', fontSize: 13 }} value={item.unit}
                        onChange={(e) => updateReturnItem(idx, 'unit', e.target.value)} />
                      <input className="form-input" style={{ padding: '4px 8px', fontSize: 13 }} type="number" min={0} step="0.01"
                        value={item.unit_price} onChange={(e) => updateReturnItem(idx, 'unit_price', e.target.value)} />
                      <input className="form-input" style={{ padding: '4px 8px', fontSize: 13, background: 'var(--cream-light)' }}
                        value={item.line_total} readOnly />
                      <button type="button" className="btn btn-danger btn-sm" style={{ padding: '4px 8px', fontSize: 13 }}
                        onClick={() => removeReturnItem(idx)} disabled={returnForm.items.length === 1}>×</button>
                    </div>
                  ))}
                  <div style={{ padding: '8px 14px', background: 'var(--cream-white)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <button type="button" className="btn btn-outline btn-sm" onClick={addReturnItem}>+ Add Row</button>
                    <div style={{ fontWeight: 700, color: 'var(--text-dark)' }}>
                      Return Amount: <span style={{ color: 'var(--gold-dark)' }}>{fmtCurrency(returnSubtotal)}</span>
                    </div>
                  </div>
                </div>

                <div className="form-group" style={{ marginBottom: 14 }}>
                  <label className="form-label">Notes</label>
                  <textarea className="form-input" rows={2} value={returnForm.notes}
                    onChange={(e) => setReturnForm((p) => ({ ...p, notes: e.target.value }))} />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                  <button className="btn btn-secondary" type="button" onClick={resetReturnForm}>Cancel</button>
                  <button className="btn btn-primary" type="submit" disabled={submitting}>
                    {submitting ? 'Saving…' : editingReturnId ? 'Update Return' : 'Save Return'}
                  </button>
                </div>
              </form>
            </div>
          )}

          <div className="card">
            <div className="card-header">
              <h3>Bale Returns ({returns.length})</h3>
            </div>
            <div className="table-wrap responsive">
              <table>
                <thead><tr>
                  <th>Return No.</th><th>Date</th><th>Supplier</th><th>Related Batch</th>
                  <th>Reason</th><th>Status</th><th>Return Amount</th><th>Actions</th>
                </tr></thead>
                <tbody>
                  {returns.length === 0 ? (
                    <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--text-light)', padding: 24 }}>{loading ? 'Loading…' : 'No bale returns found.'}</td></tr>
                  ) : returns.map((row) => {
                    const sc = retStatusColor(row.status)
                    return (
                      <tr key={row.id}>
                        <td style={{ fontWeight: 700 }}>{row.return_number}</td>
                        <td>{fmtDate(row.return_date)}</td>
                        <td>{row.supplier_name || '-'}</td>
                        <td>{row.bale_batch_no || '-'}</td>
                        <td style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.reason || '-'}</td>
                        <td>
                          <span style={{ background: sc.bg, color: sc.color, padding: '2px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600 }}>
                            {row.status}
                          </span>
                        </td>
                        <td style={{ fontWeight: 700 }}>{fmtCurrency(row.return_amount)}</td>
                        <td>
                          <div className="table-actions">
                            {canManage && <button className="btn btn-outline btn-sm" onClick={() => startEditReturn(row)}>Edit</button>}
                            {canManage && <button className="btn btn-danger btn-sm" onClick={() => deleteReturn(row)}>Delete</button>}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
