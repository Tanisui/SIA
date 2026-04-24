import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../../api/api.js'
import { formatCurrency, formatDate, statusBadgeClass } from './payrollUtils.js'

const FREQ_LABEL = { daily: 'Daily', weekly: 'Weekly', semi_monthly: 'Semi-Monthly', monthly: 'Monthly' }

export default function MyPayslips() {
  const navigate = useNavigate()
  const [payslips, setPayslips] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

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

  return (
    <div className="page payroll-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">My Payslips</h1>
          <p className="page-subtitle">Your finalized and released salary records from Cecille&apos;s N&apos;Style.</p>
        </div>
      </div>

      {error && <div className="error-msg" style={{ marginBottom: 16 }}>{error}</div>}

      {loading ? (
        <div className="card" style={{ textAlign: 'center', padding: 32, color: 'var(--text-light)' }}>Loading payslips...</div>
      ) : payslips.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--text-light)' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>No payslips available yet</div>
          <div style={{ fontSize: 13 }}>Your payslips will appear here once payroll runs are finalized or released.</div>
        </div>
      ) : (
        <div className="card">
          <div className="table-wrap responsive">
            <table>
              <thead>
                <tr>
                  <th>Pay Period</th>
                  <th>Frequency</th>
                  <th>Payout Date</th>
                  <th className="text-right">Gross Pay</th>
                  <th className="text-right">Deductions</th>
                  <th className="text-right">Net Pay</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {payslips.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{p.period_code}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-light)' }}>
                        {formatDate(p.start_date)} – {formatDate(p.end_date)}
                      </div>
                    </td>
                    <td>{FREQ_LABEL[p.period_frequency] || p.period_frequency || '-'}</td>
                    <td>{formatDate(p.payout_date) || '-'}</td>
                    <td className="text-right">{formatCurrency(p.gross_pay)}</td>
                    <td className="text-right">{formatCurrency(p.total_deductions)}</td>
                    <td className="text-right" style={{ fontWeight: 700, color: 'var(--gold-dark)' }}>
                      {formatCurrency(p.net_pay)}
                    </td>
                    <td>
                      <span className={statusBadgeClass(p.run_status)}>
                        {p.run_status}
                      </span>
                    </td>
                    <td>
                      <button
                        className="btn btn-outline btn-sm"
                        type="button"
                        onClick={() => navigate(`/payroll/runs/${p.payroll_run_id}/items/${p.id}/payslip`)}
                      >
                        View Payslip
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
