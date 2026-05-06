import React, { useState, useEffect, useMemo } from 'react'
import { useSelector } from 'react-redux'
import api from '../api/api.js'
import Icon from '../components/Icons.js'
import BrandedChart, { ChartCard, BRAND_COLORS, formatCurrency as fmtPeso } from '../components/Chart.jsx'

function fmtNumber(n) {
  if (n === null || n === undefined) return '0'
  if (typeof n === 'number') return n.toLocaleString('en-PH')
  return String(n)
}

function fmtMoney(n) {
  const amount = Number(n)
  if (!Number.isFinite(amount)) return '₱0.00'
  return '₱' + amount.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function StatCard({ icon, tone, label, value, delta }) {
  return React.createElement('div', { className: `dash-stat tone-${tone}` },
    React.createElement('div', { className: 'dash-stat-icon' },
      React.createElement(Icon, { name: icon, size: 18 })
    ),
    React.createElement('div', { className: 'dash-stat-body' },
      React.createElement('div', { className: 'dash-stat-label' }, label),
      React.createElement('div', { className: 'dash-stat-value' }, value),
      delta && React.createElement('div', { className: 'dash-stat-delta' }, delta)
    )
  )
}

function Sparkbar({ values = [] }) {
  const max = Math.max(1, ...values.map((v) => Number(v) || 0))
  return React.createElement('div', { className: 'dash-sparkbar' },
    values.map((v, i) => {
      const h = Math.max(6, Math.round(((Number(v) || 0) / max) * 56))
      return React.createElement('span', { key: i, className: 'dash-sparkbar-bar', style: { height: `${h}px` } })
    })
  )
}

export default function Dashboard() {
  const user = useSelector((s) => s.auth.user)
  const name = user ? (user.full_name || user.username) : 'Administrator'
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [statsError, setStatsError] = useState(null)
  const userRoles = Array.isArray(user?.roles) ? user.roles : []
  const isSalesClerk = (stats?.dashboard_profile === 'sales_clerk')
    || userRoles.some((roleName) => String(roleName || '').trim().toLowerCase() === 'sales clerk')

  const now = new Date()
  const dateStr = now.toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })

  useEffect(() => {
    let active = true
    async function fetchStats(withLoader = false) {
      if (withLoader) setLoading(true)
      try {
        const res = await api.get('/dashboard/stats')
        if (!active) return
        setStats(res.data)
        setStatsError(null)
      } catch (err) {
        if (active) {
          console.error('dashboard stats error:', err)
          setStatsError('Failed to load dashboard statistics. Please refresh the page.')
        }
      } finally {
        if (active && withLoader) setLoading(false)
      }
    }
    fetchStats(true)
    const intervalId = window.setInterval(() => fetchStats(false), 60000)
    const handleFocus = () => fetchStats(false)
    const handleVisibility = () => { if (document.visibilityState === 'visible') fetchStats(false) }
    window.addEventListener('focus', handleFocus)
    document.addEventListener('visibilitychange', handleVisibility)
    return () => {
      active = false
      window.clearInterval(intervalId)
      window.removeEventListener('focus', handleFocus)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [])

  const monthlyBalesCount = stats ? (stats.bales_month_count ?? stats.bales_30d_count) : 0
  const monthlyBaleSpend  = stats ? (stats.bale_spend_month  ?? stats.bale_spend_30d)  : 0

  const cards = useMemo(() => {
    if (isSalesClerk) {
      return [
        { icon: 'sales',     tone: 'gold',    label: "Today's Sales",    value: fmtMoney(stats?.today_sales),       delta: `${fmtNumber(stats?.today_orders)} orders today` },
        { icon: 'inventory', tone: 'neutral', label: 'Active Products',  value: fmtNumber(stats?.products_count),    delta: 'In catalog' },
        { icon: 'reports',   tone: 'warning', label: 'Low Stock',        value: fmtNumber(stats?.low_stock_count),   delta: 'Needs restock' }
      ]
    }
    return [
      { icon: 'sales',       tone: 'gold',    label: 'Total Sales',                value: fmtMoney(stats?.total_sales),         delta: `${fmtNumber(stats?.total_orders)} orders all-time` },
      { icon: 'sales',       tone: 'neutral', label: "Today's Sales",              value: fmtMoney(stats?.today_sales),         delta: `${fmtNumber(stats?.today_orders)} orders today` },
      { icon: 'users',       tone: 'neutral', label: 'Active Employees',           value: fmtNumber(stats?.employees_count),    delta: 'Currently employed' },
      { icon: 'payroll',     tone: 'success', label: 'Payroll This Month',         value: fmtMoney(stats?.payroll_month_total), delta: `${fmtNumber(stats?.payroll_month_employees)} paid` },
      { icon: 'inventory',   tone: 'neutral', label: 'Active Products',            value: fmtNumber(stats?.products_count),     delta: 'In catalog' },
      { icon: 'reports',     tone: 'warning', label: 'Low Stock',                  value: fmtNumber(stats?.low_stock_count),    delta: 'Needs restock' },
      { icon: 'purchasing',  tone: 'neutral', label: 'Bales Purchased (Month)',    value: fmtNumber(monthlyBalesCount),         delta: 'Auto resets monthly' },
      { icon: 'purchasing',  tone: 'gold',    label: 'Bale Spend (Month)',         value: fmtMoney(monthlyBaleSpend),           delta: 'From bale purchases' }
    ]
  }, [isSalesClerk, stats, monthlyBalesCount, monthlyBaleSpend])

  const recentSales = Array.isArray(stats?.recent_sales) ? stats.recent_sales : []
  const topProducts = Array.isArray(stats?.top_products) ? stats.top_products : []

  // Build a quick spark from the recent sales (totals over time) — purely visual.
  const spark = useMemo(() => {
    if (!recentSales.length) return [3, 6, 2, 7, 4, 9, 5, 8, 6, 4]
    const last = recentSales.slice(0, 14).reverse()
    return last.map((s) => Number(s.total) || 0)
  }, [recentSales])

  // Sales trend by day (last 14 entries, oldest → newest).
  const salesTrend = useMemo(() => {
    const buckets = new Map()
    const list = recentSales.slice(0, 60)
    for (const s of list) {
      const key = String(s.date || '').slice(0, 10)
      if (!key) continue
      const prev = buckets.get(key) || 0
      buckets.set(key, prev + (Number(s.total) || 0))
    }
    const entries = Array.from(buckets.entries()).sort(([a], [b]) => (a < b ? -1 : 1)).slice(-14)
    return {
      labels: entries.map(([d]) => new Date(d).toLocaleDateString('en-PH', { month: 'short', day: '2-digit' })),
      values: entries.map(([, v]) => Math.round(v))
    }
  }, [recentSales])

  // Payment-mix doughnut.
  const paymentMix = useMemo(() => {
    const buckets = new Map()
    for (const s of recentSales) {
      const key = String(s.payment_method || 'Unknown').trim() || 'Unknown'
      buckets.set(key, (buckets.get(key) || 0) + (Number(s.total) || 0))
    }
    const entries = Array.from(buckets.entries()).sort((a, b) => b[1] - a[1])
    return { labels: entries.map(([k]) => k), values: entries.map(([, v]) => Math.round(v)) }
  }, [recentSales])

  // Top products bar (horizontal — easier to read names).
  const topProductsBar = useMemo(() => {
    const list = topProducts.slice(0, 8)
    return {
      labels: list.map((p) => String(p.name || 'Item').slice(0, 28)),
      revenue: list.map((p) => Number(p.total_revenue) || 0),
      qty: list.map((p) => Number(p.total_qty) || 0)
    }
  }, [topProducts])

  // Bale spend vs payroll (admin-only summary card).
  const monthMix = useMemo(() => {
    if (isSalesClerk) return null
    return {
      labels: ['Bale Spend', 'Payroll', "Today's Sales"],
      values: [
        Math.round(Number(monthlyBaleSpend) || 0),
        Math.round(Number(stats?.payroll_month_total) || 0),
        Math.round(Number(stats?.today_sales) || 0)
      ]
    }
  }, [isSalesClerk, monthlyBaleSpend, stats])

  return React.createElement('div', { className: 'dash-page' },
    React.createElement('div', { className: 'dash-hero' },
      React.createElement('div', { className: 'dash-hero-text' },
        React.createElement('div', { className: 'dash-hero-greeting' }, `Good day, ${name}`),
        React.createElement('div', { className: 'dash-hero-date' }, dateStr),
        React.createElement('div', { className: 'dash-hero-subtitle' },
          isSalesClerk
            ? 'Your live sales pulse and what to keep an eye on today.'
            : "Here's what's happening at Cecille's N'Style today."
        )
      ),
      React.createElement('div', { className: 'dash-hero-spark' },
        React.createElement('div', { className: 'dash-hero-spark-label' }, 'Recent activity'),
        React.createElement(Sparkbar, { values: spark })
      )
    ),

    statsError && React.createElement('div', { className: 'error-msg', style: { marginBottom: 16 } }, statsError),

    React.createElement('div', { className: 'dash-stats-grid' },
      cards.map((c, i) => React.createElement(StatCard, { key: i, ...c }))
    ),

    // ── Charts row ──────────────────────────────────────────────────
    React.createElement('div', { className: 'chart-grid-2' },
      React.createElement(ChartCard, {
        title: 'Sales Trend',
        subtitle: 'Daily POS revenue over the most recent two weeks. Higher line = better day.',
        kpi: { label: 'Latest day', value: fmtPeso(salesTrend.values[salesTrend.values.length - 1] || 0) },
        height: 260
      },
        salesTrend.values.length === 0
          ? React.createElement('div', { className: 'dash-empty' },
              React.createElement('div', { className: 'dash-empty-title' }, 'Not enough sales data'),
              React.createElement('div', { className: 'dash-empty-sub' }, 'Charts will populate once a few completed sales are recorded.')
            )
          : React.createElement(BrandedChart, {
              kind: 'line',
              labels: salesTrend.labels,
              datasets: [{ label: 'Revenue', data: salesTrend.values, color: BRAND_COLORS.gold, area: true }],
              valueType: 'currency',
              hideLegend: true,
              height: 240
            })
      ),
      React.createElement(ChartCard, {
        title: 'Payment Mix',
        subtitle: 'How customers paid for recent sales. Bigger slice = used more often.',
        kpi: { label: 'Methods', value: paymentMix.labels.length || 0 },
        height: 260
      },
        paymentMix.values.length === 0
          ? React.createElement('div', { className: 'dash-empty' },
              React.createElement('div', { className: 'dash-empty-title' }, 'No completed sales yet'),
              React.createElement('div', { className: 'dash-empty-sub' }, 'Each completed sale will fill this chart.')
            )
          : React.createElement(BrandedChart, {
              kind: 'doughnut',
              labels: paymentMix.labels,
              values: paymentMix.values,
              valueType: 'currency',
              height: 240
            })
      )
    ),

    !isSalesClerk && monthMix && React.createElement('div', { className: 'chart-grid-2' },
      React.createElement(ChartCard, {
        title: 'Bestseller Performance',
        subtitle: 'Top 8 products by revenue (last 30 days). Hover a bar to see the exact peso value and units sold.',
        height: 320
      },
        topProductsBar.labels.length === 0
          ? React.createElement('div', { className: 'dash-empty' },
              React.createElement('div', { className: 'dash-empty-title' }, 'No bestsellers yet'),
              React.createElement('div', { className: 'dash-empty-sub' }, 'Top sellers will appear once sales come in.')
            )
          : React.createElement(BrandedChart, {
              kind: 'bar',
              indexAxis: 'y',
              labels: topProductsBar.labels,
              datasets: [{ label: 'Revenue', data: topProductsBar.revenue, color: BRAND_COLORS.gold }],
              valueType: 'currency',
              hideLegend: true,
              height: 300
            })
      ),
      React.createElement(ChartCard, {
        title: 'Where the money went this month',
        subtitle: 'Bale spend vs. payroll vs. today\'s sales — quick health check at a glance.',
        height: 320
      },
        monthMix.values.every((v) => !v)
          ? React.createElement('div', { className: 'dash-empty' },
              React.createElement('div', { className: 'dash-empty-title' }, 'No financial activity yet'),
              React.createElement('div', { className: 'dash-empty-sub' }, 'This widget activates once spend or payroll is recorded.')
            )
          : React.createElement(BrandedChart, {
              kind: 'polarArea',
              labels: monthMix.labels,
              values: monthMix.values,
              valueType: 'currency',
              height: 300
            })
      )
    ),

    React.createElement('div', { className: 'dash-section-grid' },
      React.createElement('div', { className: 'card dash-section' },
        React.createElement('div', { className: 'card-header' },
          React.createElement('h3', null, 'Recent Sales'),
          React.createElement('span', { className: 'badge badge-neutral' }, `${recentSales.length} sales`)
        ),
        recentSales.length === 0 ?
          React.createElement('div', { className: 'dash-empty' },
            React.createElement('div', { className: 'dash-empty-title' }, 'No sales yet today'),
            React.createElement('div', { className: 'dash-empty-sub' }, 'Completed POS transactions appear here.')
          ) :
          React.createElement('div', { className: 'table-wrap responsive' },
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
                recentSales.slice(0, 10).map((s) =>
                  React.createElement('tr', { key: s.id },
                    React.createElement('td', { style: { fontWeight: 600 } }, s.sale_number || `#${s.id}`),
                    React.createElement('td', null, s.clerk || '—'),
                    React.createElement('td', { className: 'text-right', style: { fontWeight: 700, color: 'var(--gold-dark)' } }, fmtMoney(s.total)),
                    React.createElement('td', null,
                      React.createElement('span', { className: 'badge badge-neutral' }, s.payment_method || '—')
                    ),
                    React.createElement('td', { className: 'text-muted' }, new Date(s.date).toLocaleDateString('en-PH'))
                  )
                )
              )
            )
          )
      ),

      React.createElement('div', { className: 'card dash-section' },
        React.createElement('div', { className: 'card-header' },
          React.createElement('h3', null, isSalesClerk ? 'Top Products' : 'Top Products (Last 30 Days)'),
          React.createElement('span', { className: 'badge badge-primary' }, 'Bestsellers')
        ),
        topProducts.length === 0 ?
          React.createElement('div', { className: 'dash-empty' },
            React.createElement('div', { className: 'dash-empty-title' }, 'No bestsellers yet'),
            React.createElement('div', { className: 'dash-empty-sub' }, 'Top sellers will appear once sales come in.')
          ) :
          React.createElement('ul', { className: 'dash-top-list' },
            topProducts.slice(0, 8).map((p, i) =>
              React.createElement('li', { key: i, className: 'dash-top-row' },
                React.createElement('span', { className: 'dash-top-rank' }, i + 1),
                React.createElement('span', { className: 'dash-top-name' }, p.name),
                React.createElement('span', { className: 'dash-top-qty' }, `${fmtNumber(p.total_qty)} sold`),
                React.createElement('span', { className: 'dash-top-rev' }, fmtMoney(p.total_revenue))
              )
            )
          )
      )
    ),

    loading && React.createElement('div', { style: { marginTop: 16, color: 'var(--gray-500)' } }, 'Loading dashboard…')
  )
}
