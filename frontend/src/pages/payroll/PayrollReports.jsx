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

function formatRateLabel(basis = {}) {
  const basisType = String(basis.pay_basis || '').toLowerCase()
  if (basisType === 'daily') return `${formatCurrency(basis.pay_rate)} / day`
  if (basisType === 'hourly') return `${formatCurrency(basis.pay_rate)} / hour`
  if (basisType === 'monthly') return `${formatCurrency(basis.pay_rate)} / month`
  return formatCurrency(basis.pay_rate)
}

function formatBracketRange(bracket = null) {
  if (!bracket) return 'No bracket selected'
  const from = formatCurrency(bracket.from)
  const to = bracket.to === null ? 'and above' : formatCurrency(bracket.to)
  return `${from} to ${to}`
}

function formatPercent(value) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return '-'
  return `${(parsed * 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`
}

function DetailLine({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 13 }}>
      <span style={{ color: 'var(--text-light)' }}>{label}</span>
      <strong style={{ color: 'var(--text-dark)', textAlign: 'right' }}>{value}</strong>
    </div>
  )
}

function DetailCard({ title, children }) {
  return (
    <div style={{
      background: '#fff',
      border: '1px solid var(--border-light)',
      borderRadius: 'var(--radius-sm)',
      padding: 14,
      display: 'grid',
      gap: 10
    }}>
      <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--gold-dark)' }}>
        {title}
      </div>
      {children}
    </div>
  )
}

