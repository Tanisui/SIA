import React, { useCallback, useEffect, useState } from 'react'
import api from '../api/api.js'

const fmt = (n) => Number(n || 0).toLocaleString('en-PH', { style: 'currency', currency: 'PHP' })

export default function Purchasing() {
  const [suppliers, setSuppliers] = useState([])
  const [products, setProducts] = useState([])
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)

  const [form, setForm] = useState({
    supplier_id: '',
    expected_date: '',
    items: [{ product_id: '', quantity: '', unit_cost: '' }]
  })

  const clearMessages = () => {
    setError(null)
    setSuccess(null)
  }

  const showMsg = (msg) => {
    setSuccess(msg)
    setTimeout(() => setSuccess(null), 4000)
  }

  const fetchPOs = useCallback(async () => {
    try {
      const res = await api.get('/purchase-orders')
      setOrders(res.data || [])
    } catch (e) {
      setError('Failed to load purchase orders')
    }
  }, [])

  const fetchLookups = useCallback(async () => {
    setLoading(true)
    try {
      const [supplierRes, productRes] = await Promise.all([
        api.get('/suppliers'),
        api.get('/products')
      ])
      setSuppliers(supplierRes.data || [])
      setProducts(productRes.data || [])
    } catch (e) {
      setError('Failed to load suppliers/products')
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchLookups()
    fetchPOs()
  }, [fetchLookups, fetchPOs])

  const addItem = () => {
    setForm((prev) => ({ ...prev, items: [...prev.items, { product_id: '', quantity: '', unit_cost: '' }] }))
  }

  const removeItem = (idx) => {
    setForm((prev) => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== idx)
    }))
  }

  const updateItem = (idx, field, value) => {
    setForm((prev) => {
      const items = [...prev.items]
      items[idx] = { ...items[idx], [field]: value }
      if (field === 'product_id' && value) {
        const product = products.find((p) => String(p.id) === String(value))
        if (product && product.cost) items[idx].unit_cost = String(product.cost)
      }
      return { ...prev, items }
    })
  }

  const createPO = async (e) => {
    e.preventDefault()
    clearMessages()

    if (!form.supplier_id) {
      setError('Supplier is required for purchase orders')
      return
    }

    const items = form.items
      .filter((it) => it.product_id && Number(it.quantity) > 0)
      .map((it) => ({
        product_id: Number(it.product_id),
        quantity: Number(it.quantity),
        unit_cost: Number(it.unit_cost) || 0
      }))

    if (!items.length) {
      setError('Add at least one valid item')
      return
    }

    try {
      await api.post('/purchase-orders', {
        supplier_id: Number(form.supplier_id),
        expected_date: form.expected_date || undefined,
        items
      })
      showMsg('Purchase order created successfully')
      setForm({ supplier_id: '', expected_date: '', items: [{ product_id: '', quantity: '', unit_cost: '' }] })
      fetchPOs()
    } catch (err) {
      setError(err?.response?.data?.error || 'Create purchase order failed')
    }
  }

  return React.createElement('div', { className: 'page' },
    React.createElement('div', { className: 'page-header' },
      React.createElement('div', null,
        React.createElement('h1', { className: 'page-title' }, 'Purchasing / Purchase Orders'),
        React.createElement('p', { className: 'page-subtitle' }, 'Supplier-based purchasing workflow. Direct purchase without supplier is handled in Inventory > Stock In.')
      )
    ),

    error && React.createElement('div', { className: 'error-msg', style: { marginBottom: 16 } }, error),
    success && React.createElement('div', {
      style: { background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#15803d', padding: '10px 14px', borderRadius: 6, marginBottom: 16, fontSize: '13.5px' }
    }, success),

    React.createElement('div', { className: 'card', style: { marginBottom: 20 } },
      React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 } },
        React.createElement('h3', null, 'Create Purchase Order'),
        React.createElement('button', { className: 'btn btn-secondary', type: 'button', onClick: fetchLookups }, 'Refresh Suppliers')
      ),
      React.createElement('form', { onSubmit: createPO },
        React.createElement('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 } },
          React.createElement('div', { className: 'form-group' },
            React.createElement('label', { className: 'form-label' }, 'Supplier *'),
            React.createElement('select', {
              className: 'form-input',
              required: true,
              value: form.supplier_id,
              onChange: (e) => setForm((prev) => ({ ...prev, supplier_id: e.target.value }))
            },
            React.createElement('option', { value: '' }, '— Select supplier —'),
            ...suppliers.map((s) => React.createElement('option', { key: s.id, value: s.id }, s.name))
            )
          ),
          React.createElement('div', { className: 'form-group' },
            React.createElement('label', { className: 'form-label' }, 'Expected Delivery Date'),
            React.createElement('input', {
              className: 'form-input',
              type: 'date',
              value: form.expected_date,
              onChange: (e) => setForm((prev) => ({ ...prev, expected_date: e.target.value }))
            })
          )
        ),

        React.createElement('h4', { style: { margin: '10px 0' } }, 'Items'),
        form.items.map((item, idx) => React.createElement('div', {
          key: idx,
          style: { display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: 8, marginBottom: 8 }
        },
        React.createElement('select', {
          className: 'form-input',
          value: item.product_id,
          onChange: (e) => updateItem(idx, 'product_id', e.target.value)
        },
        React.createElement('option', { value: '' }, '— Product —'),
        ...products.map((p) => React.createElement('option', { key: p.id, value: p.id }, `${p.sku ? p.sku + ' — ' : ''}${p.name}`))
        ),
        React.createElement('input', {
          className: 'form-input',
          type: 'number',
          min: 1,
          placeholder: 'Qty',
          value: item.quantity,
          onChange: (e) => updateItem(idx, 'quantity', e.target.value)
        }),
        React.createElement('input', {
          className: 'form-input',
          type: 'number',
          step: '0.01',
          placeholder: 'Unit cost',
          value: item.unit_cost,
          onChange: (e) => updateItem(idx, 'unit_cost', e.target.value)
        }),
        React.createElement('button', {
          className: 'btn btn-danger',
          type: 'button',
          onClick: () => removeItem(idx),
          style: { padding: '8px 10px' }
        }, '✕')
        )),

        React.createElement('div', { style: { display: 'flex', gap: 8, marginTop: 10 } },
          React.createElement('button', { type: 'button', className: 'btn btn-secondary', onClick: addItem }, '+ Add Item'),
          React.createElement('button', { type: 'submit', className: 'btn btn-primary' }, 'Create Purchase Order')
        )
      )
    ),

    React.createElement('div', { className: 'card' },
      React.createElement('h3', { style: { marginBottom: 12 } }, loading ? 'Purchase Orders (loading...)' : 'Purchase Orders'),
      React.createElement('div', { className: 'table-wrap' },
        React.createElement('table', null,
          React.createElement('thead', null,
            React.createElement('tr', null,
              React.createElement('th', null, 'PO #'),
              React.createElement('th', null, 'Supplier'),
              React.createElement('th', null, 'Status'),
              React.createElement('th', null, 'Expected'),
              React.createElement('th', null, 'Total')
            )
          ),
          React.createElement('tbody', null,
            orders.length === 0
              ? React.createElement('tr', null,
                  React.createElement('td', { colSpan: 5, style: { textAlign: 'center', color: 'var(--text-light)', padding: 20 } }, 'No purchase orders yet')
                )
              : orders.map((po) => React.createElement('tr', { key: po.id },
                  React.createElement('td', { style: { fontWeight: 600 } }, po.po_number),
                  React.createElement('td', null, po.supplier_name || '—'),
                  React.createElement('td', null, po.status),
                  React.createElement('td', null, po.expected_date ? new Date(po.expected_date).toLocaleDateString() : '—'),
                  React.createElement('td', null, fmt(po.total))
                ))
          )
        )
      )
    )
  )
}
