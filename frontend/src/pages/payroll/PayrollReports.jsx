import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import api from '../../api/api.js'
import { formatCurrency, formatDate, getErrorMessage } from './payrollUtils.js'

const tabs = [
  { key: 'business-summary', label: 'Business Summary' },
  { key: 'register', label: 'Payroll Register' },
  { key: 'statutory-summary', label: 'Statutory Summary' },
  { key: 'employee-history', label: 'Employee History' }
]

function toDateOnly(d) {
  return d.toISOString().slice(0, 10)
}

function thisMonthRange() {
  const now = new Date()
  const from = new Date(now.getFullYear(), now.getMonth(), 1)
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  return { from: toDateOnly(from), to: toDateOnly(to) }
}

function lastMonthRange() {
  const now = new Date()
  const from = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const to = new Date(now.getFullYear(), now.getMonth(), 0)
  return { from: toDateOnly(from), to: toDateOnly(to) }
}

function thisYearRange() {
  const y = new Date().getFullYear()
  return { from: `${y}-01-01`, to: `${y}-12-31` }
}

function defaultFilters() {
  return { ...thisYearRange(), user_id: '' }
}

function buildQuery(filters) {
  const params = new URLSearchParams()
  if (filters.from) params.set('from', filters.from)
  if (filters.to) params.set('to', filters.to)
  if (filters.user_id) params.set('user_id', filters.user_id)
  const q = params.toString()
  return q ? `?${q}` : ''
}

