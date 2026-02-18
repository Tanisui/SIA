import React, { useEffect, useState, useCallback, useRef } from 'react'
import api from '../api/api.js'

const fmt = (n) => Number(n || 0).toLocaleString('en-PH', { style: 'currency', currency: 'PHP' })
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''

export default function Sales() {
  const [tab, setTab] = useState('pos')
  const [products, setProducts] = useState([])
  const [customers, setCustomers] = useState([])
  const [sales, setSales] = useState([])
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)

  // POS state
  const [cart, setCart] = useState([])
  const [selectedProduct, setSelectedProduct] = useState('')
  const [customPrice, setCustomPrice] = useState('')
  const [customQty, setCustomQty] = useState('1')
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [customerId, setCustomerId] = useState('')
  const [discount, setDiscount] = useState('')
  const [tax, setTax] = useState('')
  const [lastReceipt, setLastReceipt] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const receiptRef = useRef(null)

  // Report filters
  const [reportFrom, setReportFrom] = useState('')
  const [reportTo, setReportTo] = useState('')

  // View sale detail
  const [viewSale, setViewSale] = useState(null)

  const fetchProducts = useCallback(async () => {
    try { const res = await api.get('/products'); setProducts(res.data || []) } catch (e) { /* ignore */ }
  }, [])

  const fetchCustomers = useCallback(async () => {
    try { const res = await api.get('/customers'); setCustomers(res.data || []) } catch (e) { /* ignore */ }
  }, [])

  const fetchSales = useCallback(async () => {
    setLoading(true)
    try { const res = await api.get('/sales'); setSales(res.data || []) } catch (e) { /* ignore */ }
    setLoading(false)
  }, [])

  const fetchReport = useCallback(async () => {
    try {
      let url = '/sales/reports/summary'
      const params = []
      if (reportFrom) params.push(`from=${reportFrom}`)
      if (reportTo) params.push(`to=${reportTo}`)
      if (params.length) url += '?' + params.join('&')
      const res = await api.get(url)
      setReport(res.data)
    } catch (e) { /* ignore */ }
  }, [reportFrom, reportTo])

  useEffect(() => { fetchProducts(); fetchCustomers() }, [fetchProducts, fetchCustomers])
  useEffect(() => {
    if (tab === 'history') fetchSales()
    if (tab === 'report') fetchReport()
  }, [tab, fetchSales, fetchReport])

  const clearMessages = () => { setError(null); setSuccess(null) }
  const showMsg = (msg) => { setSuccess(msg); setTimeout(() => setSuccess(null), 4000) }

  // ── POS: Add product to cart ──
  const addToCart = () => {
    if (!selectedProduct) return
    const product = products.find(p => String(p.id) === String(selectedProduct))
    if (!product) return
    const qty = Number(customQty) || 1
    const price = customPrice ? Number(customPrice) : Number(product.price)

    setCart(prev => {
      const existing = prev.find(c => c.product_id === product.id && c.unit_price === price)
      if (existing) {
        return prev.map(c => c === existing ? { ...c, quantity: c.quantity + qty } : c)
      }
      return [...prev, { product_id: product.id, name: product.name, sku: product.sku, unit_price: price, quantity: qty, stock: product.stock_quantity }]
    })
    setSelectedProduct('')
    setCustomPrice('')
    setCustomQty('1')
  }

  const updateCartQty = (idx, qty) => {
    setCart(prev => prev.map((c, i) => i === idx ? { ...c, quantity: Math.max(1, qty) } : c))
  }

  const updateCartPrice = (idx, price) => {
    setCart(prev => prev.map((c, i) => i === idx ? { ...c, unit_price: Number(price) || 0 } : c))
  }

  const removeFromCart = (idx) => {
    setCart(prev => prev.filter((_, i) => i !== idx))
  }

  const subtotal = cart.reduce((s, c) => s + c.unit_price * c.quantity, 0)
  const discountAmt = Number(discount) || 0
  const taxAmt = Number(tax) || 0
  const total = subtotal - discountAmt + taxAmt

  // ── POS: Finalize order ──
  const finalizeOrder = async () => {
    clearMessages()
    if (cart.length === 0) return setError('Add items to cart first')
    try {
      const res = await api.post('/sales', {
        items: cart.map(c => ({ product_id: c.product_id, quantity: c.quantity, unit_price: c.unit_price })),
        payment_method: paymentMethod,
        customer_id: customerId ? Number(customerId) : undefined,
        discount: discountAmt,
        tax: taxAmt
      })
      setLastReceipt(res.data)
      setCart([])
      setDiscount('')
      setTax('')
      setCustomerId('')
      showMsg(`Sale ${res.data.sale_number} completed! Receipt: ${res.data.receipt_no}`)
      fetchProducts()
    } catch (err) { setError(err?.response?.data?.error || 'Sale failed') }
  }

  // ── Print receipt ──
  const printReceipt = () => {
    if (!receiptRef.current) return
    const printWindow = window.open('', '_blank', 'width=400,height=600')
    printWindow.document.write(`
      <html><head><title>Receipt</title>
      <style>
        body { font-family: 'Courier New', monospace; font-size: 12px; padding: 20px; max-width: 300px; margin: 0 auto; }
        .center { text-align: center; }
        .line { border-top: 1px dashed #000; margin: 8px 0; }
        .row { display: flex; justify-content: space-between; }
        .bold { font-weight: bold; }
        h2 { margin: 0 0 4px; font-size: 16px; }
      </style></head><body>
      ${receiptRef.current.innerHTML}
      <script>window.print(); window.close();</script>
      </body></html>
    `)
    printWindow.document.close()
  }

  // ── Refund sale ──
  const refundSale = async (id) => {
    if (!confirm('Refund this sale? Stock will be returned to inventory.')) return
    clearMessages()
    try {
      await api.post(`/sales/${id}/refund`)
      showMsg('Sale refunded successfully')
      fetchSales(); fetchProducts()
    } catch (err) { setError(err?.response?.data?.error || 'Refund failed') }
  }

  // Filter products by search
  const filteredProducts = searchTerm
    ? products.filter(p => p.name.toLowerCase().includes(searchTerm.toLowerCase()) || (p.sku && p.sku.toLowerCase().includes(searchTerm.toLowerCase())) || (p.barcode && p.barcode.includes(searchTerm)))
    : products

  const tabs = [
    { key: 'pos', label: 'Point of Sale' },
    { key: 'history', label: 'Sales History' },
    { key: 'report', label: 'Sales Report' }
  ]

  return React.createElement('div', { className: 'page' },
    React.createElement('div', { className: 'page-header' },
      React.createElement('div', null,
        React.createElement('h1', { className: 'page-title' }, 'Sales Management'),
        React.createElement('p', { className: 'page-subtitle' }, 'Process customer purchases, generate receipts & view reports')
      )
    ),

    error && React.createElement('div', { className: 'error-msg', style: { marginBottom: 16 } }, error),
    success && React.createElement('div', { style: { background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#15803d', padding: '10px 14px', borderRadius: 6, marginBottom: 16, fontSize: '13.5px' } }, success),

    // Tab bar
    React.createElement('div', { style: { display: 'flex', gap: 4, marginBottom: 20, borderBottom: '2px solid var(--border)', paddingBottom: 0 } },
      tabs.map(t => React.createElement('button', {
        key: t.key,
        onClick: () => { setTab(t.key); clearMessages() },
        style: {
          padding: '10px 20px', border: 'none', borderBottom: tab === t.key ? '2px solid var(--gold)' : '2px solid transparent',
          background: 'transparent', color: tab === t.key ? 'var(--gold-dark)' : 'var(--text-mid)',
          fontWeight: tab === t.key ? 600 : 400, cursor: 'pointer', fontSize: '13.5px', marginBottom: -2
        }
      }, t.label))
    ),

    // ═══════════════ POS ═══════════════
    tab === 'pos' && React.createElement('div', { style: { display: 'grid', gridTemplateColumns: '1fr 380px', gap: 20 } },
      // Left: Product selection + Cart
      React.createElement('div', null,
        // Add product
        React.createElement('div', { className: 'card', style: { marginBottom: 16 } },
          React.createElement('h3', { style: { marginBottom: 12 } }, 'Select Item'),
          React.createElement('div', { style: { display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: 8, alignItems: 'end' } },
            React.createElement('div', { className: 'form-group', style: { marginBottom: 0 } },
              React.createElement('label', { className: 'form-label' }, 'Product'),
              React.createElement('select', { className: 'form-input', value: selectedProduct, onChange: e => {
                setSelectedProduct(e.target.value)
                const p = products.find(pp => String(pp.id) === e.target.value)
                if (p) setCustomPrice(String(p.price || ''))
              }},
                React.createElement('option', { value: '' }, '— Select product —'),
                ...filteredProducts.map(p =>
                  React.createElement('option', { key: p.id, value: p.id },
                    `${p.sku ? p.sku + ' — ' : ''}${p.name} (${fmt(p.price)}) [Stock: ${p.stock_quantity}]`
                  )
                )
              )
            ),
            React.createElement('div', { className: 'form-group', style: { marginBottom: 0 } },
              React.createElement('label', { className: 'form-label' }, 'Price'),
              React.createElement('input', { className: 'form-input', type: 'number', step: '0.01', value: customPrice, onChange: e => setCustomPrice(e.target.value), placeholder: 'Unit price' })
            ),
            React.createElement('div', { className: 'form-group', style: { marginBottom: 0 } },
              React.createElement('label', { className: 'form-label' }, 'Qty'),
              React.createElement('input', { className: 'form-input', type: 'number', min: 1, value: customQty, onChange: e => setCustomQty(e.target.value) })
            ),
            React.createElement('button', { className: 'btn btn-primary', onClick: addToCart, style: { height: 42 } }, 'Add')
          ),
          // Search bar
          React.createElement('div', { style: { marginTop: 8 } },
            React.createElement('input', { className: 'form-input', placeholder: 'Search by name, SKU or barcode...', value: searchTerm, onChange: e => setSearchTerm(e.target.value), style: { width: '100%' } })
          )
        ),

        // Cart
        React.createElement('div', { className: 'card' },
          React.createElement('h3', { style: { marginBottom: 12 } }, 'Cart', cart.length > 0 && ` (${cart.reduce((s, c) => s + c.quantity, 0)} items)`),
          cart.length === 0
            ? React.createElement('p', { style: { color: 'var(--text-light)', textAlign: 'center', padding: 24 } }, 'No items in cart')
            : React.createElement('div', { className: 'table-wrap' },
                React.createElement('table', null,
                  React.createElement('thead', null,
                    React.createElement('tr', null,
                      React.createElement('th', null, 'Product'),
                      React.createElement('th', null, 'Price'),
                      React.createElement('th', null, 'Qty'),
                      React.createElement('th', null, 'Subtotal'),
                      React.createElement('th', null, '')
                    )
                  ),
                  React.createElement('tbody', null,
                    cart.map((c, idx) => React.createElement('tr', { key: idx },
                      React.createElement('td', null,
                        React.createElement('div', { style: { fontWeight: 500 } }, c.name),
                        c.sku && React.createElement('div', { style: { fontSize: 11, color: 'var(--text-light)' } }, c.sku)
                      ),
                      React.createElement('td', null,
                        React.createElement('input', { type: 'number', step: '0.01', value: c.unit_price, onChange: e => updateCartPrice(idx, e.target.value), style: { width: 80, padding: '4px 6px', border: '1px solid var(--border)', borderRadius: 4 } })
                      ),
                      React.createElement('td', null,
                        React.createElement('input', { type: 'number', min: 1, value: c.quantity, onChange: e => updateCartQty(idx, Number(e.target.value)), style: { width: 60, padding: '4px 6px', border: '1px solid var(--border)', borderRadius: 4 } })
                      ),
                      React.createElement('td', { style: { fontWeight: 500 } }, fmt(c.unit_price * c.quantity)),
                      React.createElement('td', null,
                        React.createElement('button', { className: 'btn btn-danger', style: { padding: '2px 8px', fontSize: 11 }, onClick: () => removeFromCart(idx) }, '✕')
                      )
                    ))
                  )
                )
              )
        )
      ),

      // Right: Order summary + receipt
      React.createElement('div', null,
        React.createElement('div', { className: 'card', style: { position: 'sticky', top: 80 } },
          React.createElement('h3', { style: { marginBottom: 12 } }, 'Order Summary'),

          // Customer
          React.createElement('div', { className: 'form-group' },
            React.createElement('label', { className: 'form-label' }, 'Customer (optional)'),
            React.createElement('select', { className: 'form-input', value: customerId, onChange: e => setCustomerId(e.target.value) },
              React.createElement('option', { value: '' }, '— Walk-in —'),
              ...customers.map(c => React.createElement('option', { key: c.id, value: c.id }, c.name))
            )
          ),

          // Payment method
          React.createElement('div', { className: 'form-group' },
            React.createElement('label', { className: 'form-label' }, 'Payment Method *'),
            React.createElement('select', { className: 'form-input', value: paymentMethod, onChange: e => setPaymentMethod(e.target.value) },
              React.createElement('option', { value: 'cash' }, 'Cash'),
              React.createElement('option', { value: 'card' }, 'Card'),
              React.createElement('option', { value: 'e-wallet' }, 'E-Wallet (GCash, Maya, etc.)')
            )
          ),

          // Discount & Tax
          React.createElement('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 } },
            React.createElement('div', { className: 'form-group' },
              React.createElement('label', { className: 'form-label' }, 'Discount'),
              React.createElement('input', { className: 'form-input', type: 'number', step: '0.01', value: discount, onChange: e => setDiscount(e.target.value), placeholder: '0.00' })
            ),
            React.createElement('div', { className: 'form-group' },
              React.createElement('label', { className: 'form-label' }, 'Tax'),
              React.createElement('input', { className: 'form-input', type: 'number', step: '0.01', value: tax, onChange: e => setTax(e.target.value), placeholder: '0.00' })
            )
          ),

          // Totals
          React.createElement('div', { style: { borderTop: '1px solid var(--border)', paddingTop: 12, marginTop: 8 } },
            React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: 14, marginBottom: 4 } },
              React.createElement('span', null, 'Subtotal'),
              React.createElement('span', null, fmt(subtotal))
            ),
            discountAmt > 0 && React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: 14, marginBottom: 4, color: 'var(--error)' } },
              React.createElement('span', null, 'Discount'),
              React.createElement('span', null, `-${fmt(discountAmt)}`)
            ),
            taxAmt > 0 && React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: 14, marginBottom: 4 } },
              React.createElement('span', null, 'Tax'),
              React.createElement('span', null, `+${fmt(taxAmt)}`)
            ),
            React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: 20, fontWeight: 700, fontFamily: "'Cormorant Garamond', serif", color: 'var(--gold-dark)', marginTop: 8 } },
              React.createElement('span', null, 'Total'),
              React.createElement('span', null, fmt(total))
            )
          ),

          // Finalize
          React.createElement('button', {
            className: 'btn btn-primary',
            style: { width: '100%', marginTop: 16, padding: '14px', fontSize: 15, fontWeight: 600 },
            onClick: finalizeOrder
          }, 'Finalize Order'),

          // Last receipt
          lastReceipt && React.createElement('div', { style: { marginTop: 16, borderTop: '1px solid var(--border)', paddingTop: 12 } },
            React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 } },
              React.createElement('h4', { style: { fontSize: 14 } }, 'Last Receipt'),
              React.createElement('button', { className: 'btn btn-secondary', style: { padding: '4px 12px', fontSize: 12 }, onClick: printReceipt }, 'Print Receipt')
            ),
            React.createElement('div', { ref: receiptRef },
              React.createElement('div', { style: { fontFamily: "'Courier New', monospace", fontSize: 12, background: '#fafafa', padding: 16, borderRadius: 6, border: '1px solid var(--border)' } },
                React.createElement('div', { style: { textAlign: 'center', marginBottom: 8 } },
                  React.createElement('h2', { style: { margin: 0, fontSize: 14 } }, "Cecille's N'Style"),
                  React.createElement('div', null, 'POS System')
                ),
                React.createElement('div', { style: { borderTop: '1px dashed #999', margin: '8px 0' } }),
                React.createElement('div', null, `Receipt: ${lastReceipt.receipt_no}`),
                React.createElement('div', null, `Sale #: ${lastReceipt.sale_number}`),
                React.createElement('div', null, `Date: ${new Date().toLocaleString()}`),
                React.createElement('div', null, `Payment: ${lastReceipt.payment_method}`),
                React.createElement('div', { style: { borderTop: '1px dashed #999', margin: '8px 0' } }),
                (lastReceipt.items || []).map((item, i) =>
                  React.createElement('div', { key: i, style: { display: 'flex', justifyContent: 'space-between' } },
                    React.createElement('span', null, `${item.productName || 'Item'} x${item.quantity}`),
                    React.createElement('span', null, fmt(item.lineTotal))
                  )
                ),
                React.createElement('div', { style: { borderTop: '1px dashed #999', margin: '8px 0' } }),
                React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between' } },
                  React.createElement('span', null, 'Subtotal'),
                  React.createElement('span', null, fmt(lastReceipt.subtotal))
                ),
                lastReceipt.discount > 0 && React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between' } },
                  React.createElement('span', null, 'Discount'),
                  React.createElement('span', null, `-${fmt(lastReceipt.discount)}`)
                ),
                lastReceipt.tax > 0 && React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between' } },
                  React.createElement('span', null, 'Tax'),
                  React.createElement('span', null, `+${fmt(lastReceipt.tax)}`)
                ),
                React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', marginTop: 4 } },
                  React.createElement('span', null, 'TOTAL'),
                  React.createElement('span', null, fmt(lastReceipt.total))
                ),
                React.createElement('div', { style: { borderTop: '1px dashed #999', margin: '8px 0' } }),
                React.createElement('div', { style: { textAlign: 'center', fontSize: 11 } }, 'Thank you for your purchase!')
              )
            )
          )
        )
      )
    ),

    // ═══════════════ SALES HISTORY ═══════════════
    tab === 'history' && React.createElement('div', null,
      loading && React.createElement('div', null, 'Loading...'),

      viewSale && React.createElement('div', { className: 'card', style: { marginBottom: 20 } },
        React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 } },
          React.createElement('h3', null, `Sale Details — ${viewSale.sale_number}`),
          React.createElement('button', { className: 'btn btn-secondary', onClick: () => setViewSale(null) }, 'Close')
        ),
        React.createElement('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 } },
          React.createElement('div', null, React.createElement('strong', null, 'Receipt: '), viewSale.receipt_no),
          React.createElement('div', null, React.createElement('strong', null, 'Date: '), fmtDate(viewSale.date)),
          React.createElement('div', null, React.createElement('strong', null, 'Clerk: '), viewSale.clerk_name || '—'),
          React.createElement('div', null, React.createElement('strong', null, 'Customer: '), viewSale.customer_name || 'Walk-in'),
          React.createElement('div', null, React.createElement('strong', null, 'Payment: '), viewSale.payment_method),
          React.createElement('div', null, React.createElement('strong', null, 'Status: '),
            React.createElement('span', { className: `badge ${viewSale.status === 'COMPLETED' ? 'badge-success' : 'badge-danger'}` }, viewSale.status)
          )
        ),
        React.createElement('div', { className: 'table-wrap' },
          React.createElement('table', null,
            React.createElement('thead', null,
              React.createElement('tr', null,
                React.createElement('th', null, 'Product'),
                React.createElement('th', null, 'SKU'),
                React.createElement('th', null, 'Qty'),
                React.createElement('th', null, 'Unit Price'),
                React.createElement('th', null, 'Line Total')
              )
            ),
            React.createElement('tbody', null,
              (viewSale.items || []).map((item, i) => React.createElement('tr', { key: i },
                React.createElement('td', null, item.product_name || '—'),
                React.createElement('td', null, item.sku || '—'),
                React.createElement('td', null, item.qty),
                React.createElement('td', null, fmt(item.unit_price)),
                React.createElement('td', { style: { fontWeight: 500 } }, fmt(item.line_total))
              ))
            )
          )
        ),
        React.createElement('div', { style: { display: 'flex', justifyContent: 'flex-end', marginTop: 12, gap: 16 } },
          React.createElement('span', null, `Subtotal: ${fmt(viewSale.subtotal)}`),
          viewSale.discount > 0 && React.createElement('span', { style: { color: 'var(--error)' } }, `Discount: -${fmt(viewSale.discount)}`),
          viewSale.tax > 0 && React.createElement('span', null, `Tax: +${fmt(viewSale.tax)}`),
          React.createElement('span', { style: { fontWeight: 700, fontSize: 16 } }, `Total: ${fmt(viewSale.total)}`)
        )
      ),

      React.createElement('div', { className: 'table-wrap' },
        React.createElement('table', null,
          React.createElement('thead', null,
            React.createElement('tr', null,
              React.createElement('th', null, 'Sale #'),
              React.createElement('th', null, 'Receipt'),
              React.createElement('th', null, 'Date'),
              React.createElement('th', null, 'Customer'),
              React.createElement('th', null, 'Items'),
              React.createElement('th', null, 'Total'),
              React.createElement('th', null, 'Payment'),
              React.createElement('th', null, 'Status'),
              React.createElement('th', null, 'Actions')
            )
          ),
          React.createElement('tbody', null,
            sales.map(s => React.createElement('tr', { key: s.id },
              React.createElement('td', { style: { fontWeight: 500 } }, s.sale_number),
              React.createElement('td', null, s.receipt_no || '—'),
              React.createElement('td', null, fmtDate(s.date)),
              React.createElement('td', null, s.customer_name || 'Walk-in'),
              React.createElement('td', null, s.items?.length || 0),
              React.createElement('td', { style: { fontWeight: 600 } }, fmt(s.total)),
              React.createElement('td', null,
                React.createElement('span', { className: `badge ${s.payment_method === 'cash' ? 'badge-success' : s.payment_method === 'card' ? 'badge-warning' : 'badge-neutral'}` }, s.payment_method)
              ),
              React.createElement('td', null,
                React.createElement('span', { className: `badge ${s.status === 'COMPLETED' ? 'badge-success' : 'badge-danger'}` }, s.status)
              ),
              React.createElement('td', null,
                React.createElement('button', { className: 'btn btn-secondary', style: { padding: '4px 10px', fontSize: 12, marginRight: 4 }, onClick: () => setViewSale(s) }, 'View'),
                s.status === 'COMPLETED' && React.createElement('button', { className: 'btn btn-danger', style: { padding: '4px 10px', fontSize: 12 }, onClick: () => refundSale(s.id) }, 'Refund')
              )
            ))
          )
        )
      )
    ),

    // ═══════════════ SALES REPORT ═══════════════
    tab === 'report' && React.createElement('div', null,
      React.createElement('div', { style: { display: 'flex', gap: 12, marginBottom: 20, alignItems: 'end' } },
        React.createElement('div', { className: 'form-group', style: { marginBottom: 0 } },
          React.createElement('label', { className: 'form-label' }, 'From'),
          React.createElement('input', { className: 'form-input', type: 'date', value: reportFrom, onChange: e => setReportFrom(e.target.value) })
        ),
        React.createElement('div', { className: 'form-group', style: { marginBottom: 0 } },
          React.createElement('label', { className: 'form-label' }, 'To'),
          React.createElement('input', { className: 'form-input', type: 'date', value: reportTo, onChange: e => setReportTo(e.target.value) })
        ),
        React.createElement('button', { className: 'btn btn-primary', onClick: fetchReport }, 'Generate Report')
      ),

      report && React.createElement(React.Fragment, null,
        React.createElement('div', { className: 'dashboard-grid' },
          React.createElement('div', { className: 'card' },
            React.createElement('div', { className: 'card-title' }, 'Total Transactions'),
            React.createElement('div', { className: 'card-value' }, report.total_transactions || 0)
          ),
          React.createElement('div', { className: 'card' },
            React.createElement('div', { className: 'card-title' }, 'Total Revenue'),
            React.createElement('div', { className: 'card-value-sm' }, fmt(report.total_revenue))
          ),
          React.createElement('div', { className: 'card' },
            React.createElement('div', { className: 'card-title' }, 'Total Discounts'),
            React.createElement('div', { className: 'card-value-sm', style: { color: 'var(--error)' } }, fmt(report.total_discounts))
          ),
          React.createElement('div', { className: 'card' },
            React.createElement('div', { className: 'card-title' }, 'Total Tax'),
            React.createElement('div', { className: 'card-value-sm' }, fmt(report.total_tax))
          )
        ),

        // By payment method
        React.createElement('h3', { style: { marginTop: 20, marginBottom: 12 } }, 'By Payment Method'),
        React.createElement('div', { className: 'table-wrap' },
          React.createElement('table', null,
            React.createElement('thead', null,
              React.createElement('tr', null,
                React.createElement('th', null, 'Payment Method'),
                React.createElement('th', null, 'Transactions'),
                React.createElement('th', null, 'Total')
              )
            ),
            React.createElement('tbody', null,
              (report.by_payment_method || []).map((pm, i) => React.createElement('tr', { key: i },
                React.createElement('td', { style: { fontWeight: 500 } },
                  React.createElement('span', { className: `badge ${pm.payment_method === 'cash' ? 'badge-success' : pm.payment_method === 'card' ? 'badge-warning' : 'badge-neutral'}` }, pm.payment_method || '—')
                ),
                React.createElement('td', null, pm.count),
                React.createElement('td', { style: { fontWeight: 500 } }, fmt(pm.total))
              ))
            )
          )
        ),

        // Top products
        React.createElement('h3', { style: { marginTop: 20, marginBottom: 12 } }, 'Top Selling Products'),
        React.createElement('div', { className: 'table-wrap' },
          React.createElement('table', null,
            React.createElement('thead', null,
              React.createElement('tr', null,
                React.createElement('th', null, '#'),
                React.createElement('th', null, 'Product'),
                React.createElement('th', null, 'SKU'),
                React.createElement('th', null, 'Units Sold'),
                React.createElement('th', null, 'Revenue')
              )
            ),
            React.createElement('tbody', null,
              (report.top_products || []).map((tp, i) => React.createElement('tr', { key: i },
                React.createElement('td', null, i + 1),
                React.createElement('td', { style: { fontWeight: 500 } }, tp.name),
                React.createElement('td', null, tp.sku || '—'),
                React.createElement('td', null, tp.total_qty),
                React.createElement('td', { style: { fontWeight: 500 } }, fmt(tp.total_sales))
              ))
            )
          )
        )
      )
    )
  )
}
