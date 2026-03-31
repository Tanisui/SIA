import React, { useEffect, useState, useCallback } from 'react'
import api from '../api/api.js'

// ─── Helpers ───
const fmt = (n) => Number(n || 0).toLocaleString('en-PH', { style: 'currency', currency: 'PHP' })
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''

function parseReferenceMeta(rawValue) {
  const value = String(rawValue || '').trim()
  if (!value) return null
  const normalized = value.replace(/^([A-Z_]+):/, '$1|')
  const parts = normalized.split('|').filter(Boolean)
  if (!parts.length) return null
  const tag = parts[0]
  const meta = {}
  for (const part of parts.slice(1)) {
    const idx = part.indexOf('=')
    if (idx <= 0) continue
    const key = part.slice(0, idx)
    const val = part.slice(idx + 1)
    if (key) meta[key] = val
  }
  return { tag, meta }
}

const STOCK_OUT_REASON_LABELS = {
  DAMAGE: 'Damage',
  SHRINKAGE: 'Shrinkage'
}

function toTitleCaseWords(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function getStockOutTypeLabel(value) {
  const normalized = String(value || '').trim().toUpperCase()
  if (!normalized) return ''
  return STOCK_OUT_REASON_LABELS[normalized] || toTitleCaseWords(normalized)
}

function parseStockOutReason(value) {
  const match = String(value || '').trim().match(/^STOCK_OUT:([A-Z_]+)(?:\s*\|\s*(.*))?$/i)
  if (!match) return null
  return { type: String(match[1] || '').toUpperCase(), detail: String(match[2] || '').trim() }
}

function formatStockOutReason(type, detail) {
  const label = getStockOutTypeLabel(type)
  if (!label) return String(detail || '').trim()

  const normalizedDetail = String(detail || '').trim()
  if (!normalizedDetail) return label
  if (normalizedDetail.toLowerCase() === label.toLowerCase()) return label
  if (normalizedDetail.toLowerCase().startsWith(`${label.toLowerCase()} - `)) return normalizedDetail
  return `${label} - ${normalizedDetail}`
}

function formatTransactionReference(value) {
  const parsed = parseReferenceMeta(value)
  if (!parsed) return value || '—'
  const { tag, meta } = parsed
  if (tag === 'SALE_LINK') {
    const sale = meta.sale_no || meta.sale_id || 'sale'
    return `Sale ${sale}${meta.receipt ? ` • Receipt ${meta.receipt}` : ''}`
  }
  if (tag === 'SALE_RETURN') {
    return `Sale return${meta.receipt ? ` • Receipt ${meta.receipt}` : ''}${meta.disposition ? ` • ${meta.disposition}` : ''}${meta.acct_ref ? ` • Acct Ref ${meta.acct_ref}` : ''}`
  }
  if (tag === 'STOCK_OUT') {
    return `Stock out${meta.disposition ? ` • ${meta.disposition}` : ''}${meta.receipt ? ` • Receipt ${meta.receipt}` : ''}${meta.acct_ref ? ` • Acct Ref ${meta.acct_ref}` : ''}`
  }
  return value
}

function formatTransactionReason(reason, reference = '') {
  const rawReason = String(reason || '').trim()
  if (!rawReason) return '—'
  if (/^SALE_LINK[:|]/.test(rawReason)) return 'POS sale deduction'

  const parsedRef = parseReferenceMeta(reference)
  if (parsedRef?.tag === 'SALE_LINK' && rawReason === 'POS sale deduction') return rawReason

  const parsedReason = parseStockOutReason(rawReason)
  if (parsedReason) return formatStockOutReason(parsedReason.type, parsedReason.detail)

  if (parsedRef?.tag === 'STOCK_OUT' && parsedRef.meta?.disposition) {
    if (/^stock\s*out\b/i.test(rawReason)) return rawReason
    return formatStockOutReason(parsedRef.meta.disposition, rawReason)
  }

  return rawReason
}

function formatGroupedTransactionReasons(value) {
  const rawValue = String(value || '').trim()
  if (!rawValue) return '—'

  const grouped = rawValue
    .split(/\s+\|\s+(?=(?:STOCK_OUT:[A-Z_]+|SALE_LINK[:|]))/g)
    .map((part) => part.trim())
    .filter(Boolean)

  if (grouped.length <= 1) return formatTransactionReason(rawValue)
  return grouped.map((part) => formatTransactionReason(part)).join(' | ')
}

const infoTip = (text) => React.createElement('span', {
  title: text,
  style: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 16,
    height: 16,
    marginLeft: 6,
    borderRadius: 999,
    border: '1px solid #cbd5e1',
    background: '#f8fafc',
    color: '#334155',
    fontSize: 10,
    fontWeight: 700,
    lineHeight: 1,
    cursor: 'help',
    userSelect: 'none'
  }
}, 'i')