function formatRateLabel(basis = {}) {
  const t = String(basis.pay_basis || '').toLowerCase()
  if (t === 'daily') return `${formatCurrency(basis.pay_rate)} / day`
  if (t === 'hourly') return `${formatCurrency(basis.pay_rate)} / hour`
  if (t === 'monthly') return `${formatCurrency(basis.pay_rate)} / month`
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

function fmt(value) {
  return formatCurrency(value)
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

function SummaryCard({ label, value, accent }) {
  return (
    <div className="card reports-summary-card" style={accent ? { borderTop: `3px solid ${accent}` } : {}}>
      <div className="card-title">{label}</div>
      <div className="card-value-sm">{fmt(value)}</div>
    </div>
  )
}

function TotalsRow({ cells, colSpan }) {
  return (
    <tr style={{ background: 'var(--cream-white)', fontWeight: 700, borderTop: '2px solid var(--border-light)' }}>
      <td colSpan={colSpan || 1} style={{ paddingTop: 8, paddingBottom: 8 }}>Totals</td>
      {cells.map((cell, i) => (
        <td key={i} className="text-right" style={{ paddingTop: 8, paddingBottom: 8 }}>{fmt(cell)}</td>
      ))}
    </tr>
  )
}

export default function PayrollReports() {
  const [activeTab, setActiveTab] = useState('business-summary')
  const [filters, setFilters] = useState(defaultFilters)
  const [report, setReport] = useState(null)
  const [profiles, setProfiles] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [expandedRowId, setExpandedRowId] = useState(null)
  const activeTabRef = useRef(activeTab)
  activeTabRef.current = activeTab

  async function loadProfiles() {
    try {
      const res = await api.get('/api/payroll/profiles')
      setProfiles(res.data?.profiles || [])
    } catch {
      setProfiles([])
    }
  }

  const loadReport = useCallback(async (tab, currentFilters) => {
    try {
      setLoading(true)
      setError(null)
      setExpandedRowId(null)
      const res = await api.get(`/api/payroll/reports/${tab}${buildQuery(currentFilters)}`)
      setReport(res.data || null)
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load payroll report'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadProfiles()
    loadReport(activeTab, filters)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function applyFilters(newFilters) {
    setFilters(newFilters)
    loadReport(activeTabRef.current, newFilters)
  }

  function updateFilter(key, value) {
    const next = { ...filters, [key]: value }
    setFilters(next)
    loadReport(activeTabRef.current, next)
  }

  function switchTab(tab) {
    setActiveTab(tab)
    setReport(null)
    setExpandedRowId(null)
    loadReport(tab, filters)
  }

  const rows = useMemo(() => report?.rows || [], [report])
  const totals = report?.totals || {}

  function toggleRow(id) {
    setExpandedRowId((cur) => (cur === id ? null : id))
  }

  function renderBusinessSummary() {
    const byMonth = report?.by_month || []
    const byPeriod = report?.by_period || []

    return (
      <>
        <div className="reports-summary-grid payroll-summary-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
          <SummaryCard label="Gross Pay" value={totals.gross_pay} accent="var(--gold-dark)" />
          <SummaryCard label="Total Deductions" value={totals.total_deductions} accent="#e57373" />
          <SummaryCard label="Net Pay (Take-Home)" value={totals.net_pay} accent="#66bb6a" />
          <SummaryCard label="Withholding Tax" value={totals.withholding_tax} />
          <div className="card reports-summary-card">
            <div className="card-title">Employees Paid</div>
            <div className="card-value-sm">{totals.employee_count ?? 0}</div>
          </div>
          <div className="card reports-summary-card">
            <div className="card-title">Pay Periods</div>
            <div className="card-value-sm">{totals.period_count ?? 0}</div>
          </div>
        </div>

        <div className="card" style={{ marginTop: 16 }}>
          <div style={{ fontWeight: 700, marginBottom: 12, fontSize: 14, color: 'var(--gold-dark)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Government Contributions (Employee Share)
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
            {[
              ['SSS (EE)', totals.employee_sss],
              ['SSS (ER)', totals.employer_sss],
              ['EC', totals.ec_contribution],
              ['PhilHealth (EE)', totals.employee_philhealth],
              ['PhilHealth (ER)', totals.employer_philhealth],
              ['Pag-IBIG (EE)', totals.employee_pagibig],
              ['Pag-IBIG (ER)', totals.employer_pagibig]
            ].map(([label, value]) => (
              <div key={label} style={{ padding: '10px 14px', background: 'var(--cream-white)', borderRadius: 'var(--radius-sm)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 12, color: 'var(--text-light)' }}>{label}</span>
                <strong style={{ fontSize: 15 }}>{fmt(value)}</strong>
              </div>
            ))}
          </div>
        </div>

        {byMonth.length > 0 && (
          <div className="card" style={{ marginTop: 16 }}>
            <div style={{ fontWeight: 700, marginBottom: 12, fontSize: 14, color: 'var(--gold-dark)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Monthly Breakdown
            </div>
            <div className="table-wrap responsive">
              <table>
                <thead>
                  <tr>
                    <th>Month</th>
                    <th className="text-right">Gross Pay</th>
                    <th className="text-right">Deductions</th>
                    <th className="text-right">Net Pay</th>
                    <th className="text-right">SSS (EE+ER)</th>
                    <th className="text-right">PhilHealth (EE+ER)</th>
                    <th className="text-right">Pag-IBIG (EE+ER)</th>
                    <th className="text-right">W. Tax</th>
                    <th className="text-right">Employees</th>
                  </tr>
                </thead>
                <tbody>
                  {byMonth.map((m) => (
                    <tr key={m.month_key}>
                      <td>{m.month_label}</td>
                      <td className="text-right">{fmt(m.gross_pay)}</td>
                      <td className="text-right">{fmt(m.total_deductions)}</td>
                      <td className="text-right">{fmt(m.net_pay)}</td>
                      <td className="text-right">{fmt(m.employee_sss + m.employer_sss)}</td>
                      <td className="text-right">{fmt(m.employee_philhealth + m.employer_philhealth)}</td>
                      <td className="text-right">{fmt(m.employee_pagibig + m.employer_pagibig)}</td>
                      <td className="text-right">{fmt(m.withholding_tax)}</td>
                      <td className="text-right">{m.employee_count}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ background: 'var(--cream-white)', fontWeight: 700, borderTop: '2px solid var(--border-light)' }}>
                    <td>Totals</td>
                    <td className="text-right">{fmt(totals.gross_pay)}</td>
                    <td className="text-right">{fmt(totals.total_deductions)}</td>
                    <td className="text-right">{fmt(totals.net_pay)}</td>
                    <td className="text-right">{fmt(totals.employee_sss + totals.employer_sss)}</td>
                    <td className="text-right">{fmt(totals.employee_philhealth + totals.employer_philhealth)}</td>
                    <td className="text-right">{fmt(totals.employee_pagibig + totals.employer_pagibig)}</td>
                    <td className="text-right">{fmt(totals.withholding_tax)}</td>
                    <td className="text-right">{totals.employee_count}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}

        {byPeriod.length > 0 && (
          <div className="card" style={{ marginTop: 16 }}>
            <div style={{ fontWeight: 700, marginBottom: 12, fontSize: 14, color: 'var(--gold-dark)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Per Pay Period
            </div>
            <div className="table-wrap responsive">
              <table>
                <thead>
                  <tr>
                    <th>Period</th>
                    <th>Frequency</th>
                    <th>Payout</th>
                    <th className="text-right">Gross Pay</th>
                    <th className="text-right">Deductions</th>
                    <th className="text-right">Net Pay</th>
                    <th className="text-right">Employees</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {byPeriod.map((p) => (
                    <tr key={p.payroll_run_id}>
                      <td>
                        <div>{p.period_code}</div>
                        <div style={{ fontSize: 12, color: 'var(--text-light)' }}>{p.start_date} – {p.end_date}</div>
                      </td>
                      <td style={{ textTransform: 'capitalize' }}>{String(p.period_frequency || '').replace('_', ' ')}</td>
                      <td>{formatDate(p.payout_date)}</td>
                      <td className="text-right">{fmt(p.gross_pay)}</td>
                      <td className="text-right">{fmt(p.total_deductions)}</td>
                      <td className="text-right">{fmt(p.net_pay)}</td>
                      <td className="text-right">{p.employee_count}</td>
                      <td><span className={`badge badge-${p.run_status}`}>{p.run_status}</span></td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ background: 'var(--cream-white)', fontWeight: 700, borderTop: '2px solid var(--border-light)' }}>
                    <td colSpan={3}>Totals</td>
                    <td className="text-right">{fmt(totals.gross_pay)}</td>
                    <td className="text-right">{fmt(totals.total_deductions)}</td>
                    <td className="text-right">{fmt(totals.net_pay)}</td>
                    <td className="text-right">{totals.employee_count}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}

        {!byMonth.length && !byPeriod.length && (
          <div className="card" style={{ marginTop: 16, color: 'var(--text-light)', textAlign: 'center', padding: 32 }}>
            No finalized payroll data found for the selected date range.
          </div>
        )}
      </>
    )
  }

  function renderRegister() {
    return (
      <>
        <div className="reports-summary-grid payroll-summary-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
          <SummaryCard label="Gross Pay" value={totals.gross_pay} accent="var(--gold-dark)" />
          <SummaryCard label="Total Deductions" value={totals.total_deductions} accent="#e57373" />
          <SummaryCard label="Net Pay" value={totals.net_pay} accent="#66bb6a" />
          <SummaryCard label="Withholding Tax" value={totals.withholding_tax} />
        </div>
        <div className="card" style={{ marginTop: 16 }}>
          <div className="table-wrap responsive">
            <table>
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Period</th>
                  <th className="text-right">Gross Pay</th>
                  <th className="text-right">Deductions</th>
                  <th className="text-right">Net Pay</th>
                </tr>
              </thead>
              <tbody>
                {rows.length ? rows.map((row) => {
                  const basis = row.basis_details || {}
                  const isExpanded = expandedRowId === row.payroll_run_item_id
                  return (
                    <React.Fragment key={row.payroll_run_item_id}>
                      <tr>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              onClick={() => toggleRow(row.payroll_run_item_id)}
                              aria-expanded={isExpanded}
                            >
                              {isExpanded ? 'Hide' : 'Details'}
                            </button>
                            <span>{row.full_name || row.username}</span>
                          </div>
                        </td>
                        <td>
                          <div>{row.period_code}</div>
                          <div style={{ fontSize: 12, color: 'var(--text-light)' }}>{row.start_date} – {row.end_date}</div>
                        </td>
                        <td className="text-right">{fmt(row.gross_pay)}</td>
                        <td className="text-right">{fmt(row.total_deductions)}</td>
                        <td className="text-right">{fmt(row.net_pay)}</td>
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
                                <DetailLine label="Basic Pay" value={fmt(basis.gross_basic_pay)} />
                                <DetailLine label="Overtime Pay" value={fmt(basis.gross_overtime_pay)} />
                                <DetailLine label="Holiday Pay" value={fmt(basis.gross_holiday_pay)} />
                                <DetailLine label="Rest Day Pay" value={fmt(basis.gross_rest_day_pay)} />
                                <DetailLine label="Bonus" value={fmt(basis.gross_bonus)} />
                                <DetailLine label="Commission" value={fmt(basis.gross_commission)} />
                                <DetailLine label="Allowances" value={fmt(basis.gross_allowances)} />
                                <DetailLine label="Gross Pay" value={fmt(basis.gross_pay)} />
                              </DetailCard>

                              <DetailCard title="Deduction Basis">
                                <DetailLine label="Absences / Unpaid Leave" value={fmt(basis.absence_deduction)} />
                                <DetailLine label="Late Deduction" value={fmt(basis.late_deduction)} />
                                <DetailLine label="Undertime Deduction" value={fmt(basis.undertime_deduction)} />
                                <DetailLine label="Loan" value={fmt(basis.loan_deduction)} />
                                <DetailLine label="Manual Deduction" value={fmt(basis.manual_deduction)} />
                                <DetailLine label="Other Deductions" value={fmt(basis.other_deductions)} />
                                <DetailLine label="SSS (EE)" value={fmt(basis.employee_sss)} />
                                <DetailLine label="PhilHealth (EE)" value={fmt(basis.employee_philhealth)} />
                                <DetailLine label="Pag-IBIG (EE)" value={fmt(basis.employee_pagibig)} />
                                <DetailLine label="Total Deductions" value={fmt(basis.total_deductions)} />
                                <DetailLine label="Net Pay" value={fmt(basis.net_pay)} />
                              </DetailCard>

                              <DetailCard title="Withholding Tax">
                                <DetailLine label="Taxable Income" value={fmt(basis.taxable_income)} />
                                <DetailLine label="Bracket" value={formatBracketRange(basis.withholding_tax_bracket)} />
                                <DetailLine label="Base Tax" value={fmt(basis.withholding_tax_bracket?.base_tax)} />
                                <DetailLine label="Excess Over" value={fmt(basis.withholding_tax_bracket?.excess_over)} />
                                <DetailLine label="Rate" value={formatPercent(basis.withholding_tax_bracket?.rate)} />
                                <DetailLine label="Computed Tax" value={fmt(basis.withholding_tax_formula?.computed_amount)} />
                                <DetailLine label="Stored Tax" value={fmt(basis.withholding_tax)} />
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
                }) : <tr><td colSpan={5} className="text-center text-muted">No finalized payroll rows found for this date range.</td></tr>}
              </tbody>
              {rows.length > 0 && (
                <tfoot>
                  <TotalsRow colSpan={2} cells={[totals.gross_pay, totals.total_deductions, totals.net_pay]} />
                </tfoot>
              )}
            </table>
          </div>
        </div>
      </>
    )
  }

  function renderStatutory() {
    const t = report?.totals || {}
    return (
      <div className="card">
        <div className="table-wrap responsive">
          <table>
            <thead>
              <tr>
                <th>Run</th>
                <th>Period</th>
                <th>Dates</th>
                <th className="text-right">Employees</th>
                <th className="text-right">SSS (EE)</th>
                <th className="text-right">SSS (ER)</th>
                <th className="text-right">EC</th>
                <th className="text-right">PhilHealth (EE)</th>
                <th className="text-right">PhilHealth (ER)</th>
                <th className="text-right">Pag-IBIG (EE)</th>
                <th className="text-right">Pag-IBIG (ER)</th>
                <th className="text-right">W. Tax</th>
              </tr>
            </thead>
            <tbody>
              {rows.length ? rows.map((row) => (
                <tr key={row.payroll_run_id}>
                  <td>{row.run_number}</td>
                  <td>{row.period_code}</td>
                  <td style={{ fontSize: 12, color: 'var(--text-light)' }}>{row.start_date} – {row.end_date}</td>
                  <td className="text-right">{row.employee_count}</td>
                  <td className="text-right">{fmt(row.employee_sss)}</td>
                  <td className="text-right">{fmt(row.employer_sss)}</td>
                  <td className="text-right">{fmt(row.ec_contribution)}</td>
                  <td className="text-right">{fmt(row.employee_philhealth)}</td>
                  <td className="text-right">{fmt(row.employer_philhealth)}</td>
                  <td className="text-right">{fmt(row.employee_pagibig)}</td>
                  <td className="text-right">{fmt(row.employer_pagibig)}</td>
                  <td className="text-right">{fmt(row.withholding_tax)}</td>
                </tr>
              )) : <tr><td colSpan={12} className="text-center text-muted">No statutory data found for this date range.</td></tr>}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr style={{ background: 'var(--cream-white)', fontWeight: 700, borderTop: '2px solid var(--border-light)' }}>
                  <td colSpan={3}>Totals</td>
                  <td className="text-right">{t.employee_count}</td>
                  <td className="text-right">{fmt(t.employee_sss)}</td>
                  <td className="text-right">{fmt(t.employer_sss)}</td>
                  <td className="text-right">{fmt(t.ec_contribution)}</td>
                  <td className="text-right">{fmt(t.employee_philhealth)}</td>
                  <td className="text-right">{fmt(t.employer_philhealth)}</td>
                  <td className="text-right">{fmt(t.employee_pagibig)}</td>
                  <td className="text-right">{fmt(t.employer_pagibig)}</td>
                  <td className="text-right">{fmt(t.withholding_tax)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    )
  }

  function renderEmployeeHistory() {
    return (
      <div className="card">
        <div className="table-wrap responsive">
          <table>
            <thead>
              <tr>
                <th>Employee</th>
                <th>Period</th>
                <th>Payout</th>
                <th className="text-right">Gross Pay</th>
                <th className="text-right">Deductions</th>
                <th className="text-right">Net Pay</th>
              </tr>
            </thead>
            <tbody>
              {rows.length ? rows.map((row) => (
                <tr key={row.payroll_run_item_id}>
                  <td>{row.full_name || row.username}</td>
                  <td>
                    <div>{row.period_code}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-light)' }}>{row.start_date} – {row.end_date}</div>
                  </td>
                  <td>{formatDate(row.payout_date)}</td>
                  <td className="text-right">{fmt(row.gross_pay)}</td>
                  <td className="text-right">{fmt(row.total_deductions)}</td>
                  <td className="text-right">{fmt(row.net_pay)}</td>
                </tr>
              )) : <tr><td colSpan={6} className="text-center text-muted">No employee payroll history found for this date range.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  function renderReport() {
    if (loading) return <div className="card" style={{ marginTop: 16, textAlign: 'center', color: 'var(--text-light)', padding: 32 }}>Loading report...</div>
    if (!report) return null
    if (activeTab === 'business-summary') return renderBusinessSummary()
    if (activeTab === 'register') return renderRegister()
    if (activeTab === 'statutory-summary') return renderStatutory()
    return renderEmployeeHistory()
  }

  const showEmployeeFilter = activeTab !== 'business-summary' && activeTab !== 'statutory-summary'

  return (
    <div className="page payroll-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Payroll Reports</h1>
          <p className="page-subtitle">Finalized and released payroll summaries for Cecille&apos;s N&apos;Style.</p>
        </div>
      </div>

      {error ? <div className="error-msg" style={{ marginBottom: 16 }}>{error}</div> : null}
      {!error && report?.notice ? <div className="card" style={{ marginBottom: 16, color: 'var(--text-light)' }}>{report.notice}</div> : null}

      <div className="card reports-filter-card">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
          {[
            { label: 'This Month', range: thisMonthRange() },
            { label: 'Last Month', range: lastMonthRange() },
            { label: 'This Year', range: thisYearRange() }
          ].map(({ label, range }) => (
            <button
              key={label}
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => applyFilters({ ...filters, ...range })}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="reports-filter-grid payroll-report-filter-grid">
          <div className="form-group payroll-report-filter-field" style={{ marginBottom: 0 }}>
            <label className="form-label">From</label>
            <input
              className="form-input"
              type="date"
              value={filters.from}
              onChange={(e) => updateFilter('from', e.target.value)}
            />
          </div>
          <div className="form-group payroll-report-filter-field" style={{ marginBottom: 0 }}>
            <label className="form-label">To</label>
            <input
              className="form-input"
              type="date"
              value={filters.to}
              onChange={(e) => updateFilter('to', e.target.value)}
            />
          </div>
          {showEmployeeFilter && (
            <div className="form-group payroll-report-filter-field payroll-report-filter-field-employee" style={{ marginBottom: 0 }}>
              <label className="form-label">Employee</label>
              <select
                className="form-select"
                value={filters.user_id}
                onChange={(e) => updateFilter('user_id', e.target.value)}
              >
                <option value="">All employees</option>
                {profiles.map((p) => (
                  <option key={p.id} value={p.user_id}>{p.full_name || p.username}</option>
                ))}
              </select>
            </div>
          )}
          <div className="payroll-report-filter-actions">
            <button
              className="btn btn-primary reports-refresh-btn"
              type="button"
              onClick={() => loadReport(activeTab, filters)}
              disabled={loading}
            >
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
