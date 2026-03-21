import React, { useEffect, useState } from 'react'
import api from '../api/api.js'

const h = React.createElement
const fmt = (n) => Number(n || 0).toLocaleString('en-PH', { style: 'currency', currency: 'PHP' })

function StatCard(label, value, style) {
  return h('div', { className: 'card' },
    h('div', { className: 'card-title' }, label),
    h('div', { className: 'card-value-sm', style }, value)
  )
}

export default function Reports() {
  const [report, setReport] = useState(null)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  async function loadReport() {
    try {
      setLoading(true)
      setError(null)
      const params = []
      if (from) params.push(`from=${encodeURIComponent(from)}`)
      if (to) params.push(`to=${encodeURIComponent(to)}`)
      const res = await api.get(params.length ? `/reports/overview?${params.join('&')}` : '/reports/overview')
      setReport(res.data || null)
    } catch (err) {
      setError(err?.response?.data?.error || 'Failed to load reports')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadReport()
  }, [])

  return h('div', { className: 'page' },
    h('div', { className: 'page-header' }, h('div', null,
      h('h1', { className: 'page-title' }, 'Automated Reports'),
      h('p', { className: 'page-subtitle' }, 'Revenue, expenses, and sales summaries generated directly from live system data')
    )),
    error && h('div', { className: 'error-msg', style: { marginBottom: 16 } }, error),
    h('div', { className: 'card', style: { marginBottom: 16 } },
      h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 12, alignItems: 'end' } },
        h('div', { className: 'form-group', style: { marginBottom: 0 } }, h('label', { className: 'form-label' }, 'From'), h('input', { className: 'form-input', type: 'date', value: from, onChange: (e) => setFrom(e.target.value) })),
        h('div', { className: 'form-group', style: { marginBottom: 0 } }, h('label', { className: 'form-label' }, 'To'), h('input', { className: 'form-input', type: 'date', value: to, onChange: (e) => setTo(e.target.value) })),
        h('button', { className: 'btn btn-primary', onClick: loadReport, disabled: loading }, loading ? 'Refreshing...' : 'Refresh')
      )
    ),
    report && h(React.Fragment, null,
      h('h2', { style: { marginBottom: 12 } }, 'Revenue Report'),
      h('div', { className: 'dashboard-grid', style: { marginBottom: 20 } },
        StatCard('Gross Sales', fmt(report.revenue_report?.gross_sales)),
        StatCard('Discounts', fmt(report.revenue_report?.total_discounts), { color: 'var(--error)' }),
        StatCard('Tax Collected', fmt(report.revenue_report?.tax_collected)),
        StatCard('Net Revenue', fmt(report.revenue_report?.net_revenue)),
        StatCard('Returns', fmt(report.revenue_report?.returns_total), { color: 'var(--error)' }),
        StatCard('Net After Expenses', fmt(report.revenue_report?.net_after_expenses))
      ),
      h('h2', { style: { marginBottom: 12 } }, 'Expenses Report'),
      h('div', { className: 'dashboard-grid', style: { marginBottom: 20 } },
        StatCard('Total Expenses', fmt(report.expenses_report?.total_expenses)),
        StatCard('Approved / Paid', fmt(report.expenses_report?.approved_paid_expenses)),
        StatCard('Pending', fmt(report.expenses_report?.pending_expenses)),
        StatCard('Rejected', fmt(report.expenses_report?.rejected_expenses))
      ),
      h('div', { className: 'table-wrap', style: { marginBottom: 20 } }, h('table', null,
        h('thead', null, h('tr', null, h('th', null, 'Expense Category'), h('th', null, 'Entries'), h('th', null, 'Total'))),
        h('tbody', null, (report.expenses_report?.by_category || []).map((item) => h('tr', { key: item.category }, h('td', { style: { fontWeight: 600 } }, item.category), h('td', null, item.count), h('td', { style: { fontWeight: 600 } }, fmt(item.total)))))
      )),
      h('h2', { style: { marginBottom: 12 } }, 'Sales Report'),
      h('div', { className: 'dashboard-grid', style: { marginBottom: 20 } },
        StatCard('Total Orders', report.sales_report?.total_orders || 0),
        StatCard('Refunded Orders', report.sales_report?.refunded_orders || 0),
        StatCard('Return Transactions', report.sales_report?.return_transactions || 0),
        StatCard('Returned Units', report.sales_report?.returned_units || 0)
      ),
      h('div', { className: 'table-wrap', style: { marginBottom: 20 } }, h('table', null,
        h('thead', null, h('tr', null, h('th', null, 'Payment Method'), h('th', null, 'Transactions'), h('th', null, 'Total'))),
        h('tbody', null, (report.sales_report?.by_payment_method || []).map((item) => h('tr', { key: item.payment_method || 'unknown' }, h('td', { style: { fontWeight: 600 } }, item.payment_method || '—'), h('td', null, item.count), h('td', { style: { fontWeight: 600 } }, fmt(item.total)))))
      )),
      h('div', { className: 'table-wrap' }, h('table', null,
        h('thead', null, h('tr', null, h('th', null, 'Product'), h('th', null, 'Net Qty'), h('th', null, 'Returned Qty'), h('th', null, 'Net Sales'))),
        h('tbody', null, (report.sales_report?.top_products || []).map((item) => h('tr', { key: `${item.sku || item.name}` }, h('td', null, h('div', { style: { fontWeight: 600 } }, item.name || '—'), item.sku && h('div', { style: { fontSize: 11, color: 'var(--text-light)' } }, item.sku)), h('td', null, item.net_qty), h('td', null, item.returned_qty), h('td', { style: { fontWeight: 600 } }, fmt(item.net_sales)))))
      ))
    ),
    loading && h('div', { style: { color: 'var(--text-light)' } }, 'Loading...')
  )
}
