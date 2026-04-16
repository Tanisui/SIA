import React, { useEffect, useMemo, useState } from 'react'
import api from '../api/api.js'

const MODULE_OPTIONS = [
  { value: '', label: 'All areas' },
  { value: 'inventory', label: 'Inventory' },
  { value: 'sales', label: 'Sales' },
  { value: 'access', label: 'Access' },
  { value: 'purchasing', label: 'Purchasing' },
  { value: 'system', label: 'System' },
  { value: 'catalog', label: 'Catalog' },
  { value: 'customers', label: 'Customers' },
  { value: 'finance', label: 'Finance' },
  { value: 'other', label: 'Other' }
]

const LIMIT_OPTIONS = [25, 50, 100]

const SEVERITY_OPTIONS = [
  { value: '', label: 'All priority' },
  { value: 'info', label: 'Low' },
  { value: 'warning', label: 'Medium' },
  { value: 'critical', label: 'High' }
]

const ACTION_OPTIONS = [
  { value: '', label: 'All activities' },
  { value: 'SALE_CREATED', label: 'Sale Started' },
  { value: 'SALE_COMPLETED', label: 'Sale Finished' },
  { value: 'SALE_VOIDED', label: 'Sale Canceled' },
  { value: 'SALE_RETURN', label: 'Sale Returned' },
  { value: 'SALE_REFUND', label: 'Refund Processed' },
  { value: 'DISCOUNT_APPLIED', label: 'Discount Applied' },
  { value: 'PRICE_OVERRIDE_USED', label: 'Price Changed at Checkout' },
  { value: 'INVENTORY_ADJUSTED', label: 'Stock Count Changed' },
  { value: 'INVENTORY_STOCK_IN', label: 'Stock Received' },
  { value: 'INVENTORY_DAMAGE_OUT', label: 'Inventory Damaged' },
  { value: 'INVENTORY_SHRINKAGE_OUT', label: 'Inventory Shrinkage' },
  { value: 'PRODUCT_CREATED', label: 'Product Added' },
  { value: 'PRODUCT_UPDATED', label: 'Product Updated' },
  { value: 'PRODUCT_DELETED', label: 'Product Deleted' },
  { value: 'SUPPLIER_CREATED', label: 'Supplier Added' },
  { value: 'BALE_PURCHASE_CREATED', label: 'Purchase Saved' },
  { value: 'PURCHASE_ORDER_RECEIVED', label: 'Order Received' },
  { value: 'USER_CREATED', label: 'User Created' },
  { value: 'USER_UPDATED', label: 'User Updated' },
  { value: 'USER_DELETED', label: 'User Deleted' },
  { value: 'ROLE_CHANGED', label: 'Role Changed' },
  { value: 'ROLE_UPDATED', label: 'Role Changed' },
  { value: 'CONFIG_UPDATED', label: 'System Setting Changed' },
  { value: 'AUTH_LOGIN', label: 'Login' },
  { value: 'AUTH_LOGIN_FAILED', label: 'Failed Login' },
  { value: 'AUTH_LOGOUT', label: 'Logout' },
  { value: 'AUTH_PASSWORD_CHANGED', label: 'Password Reset' }
]

const RESOURCE_TYPE_OPTIONS = [
  { value: '', label: 'All item types' },
  { value: 'Sale', label: 'Sale' },
  { value: 'Product', label: 'Product' },
  { value: 'PurchaseOrder', label: 'Order' },
  { value: 'Supplier', label: 'Supplier' },
  { value: 'User', label: 'User' },
  { value: 'Role', label: 'Role' },
  { value: 'Auth', label: 'Sign In' },
  { value: 'Config', label: 'Setting' },
  { value: 'EmployeeDocument', label: 'Staff Document' }
]

const SUMMARY_CARD_CONFIG = [
  { key: 'events_today', label: 'Activity Today', accent: '#2563eb' },
  { key: 'inventory_adjustments', label: 'Stock Changes', accent: '#0f766e' },
  { key: 'reversals_refunds', label: 'Canceled / Refunded', accent: '#dc2626' },
  { key: 'sensitive_actions', label: 'Important Alerts', accent: '#b45309' }
]

function humanizeCode(value) {
  return String(value || '')
    .trim()
    .replace(/[_-]+/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (ch) => ch.toUpperCase())
}