export default function Inventory() {
  // ── state ──
  const [tab, setTab] = useState('overview')
  const [products, setProducts] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [employees, setEmployees] = useState([])
  const [categories, setCategories] = useState([])
  const [transactions, setTransactions] = useState([])
  const [damaged, setDamaged] = useState([])
  const [lowStock, setLowStock] = useState([])
  const [shrinkage, setShrinkage] = useState([])
  const [purchaseOrders, setPurchaseOrders] = useState([])
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)

  // forms
  const [stockInForm, setStockInForm] = useState({ product_id: '', quantity: '', reference: '', date: '' })
  const [adjustForm, setAdjustForm] = useState({ product_id: '', quantity: '', reason: '', employee_id: '' })
  const [damageForm, setDamageForm] = useState({ product_id: '', quantity: '', reason: '', employee_id: '' })
  const [returnForm, setReturnForm] = useState({ product_id: '', quantity: '', return_type: 'supplier', reason: '' })
  const [poForm, setPoForm] = useState({ supplier_id: '', expected_date: '', items: [{ product_id: '', quantity: '', unit_cost: '' }] })
  const [productForm, setProductForm] = useState({ sku: '', name: '', brand: '', description: '', category_id: '', price: '', cost: '', stock_quantity: '', low_stock_threshold: '10', size: '', color: '', barcode: '' })
  const [editingProduct, setEditingProduct] = useState(null)
  const [showProductModal, setShowProductModal] = useState(false)
  const [filterType, setFilterType] = useState('')
  const [categorySearch, setCategorySearch] = useState('')
  const [categoryDropdownOpen, setCategoryDropdownOpen] = useState(false)

  // ── data fetchers ──
  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const [prodRes, catRes, empRes] = await Promise.all([
        api.get('/products'),
        api.get('/categories'),
        api.get('/employees')
      ])
      setProducts(prodRes.data || [])
      setCategories(catRes.data || [])
      setEmployees(empRes.data || [])

      try {
        const supRes = await api.get('/suppliers')
        setSuppliers(supRes.data || [])
      } catch (e) { /* ignore suppliers fetch error */ }
    } catch (e) { /* ignore */ }
    setLoading(false)
  }, [])

  const fetchTransactions = useCallback(async () => {
    try {
      let url = '/inventory/transactions'
      if (filterType) url += `?type=${filterType}`
      const res = await api.get(url)
      setTransactions(res.data || [])
    } catch (e) { /* ignore */ }
  }, [filterType])

  const fetchLowStock = useCallback(async () => {
    try { const res = await api.get('/inventory/alerts/low-stock'); setLowStock(res.data || []) } catch (e) { /* ignore */ }
  }, [])

  const fetchDamaged = useCallback(async () => {
    try { const res = await api.get('/inventory/damaged'); setDamaged(res.data || []) } catch (e) { /* ignore */ }
  }, [])

  const fetchShrinkage = useCallback(async () => {
    try { const res = await api.get('/inventory/reports/shrinkage'); setShrinkage(res.data || []) } catch (e) { /* ignore */ }
  }, [])

  const fetchSummary = useCallback(async () => {
    try { const res = await api.get('/inventory/reports/summary'); setSummary(res.data) } catch (e) { /* ignore */ }
  }, [])

  const fetchPOs = useCallback(async () => {
    try { const res = await api.get('/purchase-orders'); setPurchaseOrders(res.data || []) } catch (e) { /* ignore */ }
  }, [])

  const fetchSuppliers = useCallback(async () => {
    try {
      const supRes = await api.get('/suppliers')
      setSuppliers(supRes.data || [])
    } catch (e) { /* ignore */ }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])
  useEffect(() => {
    if (tab === 'transactions') fetchTransactions()
    if (tab === 'damaged') fetchDamaged()
    if (tab === 'low-stock') fetchLowStock()
    if (tab === 'shrinkage') fetchShrinkage()
    if (tab === 'reports') fetchSummary()
    if (tab === 'purchase-orders') { fetchPOs(); fetchSuppliers() }
    if (tab === 'overview') { fetchSummary(); fetchLowStock() }
  }, [tab, fetchTransactions, fetchDamaged, fetchLowStock, fetchShrinkage, fetchSummary, fetchPOs, fetchSuppliers])

  const clearMessages = () => { setError(null); setSuccess(null) }
  const showMsg = (msg) => { setSuccess(msg); setTimeout(() => setSuccess(null), 4000) }

  // ── Stock In ──
  const handleStockIn = async (e) => {
    e.preventDefault(); clearMessages()
    
    // Validate against threshold
    const selectedProduct = products.find(p => p.id === Number(stockInForm.product_id))
    if (selectedProduct) {
      const newTotal = selectedProduct.stock_quantity + Number(stockInForm.quantity)
      const threshold = selectedProduct.low_stock_threshold || 10
      if (selectedProduct.stock_quantity > threshold) {
        setError(`Cannot add stock: ${selectedProduct.name} is already above low stock threshold (Current: ${selectedProduct.stock_quantity}, Threshold: ${threshold})`)
        return
      }
      if (newTotal > threshold * 10) {
        setError(`Warning: Adding ${stockInForm.quantity} items would bring total to ${newTotal}, which is ${Math.floor(newTotal/threshold)}x the threshold. Please verify this is correct.`)
        return
      }
    }
    
    try {
      await api.post('/inventory/stock-in', {
        product_id: Number(stockInForm.product_id),
        quantity: Number(stockInForm.quantity),
        reference: stockInForm.reference,
        date: stockInForm.date || undefined
      })
      setStockInForm({ product_id: '', quantity: '', reference: '', date: '' })
      showMsg('Stock in recorded successfully')
      fetchAll()
    } catch (err) { setError(err?.response?.data?.error || 'Stock in failed') }
  }

  // ── Receive PO ──
  const handleReceivePO = async (poId) => {
    clearMessages()
    if (!confirm('Receive this purchase order and add items to inventory?')) return
    try {
      await api.post('/inventory/stock-in/receive-po', { purchase_order_id: poId })
      showMsg('Purchase order received — stock updated')
      fetchPOs(); fetchAll()
    } catch (err) { setError(err?.response?.data?.error || 'Receive PO failed') }
  }

  // ── Adjustment ──
  const handleAdjust = async (e) => {
    e.preventDefault(); clearMessages()
    const productId = Number(adjustForm.product_id)
    const qtyToRemove = Number(adjustForm.quantity)
    const selectedProduct = products.find(p => Number(p.id) === productId)
    const availableStock = Number(selectedProduct?.stock_quantity) || 0

    if (!selectedProduct) return setError('Please select a valid product')
    if (!Number.isFinite(qtyToRemove) || qtyToRemove <= 0) return setError('Quantity must be greater than 0')
    if (availableStock <= 0) return setError(`No stock available for ${selectedProduct.name}`)
    if (qtyToRemove > availableStock) return setError(`Insufficient stock for ${selectedProduct.name}. Available: ${availableStock}`)

    try {
      await api.post('/inventory/stock-out/adjust', {
        product_id: productId,
        quantity: qtyToRemove,
        reason: adjustForm.reason,
        employee_id: adjustForm.employee_id ? Number(adjustForm.employee_id) : undefined
      })
      setAdjustForm({ product_id: '', quantity: '', reason: '', employee_id: '' })
      showMsg('Adjustment recorded')
      fetchAll()
    } catch (err) { setError(err?.response?.data?.error || 'Adjustment failed') }
  }

  // ── Damage ──
  const handleDamage = async (e) => {
    e.preventDefault(); clearMessages()
    const productId = Number(damageForm.product_id)
    const qtyToRemove = Number(damageForm.quantity)
    const selectedProduct = products.find(p => Number(p.id) === productId)
    const availableStock = Number(selectedProduct?.stock_quantity) || 0

    if (!selectedProduct) return setError('Please select a valid product')
    if (!Number.isFinite(qtyToRemove) || qtyToRemove <= 0) return setError('Quantity must be greater than 0')
    if (availableStock <= 0) return setError(`No stock available for ${selectedProduct.name}`)
    if (qtyToRemove > availableStock) return setError(`Insufficient stock for ${selectedProduct.name}. Available: ${availableStock}`)

    try {
      await api.post('/inventory/stock-out/damage', {
        product_id: productId,
        quantity: qtyToRemove,
        reason: damageForm.reason,
        employee_id: damageForm.employee_id ? Number(damageForm.employee_id) : undefined
      })
      setDamageForm({ product_id: '', quantity: '', reason: '', employee_id: '' })
      showMsg('Damage recorded')
      fetchAll()
    } catch (err) { setError(err?.response?.data?.error || 'Damage record failed') }
  }

  // ── Return ──
  const handleReturn = async (e) => {
    e.preventDefault(); clearMessages()
    try {
      await api.post('/inventory/returns', {
        product_id: Number(returnForm.product_id),
        quantity: Number(returnForm.quantity),
        return_type: 'supplier',
        reason: returnForm.reason
      })
      setReturnForm({ product_id: '', quantity: '', return_type: 'supplier', reason: '' })
      showMsg('Return processed')
      fetchAll()
    } catch (err) { setError(err?.response?.data?.error || 'Return failed') }
  }

  // ── Create PO ──
  const handleCreatePO = async (e) => {
    e.preventDefault(); clearMessages()
    try {
      const items = poForm.items.filter(i => i.product_id && i.quantity).map(i => ({
        product_id: Number(i.product_id), quantity: Number(i.quantity), unit_cost: Number(i.unit_cost) || 0
      }))
      await api.post('/purchase-orders', {
        supplier_id: Number(poForm.supplier_id),
        expected_date: poForm.expected_date || undefined,
        items
      })
      setPoForm({ supplier_id: '', expected_date: '', items: [{ product_id: '', quantity: '', unit_cost: '' }] })
      showMsg('Purchase order created')
      fetchPOs()
    } catch (err) { setError(err?.response?.data?.error || 'Create PO failed') }
  }

  const addPoItem = () => {
    setPoForm(prev => ({ ...prev, items: [...prev.items, { product_id: '', quantity: '', unit_cost: '' }] }))
  }

 const updatePoItem = (idx, field, val) => {
  setPoForm(prev => {
    const items = [...prev.items]
    items[idx] = { ...items[idx], [field]: val }
    
    // Auto-fill unit cost when product is selected
    if (field === 'product_id' && val) {
      const selectedProduct = products.find(p => p.id === Number(val))
      if (selectedProduct && selectedProduct.cost) {
        items[idx].unit_cost = selectedProduct.cost
      }
    }
    
    return { ...prev, items }
  })
}

  const removePoItem = (idx) => {
    setPoForm(prev => ({ ...prev, items: prev.items.filter((_, i) => i !== idx) }))
  }

  // ── Cancel PO ──
  const handleCancelPO = async (id) => {
    clearMessages()
    if (!confirm('Cancel this purchase order?')) return
    try {
      await api.post(`/purchase-orders/${id}/cancel`)
      showMsg('Purchase order cancelled')
      fetchPOs()
    } catch (err) { setError(err?.response?.data?.error || 'Cancel PO failed') }
  }

  // ── Product CRUD ──
  const handleSaveProduct = async (e) => {
    e.preventDefault(); clearMessages()
    try {
      const payload = { ...productForm }
      payload.sku = String(payload.sku || '').trim()
      payload.barcode = String(payload.barcode || '').trim()
      if (payload.price) payload.price = Number(payload.price)
      if (payload.cost) payload.cost = Number(payload.cost)
      if (payload.stock_quantity) payload.stock_quantity = Number(payload.stock_quantity)
      if (payload.low_stock_threshold) payload.low_stock_threshold = Number(payload.low_stock_threshold)
      if (payload.category_id) payload.category_id = Number(payload.category_id)
      if (!payload.sku) delete payload.sku
      if (!payload.barcode && !editingProduct) delete payload.barcode

      if (editingProduct) {
        await api.put(`/products/${editingProduct}`, payload)
        showMsg('Product updated')
      } else {
        await api.post('/products', payload)
        showMsg('Product created')
      }
      setProductForm({ sku: '', name: '', brand: '', description: '', category_id: '', price: '', cost: '', stock_quantity: '', low_stock_threshold: '10', size: '', color: '', barcode: '' })
      setCategorySearch('')
      setEditingProduct(null)
      setShowProductModal(false)
      fetchAll()
    } catch (err) { setError(err?.response?.data?.error || 'Save product failed') }
  }

  const startEditProduct = (p) => {
    setEditingProduct(p.id)
    setProductForm({
      sku: p.sku || '', name: p.name || '', brand: p.brand || '', description: p.description || '',
      category_id: p.category_id || '', price: p.price || '', cost: p.cost || '',
      stock_quantity: p.stock_quantity || '', low_stock_threshold: p.low_stock_threshold || '10',
      size: p.size || '', color: p.color || '', barcode: p.barcode || ''
    })
    setCategorySearch(p.category || '')
    setShowProductModal(true)
  }

  const deleteProduct = async (id) => {
    if (!confirm('Delete this product?')) return
    clearMessages()
    try {
      await api.delete(`/products/${id}`)
      showMsg('Product deleted')
      fetchAll()
    } catch (err) { setError(err?.response?.data?.error || 'Delete failed') }
  }

  // ── Select helper ──
  const productOptions = products.map(p =>
    React.createElement('option', { key: p.id, value: p.id }, `${p.sku ? p.sku + ' — ' : ''}${p.name} (Stock: ${p.stock_quantity})`)
  )
  const supplierOptions = suppliers.map(s =>
    React.createElement('option', { key: s.id, value: s.id }, s.name)
  )
  const employeeOptions = employees.map(e =>
    React.createElement('option', { key: e.id, value: e.id }, e.name)
  )

  // ── Tabs ──
  const tabs = [
    { key: 'overview', label: 'Overview' },
    { key: 'stock-in', label: 'Stock In' },
    { key: 'stock-out', label: 'Stock Out' },
    { key: 'returns', label: 'Supplier Returns' },
    { key: 'purchase-orders', label: 'Purchase Orders' },
    { key: 'products', label: 'Products' },
    { key: 'transactions', label: 'Transactions' },
    { key: 'damaged', label: 'Damaged' },
    { key: 'low-stock', label: 'Low Stock Alerts' },
    { key: 'shrinkage', label: 'Shrinkage' },
    { key: 'reports', label: 'Reports' }
  ]

  return React.createElement('div', { className: 'page' },
    React.createElement('div', { className: 'page-header' },
      React.createElement('div', null,
        React.createElement('h1', { className: 'page-title' }, 'Inventory Management'),
        React.createElement('p', { className: 'page-subtitle' }, 'Track stock-in, stock-out, supplier returns, damages, and purchase orders. Use Purchase Orders for replenishment.')
      )
    ),

    // Messages
    error && React.createElement('div', { className: 'error-msg', style: { marginBottom: 16 } }, error),
    success && React.createElement('div', { style: { background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#15803d', padding: '10px 14px', borderRadius: 6, marginBottom: 16, fontSize: '13.5px' } }, success),

    // Tab bar
    React.createElement('div', { className: 'inv-tabs', style: { display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 20, borderBottom: '2px solid var(--border)', paddingBottom: 0 } },
      tabs.map(t => React.createElement('button', {
        key: t.key,
        onClick: () => { setTab(t.key); clearMessages() },
        className: `inv-tab ${tab === t.key ? 'inv-tab-active' : ''}`,
        style: {
          padding: '10px 18px', border: 'none', borderBottom: tab === t.key ? '2px solid var(--gold)' : '2px solid transparent',
          background: 'transparent', color: tab === t.key ? 'var(--gold-dark)' : 'var(--text-mid)',
          fontWeight: tab === t.key ? 600 : 400, cursor: 'pointer', fontSize: '13.5px', marginBottom: -2,
          transition: 'all 0.15s'
        }
      }, t.label))
    ),

    loading && React.createElement('div', null, 'Loading...'),

    // ═══════════════ OVERVIEW ═══════════════
    tab === 'overview' && React.createElement('div', null,
      summary && React.createElement('div', { className: 'dashboard-grid' },
        React.createElement('div', { className: 'card' },
          React.createElement('div', { className: 'card-title' }, 'Total Products'),
          React.createElement('div', { className: 'card-value' }, summary.products?.length || 0)
        ),
        React.createElement('div', { className: 'card' },
          React.createElement('div', { className: 'card-title' }, 'Total Items in Stock'),
          React.createElement('div', { className: 'card-value' }, (summary.totalItems || 0).toLocaleString())
        ),
        React.createElement('div', { className: 'card' },
          React.createElement('div', { className: 'card-title' }, 'Stock Value'),
          React.createElement('div', { className: 'card-value-sm' }, fmt(summary.totalValue))
        ),
        React.createElement('div', { className: 'card' },
          React.createElement('div', { className: 'card-title' }, 'Low Stock Items'),
          React.createElement('div', { className: 'card-value', style: { color: summary.lowStockCount > 0 ? 'var(--error)' : 'var(--success)' } }, summary.lowStockCount || 0)
        )
      ),
      lowStock.length > 0 && React.createElement('div', { className: 'card', style: { marginTop: 20 } },
        React.createElement('h3', { style: { marginBottom: 12 } }, 'Low Stock Alerts'),
        React.createElement('div', { className: 'table-wrap' },
          React.createElement('table', null,
            React.createElement('thead', null,
              React.createElement('tr', null,
                React.createElement('th', null, 'SKU'),
                React.createElement('th', null, 'Product'),
                React.createElement('th', null, 'Stock'),
                React.createElement('th', null, 'Threshold')
              )
            ),
            React.createElement('tbody', null,
              lowStock.map(p => React.createElement('tr', { key: p.id },
                React.createElement('td', null, p.sku || '—'),
                React.createElement('td', null, p.name),
                React.createElement('td', { style: { color: 'var(--error)', fontWeight: 600 } }, p.stock_quantity),
                React.createElement('td', null, p.low_stock_threshold)
              ))
            )
          )
        )
      )
    ),

    // ═══════════════ STOCK IN ═══════════════
    tab === 'stock-in' && React.createElement('div', null,
      React.createElement('div', { className: 'card' },
        React.createElement('h3', { style: { marginBottom: 16 } }, 'Direct Purchase — Stock In'),
        React.createElement('form', { onSubmit: handleStockIn },
          React.createElement('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 } },
            React.createElement('div', { className: 'form-group' },
              React.createElement('label', { className: 'form-label' }, 'Product *'),
              React.createElement('select', { className: 'form-input', value: stockInForm.product_id, onChange: e => setStockInForm(f => ({ ...f, product_id: e.target.value })), required: true },
                React.createElement('option', { value: '' }, '— Select product —'),
                ...productOptions
              )
            ),
            React.createElement('div', { className: 'form-group' },
              React.createElement('label', { className: 'form-label' }, 'Quantity *'),
              React.createElement('input', { className: 'form-input', type: 'number', min: 1, value: stockInForm.quantity, onChange: e => setStockInForm(f => ({ ...f, quantity: e.target.value })), required: true })
            ),
            React.createElement('div', { className: 'form-group' },
              React.createElement('label', { className: 'form-label' }, 'Reference'),
              React.createElement('input', { className: 'form-input', value: stockInForm.reference, onChange: e => setStockInForm(f => ({ ...f, reference: e.target.value })), placeholder: 'Optional note / receipt no.' })
            ),
            React.createElement('div', { className: 'form-group' },
              React.createElement('label', { className: 'form-label' }, 'Date'),
              React.createElement('input', { className: 'form-input', type: 'date', value: stockInForm.date, onChange: e => setStockInForm(f => ({ ...f, date: e.target.value })) })
            )
          ),
          React.createElement('p', { style: { marginTop: 6, fontSize: 12, color: 'var(--text-light)' } },
            'Direct Stock-In is an emergency/manual fallback. For normal replenishment, use Purchase Orders so supplier, expected date, and unit cost are tracked before receiving.'
          ),
          React.createElement('button', { type: 'submit', className: 'btn btn-primary', style: { marginTop: 12 } }, 'Record Stock In')
        )
      )
    ),

    // ═══════════════ STOCK OUT ═══════════════
    tab === 'stock-out' && React.createElement('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 } },
      React.createElement('div', { className: 'card' },
        React.createElement('h3', { style: { marginBottom: 16 } }, 'Net Adjustment (Shrinkage/Lost)'),
        React.createElement('form', { onSubmit: handleAdjust },
          React.createElement('div', { className: 'form-group' },
            React.createElement('label', { className: 'form-label' }, 'Product *'),
            React.createElement('select', { className: 'form-input', value: adjustForm.product_id, onChange: e => setAdjustForm(f => ({ ...f, product_id: e.target.value })), required: true },
              React.createElement('option', { value: '' }, '— Select product —'),
              ...productOptions
            )
          ),
          React.createElement('div', { className: 'form-group' },
            React.createElement('label', { className: 'form-label' }, 'Quantity to Remove *'),
            React.createElement('input', { className: 'form-input', type: 'number', min: 1, value: adjustForm.quantity, onChange: e => setAdjustForm(f => ({ ...f, quantity: e.target.value })), required: true })
          ),
          React.createElement('div', { className: 'form-group' },
            React.createElement('label', { className: 'form-label' }, 'Reason'),
            React.createElement('input', { className: 'form-input', value: adjustForm.reason, onChange: e => setAdjustForm(f => ({ ...f, reason: e.target.value })), placeholder: 'Lost, shrinkage, manual correction...' })
          ),
          React.createElement('div', { className: 'form-group' },
            React.createElement('label', { className: 'form-label' }, 'Employee Responsible'),
            React.createElement('select', { className: 'form-input', value: adjustForm.employee_id, onChange: e => setAdjustForm(f => ({ ...f, employee_id: e.target.value })) },
              React.createElement('option', { value: '' }, '— Select employee —'),
              ...employeeOptions
            )
          ),
          React.createElement('button', { type: 'submit', className: 'btn btn-primary' }, 'Record Adjustment')
        )
      ),
      React.createElement('div', { className: 'card' },
        React.createElement('h3', { style: { marginBottom: 16 } }, 'Record Damage'),
        React.createElement('form', { onSubmit: handleDamage },
          React.createElement('div', { className: 'form-group' },
            React.createElement('label', { className: 'form-label' }, 'Product *'),
            React.createElement('select', { className: 'form-input', value: damageForm.product_id, onChange: e => setDamageForm(f => ({ ...f, product_id: e.target.value })), required: true },
              React.createElement('option', { value: '' }, '— Select product —'),
              ...productOptions
            )
          ),
          React.createElement('div', { className: 'form-group' },
            React.createElement('label', { className: 'form-label' }, 'Quantity *'),
            React.createElement('input', { className: 'form-input', type: 'number', min: 1, value: damageForm.quantity, onChange: e => setDamageForm(f => ({ ...f, quantity: e.target.value })), required: true })
          ),
          React.createElement('div', { className: 'form-group' },
            React.createElement('label', { className: 'form-label' }, 'Reason'),
            React.createElement('input', { className: 'form-input', value: damageForm.reason, onChange: e => setDamageForm(f => ({ ...f, reason: e.target.value })), placeholder: 'Defective, broken, unsellable...' })
          ),
          React.createElement('div', { className: 'form-group' },
            React.createElement('label', { className: 'form-label' }, 'Employee Responsible'),
            React.createElement('select', { className: 'form-input', value: damageForm.employee_id, onChange: e => setDamageForm(f => ({ ...f, employee_id: e.target.value })) },
              React.createElement('option', { value: '' }, '— Select employee —'),
              ...employeeOptions
            )
          ),
          React.createElement('button', { type: 'submit', className: 'btn btn-danger' }, 'Record Damage')
        )
      )
    ),

    // ═══════════════ RETURNS ═══════════════
    tab === 'returns' && React.createElement('div', null,
      React.createElement('div', { className: 'card' },
        React.createElement('h3', { style: { marginBottom: 16 } }, 'Supplier Return (Inventory Out Only)'),
        React.createElement('form', { onSubmit: handleReturn },
          React.createElement('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 } },
            React.createElement('div', { className: 'form-group' },
              React.createElement('label', { className: 'form-label' }, 'Product *'),
              React.createElement('select', { className: 'form-input', value: returnForm.product_id, onChange: e => setReturnForm(f => ({ ...f, product_id: e.target.value })), required: true },
                React.createElement('option', { value: '' }, '— Select product —'),
                ...productOptions
              )
            ),
            React.createElement('div', { className: 'form-group' },
              React.createElement('label', { className: 'form-label' }, 'Quantity *'),
              React.createElement('input', { className: 'form-input', type: 'number', min: 1, value: returnForm.quantity, onChange: e => setReturnForm(f => ({ ...f, quantity: e.target.value })), required: true })
            ),
            React.createElement('div', { className: 'form-group' },
              React.createElement('label', { className: 'form-label' }, 'Reason'),
              React.createElement('input', { className: 'form-input', value: returnForm.reason, onChange: e => setReturnForm(f => ({ ...f, reason: e.target.value })), placeholder: 'Reason for return...' })
            )
          ),
          React.createElement('p', { style: { marginTop: 6, marginBottom: 10, fontSize: 12, color: 'var(--text-light)' } },
            'This tab is for supplier returns only and will reduce stock. Customer returns must be processed in Sales > Returns using receipt lookup and return handling.'
          ),
          React.createElement('button', { type: 'submit', className: 'btn btn-primary', style: { marginTop: 12 } }, 'Process Return')
        )
      )
    ),

    // ═══════════════ PURCHASE ORDERS ═══════════════
    tab === 'purchase-orders' && React.createElement('div', null,
      React.createElement('div', { className: 'card', style: { marginBottom: 20 } },
        React.createElement('h3', { style: { marginBottom: 16 } }, 'Create New Purchase Order'),
        React.createElement('p', { style: { marginTop: -4, marginBottom: 12, fontSize: 12, color: 'var(--text-light)' } },
          'Recommended for replenishment: creating a PO does not increase stock yet. Stock is added only after clicking Receive on an OPEN PO.'
        ),
        React.createElement('button', { type: 'button', className: 'btn btn-secondary', style: { marginBottom: 12 }, onClick: fetchSuppliers }, 'Refresh Supplier List'),
        React.createElement('form', { onSubmit: handleCreatePO },
          React.createElement('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 } },
            React.createElement('div', { className: 'form-group' },
              React.createElement('label', { className: 'form-label' }, 'Supplier *'),
              React.createElement('select', { className: 'form-input', value: poForm.supplier_id, onChange: e => setPoForm(f => ({ ...f, supplier_id: e.target.value })), required: true },
                React.createElement('option', { value: '' }, '— Select supplier —'),
                ...supplierOptions
              )
            ),
            React.createElement('div', { className: 'form-group' },
              React.createElement('label', { className: 'form-label' }, 'Expected Delivery Date'),
React.createElement('input', { className: 'form-input', type: 'date', value: poForm.expected_date, onChange: e => setPoForm(f => ({ ...f, expected_date: e.target.value })), required: true })            )
          ),
          React.createElement('h4', { style: { marginTop: 12, marginBottom: 8, fontSize: 14 } }, 'Items'),
          poForm.items.map((item, idx) =>
            React.createElement('div', { key: idx, style: { display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: 8, marginBottom: 8 } },
              React.createElement('select', { className: 'form-input', value: item.product_id, onChange: e => updatePoItem(idx, 'product_id', e.target.value) },
                React.createElement('option', { value: '' }, '— Product —'),
                ...productOptions
              ),
              React.createElement('input', { className: 'form-input', type: 'number', min: 1, placeholder: 'Qty', value: item.quantity, onChange: e => updatePoItem(idx, 'quantity', e.target.value) }),
              React.createElement('input', { className: 'form-input', type: 'number', step: '0.01', placeholder: 'Unit cost', value: item.unit_cost, onChange: e => updatePoItem(idx, 'unit_cost', e.target.value) }),
              React.createElement('button', { type: 'button', className: 'btn btn-danger', onClick: () => removePoItem(idx), style: { padding: '8px 12px' } }, '✕')
            )
          ),
          React.createElement('button', { type: 'button', className: 'btn btn-secondary', onClick: addPoItem, style: { marginBottom: 12 } }, '+ Add Item'),
          React.createElement('br'),
          React.createElement('button', { type: 'submit', className: 'btn btn-primary' }, 'Create Purchase Order')
        )
      ),
      React.createElement('div', { className: 'card' },
        React.createElement('h3', { style: { marginBottom: 12 } }, 'Purchase Orders'),
        React.createElement('div', { className: 'table-wrap' },
          React.createElement('table', null,
            React.createElement('thead', null,
              React.createElement('tr', null,
                React.createElement('th', null, 'PO #'),
                React.createElement('th', null, 'Supplier'),
                React.createElement('th', null, 'Status'),
                React.createElement('th', null, 'Expected'),
                React.createElement('th', null, 'Total'),
                React.createElement('th', null, 'Items'),
                React.createElement('th', null, 'Actions')
              )
            ),
            React.createElement('tbody', null,
              purchaseOrders.map(po => React.createElement('tr', { key: po.id },
                React.createElement('td', { style: { fontWeight: 500 } }, po.po_number),
                React.createElement('td', null, po.supplier_name || '—'),
                React.createElement('td', null,
                  React.createElement('span', { className: `badge ${po.status === 'RECEIVED' ? 'badge-success' : po.status === 'CANCELLED' ? 'badge-danger' : 'badge-warning'}` }, po.status)
                ),
                React.createElement('td', null, po.expected_date ? new Date(po.expected_date).toLocaleDateString() : '—'),
                React.createElement('td', null, fmt(po.total)),
                React.createElement('td', null, po.items?.map(i => `${i.product_name || 'Product'} x${i.quantity}`).join(', ')),
                React.createElement('td', null,
                  po.status === 'OPEN' && React.createElement(React.Fragment, null,
                    React.createElement('button', { className: 'btn btn-primary', style: { marginRight: 6, padding: '4px 10px', fontSize: 12 }, onClick: () => handleReceivePO(po.id) }, 'Receive'),
                    React.createElement('button', { className: 'btn btn-danger', style: { padding: '4px 10px', fontSize: 12 }, onClick: () => handleCancelPO(po.id) }, 'Cancel')
                  )
                )
              ))
            )
          )
        )
      )
    ),

    // ═══════════════ PRODUCTS ═══════════════
    tab === 'products' && React.createElement('div', null,
      React.createElement('div', { style: { marginBottom: 16 } },
        React.createElement('button', { className: 'btn btn-primary', onClick: () => { setEditingProduct(null); setProductForm({ sku: '', name: '', brand: '', description: '', category_id: '', price: '', cost: '', stock_quantity: '', low_stock_threshold: '10', size: '', color: '', barcode: '' }); setCategorySearch(''); setShowProductModal(true) } }, '+ Create Product')
      ),

      showProductModal && React.createElement('div', { className: 'card', style: { marginBottom: 20 } },
        React.createElement('h3', { style: { marginBottom: 12 } }, editingProduct ? 'Edit Product' : 'Create Product'),
        React.createElement('form', { onSubmit: handleSaveProduct },
          React.createElement('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 } },
            React.createElement('div', { className: 'form-group' },
              React.createElement('label', { className: 'form-label' }, 'SKU', infoTip('Auto-generated unless you change it')),
              React.createElement('input', { className: 'form-input', value: productForm.sku, onChange: e => setProductForm(f => ({ ...f, sku: e.target.value })), placeholder: 'Auto-generated if left blank' })
            ),
            React.createElement('div', { className: 'form-group' },
              React.createElement('label', { className: 'form-label' }, 'Name *'),
              React.createElement('input', { className: 'form-input', value: productForm.name, onChange: e => setProductForm(f => ({ ...f, name: e.target.value })), required: true })
            ),
            React.createElement('div', { className: 'form-group' },
              React.createElement('label', { className: 'form-label' }, 'Barcode', infoTip('Auto-generated unless you change it')),
              React.createElement('input', { className: 'form-input', value: productForm.barcode, onChange: e => setProductForm(f => ({ ...f, barcode: e.target.value })), placeholder: 'Scan, enter, or leave blank to auto-generate' })
            ),
            React.createElement('div', { className: 'form-group', style: { position: 'relative' } },
              React.createElement('label', { className: 'form-label' }, 'Category'),
              React.createElement('input', {
                className: 'form-input',
                value: categorySearch,
                onChange: e => { setCategorySearch(e.target.value); setCategoryDropdownOpen(true); if (!e.target.value) setProductForm(f => ({ ...f, category_id: '' })) },
                onFocus: () => setCategoryDropdownOpen(true),
                placeholder: '— Search or select category —',
                autoComplete: 'off'
              }),
              categoryDropdownOpen && React.createElement('div', {
                style: {
                  position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
                  background: 'var(--card-bg, #fff)', border: '1px solid var(--border, #ddd)',
                  borderRadius: 6, maxHeight: 200, overflowY: 'auto', boxShadow: '0 4px 12px rgba(0,0,0,0.12)'
                }
              },
                categories
                  .filter(c => !categorySearch || c.name.toLowerCase().includes(categorySearch.toLowerCase()))
                  .length === 0
                  ? React.createElement('div', { style: { padding: '10px 14px', color: 'var(--text-light, #999)', fontSize: 13 } }, 'No categories found')
                  : categories
                      .filter(c => !categorySearch || c.name.toLowerCase().includes(categorySearch.toLowerCase()))
                      .map(c => React.createElement('div', {
                        key: c.id,
                        style: {
                          padding: '8px 14px', cursor: 'pointer', fontSize: 13,
                          background: String(productForm.category_id) === String(c.id) ? 'var(--gold-light, #fef3c7)' : 'transparent',
                          borderBottom: '1px solid var(--border-light, #f0f0f0)'
                        },
                        onMouseDown: (e) => { e.preventDefault(); setProductForm(f => ({ ...f, category_id: c.id })); setCategorySearch(c.name); setCategoryDropdownOpen(false) },
                        onMouseEnter: (e) => { e.currentTarget.style.background = 'var(--gold-light, #fef3c7)' },
                        onMouseLeave: (e) => { e.currentTarget.style.background = String(productForm.category_id) === String(c.id) ? 'var(--gold-light, #fef3c7)' : 'transparent' }
                      }, c.name))
              ),
              categoryDropdownOpen && React.createElement('div', {
                style: { position: 'fixed', inset: 0, zIndex: 49 },
                onClick: () => setCategoryDropdownOpen(false)
              })
            ),
            React.createElement('div', { className: 'form-group' },
              React.createElement('label', { className: 'form-label' }, 'Brand'),
              React.createElement('input', { className: 'form-input', value: productForm.brand, onChange: e => setProductForm(f => ({ ...f, brand: e.target.value })), placeholder: 'e.g. Nike, Zara...' })
            ),
            React.createElement('div', { className: 'form-group' },
              React.createElement('label', { className: 'form-label' }, 'Selling Price'),
              React.createElement('input', { className: 'form-input', type: 'number', step: '0.01', value: productForm.price, onChange: e => setProductForm(f => ({ ...f, price: e.target.value })) })
            ),
            React.createElement('div', { className: 'form-group' },
              React.createElement('label', { className: 'form-label' }, 'Cost Price'),
              React.createElement('input', { className: 'form-input', type: 'number', step: '0.01', value: productForm.cost, onChange: e => setProductForm(f => ({ ...f, cost: e.target.value })) })
            ),
            React.createElement('div', { className: 'form-group' },
              React.createElement('label', { className: 'form-label' }, 'Quantity'),
              React.createElement('input', { className: 'form-input', type: 'number', value: productForm.stock_quantity, onChange: e => setProductForm(f => ({ ...f, stock_quantity: e.target.value })) })
            ),
            React.createElement('div', { className: 'form-group' },
              React.createElement('label', { className: 'form-label' }, 'Low Stock Threshold'),
              React.createElement('input', { className: 'form-input', type: 'number', value: productForm.low_stock_threshold, onChange: e => setProductForm(f => ({ ...f, low_stock_threshold: e.target.value })) })
            ),
            React.createElement('div', { className: 'form-group' },
              React.createElement('label', { className: 'form-label' }, 'Size'),
              React.createElement('select', { className: 'form-input', value: productForm.size, onChange: e => setProductForm(f => ({ ...f, size: e.target.value })) },
                React.createElement('option', { value: '' }, '— Select size —'),
                React.createElement('option', { value: 'XXS' }, 'XXS'),
                React.createElement('option', { value: 'XS' }, 'XS'),
                React.createElement('option', { value: 'S' }, 'Small (S)'),
                React.createElement('option', { value: 'M' }, 'Medium (M)'),
                React.createElement('option', { value: 'L' }, 'Large (L)'),
                React.createElement('option', { value: 'XL' }, 'XL'),
                React.createElement('option', { value: 'XXL' }, 'XXL'),
                React.createElement('option', { value: '3XL' }, '3XL'),
                React.createElement('option', { value: 'Free Size' }, 'Free Size'),
                React.createElement('option', { value: '6' }, '6'),
                React.createElement('option', { value: '8' }, '8'),
                React.createElement('option', { value: '10' }, '10'),
                React.createElement('option', { value: '12' }, '12'),
                React.createElement('option', { value: '14' }, '14'),
                React.createElement('option', { value: '16' }, '16')
              )
            ),
            React.createElement('div', { className: 'form-group' },
              React.createElement('label', { className: 'form-label' }, 'Color'),
              React.createElement('input', { className: 'form-input', value: productForm.color, onChange: e => setProductForm(f => ({ ...f, color: e.target.value })) })
            )
          ),
          React.createElement('div', { className: 'form-group' },
            React.createElement('label', { className: 'form-label' }, 'Description'),
            React.createElement('textarea', { className: 'form-input', value: productForm.description, onChange: e => setProductForm(f => ({ ...f, description: e.target.value })), rows: 2 })
          ),
          React.createElement('div', { style: { display: 'flex', gap: 8 } },
            React.createElement('button', { type: 'submit', className: 'btn btn-primary' }, editingProduct ? 'Update Product' : 'Create Product'),
            React.createElement('button', { type: 'button', className: 'btn btn-secondary', onClick: () => { setShowProductModal(false); setCategorySearch('') } }, 'Cancel')
          )
        )
      ),

      React.createElement('div', { className: 'table-wrap' },
        React.createElement('table', null,
          React.createElement('thead', null,
            React.createElement('tr', null,
              React.createElement('th', null, 'SKU'),
              React.createElement('th', null, 'Barcode'),
              React.createElement('th', null, 'Name'),
              React.createElement('th', null, 'Brand'),
              React.createElement('th', null, 'Category'),
              React.createElement('th', null, 'Price'),
              React.createElement('th', null, 'Cost'),
              React.createElement('th', null, 'Stock'),
              React.createElement('th', null, 'Threshold'),
              React.createElement('th', null, 'Actions')
            )
          ),
          React.createElement('tbody', null,
            products.map(p => React.createElement('tr', { key: p.id },
              React.createElement('td', null, p.sku || '—'),
              React.createElement('td', null, p.barcode || '—'),
              React.createElement('td', { style: { fontWeight: 500 } }, p.name),
              React.createElement('td', null, p.brand || '—'),
              React.createElement('td', null, p.category || '—'),
              React.createElement('td', null, fmt(p.price)),
              React.createElement('td', null, fmt(p.cost)),
              React.createElement('td', { style: { fontWeight: 600, color: p.stock_quantity <= (p.low_stock_threshold || 10) ? 'var(--error)' : 'var(--success)' } }, p.stock_quantity),
              React.createElement('td', null, p.low_stock_threshold || 10),
              React.createElement('td', null,
                React.createElement('button', { className: 'btn btn-secondary', style: { padding: '4px 10px', fontSize: 12, marginRight: 4 }, onClick: () => startEditProduct(p) }, 'Edit'),
                React.createElement('button', { className: 'btn btn-danger', style: { padding: '4px 10px', fontSize: 12 }, onClick: () => deleteProduct(p.id) }, 'Delete')
              )
            ))
          )
        )
      )
    ),

    // ═══════════════ TRANSACTIONS ═══════════════
    tab === 'transactions' && React.createElement('div', { className: 'card' },
      React.createElement('div', { style: { marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12 } },
        React.createElement('h3', { style: { flex: 1, margin: 0 } }, 'Inventory Transactions'),
        React.createElement('select', { className: 'form-input', style: { width: 200 }, value: filterType, onChange: e => setFilterType(e.target.value) },
          React.createElement('option', { value: '' }, 'All types'),
          React.createElement('option', { value: 'IN' }, 'Stock In'),
          React.createElement('option', { value: 'OUT' }, 'Stock Out'),
          React.createElement('option', { value: 'ADJUST' }, 'Adjustments'),
          React.createElement('option', { value: 'RETURN' }, 'Returns')
        )
      ),
      React.createElement('div', { className: 'table-wrap' },
        React.createElement('table', null,
          React.createElement('thead', null,
            React.createElement('tr', null,
              React.createElement('th', null, 'Type'),
              React.createElement('th', null, 'Reference'),
              React.createElement('th', null, 'Date'),
              React.createElement('th', null, 'Quantity'),
              React.createElement('th', null, 'Details'),
              React.createElement('th', null, 'User')
            )
          ),
          React.createElement('tbody', null,
            transactions.length === 0
              ? React.createElement('tr', null,
                  React.createElement('td', { colSpan: 6, style: { textAlign: 'center', color: 'var(--text-light)', padding: 24 } }, 'No transactions found.')
                )
              : transactions.map((t) => {
              const legacySaleLinkInReason = !String(t.reference || '').trim() && /^SALE_LINK[:|]/.test(String(t.reason || '').trim())
              const resolvedReference = legacySaleLinkInReason ? t.reason : t.reference
              const resolvedReason = formatTransactionReason(t.reason, resolvedReference)
              const qtyColor = t.quantity > 0 ? 'var(--success)' : 'var(--error)'
              const qtyLabel = t.quantity > 0 ? `+${t.quantity}` : t.quantity

              return React.createElement('tr', { key: t.id },
                React.createElement('td', null,
                  React.createElement('span', { className: `badge ${t.transaction_type === 'IN' ? 'badge-success' : t.transaction_type === 'RETURN' ? 'badge-warning' : 'badge-danger'}` }, t.transaction_type)
                ),
                React.createElement('td', null,
                  React.createElement('div', { style: { fontWeight: 600 } }, formatTransactionReference(resolvedReference)),
                  React.createElement('div', { style: { fontSize: 11, color: 'var(--text-light)' } }, `${t.sku ? t.sku + ' — ' : ''}${t.product_name || ''}`)
                ),
                React.createElement('td', null, fmtDate(t.created_at)),
                React.createElement('td', { style: { fontWeight: 600, color: qtyColor } }, qtyLabel),
                React.createElement('td', null,
                  React.createElement('div', null, resolvedReason),
                  React.createElement('div', { style: { fontSize: 11, color: 'var(--text-light)' } }, `Balance after: ${t.balance_after}`)
                ),
                React.createElement('td', null, t.user_name || '—')
              )
            })
          )
        )
      )
    ),

    // ═══════════════ DAMAGED ═══════════════
    tab === 'damaged' && React.createElement('div', null,
      React.createElement('div', { className: 'table-wrap' },
        React.createElement('table', null,
          React.createElement('thead', null,
            React.createElement('tr', null,
              React.createElement('th', null, 'Date'),
              React.createElement('th', null, 'Product'),
              React.createElement('th', null, 'Qty'),
              React.createElement('th', null, 'Reason'),
              React.createElement('th', null, 'Reported By')
            )
          ),
          React.createElement('tbody', null,
            damaged.map(d => React.createElement('tr', { key: d.id },
              React.createElement('td', null, fmtDate(d.created_at)),
              React.createElement('td', null, `${d.sku ? d.sku + ' — ' : ''}${d.product_name || ''}`),
              React.createElement('td', { style: { fontWeight: 600, color: 'var(--error)' } }, d.quantity),
              React.createElement('td', null, formatTransactionReason(d.reason, d.reference)),
              React.createElement('td', null, d.reported_by_name || '—')
            ))
          )
        )
      )
    ),

    // ═══════════════ LOW STOCK ═══════════════
    tab === 'low-stock' && React.createElement('div', null,
      React.createElement('div', { className: 'table-wrap' },
        React.createElement('table', null,
          React.createElement('thead', null,
            React.createElement('tr', null,
              React.createElement('th', null, 'SKU'),
              React.createElement('th', null, 'Product'),
              React.createElement('th', null, 'Category'),
              React.createElement('th', null, 'Current Stock'),
              React.createElement('th', null, 'Threshold')
            )
          ),
          React.createElement('tbody', null,
            lowStock.length === 0
              ? React.createElement('tr', null, React.createElement('td', { colSpan: 5, style: { textAlign: 'center', color: 'var(--text-light)', padding: 24 } }, 'No low stock items — all good!'))
              : lowStock.map(p => React.createElement('tr', { key: p.id },
                  React.createElement('td', null, p.sku || '—'),
                  React.createElement('td', null, p.name),
                  React.createElement('td', null, p.category || '—'),
                  React.createElement('td', { style: { fontWeight: 600, color: 'var(--error)' } }, p.stock_quantity),
                  React.createElement('td', null, p.low_stock_threshold)
                ))
          )
        )
      )
    ),

    // ═══════════════ SHRINKAGE ═══════════════
    tab === 'shrinkage' && React.createElement('div', null,
      React.createElement('h3', { style: { marginBottom: 12 } }, 'Shrinkage Report (Losses from Theft or Errors)'),
      React.createElement('div', { className: 'table-wrap' },
        React.createElement('table', null,
          React.createElement('thead', null,
            React.createElement('tr', null,
              React.createElement('th', null, 'SKU'),
              React.createElement('th', null, 'Product'),
              React.createElement('th', null, 'Total Shrinkage'),
              React.createElement('th', null, 'Incidents'),
              React.createElement('th', null, 'Reason')
            )
          ),
          React.createElement('tbody', null,
            shrinkage.length === 0
              ? React.createElement('tr', null, React.createElement('td', { colSpan: 5, style: { textAlign: 'center', color: 'var(--text-light)', padding: 24 } }, 'No shrinkage recorded'))
              : shrinkage.map(s => React.createElement('tr', { key: s.product_id },
                  React.createElement('td', null, s.sku || '—'),
                  React.createElement('td', null, s.product_name),
                  React.createElement('td', { style: { fontWeight: 600, color: 'var(--error)' } }, s.total_shrinkage),
                  React.createElement('td', null, s.incidents),
                  React.createElement('td', null, formatGroupedTransactionReasons(s.reasons))
                ))
          )
        )
      )
    ),

    // ═══════════════ REPORTS ═══════════════
    tab === 'reports' && summary && React.createElement('div', null,
      React.createElement('h3', { style: { marginBottom: 16 } }, 'Inventory Report & Analytics'),
      React.createElement('div', { className: 'dashboard-grid' },
        React.createElement('div', { className: 'card' },
          React.createElement('div', { className: 'card-title' }, 'Active Products'),
          React.createElement('div', { className: 'card-value' }, summary.products?.length || 0)
        ),
        React.createElement('div', { className: 'card' },
          React.createElement('div', { className: 'card-title' }, 'Total Items'),
          React.createElement('div', { className: 'card-value' }, (summary.totalItems || 0).toLocaleString())
        ),
        React.createElement('div', { className: 'card' },
          React.createElement('div', { className: 'card-title' }, 'Total Stock Value'),
          React.createElement('div', { className: 'card-value-sm' }, fmt(summary.totalValue))
        ),
        React.createElement('div', { className: 'card' },
          React.createElement('div', { className: 'card-title' }, 'Low Stock Count'),
          React.createElement('div', { className: 'card-value', style: { color: summary.lowStockCount > 0 ? 'var(--error)' : 'var(--success)' } }, summary.lowStockCount)
        )
      ),
      React.createElement('div', { className: 'table-wrap', style: { marginTop: 20 } },
        React.createElement('table', null,
          React.createElement('thead', null,
            React.createElement('tr', null,
              React.createElement('th', null, 'SKU'),
              React.createElement('th', null, 'Product'),
              React.createElement('th', null, 'Category'),
              React.createElement('th', null, 'Stock'),
              React.createElement('th', null, 'Cost'),
              React.createElement('th', null, 'Price'),
              React.createElement('th', null, 'Stock Value')
            )
          ),
          React.createElement('tbody', null,
            (summary.products || []).map(p => React.createElement('tr', { key: p.id },
              React.createElement('td', null, p.sku || '—'),
              React.createElement('td', null, p.name),
              React.createElement('td', null, p.category || '—'),
              React.createElement('td', { style: { fontWeight: 600, color: p.stock_quantity <= p.low_stock_threshold ? 'var(--error)' : 'var(--text-dark)' } }, p.stock_quantity),
              React.createElement('td', null, fmt(p.cost)),
              React.createElement('td', null, fmt(p.price)),
              React.createElement('td', { style: { fontWeight: 500 } }, fmt(p.stock_value))
            ))
          )
        )
      )
    )
  )
}
