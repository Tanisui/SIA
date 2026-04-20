import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSelector } from 'react-redux'
import api from '../api/api.js'

function formatMoney(value) {
  return Number(value || 0).toLocaleString('en-PH', { style: 'currency', currency: 'PHP' })
}

function fmtDate(value) {
  if (!value) return '-'
  return new Date(value).toLocaleString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function cleanText(value) {
  return String(value || '').trim()
}

function normalizeText(value) {
  return cleanText(value).toLowerCase()
}

function can(perms, required) {
  if (!required) return true
  if (!Array.isArray(perms)) return false
  if (perms.includes('admin.*')) return true
  const list = Array.isArray(required) ? required : [required]
  return list.some((item) => perms.includes(item))
}

function StatCard({ label, value, tone }) {
  return (
    <div className="card" style={{ padding: 16 }}>
      <div style={{ fontSize: 12, color: 'var(--text-light)', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: tone || 'var(--text-dark)' }}>{value}</div>
    </div>
  )
}

export default function Customers() {
  const navigate = useNavigate()
  const permissions = useSelector((state) => state.auth?.permissions || JSON.parse(localStorage.getItem('permissions') || '[]'))

  const [customers, setCustomers] = useState([])
  const [selectedCustomerId, setSelectedCustomerId] = useState(null)
  const [selectedCustomer, setSelectedCustomer] = useState(null)
  const [search, setSearch] = useState('')
  const [loadingList, setLoadingList] = useState(false)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [error, setError] = useState(null)

  const filteredCustomers = useMemo(() => {
    const needle = normalizeText(search)
    if (!needle) return customers
    return customers.filter((customer) => (
      [
        customer.customer_code,
        customer.full_name,
        customer.phone,
        customer.email,
        customer.recent_items_preview
      ].some((value) => normalizeText(value).includes(needle))
    ))
  }, [customers, search])

  async function loadCustomers(preferredCustomerId = null) {
    try {
      setLoadingList(true)
      setError(null)
      const rows = (await api.get('/customers')).data || []
      const nextCustomers = Array.isArray(rows) ? rows : []
      setCustomers(nextCustomers)

      const preferredId = preferredCustomerId || selectedCustomerId
      const preferredExists = nextCustomers.some((customer) => String(customer.id) === String(preferredId))
      if (preferredExists) {
        setSelectedCustomerId(Number(preferredId))
      } else {
        setSelectedCustomerId(nextCustomers[0]?.id || null)
      }
    } catch (err) {
      setError(err?.response?.data?.error || 'Failed to load customers')
    } finally {
      setLoadingList(false)
    }
  }

  async function loadCustomerDetail(customerId) {
    if (!customerId) {
      setSelectedCustomer(null)
      return
    }

    try {
      setLoadingDetail(true)
      setError(null)
      const detail = (await api.get(`/customers/${customerId}`)).data || null
      setSelectedCustomer(detail)
    } catch (err) {
      setSelectedCustomer(null)
      setError(err?.response?.data?.error || 'Failed to load customer details')
    } finally {
      setLoadingDetail(false)
    }
  }

  useEffect(() => {
    loadCustomers()
  }, [])

  useEffect(() => {
    if (!filteredCustomers.length) return
    if (filteredCustomers.some((customer) => String(customer.id) === String(selectedCustomerId))) return
    setSelectedCustomerId(filteredCustomers[0].id)
  }, [filteredCustomers, selectedCustomerId])

  useEffect(() => {
    loadCustomerDetail(selectedCustomerId)
  }, [selectedCustomerId])

  return (
    <div className="page">
      <div className="page-header" style={{ alignItems: 'flex-start', gap: 16 }}>
        <div>
          <h1 className="page-title">Customers</h1>
          <p className="page-subtitle">Track customer purchase history and hand receipts into Sales Returns.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-secondary" onClick={() => loadCustomers()} disabled={loadingList || loadingDetail}>
            Refresh
          </button>
          {can(permissions, 'customers.create') ? (
            <button className="btn btn-primary" onClick={() => navigate('/customers/new')}>
              New Customer
            </button>
          ) : null}
        </div>
      </div>

      {error ? <div className="error-msg" style={{ marginBottom: 16 }}>{error}</div> : null}

      <div style={{ display: 'grid', gridTemplateColumns: '360px minmax(0,1fr)', gap: 20 }}>
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: 16, borderBottom: '1px solid var(--border)' }}>
            <label className="form-label">Search Customers</label>
            <input
              className="form-input"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by code, name, phone, email, or recent item"
            />
          </div>

          <div style={{ maxHeight: 'calc(100vh - 260px)', overflowY: 'auto' }}>
            {loadingList ? (
              <div style={{ padding: 20, color: 'var(--text-light)' }}>Loading customers...</div>
            ) : filteredCustomers.length === 0 ? (
              <div style={{ padding: 20, color: 'var(--text-light)' }}>No customers found.</div>
            ) : filteredCustomers.map((customer) => {
              const isActive = String(customer.id) === String(selectedCustomerId)
              return (
                <button
                  key={customer.id}
                  type="button"
                  onClick={() => setSelectedCustomerId(customer.id)}
                  style={{
                    width: '100%',
                    border: 'none',
                    borderBottom: '1px solid rgba(148, 163, 184, 0.14)',
                    background: isActive ? '#fff7ed' : '#fff',
                    textAlign: 'left',
                    padding: 16,
                    cursor: 'pointer'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <div style={{ fontWeight: 700, color: 'var(--text-dark)' }}>{customer.full_name || `Customer #${customer.id}`}</div>
                    <div style={{ fontSize: 12, color: 'var(--gold-dark)' }}>{customer.customer_code || '-'}</div>
                  </div>
                  <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text-light)' }}>
                    {[customer.phone, customer.email].filter(Boolean).join(' | ') || 'No contact details'}
                  </div>
                  <div style={{ marginTop: 10, display: 'grid', gap: 4, fontSize: 12, color: 'var(--text-mid)' }}>
                    <div>Orders: {customer.total_orders || 0}</div>
                    <div>Net Spend: {formatMoney(customer.net_spent)}</div>
                    <div style={{ color: 'var(--text-light)' }}>
                      {cleanText(customer.recent_items_preview) || 'No completed purchases yet.'}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        <div style={{ display: 'grid', gap: 20 }}>
          {!selectedCustomerId ? (
            <div className="card">No customer selected.</div>
          ) : loadingDetail && !selectedCustomer ? (
            <div className="card">Loading customer profile...</div>
          ) : !selectedCustomer ? (
            <div className="card">Customer details are unavailable.</div>
          ) : (
            <>
              <div className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 16 }}>
                  <div>
                    <h2 style={{ marginBottom: 4 }}>{selectedCustomer.full_name || `Customer #${selectedCustomer.id}`}</h2>
                    <div style={{ color: 'var(--text-light)' }}>{selectedCustomer.customer_code || 'No customer code'}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {can(permissions, 'customers.update') ? (
                      <button className="btn btn-secondary" onClick={() => navigate(`/customers/${selectedCustomer.id}/edit`)}>
                        Edit
                      </button>
                    ) : null}
                    {can(permissions, 'sales.refund') && selectedCustomer.recent_purchase_lines?.[0]?.receipt_no ? (
                      <button
                        className="btn btn-primary"
                        onClick={() => navigate(`/sales?tab=returns&receipt=${encodeURIComponent(selectedCustomer.recent_purchase_lines[0].receipt_no)}`)}
                      >
                        Use Receipt in Returns
                      </button>
                    ) : null}
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
                  <div>
                    <div style={{ fontSize: 12, color: 'var(--text-light)', marginBottom: 4 }}>Phone</div>
                    <div>{selectedCustomer.phone || '-'}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 12, color: 'var(--text-light)', marginBottom: 4 }}>Email</div>
                    <div>{selectedCustomer.email || '-'}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 12, color: 'var(--text-light)', marginBottom: 4 }}>Last Purchase</div>
                    <div>{fmtDate(selectedCustomer.last_purchase_at)}</div>
                  </div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
                <StatCard label="Total Orders" value={selectedCustomer.total_orders || 0} />
                <StatCard label="Gross Spend" value={formatMoney(selectedCustomer.gross_spent)} />
                <StatCard label="Returns Value" value={formatMoney(selectedCustomer.returns_value)} tone="var(--error)" />
                <StatCard label="Net Spend" value={formatMoney(selectedCustomer.net_spent)} tone="var(--success)" />
              </div>

              <div className="card">
                <h3 style={{ marginBottom: 12 }}>Recent Purchase Lines</h3>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Receipt</th>
                        <th>Item</th>
                        <th>Qty</th>
                        <th>Line Total</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(selectedCustomer.recent_purchase_lines || []).length === 0 ? (
                        <tr>
                          <td colSpan="6" style={{ textAlign: 'center', color: 'var(--text-light)', padding: 24 }}>
                            No purchase history yet.
                          </td>
                        </tr>
                      ) : (selectedCustomer.recent_purchase_lines || []).map((line) => (
                        <tr key={`${line.sale_item_id}-${line.sale_id}`}>
                          <td>{fmtDate(line.purchased_at)}</td>
                          <td>
                            <div style={{ fontWeight: 600 }}>{line.receipt_no || '-'}</div>
                            <div style={{ fontSize: 11, color: 'var(--text-light)' }}>{line.sale_number || '-'}</div>
                          </td>
                          <td>
                            <div style={{ fontWeight: 600 }}>{line.product_name || 'Item'}</div>
                            <div style={{ fontSize: 11, color: 'var(--text-light)' }}>
                              {[line.sku, line.brand, line.size, line.color].filter(Boolean).join(' | ') || line.barcode || '-'}
                            </div>
                          </td>
                          <td>{line.qty || 0}</td>
                          <td>{formatMoney(line.line_total)}</td>
                          <td>
                            {can(permissions, 'sales.refund') && line.receipt_no ? (
                              <button
                                className="btn btn-secondary"
                                onClick={() => navigate(`/sales?tab=returns&receipt=${encodeURIComponent(line.receipt_no)}`)}
                              >
                                Use Receipt
                              </button>
                            ) : (
                              '-'
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