function parseDetails(details) {
  if (details === null || details === undefined || details === '') return null
  if (typeof details === 'object' && !Array.isArray(details)) return details
  try {
    const parsed = JSON.parse(String(details))
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null
  } catch (err) {
    return null
  }
}

function formatDateTime(value) {
  if (!value) return '-'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return String(value)
  return parsed.toLocaleString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function toYmd(value) {
  return value.toISOString().slice(0, 10)
}

function getQuickDateRange(type) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  if (type === 'today') {
    const current = toYmd(today)
    return { start: current, end: current }
  }

  if (type === 'last7') {
    const startDate = new Date(today)
    startDate.setDate(today.getDate() - 6)
    return { start: toYmd(startDate), end: toYmd(today) }
  }

  if (type === 'month') {
    const startDate = new Date(today.getFullYear(), today.getMonth(), 1)
    return { start: toYmd(startDate), end: toYmd(today) }
  }

  return { start: '', end: '' }
}

function normalizeSeverity(severity) {
  const normalized = String(severity || '').trim().toLowerCase()
  if (normalized === 'critical' || normalized === 'high') return 'critical'
  if (normalized === 'medium' || normalized === 'warning') return 'warning'
  return 'info'
}

function formatPriorityLabel(level) {
  if (level === 'critical') return 'High'
  if (level === 'warning') return 'Medium'
  return 'Low'
}

function getSeverityStyle(level) {
  if (level === 'critical') return { background: '#fef2f2', color: '#991b1b', border: '#fca5a5' }
  if (level === 'warning') return { background: '#fff7ed', color: '#c2410c', border: '#fdba74' }
  return { background: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe' }
}

function normalizeResultStatus(value, action) {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === 'failed') return 'Failed'
  if (normalized === 'reversed') return 'Reversed'
  if (normalized === 'adjusted') return 'Adjusted'
  if (normalized === 'success') return 'Success'

  const actionCode = String(action || '').trim().toUpperCase()
  if (/FAILED|BLOCKED|DENIED/.test(actionCode)) return 'Failed'
  if (/REFUND|RETURN|VOID|DELETE/.test(actionCode)) return 'Reversed'
  if (/ADJUST|DAMAGE|SHRINKAGE|UPDATE|CHANGE/.test(actionCode)) return 'Adjusted'
  return 'Success'
}

function getResultStyle(label) {
  const key = String(label || '').trim().toLowerCase()
  if (key === 'failed') return { background: '#fef2f2', color: '#991b1b', border: '#fca5a5' }
  if (key === 'reversed') return { background: '#fff7ed', color: '#b45309', border: '#fcd34d' }
  if (key === 'adjusted') return { background: '#fefce8', color: '#a16207', border: '#fde68a' }
  return { background: '#eefbf3', color: '#1f7a43', border: '#b7e3c5' }
}

function getModuleStyle(moduleName) {
  const normalized = String(moduleName || '').toLowerCase()
  if (normalized === 'inventory') return { background: '#ecfdf5', color: '#047857' }
  if (normalized === 'sales') return { background: '#fdf2f8', color: '#be185d' }
  if (normalized === 'access') return { background: '#faf5ff', color: '#7e22ce' }
  if (normalized === 'purchasing') return { background: '#eef2ff', color: '#4338ca' }
  if (normalized === 'catalog') return { background: '#eff6ff', color: '#1d4ed8' }
  if (normalized === 'system') return { background: '#fff7ed', color: '#c2410c' }
  return { background: '#f8fafc', color: '#334155' }
}

function escapeCsvValue(value) {
  const normalized = String(value ?? '')
  return `"${normalized.replace(/"/g, '""')}"`
}

