import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import api from '../../api/api.js'
import { formatCurrency, getErrorMessage, statusBadgeClass } from './payrollUtils.js'

export default function PayrollPreview() {
  const { periodId } = useParams()
  const navigate = useNavigate()
  const [run, setRun] = useState(null)
  const [loading, setLoading] = useState(false)
  const [actionLoading, setActionLoading] = useState(null)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)

  async function loadPreview() {
    try {
      setLoading(true)
      setError(null)
      const res = await api.get(`/api/payroll/periods/${periodId}/preview`)
      setRun(res.data || null)
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load payroll preview'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadPreview()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodId])

  const totals = useMemo(() => ([
    ['Employees', run?.employee_count || 0],
    ['Gross Pay', formatCurrency(run?.total_gross_pay)],
    ['Employee Deductions', formatCurrency(run?.total_employee_deductions)],
    ['Employer Contributions', formatCurrency(run?.total_employer_contributions)],
    ['Net Pay', formatCurrency(run?.total_net_pay)]
  ]), [run])

  async function runAction(action) {
    if (!run) return
    setActionLoading(action)
    setError(null)
    setSuccess(null)
    try {
      await api.post(`/api/payroll/runs/${run.id}/${action}`)
      setSuccess(`Payroll run ${action === 'release' ? 'released' : action === 'finalize' ? 'finalized' : 'voided'}.`)
      await loadPreview()
    } catch (err) {
      setError(getErrorMessage(err, `Failed to ${action} payroll run`))
    } finally {
      setActionLoading(null)
    }
  }

  return (
    <div className="page payroll-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Payroll Preview</h1>
          <p className="page-subtitle">{run ? run.run_number : 'Computed payroll run'}</p>
        </div>
        <div className="payroll-header-actions">
          <button className="btn btn-secondary" type="button" onClick={() => navigate(`/payroll/periods/${periodId}/inputs`)}>Inputs</button>
          <button className="btn btn-secondary" type="button" onClick={() => navigate('/payroll/periods')}>Periods</button>
        </div>
      </div>

      {error ? <div className="error-msg" style={{ marginBottom: 16 }}>{error}</div> : null}
      {success ? <div className="form-success" style={{ marginBottom: 16 }}>{success}</div> : null}

      {loading ? <div className="card">Loading preview...</div> : null}

      {run ? (
        <>
          <div className="payroll-status-line">
            <span className={statusBadgeClass(run.status)}>{run.status}</span>
            <span>{run.run_number}</span>
          </div>

          <div className="reports-summary-grid payroll-summary-grid">
            {totals.map(([label, value]) => (
              <div className="card reports-summary-card" key={label}>
                <div className="card-title">{label}</div>
                <div className="card-value-sm">{value}</div>
              </div>
            ))}
          </div>

          <div className="card payroll-action-card">
            <div className="card-header">
              <h3>Run Actions</h3>
            </div>
            <div className="payroll-row-actions">
              <button className="btn btn-primary" type="button" onClick={() => runAction('finalize')} disabled={run.status !== 'draft' || Boolean(actionLoading)}>
                {actionLoading === 'finalize' ? 'Finalizing...' : 'Finalize'}
              </button>
              <button className="btn btn-success" type="button" onClick={() => runAction('release')} disabled={run.status !== 'finalized' || Boolean(actionLoading)}>
                {actionLoading === 'release' ? 'Releasing...' : 'Release'}
              </button>
              <button className="btn btn-danger" type="button" onClick={() => runAction('void')} disabled={run.status === 'void' || Boolean(actionLoading)}>
                {actionLoading === 'void' ? 'Voiding...' : 'Void'}
              </button>
            </div>
          </div>

          <div className="card payroll-table-card">
            <div className="card-header">
              <h3>Employees</h3>
              <button className="btn btn-secondary btn-sm" type="button" onClick={loadPreview}>Refresh</button>
            </div>
            <div className="table-wrap responsive">
              <table>
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th className="text-right">Basic</th>
                    <th className="text-right">Gross</th>
                    <th className="text-right">Deductions</th>
                    <th className="text-right">Net</th>
                    <th>Status</th>
                    <th className="text-right">Payslip</th>
                  </tr>
                </thead>
                <tbody>
                  {(run.items || []).map((item) => (
                    <tr key={item.id}>
                      <td>
                        <strong>{item.full_name || item.username}</strong>
                        <div className="text-muted">{item.email || '-'}</div>
                      </td>
                      <td className="text-right">{formatCurrency(item.gross_basic_pay)}</td>
                      <td className="text-right">{formatCurrency(item.gross_pay)}</td>
                      <td className="text-right">{formatCurrency(item.total_deductions)}</td>
                      <td className="text-right"><strong>{formatCurrency(item.net_pay)}</strong></td>
                      <td><span className={statusBadgeClass(item.status)}>{item.status}</span></td>
                      <td className="text-right">
                        <button className="btn btn-secondary btn-sm" type="button" onClick={() => navigate(`/payroll/runs/${run.id}/items/${item.id}/payslip`)}>
                          View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : null}
    </div>
  )
}
