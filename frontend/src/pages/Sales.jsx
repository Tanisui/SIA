import React, { useEffect, useRef, useState } from 'react'
import { useSelector } from 'react-redux'
import api from '../api/api.js'

const fmt = (n) => Number(n || 0).toLocaleString('en-PH', { style: 'currency', currency: 'PHP' })
const fmtDate = (d) => d ? new Date(d).toLocaleString('en-PH', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'
const round = (n) => Math.round((Number(n) || 0) * 100) / 100
const num = (v, fallback = 0) => Number.isFinite(Number(v)) ? Number(v) : fallback
const pct = (v) => Math.min(Math.max(num(v), 0), 100)
const text = (value) => String(value || '').trim()
const normalizeText = (value) => text(value).toLowerCase()
const productLabel = (p) => `${p?.sku ? `${p.sku} - ` : ''}${p?.name || 'Unnamed product'}`
const extractScannedReceiptId = (rawValue) => {
  const raw = String(rawValue || '').trim()
  if (!raw) return ''
  const compact = raw.replace(/\r?\n/g, ' ').trim()
  const tokenMatch = compact.match(/\b(?:RCT|REC|RECEIPT)[-_: ]?[A-Z0-9-]{6,}\b/i)
  if (tokenMatch?.[0]) {
    return tokenMatch[0]
      .replace(/^RECEIPT[-_: ]?/i, 'RCT-')
      .replace(/^REC[-_: ]?/i, 'RCT-')
      .replace(/^RCT[-_: ]?/i, 'RCT-')
      .replace(/\s+/g, '')
      .toUpperCase()
  }
  const plainReceipt = compact.match(/\bRCT-[A-Z0-9-]+\b/i)
  if (plainReceipt?.[0]) return plainReceipt[0].toUpperCase()
  return compact
}
const DEFAULT_SALES_CONFIG = {
  payment_methods: ['cash', 'mobile_bank_transfer'],
  allow_discount: false,
  allow_price_override: false
}
const MOBILE_BANK_APPS = [
  'BDO Online', 'BPI Online', 'Landbank Mobile Banking', 'Metrobank App', 'RCBC Pulz',
  'Security Bank App', 'UnionBank Online', 'PNB Digital', 'Chinabank Start', 'Maya',
  'GoTyme', 'Tonik', 'Other Mobile Bank'
]

function can(perms, required) {
  if (!required) return true
  if (!Array.isArray(perms)) return false
  if (perms.includes('admin.*')) return true
  const list = Array.isArray(required) ? required : [required]
  return list.some((item) => perms.includes(item))
}

function StatCard({ label, value, style }) {
  return (
    <div className="card">
      <div className="card-title">{label}</div>
      <div className="card-value-sm" style={style}>{value}</div>
    </div>
  )
}

export default function Sales() {
  const permissions = useSelector((state) => state.auth?.permissions || JSON.parse(localStorage.getItem('permissions') || '[]'))
  const receiptRef = useRef(null)

  const [tab, setTab] = useState('pos')
  const [products, setProducts] = useState([])
  const [sales, setSales] = useState([])
  const [transactions, setTransactions] = useState([])
  const [report, setReport] = useState(null)
  const [config, setConfig] = useState(DEFAULT_SALES_CONFIG)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)
  const [loading, setLoading] = useState(false)
  const [cart, setCart] = useState([])
  const [search, setSearch] = useState('')
  const [selectedProduct, setSelectedProduct] = useState('')
  const [isProductPickerOpen, setIsProductPickerOpen] = useState(false)
  const [price, setPrice] = useState('')
  const [qty, setQty] = useState('1')
  const [orderNote, setOrderNote] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [discountPercentage, setDiscountPercentage] = useState('')
  const [pendingOrder, setPendingOrder] = useState(null)
  const [paymentAmount, setPaymentAmount] = useState('')
  const [bankAppUsed, setBankAppUsed] = useState('')
  const [referenceNumber, setReferenceNumber] = useState('')
  const [lastReceipt, setLastReceipt] = useState(null)
  const [viewSale, setViewSale] = useState(null)
  const [openSaleMenuId, setOpenSaleMenuId] = useState(null)
  const [transactionType, setTransactionType] = useState('')
  const [transactionReceipt, setTransactionReceipt] = useState('')
  const [reportFrom, setReportFrom] = useState('')
  const [reportTo, setReportTo] = useState('')
  const [returnReceiptNo, setReturnReceiptNo] = useState('')
  const [returnLookup, setReturnLookup] = useState(null)
  const [returnReason, setReturnReason] = useState('')
  const [returnDisposition, setReturnDisposition] = useState('RESTOCK')
  const [returnQuantities, setReturnQuantities] = useState({})

  const tabs = [
    ['pos', 'POS', 'sales.create'],
    ['payment', 'Accept Payment', 'sales.create'],
    ['history', 'Sales', 'sales.view'],
    ['transactions', 'Transactions', 'sales.view'],
    ['returns', 'Returns', 'sales.refund'],
    ['report', 'Sales Report', 'sales.view']
  ].filter(([, , perm]) => can(permissions, perm))

  const allowDiscount = Boolean(config.allow_discount)
  const allowPriceOverride = Boolean(config.allow_price_override)
  const filteredProducts = products.filter((product) => {
    const needle = normalizeText(search)
    if (!needle) return true
    return [
      productLabel(product),
      product?.name,
      product?.sku,
      product?.barcode
    ].some((value) => normalizeText(value).includes(needle))
  })
  const selectedProductData = products.find((item) => String(item.id) === String(selectedProduct)) || null
  const subtotal = round(cart.reduce((sum, item) => sum + num(item.unit_price) * num(item.quantity), 0))
  const discountPct = allowDiscount ? pct(discountPercentage) : 0
  const discountAmount = round(subtotal * (discountPct / 100))
  const total = round(Math.max(subtotal - discountAmount, 0))
  const tendered = num(paymentAmount)
  const requiresBankTransferFields = String(pendingOrder?.payment_method || '') === 'mobile_bank_transfer'
  const isAmountValid = pendingOrder ? (requiresBankTransferFields ? round(tendered) === round(num(pendingOrder.total)) : tendered >= num(pendingOrder.total)) : false
  const isBankAppValid = String(bankAppUsed || '').trim().length > 0
  const isReferenceValid = String(referenceNumber || '').trim().length > 0
  const canConfirmPayment = Boolean(pendingOrder) && isAmountValid && (!requiresBankTransferFields || (isBankAppValid && isReferenceValid)) && !loading
  const cartHasLockedPriceOverride = !allowPriceOverride && cart.some((item) => round(item.unit_price) !== round(item.catalog_unit_price ?? item.unit_price))

  useEffect(() => {
    if (!tabs.some(([key]) => key === tab) && tabs[0]) setTab(tabs[0][0])
  }, [tab, tabs])

  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        setLoading(true)
        const [configRes, productsRes] = await Promise.allSettled([
          api.get('/sales/config'),
          loadPosProducts()
        ])
        if (!active) return
        const issues = []
        if (configRes.status === 'fulfilled') setConfig({ ...DEFAULT_SALES_CONFIG, ...(configRes.value?.data || {}) })
        else issues.push('Sales settings could not be loaded.')
        if (productsRes.status === 'fulfilled') setProducts(Array.isArray(productsRes.value) ? productsRes.value : [])
        else issues.push('Products could not be loaded for POS.')
        if (issues.length) setError(issues.join(' '))
      } catch (err) {
        if (active) setError(err?.response?.data?.error || 'Failed to load sales data')
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (tab === 'history') fetchSales()
    if (tab === 'transactions') fetchTransactions()
    if (tab === 'report') fetchReport()
  }, [tab])

  useEffect(() => {
    setOpenSaleMenuId(null)
  }, [tab])

  useEffect(() => {
    if (config.allow_discount) return
    if (String(discountPercentage).trim()) setDiscountPercentage('')
  }, [config.allow_discount, discountPercentage])

  function clearMsg() { setError(null); setSuccess(null) }
  function flash(message) { setSuccess(message); setTimeout(() => setSuccess(null), 4000) }
  function stock(productId) { return num(products.find((item) => String(item.id) === String(productId))?.stock_quantity) }
  function cartQty(productId, skip = -1) { return cart.reduce((sum, item, index) => index === skip ? sum : (String(item.product_id) === String(productId) ? sum + num(item.quantity) : sum), 0) }

  function selectProductOption(product) {
    if (!product?.id) return
    setSelectedProduct(String(product.id))
    setSearch(productLabel(product))
    setPrice(String(product.price ?? ''))
    setIsProductPickerOpen(false)
  }

  function handleProductSearchChange(value) {
    setSearch(value)
    setIsProductPickerOpen(true)
    if (!selectedProductData) return
    if (normalizeText(value) === normalizeText(productLabel(selectedProductData))) return
    setSelectedProduct('')
    setPrice('')
  }

  function qtyError(nextQty, productId = selectedProduct, skip = -1) {
    const amount = num(nextQty)
    if (!productId) return 'Select a product first'
    if (amount <= 0) return 'Quantity must be greater than 0'
    const available = stock(productId)
    const already = cartQty(productId, skip)
    return already + amount > available ? `Insufficient stock. Only ${Math.max(available - already, 0)} left.` : ''
  }

  async function loadPosProducts() {
    try {
      const res = await api.get('/sales/products')
      return Array.isArray(res.data) ? res.data : []
    } catch {
      const res = await api.get('/products')
      return Array.isArray(res.data) ? res.data : []
    }
  }

  async function refreshProducts() { setProducts(await loadPosProducts()) }
  async function fetchSales() { try { setLoading(true); setSales((await api.get('/sales')).data || []) } catch (err) { setError(err?.response?.data?.error || 'Failed to load sales') } finally { setLoading(false) } }

  function buildFallbackTransactions(rows, filters = {}) {
    const typeFilter = String(filters.type || '').trim()
    const receiptFilter = String(filters.receipt_no || '').trim().toLowerCase()
    return (Array.isArray(rows) ? rows : []).flatMap((sale) => {
      const payment = { transaction_id: `PAY-SALE-${sale.id}`, type: 'SALE_PAYMENT', created_at: sale.payment_received_at || sale.date, sale_id: sale.id, sale_number: sale.sale_number, receipt_no: sale.receipt_no, payment_method: sale.payment_method, amount: round(sale.total), amount_received: round(sale.amount_received || sale.total), change_amount: round(sale.change_amount), user_name: sale.clerk_name || '-' }
      const returnedQty = num(sale.returned_qty)
      if (!returnedQty) return [payment]
      return [payment, { transaction_id: `RET-SALE-${sale.id}`, type: 'SALE_RETURN', created_at: sale.date, sale_id: sale.id, sale_number: sale.sale_number, receipt_no: sale.receipt_no, payment_method: sale.payment_method, amount: round(sale.returned_amount), quantity: returnedQty, product_name: sale.return_status === 'FULL' ? 'Full sale return' : 'Returned items', user_name: sale.clerk_name || '-' }]
    }).filter((row) => !typeFilter || row.type === typeFilter).filter((row) => !receiptFilter || String(row.receipt_no || '').toLowerCase().includes(receiptFilter)).sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
  }

  async function fetchTransactions() {
    try {
      setError(null); setLoading(true)
      const q = []
      if (transactionType) q.push(`type=${encodeURIComponent(transactionType)}`)
      if (transactionReceipt.trim()) q.push(`receipt_no=${encodeURIComponent(transactionReceipt.trim())}`)
      setTransactions((await api.get(q.length ? `/sales/transactions?${q.join('&')}` : '/sales/transactions')).data || [])
    } catch (err) {
      const message = err?.response?.data?.error || 'Failed to load transactions'
      if (err?.response?.status === 404 && message === 'sale not found') {
        try {
          const saleRows = (await api.get('/sales')).data || []
          setSales(saleRows)
          setTransactions(buildFallbackTransactions(saleRows, { type: transactionType, receipt_no: transactionReceipt }))
          return
        } catch (fallbackErr) {
          setError(fallbackErr?.response?.data?.error || 'Failed to load transactions')
          return
        }
      }
      setError(message)
    } finally { setLoading(false) }
  }

  async function fetchReport() {
    try {
      setLoading(true)
      const q = []
      if (reportFrom) q.push(`from=${encodeURIComponent(reportFrom)}`)
      if (reportTo) q.push(`to=${encodeURIComponent(reportTo)}`)
      setReport((await api.get(q.length ? `/sales/reports/summary?${q.join('&')}` : '/sales/reports/summary')).data || null)
    } catch (err) {
      setError(err?.response?.data?.error || 'Failed to load report')
    } finally { setLoading(false) }
  }

  function resetDraft() {
    setPendingOrder(null)
    setCart([])
    setSearch('')
    setSelectedProduct('')
    setIsProductPickerOpen(false)
    setPrice('')
    setQty('1')
    setOrderNote('')
    setPaymentMethod('cash')
    setDiscountPercentage('')
    setPaymentAmount('')
    setBankAppUsed('')
    setReferenceNumber('')
  }

  function addToCart() {
    clearMsg()
    const product = products.find((item) => String(item.id) === String(selectedProduct))
    if (!product) return setError('Select a product')
    const err = qtyError(qty, selectedProduct)
    if (err) return setError(err)
    const unitPrice = allowPriceOverride ? (price === '' ? num(product.price) : num(price, NaN)) : num(product.price)
    if (!Number.isFinite(unitPrice) || unitPrice < 0) return setError('Price must be zero or greater')
    setCart((prev) => [...prev, { product_id: product.id, name: product.name, sku: product.sku, unit_price: round(unitPrice), catalog_unit_price: round(product.price), quantity: Math.max(1, num(qty, 1)) }])
    setSelectedProduct('')
    setSearch('')
    setIsProductPickerOpen(false)
    setPrice('')
    setQty('1')
  }

  function updateCartQty(index, nextQty) {
    const item = cart[index]
    if (!item) return
    const err = qtyError(nextQty, item.product_id, index)
    if (err) setError(err)
    const maxAllowed = Math.max(stock(item.product_id) - cartQty(item.product_id, index), 1)
    setCart((prev) => prev.map((entry, i) => i !== index ? entry : { ...entry, quantity: Math.min(Math.max(1, num(nextQty, 1)), maxAllowed) }))
  }

  function updateCartPrice(index, nextPrice) {
    if (!allowPriceOverride) return
    const value = num(nextPrice, NaN)
    if (!Number.isFinite(value) || value < 0) return setError('Price must be zero or greater')
    setCart((prev) => prev.map((entry, i) => i === index ? { ...entry, unit_price: round(value) } : entry))
  }

  function startPayment() {
    clearMsg()
    if (!cart.length) return setError('Add items to cart first')
    if (cart.some((item, index) => !!qtyError(item.quantity, item.product_id, index))) return setError('Resolve cart stock issues first')
    if (cartHasLockedPriceOverride) return setError('This draft contains price overrides that require manager permission before checkout')
    if (total <= 0) return setError('Total must be greater than 0')
    const trimmedOrderNote = String(orderNote || '').trim()
    setPendingOrder({
      items: cart.map((item) => ({ ...item })),
      order_note: trimmedOrderNote || undefined,
      payment_method: paymentMethod,
      discount_percentage: discountPct,
      total
    })
    setPaymentAmount(String(total.toFixed(2)))
    setBankAppUsed('')
    setReferenceNumber('')
    setTab('payment')
  }

  async function completeSale() {
    clearMsg()
    if (!pendingOrder) return setError('No pending order')
    if (requiresBankTransferFields && !isBankAppValid) return setError('Bank App Used is required')
    if (requiresBankTransferFields && !isReferenceValid) return setError('Reference Number is required')
    if (!isAmountValid) return setError(requiresBankTransferFields ? 'Bank transfer amount must match the total amount exactly' : 'Payment must be greater than or equal to the total amount')
    try {
      setLoading(true)
      const res = await api.post('/sales', {
        items: pendingOrder.items.map((item) => ({ product_id: item.product_id, quantity: item.quantity, unit_price: item.unit_price })),
        order_note: pendingOrder.order_note,
        payment_method: pendingOrder.payment_method,
        payment_amount: round(tendered),
        bank_app_used: requiresBankTransferFields ? bankAppUsed : undefined,
        reference_number: requiresBankTransferFields ? referenceNumber.trim() : undefined,
        discount_percentage: pendingOrder.discount_percentage
      })
      setLastReceipt(res.data)
      resetDraft()
      await refreshProducts()
      flash(`Sale ${res.data.sale_number} completed. Receipt ${res.data.receipt_no} generated.`)
    } catch (err) {
      setError(err?.response?.data?.error || 'Failed to complete sale')
    } finally { setLoading(false) }
  }

  async function showSale(id) {
    setOpenSaleMenuId(null)
    try { setLoading(true); setViewSale((await api.get(`/sales/${id}`)).data) }
    catch (err) { setError(err?.response?.data?.error || 'Failed to load sale details') }
    finally { setLoading(false) }
  }

  async function refundSale(id) {
    if (!window.confirm('Process a full refund for this sale?')) return
    clearMsg()
    setOpenSaleMenuId(null)
    try {
      setLoading(true)
      await api.post(`/sales/${id}/refund`, {})
      await Promise.all([fetchSales(), fetchTransactions(), fetchReport()])
      await refreshProducts()
      flash('Full refund processed successfully')
    } catch (err) {
      setError(err?.response?.data?.error || 'Refund failed')
    } finally { setLoading(false) }
  }

  async function loadReceiptFromHistory(receiptId) {
    try {
      const history = (await api.get(`/sales?receipt_no=${encodeURIComponent(receiptId)}`)).data
      const matchedSale = Array.isArray(history) ? history.find((sale) => String(sale?.receipt_no || '').toUpperCase() === receiptId.toUpperCase()) : null
      if (!matchedSale) return null
      return matchedSale
    } catch {
      return null
    }
  }

  async function lookupReceipt(receiptValue = returnReceiptNo) {
    clearMsg()
    const receiptId = extractScannedReceiptId(receiptValue)
    if (!receiptId) return setError('Enter a receipt ID')
    try {
      setLoading(true)
      const sale = (await api.get(`/sales/receipt/${encodeURIComponent(receiptId)}`)).data
      setReturnReceiptNo(receiptId)
      setReturnLookup(sale)
      setReturnQuantities(Object.fromEntries((sale.items || []).map((item) => [item.id, ''])))
    } catch (err) {
      const fallbackSale = await loadReceiptFromHistory(receiptId)
      if (fallbackSale) {
        setReturnReceiptNo(receiptId)
        setReturnLookup(fallbackSale)
        setReturnQuantities(Object.fromEntries((fallbackSale.items || []).map((item) => [item.id, ''])))
        flash(`Receipt ${receiptId} loaded from sales history.`)
      } else {
        setReturnLookup(null)
        setReturnQuantities({})
        setError(err?.response?.data?.error || 'Receipt not found')
      }
    } finally { setLoading(false) }
  }

  async function submitReturn() {
    clearMsg()
    if (!returnLookup) return setError('Look up a receipt first')
    const items = (returnLookup.items || []).map((item) => ({ sale_item_id: item.id, quantity: num(returnQuantities[item.id]) })).filter((item) => item.quantity > 0)
    if (!items.length) return setError('Enter at least one return quantity')
    try {
      setLoading(true)
      const res = await api.post('/sales/returns', { receipt_no: returnLookup.receipt_no, items, reason: returnReason || undefined, return_disposition: returnDisposition })
      setReturnLookup(res.data.sale)
      setReturnReason('')
      setReturnDisposition('RESTOCK')
      setReturnQuantities(Object.fromEntries((res.data.sale?.items || []).map((item) => [item.id, ''])))
      await refreshProducts()
      await Promise.all([fetchSales(), fetchTransactions(), fetchReport()])
      flash(`Return processed for receipt ${res.data.sale.receipt_no}`)
    } catch (err) {
      setError(err?.response?.data?.error || 'Return failed')
    } finally { setLoading(false) }
  }

  function printReceipt() {
    if (!receiptRef.current) return
    const popup = window.open('', '_blank', 'width=400,height=650')
    if (!popup) return
    popup.document.write(`<html><body style="font-family:Courier New,monospace;padding:20px">${receiptRef.current.innerHTML}<script>window.print();window.close();</script></body></html>`)
    popup.document.close()
  }

  function useSaleReceipt(receiptNo) {
    setOpenSaleMenuId(null)
    setTab('returns')
    setReturnReceiptNo(receiptNo)
    setTimeout(() => lookupReceipt(receiptNo), 0)
  }

  function toggleSaleMenu(saleId) {
    setOpenSaleMenuId((current) => current === saleId ? null : saleId)
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Sales Management</h1>
          <p className="page-subtitle">POS, accept payment, receipt-driven returns, and automated sales tracking</p>
        </div>
      </div>

      {error && <div className="error-msg" style={{ marginBottom: 16 }}>{error}</div>}
      {success && <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#15803d', padding: '10px 14px', borderRadius: 6, marginBottom: 16 }}>{success}</div>}

      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '2px solid var(--border)', flexWrap: 'wrap' }}>
        {tabs.map(([key, label]) => (
          <button key={key} onClick={() => { clearMsg(); setTab(key) }} style={{ padding: '10px 18px', border: 'none', borderBottom: tab === key ? '2px solid var(--gold)' : '2px solid transparent', background: 'transparent', color: tab === key ? 'var(--gold-dark)' : 'var(--text-mid)', fontWeight: tab === key ? 600 : 400, cursor: 'pointer', marginBottom: -2 }}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'pos' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 340px', gap: 20 }}>
          <div>
            <div className="card" style={{ marginBottom: 16 }}>
              <h3 style={{ marginBottom: 12 }}>Build Order</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.6fr) 140px 100px', gap: 12, alignItems: 'end' }}>
                <div className="form-group" style={{ marginBottom: 0, position: 'relative' }}>
                  <label className="form-label">Product Search</label>
                  <input
                    className="form-input"
                    value={search}
                    onChange={(e) => handleProductSearchChange(e.target.value)}
                    onFocus={() => setIsProductPickerOpen(true)}
                    onBlur={() => window.setTimeout(() => setIsProductPickerOpen(false), 120)}
                    onKeyDown={(e) => {
                      if (e.key !== 'Enter') return
                      if (!selectedProduct && filteredProducts.length === 1) {
                        e.preventDefault()
                        selectProductOption(filteredProducts[0])
                      }
                    }}
                    placeholder="Search and select by name, SKU, or barcode"
                  />
                  {isProductPickerOpen && (
                    <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, zIndex: 30, background: '#fff', border: '1px solid var(--border)', borderRadius: 10, boxShadow: '0 12px 30px rgba(15, 23, 42, 0.08)', maxHeight: 260, overflowY: 'auto' }}>
                      {filteredProducts.length === 0 ? (
                        <div style={{ padding: '12px 14px', color: 'var(--text-light)', fontSize: 13 }}>No matching products found.</div>
                      ) : filteredProducts.slice(0, 8).map((product) => (
                        <button
                          type="button"
                          key={product.id}
                          onMouseDown={(e) => {
                            e.preventDefault()
                            selectProductOption(product)
                          }}
                          style={{ width: '100%', padding: '12px 14px', border: 'none', borderBottom: '1px solid rgba(148, 163, 184, 0.16)', background: String(product.id) === String(selectedProduct) ? '#fff7ed' : '#fff', textAlign: 'left', cursor: 'pointer' }}
                        >
                          <div style={{ fontWeight: 600, color: 'var(--text-dark)' }}>{productLabel(product)}</div>
                          <div style={{ marginTop: 4, fontSize: 12, color: 'var(--text-light)' }}>
                            Barcode: {product.barcode || '-'} | Stock: {num(product.stock_quantity)} | {fmt(product.price)}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">Price</label><input className="form-input" type="number" min="0" step="0.01" value={price} disabled={!allowPriceOverride} onChange={(e) => setPrice(e.target.value)} /></div>
                <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">Qty</label><input className="form-input" type="number" min="1" value={qty} onChange={(e) => setQty(e.target.value)} /></div>
              </div>
              {selectedProductData && <div style={{ fontSize: 12, color: 'var(--text-light)', marginTop: 8 }}>Stock: {num(selectedProductData.stock_quantity)} | Barcode: {selectedProductData.barcode || '-'} | Price: {fmt(selectedProductData.price)}</div>}
              <button className="btn btn-primary" onClick={addToCart} disabled={!selectedProduct || !!qtyError(qty, selectedProduct) || loading} style={{ marginTop: 12 }}>Add To Cart</button>
            </div>

            <div className="card">
              <h3 style={{ marginBottom: 12 }}>Cart</h3>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Product</th><th>Price</th><th>Qty</th><th>Subtotal</th><th /></tr></thead>
                  <tbody>
                    {cart.length === 0 ? <tr><td colSpan="5" style={{ textAlign: 'center', color: 'var(--text-light)', padding: 24 }}>No items in cart yet.</td></tr> : cart.map((item, index) => (
                      <tr key={`${item.product_id}-${index}`}>
                        <td><div style={{ fontWeight: 600 }}>{item.name}</div>{item.sku && <div style={{ fontSize: 11, color: 'var(--text-light)' }}>{item.sku}</div>}</td>
                        <td>{allowPriceOverride ? <input type="number" min="0" step="0.01" value={item.unit_price} onChange={(e) => updateCartPrice(index, e.target.value)} style={{ width: 90 }} /> : fmt(item.unit_price)}</td>
                        <td><input type="number" min="1" value={item.quantity} onChange={(e) => updateCartQty(index, e.target.value)} style={{ width: 70 }} /></td>
                        <td style={{ fontWeight: 600 }}>{fmt(num(item.unit_price) * num(item.quantity))}</td>
                        <td><button className="btn btn-danger" onClick={() => setCart((prev) => prev.filter((_, i) => i !== index))} style={{ padding: '4px 8px', fontSize: 12 }}>X</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="card" style={{ position: 'sticky', top: 80, height: 'fit-content' }}>
            <h3 style={{ marginBottom: 12 }}>POS Summary</h3>
            <div style={{ marginBottom: 16, padding: '10px 12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12, color: 'var(--text-mid)' }}>
              Customer module is deprecated for POS checkout. New sales are recorded as walk-in.
            </div>
            <div className="form-group"><label className="form-label">Order Note</label><textarea className="form-input" rows="2" value={orderNote} onChange={(e) => setOrderNote(e.target.value)} /></div>
            <div className="form-group"><label className="form-label">Payment Method</label><select className="form-input" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>{(config.payment_methods || ['cash', 'mobile_bank_transfer']).map((method) => <option key={method} value={method}>{method === 'mobile_bank_transfer' ? 'Bank Transfer' : 'Cash'}</option>)}</select></div>
            <div className="form-group"><label className="form-label">Discount (%)</label><input className="form-input" type="number" min="0" max="100" step="0.01" value={allowDiscount ? discountPercentage : '0'} disabled={!allowDiscount} onChange={(e) => setDiscountPercentage(e.target.value)} /></div>
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Subtotal</span><span>{fmt(subtotal)}</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Discount</span><span>-{fmt(discountAmount)}</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 20, marginTop: 8 }}><span>Total</span><span>{fmt(total)}</span></div>
            </div>
            {cartHasLockedPriceOverride && <div style={{ marginTop: 12, padding: '10px 12px', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 8, color: '#9a3412', fontSize: 12 }}>This cart includes manager-set price overrides. A cashier without price override permission cannot complete it.</div>}
            <button className="btn btn-primary" onClick={startPayment} disabled={!cart.length || loading} style={{ width: '100%', marginTop: 16 }}>Proceed To Accept Payment</button>
          </div>
        </div>
      )}

      {tab === 'payment' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 340px', gap: 20 }}>
          <div>
            <div className="card" style={{ marginBottom: 16 }}>
              <h3 style={{ marginBottom: 12 }}>Accept Payment</h3>
              {!pendingOrder ? <p style={{ color: 'var(--text-light)' }}>No pending order. Build one in POS first.</p> : <>
                <div className="table-wrap" style={{ marginBottom: 16 }}><table><thead><tr><th>Item</th><th>Qty</th><th>Unit</th><th>Subtotal</th></tr></thead><tbody>{pendingOrder.items.map((item, index) => <tr key={`${item.product_id}-${index}`}><td>{item.name}</td><td>{item.quantity}</td><td>{fmt(item.unit_price)}</td><td style={{ fontWeight: 600 }}>{fmt(item.unit_price * item.quantity)}</td></tr>)}</tbody></table></div>
                <div style={{ marginBottom: 12, fontSize: 12, color: 'var(--text-mid)' }}>Order Note: {pendingOrder.order_note || '-'}</div>
                <div className="form-group"><label className="form-label">Amount Received</label><input className="form-input" type="number" min="0.01" step="0.01" value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} /></div>
                {requiresBankTransferFields && <div className="form-group"><label className="form-label">Bank App Used *</label><select className="form-input" value={bankAppUsed} onChange={(e) => setBankAppUsed(e.target.value)}><option value="">Select mobile banking app</option>{MOBILE_BANK_APPS.map((name) => <option key={name} value={name}>{name}</option>)}</select></div>}
                {requiresBankTransferFields && <div className="form-group"><label className="form-label">Reference Number *</label><input className="form-input" value={referenceNumber} onChange={(e) => setReferenceNumber(e.target.value)} /></div>}
                <div style={{ display: 'flex', gap: 8 }}><button className="btn btn-secondary" onClick={() => setTab('pos')}>Back To POS</button><button className="btn btn-primary" onClick={completeSale} disabled={!canConfirmPayment} style={{ flex: 1 }}>{loading ? 'Processing...' : 'Confirm Payment & Complete Sale'}</button></div>
              </>}
            </div>

            {lastReceipt && <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}><h3>Latest Paid Sale</h3><button className="btn btn-secondary" onClick={printReceipt}>Print Receipt</button></div>
              <div ref={receiptRef}>
                <div style={{ textAlign: 'center', marginBottom: 8 }}><h2 style={{ margin: 0, fontSize: 15 }}>Cecille&apos;s N&apos;Style</h2><div>Paid Receipt</div></div>
                <div>Receipt: {lastReceipt.receipt_no}</div><div>Sale ID: {lastReceipt.sale_number}</div><div>Date: {fmtDate(lastReceipt.date || new Date())}</div>
                <div>Payment: {lastReceipt.payment_method}</div>
                <div>Order Note: {lastReceipt.order_note || '-'}</div>
                <div>Bank App Used: {lastReceipt.bank_app_used || '-'}</div><div>Reference Number: {lastReceipt.reference_number || lastReceipt.payment_reference || '-'}</div>
                <div>Subtotal: {fmt(lastReceipt.subtotal)}</div><div>Discount: {fmt(lastReceipt.discount)}</div>
                <div>Received: {fmt(lastReceipt.amount_received)}</div><div>Change: {fmt(lastReceipt.change_amount)}</div>
                {(lastReceipt.items || []).map((item, index) => <div key={`${item.id || index}`}>{item.product_name || item.productName || 'Item'} x{item.quantity || item.qty} - {fmt(item.line_total || item.lineTotal)}</div>)}
                <div style={{ marginTop: 8, fontWeight: 700 }}>TOTAL: {fmt(lastReceipt.total)}</div>
              </div>
            </div>}
          </div>

          <div className="card" style={{ position: 'sticky', top: 80, height: 'fit-content' }}>
            <h3 style={{ marginBottom: 12 }}>Payment Validation</h3>
            {!pendingOrder ? <p style={{ color: 'var(--text-light)' }}>Payment summary appears here after you proceed from POS.</p> : <>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Total Due</span><strong>{fmt(pendingOrder.total)}</strong></div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Amount Received</span><strong>{fmt(tendered)}</strong></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: isAmountValid ? '#15803d' : '#b42318', marginBottom: 8 }}><span>Change</span><strong>{fmt(Math.max(tendered - num(pendingOrder.total), 0))}</strong></div>
              {requiresBankTransferFields && !isBankAppValid && <p style={{ fontSize: 12, color: '#b42318', marginBottom: 4 }}>Select a mobile banking app.</p>}
              {requiresBankTransferFields && !isReferenceValid && <p style={{ fontSize: 12, color: '#b42318', marginBottom: 4 }}>Reference number is required.</p>}
              {requiresBankTransferFields && paymentAmount && !isAmountValid && <p style={{ fontSize: 12, color: '#b42318', marginBottom: 4 }}>Bank transfer amount must exactly match the total due.</p>}
              <p style={{ fontSize: 12, color: canConfirmPayment ? '#15803d' : '#b42318' }}>{canConfirmPayment ? 'Payment is valid. Completing the sale will generate the receipt and sales record.' : 'Complete all required payment fields and ensure amount covers total due.'}</p>
            </>}
          </div>
        </div>
      )}

      {tab === 'history' && (
        <div>
          {viewSale && <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}><h3>Sale Details - {viewSale.sale_number}</h3><button className="btn btn-secondary" onClick={() => setViewSale(null)}>Close</button></div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12, marginBottom: 12 }}>
              <div><strong>Receipt: </strong>{viewSale.receipt_no}</div><div><strong>Date: </strong>{fmtDate(viewSale.date)}</div><div><strong>Clerk: </strong>{viewSale.clerk_name || '-'}</div>
              <div><strong>Payment: </strong>{viewSale.payment_method}</div><div><strong>Bank App Used: </strong>{viewSale.bank_app_used || '-'}</div><div><strong>Reference Number: </strong>{viewSale.reference_number || viewSale.payment_reference || '-'}</div>
              <div><strong>Subtotal: </strong>{fmt(viewSale.subtotal)}</div><div><strong>Discount: </strong>{fmt(viewSale.discount)}</div><div><strong>Total: </strong>{fmt(viewSale.total)}</div>
              <div><strong>Return: </strong>{viewSale.return_status}</div><div><strong>Received: </strong>{fmt(viewSale.amount_received)}</div><div><strong>Change: </strong>{fmt(viewSale.change_amount)}</div>
            </div>
            <div style={{ marginBottom: 12, padding: '10px 12px', borderRadius: 8, background: '#f8fafc', color: 'var(--text-mid)' }}><strong>Order Note: </strong>{viewSale.order_note || '-'}</div>
            <div className="table-wrap"><table><thead><tr><th>Product</th><th>Qty</th><th>Returned</th><th>Available</th><th>Line Total</th></tr></thead><tbody>{(viewSale.items || []).map((item) => <tr key={item.id}><td>{item.product_name || '-'}</td><td>{item.qty}</td><td>{item.returned_qty || 0}</td><td>{item.available_to_return || 0}</td><td>{fmt(item.line_total)}</td></tr>)}</tbody></table></div>
          </div>}
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Sale ID</th>
                  <th>Receipt</th>
                  <th>Date</th>
                  <th>Total</th>
                  <th>Payment</th>
                  <th>Return</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {sales.length === 0 ? (
                  <tr>
                    <td colSpan="7" style={{ textAlign: 'center', color: 'var(--text-light)', padding: 24 }}>No sales found.</td>
                  </tr>
                ) : sales.map((sale) => {
                  const canRefundSale = can(permissions, 'sales.refund')

                  return (
                    <tr key={sale.id} className="sales-history-row">
                      <td>
                        <span className="sales-history-id-label">{sale.sale_number}</span>
                      </td>
                      <td>{sale.receipt_no}</td>
                      <td>{fmtDate(sale.date)}</td>
                      <td>{fmt(sale.total)}</td>
                      <td>{sale.payment_method}</td>
                      <td>{sale.return_status}</td>
                      <td className="sales-history-actions-cell">
                        <div className="sales-history-actions">
                          <button className="btn btn-secondary sales-history-primary-action" onClick={() => showSale(sale.id)}>
                            View
                          </button>
                          {canRefundSale && (
                            <div className="sales-history-menu-wrap">
                              <button
                                className={`btn btn-secondary sales-history-menu-toggle${openSaleMenuId === sale.id ? ' is-open' : ''}`}
                                onClick={() => toggleSaleMenu(sale.id)}
                                aria-expanded={openSaleMenuId === sale.id}
                              >
                                More
                              </button>
                              {openSaleMenuId === sale.id && (
                                <div className="sales-history-action-popover">
                                  <button className="btn btn-secondary sales-history-actions-item" onClick={() => useSaleReceipt(sale.receipt_no)}>
                                    Use Receipt
                                  </button>
                                  {sale.return_status !== 'FULL' && (
                                    <button className="btn btn-danger sales-history-actions-item" onClick={() => refundSale(sale.id)}>
                                      Full Refund
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'transactions' && (
        <div>
          <div className="card" style={{ marginBottom: 16, display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 12, alignItems: 'end' }}>
            <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">Type</label><select className="form-input" value={transactionType} onChange={(e) => setTransactionType(e.target.value)}><option value="">All</option><option value="SALE_PAYMENT">Sale Payment</option><option value="SALE_RETURN">Sale Return</option></select></div>
            <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">Receipt ID</label><input className="form-input" value={transactionReceipt} onChange={(e) => setTransactionReceipt(e.target.value)} /></div>
            <button className="btn btn-primary" onClick={fetchTransactions}>Refresh</button>
          </div>
          <div className="table-wrap"><table><thead><tr><th>Type</th><th>Receipt</th><th>Date</th><th>Amount</th><th>Details</th><th>User</th></tr></thead><tbody>{transactions.length === 0 ? <tr><td colSpan="6" style={{ textAlign: 'center', color: 'var(--text-light)', padding: 24 }}>No transactions found.</td></tr> : transactions.map((txn) => <tr key={txn.transaction_id}><td>{txn.type}</td><td>{txn.receipt_no || '-'}</td><td>{fmtDate(txn.created_at)}</td><td>{fmt(txn.amount)}</td><td>{txn.type === 'SALE_PAYMENT' ? `${txn.payment_method} | ${txn.bank_app_used || 'No app'} | Ref ${txn.reference_number || '-'} | Received ${fmt(txn.amount_received)} | Change ${fmt(txn.change_amount)}` : `${txn.product_name || 'Returned item'} | Qty ${txn.quantity}${txn.return_disposition ? ` | ${txn.return_disposition}` : ''}`}</td><td>{txn.user_name || '-'}</td></tr>)}</tbody></table></div>
        </div>
      )}

      {tab === 'returns' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 320px', gap: 20 }}>
          <div>
            <div className="card" style={{ marginBottom: 16 }}>
              <h3 style={{ marginBottom: 12 }}>Receipt Lookup</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, alignItems: 'end' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Receipt ID</label>
                  <input
                    className="form-input"
                    value={returnReceiptNo}
                    onChange={(e) => setReturnReceiptNo(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key !== 'Enter') return
                      e.preventDefault()
                      lookupReceipt(e.currentTarget.value)
                    }}
                    placeholder="Scan or type receipt id from Sales history"
                  />
                </div>
                <button className="btn btn-primary" onClick={lookupReceipt}>Load Receipt</button>
              </div>
            </div>
            {returnLookup && <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}><h3>Return Items - {returnLookup.receipt_no}</h3><span style={{ fontSize: 12, color: 'var(--text-light)' }}>{returnLookup.return_status}</span></div>
              <div className="table-wrap"><table><thead><tr><th>Product</th><th>Bought</th><th>Returned</th><th>Available</th><th>Return Qty</th></tr></thead><tbody>{(returnLookup.items || []).map((item) => <tr key={item.id}><td>{item.product_name || '-'}</td><td>{item.qty}</td><td>{item.returned_qty || 0}</td><td>{item.available_to_return || 0}</td><td><input type="number" min="0" max={item.available_to_return || 0} value={returnQuantities[item.id] || ''} disabled={!item.available_to_return} onChange={(e) => setReturnQuantities((prev) => ({ ...prev, [item.id]: e.target.value }))} style={{ width: 80 }} /></td></tr>)}</tbody></table></div>
              <div className="form-group" style={{ marginTop: 16 }}><label className="form-label">Reason</label><textarea className="form-input" rows="3" value={returnReason} onChange={(e) => setReturnReason(e.target.value)} /></div>
              <div className="form-group"><label className="form-label">Return Handling *</label><select className="form-input" value={returnDisposition} onChange={(e) => setReturnDisposition(e.target.value)}><option value="RESTOCK">Restock (saleable item)</option><option value="DAMAGE">Damage (record in damaged stock)</option><option value="SHRINKAGE">Shrinkage (record in shrinkage)</option></select></div>
              <button className="btn btn-primary" onClick={submitReturn} disabled={loading}>{loading ? 'Processing...' : 'Process Return'}</button>
            </div>}
          </div>
          <div className="card" style={{ position: 'sticky', top: 80, height: 'fit-content' }}>
            <h3 style={{ marginBottom: 12 }}>Return Rules</h3>
            <ul style={{ paddingLeft: 18, margin: 0, display: 'grid', gap: 8, color: 'var(--text-mid)' }}>
              <li>Returns require a valid receipt ID.</li>
              <li>Product details load automatically from the receipt.</li>
              <li>You cannot return more than the quantity still available to return.</li>
              <li>Choose Return Handling to route returned items to restock, damage, or shrinkage.</li>
              <li>Successful returns update inventory and transaction logs automatically.</li>
            </ul>
          </div>
        </div>
      )}

      {tab === 'report' && report && (
        <div>
          <div className="card" style={{ marginBottom: 16, display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 12, alignItems: 'end' }}>
            <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">From</label><input className="form-input" type="date" value={reportFrom} onChange={(e) => setReportFrom(e.target.value)} /></div>
            <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">To</label><input className="form-input" type="date" value={reportTo} onChange={(e) => setReportTo(e.target.value)} /></div>
            <button className="btn btn-primary" onClick={fetchReport}>Refresh Report</button>
          </div>
          <div className="dashboard-grid">
            <StatCard label="Completed Sales" value={report.total_sales || 0} />
            <StatCard label="Gross Revenue" value={fmt(report.total_revenue)} />
            <StatCard label="Returns" value={fmt(report.total_returns)} style={{ color: 'var(--error)' }} />
            <StatCard label="Net Revenue" value={fmt(report.net_revenue)} />
          </div>
          <h3 style={{ marginTop: 20, marginBottom: 12 }}>By Payment Method</h3>
          <div className="table-wrap"><table><thead><tr><th>Method</th><th>Transactions</th><th>Sales Total</th><th>Received</th><th>Change Given</th></tr></thead><tbody>{(report.by_payment_method || []).map((item) => <tr key={item.payment_method || 'unknown'}><td>{item.payment_method || '-'}</td><td>{item.count}</td><td>{fmt(item.total)}</td><td>{fmt(item.amount_received)}</td><td>{fmt(item.change_given)}</td></tr>)}</tbody></table></div>
          <h3 style={{ marginTop: 20, marginBottom: 12 }}>Top Products</h3>
          <div className="table-wrap"><table><thead><tr><th>Product</th><th>Net Qty</th><th>Returned Qty</th><th>Net Sales</th></tr></thead><tbody>{(report.top_products || []).map((item) => <tr key={`${item.sku || item.name}`}><td>{item.name || '-'}</td><td>{item.net_qty}</td><td>{item.returned_qty}</td><td>{fmt(item.net_sales)}</td></tr>)}</tbody></table></div>
        </div>
      )}

      {tab === 'report' && !report && <div className="card">No report data yet.</div>}
      {loading && <div style={{ marginTop: 16, color: 'var(--text-light)' }}>Loading...</div>}
    </div>
  )
}