function formatMoneyAmount(value) {
  return Number(value).toLocaleString('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })
}

function formatHumanValue(value, keyName = '') {
  if (value === null || value === undefined || value === '') return '-'

  if (typeof value === 'boolean') return value ? 'Yes' : 'No'

  if (typeof value === 'number') {
    const key = String(keyName || '').toLowerCase()
    if (/(amount|price|cost|total|discount|tax|subtotal|balance|payment|rate)/.test(key)) {
      return formatMoneyAmount(value)
    }
    return value.toLocaleString('en-PH')
  }

  if (Array.isArray(value)) {
    if (!value.length) return '-'
    return value.map((item) => formatHumanValue(item, keyName)).join(', ')
  }

  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return '-'

    if (/^\d{4}-\d{2}-\d{2}(T.*)?$/.test(trimmed)) {
      const parsed = new Date(trimmed)
      if (!Number.isNaN(parsed.getTime())) return formatDateTime(parsed)
    }

    if (/^[A-Z0-9_\- ]+$/.test(trimmed)) return humanizeCode(trimmed)
    return trimmed
  }

  return String(value)
}

function toHumanRows(data, prefix = '') {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return []

  const rows = []
  for (const [key, rawValue] of Object.entries(data)) {
    const baseLabel = humanizeCode(key)
    const labelPrefix = prefix ? `${prefix} - ` : ''

    if (rawValue && typeof rawValue === 'object' && !Array.isArray(rawValue)) {
      const nestedEntries = Object.entries(rawValue)
      if (!nestedEntries.length) {
        rows.push({ label: `${labelPrefix}${baseLabel}`, value: '-' })
        continue
      }

      for (const [nestedKey, nestedValue] of nestedEntries) {
        rows.push({
          label: `${labelPrefix}${baseLabel} - ${humanizeCode(nestedKey)}`,
          value: formatHumanValue(nestedValue, nestedKey)
        })
      }
      continue
    }

    rows.push({
      label: `${labelPrefix}${baseLabel}`,
      value: formatHumanValue(rawValue, key)
    })
  }

  return rows
}

