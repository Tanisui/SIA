import React, { useEffect, useMemo, useState } from 'react'
import api from '../api/api.js'
import Badge from '../components/Badge.js'
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

const PAGE_SIZE = 12
const REPORT_TABS = [
  {
    key: 'balePurchases',
    label: 'Bale Purchases',
    description: 'All bale purchases for the selected period, including landed costs and payment status.'
  },
  {
    key: 'baleBreakdowns',
    label: 'Bale Breakdown',
    description: 'Opening and sorting outcomes per bale, including quality tiers and cost per saleable item.'
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

function withQuery(from, to) {
  const params = []
  if (from) params.push(`from=${encodeURIComponent(from)}`)
  if (to) params.push(`to=${encodeURIComponent(to)}`)
  return params.length ? `?${params.join('&')}` : ''
}

function paymentStatusVariant(status) {
  const normalized = String(status || '').toLowerCase()
  if (normalized === 'paid') return 'success'
  if (normalized === 'partial') return 'warning'
  if (normalized === 'unpaid') return 'danger'
  return 'neutral'
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
  const initialRange = defaultDateRange()
  const [from, setFrom] = useState(initialRange.from)
  const [to, setTo] = useState(initialRange.to)
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [activeTab, setActiveTab] = useState(REPORT_TABS[0].key)
  const [pages, setPages] = useState({
    balePurchases: 1,
    baleBreakdowns: 1,
    salesByBale: 1,
    baleProfitability: 1,
    supplierPerformance: 1
  })

  async function loadReport({ keepData = true, fromValue = from, toValue = to } = {}) {
    try {
      setLoading(true)
      setError(null)
      if (!keepData) setReport(null)
      const query = withQuery(fromValue, toValue)
      const res = await api.get(`/reports/automated${query}`)
      setReport(res.data || null)
    } catch (err) {
      setError(getFriendlyReportError(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadReport({ keepData: false })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    setPages((prev) => ({
      ...prev,
      [activeTab]: 1
    }))
  }, [activeTab])

  const activeTabMeta = useMemo(() => {
    return REPORT_TABS.find((tab) => tab.key === activeTab) || REPORT_TABS[0]
  }, [activeTab])

  const summaryCards = useMemo(() => {
    const summary = report?.summary || {}
    return [
      { key: 'total-sales', label: 'Total Sales', value: formatCurrency(summary.totalSales), tone: 'default' },
      { key: 'total-bale-purchases', label: 'Total Bale Purchases', value: formatCurrency(summary.totalBalePurchases), tone: 'default' },
      {
        key: 'gross-profit',
        label: 'Gross Profit',
        value: formatCurrency(summary.grossProfit),
        tone: toNumber(summary.grossProfit) >= 0 ? 'success' : 'danger'
      },
      { key: 'bales-purchased', label: 'Bales Purchased', value: formatNumber(summary.balesPurchased), tone: 'default' },
      { key: 'items-added', label: 'Items Added to Inventory', value: formatNumber(summary.itemsAddedToInventory), tone: 'default' },
      { key: 'items-sold', label: 'Items Sold', value: formatNumber(summary.itemsSold), tone: 'default' },
      {
        key: 'damaged-unsellable',
        label: 'Damaged / Unsellable Items',
        value: formatNumber(summary.damagedUnsellableItems),
        tone: 'danger'
      },
      {
        key: 'remaining-saleable',
        label: 'Remaining Saleable Items',
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
    if (!report) return null

    if (activeTab === 'balePurchases') {
      return (
        <>
          <ReportTable
            rows={balePurchasesPage.rows}
            emptyTitle="No bale purchases found for this date range."
            emptyDescription="Try selecting a different date range."
            columns={[
              { key: 'bale_batch_no', label: 'Bale Batch No.' },
              { key: 'purchase_date', label: 'Purchase Date', render: (value) => formatDate(value) },
              { key: 'supplier_name', label: 'Supplier Name' },
              { key: 'bale_type', label: 'Bale Type / Category' },
              { key: 'bale_cost', label: 'Bale Cost', align: 'right', render: (value) => formatCurrency(value) },
              { key: 'total_purchase_cost', label: 'Total Purchase Cost', align: 'right', render: (value) => formatCurrency(value) },
              {
                key: 'payment_status',
                label: 'Payment Status',
                render: (value) => (
                  <Badge variant={paymentStatusVariant(value)}>
                    {String(value || 'UNPAID').toUpperCase()}
                  </Badge>
                )
              }
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
              { key: 'premium_items', label: 'Premium Items', align: 'right', render: (value) => formatNumber(value) },
              { key: 'standard_items', label: 'Standard Items', align: 'right', render: (value) => formatNumber(value) },
              { key: 'low_grade_items', label: 'Low-grade Items', align: 'right', render: (value) => formatNumber(value) },
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
      return (
        <>
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
      return (
        <>
          <ReportTable
            rows={supplierPerformancePage.rows}
            emptyTitle="No supplier performance records found."
            emptyDescription="No supplier-linked bale activity was found for this period."
            columns={[
              { key: 'supplier_name', label: 'Supplier Name' },
              { key: 'number_of_bales_purchased', label: 'Number of Bales Purchased', align: 'right', render: (value) => formatNumber(value) },
              { key: 'average_bale_cost', label: 'Average Bale Cost', align: 'right', render: (value) => formatCurrency(value) },
              { key: 'average_saleable_items', label: 'Average Saleable Items', align: 'right', render: (value) => formatNumber(value) },
              { key: 'average_damaged_items', label: 'Average Damaged Items', align: 'right', render: (value) => formatNumber(value) },
              { key: 'total_revenue_generated', label: 'Total Revenue Generated', align: 'right', render: (value) => formatCurrency(value) },
              { key: 'estimated_gross_profit', label: 'Estimated Gross Profit', align: 'right', render: (value) => formatCurrency(value) },
              { key: 'best_performing_bale', label: 'Best Performing Bale' }
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
    return (
      <div className="reports-movement-wrap">
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
          Ending Inventory = Opening + Added - Sold - Damaged/Loss
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
        <div className="reports-filter-grid">
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">From Date</label>
            <input
              className="form-input"
              type="date"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
              max={to || undefined}
            />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">To Date</label>
            <input
              className="form-input"
              type="date"
              value={to}
              onChange={(event) => setTo(event.target.value)}
              min={from || undefined}
            />
          </div>
          <button className="btn btn-primary reports-refresh-btn" onClick={() => loadReport()} disabled={loading}>
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

      {report ? (
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
              <div className="reports-tabs">
                {REPORT_TABS.map((tab) => (
                  <button
                    key={tab.key}
                    className={`reports-tab ${activeTab === tab.key ? 'reports-tab-active' : ''}`}
                    onClick={() => setActiveTab(tab.key)}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

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
