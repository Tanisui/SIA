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
    { title: 'Open POs',         value: fmt(stats.open_po_count),    sub: 'Purchase orders',     icon: '📋' },
  ] : [
    { title: 'Total Sales',     value: '—', sub: 'Loading...', icon: '🧾' },
    { title: "Today's Sales",   value: '—', sub: 'Loading...', icon: '📊' },
    { title: 'Products',        value: '—', sub: 'Loading...', icon: '👗' },
    { title: 'Low Stock',       value: '—', sub: 'Loading...', icon: '📦' },
    { title: 'Customers',       value: '—', sub: 'Loading...', icon: '👤' },
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
          React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' } },
            React.createElement('div', { style: { flex: 1 } },
              React.createElement('div', { className: 'card-title' }, card.title),
              React.createElement('div', { className: 'card-value' }, card.value),
              React.createElement('div', { className: 'card-subtitle' }, card.sub)
            ),
            React.createElement('span', { style: { fontSize: 32, opacity: 0.5, flexShrink: 0 } }, card.icon)
          )
        )
      )
    ),

    // Recent Sales
    stats && stats.recent_sales && stats.recent_sales.length > 0 &&
    React.createElement('div', { className: 'card mb-4' },
      React.createElement('div', { className: 'card-header' },
        React.createElement('h3', null, 'Recent Sales'),
        React.createElement('span', { className: 'badge badge-neutral' }, `${stats.recent_sales.length} sales`)
      ),
      React.createElement('div', { className: 'table-wrap' },
        React.createElement('table', null,
          React.createElement('thead', null,
            React.createElement('tr', null,
              React.createElement('th', null, 'Sale #'),
              React.createElement('th', null, 'Clerk'),
              React.createElement('th', { className: 'text-right' }, 'Total'),
              React.createElement('th', null, 'Payment'),
              React.createElement('th', null, 'Date')
            )
          ),
          React.createElement('tbody', null,
            stats.recent_sales.slice(0, 10).map(s =>
              React.createElement('tr', { key: s.id },
                React.createElement('td', null, s.sale_number || `#${s.id}`),
                React.createElement('td', null, s.clerk || '—'),
                React.createElement('td', { className: 'text-right text-dark', style: { fontWeight: '600', color: 'var(--gold-dark)' } }, fmtMoney(s.total)),
                React.createElement('td', null, s.payment_method || '—'),
                React.createElement('td', { className: 'text-muted' }, new Date(s.date).toLocaleDateString('en-PH'))
              )
            )
          )
        )
      )
    ),

    // Top Products
    stats && stats.top_products && stats.top_products.length > 0 &&
    React.createElement('div', { className: 'card mb-4' },
      React.createElement('div', { className: 'card-header' },
        React.createElement('h3', null, 'Top Products (Last 30 Days)'),
        React.createElement('span', { className: 'badge badge-primary' }, 'Bestsellers')
      ),
      React.createElement('div', { className: 'table-wrap' },
        React.createElement('table', null,
          React.createElement('thead', null,
            React.createElement('tr', null,
              React.createElement('th', null, 'Product'),
              React.createElement('th', { className: 'text-right' }, 'Qty Sold'),
              React.createElement('th', { className: 'text-right' }, 'Revenue')
            )
          ),
          React.createElement('tbody', null,
            stats.top_products.slice(0, 8).map((p, i) =>
              React.createElement('tr', { key: i },
                React.createElement('td', null, p.name),
                React.createElement('td', { className: 'text-right' }, fmt(p.total_qty)),
                React.createElement('td', { className: 'text-right text-dark', style: { fontWeight: '600', color: 'var(--success)' } }, fmtMoney(p.total_revenue))
              )
            )
          )
        )
      )
    ),

    // Info Banner
    React.createElement('div', { className: 'card', style: { marginTop: '24px', background: 'linear-gradient(135deg, var(--sidebar-bg) 0%, #3A2F25 100%)', border: 'none', color: 'var(--sidebar-text)' } },
      React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '24px' } },
        React.createElement('div', null,
          React.createElement('h3', { style: { color: 'var(--tan)', fontFamily: 'Cormorant Garamond, serif', fontSize: '24px', margin: '0 0 8px 0' } }, "Cecille's N'Style POS"),
          React.createElement('p', { style: { fontSize: '14px', color: 'var(--sidebar-muted)', margin: 0, lineHeight: '1.6' } },
            'Complete Boutique Management System - Sales, Inventory, Purchasing, and Reports integrated.'
          )
        ),
        React.createElement('span', { style: { fontSize: '48px', flexShrink: 0 } }, '✨')
      )
    )
  )
}
