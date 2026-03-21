import React, { useEffect, useRef, useState } from 'react'
import { useSelector } from 'react-redux'
import api from '../api/api.js'

const h = React.createElement
const fmt = (n) => Number(n || 0).toLocaleString('en-PH', { style: 'currency', currency: 'PHP' })
const fmtDate = (d) => d ? new Date(d).toLocaleString('en-PH', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'
const round = (n) => Math.round((Number(n) || 0) * 100) / 100
const num = (v, fallback = 0) => Number.isFinite(Number(v)) ? Number(v) : fallback
const pct = (v) => Math.min(Math.max(num(v), 0), 100)
const productLabel = (product) => `${product?.sku ? `${product.sku} - ` : ''}${product?.name || 'Unnamed product'}`

function can(perms, required) {
  if (!required) return true
  if (!Array.isArray(perms)) return false
  if (perms.includes('admin.*')) return true
  const list = Array.isArray(required) ? required : [required]
  return list.some((item) => perms.includes(item))
}

function StatCard(label, value, style) {
  return h('div', { className: 'card' },
    h('div', { className: 'card-title' }, label),
    h('div', { className: 'card-value-sm', style }, value)
  )
}

export default function Sales() {
  const permissions = useSelector((state) => state.auth?.permissions || JSON.parse(localStorage.getItem('permissions') || '[]'))
  const receiptRef = useRef(null)

  const [tab, setTab] = useState('pos')
  const [products, setProducts] = useState([])
  const [customers, setCustomers] = useState([])
  const [sales, setSales] = useState([])
  const [transactions, setTransactions] = useState([])
  const [report, setReport] = useState(null)
  const [config, setConfig] = useState({ tax_rate: 0.12, tax_rate_percentage: 12, payment_methods: ['cash', 'card', 'e-wallet'] })
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)
  const [loading, setLoading] = useState(false)

  const [cart, setCart] = useState([])
  const [search, setSearch] = useState('')
  const [selectedProduct, setSelectedProduct] = useState('')
  const [productDropdownOpen, setProductDropdownOpen] = useState(false)
  const [price, setPrice] = useState('')
  const [qty, setQty] = useState('1')
  const [qtyValidationError, setQtyValidationError] = useState('')
  const [customerId, setCustomerId] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [discountPercentage, setDiscountPercentage] = useState('')
  const [pendingOrder, setPendingOrder] = useState(null)
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentReference, setPaymentReference] = useState('')
  const [lastReceipt, setLastReceipt] = useState(null)

  const [viewSale, setViewSale] = useState(null)
  const [transactionType, setTransactionType] = useState('')
  const [transactionReceipt, setTransactionReceipt] = useState('')
  const [reportFrom, setReportFrom] = useState('')
  const [reportTo, setReportTo] = useState('')
  const [returnReceiptNo, setReturnReceiptNo] = useState('')
  const [returnLookup, setReturnLookup] = useState(null)
  const [returnReason, setReturnReason] = useState('')
  const [returnQuantities, setReturnQuantities] = useState({})

  const tabs = [
    { key: 'pos', label: 'POS', perm: 'sales.create' },
    { key: 'payment', label: 'Accept Payment', perm: 'sales.create' },
    { key: 'history', label: 'Sales', perm: 'sales.view' },
    { key: 'transactions', label: 'Transactions', perm: 'sales.view' },
    { key: 'returns', label: 'Returns', perm: 'sales.refund' },
    { key: 'report', label: 'Sales Report', perm: 'sales.view' }
  ].filter((item) => can(permissions, item.perm))

  useEffect(() => {
    if (!tabs.some((item) => item.key === tab) && tabs[0]) setTab(tabs[0].key)
  }, [tab, tabs])

  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        setLoading(true)
        const [configRes, productsRes, customersRes] = await Promise.allSettled([
          api.get('/sales/config'),
          loadPosProducts(),
          api.get('/customers')
        ])
        if (!active) return
        const issues = []

        if (configRes.status === 'fulfilled') {
          setConfig(configRes.value?.data || config)
        } else {
          issues.push('Sales settings could not be loaded. Using default tax and payment settings.')
        }

        if (productsRes.status === 'fulfilled') {
          setProducts(Array.isArray(productsRes.value) ? productsRes.value : [])
        } else {
          setProducts([])
          issues.push(productsRes.reason?.response?.data?.error || 'Products could not be loaded for POS.')
        }

        if (customersRes.status === 'fulfilled') {
          setCustomers(Array.isArray(customersRes.value?.data) ? customersRes.value.data : [])
        } else {
          setCustomers([])
          issues.push('Customers could not be loaded. Walk-in sales are still available.')
        }

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

  const filteredProducts = products.filter((product) => {
    const needle = search.trim().toLowerCase()
    if (!needle) return true
    return String(product.name || '').toLowerCase().includes(needle)
      || String(product.sku || '').toLowerCase().includes(needle)
      || String(product.barcode || '').includes(search)
  })

  const subtotal = round(cart.reduce((sum, item) => sum + num(item.unit_price) * num(item.quantity), 0))
  const discountPct = pct(discountPercentage)
  const discountAmount = round(subtotal * (discountPct / 100))
  const taxableBase = Math.max(subtotal - discountAmount, 0)
  const taxAmount = round(taxableBase * num(config.tax_rate, 0))
  const total = round(taxableBase + taxAmount)
  const tendered = num(paymentAmount)
  const change = pendingOrder ? round(Math.max(tendered - num(pendingOrder.total), 0)) : 0
  const selectedProductData = products.find((item) => String(item.id) === String(selectedProduct)) || null

  function clearMsg() {
    setError(null)
    setSuccess(null)
  }

  function flash(message) {
    setSuccess(message)
    setTimeout(() => setSuccess(null), 4000)
  }

  function stock(productId) {
    return num(products.find((item) => String(item.id) === String(productId))?.stock_quantity)
  }

  function cartQty(productId, skip = -1) {
    return cart.reduce((sum, item, index) => {
      if (index === skip) return sum
      return String(item.product_id) === String(productId) ? sum + num(item.quantity) : sum
    }, 0)
  }

  function qtyError(nextQty, productId = selectedProduct, skip = -1) {
    const amount = num(nextQty)
    if (!productId) return 'Select a product first'
    if (amount <= 0) return 'Quantity must be greater than 0'
    const available = stock(productId)
    const already = cartQty(productId, skip)
    return already + amount > available ? `Insufficient stock. Only ${Math.max(available - already, 0)} left.` : ''
  }

  useEffect(() => {
    if (!selectedProduct) {
      setQtyValidationError('')
      return
    }
    setQtyValidationError(qtyError(qty, selectedProduct))
  }, [qty, selectedProduct, cart, products])

  function handleProductSearch(value) {
    clearMsg()
    setSearch(value)
    setProductDropdownOpen(true)
    setSelectedProduct('')
    setPrice('')
  }

  function chooseProduct(product) {
    setSelectedProduct(String(product.id))
    setSearch(productLabel(product))
    setPrice(String(product.price || ''))
    setProductDropdownOpen(false)
  }

  async function loadPosProducts() {
    try {
      const res = await api.get('/sales/products')
      return Array.isArray(res.data) ? res.data : []
    } catch (primaryErr) {
      const fallbackRes = await api.get('/products')
      return Array.isArray(fallbackRes.data) ? fallbackRes.data : []
    }
  }

  async function refreshProducts() {
    setProducts(await loadPosProducts())
  }

  function buildFallbackTransactions(saleRows, filters = {}) {
    const typeFilter = String(filters.type || '').trim()
    const receiptFilter = String(filters.receipt_no || '').trim().toLowerCase()

    const rows = (Array.isArray(saleRows) ? saleRows : [])
      .flatMap((sale) => {
        const paymentRow = {
          transaction_id: `PAY-SALE-${sale.id}`,
          type: 'SALE_PAYMENT',
          created_at: sale.payment_received_at || sale.date,
          sale_id: sale.id,
          sale_number: sale.sale_number,
          receipt_no: sale.receipt_no,
          payment_method: sale.payment_method,
          amount: round(sale.total),
          amount_received: round(sale.amount_received || sale.total),
          change_amount: round(sale.change_amount),
          user_name: sale.clerk_name || '-'
        }

        const returnedQty = num(sale.returned_qty)
        const returnedAmount = round(sale.returned_amount)
        const returnRow = returnedQty > 0
          ? {
              transaction_id: `RET-SALE-${sale.id}`,
              type: 'SALE_RETURN',
              created_at: sale.date,
              sale_id: sale.id,
              sale_number: sale.sale_number,
              receipt_no: sale.receipt_no,
              payment_method: sale.payment_method,
              amount: returnedAmount,
              quantity: returnedQty,
              product_name: sale.return_status === 'FULL' ? 'Full sale return' : 'Returned items',
              user_name: sale.clerk_name || '-'
            }
          : null

        return returnRow ? [paymentRow, returnRow] : [paymentRow]
      })
      .filter((row) => !typeFilter || row.type === typeFilter)
      .filter((row) => !receiptFilter || String(row.receipt_no || '').toLowerCase().includes(receiptFilter))

    rows.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
    return rows
  }

  async function fetchSales() {
    try {
      setLoading(true)
      const res = await api.get('/sales')
      setSales(res.data || [])
    } catch (err) {
      setError(err?.response?.data?.error || 'Failed to load sales')
    } finally {
      setLoading(false)
    }
  }

  async function fetchTransactions() {
    try {
      setError(null)
      setLoading(true)
      const parts = []
      if (transactionType) parts.push(`type=${encodeURIComponent(transactionType)}`)
      if (transactionReceipt.trim()) parts.push(`receipt_no=${encodeURIComponent(transactionReceipt.trim())}`)
      const res = await api.get(parts.length ? `/sales/transactions?${parts.join('&')}` : '/sales/transactions')
      setTransactions(res.data || [])
    } catch (err) {
      const message = err?.response?.data?.error || 'Failed to load transactions'
      const isLegacyTransactionsMiss = err?.response?.status === 404 && message === 'sale not found'

      if (isLegacyTransactionsMiss) {
        try {
          const salesRes = await api.get('/sales')
          const saleRows = Array.isArray(salesRes.data) ? salesRes.data : []
          setSales(saleRows)
          setTransactions(buildFallbackTransactions(saleRows, {
            type: transactionType,
            receipt_no: transactionReceipt
          }))
          return
        } catch (fallbackErr) {
          setError(fallbackErr?.response?.data?.error || 'Failed to load transactions')
          return
        }
      }

      setError(message)
    } finally {
      setLoading(false)
    }
  }

  async function fetchReport() {
    try {
      setLoading(true)
      const parts = []
      if (reportFrom) parts.push(`from=${encodeURIComponent(reportFrom)}`)
      if (reportTo) parts.push(`to=${encodeURIComponent(reportTo)}`)
      const res = await api.get(parts.length ? `/sales/reports/summary?${parts.join('&')}` : '/sales/reports/summary')
      setReport(res.data || null)
    } catch (err) {
      setError(err?.response?.data?.error || 'Failed to load report')
    } finally {
      setLoading(false)
    }
  }

  function addToCart() {
    clearMsg()
    const product = products.find((item) => String(item.id) === String(selectedProduct))
    if (!product) return setError('Select a product')
    const err = qtyError(qty, selectedProduct)
    if (err) return setError(err)
    const unitPrice = price === '' ? num(product.price) : num(price, NaN)
    if (!Number.isFinite(unitPrice) || unitPrice < 0) return setError('Price must be zero or greater')
    const quantity = Math.max(1, num(qty, 1))
    setCart((prev) => [...prev, { product_id: product.id, name: product.name, sku: product.sku, unit_price: round(unitPrice), quantity }])
    setSearch('')
    setSelectedProduct('')
    setProductDropdownOpen(false)
    setPrice('')
    setQty('1')
    setQtyValidationError('')
  }

  function updateCartQty(index, nextQty) {
    const item = cart[index]
    if (!item) return
    const err = qtyError(nextQty, item.product_id, index)
    if (err) setError(err)
    const maxAllowed = Math.max(stock(item.product_id) - cartQty(item.product_id, index), 1)
    setCart((prev) => prev.map((entry, entryIndex) => entryIndex !== index ? entry : { ...entry, quantity: Math.min(Math.max(1, num(nextQty, 1)), maxAllowed) }))
  }

  function updateCartPrice(index, nextPrice) {
    const value = num(nextPrice, NaN)
    if (!Number.isFinite(value) || value < 0) return setError('Price must be zero or greater')
    setCart((prev) => prev.map((entry, entryIndex) => entryIndex === index ? { ...entry, unit_price: round(value) } : entry))
  }

  function removeCartItem(index) {
    setCart((prev) => prev.filter((_, itemIndex) => itemIndex !== index))
  }

  function startPayment() {
    clearMsg()
    if (!cart.length) return setError('Add items to cart first')
    if (cart.some((item, index) => !!qtyError(item.quantity, item.product_id, index))) return setError('Resolve cart stock issues first')
    if (total <= 0) return setError('Total must be greater than 0')
    setPendingOrder({
      items: cart.map((item) => ({ ...item })),
      customer_id: customerId ? num(customerId) : null,
      payment_method: paymentMethod,
      discount_percentage: discountPct,
      subtotal,
      discount_amount: discountAmount,
      tax_amount: taxAmount,
      tax_rate_percentage: num(config.tax_rate_percentage),
      total
    })
    setPaymentAmount(String(total.toFixed(2)))
    setPaymentReference('')
    setTab('payment')
  }

  async function completeSale() {
    clearMsg()
    if (!pendingOrder) return setError('No pending order')
    if (tendered < num(pendingOrder.total)) return setError('Payment must be greater than or equal to the total amount')
    try {
      setLoading(true)
      const res = await api.post('/sales', {
        items: pendingOrder.items.map((item) => ({ product_id: item.product_id, quantity: item.quantity, unit_price: item.unit_price })),
        customer_id: pendingOrder.customer_id || undefined,
        payment_method: pendingOrder.payment_method,
        payment_amount: round(tendered),
        payment_reference: paymentReference || undefined,
        discount_percentage: pendingOrder.discount_percentage
      })
      setLastReceipt(res.data)
      setPendingOrder(null)
      setCart([])
      setCustomerId('')
      setDiscountPercentage('')
      setPaymentAmount('')
      setPaymentReference('')
      await refreshProducts()
      flash(`Sale ${res.data.sale_number} completed. Receipt ${res.data.receipt_no} generated.`)
    } catch (err) {
      setError(err?.response?.data?.error || 'Failed to complete sale')
    } finally {
      setLoading(false)
    }
  }

  async function showSale(id) {
    try {
      setLoading(true)
      setViewSale((await api.get(`/sales/${id}`)).data)
    } catch (err) {
      setError(err?.response?.data?.error || 'Failed to load sale details')
    } finally {
      setLoading(false)
    }
  }

  async function refundSale(id) {
    if (!window.confirm('Process a full refund for this sale?')) return
    clearMsg()
    try {
      setLoading(true)
      await api.post(`/sales/${id}/refund`)
      await Promise.all([fetchSales(), fetchTransactions(), fetchReport()])
      await refreshProducts()
      flash('Full refund processed successfully')
    } catch (err) {
      setError(err?.response?.data?.error || 'Refund failed')
    } finally {
      setLoading(false)
    }
  }

  async function lookupReceipt(receiptValue = returnReceiptNo) {
    clearMsg()
    const receiptId = String(receiptValue || '').trim()
    if (!receiptId) return setError('Enter a receipt ID')
    try {
      setLoading(true)
      const sale = (await api.get(`/sales/receipt/${encodeURIComponent(receiptId)}`)).data
      setReturnReceiptNo(receiptId)
      setReturnLookup(sale)
      setReturnQuantities(Object.fromEntries((sale.items || []).map((item) => [item.id, ''])))
    } catch (err) {
      setReturnLookup(null)
      setReturnQuantities({})
      setError(err?.response?.data?.error || 'Receipt not found')
    } finally {
      setLoading(false)
    }
  }

  async function submitReturn() {
    clearMsg()
    if (!returnLookup) return setError('Look up a receipt first')
    const items = (returnLookup.items || [])
      .map((item) => ({ sale_item_id: item.id, quantity: num(returnQuantities[item.id]) }))
      .filter((item) => item.quantity > 0)
    if (!items.length) return setError('Enter at least one return quantity')
    try {
      setLoading(true)
      const res = await api.post('/sales/returns', { receipt_no: returnLookup.receipt_no, items, reason: returnReason || undefined })
      setReturnLookup(res.data.sale)
      setReturnReason('')
      setReturnQuantities(Object.fromEntries((res.data.sale?.items || []).map((item) => [item.id, ''])))
      await refreshProducts()
      await Promise.all([fetchSales(), fetchTransactions(), fetchReport()])
      flash(`Return processed for receipt ${res.data.sale.receipt_no}`)
    } catch (err) {
      setError(err?.response?.data?.error || 'Return failed')
    } finally {
      setLoading(false)
    }
  }

  function printReceipt() {
    if (!receiptRef.current) return
    const popup = window.open('', '_blank', 'width=400,height=650')
    if (!popup) return
    popup.document.write(`<html><body style="font-family:Courier New,monospace;padding:20px">${receiptRef.current.innerHTML}<script>window.print();window.close();</script></body></html>`)
    popup.document.close()
  }

  function renderPos() {
    const cartItemCount = cart.reduce((sum, item) => sum + num(item.quantity), 0)
    const dropdownContent = filteredProducts.length === 0
      ? h('div', { style: { padding: '12px 14px', color: 'var(--text-light)', fontSize: 13 } }, 'No matching products')
      : filteredProducts.map((product) => h('button', {
          type: 'button',
          key: product.id,
          onMouseDown: (e) => {
            e.preventDefault()
            chooseProduct(product)
          },
          style: {
            display: 'block',
            width: '100%',
            padding: '12px 14px',
            textAlign: 'left',
            border: 'none',
            borderBottom: '1px solid var(--border-light)',
            background: String(selectedProduct) === String(product.id) ? 'var(--gold-light)' : 'var(--white)'
          }
        },
        h('div', { style: { fontSize: 14, fontWeight: 600, color: 'var(--text-dark)' } }, productLabel(product)),
        h('div', { style: { marginTop: 3, fontSize: 12, color: 'var(--text-light)' } }, `${fmt(product.price)} | Stock ${num(product.stock_quantity)}${product.barcode ? ` | ${product.barcode}` : ''}`)
      ))

    const selectedMeta = selectedProductData
      ? h('div', {
          style: {
            display: 'grid',
            gridTemplateColumns: 'repeat(3,minmax(0,1fr))',
            gap: 12,
            marginTop: 16,
            padding: 14,
            border: '1px solid var(--border-light)',
            borderRadius: 'var(--radius-md)',
            background: 'var(--cream-white)'
          }
        },
        h('div', null, h('div', { className: 'card-title', style: { marginBottom: 4 } }, 'Selected'), h('div', { style: { fontWeight: 600 } }, productLabel(selectedProductData))),
        h('div', null, h('div', { className: 'card-title', style: { marginBottom: 4 } }, 'In Stock'), h('div', { style: { fontWeight: 600 } }, num(selectedProductData.stock_quantity))),
        h('div', null, h('div', { className: 'card-title', style: { marginBottom: 4 } }, 'Barcode'), h('div', { style: { fontWeight: 600 } }, selectedProductData.barcode || '-'))
      )
      : null

    const cartContent = cart.length === 0
      ? h('div', {
          style: {
            padding: 20,
            border: '1px dashed var(--border)',
            borderRadius: 'var(--radius-md)',
            color: 'var(--text-light)',
            background: 'var(--cream-white)'
          }
        }, 'No items in cart yet. Search for a product above and add it to start the sale.')
      : h('div', { className: 'table-wrap' }, h('table', null,
          h('thead', null, h('tr', null, h('th', null, 'Product'), h('th', null, 'Price'), h('th', null, 'Qty'), h('th', null, 'Subtotal'), h('th', null, ''))),
          h('tbody', null, cart.map((item, index) => h('tr', { key: `${item.product_id}-${index}` },
            h('td', null, h('div', { style: { fontWeight: 600 } }, item.name), item.sku && h('div', { style: { fontSize: 11, color: 'var(--text-light)' } }, item.sku)),
            h('td', null, h('input', { type: 'number', min: '0', step: '0.01', value: item.unit_price, onChange: (e) => updateCartPrice(index, e.target.value), style: { width: 86, padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)' } })),
            h('td', null, h('input', { type: 'number', min: '1', value: item.quantity, onChange: (e) => updateCartQty(index, e.target.value), style: { width: 60, padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)' } })),
            h('td', { style: { fontWeight: 600 } }, fmt(num(item.unit_price) * num(item.quantity))),
            h('td', null, h('button', { className: 'btn btn-danger', onClick: () => removeCartItem(index), style: { padding: '4px 8px', fontSize: 12 } }, 'X'))
          )))
        ))

    return h('div', { style: { display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 360px', gap: 20, alignItems: 'start' } },
      h('div', null,
        h('div', { className: 'card', style: { marginBottom: 16 } },
          h('div', { className: 'card-header', style: { marginBottom: 18 } },
            h('h3', null, 'Build Order'),
            h('span', { style: { fontSize: 12, color: 'var(--text-light)' } }, `${filteredProducts.length} product match${filteredProducts.length === 1 ? '' : 'es'}`)
          ),
          h('div', { style: { display: 'grid', gridTemplateColumns: 'minmax(0,2.4fr) minmax(140px,0.9fr) minmax(150px,0.8fr) 88px', gap: 14, alignItems: 'start' } },
            h('div', { className: 'form-group', style: { marginBottom: 0, position: 'relative' } },
              h('label', { className: 'form-label' }, 'Product Search'),
              h('input', {
                className: 'form-input',
                value: search,
                onChange: (e) => handleProductSearch(e.target.value),
                onFocus: () => setProductDropdownOpen(true),
                onKeyDown: (e) => {
                  if (e.key === 'Enter' && filteredProducts.length) {
                    e.preventDefault()
                    chooseProduct(filteredProducts[0])
                  }
                },
                placeholder: 'Search by name, SKU, or barcode',
                autoComplete: 'off'
              }),
              productDropdownOpen && h('div', {
                style: {
                  position: 'absolute',
                  top: 'calc(100% + 6px)',
                  left: 0,
                  right: 0,
                  zIndex: 40,
                  background: 'var(--white)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-md)',
                  boxShadow: 'var(--shadow-lg)',
                  maxHeight: 260,
                  overflowY: 'auto'
                }
              }, dropdownContent),
              productDropdownOpen && h('div', {
                style: { position: 'fixed', inset: 0, zIndex: 30 },
                onMouseDown: () => setProductDropdownOpen(false)
              }),
              h('div', { style: { marginTop: 6, minHeight: 32, fontSize: 12, lineHeight: 1.35, color: products.length ? 'var(--text-light)' : 'var(--warning)' } }, products.length
                ? (selectedProductData ? 'Product selected. You can still override the price before adding it to cart.' : 'Focus or type to see the product list and load the current price.')
                : 'No products are available in POS yet. Check product access or refresh inventory data.')
            ),
            h('div', { className: 'form-group', style: { marginBottom: 0 } },
              h('label', { className: 'form-label' }, 'Price'),
              h('input', { className: 'form-input', type: 'number', min: '0', step: '0.01', value: price, onChange: (e) => setPrice(e.target.value), placeholder: '0.00' }),
              h('div', { style: { marginTop: 6, minHeight: 32, fontSize: 12, lineHeight: 1.35, color: 'var(--text-light)' } }, selectedProductData ? `Default price: ${fmt(selectedProductData.price)}` : 'Price fills automatically after product selection.')
            ),
            h('div', { className: 'form-group', style: { marginBottom: 0 } },
              h('label', { className: 'form-label' }, 'Qty'),
              h('input', { className: 'form-input', type: 'number', min: '1', value: qty, onChange: (e) => setQty(e.target.value) }),
              h('div', { style: { marginTop: 6, minHeight: 32, fontSize: 12, lineHeight: 1.35, color: qtyValidationError ? 'var(--error)' : 'var(--text-light)' } }, qtyValidationError || (selectedProductData ? `${Math.max(stock(selectedProductData.id) - cartQty(selectedProductData.id), 0)} available to add` : 'Enter the quantity to add'))
            ),
            h('button', { className: 'btn btn-primary', onClick: addToCart, disabled: !selectedProduct || !!qtyValidationError || loading, style: { height: 42, width: '100%', alignSelf: 'end', marginTop: 31 } }, 'Add')
          ),
          selectedMeta
        ),
        h('div', { className: 'card' },
          h('div', { className: 'card-header', style: { marginBottom: 12 } },
            h('h3', null, `Cart (${cartItemCount} item(s))`),
            h('span', { style: { fontSize: 12, color: 'var(--text-light)' } }, cart.length ? `${cart.length} line item(s)` : 'Ready for first item')
          ),
          cartContent
        )
      ),
      h('div', null,
        h('div', { className: 'card', style: { position: 'sticky', top: 80 } },
          h('h3', { style: { marginBottom: 12 } }, 'POS Summary'),
          h('div', { className: 'form-group' },
            h('label', { className: 'form-label' }, 'Customer'),
            h('select', { className: 'form-input', value: customerId, onChange: (e) => setCustomerId(e.target.value) },
              h('option', { value: '' }, 'Walk-in'),
              ...customers.map((customer) => h('option', { key: customer.id, value: customer.id }, customer.name))
            )
          ),
          h('div', { className: 'form-group' },
            h('label', { className: 'form-label' }, 'Payment Method'),
            h('select', { className: 'form-input', value: paymentMethod, onChange: (e) => setPaymentMethod(e.target.value) },
              ...(config.payment_methods || ['cash']).map((method) => h('option', { key: method, value: method }, method))
            )
          ),
          h('div', { className: 'form-group' },
            h('label', { className: 'form-label' }, 'Discount (%)'),
            h('input', { className: 'form-input', type: 'number', min: '0', max: '100', step: '0.01', value: discountPercentage, onChange: (e) => setDiscountPercentage(e.target.value) }),
            h('div', { style: { fontSize: 11, color: 'var(--text-light)', marginTop: 4 } }, 'Discount is percentage-based. Tax is auto-computed.')
          ),
          h('div', { style: { borderTop: '1px solid var(--border)', paddingTop: 12, marginTop: 12 } },
            h('div', { style: { display: 'flex', justifyContent: 'space-between' } }, h('span', null, 'Subtotal'), h('span', null, fmt(subtotal))),
            h('div', { style: { display: 'flex', justifyContent: 'space-between', color: discountAmount > 0 ? 'var(--error)' : 'inherit' } }, h('span', null, `Discount (${discountPct.toFixed(2)}%)`), h('span', null, `-${fmt(discountAmount)}`)),
            h('div', { style: { display: 'flex', justifyContent: 'space-between' } }, h('span', null, `Tax (${num(config.tax_rate_percentage).toFixed(2)}%)`), h('span', null, `+${fmt(taxAmount)}`)),
            h('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: 20, fontWeight: 700, color: 'var(--gold-dark)', marginTop: 8 } }, h('span', null, 'Total'), h('span', null, fmt(total)))
          ),
          h('button', { className: 'btn btn-primary', onClick: startPayment, disabled: !cart.length || loading, style: { width: '100%', marginTop: 16, padding: 14 } }, 'Proceed To Accept Payment')
        )
      )
    )
  }

  function renderPayment() {
    return h('div', { style: { display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 340px', gap: 20 } },
      h('div', null,
        h('div', { className: 'card', style: { marginBottom: 16 } },
          h('h3', { style: { marginBottom: 12 } }, 'Accept Payment'),
          pendingOrder
            ? h(React.Fragment, null,
                h('div', { className: 'table-wrap', style: { marginBottom: 16 } }, h('table', null,
                  h('thead', null, h('tr', null, h('th', null, 'Item'), h('th', null, 'Qty'), h('th', null, 'Unit'), h('th', null, 'Subtotal'))),
                  h('tbody', null, pendingOrder.items.map((item, index) => h('tr', { key: `${item.product_id}-${index}` }, h('td', null, item.name), h('td', null, item.quantity), h('td', null, fmt(item.unit_price)), h('td', { style: { fontWeight: 600 } }, fmt(item.unit_price * item.quantity)))))
                )),
                h('div', { className: 'form-group' }, h('label', { className: 'form-label' }, 'Amount Received'), h('input', { className: 'form-input', type: 'number', min: pendingOrder.total, step: '0.01', value: paymentAmount, onChange: (e) => setPaymentAmount(e.target.value) })),
                pendingOrder.payment_method !== 'cash' && h('div', { className: 'form-group' }, h('label', { className: 'form-label' }, 'Payment Reference'), h('input', { className: 'form-input', value: paymentReference, onChange: (e) => setPaymentReference(e.target.value) })),
                h('div', { style: { display: 'flex', gap: 8 } },
                  h('button', { className: 'btn btn-secondary', onClick: () => setTab('pos') }, 'Back To POS'),
                  h('button', { className: 'btn btn-primary', onClick: completeSale, disabled: tendered < num(pendingOrder.total) || loading, style: { flex: 1 } }, loading ? 'Processing...' : 'Confirm Payment & Complete Sale')
                )
              )
            : h('p', { style: { color: 'var(--text-light)' } }, 'No pending order. Build one in POS first.')
        ),
        lastReceipt && h('div', { className: 'card' },
          h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 } }, h('h3', null, 'Latest Paid Sale'), h('button', { className: 'btn btn-secondary', onClick: printReceipt }, 'Print Receipt')),
          h('div', { ref: receiptRef },
            h('div', null,
              h('div', { style: { textAlign: 'center', marginBottom: 8 } }, h('h2', { style: { margin: 0, fontSize: 15 } }, "Cecille's N'Style"), h('div', null, 'Paid Receipt')),
              h('div', null, `Receipt: ${lastReceipt.receipt_no}`),
              h('div', null, `Sale ID: ${lastReceipt.sale_number}`),
              h('div', null, `Date: ${fmtDate(lastReceipt.date || new Date())}`),
              h('div', null, `Payment: ${lastReceipt.payment_method}`),
              h('div', null, `Received: ${fmt(lastReceipt.amount_received)}`),
              h('div', null, `Change: ${fmt(lastReceipt.change_amount)}`),
              ...(lastReceipt.items || []).map((item, index) => h('div', { key: `${item.id || index}` }, `${item.product_name || item.productName || 'Item'} x${item.quantity || item.qty} - ${fmt(item.line_total || item.lineTotal)}`)),
              h('div', { style: { marginTop: 8, fontWeight: 700 } }, `TOTAL: ${fmt(lastReceipt.total)}`)
            )
          )
        )
      ),
      h('div', null, h('div', { className: 'card', style: { position: 'sticky', top: 80 } },
        h('h3', { style: { marginBottom: 12 } }, 'Payment Validation'),
        pendingOrder
          ? h(React.Fragment, null,
              h('div', { style: { display: 'flex', justifyContent: 'space-between' } }, h('span', null, 'Total Due'), h('strong', null, fmt(pendingOrder.total))),
              h('div', { style: { display: 'flex', justifyContent: 'space-between' } }, h('span', null, 'Amount Received'), h('strong', null, fmt(tendered))),
              h('div', { style: { display: 'flex', justifyContent: 'space-between', color: tendered >= num(pendingOrder.total) ? '#15803d' : '#b42318', marginBottom: 8 } }, h('span', null, 'Change'), h('strong', null, fmt(change))),
              h('p', { style: { fontSize: 12, color: tendered >= num(pendingOrder.total) ? '#15803d' : '#b42318' } }, tendered >= num(pendingOrder.total) ? 'Payment is valid. Completing the sale will generate the receipt and sales record.' : 'Payment must cover the total before the sale can be completed.')
            )
          : h('p', { style: { color: 'var(--text-light)' } }, 'Payment summary appears here after you proceed from POS.')
      ))
    )
  }

  function renderHistory() {
    return h('div', null,
      viewSale && h('div', { className: 'card', style: { marginBottom: 16 } },
        h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 } }, h('h3', null, `Sale Details - ${viewSale.sale_number}`), h('button', { className: 'btn btn-secondary', onClick: () => setViewSale(null) }, 'Close')),
        h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 12, marginBottom: 12 } },
          h('div', null, h('strong', null, 'Receipt: '), viewSale.receipt_no),
          h('div', null, h('strong', null, 'Payment: '), viewSale.payment_method),
          h('div', null, h('strong', null, 'Return: '), viewSale.return_status),
          h('div', null, h('strong', null, 'Received: '), fmt(viewSale.amount_received)),
          h('div', null, h('strong', null, 'Change: '), fmt(viewSale.change_amount)),
          h('div', null, h('strong', null, 'Date: '), fmtDate(viewSale.date))
        ),
        h('div', { className: 'table-wrap' }, h('table', null,
          h('thead', null, h('tr', null, h('th', null, 'Product'), h('th', null, 'Qty'), h('th', null, 'Returned'), h('th', null, 'Available'), h('th', null, 'Line Total'))),
          h('tbody', null, (viewSale.items || []).map((item) => h('tr', { key: item.id }, h('td', null, item.product_name || '—'), h('td', null, item.qty), h('td', null, item.returned_qty || 0), h('td', null, item.available_to_return || 0), h('td', { style: { fontWeight: 600 } }, fmt(item.line_total)))))
        ))
      ),
      h('div', { className: 'table-wrap' }, h('table', null,
        h('thead', null, h('tr', null, h('th', null, 'Sale ID'), h('th', null, 'Receipt ID'), h('th', null, 'Date'), h('th', null, 'Total'), h('th', null, 'Payment'), h('th', null, 'Return'), h('th', null, 'Actions'))),
        h('tbody', null, sales.map((sale) => h('tr', { key: sale.id },
          h('td', { style: { fontWeight: 600 } }, sale.sale_number),
          h('td', null, sale.receipt_no),
          h('td', null, fmtDate(sale.date)),
          h('td', { style: { fontWeight: 600 } }, fmt(sale.total)),
          h('td', null, sale.payment_method),
          h('td', null, sale.return_status),
          h('td', null, h('div', { style: { display: 'flex', gap: 6, flexWrap: 'wrap' } },
            h('button', { className: 'btn btn-secondary', onClick: () => showSale(sale.id), style: { padding: '4px 10px', fontSize: 12 } }, 'View'),
            can(permissions, 'sales.refund') && h('button', { className: 'btn btn-secondary', onClick: () => { setReturnReceiptNo(sale.receipt_no); setTab('returns'); setTimeout(() => lookupReceipt(sale.receipt_no), 0) }, style: { padding: '4px 10px', fontSize: 12 } }, 'Use Receipt'),
            can(permissions, 'sales.refund') && sale.return_status !== 'FULL' && h('button', { className: 'btn btn-danger', onClick: () => refundSale(sale.id), style: { padding: '4px 10px', fontSize: 12 } }, 'Full Refund')
          ))
        )))
      ))
    )
  }

  function renderTransactions() {
    return h('div', null,
      h('div', { className: 'card', style: { marginBottom: 16 } },
        h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 12, alignItems: 'end' } },
          h('div', { className: 'form-group', style: { marginBottom: 0 } },
            h('label', { className: 'form-label' }, 'Type'),
            h('select', { className: 'form-input', value: transactionType, onChange: (e) => setTransactionType(e.target.value) },
              h('option', { value: '' }, 'All'),
              h('option', { value: 'SALE_PAYMENT' }, 'Sale Payment'),
              h('option', { value: 'SALE_RETURN' }, 'Sale Return')
            )
          ),
          h('div', { className: 'form-group', style: { marginBottom: 0 } },
            h('label', { className: 'form-label' }, 'Receipt ID'),
            h('input', { className: 'form-input', value: transactionReceipt, onChange: (e) => setTransactionReceipt(e.target.value) })
          ),
          h('button', { className: 'btn btn-primary', onClick: fetchTransactions }, 'Refresh')
        )
      ),
      h('div', { className: 'table-wrap' }, h('table', null,
        h('thead', null, h('tr', null, h('th', null, 'Type'), h('th', null, 'Receipt'), h('th', null, 'Date'), h('th', null, 'Amount'), h('th', null, 'Details'), h('th', null, 'User'))),
        h('tbody', null, transactions.length === 0 ? h('tr', null, h('td', { colSpan: 6, style: { textAlign: 'center', color: 'var(--text-light)', padding: 24 } }, 'No transactions found.')) : transactions.map((txn) => h('tr', { key: txn.transaction_id },
          h('td', null, txn.type),
          h('td', null, h('div', { style: { fontWeight: 600 } }, txn.receipt_no || '—'), txn.sale_number && h('div', { style: { fontSize: 11, color: 'var(--text-light)' } }, txn.sale_number)),
          h('td', null, fmtDate(txn.created_at)),
          h('td', { style: { fontWeight: 600 } }, fmt(txn.amount)),
          h('td', null, txn.type === 'SALE_PAYMENT' ? `${txn.payment_method} • Received ${fmt(txn.amount_received)} • Change ${fmt(txn.change_amount)}` : `${txn.product_name || 'Returned item'} • Qty ${txn.quantity}`),
          h('td', null, txn.user_name || '—')
        )))
      ))
    )
  }

  function renderReturns() {
    return h('div', { style: { display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 320px', gap: 20 } },
      h('div', null,
        h('div', { className: 'card', style: { marginBottom: 16 } },
          h('h3', { style: { marginBottom: 12 } }, 'Receipt Lookup'),
          h('div', { style: { display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, alignItems: 'end' } },
            h('div', { className: 'form-group', style: { marginBottom: 0 } }, h('label', { className: 'form-label' }, 'Receipt ID'), h('input', { className: 'form-input', value: returnReceiptNo, onChange: (e) => setReturnReceiptNo(e.target.value) })),
            h('button', { className: 'btn btn-primary', onClick: lookupReceipt }, 'Load Receipt')
          )
        ),
        returnLookup && h('div', { className: 'card' },
          h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 } }, h('h3', null, `Return Items - ${returnLookup.receipt_no}`), h('span', { style: { fontSize: 12, color: 'var(--text-light)' } }, returnLookup.return_status)),
          h('div', { className: 'table-wrap' }, h('table', null,
            h('thead', null, h('tr', null, h('th', null, 'Product'), h('th', null, 'Bought'), h('th', null, 'Returned'), h('th', null, 'Available'), h('th', null, 'Return Qty'))),
            h('tbody', null, (returnLookup.items || []).map((item) => h('tr', { key: item.id },
              h('td', null, item.product_name || '—'),
              h('td', null, item.qty),
              h('td', null, item.returned_qty || 0),
              h('td', { style: { fontWeight: 600 } }, item.available_to_return || 0),
              h('td', null, h('input', {
                type: 'number',
                min: '0',
                max: item.available_to_return || 0,
                value: returnQuantities[item.id] || '',
                disabled: !item.available_to_return,
                onChange: (e) => {
                  const value = num(e.target.value)
                  if (value > num(item.available_to_return)) return setError(`Cannot return more than ${item.available_to_return} for ${item.product_name}`)
                  setReturnQuantities((prev) => ({ ...prev, [item.id]: e.target.value }))
                },
                style: { width: 80 }
              }))
            )))
          )),
          h('div', { className: 'form-group', style: { marginTop: 16 } }, h('label', { className: 'form-label' }, 'Reason'), h('textarea', { className: 'form-input', rows: 3, value: returnReason, onChange: (e) => setReturnReason(e.target.value) })),
          h('button', { className: 'btn btn-primary', onClick: submitReturn, disabled: loading }, loading ? 'Processing...' : 'Process Return')
        )
      ),
      h('div', null, h('div', { className: 'card', style: { position: 'sticky', top: 80 } },
        h('h3', { style: { marginBottom: 12 } }, 'Return Rules'),
        h('ul', { style: { paddingLeft: 18, margin: 0, display: 'grid', gap: 8, color: 'var(--text-mid)' } },
          h('li', null, 'Returns require a valid receipt ID.'),
          h('li', null, 'Product details load automatically from the receipt.'),
          h('li', null, 'You cannot return more than the quantity still available to return.'),
          h('li', null, 'Successful returns update inventory and transaction logs automatically.')
        )
      ))
    )
  }

  function renderReport() {
    if (!report) return h('div', { className: 'card' }, 'No report data yet.')
    return h('div', null,
      h('div', { className: 'card', style: { marginBottom: 16 } },
        h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 12, alignItems: 'end' } },
          h('div', { className: 'form-group', style: { marginBottom: 0 } }, h('label', { className: 'form-label' }, 'From'), h('input', { className: 'form-input', type: 'date', value: reportFrom, onChange: (e) => setReportFrom(e.target.value) })),
          h('div', { className: 'form-group', style: { marginBottom: 0 } }, h('label', { className: 'form-label' }, 'To'), h('input', { className: 'form-input', type: 'date', value: reportTo, onChange: (e) => setReportTo(e.target.value) })),
          h('button', { className: 'btn btn-primary', onClick: fetchReport }, 'Refresh Report')
        )
      ),
      h('div', { className: 'dashboard-grid' },
        StatCard('Completed Sales', report.total_sales || 0),
        StatCard('Gross Revenue', fmt(report.total_revenue)),
        StatCard('Returns', fmt(report.total_returns), { color: 'var(--error)' }),
        StatCard('Net Revenue', fmt(report.net_revenue))
      ),
      h('h3', { style: { marginTop: 20, marginBottom: 12 } }, 'By Payment Method'),
      h('div', { className: 'table-wrap' }, h('table', null,
        h('thead', null, h('tr', null, h('th', null, 'Method'), h('th', null, 'Transactions'), h('th', null, 'Sales Total'), h('th', null, 'Received'), h('th', null, 'Change Given'))),
        h('tbody', null, (report.by_payment_method || []).map((item) => h('tr', { key: item.payment_method || 'unknown' }, h('td', { style: { fontWeight: 600 } }, item.payment_method || '—'), h('td', null, item.count), h('td', { style: { fontWeight: 600 } }, fmt(item.total)), h('td', null, fmt(item.amount_received)), h('td', null, fmt(item.change_given)))))
      )),
      h('h3', { style: { marginTop: 20, marginBottom: 12 } }, 'Top Products'),
      h('div', { className: 'table-wrap' }, h('table', null,
        h('thead', null, h('tr', null, h('th', null, 'Product'), h('th', null, 'Net Qty'), h('th', null, 'Returned Qty'), h('th', null, 'Net Sales'))),
        h('tbody', null, (report.top_products || []).map((item) => h('tr', { key: `${item.sku || item.name}` }, h('td', null, h('div', { style: { fontWeight: 600 } }, item.name || '—'), item.sku && h('div', { style: { fontSize: 11, color: 'var(--text-light)' } }, item.sku)), h('td', null, item.net_qty), h('td', null, item.returned_qty), h('td', { style: { fontWeight: 600 } }, fmt(item.net_sales)))))
      ))
    )
  }

  return h('div', { className: 'page' },
    h('div', { className: 'page-header' }, h('div', null,
      h('h1', { className: 'page-title' }, 'Sales Management'),
      h('p', { className: 'page-subtitle' }, 'POS, accept payment, receipt-driven returns, and automated sales tracking')
    )),
    error && h('div', { className: 'error-msg', style: { marginBottom: 16 } }, error),
    success && h('div', { style: { background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#15803d', padding: '10px 14px', borderRadius: 6, marginBottom: 16 } }, success),
    h('div', { style: { display: 'flex', gap: 4, marginBottom: 20, borderBottom: '2px solid var(--border)', flexWrap: 'wrap' } },
      tabs.map((item) => h('button', { key: item.key, onClick: () => { clearMsg(); setTab(item.key) }, style: { padding: '10px 18px', border: 'none', borderBottom: tab === item.key ? '2px solid var(--gold)' : '2px solid transparent', background: 'transparent', color: tab === item.key ? 'var(--gold-dark)' : 'var(--text-mid)', fontWeight: tab === item.key ? 600 : 400, cursor: 'pointer', marginBottom: -2 } }, item.label))
    ),
    tab === 'pos' && renderPos(),
    tab === 'payment' && renderPayment(),
    tab === 'history' && renderHistory(),
    tab === 'transactions' && renderTransactions(),
    tab === 'returns' && renderReturns(),
    tab === 'report' && renderReport(),
    loading && h('div', { style: { marginTop: 16, color: 'var(--text-light)' } }, 'Loading...')
  )
}
