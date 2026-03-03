import React, { useState, useEffect } from 'react'
import { useSelector } from 'react-redux'
import api from '../api/api.js'

export default function Dashboard() {
  const user = useSelector(s => s.auth.user)
  const name = user ? (user.full_name || user.username) : 'Administrator'
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)

  const now = new Date()
  const timeStr = now.toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })

  useEffect(() => {
    api.get('/dashboard/stats')
      .then(res => setStats(res.data))
      .catch(err => console.error('dashboard stats error:', err))
      .finally(() => setLoading(false))
  }, [])

  const fmt = (n) => {
    if (n === null || n === undefined) return '—'
    if (typeof n === 'number') return n.toLocaleString('en-PH')
    return String(n)
  }
  const fmtMoney = (n) => {
    if (n === null || n === undefined) return '—'
    return '₱' + parseFloat(n).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }

  const cards = stats ? [
    { title: 'Total Sales',      value: fmtMoney(stats.total_sales), sub: `${fmt(stats.total_orders)} orders all time`, icon: '🧾' },
    { title: "Today's Sales",    value: fmtMoney(stats.today_sales), sub: `${fmt(stats.today_orders)} orders today`,    icon: '📊' },
    { title: 'Products',         value: fmt(stats.products_count),   sub: 'Active in catalog',   icon: '👗' },
    { title: 'Low Stock',        value: fmt(stats.low_stock_count),  sub: 'Need restocking',     icon: '📦' },
    { title: 'Customers',        value: fmt(stats.customers_count),  sub: 'Registered',          icon: '👤' },
    { title: 'Employees',        value: fmt(stats.employees_count),  sub: 'Active staff',        icon: '👥' },
    { title: 'Pending Payroll',  value: fmt(stats.pending_payroll_count), sub: fmtMoney(stats.pending_payroll_total) + ' total', icon: '💰' },
    { title: 'Open POs',         value: fmt(stats.open_po_count),    sub: 'Purchase orders',     icon: '📋' },
  ] : [
    { title: 'Total Sales',     value: '—', sub: 'Loading...', icon: '🧾' },
    { title: "Today's Sales",   value: '—', sub: 'Loading...', icon: '📊' },
    { title: 'Products',        value: '—', sub: 'Loading...', icon: '👗' },
    { title: 'Low Stock',       value: '—', sub: 'Loading...', icon: '📦' },
    { title: 'Customers',       value: '—', sub: 'Loading...', icon: '👤' },
    { title: 'Employees',       value: '—', sub: 'Loading...', icon: '👥' },
    { title: 'Pending Payroll', value: '—', sub: 'Loading...', icon: '💰' },
    { title: 'Open POs',        value: '—', sub: 'Loading...', icon: '📋' },
  ]

  return React.createElement('div', null,
    // Page Header
    React.createElement('div', { className: 'page-header' },
      React.createElement('div', null,
        React.createElement('h1', { className: 'page-title' }, `Good day, ${name} 👋`),
        React.createElement('p', { className: 'page-subtitle' }, timeStr)
      )
    ),

    // Stat Cards
    React.createElement('div', { className: 'dashboard-grid' },
      cards.map(card =>
        React.createElement('div', { key: card.title, className: 'card' },
          React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' } },
            React.createElement('div', null,
              React.createElement('div', { className: 'card-title' }, card.title),
              React.createElement('div', { className: 'card-value' }, card.value),
              React.createElement('div', { className: 'text-muted mt-1', style: { fontSize: 12 } }, card.sub)
            ),
            React.createElement('span', { style: { fontSize: 28, opacity: 0.6 } }, card.icon)
          )
        )
      )
    ),

    // Recent Sales
    stats && stats.recent_sales && stats.recent_sales.length > 0 &&
    React.createElement('div', { className: 'card', style: { marginTop: 16 } },
      React.createElement('h3', { style: { marginBottom: 12, fontFamily: 'Cormorant Garamond, serif' } }, 'Recent Sales'),
      React.createElement('table', { style: { width: '100%', borderCollapse: 'collapse', fontSize: 14 } },
        React.createElement('thead', null,
          React.createElement('tr', null,
            React.createElement('th', { style: { textAlign: 'left', padding: 8, borderBottom: '1px solid #ddd' } }, 'Sale #'),
            React.createElement('th', { style: { textAlign: 'left', padding: 8, borderBottom: '1px solid #ddd' } }, 'Clerk'),
            React.createElement('th', { style: { textAlign: 'right', padding: 8, borderBottom: '1px solid #ddd' } }, 'Total'),
            React.createElement('th', { style: { textAlign: 'left', padding: 8, borderBottom: '1px solid #ddd' } }, 'Payment'),
            React.createElement('th', { style: { textAlign: 'left', padding: 8, borderBottom: '1px solid #ddd' } }, 'Date')
          )
        ),
        React.createElement('tbody', null,
          stats.recent_sales.map(s =>
            React.createElement('tr', { key: s.id },
              React.createElement('td', { style: { padding: 8, borderBottom: '1px solid #f6f6f6' } }, s.sale_number || `#${s.id}`),
              React.createElement('td', { style: { padding: 8, borderBottom: '1px solid #f6f6f6' } }, s.clerk || '—'),
              React.createElement('td', { style: { padding: 8, borderBottom: '1px solid #f6f6f6', textAlign: 'right' } }, fmtMoney(s.total)),
              React.createElement('td', { style: { padding: 8, borderBottom: '1px solid #f6f6f6' } }, s.payment_method || '—'),
              React.createElement('td', { style: { padding: 8, borderBottom: '1px solid #f6f6f6' } }, new Date(s.date).toLocaleDateString('en-PH'))
            )
          )
        )
      )
    ),

    // Top Products
    stats && stats.top_products && stats.top_products.length > 0 &&
    React.createElement('div', { className: 'card', style: { marginTop: 16 } },
      React.createElement('h3', { style: { marginBottom: 12, fontFamily: 'Cormorant Garamond, serif' } }, 'Top Products (Last 30 Days)'),
      React.createElement('table', { style: { width: '100%', borderCollapse: 'collapse', fontSize: 14 } },
        React.createElement('thead', null,
          React.createElement('tr', null,
            React.createElement('th', { style: { textAlign: 'left', padding: 8, borderBottom: '1px solid #ddd' } }, 'Product'),
            React.createElement('th', { style: { textAlign: 'right', padding: 8, borderBottom: '1px solid #ddd' } }, 'Qty Sold'),
            React.createElement('th', { style: { textAlign: 'right', padding: 8, borderBottom: '1px solid #ddd' } }, 'Revenue')
          )
        ),
        React.createElement('tbody', null,
          stats.top_products.map((p, i) =>
            React.createElement('tr', { key: i },
              React.createElement('td', { style: { padding: 8, borderBottom: '1px solid #f6f6f6' } }, p.name),
              React.createElement('td', { style: { padding: 8, borderBottom: '1px solid #f6f6f6', textAlign: 'right' } }, fmt(p.total_qty)),
              React.createElement('td', { style: { padding: 8, borderBottom: '1px solid #f6f6f6', textAlign: 'right' } }, fmtMoney(p.total_revenue))
            )
          )
        )
      )
    ),

    // Info Banner
    React.createElement('div', { className: 'card', style: { marginTop: 16, background: 'linear-gradient(135deg, #2C2116 0%, #4A3520 100%)', border: 'none', color: '#EDE0C4' } },
      React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
        React.createElement('div', null,
          React.createElement('h3', { style: { color: '#D4B483', fontFamily: 'Cormorant Garamond, serif', fontSize: 22 } }, "Cecille's N'Style POS"),
          React.createElement('p', { style: { fontSize: 13.5, color: '#A89070', marginTop: 4 } },
            'Boutique Management System — Sales, Inventory, Employees & more.'
          )
        ),
        React.createElement('span', { style: { fontSize: 36 } }, '✨')
      )
    )
  )
}