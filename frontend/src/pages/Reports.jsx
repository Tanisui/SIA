import React, { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import api from '../api/api.js'
import Pagination, { PaginationInfo } from '../components/Pagination.js'
import ReportSummaryCards from '../components/reports/ReportSummaryCards.jsx'
import ReportTable from '../components/reports/ReportTable.jsx'
import {
  ReportsLoadingState,
  ReportsErrorState,
  ReportsEmptyState
} from '../components/reports/ReportStates.jsx'
import {
  formatCurrency,
  formatNumber,
  formatDate,
  formatPercent,
  getFriendlyReportError,
  toNumber
} from '../utils/reportFormatters.js'
import BrandedChart, { ChartCard, BRAND_COLORS } from '../components/Chart.jsx'

const PAGE_SIZE = 12
const REPORT_TABS = [
  {
    key: 'directPurchases',
    label: 'Direct Purchases',
    description: 'Purchase orders for directly-sourced products (non-bale). Shows order status, supplier, items, and totals.'
  },
  {
    key: 'balePurchases',
    label: 'Bale Purchases',
    description: 'All bale purchases for the selected period, including supplier, category, and total cost.'
  },
  {
    key: 'baleBreakdowns',
    label: 'Bale Breakdown',
    description: 'Opening and sorting outcomes per bale, including Class A - Premium, Class B - Standard, and cost per saleable item.'
  },
  {
    key: 'salesByBale',
    label: 'Sales by Bale',
    description: 'Sold items traced back to source bale batches to verify true sales attribution.'
  },
  {
    key: 'baleProfitability',
    label: 'Bale Profitability',
    description: 'Revenue versus bale cost, including gross profit, sold pieces, remaining pieces, and sell-through.'
  },
  {
    key: 'supplierPerformance',
    label: 'Supplier Performance',
    description: 'Supplier-level averages and gross profit estimates based on bale outcomes and sales results.'
  },
  {
    key: 'inventoryMovement',
    label: 'Inventory Movement',
    description: 'Opening inventory, added pieces, sold pieces, damage/loss, and computed ending inventory.'
  }
]
const REPORT_TAB_KEYS = new Set(REPORT_TABS.map((tab) => tab.key))
const DEFAULT_REPORT_TAB = REPORT_TABS[0].key

function toDateOnly(value) {
  return value.toISOString().slice(0, 10)
}

function defaultDateRange() {
  const today = new Date()
  const from = new Date(today)
  from.setDate(from.getDate() - 29)
  return {
    from: toDateOnly(from),
    to: toDateOnly(today)
  }
}

function thisMonthRange() {
  const now = new Date()
  return {
    from: toDateOnly(new Date(now.getFullYear(), now.getMonth(), 1)),
    to: toDateOnly(new Date(now.getFullYear(), now.getMonth() + 1, 0))
  }
}

function lastMonthRange() {
  const now = new Date()
  return {
    from: toDateOnly(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
    to: toDateOnly(new Date(now.getFullYear(), now.getMonth(), 0))
  }
}

function thisYearRange() {
  const y = new Date().getFullYear()
  return { from: `${y}-01-01`, to: `${y}-12-31` }
}

function withQuery(from, to) {
  const params = []
  if (from) params.push(`from=${encodeURIComponent(from)}`)
  if (to) params.push(`to=${encodeURIComponent(to)}`)
  return params.length ? `?${params.join('&')}` : ''
}

function sectionHasRows(payload) {
  if (!payload) return false
  return [
    payload.balePurchases,
    payload.baleBreakdowns,
    payload.salesByBale,
    payload.baleProfitability,
    payload.supplierPerformance
  ].some((section) => Array.isArray(section) && section.length > 0)
}

function clampPage(target, totalPages) {
  return Math.max(1, Math.min(totalPages, Number(target) || 1))
}

function paginateRows(rows, currentPage, pageSize = PAGE_SIZE) {
  const totalPages = Math.max(1, Math.ceil((rows?.length || 0) / pageSize))
  const safePage = clampPage(currentPage, totalPages)
  const start = (safePage - 1) * pageSize
  return {
    rows: (rows || []).slice(start, start + pageSize),
    currentPage: safePage,
    totalPages
  }
}

function SectionHeader({ title, description }) {
  return (
    <div className="reports-section-header">
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
  )
}

function TablePagination({ sectionKey, rows, pages, setPages }) {
  if (!rows || rows.length <= PAGE_SIZE) return null
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const currentPage = clampPage(pages[sectionKey] || 1, totalPages)

  return (
    <div className="reports-pagination-wrap">
      <PaginationInfo current={currentPage} pageSize={PAGE_SIZE} total={rows.length} />
      <Pagination
        current={currentPage}
        total={totalPages}
        onPageChange={(nextPage) => {
          setPages((prev) => ({
            ...prev,
            [sectionKey]: clampPage(nextPage, totalPages)
          }))
        }}
      />
    </div>
  )
}

export default function Reports() {
  const location = useLocation()
  const navigate = useNavigate()

  const initialRange = defaultDateRange()
  const [from, setFrom] = useState(initialRange.from)
  const [to, setTo] = useState(initialRange.to)
  const [report, setReport] = useState(null)
  const [directReport, setDirectReport] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [pages, setPages] = useState({
    balePurchases: 1,
    baleBreakdowns: 1,
    salesByBale: 1,
    baleProfitability: 1,
    supplierPerformance: 1
  })

  async function loadDirectPurchases(fromValue = from, toValue = to) {
    try {
      const query = withQuery(fromValue, toValue)
      const res = await api.get(`/reports/direct-purchases${query}`)
      setDirectReport(res.data || null)
    } catch (err) {
      console.error('direct purchases report error', err)
      setDirectReport(null)
    }
  }

  async function loadReport({ keepData = true, fromValue = from, toValue = to } = {}) {
    try {
      setLoading(true)
      setError(null)
      if (!keepData) setReport(null)
      const query = withQuery(fromValue, toValue)
      const [baleRes] = await Promise.all([
        api.get(`/reports/automated${query}`),
        loadDirectPurchases(fromValue, toValue)
      ])
      setReport(baleRes.data || null)
    } catch (err) {
      setError(getFriendlyReportError(err))
    } finally {
      setLoading(false)
    }
  }

  function applyRange(range) {
    setFrom(range.from)
    setTo(range.to)
    loadReport({ fromValue: range.from, toValue: range.to })
  }

  useEffect(() => {
    loadReport({ keepData: false })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const activeTab = useMemo(() => {
    const params = new URLSearchParams(location.search)
    const searchTab = String(params.get('tab') || '').trim()
    const hashTab = String(location.hash || '').replace(/^#/, '')
    if (REPORT_TAB_KEYS.has(searchTab)) return searchTab
    if (REPORT_TAB_KEYS.has(hashTab)) return hashTab
    return DEFAULT_REPORT_TAB
  }, [location.hash, location.search])

  useEffect(() => {
    setPages((prev) => ({
      ...prev,
      [activeTab]: 1
    }))
  }, [activeTab])

  useEffect(() => {
    if (location.pathname !== '/reports') return
    const params = new URLSearchParams(location.search)
    const currentTab = String(params.get('tab') || '').trim()
    if (currentTab === activeTab && !location.hash) return
    params.set('tab', activeTab)
    navigate(`/reports?${params.toString()}`, { replace: true, preventScrollReset: true })
  }, [location.pathname, location.search, location.hash, activeTab, navigate])

  const activeTabMeta = useMemo(() => {
    return REPORT_TABS.find((tab) => tab.key === activeTab) || REPORT_TABS[0]
  }, [activeTab])

  const summaryCards = useMemo(() => {
    const summary = report?.summary || {}
    return [
      { key: 'total-sales', label: 'Bale-linked Sales', value: formatCurrency(summary.totalSales), tone: 'default' },
      { key: 'total-bale-purchases', label: 'Total Bale Purchases', value: formatCurrency(summary.totalBalePurchases), tone: 'default' },
      {
        key: 'gross-profit',
        label: 'Bale Gross Profit',
        value: formatCurrency(summary.grossProfit),
        tone: toNumber(summary.grossProfit) >= 0 ? 'success' : 'danger'
      },
      { key: 'bales-purchased', label: 'Bales Purchased', value: formatNumber(summary.balesPurchased), tone: 'default' },
      { key: 'items-added', label: 'Saleable Pieces From Breakdown', value: formatNumber(summary.itemsAddedToInventory), tone: 'default' },
      { key: 'items-sold', label: 'Items Sold', value: formatNumber(summary.itemsSold), tone: 'default' },
      {
        key: 'damaged-unsellable',
        label: 'Damaged / Unsellable Items',
        value: formatNumber(summary.damagedUnsellableItems),
        tone: 'danger'
      },
      {
        key: 'remaining-saleable',
        label: 'Current Remaining Stock',
        value: formatNumber(summary.remainingSaleableItems),
        tone: 'info'
      }
    ]
  }, [report])

  const hasRows = sectionHasRows(report)

  const balePurchasesRows = report?.balePurchases || []
  const balePurchasesPage = paginateRows(balePurchasesRows, pages.balePurchases)

  const baleBreakdownRows = report?.baleBreakdowns || []
  const baleBreakdownPage = paginateRows(baleBreakdownRows, pages.baleBreakdowns)

  const salesByBaleRows = report?.salesByBale || []
  const salesByBalePage = paginateRows(salesByBaleRows, pages.salesByBale)

  const baleProfitabilityRows = report?.baleProfitability || []
  const baleProfitabilityPage = paginateRows(baleProfitabilityRows, pages.baleProfitability)

  const supplierPerformanceRows = report?.supplierPerformance || []
  const supplierPerformancePage = paginateRows(supplierPerformanceRows, pages.supplierPerformance)

  function renderSection() {
    if (!report && activeTab !== 'directPurchases') return null

    if (activeTab === 'directPurchases') {
      const dr = directReport || {}
      const orders = dr.orders || []
      const items = dr.items || []
      const summary = dr.summary || {}

      // Charts: status breakdown + top suppliers by total
      const statusBuckets = orders.reduce((acc, o) => {
        const k = String(o.status || 'PENDING').toUpperCase()
        acc[k] = (acc[k] || 0) + 1
        return acc
      }, {})
      const statusLabels = Object.keys(statusBuckets)
      const statusValues = statusLabels.map((k) => statusBuckets[k])

      const supplierTotals = orders.reduce((acc, o) => {
        const k = String(o.supplier_name || 'No supplier')
        acc[k] = (acc[k] || 0) + Number(o.total || 0)
        return acc
      }, {})
      const topSuppliersDP = Object.entries(supplierTotals).sort((a, b) => b[1] - a[1]).slice(0, 8)
      return (
        <>
          <div className="reports-summary-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 16 }}>
            {[
              { label: 'Total Orders', value: summary.total_orders ?? 0, money: false },
              { label: 'Received Orders', value: summary.received_orders ?? 0, money: false },
              { label: 'Open Orders', value: summary.open_orders ?? 0, money: false },
              { label: 'Total Amount', value: summary.total_amount ?? 0, money: true },
              { label: 'Received Amount', value: summary.received_amount ?? 0, money: true }
            ].map(({ label, value, money }) => (
              <div key={label} className="card reports-summary-card">
                <div className="card-title">{label}</div>
                <div className="card-value-sm">{money ? formatCurrency(value) : formatNumber(value)}</div>
              </div>
            ))}
          </div>

          {orders.length > 0 && (
            <div className="chart-grid-2" style={{ marginBottom: 16 }}>
              <ChartCard
                title="Top Suppliers by PO Total"
                subtitle="Suppliers ranked by the sum of their direct purchase orders in this date range."
                kpi={{ label: 'Suppliers', value: topSuppliersDP.length }}
                height={300}
              >
                <BrandedChart
                  kind="bar"
                  indexAxis="y"
                  labels={topSuppliersDP.map(([k]) => k)}
                  datasets={[{ label: 'PO Total', data: topSuppliersDP.map(([, v]) => v), color: BRAND_COLORS.gold }]}
                  valueType="currency"
                  hideLegend
                  height={280}
                />
              </ChartCard>
              <ChartCard
                title="Order Status Mix"
                subtitle="How POs split between received, pending, and cancelled."
                kpi={{ label: 'Orders', value: orders.length }}
                height={300}
              >
                <BrandedChart
                  kind="doughnut"
                  labels={statusLabels}
                  values={statusValues}
                  height={280}
                />
              </ChartCard>
            </div>
          )}

          <ReportTable
            rows={orders}
            emptyTitle="No purchase orders found for this date range."
            emptyDescription="Try selecting a wider date range or check if purchase orders have been created."
            columns={[
              { key: 'po_number', label: 'PO Number' },
              { key: 'created_at', label: 'Date', render: (v) => formatDate(v) },
              { key: 'expected_date', label: 'Expected', render: (v) => formatDate(v) },
              { key: 'supplier_name', label: 'Supplier', render: (v) => v || 'No supplier' },
              { key: 'item_count', label: 'Items', align: 'right', render: (v) => formatNumber(v) },
              { key: 'total', label: 'Total', align: 'right', render: (v) => formatCurrency(v) },
              {
                key: 'status',
                label: 'Status',
                render: (v) => (
                  <span className={`badge badge-${v === 'RECEIVED' ? 'success' : v === 'CANCELLED' ? 'danger' : 'neutral'}`}>
                    {v}
                  </span>
                )
              }
            ]}
            footer={{
              po_number: 'TOTAL',
              total: formatCurrency(summary.total_amount)
            }}
          />

          {items.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--gold-dark)' }}>
                All Line Items
              </div>
              <ReportTable
                rows={items}
                emptyTitle="No line items found."
                columns={[
                  { key: 'po_number', label: 'PO Number' },
                  { key: 'product_name', label: 'Product' },
                  { key: 'product_sku', label: 'SKU' },
                  { key: 'quantity', label: 'Qty', align: 'right', render: (v) => formatNumber(v) },
                  { key: 'unit_cost', label: 'Unit Cost', align: 'right', render: (v) => formatCurrency(v) },
                  { key: 'line_total', label: 'Line Total', align: 'right', render: (v) => formatCurrency(v) },
                  { key: 'po_status', label: 'PO Status' }
                ]}
                footer={{
                  po_number: 'TOTAL',
                  line_total: formatCurrency(items.reduce((s, r) => s + Number(r.line_total || 0), 0))
                }}
              />
            </div>
          )}
        </>
      )
    }

    if (activeTab === 'balePurchases') {
      // Spend per supplier across the date range
      const supplierSpend = (balePurchasesRows || []).reduce((acc, row) => {
        const k = String(row.supplier_name || 'Unknown')
        acc[k] = (acc[k] || 0) + Number(row.total_purchase_cost || 0)
        return acc
      }, {})
      const topSuppliersBP = Object.entries(supplierSpend).sort((a, b) => b[1] - a[1]).slice(0, 8)
      return (
        <>
          {balePurchasesRows.length > 0 && (
            <div className="chart-grid-2" style={{ marginBottom: 16 }}>
              <ChartCard
                title="Bale Spend by Supplier"
                subtitle="Total purchase cost per supplier (bale + freight + handling)."
                kpi={{ label: 'Total', value: formatCurrency(report?.balePurchasesTotals?.totalPurchaseCost) }}
                height={300}
              >
                <BrandedChart
                  kind="bar"
                  indexAxis="y"
                  labels={topSuppliersBP.map(([k]) => k)}
                  datasets={[{ label: 'Spend', data: topSuppliersBP.map(([, v]) => v), color: BRAND_COLORS.gold }]}
                  valueType="currency"
                  hideLegend
                  height={280}
                />
              </ChartCard>
              <ChartCard
                title="Bale Cost vs Total Cost"
                subtitle="How much of total purchase cost is the bale itself, batch by batch."
                height={300}
              >
                <BrandedChart
                  kind="bar"
                  labels={(balePurchasesRows.slice(0, 12)).map((r) => r.bale_batch_no)}
                  datasets={[
                    { label: 'Bale Cost',  data: balePurchasesRows.slice(0, 12).map((r) => Number(r.bale_cost || 0)), color: BRAND_COLORS.tan },
                    { label: 'Total Cost', data: balePurchasesRows.slice(0, 12).map((r) => Number(r.total_purchase_cost || 0)), color: BRAND_COLORS.goldDark }
                  ]}
                  valueType="currency"
                  height={280}
                />
              </ChartCard>
            </div>
          )}
          <ReportTable
            rows={balePurchasesPage.rows}
            emptyTitle="No bale purchases found for this date range."
            emptyDescription="Try selecting a different date range."
            columns={[
              { key: 'bale_batch_no', label: 'Bale Batch No.' },
              { key: 'purchase_date', label: 'Purchase Date', render: (value) => formatDate(value) },
              { key: 'supplier_name', label: 'Supplier Name' },
              { key: 'bale_category', label: 'Bale Category' },
              { key: 'bale_cost', label: 'Bale Cost', align: 'right', render: (value) => formatCurrency(value) },
              { key: 'total_purchase_cost', label: 'Total Purchase Cost', align: 'right', render: (value) => formatCurrency(value) }
            ]}
            footer={{
              bale_batch_no: 'TOTAL',
              bale_cost: formatCurrency(report?.balePurchasesTotals?.baleCost),
              total_purchase_cost: formatCurrency(report?.balePurchasesTotals?.totalPurchaseCost)
            }}
          />
          <TablePagination
            sectionKey="balePurchases"
            rows={balePurchasesRows}
            pages={pages}
            setPages={setPages}
          />
        </>
      )
    }

    if (activeTab === 'baleBreakdowns') {
      return (
        <>
          <ReportTable
            rows={baleBreakdownPage.rows}
            emptyTitle="No bale breakdown records found."
            emptyDescription="No opened/sorted bale results were recorded in this period."
            columns={[
              { key: 'bale_batch_no', label: 'Bale Batch No.' },
              { key: 'total_pieces', label: 'Total Pieces', align: 'right', render: (value) => formatNumber(value) },
              { key: 'saleable_items', label: 'Saleable Items', align: 'right', render: (value) => formatNumber(value) },
              { key: 'premium_items', label: 'Class A - Premium', align: 'right', render: (value) => formatNumber(value) },
              {
                key: 'standard_items',
                label: 'Class B - Standard',
                align: 'right',
                render: (value, row) => formatNumber(toNumber(value) + toNumber(row.low_grade_items))
              },
              { key: 'damaged_items', label: 'Damaged / Unsellable', align: 'right', render: (value) => formatNumber(value) },
              { key: 'cost_per_saleable_item', label: 'Cost per Saleable Item', align: 'right', render: (value) => formatCurrency(value) }
            ]}
          />
          <TablePagination
            sectionKey="baleBreakdowns"
            rows={baleBreakdownRows}
            pages={pages}
            setPages={setPages}
          />
        </>
      )
    }

    if (activeTab === 'salesByBale') {
      // Daily revenue trend from bale-linked sales
      const byDate = (salesByBaleRows || []).reduce((acc, r) => {
        const key = String(r.date_sold || '').slice(0, 10)
        if (!key) return acc
        acc[key] = (acc[key] || 0) + Number(r.sales_total || 0)
        return acc
      }, {})
      const trend = Object.entries(byDate).sort(([a], [b]) => (a < b ? -1 : 1))
      return (
        <>
          {salesByBaleRows.length > 0 && (
            <div className="chart-grid-2" style={{ marginBottom: 16 }}>
              <ChartCard
                title="Daily Bale Sales Trend"
                subtitle="Revenue from bale-linked items, day by day. Higher line = stronger day."
                kpi={{ label: 'Total', value: formatCurrency(report?.salesByBaleTotals?.salesTotal) }}
                height={300}
              >
                <BrandedChart
                  kind="line"
                  labels={trend.map(([d]) => new Date(d).toLocaleDateString('en-PH', { month: 'short', day: '2-digit' }))}
                  datasets={[{ label: 'Sales', data: trend.map(([, v]) => Math.round(v)), color: BRAND_COLORS.gold, area: true }]}
                  valueType="currency"
                  hideLegend
                  height={280}
                />
              </ChartCard>
              <ChartCard
                title="Top Bale Batches by Revenue"
                subtitle="Which bale batches sold the most pesos worth of goods."
                height={300}
              >
                <BrandedChart
                  kind="bar"
                  indexAxis="y"
                  labels={Object.entries((salesByBaleRows || []).reduce((acc, r) => {
                    const k = String(r.bale_batch_no || 'Unbatched'); acc[k] = (acc[k] || 0) + Number(r.sales_total || 0); return acc
                  }, {})).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k]) => k)}
                  datasets={[{
                    label: 'Revenue',
                    data: Object.entries((salesByBaleRows || []).reduce((acc, r) => {
                      const k = String(r.bale_batch_no || 'Unbatched'); acc[k] = (acc[k] || 0) + Number(r.sales_total || 0); return acc
                    }, {})).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([, v]) => v),
                    color: BRAND_COLORS.tan
                  }]}
                  valueType="currency"
                  hideLegend
                  height={280}
                />
              </ChartCard>
            </div>
          )}
          <ReportTable
            rows={salesByBalePage.rows}
            emptyTitle="No sales linked to bale inventory were found."
            emptyDescription="Try selecting a different date range."
            columns={[
              { key: 'date_sold', label: 'Date Sold', render: (value) => formatDate(value) },
              { key: 'item_code', label: 'Item Code' },
              { key: 'product_name', label: 'Product Name / Short Description' },
              { key: 'category', label: 'Category' },
              { key: 'bale_batch_no', label: 'Bale Batch No.' },
              { key: 'selling_price', label: 'Selling Price', align: 'right', render: (value) => formatCurrency(value) },
              { key: 'quantity', label: 'Quantity', align: 'right', render: (value) => formatNumber(value) },
              { key: 'sales_total', label: 'Sales Total', align: 'right', render: (value) => formatCurrency(value) }
            ]}
            footer={{
              item_code: 'TOTAL',
              quantity: formatNumber(report?.salesByBaleTotals?.quantity),
              sales_total: formatCurrency(report?.salesByBaleTotals?.salesTotal)
            }}
          />
          <TablePagination
            sectionKey="salesByBale"
            rows={salesByBaleRows}
            pages={pages}
            setPages={setPages}
          />
        </>
      )
    }

    if (activeTab === 'baleProfitability') {
      const bestBale = report?.profitabilityHighlights?.best_performing_bale
      const worstBale = report?.profitabilityHighlights?.worst_performing_bale

      return (
        <>
          {(bestBale || worstBale) ? (
            <div className="reports-highlight-grid">
              <div className="card reports-highlight-card reports-highlight-positive">
                <div className="card-title">Best Performing Bale</div>
                {bestBale ? (
                  <>
                    <div className="reports-highlight-batch">{bestBale.bale_batch_no}</div>
                    <div className="reports-highlight-meta">
                      {bestBale.supplier_name} | Gross Profit {formatCurrency(bestBale.gross_profit)}
                    </div>
                  </>
                ) : (
                  <div className="reports-highlight-meta">No profitable bale found in this date range.</div>
                )}
              </div>

              <div className="card reports-highlight-card reports-highlight-negative">
                <div className="card-title">Lowest Performing Bale</div>
                {worstBale ? (
                  <>
                    <div className="reports-highlight-batch">{worstBale.bale_batch_no}</div>
                    <div className="reports-highlight-meta">
                      {worstBale.supplier_name} | Gross Profit {formatCurrency(worstBale.gross_profit)}
                    </div>
                  </>
                ) : (
                  <div className="reports-highlight-meta">No low-performing bale found in this date range.</div>
                )}
              </div>
            </div>
          ) : null}

          {baleProfitabilityRows.length > 0 && (
            <div className="chart-grid-2" style={{ marginBottom: 16 }}>
              <ChartCard
                title="Cost vs Revenue per Bale"
                subtitle="For each bale: how much you paid (gold) vs how much it has earned (green). Closer columns = thinner margin."
                height={320}
              >
                <BrandedChart
                  kind="bar"
                  labels={baleProfitabilityRows.slice(0, 12).map((r) => r.bale_batch_no)}
                  datasets={[
                    { label: 'Total Cost', data: baleProfitabilityRows.slice(0, 12).map((r) => Number(r.total_purchase_cost || 0)), color: BRAND_COLORS.goldDark },
                    { label: 'Revenue',    data: baleProfitabilityRows.slice(0, 12).map((r) => Number(r.revenue_generated || 0)), color: BRAND_COLORS.success }
                  ]}
                  valueType="currency"
                  height={300}
                />
              </ChartCard>
              <ChartCard
                title="Sell-through Rate"
                subtitle="What % of each bale has been sold. 100% = bale fully cleared."
                height={320}
              >
                <BrandedChart
                  kind="bar"
                  indexAxis="y"
                  labels={baleProfitabilityRows.slice(0, 12).map((r) => r.bale_batch_no)}
                  datasets={[{ label: 'Sell-through %', data: baleProfitabilityRows.slice(0, 12).map((r) => Number(r.sell_through_rate || 0)), color: BRAND_COLORS.gold }]}
                  hideLegend
                  height={300}
                />
              </ChartCard>
            </div>
          )}

          <ReportTable
            rows={baleProfitabilityPage.rows}
            emptyTitle="No bale profitability rows found."
            emptyDescription="Bale purchases and linked sales are needed to compute profitability."
            columns={[
              { key: 'bale_batch_no', label: 'Bale Batch No.' },
              { key: 'supplier_name', label: 'Supplier Name' },
              { key: 'bale_type', label: 'Bale Type' },
              { key: 'total_purchase_cost', label: 'Total Purchase Cost', align: 'right', render: (value) => formatCurrency(value) },
              { key: 'revenue_generated', label: 'Revenue Generated', align: 'right', render: (value) => formatCurrency(value) },
              {
                key: 'gross_profit',
                label: 'Gross Profit',
                align: 'right',
                render: (value) => (
                  <span style={{ color: toNumber(value) >= 0 ? 'var(--success)' : 'var(--error)', fontWeight: 600 }}>
                    {formatCurrency(value)}
                  </span>
                )
              },
              { key: 'sold_pieces', label: 'Sold Pieces', align: 'right', render: (value) => formatNumber(value) },
              { key: 'remaining_pieces', label: 'Remaining Pieces', align: 'right', render: (value) => formatNumber(value) },
              { key: 'sell_through_rate', label: 'Sell-through Rate', align: 'right', render: (value) => formatPercent(value) }
            ]}
          />
          <TablePagination
            sectionKey="baleProfitability"
            rows={baleProfitabilityRows}
            pages={pages}
            setPages={setPages}
          />
        </>
      )
    }

    if (activeTab === 'supplierPerformance') {
      const sp = supplierPerformanceRows || []
      return (
        <>
          <div className="reports-inline-note">
            Supplier performance now uses only the bales purchased within the selected date range, so bale count, averages, revenue, and gross profit stay aligned.
          </div>
          {sp.length > 0 && (
            <div className="chart-grid-2" style={{ marginBottom: 16 }}>
              <ChartCard
                title="Revenue vs Gross Profit by Supplier"
                subtitle="Bigger blue bar = more revenue. Bigger green/red = stronger profit margin."
                height={320}
              >
                <BrandedChart
                  kind="bar"
                  labels={sp.slice(0, 10).map((r) => r.supplier_name)}
                  datasets={[
                    { label: 'Revenue',     data: sp.slice(0, 10).map((r) => Number(r.total_revenue_generated || 0)), color: BRAND_COLORS.gold },
                    { label: 'Gross Profit', data: sp.slice(0, 10).map((r) => Number(r.estimated_gross_profit || 0)), color: BRAND_COLORS.success }
                  ]}
                  valueType="currency"
                  height={300}
                />
              </ChartCard>
              <ChartCard
                title="Bales Purchased per Supplier"
                subtitle="How many bales we bought from each supplier in this period."
                height={320}
              >
                <BrandedChart
                  kind="bar"
                  indexAxis="y"
                  labels={sp.slice(0, 10).map((r) => r.supplier_name)}
                  datasets={[{ label: 'Bales', data: sp.slice(0, 10).map((r) => Number(r.number_of_bales_purchased || 0)), color: BRAND_COLORS.tan }]}
                  hideLegend
                  height={300}
                />
              </ChartCard>
            </div>
          )}
          <ReportTable
            rows={supplierPerformancePage.rows}
            emptyTitle="No supplier performance records found."
            emptyDescription="No supplier-linked bale activity was found for this period."
            columns={[
              { key: 'supplier_name', label: 'Supplier' },
              { key: 'number_of_bales_purchased', label: 'Bales', align: 'right', render: (value) => formatNumber(value) },
              {
                key: 'averages',
                label: 'Bale Averages',
                render: (_, row) => (
                  <div className="reports-metric-stack">
                    <strong>{formatCurrency(row.average_bale_cost)}</strong>
                    <span>{formatNumber(row.average_saleable_items)} saleable | {formatNumber(row.average_damaged_items)} damaged</span>
                  </div>
                )
              },
              { key: 'total_revenue_generated', label: 'Revenue', align: 'right', render: (value) => formatCurrency(value) },
              {
                key: 'estimated_gross_profit',
                label: 'Gross Profit',
                align: 'right',
                render: (value) => (
                  <span style={{ color: toNumber(value) >= 0 ? 'var(--success)' : 'var(--error)', fontWeight: 600 }}>
                    {formatCurrency(value)}
                  </span>
                )
              },
              { key: 'best_performing_bale', label: 'Best Bale' }
            ]}
          />
          <TablePagination
            sectionKey="supplierPerformance"
            rows={supplierPerformanceRows}
            pages={pages}
            setPages={setPages}
          />
        </>
      )
    }

    const movement = report?.inventoryMovement || {}
    const movementLabels = ['Opening', 'Added (Bales)', 'Sold', 'Damaged / Loss', 'Ending']
    const movementValues = [
      Number(movement.openingInventory || 0),
      Number(movement.itemsAddedFromBales || 0),
      Number(movement.itemsSold || 0),
      Number(movement.damagedLoss || 0),
      Number(movement.endingInventory || 0)
    ]
    return (
      <div className="reports-movement-wrap">
        <div className="chart-grid-2" style={{ marginBottom: 16 }}>
          <ChartCard
            title="Inventory Movement at a Glance"
            subtitle="Opening + Added − Sold − Damaged = Ending. Hover any bar for the exact unit count."
            height={300}
          >
            <BrandedChart
              kind="bar"
              labels={movementLabels}
              datasets={[{
                label: 'Units',
                data: movementValues,
                color: BRAND_COLORS.gold
              }]}
              hideLegend
              height={280}
            />
          </ChartCard>
          <ChartCard
            title="Where Stock Went"
            subtitle="Of the items added this period, how they split between sold, damaged/loss, and still on hand."
            height={300}
          >
            <BrandedChart
              kind="polarArea"
              labels={['Sold', 'Damaged / Loss', 'Ending On Hand']}
              values={[
                Number(movement.itemsSold || 0),
                Number(movement.damagedLoss || 0),
                Number(movement.endingInventory || 0)
              ]}
              height={280}
            />
          </ChartCard>
        </div>
        <ReportTable
          rows={[{
            opening_inventory: movement.openingInventory,
            added: movement.itemsAddedFromBales,
            sold: movement.itemsSold,
            damaged_loss: movement.damagedLoss,
            ending_inventory: movement.endingInventory
          }]}
          columns={[
            { key: 'opening_inventory', label: 'Opening Inventory', align: 'right', render: (value) => formatNumber(value) },
            { key: 'added', label: 'Items Added from Bales', align: 'right', render: (value) => formatNumber(value) },
            { key: 'sold', label: 'Items Sold', align: 'right', render: (value) => formatNumber(value) },
            { key: 'damaged_loss', label: 'Damaged / Loss', align: 'right', render: (value) => formatNumber(value) },
            { key: 'ending_inventory', label: 'Ending Inventory', align: 'right', render: (value) => formatNumber(value) }
          ]}
        />
        <div className="card reports-formula-card">
          Ending Inventory = Opening + Added − Sold − Damaged/Loss
        </div>
      </div>
    )
  }

  return (
    <div className="page reports-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Automated Reports</h1>
          <p className="page-subtitle">
            Bale purchases, item breakdown, sales, and profit summaries generated from live boutique data.
          </p>
        </div>
      </div>

      <div className="card reports-filter-card">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => applyRange(thisMonthRange())}>This Month</button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => applyRange(lastMonthRange())}>Last Month</button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => applyRange(thisYearRange())}>This Year</button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => applyRange(defaultDateRange())}>Last 30 Days</button>
        </div>
        <div className="reports-filter-grid">
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">From Date</label>
            <input
              className="form-input"
              type="date"
              value={from}
              onChange={(event) => {
                const v = event.target.value
                setFrom(v)
                if (v && to) loadReport({ fromValue: v, toValue: to })
              }}
              max={to || undefined}
            />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">To Date</label>
            <input
              className="form-input"
              type="date"
              value={to}
              onChange={(event) => {
                const v = event.target.value
                setTo(v)
                if (from && v) loadReport({ fromValue: from, toValue: v })
              }}
              min={from || undefined}
            />
          </div>
          <button className="btn btn-primary reports-refresh-btn" onClick={() => loadReport({ fromValue: from, toValue: to })} disabled={loading}>
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>

      {error && report ? <div className="error-msg reports-inline-error">{error}</div> : null}

      {!report && loading ? <ReportsLoadingState /> : null}
      {!report && error ? (
        <ReportsErrorState
          message={error}
          onRetry={() => loadReport({ keepData: false })}
        />
      ) : null}

      {activeTab === 'directPurchases' ? (
        <div className="card reports-section-card">
          <SectionHeader title={activeTabMeta.label} description={activeTabMeta.description} />
          {renderSection()}
        </div>
      ) : report ? (
        <>
          <ReportSummaryCards cards={summaryCards} loading={loading} />

          {!hasRows ? (
            <ReportsEmptyState
              onResetRange={() => {
                const defaults = defaultDateRange()
                setFrom(defaults.from)
                setTo(defaults.to)
                loadReport({ fromValue: defaults.from, toValue: defaults.to })
              }}
            />
          ) : (
            <>
              <div className="card reports-section-card">
                <SectionHeader title={activeTabMeta.label} description={activeTabMeta.description} />
                {renderSection()}
              </div>
            </>
          )}
        </>
      ) : null}
    </div>
  )
}
