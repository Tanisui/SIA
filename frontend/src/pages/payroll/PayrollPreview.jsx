import React, { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import api from '../../api/api.js'
import { formatCurrency, getErrorMessage, statusBadgeClass, usePermissions, ViewOnlyBadge } from './payrollUtils.js'

export default function PayrollPreview() {
  const { periodId } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const { canPayrollWrite } = usePermissions()
  const canRunActions = canPayrollWrite.finalize || canPayrollWrite.release || canPayrollWrite.voidRun
  const [run, setRun] = useState(null)
  const [loading, setLoading] = useState(false)
  const [actionLoading, setActionLoading] = useState(null)
  const [error, setError] = useState(location.state?.flashError || null)
  const [success, setSuccess] = useState(location.state?.flashSuccess || null)
  const [warning, setWarning] = useState(location.state?.flashWarning || null)

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

  useEffect(() => {
    const flashSuccess = location.state?.flashSuccess || null
    const flashWarning = location.state?.flashWarning || null
    const flashError = location.state?.flashError || null

    if (!flashSuccess && !flashWarning && !flashError) return

    setSuccess(flashSuccess)
    setWarning(flashWarning)
    setError(flashError)
    navigate(location.pathname, { replace: true, state: null })
  }, [location.pathname, location.state, navigate])

  const totals = useMemo(() => ([
    ['Employees', run?.employee_count || 0],
    ['Gross Pay', formatCurrency(run?.total_gross_pay)],
    ['Employee Deductions', formatCurrency(run?.total_employee_deductions)],
    ['Employer Contributions', formatCurrency(run?.total_employer_contributions)],
    ['Pay', formatCurrency(run?.total_net_pay)]
  ]), [run])

  async function runAction(action) {
    if (!run) return
    setActionLoading(action)
    setError(null)
    setSuccess(null)
    setWarning(null)
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
          <h1 className="page-title">
            Payroll Preview
            {!canRunActions && <span style={{ marginLeft: 10 }}><ViewOnlyBadge /></span>}
          </h1>
          <p className="page-subtitle">{run ? run.run_number : 'Computed payroll run'}</p>
        </div>
        <div className="payroll-header-actions">
          <button className="btn btn-secondary" type="button" onClick={() => navigate(`/payroll/periods/${periodId}/inputs`)}>Inputs</button>
          <button className="btn btn-secondary" type="button" onClick={() => navigate('/payroll/periods')}>Periods</button>
        </div>
      </div>

      {error ? <div className="error-msg" style={{ marginBottom: 16 }}>{error}</div> : null}
      {warning ? <div className="warning-msg" style={{ marginBottom: 16 }}>{warning}</div> : null}
      {success ? <div className="success-msg" style={{ marginBottom: 16 }}>{success}</div> : null}

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

          {canRunActions ? (
          <div className="card payroll-action-card">
            <div className="card-header">
              <h3>Run Actions</h3>
            </div>
            <div className="payroll-row-actions">
              {canPayrollWrite.finalize && (
                <button className="btn btn-primary" type="button" onClick={() => runAction('finalize')} disabled={run.status !== 'draft' || Boolean(actionLoading)}>
                  {actionLoading === 'finalize' ? 'Finalizing...' : 'Finalize'}
                </button>
              )}
              {canPayrollWrite.release && (
                <button className="btn btn-success" type="button" onClick={() => runAction('release')} disabled={run.status !== 'finalized' || Boolean(actionLoading)}>
                  {actionLoading === 'release' ? 'Releasing...' : 'Release'}
                </button>
              )}
              {canPayrollWrite.voidRun && (
                <button className="btn btn-danger" type="button" onClick={() => runAction('void')} disabled={run.status === 'void' || Boolean(actionLoading)}>
                  {actionLoading === 'void' ? 'Voiding...' : 'Void'}
                </button>
              )}
            </div>
          </div>
          ) : (
            <div className="payroll-view-only-banner">
              This run is read-only. Finalize, Release, and Void actions are restricted to administrators.
            </div>
          )}

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
                    <th className="text-right">Pay</th>
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
