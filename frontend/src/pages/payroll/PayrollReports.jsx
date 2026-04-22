import React, { useEffect, useMemo, useState } from 'react'
import api from '../../api/api.js'
import { formatCurrency, formatDate, getErrorMessage } from './payrollUtils.js'

const tabs = [
  { key: 'register', label: 'Register' },
  { key: 'statutory-summary', label: 'Statutory Summary' },
  { key: 'employee-history', label: 'Employee History' }
]

function toDateOnly(value) {
  return value.toISOString().slice(0, 10)
}

function defaultFilters() {
  const today = new Date()
  const from = new Date(today)
  from.setDate(from.getDate() - 45)
  return {
    from: toDateOnly(from),
    to: toDateOnly(today),
    user_id: ''
  }
}

function buildQuery(filters) {
  const params = new URLSearchParams()
  if (filters.from) params.set('from', filters.from)
  if (filters.to) params.set('to', filters.to)
  if (filters.user_id) params.set('user_id', filters.user_id)
  const query = params.toString()
  return query ? `?${query}` : ''
}

export default function PayrollReports() {
  const [activeTab, setActiveTab] = useState('register')
  const [filters, setFilters] = useState(defaultFilters)
  const [report, setReport] = useState(null)
  const [profiles, setProfiles] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  async function loadProfiles() {
    try {
      const res = await api.get('/api/payroll/profiles')
      setProfiles(res.data?.profiles || [])
    } catch {
      setProfiles([])
    }
  }

  async function loadReport(tab = activeTab) {
    try {
      setLoading(true)
      setError(null)
      const res = await api.get(`/api/payroll/reports/${tab}${buildQuery(filters)}`)
      setReport(res.data || null)
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load payroll report'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadProfiles()
    loadReport(activeTab)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function updateFilter(key, value) {
    setFilters((prev) => ({ ...prev, [key]: value }))
  }

  function switchTab(tab) {
    setActiveTab(tab)
    setReport(null)
    loadReport(tab)
  }

  const registerTotals = report?.totals || {}
  const rows = useMemo(() => report?.rows || [], [report])

  function renderReport() {
    if (loading) return <div className="card">Loading report...</div>
    if (!report) return null

    if (activeTab === 'register') {
      return (
        <>
          <div className="reports-summary-grid payroll-summary-grid">
            {[
              ['Gross Pay', registerTotals.gross_pay],
              ['Deductions', registerTotals.total_deductions],
              ['Net Pay', registerTotals.net_pay],
              ['Withholding Tax', registerTotals.withholding_tax]
            ].map(([label, value]) => (
              <div className="card reports-summary-card" key={label}>
                <div className="card-title">{label}</div>
                <div className="card-value-sm">{formatCurrency(value)}</div>
              </div>
            ))}
          </div>
          <div className="card">
            <div className="table-wrap responsive">
              <table>
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Period</th>
                    <th className="text-right">Gross</th>
                    <th className="text-right">Deductions</th>
                    <th className="text-right">Net</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length ? rows.map((row) => (
                    <tr key={row.payroll_run_item_id}>
                      <td>{row.full_name || row.username}</td>
                      <td>{row.period_code}</td>
                      <td className="text-right">{formatCurrency(row.gross_pay)}</td>
                      <td className="text-right">{formatCurrency(row.total_deductions)}</td>
                      <td className="text-right">{formatCurrency(row.net_pay)}</td>
                    </tr>
                  )) : <tr><td colSpan={5} className="text-center text-muted">No finalized payroll rows found.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )
    }

    if (activeTab === 'statutory-summary') {
      return (
        <div className="card">
          <div className="table-wrap responsive">
            <table>
              <thead>
                <tr>
                  <th>Run</th>
                  <th>Period</th>
                  <th className="text-right">SSS EE</th>
                  <th className="text-right">SSS ER</th>
                  <th className="text-right">PhilHealth EE</th>
                  <th className="text-right">PhilHealth ER</th>
                  <th className="text-right">Pag-IBIG EE</th>
                  <th className="text-right">Tax</th>
                </tr>
              </thead>
              <tbody>
                {rows.length ? rows.map((row) => (
                  <tr key={row.payroll_run_id}>
                    <td>{row.run_number}</td>
                    <td>{row.period_code}</td>
                    <td className="text-right">{formatCurrency(row.employee_sss)}</td>
                    <td className="text-right">{formatCurrency(row.employer_sss)}</td>
                    <td className="text-right">{formatCurrency(row.employee_philhealth)}</td>
                    <td className="text-right">{formatCurrency(row.employer_philhealth)}</td>
                    <td className="text-right">{formatCurrency(row.employee_pagibig)}</td>
                    <td className="text-right">{formatCurrency(row.withholding_tax)}</td>
                  </tr>
                )) : <tr><td colSpan={8} className="text-center text-muted">No statutory summary rows found.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )
    }

    return (
      <div className="card">
        <div className="table-wrap responsive">
          <table>
            <thead>
              <tr>
                <th>Employee</th>
                <th>Period</th>
                <th>Payout</th>
                <th className="text-right">Gross</th>
                <th className="text-right">Deductions</th>
                <th className="text-right">Net</th>
              </tr>
            </thead>
            <tbody>
              {rows.length ? rows.map((row) => (
                <tr key={row.payroll_run_item_id}>
                  <td>{row.full_name || row.username}</td>
                  <td>{row.period_code}</td>
                  <td>{formatDate(row.payout_date)}</td>
                  <td className="text-right">{formatCurrency(row.gross_pay)}</td>
                  <td className="text-right">{formatCurrency(row.total_deductions)}</td>
                  <td className="text-right">{formatCurrency(row.net_pay)}</td>
                </tr>
              )) : <tr><td colSpan={6} className="text-center text-muted">No employee payroll history found.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  return (
    <div className="page payroll-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Payroll Reports</h1>
          <p className="page-subtitle">Finalized and released payroll summaries.</p>
        </div>
      </div>

      {error ? <div className="error-msg" style={{ marginBottom: 16 }}>{error}</div> : null}
      {!error && report?.notice ? <div className="card" style={{ marginBottom: 16, color: 'var(--text-light)' }}>{report.notice}</div> : null}

      <div className="card reports-filter-card">
        <div className="reports-filter-grid payroll-report-filter-grid">
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">From</label>
            <input className="form-input" type="date" value={filters.from} onChange={(event) => updateFilter('from', event.target.value)} />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">To</label>
            <input className="form-input" type="date" value={filters.to} onChange={(event) => updateFilter('to', event.target.value)} />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Employee</label>
            <select className="form-select" value={filters.user_id} onChange={(event) => updateFilter('user_id', event.target.value)}>
              <option value="">All employees</option>
              {profiles.map((profile) => (
                <option key={profile.id} value={profile.user_id}>{profile.full_name || profile.username}</option>
              ))}
            </select>
          </div>
          <button className="btn btn-primary reports-refresh-btn" type="button" onClick={() => loadReport()} disabled={loading}>
            {loading ? 'Loading...' : 'Refresh'}
          </button>
        </div>
      </div>

      <div className="reports-tabs">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            className={`reports-tab ${activeTab === tab.key ? 'reports-tab-active' : ''}`}
            type="button"
            onClick={() => switchTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {renderReport()}
    </div>
  )
}
