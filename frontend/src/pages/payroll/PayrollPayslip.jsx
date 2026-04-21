import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import api from '../../api/api.js'
import { formatCurrency, formatDate, getErrorMessage, statusBadgeClass } from './payrollUtils.js'

function LineTable({ title, lines }) {
  if (!lines.length) return null
  return (
    <div className="payroll-payslip-section">
      <h3>{title}</h3>
      <table>
        <tbody>
          {lines.map((line) => (
            <tr key={line.id || line.code}>
              <td>{line.label}</td>
              <td className="text-right">{formatCurrency(line.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
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
        setError(getErrorMessage(err, 'Failed to load payslip'))
      } finally {
        setLoading(false)
      }
    }
    loadPayslip()
  }, [runId, itemId])

  const grouped = useMemo(() => {
    const lines = payslip?.lines || []
    return {
      earnings: lines.filter((line) => line.line_type === 'earning'),
      deductions: lines.filter((line) => line.line_type === 'deduction'),
      employerShares: lines.filter((line) => line.line_type === 'employer_share')
    }
  }, [payslip])

  return (
    <div className="page payroll-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Payslip</h1>
          <p className="page-subtitle">{payslip ? `${payslip.period_code} | ${payslip.full_name || payslip.username}` : 'Payroll run item'}</p>
        </div>
        <div className="payroll-header-actions">
          <button className="btn btn-secondary" type="button" onClick={() => navigate(-1)}>Back</button>
        </div>
      </div>

      {error ? <div className="error-msg" style={{ marginBottom: 16 }}>{error}</div> : null}
      {loading ? <div className="card">Loading payslip...</div> : null}

      {payslip ? (
        <div className="card payroll-payslip-card">
          <div className="payroll-payslip-header">
            <div>
              <h2>{payslip.full_name || payslip.username}</h2>
              <p>{payslip.email || '-'}</p>
            </div>
            <div className="text-right">
              <span className={statusBadgeClass(payslip.status)}>{payslip.status}</span>
              <p>{payslip.run_number}</p>
            </div>
          </div>

          <div className="payroll-payslip-meta">
            <div>
              <span>Period</span>
              <strong>{formatDate(payslip.start_date)} - {formatDate(payslip.end_date)}</strong>
            </div>
            <div>
              <span>Payout</span>
              <strong>{formatDate(payslip.payout_date)}</strong>
            </div>
            <div>
              <span>Net Pay</span>
              <strong>{formatCurrency(payslip.net_pay)}</strong>
            </div>
          </div>

          <div className="payroll-payslip-grid">
            <LineTable title="Earnings" lines={grouped.earnings} />
            <LineTable title="Deductions" lines={grouped.deductions} />
            <LineTable title="Employer Shares" lines={grouped.employerShares} />
          </div>

          <div className="payroll-payslip-totals">
            <div><span>Gross Pay</span><strong>{formatCurrency(payslip.gross_pay)}</strong></div>
            <div><span>Total Deductions</span><strong>{formatCurrency(payslip.total_deductions)}</strong></div>
            <div><span>Net Pay</span><strong>{formatCurrency(payslip.net_pay)}</strong></div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
