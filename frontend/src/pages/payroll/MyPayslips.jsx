import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../../api/api.js'
import { formatCurrency, formatDate } from './payrollUtils.js'
import Icon from '../../components/Icons.js'

const FREQ_LABEL = { daily: 'Daily', weekly: 'Weekly', semi_monthly: 'Semi-Monthly', monthly: 'Monthly' }

const STATUS_META = {
  draft:     { label: 'Draft',     tone: 'muted',   description: 'Not yet computed.' },
  computed:  { label: 'Computed',  tone: 'info',    description: 'Calculated. Awaiting finalization.' },
  finalized: { label: 'Finalized', tone: 'warning', description: 'Locked. Awaiting release.' },
  released:  { label: 'Released',  tone: 'success', description: 'Released — your payslip is available.' },
  void:      { label: 'Voided',    tone: 'error',   description: 'This run was voided.' }
}

function statusOf(p) {
  const key = String(p.run_status || 'draft').toLowerCase()
  return STATUS_META[key] || { label: key, tone: 'muted', description: '' }
}

export default function MyPayslips() {
  const navigate = useNavigate()
  const [payslips, setPayslips] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [statusFilter, setStatusFilter] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const PAGE_SIZE = 8

  useEffect(() => {
    async function load() {
      try {
        setLoading(true)
        const res = await api.get('/api/payroll/my-payslips')
        setPayslips(Array.isArray(res.data) ? res.data : [])
      } catch (err) {
        setError(err?.response?.data?.error || 'Failed to load payslips')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  useEffect(() => { setPage(1) }, [statusFilter, search])

  const stats = useMemo(() => {
    const released = payslips.filter((p) => String(p.run_status).toLowerCase() === 'released')
    const ytdNet   = released.reduce((s, p) => s + (Number(p.net_pay)   || 0), 0)
    const ytdGross = released.reduce((s, p) => s + (Number(p.gross_pay) || 0), 0)
    const ytdDed   = released.reduce((s, p) => s + (Number(p.total_deductions) || 0), 0)
    const last     = released.sort((a, b) => new Date(b.payout_date || b.end_date || 0) - new Date(a.payout_date || a.end_date || 0))[0]
    return {
      total: payslips.length,
      released: released.length,
      ytdNet, ytdGross, ytdDed,
      lastPay: last ? Number(last.net_pay) || 0 : 0,
      lastPayDate: last?.payout_date || last?.end_date || null
    }
  }, [payslips])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return payslips.filter((p) => {
      const status = String(p.run_status || '').toLowerCase()
      if (statusFilter && status !== statusFilter) return false
      if (!q) return true
      const haystack = [p.period_code, p.run_number, p.period_frequency, formatDate(p.start_date), formatDate(p.end_date)]
        .map((v) => String(v || '').toLowerCase()).join(' ')
      return haystack.includes(q)
    })
  }, [payslips, statusFilter, search])

  // Sort newest first by payout/end date
  const sorted = useMemo(() => (
    [...filtered].sort((a, b) => new Date(b.payout_date || b.end_date || 0) - new Date(a.payout_date || a.end_date || 0))
  ), [filtered])

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE))
  const cur = Math.min(Math.max(1, page), totalPages)
  const paged = sorted.slice((cur - 1) * PAGE_SIZE, cur * PAGE_SIZE)

  const statusCounts = useMemo(() => {
    const counts = { released: 0, finalized: 0, computed: 0, draft: 0, void: 0 }
    payslips.forEach((p) => {
      const k = String(p.run_status || 'draft').toLowerCase()
      counts[k] = (counts[k] || 0) + 1
    })
    return counts
  }, [payslips])

  return (
    <div className="page payroll-page my-payslips-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">My Payslips</h1>
          <p className="page-subtitle">Your salary records from Cecille&apos;s N&apos;Style. Open any payslip to see the breakdown.</p>
        </div>
      </div>

      {error && <div className="error-msg" style={{ marginBottom: 14 }}>{error}</div>}

      {/* Hero summary */}
      <div className="my-payslips-summary">
        <div className="my-payslips-summary-main">
          <div className="my-payslips-summary-label">Latest released payslip</div>
          <div className="my-payslips-summary-value">{formatCurrency(stats.lastPay)}</div>
          <div className="my-payslips-summary-sub">
            {stats.lastPayDate
              ? `Paid out ${formatDate(stats.lastPayDate)}`
              : 'No payslips released yet.'}
          </div>
        </div>
        <div className="my-payslips-summary-stats">
          <div className="my-payslips-stat">
            <span className="my-payslips-stat-label">Released YTD</span>
            <span className="my-payslips-stat-value">{stats.released}</span>
          </div>
          <div className="my-payslips-stat">
            <span className="my-payslips-stat-label">Gross YTD</span>
            <span className="my-payslips-stat-value">{formatCurrency(stats.ytdGross)}</span>
          </div>
          <div className="my-payslips-stat">
            <span className="my-payslips-stat-label">Deductions YTD</span>
            <span className="my-payslips-stat-value">{formatCurrency(stats.ytdDed)}</span>
          </div>
          <div className="my-payslips-stat tone-gold">
            <span className="my-payslips-stat-label">Net YTD</span>
            <span className="my-payslips-stat-value">{formatCurrency(stats.ytdNet)}</span>
          </div>
        </div>
      </div>

      {/* Status quick-filter chips */}
      <div className="my-payslips-status-chips">
        <button type="button"
          className={`payslip-chip ${!statusFilter ? 'is-active' : ''}`}
          onClick={() => setStatusFilter('')}>
          All <span className="payslip-chip-count">{payslips.length}</span>
        </button>
        {Object.entries(STATUS_META).map(([key, meta]) => {
          const count = statusCounts[key] || 0
          if (count === 0 && key !== 'released') return null
          return (
            <button key={key} type="button"
              className={`payslip-chip tone-${meta.tone} ${statusFilter === key ? 'is-active' : ''}`}
              onClick={() => setStatusFilter(statusFilter === key ? '' : key)}>
              {meta.label} <span className="payslip-chip-count">{count}</span>
            </button>
          )
        })}
      </div>

      <div className="entity-toolbar" style={{ marginBottom: 12 }}>
        <div className="entity-toolbar-search">
          <input
            type="text"
            className="form-input"
            placeholder="Search by period code, frequency, or date…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="entity-toolbar-meta">
          {loading ? 'Loading…' : `${sorted.length} of ${payslips.length}`}
        </div>
      </div>

      {loading ? (
        <div className="card" style={{ textAlign: 'center', padding: 32, color: 'var(--gray-500)' }}>Loading payslips...</div>
      ) : sorted.length === 0 ? (
        <div className="card entity-empty">
          <div className="entity-empty-icon"><Icon name="payroll" size={28} /></div>
          <div className="entity-empty-title">
            {payslips.length === 0 ? 'No payslips yet' : 'No matching payslips'}
          </div>
          <div className="entity-empty-sub">
            {payslips.length === 0
              ? 'Your payslips will appear here once payroll is computed and released.'
              : 'Try clearing the filter or search.'}
          </div>
        </div>
      ) : (
        <div className="payslip-card-grid">
          {paged.map((p) => {
            const meta = statusOf(p)
            const isReleased = meta.label.toLowerCase() === 'released'
            return (
              <div key={p.id} className={`payslip-card status-${meta.tone}`}
                onClick={() => navigate(`/payroll/runs/${p.payroll_run_id}/items/${p.id}/payslip`)}
                role="button" tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter') navigate(`/payroll/runs/${p.payroll_run_id}/items/${p.id}/payslip`) }}>
                <div className="payslip-card-head">
                  <div>
                    <div className="payslip-card-period">{p.period_code}</div>
                    <div className="payslip-card-dates">
                      {formatDate(p.start_date)} — {formatDate(p.end_date)}
                    </div>
                  </div>
                  <span className={`payslip-status-pill tone-${meta.tone}`}>{meta.label}</span>
                </div>
                <div className="payslip-card-body">
                  <div className="payslip-card-amount-line">
                    <span className="payslip-card-amount-label">Net Pay</span>
                    <span className={`payslip-card-amount ${isReleased ? 'is-released' : ''}`}>
                      {formatCurrency(p.net_pay)}
                    </span>
                  </div>
                  <div className="payslip-card-meta-grid">
                    <div className="payslip-card-meta-row">
                      <span className="payslip-card-meta-label">Gross</span>
                      <span className="payslip-card-meta-value">{formatCurrency(p.gross_pay)}</span>
                    </div>
                    <div className="payslip-card-meta-row">
                      <span className="payslip-card-meta-label">Deductions</span>
                      <span className="payslip-card-meta-value tone-error">−{formatCurrency(p.total_deductions)}</span>
                    </div>
                    <div className="payslip-card-meta-row">
                      <span className="payslip-card-meta-label">Frequency</span>
                      <span className="payslip-card-meta-value">{FREQ_LABEL[p.period_frequency] || p.period_frequency || '—'}</span>
                    </div>
                    <div className="payslip-card-meta-row">
                      <span className="payslip-card-meta-label">Payout</span>
                      <span className="payslip-card-meta-value">{formatDate(p.payout_date) || '—'}</span>
                    </div>
                  </div>
                  {meta.description && (
                    <div className="payslip-card-status-note">{meta.description}</div>
                  )}
                </div>
                <div className="payslip-card-foot">
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={(e) => { e.stopPropagation(); navigate(`/payroll/runs/${p.payroll_run_id}/items/${p.id}/payslip`) }}
                  >
                    View Payslip →
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {sorted.length > PAGE_SIZE && (() => {
        const goTo = (next) => {
          const target = Math.min(Math.max(1, next), totalPages)
          if (target !== cur) { setPage(target); window.scrollTo({ top: 0, behavior: 'smooth' }) }
        }
        const pages = []
        const start = Math.max(1, cur - 2)
        const end = Math.min(totalPages, cur + 2)
        if (start > 1) { pages.push(1); if (start > 2) pages.push('…') }
        for (let i = start; i <= end; i += 1) pages.push(i)
        if (end < totalPages) { if (end < totalPages - 1) pages.push('…'); pages.push(totalPages) }
        return (
          <div className="sales-history-pagination" style={{ marginTop: 12 }}>
            <button className="btn btn-secondary btn-sm" type="button" onClick={() => goTo(cur - 1)} disabled={cur === 1}>← Prev</button>
            <div className="sales-history-pagination-pages">
              {pages.map((p, i) => p === '…'
                ? <span key={`gap-${i}`} className="sales-history-pagination-gap">…</span>
                : <button key={p} type="button"
                    className={`sales-history-pagination-page ${cur === p ? 'is-active' : ''}`}
                    onClick={() => goTo(p)}>{p}</button>
              )}
            </div>
            <button className="btn btn-secondary btn-sm" type="button" onClick={() => goTo(cur + 1)} disabled={cur === totalPages}>Next →</button>
          </div>
        )
      })()}
    </div>
  )
}
