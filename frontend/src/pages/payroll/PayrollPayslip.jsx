import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import api from '../../api/api.js'
import { formatDate, formatPeso, getErrorMessage, statusBadgeClass } from './payrollUtils.js'

function formatMetric(value) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return '-'
  return Number.isInteger(parsed) ? parsed.toLocaleString() : parsed.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  })
}

function formatFormulaPart(part) {
  const quantity = Number(part?.quantity || 0)
  const multiplier = Number(part?.multiplier ?? 1)
  const rate = Number(part?.rate || 0)
  const amount = Number(part?.amount || 0)

  if ((!quantity || quantity === 1) && multiplier === 1 && rate === amount) {
    return `${part.label}: ${formatPeso(amount)}`
  }

  return `${part.label}: ${formatMetric(quantity)} x ${formatPeso(rate)} x ${formatMetric(multiplier)} = ${formatPeso(amount)}`
}

function buildAttendanceRows(attendance = {}) {
  return [
    [
      { label: 'Days Present', value: formatMetric(attendance.days_present) },
      { label: 'Worked Minutes', value: formatMetric(attendance.worked_minutes) }
    ],
    [
      { label: 'Late Minutes', value: formatMetric(attendance.late_minutes) },
      { label: 'Undertime Minutes', value: formatMetric(attendance.undertime_minutes) }
    ],
    [
      { label: 'OT Minutes', value: formatMetric(attendance.overtime_minutes) },
      { label: 'ND Minutes', value: formatMetric(attendance.night_differential_minutes) }
    ],
    [
      { label: 'Holiday Minutes', value: formatMetric(attendance.holiday_minutes) },
      { label: 'Basic Rate', value: formatPeso(attendance.basic_rate) }
    ]
  ]
}

