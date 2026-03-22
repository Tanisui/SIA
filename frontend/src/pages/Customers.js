import React, { useEffect, useState } from 'react'
import api from '../api/api.js'

const schema = [
  { name: 'id', label: 'ID', hidden: true },
  { name: 'name', label: 'Name' },
  { name: 'phone', label: 'Phone' },
  { name: 'email', label: 'Email' },
  { name: 'total_orders', label: 'Orders', hideInForm: true },
  { name: 'gross_spent', label: 'Gross Spend', hideInForm: true },
  { name: 'net_spent', label: 'Net Spend', hideInForm: true },
  { name: 'last_purchase_at', label: 'Last Purchase', hideInForm: true },
  { name: 'recent_items_preview', label: 'Recent Items', hideInForm: true },
  { name: 'address', label: 'Address', type: 'textarea' },
  { name: 'notes', label: 'Notes', type: 'textarea' }
]

const moneyFormatter = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP'
})

const dateFormatter = new Intl.DateTimeFormat('en-PH', {
  year: 'numeric',
  month: 'short',
  day: '2-digit'
})

function text(value) {
  return String(value || '').trim()
}

function asNumber(value) {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function asTime(value) {
  const ms = Date.parse(value)
  return Number.isFinite(ms) ? ms : 0
}

function fmtMoney(value) {
  return moneyFormatter.format(asNumber(value))
}

function fmtDate(value) {
  const ts = asTime(value)
  if (!ts) return '-'
  return dateFormatter.format(new Date(ts))
}

function truncate(value, maxLen) {
  const str = text(value)
  if (!str) return '-'
  if (str.length <= maxLen) return str
  return `${str.slice(0, maxLen - 1)}...`
}

function FieldInput({ field, value, onChange }){
  const { name, label, type } = field
  if (type === 'textarea') {
    return React.createElement('textarea', {
      className: 'form-input',
      rows: 4,
      value: value || '',
      placeholder: `Enter ${String(label || name).toLowerCase()}...`,
      onChange: e => onChange(name, e.target.value)
    })
  }
  return React.createElement('input', {
    className: 'form-input',
    value: value || '',
    placeholder: `Enter ${String(label || name).toLowerCase()}...`,
    onChange: e => onChange(name, e.target.value),
    type: type === 'number' ? 'number' : 'text'
  })
}

export default function Customers(){
  const pk = 'id'
  const [allCustomers, setAllCustomers] = useState([])
  const [displayedCustomers, setDisplayedCustomers] = useState([])
  const [loading, setLoading] = useState(false)
  const [detailsLoading, setDetailsLoading] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({})
  const [error, setError] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [sortBy, setSortBy] = useState('name')
  const [selectedCustomer, setSelectedCustomer] = useState(null)
  const [expandedSaleId, setExpandedSaleId] = useState(null)

  const fetchAll = async () => {
    setLoading(true)
    try {
      const res = await api.get('/customers')
      const data = res.data || []
      setAllCustomers(data)
      applyFiltersAndSearch(data, searchTerm, sortBy)
    } catch (err) {
      setError('Failed to load customers')
    } finally {
      setLoading(false)
    }
  }

  const applyFiltersAndSearch = (customers, search, sort) => {
    let filtered = Array.isArray(customers) ? [...customers] : []

    // Apply search filter
    if (search.trim()) {
      const term = search.toLowerCase().trim()
      filtered = filtered.filter(c =>
        text(c.name).toLowerCase().includes(term) ||
        text(c.email).toLowerCase().includes(term) ||
        text(c.phone).toLowerCase().includes(term) ||
        text(c.recent_items_preview).toLowerCase().includes(term)
      )
    }

    // Apply sorting
    filtered.sort((a, b) => {
      if (sort === 'name') return text(a.name).localeCompare(text(b.name), undefined, { sensitivity: 'base' })
      if (sort === 'email') return text(a.email).localeCompare(text(b.email), undefined, { sensitivity: 'base' })
      if (sort === 'orders') return asNumber(b.total_orders) - asNumber(a.total_orders)
      if (sort === 'gross_spent') return asNumber(b.gross_spent) - asNumber(a.gross_spent)
      if (sort === 'net_spent') return asNumber(b.net_spent) - asNumber(a.net_spent)
      if (sort === 'last_purchase_at') return asTime(b.last_purchase_at) - asTime(a.last_purchase_at)
      return 0
    })

    setDisplayedCustomers(filtered)
  }

  useEffect(() => {
    fetchAll()
  }, [])

  useEffect(() => {
    applyFiltersAndSearch(allCustomers, searchTerm, sortBy)
  }, [searchTerm, sortBy, allCustomers])

  const onChange = (name, value) => setForm(prev => ({ ...prev, [name]: value }))

  const startCreate = () => {
    setEditing('create')
    setForm({})
  }
  const startEdit = (it) => {
    setEditing('edit')
    setForm(it)
  }
  const cancel = () => {
    setEditing(null)
    setForm({})
    setError(null)
  }

  const viewPurchases = async (customer) => {
    if (!customer?.id) return
    setDetailsLoading(true)
    setError(null)
    try {
      const res = await api.get(`/customers/${customer.id}`)
      setSelectedCustomer(res.data || null)
      setExpandedSaleId(null)
    } catch (err) {
      console.error(err)
      const msg = err?.response?.data?.error || err?.message || 'Failed to load customer purchases'
      setError(String(msg))
    } finally {
      setDetailsLoading(false)
    }
  }

  const submit = async (e) => {
    e && e.preventDefault()
    setError(null)
    try {
      const payload = {
        name: form.name,
        phone: form.phone,
        email: form.email,
        address: form.address,
        notes: form.notes
      }
      if (editing === 'create') {
        await api.post('/customers', payload)
      } else {
        await api.put(`/customers/${form[pk]}`, payload)
      }
      await fetchAll()
      cancel()
    } catch (err) {
      console.error(err)
      const msg = err?.response?.data?.error || err?.message || 'Save failed'
      setError(String(msg))
    }
  }

  const remove = async (id) => {
    if (!confirm('Confirm to delete this customer')) return
    try {
      await api.delete(`/customers/${id}`)
      await fetchAll()
      setError(null)
    } catch (e) {
      console.error(e)
      const msg = e?.response?.data?.error || e.message || 'Delete failed'
      setError(String(msg))
    }
  }

  const selectedLines = Array.isArray(selectedCustomer?.recent_purchase_lines) ? selectedCustomer.recent_purchase_lines : []
  const editableFields = schema.filter(f => !f.hidden && !f.hideInForm)
  const profileSignals = ['name', 'phone', 'email', 'address', 'notes']
  const profileCompletion = Math.round(
    (profileSignals.reduce((count, key) => count + (text(form[key]) ? 1 : 0), 0) / profileSignals.length) * 100
  )
  const previewName = text(form.name) || 'Unnamed customer'
  const previewPhone = text(form.phone) || '-'
  const previewEmail = text(form.email) || '-'
  const previewAddress = truncate(form.address, 72)
  const previewNotes = truncate(form.notes, 72)
  const previewOrders = asNumber(form.total_orders)
  const previewGross = asNumber(form.gross_spent)
  const previewNet = asNumber(form.net_spent)
  const isVip = previewNet >= 5000 || previewOrders >= 5
  const saleRecords = Object.values(selectedLines.reduce((acc, line) => {
    const key = String(line.sale_id || '')
    if (!key) return acc
    if (!acc[key]) {
      acc[key] = {
        sale_id: line.sale_id,
        sale_number: line.sale_number,
        receipt_no: line.receipt_no,
        purchased_at: line.purchased_at,
        total: 0,
        lines: []
      }
    }
    acc[key].total += asNumber(line.line_total)
    acc[key].lines.push(line)
    return acc
  }, {})).sort((a, b) => asTime(b.purchased_at) - asTime(a.purchased_at))

  return React.createElement(
    'div',
    { className: 'page' },
    React.createElement(
      'div',
      { className: 'page-header' },
      React.createElement(
        'div',
        null,
        React.createElement('h1', { className: 'page-title' }, 'Customers'),
        React.createElement('p', { className: 'page-subtitle' }, 'Manage and track your customers')
      )
    ),
    React.createElement(
      'div',
      { className: 'card', style: { marginBottom: 16 } },
      React.createElement(
        'div',
        { style: { display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' } },
        React.createElement('button', { className: 'btn btn-primary', onClick: startCreate }, '+ Create new'),
        React.createElement(
          'div',
          { style: { flex: 1, minWidth: 250, display: 'flex', alignItems: 'center', gap: 8 } },
          React.createElement('input', {
            type: 'text',
            placeholder: 'Search by customer, contact, or recent items...',
            value: searchTerm,
            onChange: e => setSearchTerm(e.target.value),
            style: {
              flex: 1,
              padding: '8px 12px',
              border: '1px solid #ddd',
              borderRadius: 4,
              fontSize: 14
            }
          })
        ),

        React.createElement(
          'select',
          {
            value: sortBy,
            onChange: e => setSortBy(e.target.value),
            style: {
              padding: '8px 12px',
              border: '1px solid #ddd',
              borderRadius: 4,
              fontSize: 14,
              backgroundColor: '#fff',
              cursor: 'pointer'
            }
          },
          React.createElement('option', { value: 'name' }, 'Sort: Name'),
          React.createElement('option', { value: 'orders' }, 'Sort: Orders'),
          React.createElement('option', { value: 'gross_spent' }, 'Sort: Gross Spend'),
          React.createElement('option', { value: 'net_spent' }, 'Sort: Net Spend'),
          React.createElement('option', { value: 'last_purchase_at' }, 'Sort: Last Purchase')
        )
      ),
      error && React.createElement('div', { className: 'error-msg', style: { marginBottom: 12 } }, error),
      React.createElement(
        'div',
        { style: { color: '#666', fontSize: 13, marginBottom: 12 } },
        `Showing ${displayedCustomers.length} of ${allCustomers.length} customers`
      ),
      loading
        ? React.createElement(
          'div',
          { style: { padding: 40, textAlign: 'center', color: 'var(--text-light)' } },
          'Loading...'
        )
        : React.createElement(
          'div',
          { className: 'table-wrap' },
          React.createElement(
            'table',
            null,
            React.createElement(
              'thead',
              null,
              React.createElement(
                'tr',
                null,
                React.createElement('th', null, 'Customer'),
                React.createElement('th', null, 'Orders'),
                React.createElement('th', null, 'Last Purchase'),
                React.createElement('th', null, 'Gross Spend'),
                React.createElement('th', null, 'Net Spend'),
                React.createElement('th', null, 'Recent Items'),
                React.createElement('th', { style: { textAlign: 'right' } }, 'Actions')
              )
            ),
            React.createElement(
              'tbody',
              null,
              displayedCustomers.length === 0
                ? React.createElement(
                  'tr',
                  null,
                  React.createElement(
                    'td',
                    { colSpan: 7, style: { textAlign: 'center', padding: 20, color: '#999' } },
                    'No customers found'
                  )
                )
                : displayedCustomers.map(it =>
                  React.createElement(
                    'tr',
                    { key: it[pk] },
                    React.createElement(
                      'td',
                      null,
                      React.createElement('div', { style: { fontWeight: 700 } }, text(it.name) || '-'),
                      React.createElement('div', { style: { fontSize: 12, color: 'var(--text-light)' } }, [text(it.phone), text(it.email)].filter(Boolean).join(' | ') || '-')
                    ),
                    React.createElement('td', null, String(asNumber(it.total_orders))),
                    React.createElement('td', null, fmtDate(it.last_purchase_at)),
                    React.createElement('td', { style: { fontWeight: 700 } }, fmtMoney(it.gross_spent)),
                    React.createElement('td', { style: { fontWeight: 700 } }, fmtMoney(it.net_spent)),
                    React.createElement('td', { title: text(it.recent_items_preview) || '-' }, truncate(it.recent_items_preview, 40)),
                    React.createElement(
                      'td',
                      { style: { textAlign: 'right' } },
                      React.createElement(
                        'button',
                        {
                          className: 'btn btn-primary',
                          onClick: () => viewPurchases(it),
                          style: { marginRight: 8, padding: '6px 12px', fontSize: 12, minWidth: 116 }
                        },
                        'Sales Records'
                      ),
                      React.createElement(
                        'button',
                        { className: 'btn btn-secondary', onClick: () => startEdit(it), style: { marginRight: 8, padding: '6px 12px', fontSize: 12 } },
                        'Edit'
                      ),
                      React.createElement(
                        'button',
                        { className: 'btn btn-danger', onClick: () => remove(it[pk]), style: { padding: '6px 12px', fontSize: 12 } },
                        'Delete'
                      )
                    )
                  )
                )
            )
          )
        )
    ),
    (selectedCustomer || detailsLoading) &&
    React.createElement(
      'div',
      { className: 'card', style: { marginTop: 20 } },
      React.createElement(
        'div',
        { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 } },
        React.createElement('h3', null, detailsLoading ? 'Loading customer purchases...' : `Customer Purchases - ${text(selectedCustomer?.name) || 'Customer'}`),
        React.createElement('button', { className: 'btn btn-secondary', onClick: () => setSelectedCustomer(null) }, 'Close')
      ),
      !detailsLoading && selectedCustomer && React.createElement(
        'div',
        null,
        React.createElement(
          'div',
          {
            style: {
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: 10,
              marginBottom: 14,
              fontSize: 13
            }
          },
          React.createElement('div', null, React.createElement('strong', null, 'Orders: '), String(asNumber(selectedCustomer.total_orders))),
          React.createElement('div', null, React.createElement('strong', null, 'Gross Spend: '), fmtMoney(selectedCustomer.gross_spent)),
          React.createElement('div', null, React.createElement('strong', null, 'Net Spend: '), fmtMoney(selectedCustomer.net_spent)),
          React.createElement('div', null, React.createElement('strong', null, 'Last Purchase: '), fmtDate(selectedCustomer.last_purchase_at)),
          React.createElement('div', null, React.createElement('strong', null, 'Recent Items: '), text(selectedCustomer.recent_items_preview) || '-')
        ),
        React.createElement(
          'div',
          { className: 'table-wrap' },
          React.createElement(
            'table',
            null,
            React.createElement(
              'thead',
              null,
              React.createElement(
                'tr',
                null,
                React.createElement('th', null, 'Sale ID'),
                React.createElement('th', null, 'Receipt ID'),
                React.createElement('th', null, 'Date'),
                React.createElement('th', null, 'Total'),
                React.createElement('th', null, 'Items'),
                React.createElement('th', null, 'Action')
              )
            ),
            React.createElement(
              'tbody',
              null,
              saleRecords.length === 0
                ? React.createElement(
                  'tr',
                  null,
                  React.createElement(
                    'td',
                    { colSpan: 6, style: { textAlign: 'center', padding: 18, color: '#999' } },
                    'No sales records available'
                  )
                )
                : saleRecords.flatMap((sale) => {
                  const isOpen = String(expandedSaleId || '') === String(sale.sale_id)
                  const saleRow = React.createElement(
                    'tr',
                    { key: `sale-${sale.sale_id}` },
                    React.createElement('td', null, React.createElement('span', { style: { fontWeight: 700 } }, text(sale.sale_number) || `SALE-${sale.sale_id}`)),
                    React.createElement('td', null, text(sale.receipt_no) || '-'),
                    React.createElement('td', null, fmtDate(sale.purchased_at)),
                    React.createElement('td', { style: { fontWeight: 700 } }, fmtMoney(sale.total)),
                    React.createElement('td', null, String(sale.lines.length)),
                    React.createElement(
                      'td',
                      null,
                      React.createElement(
                        'button',
                        {
                          className: 'btn btn-secondary',
                          onClick: () => setExpandedSaleId(isOpen ? null : sale.sale_id),
                          style: { padding: '6px 12px', fontSize: 12 }
                        },
                        isOpen ? 'Hide Items' : 'More'
                      )
                    )
                  )
                  if (!isOpen) return [saleRow]
                  const detailsRow = React.createElement(
                    'tr',
                    { key: `sale-lines-${sale.sale_id}` },
                    React.createElement(
                      'td',
                      { colSpan: 6, style: { backgroundColor: 'rgba(0,0,0,0.02)', padding: 12 } },
                      React.createElement(
                        'div',
                        { className: 'table-wrap' },
                        React.createElement(
                          'table',
                          null,
                          React.createElement(
                            'thead',
                            null,
                            React.createElement(
                              'tr',
                              null,
                              React.createElement('th', null, 'Product'),
                              React.createElement('th', null, 'Variant'),
                              React.createElement('th', null, 'Qty'),
                              React.createElement('th', null, 'Unit Price'),
                              React.createElement('th', null, 'Line Total')
                            )
                          ),
                          React.createElement(
                            'tbody',
                            null,
                            sale.lines.map((line) => React.createElement(
                              'tr',
                              { key: `${sale.sale_id}-${line.sale_item_id}` },
                              React.createElement('td', null,
                                React.createElement('div', { style: { fontWeight: 600 } }, text(line.product_name) || 'Item'),
                                React.createElement('div', { style: { fontSize: 11, color: 'var(--text-light)' } }, [text(line.sku), text(line.brand), text(line.barcode)].filter(Boolean).join(' | ') || '-')
                              ),
                              React.createElement('td', null, [text(line.size), text(line.color)].filter(Boolean).join(' / ') || '-'),
                              React.createElement('td', null, String(asNumber(line.qty))),
                              React.createElement('td', null, fmtMoney(line.unit_price)),
                              React.createElement('td', { style: { fontWeight: 600 } }, fmtMoney(line.line_total))
                            ))
                          )
                        )
                      )
                    )
                  )
                  return [saleRow, detailsRow]
                })
            )
          )
        )
      )
    ),
    editing &&
    React.createElement(
      'div',
      {
        className: 'card',
        style: {
          marginTop: 20,
          background: 'linear-gradient(180deg, rgba(193,146,34,0.06) 0%, rgba(193,146,34,0.015) 100%)',
          border: '1px solid rgba(193,146,34,0.2)'
        }
      },
      React.createElement(
        'div',
        { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' } },
        React.createElement('h3', { style: { margin: 0 } }, editing === 'create' ? 'Create Customer Profile' : 'Edit Customer Profile'),
        React.createElement(
          'div',
          {
            style: {
              fontSize: 12,
              fontWeight: 700,
              color: 'var(--gold-dark)',
              background: 'rgba(193,146,34,0.12)',
              padding: '6px 10px',
              borderRadius: 999
            }
          },
          `Profile Completion: ${profileCompletion}%`
        )
      ),
      React.createElement(
        'form',
        { onSubmit: submit },
        React.createElement(
          'div',
          { style: { display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(280px, 1fr)', gap: 16, alignItems: 'start' } },
          React.createElement(
            'div',
            { style: { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 } },
            editableFields.map(f =>
              React.createElement(
                'div',
                {
                  key: f.name,
                  className: 'form-group',
                  style: f.type === 'textarea' ? { gridColumn: '1 / -1' } : undefined
                },
                React.createElement('label', { className: 'form-label' }, f.label || f.name),
                React.createElement(FieldInput, { field: f, value: form[f.name], onChange })
              )
            )
          ),
          React.createElement(
            'div',
            {
              style: {
                border: '1px solid rgba(193,146,34,0.22)',
                borderRadius: 12,
                background: 'rgba(255,255,255,0.7)',
                padding: 14
              }
            },
            React.createElement(
              'div',
              { style: { marginBottom: 10, fontWeight: 700, color: 'var(--gold-dark)' } },
              'Customer Preview'
            ),
            React.createElement('div', { style: { fontSize: 20, fontWeight: 700, marginBottom: 6 } }, previewName),
            React.createElement('div', { style: { fontSize: 13, color: 'var(--text-mid)', marginBottom: 12 } }, `${previewPhone} | ${previewEmail}`),
            React.createElement(
              'div',
              { style: { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8, marginBottom: 12 } },
              React.createElement('div', { style: { background: 'rgba(193,146,34,0.10)', borderRadius: 10, padding: '8px 10px' } },
                React.createElement('div', { style: { fontSize: 11, color: 'var(--text-light)' } }, 'Orders'),
                React.createElement('div', { style: { fontWeight: 700 } }, String(previewOrders))
              ),
              React.createElement('div', { style: { background: 'rgba(193,146,34,0.10)', borderRadius: 10, padding: '8px 10px' } },
                React.createElement('div', { style: { fontSize: 11, color: 'var(--text-light)' } }, 'Net Spend'),
                React.createElement('div', { style: { fontWeight: 700 } }, fmtMoney(previewNet || previewGross))
              )
            ),
            React.createElement('div', { style: { fontSize: 12, color: 'var(--text-mid)', marginBottom: 8 } }, React.createElement('strong', null, 'Address: '), previewAddress),
            React.createElement('div', { style: { fontSize: 12, color: 'var(--text-mid)', marginBottom: 12 } }, React.createElement('strong', null, 'Notes: '), previewNotes),
            React.createElement(
              'div',
              {
                style: {
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '6px 10px',
                  borderRadius: 999,
                  fontSize: 12,
                  fontWeight: 700,
                  background: isVip ? 'rgba(34,153,84,0.14)' : 'rgba(193,146,34,0.10)',
                  color: isVip ? '#1E7C45' : 'var(--gold-dark)'
                }
              },
              isVip ? 'VIP Buyer' : 'Standard Buyer'
            )
          )
          ),
        React.createElement(
          'div',
          {
            style: {
              marginTop: 16,
              paddingTop: 12,
              borderTop: '1px solid rgba(193,146,34,0.18)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 10,
              flexWrap: 'wrap'
            }
          },
          React.createElement('div', { style: { fontSize: 12, color: 'var(--text-light)' } }, 'Tip: keep phone and name accurate to improve sales matching.'),
          React.createElement(
            'div',
            { style: { display: 'flex', gap: 8 } },
            React.createElement('button', { type: 'button', className: 'btn btn-secondary', onClick: cancel }, 'Cancel'),
            React.createElement('button', { type: 'submit', className: 'btn btn-primary' }, editing === 'create' ? 'Create Customer' : 'Save Changes')
          )
        )
      )
    )
  )
}