export default function PayrollReports() {
  const [activeTab, setActiveTab] = useState('register')
  const [filters, setFilters] = useState(defaultFilters)
  const [report, setReport] = useState(null)
  const [profiles, setProfiles] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [expandedRegisterRowId, setExpandedRegisterRowId] = useState(null)

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
      if (tab !== 'register') setExpandedRegisterRowId(null)
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
    setExpandedRegisterRowId(null)
    loadReport(tab)
  }

  const registerTotals = report?.totals || {}
  const rows = useMemo(() => report?.rows || [], [report])

  function toggleRegisterRow(rowId) {
    setExpandedRegisterRowId((current) => (current === rowId ? null : rowId))
  }

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
                  {rows.length ? rows.map((row) => {
                    const basis = row.basis_details || {}
                    const isExpanded = expandedRegisterRowId === row.payroll_run_item_id

                    return (
                      <React.Fragment key={row.payroll_run_item_id}>
                        <tr>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                onClick={() => toggleRegisterRow(row.payroll_run_item_id)}
                                aria-expanded={isExpanded}
                              >
                                {isExpanded ? 'Hide' : 'Details'}
                              </button>
                              <span>{row.full_name || row.username}</span>
                            </div>
                          </td>
                          <td>{row.period_code}</td>
                          <td className="text-right">{formatCurrency(row.gross_pay)}</td>
                          <td className="text-right">{formatCurrency(row.total_deductions)}</td>
                          <td className="text-right">{formatCurrency(row.net_pay)}</td>
                        </tr>
                        {isExpanded ? (
                          <tr>
                            <td colSpan={5} style={{ background: 'var(--cream-white)', padding: 16 }}>
                              {basis.gross_zero_reason ? (
                                <div className="warning-msg" style={{ marginBottom: 12 }}>{basis.gross_zero_reason}</div>
                              ) : null}
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
                                <DetailCard title="Gross Pay Basis">
                                  <DetailLine label="Pay Basis" value={String(basis.pay_basis || '-').toUpperCase()} />
                                  <DetailLine label="Rate" value={formatRateLabel(basis)} />
                                  <DetailLine label="Period Frequency" value={String(basis.period_frequency || '-').replace('_', ' ')} />
                                  <DetailLine label="Days Worked" value={basis.days_worked ?? 0} />
                                  <DetailLine label="Hours Worked" value={basis.hours_worked ?? 0} />
                                  <DetailLine label="Overtime Hours" value={basis.overtime_hours ?? 0} />
                                  <DetailLine label="Late Minutes" value={basis.late_minutes ?? 0} />
                                  <DetailLine label="Undertime Minutes" value={basis.undertime_minutes ?? 0} />
                                  <DetailLine label="Basic Pay" value={formatCurrency(basis.gross_basic_pay)} />
                                  <DetailLine label="Overtime Pay" value={formatCurrency(basis.gross_overtime_pay)} />
                                  <DetailLine label="Night Differential" value={formatCurrency(basis.gross_night_differential_pay)} />
                                  <DetailLine label="Holiday Pay" value={formatCurrency(basis.gross_holiday_pay)} />
                                  <DetailLine label="Rest Day Pay" value={formatCurrency(basis.gross_rest_day_pay)} />
                                  <DetailLine label="Bonus" value={formatCurrency(basis.gross_bonus)} />
                                  <DetailLine label="Commission" value={formatCurrency(basis.gross_commission)} />
                                  <DetailLine label="Allowances" value={formatCurrency(basis.gross_allowances)} />
                                  <DetailLine label="Stored Gross Pay" value={formatCurrency(basis.gross_pay)} />
                                </DetailCard>

                                <DetailCard title="Deduction Basis">
                                  <DetailLine label="Contribution Base" value={formatCurrency(basis.contribution_base)} />
                                  <DetailLine label="Absences / Unpaid Leave" value={formatCurrency(basis.absence_deduction)} />
                                  <DetailLine label="Late Deduction" value={formatCurrency(basis.late_deduction)} />
                                  <DetailLine label="Undertime Deduction" value={formatCurrency(basis.undertime_deduction)} />
                                  <DetailLine label="Loan" value={formatCurrency(basis.loan_deduction)} />
                                  <DetailLine label="Manual Deduction" value={formatCurrency(basis.manual_deduction)} />
                                  <DetailLine label="Other Deductions" value={formatCurrency(basis.other_deductions)} />
                                  <DetailLine label="SSS" value={formatCurrency(basis.employee_sss)} />
                                  <DetailLine label="PHIC" value={formatCurrency(basis.employee_philhealth)} />
                                  <DetailLine label="Pag-IBIG" value={formatCurrency(basis.employee_pagibig)} />
                                  <DetailLine label="Stored Total Deductions" value={formatCurrency(basis.total_deductions)} />
                                  <DetailLine label="Stored Net Pay" value={formatCurrency(basis.net_pay)} />
                                </DetailCard>

                                <DetailCard title="Withholding Tax">
                                  <DetailLine label="Taxable Income" value={formatCurrency(basis.taxable_income)} />
                                  <DetailLine label="Bracket" value={formatBracketRange(basis.withholding_tax_bracket)} />
                                  <DetailLine label="Base Tax" value={formatCurrency(basis.withholding_tax_bracket?.base_tax)} />
                                  <DetailLine label="Excess Over" value={formatCurrency(basis.withholding_tax_bracket?.excess_over)} />
                                  <DetailLine label="Rate" value={formatPercent(basis.withholding_tax_bracket?.rate)} />
                                  <DetailLine label="Computed Tax" value={formatCurrency(basis.withholding_tax_formula?.computed_amount)} />
                                  <DetailLine label="Stored Tax" value={formatCurrency(basis.withholding_tax)} />
                                  <div style={{ fontSize: 13, color: 'var(--text-mid)', lineHeight: 1.5 }}>
                                    {basis.withholding_tax_formula?.text || 'No withholding tax formula available.'}
                                  </div>
                                </DetailCard>
                              </div>
                            </td>
                          </tr>
                        ) : null}
                      </React.Fragment>
                    )
                  }) : <tr><td colSpan={5} className="text-center text-muted">No finalized payroll rows found.</td></tr>}
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
          <div className="form-group payroll-report-filter-field" style={{ marginBottom: 0 }}>
            <label className="form-label">From</label>
            <input className="form-input" type="date" value={filters.from} onChange={(event) => updateFilter('from', event.target.value)} />
          </div>
          <div className="form-group payroll-report-filter-field" style={{ marginBottom: 0 }}>
            <label className="form-label">To</label>
            <input className="form-input" type="date" value={filters.to} onChange={(event) => updateFilter('to', event.target.value)} />
          </div>
          <div className="form-group payroll-report-filter-field payroll-report-filter-field-employee" style={{ marginBottom: 0 }}>
            <label className="form-label">Employee</label>
            <select className="form-select" value={filters.user_id} onChange={(event) => updateFilter('user_id', event.target.value)}>
              <option value="">All employees</option>
              {profiles.map((profile) => (
                <option key={profile.id} value={profile.user_id}>{profile.full_name || profile.username}</option>
              ))}
            </select>
          </div>
          <div className="payroll-report-filter-actions">
            <button className="btn btn-primary reports-refresh-btn" type="button" onClick={() => loadReport()} disabled={loading}>
              {loading ? 'Loading...' : 'Refresh'}
            </button>
          </div>
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