function buildPrintHtml(items, titleText) {
  const rows = (items || []).map((item) => {
    const details = parseDetails(item.details)
    const username = item.username || details?.metadata?.username || 'System'
    const roleText = Array.isArray(details?.metadata?.roles)
      ? details.metadata.roles[0]
      : details?.metadata?.role || details?.metadata?.user_role || '-'
    const resultLabel = normalizeResultStatus(item.result_status || details?.result, item.action)
    const severityLabel = formatPriorityLabel(normalizeSeverity(item.severity))
    const actionLabel = item.event_label || humanizeCode(item.action)
    const resourceType = item.resource_type ? humanizeCode(item.resource_type) : 'General'
    const target = item.target_label || (item.resource_id ? `Reference #${item.resource_id}` : 'General event')

    return `
      <tr>
        <td>${formatDateTime(item.created_at)}</td>
        <td>${username}</td>
        <td>${roleText || '-'}</td>
        <td>${item.module_label || humanizeCode(item.module)}</td>
        <td>${actionLabel}</td>
        <td>${resourceType}</td>
        <td>${target}</td>
        <td>${resultLabel}</td>
        <td>${severityLabel}</td>
      </tr>`
  }).join('')

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${titleText}</title>
  <style>
    body { font-family: Arial, sans-serif; color: #0f172a; margin: 24px; }
    h1 { margin: 0 0 6px; font-size: 24px; }
    p { margin: 0 0 16px; color: #64748b; font-size: 13px; }
    table { border-collapse: collapse; width: 100%; font-size: 12px; }
    th, td { border: 1px solid #e2e8f0; padding: 8px; text-align: left; vertical-align: top; }
    th { background: #f8fafc; }
    .meta { margin-top: 12px; font-size: 12px; color: #64748b; }
  </style>
</head>
<body>
  <h1>Activity History</h1>
  <p>${titleText}</p>
  <table>
    <thead>
      <tr>
        <th>When</th>
        <th>Staff</th>
        <th>Role</th>
        <th>Area</th>
        <th>What Happened</th>
        <th>Item Type</th>
        <th>Item</th>
        <th>Outcome</th>
        <th>Priority</th>
      </tr>
    </thead>
    <tbody>
      ${rows || '<tr><td colspan="9">No rows to print.</td></tr>'}
    </tbody>
  </table>
  <div class="meta">Generated on ${formatDateTime(new Date())}</div>
</body>
</html>`
}

export default function Audit() {
  const [draftFilters, setDraftFilters] = useState({
    q: '',
    user: '',
    module: '',
    action: '',
    resource_type: '',
    severity: '',
    start_date: '',
    end_date: '',
    limit: '50'
  })
  const [filters, setFilters] = useState({
    q: '',
    user: '',
    module: '',
    action: '',
    resource_type: '',
    severity: '',
    start_date: '',
    end_date: '',
    limit: '50'
  })

  const [items, setItems] = useState([])
  const [summary, setSummary] = useState({
    events_today: 0,
    inventory_adjustments: 0,
    reversals_refunds: 0,
    sensitive_actions: 0
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [expandedId, setExpandedId] = useState(null)
  const [activeQuickDate, setActiveQuickDate] = useState('')

  const actionOptions = useMemo(() => {
    const seen = new Set()
    const options = []

    for (const option of ACTION_OPTIONS) {
      if (!seen.has(option.value)) {
        options.push(option)
        seen.add(option.value)
      }
    }

    for (const item of items) {
      const value = String(item.action || '').trim()
      if (!value || seen.has(value)) continue
      options.push({ value, label: item.event_label || humanizeCode(value) })
      seen.add(value)
    }

    return options
  }, [items])

  const resourceTypeOptions = useMemo(() => {
    const seen = new Set()
    const options = []

    for (const option of RESOURCE_TYPE_OPTIONS) {
      if (!seen.has(option.value)) {
        options.push(option)
        seen.add(option.value)
      }
    }

    for (const item of items) {
      const value = String(item.resource_type || '').trim()
      if (!value || seen.has(value)) continue
      options.push({ value, label: humanizeCode(value) })
      seen.add(value)
    }

    return options
  }, [items])

  useEffect(() => {
    let ignore = false

    const fetchAudit = async () => {
      try {
        setLoading(true)
        setError(null)

        const params = { ...filters, page, limit: Number(filters.limit) || 50 }
        Object.keys(params).forEach((key) => {
          if (params[key] === '' || params[key] === null || params[key] === undefined) delete params[key]
        })

        const res = await api.get('/audit', { params })
        if (ignore) return

        setItems(Array.isArray(res.data?.items) ? res.data.items : [])
        setSummary(res.data?.summary || {
          events_today: 0,
          inventory_adjustments: 0,
          reversals_refunds: 0,
          sensitive_actions: 0
        })
        setTotal(Number(res.data?.total) || 0)
        setTotalPages(Number(res.data?.total_pages) || 1)
      } catch (err) {
        if (ignore) return
        setError(err?.response?.data?.error || 'Could not load activity history')
      } finally {
        if (!ignore) setLoading(false)
      }
    }

    fetchAudit()
    return () => {
      ignore = true
    }
  }, [filters, page])

  const applyFilters = (event) => {
    if (event) event.preventDefault()
    setExpandedId(null)
    setPage(1)
    setFilters({ ...draftFilters })
  }

  const clearFilters = () => {
    const cleared = {
      q: '',
      user: '',
      module: '',
      action: '',
      resource_type: '',
      severity: '',
      start_date: '',
      end_date: '',
      limit: '50'
    }
    setDraftFilters(cleared)
    setFilters(cleared)
    setExpandedId(null)
    setPage(1)
    setActiveQuickDate('')
  }

  const applyQuickDate = (quickKey) => {
    const range = getQuickDateRange(quickKey)
    const next = {
      ...draftFilters,
      start_date: range.start,
      end_date: range.end
    }

    setDraftFilters(next)
    setFilters(next)
    setExpandedId(null)
    setPage(1)
    setActiveQuickDate(quickKey)
  }

  const handleDateChange = (fieldName, value) => {
    setDraftFilters((prev) => ({ ...prev, [fieldName]: value }))
    setActiveQuickDate('')
  }

  const exportCsv = () => {
    const rows = items || []
    const headers = [
      'When',
      'Staff',
      'Role',
      'Area',
      'What Happened',
      'Item Type',
      'Item',
      'Outcome',
      'Priority',
      'Note'
    ]

    const csvLines = [headers.map(escapeCsvValue).join(',')]

    for (const item of rows) {
      const details = parseDetails(item.details)
      const username = item.username || details?.metadata?.username || 'System'
      const roleText = Array.isArray(details?.metadata?.roles)
        ? details.metadata.roles[0]
        : details?.metadata?.role || details?.metadata?.user_role || ''
      const resultLabel = normalizeResultStatus(item.result_status || details?.result, item.action)
      const severityLabel = formatPriorityLabel(normalizeSeverity(item.severity))
      const resourceType = item.resource_type ? humanizeCode(item.resource_type) : 'General'
      const target = item.target_label || (item.resource_id ? `Reference #${item.resource_id}` : 'General event')
      const remarks = details?.remarks || details?.reason || ''

      const line = [
        formatDateTime(item.created_at),
        username,
        roleText,
        item.module_label || humanizeCode(item.module),
        item.event_label || humanizeCode(item.action),
        resourceType,
        target,
        resultLabel,
        severityLabel,
        remarks
      ]

      csvLines.push(line.map(escapeCsvValue).join(','))
    }

    const blob = new Blob([csvLines.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `audit-trail-${toYmd(new Date())}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  const openPrintView = (titleText) => {
    const printWindow = window.open('', '_blank', 'width=1100,height=780')
    if (!printWindow) return

    printWindow.document.write(buildPrintHtml(items, titleText))
    printWindow.document.close()
    printWindow.focus()
    window.setTimeout(() => printWindow.print(), 220)
  }

  const exportPdf = () => {
    openPrintView('In the next window, choose Save as PDF.')
  }

  const printAudit = () => {
    openPrintView('Printable activity report.')
  }

  return (
    <div className="page audit-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Activity History</h1>
          <p className="page-subtitle">See what happened in the system, who did it, and when it happened.</p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <form onSubmit={applyFilters}>
          <div className="audit-filter-grid-top">
            <div>
              <label className="form-label">Search</label>
              <input
                className="form-input"
                value={draftFilters.q}
                onChange={(event) => setDraftFilters((prev) => ({ ...prev, q: event.target.value }))}
                placeholder="Search person, activity, or item"
              />
            </div>
            <div>
              <label className="form-label">Staff</label>
              <input
                className="form-input"
                value={draftFilters.user}
                onChange={(event) => setDraftFilters((prev) => ({ ...prev, user: event.target.value }))}
                placeholder="Name"
              />
            </div>
            <div>
              <label className="form-label">Area</label>
              <select className="form-input" value={draftFilters.module} onChange={(event) => setDraftFilters((prev) => ({ ...prev, module: event.target.value }))}>
                {MODULE_OPTIONS.map((option) => <option key={option.value || 'all-modules'} value={option.value}>{option.label}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">Priority</label>
              <select className="form-input" value={draftFilters.severity} onChange={(event) => setDraftFilters((prev) => ({ ...prev, severity: event.target.value }))}>
                {SEVERITY_OPTIONS.map((option) => <option key={option.value || 'all-severity'} value={option.value}>{option.label}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">Rows</label>
              <select className="form-input" value={draftFilters.limit} onChange={(event) => setDraftFilters((prev) => ({ ...prev, limit: event.target.value }))}>
                {LIMIT_OPTIONS.map((option) => <option key={option} value={String(option)}>{option} rows</option>)}
              </select>
            </div>
          </div>

          <div className="audit-filter-grid-bottom">
            <div>
              <label className="form-label">Activity</label>
              <select className="form-input" value={draftFilters.action} onChange={(event) => setDraftFilters((prev) => ({ ...prev, action: event.target.value }))}>
                {actionOptions.map((option) => <option key={option.value || 'all-actions'} value={option.value}>{option.label}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">Item Type</label>
              <select className="form-input" value={draftFilters.resource_type} onChange={(event) => setDraftFilters((prev) => ({ ...prev, resource_type: event.target.value }))}>
                {resourceTypeOptions.map((option) => <option key={option.value || 'all-resource-types'} value={option.value}>{option.label}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">Start Date</label>
              <input className="form-input" type="date" value={draftFilters.start_date} onChange={(event) => handleDateChange('start_date', event.target.value)} />
            </div>
            <div>
              <label className="form-label">End Date</label>
              <input className="form-input" type="date" value={draftFilters.end_date} onChange={(event) => handleDateChange('end_date', event.target.value)} />
            </div>
            <div className="audit-filter-actions">
              <button type="submit" className="btn btn-primary">Apply</button>
              <button type="button" className="btn btn-secondary" onClick={clearFilters}>Clear</button>
            </div>
          </div>

          <div className="audit-quick-row">
            <span className="audit-quick-label">Quick range:</span>
            <button type="button" className={`audit-quick-btn ${activeQuickDate === 'today' ? 'is-active' : ''}`} onClick={() => applyQuickDate('today')}>Today</button>
            <button type="button" className={`audit-quick-btn ${activeQuickDate === 'last7' ? 'is-active' : ''}`} onClick={() => applyQuickDate('last7')}>Last 7 Days</button>
            <button type="button" className={`audit-quick-btn ${activeQuickDate === 'month' ? 'is-active' : ''}`} onClick={() => applyQuickDate('month')}>This Month</button>
          </div>
        </form>
      </div>

      <div className="dashboard-grid" style={{ marginBottom: 16 }}>
        {SUMMARY_CARD_CONFIG.map((card) => (
          <div key={card.key} className="card" style={{ marginBottom: 0, borderTop: `4px solid ${card.accent}` }}>
            <div style={{ color: '#64748b', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{card.label}</div>
            <div style={{ marginTop: 8, fontSize: 30, fontWeight: 800, color: '#0f172a' }}>{Number(summary[card.key]) || 0}</div>
          </div>
        ))}
      </div>

      <div className="card" style={{ marginBottom: 0 }}>
        <div className="audit-results-head">
          <div style={{ color: '#64748b', fontSize: 13 }}>
            {loading ? 'Loading activity...' : `${total.toLocaleString()} item${total === 1 ? '' : 's'} found`}
          </div>
          <div className="audit-export-actions">
            <button type="button" className="btn btn-secondary" onClick={exportCsv} disabled={!items.length}>Download CSV</button>
            <button type="button" className="btn btn-secondary" onClick={exportPdf} disabled={!items.length}>Save as PDF</button>
            <button type="button" className="btn btn-secondary" onClick={printAudit} disabled={!items.length}>Print</button>
          </div>
        </div>

        {error ? <div className="error-msg" style={{ marginBottom: 12 }}>{error}</div> : null}

        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-light)' }}>Loading activity...</div>
        ) : !items.length ? (
          <div className="audit-empty-state">
            <h3>No activity found for these filters.</h3>
            <p>Try changing the filters or reset them.</p>
            <div className="audit-empty-actions">
              <button type="button" className="btn btn-secondary" onClick={clearFilters}>Reset Filters</button>
            </div>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="audit-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Staff</th>
                  <th>Area</th>
                  <th>What Happened</th>
                  <th>Item Type</th>
                  <th>Item</th>
                  <th>Outcome</th>
                  <th>More</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const isExpanded = expandedId === item.id
                  const details = parseDetails(item.details)
                  const username = item.username || details?.metadata?.username || 'System'
                  const roleText = Array.isArray(details?.metadata?.roles)
                    ? details.metadata.roles[0]
                    : details?.metadata?.role || details?.metadata?.user_role || '-'
                  const actionLabel = item.event_label || humanizeCode(item.action)
                  const moduleStyle = getModuleStyle(item.module)
                  const severityLevel = normalizeSeverity(item.severity)
                  const severityStyle = getSeverityStyle(severityLevel)
                  const resultLabel = normalizeResultStatus(item.result_status || details?.result, item.action)
                  const resultStyle = getResultStyle(resultLabel)
                  const priorityLabel = formatPriorityLabel(severityLevel)
                  const resourceType = item.resource_type ? humanizeCode(item.resource_type) : 'General'
                  const target = item.target_label || (item.resource_id ? `Reference #${item.resource_id}` : 'General event')
                  const remarks = details?.remarks || details?.reason || '-'
                  const beforeValue = details?.before
                  const afterValue = details?.after
                  const beforeRows = toHumanRows(beforeValue)
                  const afterRows = toHumanRows(afterValue)
                  const references = details?.references || {}
                  const recordId = item.resource_id || references.sale_id || references.record_id || references.product_id || '-'

                  return (
                    <React.Fragment key={item.id}>
                      <tr style={{ background: item.is_sensitive ? '#fffdf7' : '#ffffff' }}>
                        <td>
                          <div style={{ fontWeight: 600, color: '#0f172a' }}>{formatDateTime(item.created_at)}</div>
                          <div style={{ color: '#64748b', fontSize: 12 }}>Entry #{item.id}</div>
                        </td>
                        <td>
                          <div style={{ fontWeight: 600, color: '#0f172a' }}>{username}</div>
                          <div style={{ color: '#64748b', fontSize: 12 }}>{item.full_name || '-'}</div>
                          <div style={{ color: '#64748b', fontSize: 12 }}>Role: {roleText || '-'}</div>
                        </td>
                        <td>
                          <span style={{ ...moduleStyle, display: 'inline-flex', padding: '4px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700 }}>
                            {item.module_label || humanizeCode(item.module)}
                          </span>
                        </td>
                        <td>
                          <div style={{ fontWeight: 700, color: '#0f172a' }}>{actionLabel}</div>
                        </td>
                        <td>{resourceType}</td>
                        <td>
                          <div style={{ fontWeight: 600, color: '#0f172a' }}>{target}</div>
                          <div style={{ color: '#64748b', fontSize: 12, marginTop: 4 }}>Reference No.: {recordId}</div>
                        </td>
                        <td>
                          <div style={{ display: 'grid', gap: 6, justifyItems: 'start' }}>
                            <span style={{ background: resultStyle.background, color: resultStyle.color, border: `1px solid ${resultStyle.border}`, borderRadius: 999, padding: '3px 9px', fontSize: 11, fontWeight: 700 }}>
                              {resultLabel}
                            </span>
                            <span style={{ background: severityStyle.background, color: severityStyle.color, border: `1px solid ${severityStyle.border}`, borderRadius: 999, padding: '3px 9px', fontSize: 11, fontWeight: 700 }}>
                              {priorityLabel}
                            </span>
                          </div>
                        </td>
                        <td>
                          <button
                            type="button"
                            className="btn btn-secondary"
                            style={{ padding: '4px 10px', fontSize: 12 }}
                            onClick={() => setExpandedId((current) => current === item.id ? null : item.id)}
                          >
                            {isExpanded ? 'Hide' : 'View'}
                          </button>
                        </td>
                      </tr>

                      {isExpanded ? (
                        <tr>
                          <td colSpan={8} style={{ background: '#fcfcfd', padding: 0 }}>
                            <div className="audit-detail-wrap">
                              <div className="audit-detail-grid">
                                <div className="audit-detail-card">
                                  <strong>Reference Number</strong>
                                  <span>{recordId}</span>
                                </div>
                                <div className="audit-detail-card">
                                  <strong>Staff</strong>
                                  <span>{username}</span>
                                </div>
                                <div className="audit-detail-card">
                                  <strong>Role</strong>
                                  <span>{roleText || '-'}</span>
                                </div>
                                <div className="audit-detail-card">
                                  <strong>When</strong>
                                  <span>{formatDateTime(item.created_at)}</span>
                                </div>
                                <div className="audit-detail-card">
                                  <strong>Note</strong>
                                  <span>{remarks}</span>
                                </div>
                              </div>

                              <div className="audit-detail-pair">
                                <div>
                                  <h4>Before</h4>
                                  {beforeRows.length ? (
                                    <div className="audit-change-list">
                                      {beforeRows.map((row, index) => (
                                        <div key={`${row.label}-${index}`} className="audit-change-row">
                                          <span className="audit-change-key">{row.label}</span>
                                          <span className="audit-change-value">{row.value}</span>
                                        </div>
                                      ))}
                                    </div>
                                  ) : <p>No details</p>}
                                </div>
                                <div>
                                  <h4>After</h4>
                                  {afterRows.length ? (
                                    <div className="audit-change-list">
                                      {afterRows.map((row, index) => (
                                        <div key={`${row.label}-${index}`} className="audit-change-row">
                                          <span className="audit-change-key">{row.label}</span>
                                          <span className="audit-change-value">{row.value}</span>
                                        </div>
                                      ))}
                                    </div>
                                  ) : <p>No details</p>}
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </React.Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, gap: 12, flexWrap: 'wrap' }}>
          <div style={{ color: '#64748b', fontSize: 13 }}>
            Showing {items.length} of {total.toLocaleString()} item{total === 1 ? '' : 's'}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={page <= 1 || loading}
            >
              Previous
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              disabled={page >= totalPages || loading}
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