function AmountTable({ title, rows, totalLabel, totalAmount }) {
  return (
    <div className="payroll-slip-panel">
      <table className="payroll-slip-table">
        <thead>
          <tr>
            <th>{title}</th>
            <th className="text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.code}>
              <td>{row.label}</td>
              <td className="text-right">{formatPeso(row.amount)}</td>
            </tr>
          ))}
          <tr className="payroll-slip-total-row">
            <td>{totalLabel}</td>
            <td className="text-right">{formatPeso(totalAmount)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

function GovIdRow({ label, value }) {
  return (
    <div style={{ display: 'flex', gap: 4, fontSize: 11 }}>
      <span style={{ color: 'var(--text-light)', minWidth: 80 }}>{label}</span>
      <span style={{ fontWeight: 600 }}>{value || 'N/A'}</span>
    </div>
  )
}

export default function PayrollPayslip() {
  const { runId, itemId } = useParams()
  const navigate = useNavigate()
  const [payslip, setPayslip] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    async function loadPayslip() {
      try {
        setLoading(true)
        setError(null)
        const res = await api.get(`/api/payroll/runs/${runId}/items/${itemId}/payslip`)
        setPayslip(res.data || null)
      } catch (err) {
        if (err?.response?.status === 403) {
          setError('Access denied. If this is your own payslip, please ask your administrator to check your account permissions.')
        } else {
          setError(getErrorMessage(err, 'Failed to load payslip'))
        }
      } finally {
        setLoading(false)
      }
    }

    loadPayslip()
  }, [runId, itemId])

  const payslipView = payslip?.payslip_view || null

  const attendanceRows = useMemo(
    () => buildAttendanceRows(payslipView?.attendance || {}),
    [payslipView]
  )

  const earningsRows = useMemo(() => {
    const preferredOrder = ['BASE_AMOUNT', 'OVERTIME_PAY', 'NIGHT_DIFFERENTIAL', 'HOLIDAY_PAY', 'REST_DAY_PAY', 'ADJUSTMENTS']
    const rows = payslipView?.earnings || []
    return preferredOrder
      .map((code) => rows.find((entry) => entry.code === code))
      .filter(Boolean)
  }, [payslipView])

  const deductionRows = useMemo(() => {
    const preferredOrder = [
      'LOAN',
      'SSS_EMPLOYEE',
      'PHILHEALTH_EMPLOYEE',
      'PAGIBIG_EMPLOYEE',
      'WITHHOLDING_TAX',
      'ABSENCES',
      'LATE',
      'UNDERTIME',
      'MANUAL_DEDUCTION'
    ]
    const rows = payslipView?.deductions || []
    return preferredOrder
      .map((code) => rows.find((entry) => entry.code === code))
      .filter(Boolean)
  }, [payslipView])

  const visibleFormulaNotes = useMemo(() => {
    return (payslipView?.formula_notes || [])
      .filter((entry) => entry.code === 'BASE_AMOUNT' || Number(entry.result || 0) !== 0 || entry.code === 'TOTAL_DEDUCTIONS')
  }, [payslipView])

  const staleRunWarning = useMemo(() => {
    if (!payslipView || !payslip) return null
    const grossEarnings = Number(payslipView.totals?.gross_earnings || 0)
    const statutoryTotal = (payslipView.deductions || [])
      .filter((entry) => ['SSS_EMPLOYEE', 'PHILHEALTH_EMPLOYEE', 'PAGIBIG_EMPLOYEE'].includes(entry.code))
      .reduce((sum, entry) => sum + Number(entry.amount || 0), 0)

    if (grossEarnings === 0 && statutoryTotal > 0 && String(payslip.status || '').toLowerCase() === 'draft') {
      return 'This draft run still contains old statutory deductions on zero earnings. Recompute the payroll period after restarting the backend to refresh the run items.'
    }

    return null
  }, [payslip, payslipView])

  const attendanceWarning = useMemo(() => {
    if (!payslipView) return null
    const rateType = String(payslipView.employee?.rate_type || '').toUpperCase()
    const daysPresent = Number(payslipView.attendance?.days_present || 0)
    const workedMinutes = Number(payslipView.attendance?.worked_minutes || 0)
    const grossEarnings = Number(payslipView.totals?.gross_earnings || 0)

    if (['DAILY', 'HOURLY'].includes(rateType) && daysPresent === 0 && workedMinutes === 0 && grossEarnings === 0) {
      return 'No worked attendance was synced into this payroll period. Daily and hourly base pay stays at zero until attendance or payroll inputs are updated.'
    }

    return null
  }, [payslipView])

  const shop = payslipView?.shop || {}
  const emp = payslipView?.employee || {}
  const hasGovIds = emp.sss_number || emp.philhealth_pin || emp.pagibig_mid || emp.tin

  return (
    <div className="page payroll-page payroll-slip-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Payroll Payslip</h1>
          <p className="page-subtitle">
            {payslip ? `${payslip.period_code} | ${payslip.full_name || payslip.username}` : 'Payroll run item'}
          </p>
        </div>
        <div className="payroll-header-actions">
          <button className="btn btn-secondary" type="button" onClick={() => navigate(-1)}>Close</button>
          {payslipView && <button className="btn btn-primary" type="button" onClick={() => window.print()}>Print</button>}
        </div>
      </div>

      {error ? (
        <div className="card" style={{ padding: 24, marginBottom: 16 }}>
          <div className="error-msg" style={{ marginBottom: 12 }}>{error}</div>
          <button className="btn btn-secondary" type="button" onClick={() => navigate(-1)}>← Go Back</button>
        </div>
      ) : null}

      {loading ? <div className="card" style={{ padding: 24 }}>Loading payslip…</div> : null}

      {!loading && !error && !payslip ? (
        <div className="card" style={{ padding: 24 }}>
          <div className="error-msg" style={{ marginBottom: 12 }}>Payslip not found.</div>
          <button className="btn btn-secondary" type="button" onClick={() => navigate(-1)}>← Go Back</button>
        </div>
      ) : null}

      {payslip && payslipView ? (
        <div className="payroll-slip-shell">
          <div className="card payroll-slip-paper">

            {/* ── Shop Header ──────────────────────────────────── */}
            {shop.name && (
              <div className="payroll-slip-shop-header" style={{
                textAlign: 'center',
                padding: '16px 20px 12px',
                borderBottom: '2px solid var(--gold-dark)'
              }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--gold-dark)', letterSpacing: '-0.02em' }}>
                  {shop.name}
                </div>
                {shop.address && (
                  <div style={{ fontSize: 12, color: 'var(--text-mid)', marginTop: 2 }}>{shop.address}</div>
                )}
                {shop.tin && (
                  <div style={{ fontSize: 11, color: 'var(--text-light)', marginTop: 2 }}>TIN: {shop.tin}</div>
                )}
                <div style={{ fontSize: 13, fontWeight: 700, marginTop: 6, color: 'var(--text-dark)' }}>
                  PAYROLL PAYSLIP
                </div>
              </div>
            )}

            {/* ── Employee + Period Header ─────────────────────── */}
            <div className="payroll-slip-header" style={{ padding: '14px 20px' }}>
              <div style={{ flex: 1 }}>
                <div className="payroll-slip-run" style={{ marginBottom: 4 }}>{payslip.run_number}</div>
                <div className="payroll-slip-employee-line">
                  <strong>Employee:</strong> {emp.display_name}
                </div>
                <div className="payroll-slip-employee-line">
                  <strong>Emp #:</strong> {emp.employee_number || '-'}
                </div>
                {hasGovIds && (
                  <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3px 16px' }}>
                    <GovIdRow label="SSS No." value={emp.sss_number} />
                    <GovIdRow label="PhilHealth" value={emp.philhealth_pin} />
                    <GovIdRow label="Pag-IBIG" value={emp.pagibig_mid} />
                    <GovIdRow label="TIN" value={emp.tin} />
                  </div>
                )}
              </div>
              <div className="payroll-slip-period-block">
                <span className={statusBadgeClass(payslip.status)}>{payslip.status}</span>
                <div className="payroll-slip-employee-line" style={{ marginTop: 6 }}>
                  <strong>Period:</strong> {formatDate(payslipView.period.start_date)} – {formatDate(payslipView.period.end_date)}
                </div>
                {payslipView.period.payout_date && (
                  <div className="payroll-slip-employee-line">
                    <strong>Payout:</strong> {formatDate(payslipView.period.payout_date)}
                  </div>
                )}
                <div className="payroll-slip-employee-line">
                  <strong>Rate Type:</strong> {emp.rate_type}
                </div>
              </div>
            </div>

            {/* ── Attendance Summary ───────────────────────────── */}
            <div className="payroll-slip-section">
              <div className="payroll-slip-section-title">Attendance / Time Summary</div>
              {staleRunWarning ? <div className="warning-msg" style={{ marginBottom: 12 }}>{staleRunWarning}</div> : null}
              {attendanceWarning ? <div className="warning-msg" style={{ marginBottom: 12 }}>{attendanceWarning}</div> : null}
              <table className="payroll-slip-summary-table">
                <tbody>
                  {attendanceRows.map((row, index) => (
                    <tr key={`attendance-row-${index}`}>
                      <td>{row[0].label}</td>
                      <td className="text-right">{row[0].value}</td>
                      <td>{row[1].label}</td>
                      <td className="text-right">{row[1].value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* ── Earnings & Deductions ────────────────────────── */}
            <div className="payroll-slip-columns">
              <AmountTable
                title="Earnings"
                rows={earningsRows}
                totalLabel="Gross Earnings"
                totalAmount={payslipView.totals.gross_earnings}
              />
              <AmountTable
                title="Deductions"
                rows={deductionRows}
                totalLabel="Total Deductions"
                totalAmount={payslipView.totals.total_deductions}
              />
            </div>

            {/* ── Net Pay Calculation ──────────────────────────── */}
            <div className="payroll-slip-section payroll-slip-calculation">
              <div className="payroll-slip-section-title">Calculation</div>
              <div className="payroll-slip-calculation-main">Net Pay = Gross Earnings − Total Deductions</div>
              <div className="payroll-slip-calculation-sub">
                {formatPeso(payslipView.calculation.gross_earnings)} − {formatPeso(payslipView.calculation.total_deductions)} ={' '}
                <strong className={payslipView.calculation.net_pay < 0 ? 'payroll-slip-negative' : 'payroll-slip-positive'}>
                  {formatPeso(payslipView.calculation.net_pay)}
                </strong>
              </div>

              {visibleFormulaNotes.length ? (
                <div className="payroll-slip-formulas">
                  {visibleFormulaNotes.map((note) => (
                    <div className="payroll-slip-formula-row" key={note.code}>
                      <div className="payroll-slip-formula-label">{note.label}</div>
                      <div className="payroll-slip-formula-detail">
                        {(note.parts || []).length
                          ? note.parts.map((part) => formatFormulaPart(part)).join(' + ')
                          : formatPeso(note.result)}
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>

            {/* ── Signatures ──────────────────────────────────── */}
            <div className="payroll-slip-signatures">
              <div>
                <div className="payroll-slip-signature-line" />
                <span>Employee Signature</span>
              </div>
              <div>
                <div className="payroll-slip-signature-line" />
                <span>Payroll Officer</span>
              </div>
            </div>
          </div>

          <div className="payroll-slip-actions no-print">
            <button className="btn btn-secondary" type="button" onClick={() => navigate(-1)}>Close</button>
            <button className="btn btn-primary" type="button" onClick={() => window.print()}>Print</button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
