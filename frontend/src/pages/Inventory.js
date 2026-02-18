import React, { useEffect, useState, useCallback } from 'react'
import api from '../api/api.js'

// ─── Helpers ───
const fmt = (n) => Number(n || 0).toLocaleString('en-PH', { style: 'currency', currency: 'PHP' })
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''

export default function Inventory() {
  // ── state ──
  const [tab, setTab] = useState('overview')
  const [products, setProducts] = useState([])
  const [suppliers, setSuppliers] = useState([])
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
  const [stockInForm, setStockInForm] = useState({ product_id: '', quantity: '', cost: '', reference: '', supplier_id: '', date: '' })
  const [adjustForm, setAdjustForm] = useState({ product_id: '', quantity: '', reason: '' })
  const [damageForm, setDamageForm] = useState({ product_id: '', quantity: '', reason: '' })
  const [returnForm, setReturnForm] = useState({ product_id: '', quantity: '', return_type: 'customer', reason: '', sale_id: '' })
  const [poForm, setPoForm] = useState({ supplier_id: '', expected_date: '', items: [{ product_id: '', quantity: '', unit_cost: '' }] })
  const [productForm, setProductForm] = useState({ sku: '', name: '', description: '', category_id: '', price: '', cost: '', stock_quantity: '', low_stock_threshold: '10', size: '', color: '', barcode: '' })
  const [editingProduct, setEditingProduct] = useState(null)
  const [showProductModal, setShowProductModal] = useState(false)
  const [filterType, setFilterType] = useState('')

  // ── data fetchers ──
  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const [prodRes, supRes] = await Promise.all([
        api.get('/products'),
        api.get('/suppliers')
      ])
      setProducts(prodRes.data || [])
      setSuppliers(supRes.data || [])
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

  useEffect(() => { fetchAll() }, [fetchAll])
  useEffect(() => {
    if (tab === 'transactions') fetchTransactions()
    if (tab === 'damaged') fetchDamaged()
    if (tab === 'low-stock') fetchLowStock()
    if (tab === 'shrinkage') fetchShrinkage()
    if (tab === 'reports') fetchSummary()
    if (tab === 'purchase-orders') fetchPOs()
    if (tab === 'overview') { fetchSummary(); fetchLowStock() }
  }, [tab, fetchTransactions, fetchDamaged, fetchLowStock, fetchShrinkage, fetchSummary, fetchPOs])

  const clearMessages = () => { setError(null); setSuccess(null) }
  const showMsg = (msg) => { setSuccess(msg); setTimeout(() => setSuccess(null), 4000) }

  // ── Stock In ──
  const handleStockIn = async (e) => {
    e.preventDefault(); clearMessages()
    try {
      await api.post('/inventory/stock-in', {
        product_id: Number(stockInForm.product_id),
        quantity: Number(stockInForm.quantity),
        cost: stockInForm.cost ? Number(stockInForm.cost) : undefined,
        reference: stockInForm.reference,
        supplier_id: stockInForm.supplier_id ? Number(stockInForm.supplier_id) : undefined,
        date: stockInForm.date || undefined
      })
      setStockInForm({ product_id: '', quantity: '', cost: '', reference: '', supplier_id: '', date: '' })
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
    try {
      await api.post('/inventory/stock-out/adjust', {
        product_id: Number(adjustForm.product_id),
        quantity: Number(adjustForm.quantity),
        reason: adjustForm.reason
      })
      setAdjustForm({ product_id: '', quantity: '', reason: '' })
      showMsg('Adjustment recorded')
      fetchAll()
    } catch (err) { setError(err?.response?.data?.error || 'Adjustment failed') }
  }

  // ── Damage ──
  const handleDamage = async (e) => {
    e.preventDefault(); clearMessages()
    try {
      await api.post('/inventory/stock-out/damage', {
        product_id: Number(damageForm.product_id),
        quantity: Number(damageForm.quantity),
        reason: damageForm.reason
      })
      setDamageForm({ product_id: '', quantity: '', reason: '' })
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
        return_type: returnForm.return_type,
        reason: returnForm.reason,
        sale_id: returnForm.sale_id ? Number(returnForm.sale_id) : undefined
      })
      setReturnForm({ product_id: '', quantity: '', return_type: 'customer', reason: '', sale_id: '' })
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
      if (payload.price) payload.price = Number(payload.price)
      if (payload.cost) payload.cost = Number(payload.cost)
      if (payload.stock_quantity) payload.stock_quantity = Number(payload.stock_quantity)
      if (payload.low_stock_threshold) payload.low_stock_threshold = Number(payload.low_stock_threshold)
      if (payload.category_id) payload.category_id = Number(payload.category_id)

      if (editingProduct) {
        await api.put(`/products/${editingProduct}`, payload)
        showMsg('Product updated')
      } else {
        await api.post('/products', payload)
        showMsg('Product created')
      }
      setProductForm({ sku: '', name: '', description: '', category_id: '', price: '', cost: '', stock_quantity: '', low_stock_threshold: '10', size: '', color: '', barcode: '' })
      setEditingProduct(null)
      setShowProductModal(false)
      fetchAll()
    } catch (err) { setError(err?.response?.data?.error || 'Save product failed') }
  }

  const startEditProduct = (p) => {
    setEditingProduct(p.id)
    setProductForm({
      sku: p.sku || '', name: p.name || '', description: p.description || '',
      category_id: p.category_id || '', price: p.price || '', cost: p.cost || '',
      stock_quantity: p.stock_quantity || '', low_stock_threshold: p.low_stock_threshold || '10',
      size: p.size || '', color: p.color || '', barcode: p.barcode || ''
    })
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

  // ── Tabs ──
  const tabs = [
    { key: 'overview', label: 'Overview' },
    { key: 'stock-in', label: 'Stock In' },
    { key: 'stock-out', label: 'Stock Out' },
    { key: 'returns', label: 'Returns' },
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
        React.createElement('p', { className: 'page-subtitle' }, 'Track stock-in, stock-out, returns, damages & purchase orders')
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
              React.createElement('label', { className: 'form-label' }, 'Unit Cost'),
              React.createElement('input', { className: 'form-input', type: 'number', step: '0.01', value: stockInForm.cost, onChange: e => setStockInForm(f => ({ ...f, cost: e.target.value })) })
            ),
            React.createElement('div', { className: 'form-group' },
              React.createElement('label', { className: 'form-label' }, 'OR/Invoice Reference'),
              React.createElement('input', { className: 'form-input', value: stockInForm.reference, onChange: e => setStockInForm(f => ({ ...f, reference: e.target.value })), placeholder: 'OR/Invoice #' })
            ),
            React.createElement('div', { className: 'form-group' },
              React.createElement('label', { className: 'form-label' }, 'Supplier'),
              React.createElement('select', { className: 'form-input', value: stockInForm.supplier_id, onChange: e => setStockInForm(f => ({ ...f, supplier_id: e.target.value })) },
                React.createElement('option', { value: '' }, '— None —'),
                ...supplierOptions
              )
            ),
            React.createElement('div', { className: 'form-group' },
              React.createElement('label', { className: 'form-label' }, 'Date'),
              React.createElement('input', { className: 'form-input', type: 'date', value: stockInForm.date, onChange: e => setStockInForm(f => ({ ...f, date: e.target.value })) })
            )
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
          React.createElement('button', { type: 'submit', className: 'btn btn-danger' }, 'Record Damage')
        )
      )
    ),

    // ═══════════════ RETURNS ═══════════════
    tab === 'returns' && React.createElement('div', null,
      React.createElement('div', { className: 'card' },
        React.createElement('h3', { style: { marginBottom: 16 } }, 'Process Return'),
        React.createElement('form', { onSubmit: handleReturn },
          React.createElement('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 } },
            React.createElement('div', { className: 'form-group' },
              React.createElement('label', { className: 'form-label' }, 'Return Type *'),
              React.createElement('select', { className: 'form-input', value: returnForm.return_type, onChange: e => setReturnForm(f => ({ ...f, return_type: e.target.value })) },
                React.createElement('option', { value: 'customer' }, 'Customer Return (adds stock back)'),
                React.createElement('option', { value: 'supplier' }, 'Supplier Return (removes stock)')
              )
            ),
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
            ),
            returnForm.return_type === 'customer' && React.createElement('div', { className: 'form-group' },
              React.createElement('label', { className: 'form-label' }, 'Sale ID (optional)'),
              React.createElement('input', { className: 'form-input', value: returnForm.sale_id, onChange: e => setReturnForm(f => ({ ...f, sale_id: e.target.value })), placeholder: 'Reference sale #' })
            )
          ),
          React.createElement('button', { type: 'submit', className: 'btn btn-primary', style: { marginTop: 12 } }, 'Process Return')
        )
      )
    ),

    // ═══════════════ PURCHASE ORDERS ═══════════════
    tab === 'purchase-orders' && React.createElement('div', null,
      React.createElement('div', { className: 'card', style: { marginBottom: 20 } },
        React.createElement('h3', { style: { marginBottom: 16 } }, 'Create New Purchase Order'),
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
              React.createElement('input', { className: 'form-input', type: 'date', value: poForm.expected_date, onChange: e => setPoForm(f => ({ ...f, expected_date: e.target.value })) })
            )
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
        React.createElement('button', { className: 'btn btn-primary', onClick: () => { setEditingProduct(null); setProductForm({ sku: '', name: '', description: '', category_id: '', price: '', cost: '', stock_quantity: '', low_stock_threshold: '10', size: '', color: '', barcode: '' }); setShowProductModal(true) } }, '+ Create Product')
      ),

      showProductModal && React.createElement('div', { className: 'card', style: { marginBottom: 20 } },
        React.createElement('h3', { style: { marginBottom: 12 } }, editingProduct ? 'Edit Product' : 'Create Product'),
        React.createElement('form', { onSubmit: handleSaveProduct },
          React.createElement('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 } },
            React.createElement('div', { className: 'form-group' },
              React.createElement('label', { className: 'form-label' }, 'SKU'),
              React.createElement('input', { className: 'form-input', value: productForm.sku, onChange: e => setProductForm(f => ({ ...f, sku: e.target.value })) })
            ),
            React.createElement('div', { className: 'form-group' },
              React.createElement('label', { className: 'form-label' }, 'Name *'),
              React.createElement('input', { className: 'form-input', value: productForm.name, onChange: e => setProductForm(f => ({ ...f, name: e.target.value })), required: true })
            ),
            React.createElement('div', { className: 'form-group' },
              React.createElement('label', { className: 'form-label' }, 'Barcode'),
              React.createElement('input', { className: 'form-input', value: productForm.barcode, onChange: e => setProductForm(f => ({ ...f, barcode: e.target.value })) })
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
              React.createElement('input', { className: 'form-input', value: productForm.size, onChange: e => setProductForm(f => ({ ...f, size: e.target.value })) })
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
            React.createElement('button', { type: 'button', className: 'btn btn-secondary', onClick: () => setShowProductModal(false) }, 'Cancel')
          )
        )
      ),

      React.createElement('div', { className: 'table-wrap' },
        React.createElement('table', null,
          React.createElement('thead', null,
            React.createElement('tr', null,
              React.createElement('th', null, 'SKU'),
              React.createElement('th', null, 'Name'),
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
              React.createElement('td', { style: { fontWeight: 500 } }, p.name),
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
    tab === 'transactions' && React.createElement('div', null,
      React.createElement('div', { style: { marginBottom: 12 } },
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
              React.createElement('th', null, 'Date'),
              React.createElement('th', null, 'Type'),
              React.createElement('th', null, 'Product'),
              React.createElement('th', null, 'Qty'),
              React.createElement('th', null, 'Balance After'),
              React.createElement('th', null, 'Reference'),
              React.createElement('th', null, 'Reason'),
              React.createElement('th', null, 'User')
            )
          ),
          React.createElement('tbody', null,
            transactions.map(t => React.createElement('tr', { key: t.id },
              React.createElement('td', null, fmtDate(t.created_at)),
              React.createElement('td', null,
                React.createElement('span', { className: `badge ${t.transaction_type === 'IN' ? 'badge-success' : t.transaction_type === 'RETURN' ? 'badge-warning' : 'badge-danger'}` }, t.transaction_type)
              ),
              React.createElement('td', null, `${t.sku ? t.sku + ' — ' : ''}${t.product_name || ''}`),
              React.createElement('td', { style: { fontWeight: 600, color: t.quantity > 0 ? 'var(--success)' : 'var(--error)' } }, t.quantity > 0 ? `+${t.quantity}` : t.quantity),
              React.createElement('td', null, t.balance_after),
              React.createElement('td', null, t.reference || '—'),
              React.createElement('td', null, t.reason || '—'),
              React.createElement('td', null, t.user_name || '—')
            ))
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
              React.createElement('td', null, d.reason || '—'),
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
              React.createElement('th', null, 'Incidents')
            )
          ),
          React.createElement('tbody', null,
            shrinkage.length === 0
              ? React.createElement('tr', null, React.createElement('td', { colSpan: 4, style: { textAlign: 'center', color: 'var(--text-light)', padding: 24 } }, 'No shrinkage recorded'))
              : shrinkage.map(s => React.createElement('tr', { key: s.product_id },
                  React.createElement('td', null, s.sku || '—'),
                  React.createElement('td', null, s.product_name),
                  React.createElement('td', { style: { fontWeight: 600, color: 'var(--error)' } }, s.total_shrinkage),
                  React.createElement('td', null, s.incidents)
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
