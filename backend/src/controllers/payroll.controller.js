const db = require('../database')
const { logAuditEventSafe } = require('../utils/auditLog')
const {
  asPositiveId,
  parseReportQuery,
  validateInputPayload,
  validatePeriodPayload,
  validateProfilePayload,
  validateSettingsPayload
} = require('../validators/payroll.validators')
const { computePayrollRun,
  finalizeRun,
  getActivePayrollSettings,
  getBusinessSummary,
  getEmployeeHistory,
  getPayrollPreview,
  getPayrollRegister,
  getPeriodDetail,
  getRunDetails,
  getStatutorySummary,
  loadInputsForPeriod,
  releaseRun,
  voidRun
} = require('../services/payroll/computePayrollRun')
const { buildPayslipView } = require('../services/payroll/computeEmployeePayroll')

function parseJson(value, fallback = null) {
  if (value === null || value === undefined || value === '') return fallback
  if (typeof value === 'object') return value
  try {
    return JSON.parse(String(value))
  } catch {
    return fallback
  }
}

function hasPermission(req, permission) {
  const permissions = req.auth?.permissions || []
  if (permissions.includes(permission) || permissions.includes('admin.*')) return true
  return permissions.some((entry) => {
    if (!entry.endsWith('.*')) return false
    const prefix = entry.slice(0, -2)
    return String(permission).startsWith(`${prefix}.`)
  })
}

function handleControllerError(res, err, fallbackMessage) {
  console.error(fallbackMessage, err)
  if (err?.statusCode) return res.status(err.statusCode).json({ error: err.message })
  if (err?.code === 'ER_DUP_ENTRY') return res.status(400).json({ error: 'duplicate payroll record' })
  return res.status(500).json({ error: fallbackMessage })
}

function buildSetClause(payload, allowedColumns) {
  const columns = allowedColumns.filter((column) => Object.prototype.hasOwnProperty.call(payload, column))
  return {
    columns,
    sql: columns.map((column) => `${column} = ?`).join(', '),
    values: columns.map((column) => payload[column])
  }
}

async function invalidateDraftRunsForPeriods(conn, periodIds = []) {
  const uniqueIds = Array.from(new Set(periodIds.map((id) => Number(id)).filter(Boolean)))
  if (!uniqueIds.length) return 0

  const placeholders = uniqueIds.map(() => '?').join(', ')
  await conn.query(
    `UPDATE payroll_periods
     SET status = 'draft',
         updated_at = CURRENT_TIMESTAMP
     WHERE id IN (${placeholders})
       AND status = 'computed'`,
    uniqueIds
  )
  const [result] = await conn.query(
    `DELETE FROM payroll_runs
     WHERE payroll_period_id IN (${placeholders})
       AND status = 'draft'`,
    uniqueIds
  )
  return result.affectedRows || 0
}

async function invalidateDraftRunsForUser(conn, userId) {
  const [rows] = await conn.query(
    `SELECT DISTINCT runs.payroll_period_id
     FROM payroll_runs runs
     JOIN payroll_run_items items ON items.payroll_run_id = runs.id
     JOIN payroll_periods periods ON periods.id = runs.payroll_period_id
     WHERE runs.status = 'draft'
       AND items.user_id = ?
       AND periods.status NOT IN ('finalized', 'released', 'void')`,
    [Number(userId)]
  )
  return invalidateDraftRunsForPeriods(conn, rows.map((row) => row.payroll_period_id))
}

async function getPayrollProfileState(conn, profileId) {
  const [rows] = await conn.query(
    `SELECT pp.*, u.username, u.full_name, u.email
     FROM payroll_profiles pp
     JOIN users u ON u.id = pp.user_id
     WHERE pp.id = ?
     LIMIT 1`,
    [Number(profileId)]
  )
  return rows[0] || null
}

async function getPayrollPeriodState(conn, periodId) {
  const [rows] = await conn.query('SELECT * FROM payroll_periods WHERE id = ? LIMIT 1', [Number(periodId)])
  return rows[0] || null
}

async function listProfiles(req, res) {
  try {
    const [profiles] = await db.pool.query(
      `SELECT
         pp.*,
         u.username,
         u.full_name,
         u.email,
         u.is_active AS user_is_active
       FROM payroll_profiles pp
       JOIN users u ON u.id = pp.user_id
       ORDER BY COALESCE(u.full_name, u.username), pp.id`
    )

    const [users] = await db.pool.query(
      `SELECT id, username, full_name, email, is_active
       FROM users
       WHERE COALESCE(is_active, 1) = 1
       ORDER BY COALESCE(full_name, username), id`
    )

    res.json({ profiles, users })
  } catch (err) {
    handleControllerError(res, err, 'failed to fetch payroll profiles')
  }
}

async function createProfile(req, res) {
  const conn = await db.pool.getConnection()
  try {
    const profile = validateProfilePayload(req.body || {})

    await conn.beginTransaction()
    const [userRows] = await conn.query('SELECT id, username, full_name FROM users WHERE id = ? LIMIT 1', [profile.user_id])
    if (!userRows.length) {
      await conn.rollback()
      return res.status(404).json({ error: 'user not found' })
    }

    const columns = Object.keys(profile)
    const values = columns.map((column) => profile[column])
    const [result] = await conn.query(
      `INSERT INTO payroll_profiles (${columns.join(', ')})
       VALUES (${columns.map(() => '?').join(', ')})`,
      values
    )
    const created = await getPayrollProfileState(conn, result.insertId)
    await logAuditEventSafe(conn, {
      userId: req.auth.id,
      action: 'PAYROLL_PROFILE_CREATED',
      resourceType: 'PayrollProfile',
      resourceId: result.insertId,
      details: {
        module: 'finance',
        severity: 'high',
        target_label: created?.full_name || created?.username,
        summary: `Created payroll profile for ${created?.full_name || created?.username || `user #${profile.user_id}`}`,
        after: created
      }
    })
    await conn.commit()
    res.status(201).json(created)
  } catch (err) {
    await conn.rollback().catch(() => {})
    handleControllerError(res, err, 'failed to create payroll profile')
  } finally {
    conn.release()
  }
}

async function updateProfile(req, res) {
  const conn = await db.pool.getConnection()
  try {
    const profileId = asPositiveId(req.params.id, 'profile id')
    const profile = validateProfilePayload(req.body || {}, { partial: true })
    delete profile.user_id

    const allowedColumns = [
      'branch_id',
      'employment_type',
      'pay_basis',
      'pay_rate',
      'payroll_frequency',
      'standard_work_days_per_month',
      'standard_hours_per_day',
      'overtime_eligible',
      'late_deduction_enabled',
      'undertime_deduction_enabled',
      'tax_enabled',
      'sss_enabled',
      'philhealth_enabled',
      'pagibig_enabled',
      'payroll_method',
      'bank_name',
      'bank_account_name',
      'bank_account_number',
      'status'
    ]
    const setClause = buildSetClause(profile, allowedColumns)
    if (!setClause.columns.length) return res.status(400).json({ error: 'nothing to update' })

    await conn.beginTransaction()
    const before = await getPayrollProfileState(conn, profileId)
    if (!before) {
      await conn.rollback()
      return res.status(404).json({ error: 'payroll profile not found' })
    }

    await conn.query(
      `UPDATE payroll_profiles SET ${setClause.sql}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [...setClause.values, profileId]
    )
    const after = await getPayrollProfileState(conn, profileId)
    const invalidatedDraftRuns = await invalidateDraftRunsForUser(conn, before.user_id)
    await logAuditEventSafe(conn, {
      userId: req.auth.id,
      action: 'PAYROLL_PROFILE_UPDATED',
      resourceType: 'PayrollProfile',
      resourceId: profileId,
      details: {
        module: 'finance',
        severity: 'high',
        target_label: after?.full_name || after?.username,
        summary: `Updated payroll profile for ${after?.full_name || after?.username || `profile #${profileId}`}`,
        before,
        after,
        metrics: { invalidated_draft_runs: invalidatedDraftRuns }
      }
    })
    await conn.commit()
    res.json(after)
  } catch (err) {
    await conn.rollback().catch(() => {})
    handleControllerError(res, err, 'failed to update payroll profile')
  } finally {
    conn.release()
  }
}

async function listPeriods(req, res) {
  try {
    const [rows] = await db.pool.query(
      `SELECT
         periods.*,
         runs.id AS latest_run_id,
         runs.run_number AS latest_run_number,
         runs.status AS latest_run_status,
         runs.total_gross_pay,
         runs.total_employee_deductions,
         runs.total_net_pay,
         runs.employee_count
       FROM payroll_periods periods
       LEFT JOIN (
         SELECT r.*
         FROM payroll_runs r
         JOIN (
           SELECT payroll_period_id, MAX(id) AS id
           FROM payroll_runs
           GROUP BY payroll_period_id
         ) latest ON latest.id = r.id
       ) runs ON runs.payroll_period_id = periods.id
       ORDER BY periods.start_date DESC, periods.id DESC`
    )
    res.json(rows)
  } catch (err) {
    handleControllerError(res, err, 'failed to fetch payroll periods')
  }
}

async function createPeriod(req, res) {
  const conn = await db.pool.getConnection()
  try {
    const period = validatePeriodPayload(req.body || {})
    await conn.beginTransaction()
    const [result] = await conn.query(
      `INSERT INTO payroll_periods (
         branch_id, code, start_date, end_date, payout_date, frequency, notes, created_by
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        period.branch_id,
        period.code,
        period.start_date,
        period.end_date,
        period.payout_date,
        period.frequency,
        period.notes,
        req.auth.id
      ]
    )
    const created = await getPayrollPeriodState(conn, result.insertId)
    await logAuditEventSafe(conn, {
      userId: req.auth.id,
      action: 'PAYROLL_PERIOD_CREATED',
      resourceType: 'PayrollPeriod',
      resourceId: result.insertId,
      details: {
        module: 'finance',
        severity: 'high',
        target_label: created?.code,
        summary: `Created payroll period ${created?.code}`,
        after: created
      }
    })
    await conn.commit()
    res.status(201).json(created)
  } catch (err) {
    await conn.rollback().catch(() => {})
    handleControllerError(res, err, 'failed to create payroll period')
  } finally {
    conn.release()
  }
}

async function getPeriod(req, res) {
  try {
    const periodId = asPositiveId(req.params.id, 'period id')
    const period = await getPeriodDetail(periodId)
    if (!period) return res.status(404).json({ error: 'payroll period not found' })
    res.json(period)
  } catch (err) {
    handleControllerError(res, err, 'failed to fetch payroll period')
  }
}

async function loadInputs(req, res) {
  try {
    const periodId = asPositiveId(req.params.id, 'period id')
    const result = await loadInputsForPeriod(periodId, req.auth.id)
    const period = await getPeriodDetail(periodId)
    await logAuditEventSafe(db.pool, {
      userId: req.auth.id,
      action: 'PAYROLL_INPUTS_LOADED',
      resourceType: 'PayrollPeriod',
      resourceId: periodId,
      details: {
        module: 'finance',
        severity: 'medium',
        target_label: period?.code || result.period?.code,
        summary: `Loaded payroll inputs for ${period?.code || result.period?.code}`,
        metrics: { loaded_count: result.loaded_count }
      }
    })
    res.json({ ...result, period })
  } catch (err) {
    handleControllerError(res, err, 'failed to load payroll inputs')
  }
}

async function updateInput(req, res) {
  const conn = await db.pool.getConnection()
  try {
    const periodId = asPositiveId(req.params.id, 'period id')
    const userId = asPositiveId(req.params.userId, 'user id')
    const input = validateInputPayload(req.body || {})
    const allowedColumns = [
      'days_worked',
      'hours_worked',
      'overtime_hours',
      'night_differential_minutes',
      'late_minutes',
      'undertime_minutes',
      'absent_days',
      'regular_holiday_days',
      'special_holiday_days',
      'rest_day_days',
      'paid_leave_days',
      'unpaid_leave_days',
      'manual_bonus',
      'manual_commission',
      'manual_allowance',
      'loan_deduction',
      'manual_deduction',
      'remarks'
    ]
    const setClause = buildSetClause(input, allowedColumns)
    if (!setClause.columns.length) return res.status(400).json({ error: 'nothing to update' })

    await conn.beginTransaction()
    const period = await getPayrollPeriodState(conn, periodId)
    if (!period) {
      await conn.rollback()
      return res.status(404).json({ error: 'payroll period not found' })
    }
    if (['finalized', 'released', 'void'].includes(String(period.status))) {
      await conn.rollback()
      return res.status(400).json({ error: 'payroll inputs cannot be changed after finalization, release, or voiding' })
    }

    const [profileRows] = await conn.query(
      `SELECT pp.id, u.username, u.full_name
       FROM users u
       LEFT JOIN payroll_profiles pp ON pp.user_id = u.id
       WHERE u.id = ?
       LIMIT 1`,
      [userId]
    )
    if (!profileRows.length) {
      await conn.rollback()
      return res.status(404).json({ error: 'user not found' })
    }
    if (!profileRows[0].id) {
      await conn.rollback()
      return res.status(400).json({ error: 'user does not have a payroll profile' })
    }

    const insertColumns = ['payroll_period_id', 'user_id', ...setClause.columns, 'created_by', 'updated_by']
    const insertValues = [periodId, userId, ...setClause.values, req.auth.id, req.auth.id]
    const duplicateUpdates = [
      ...setClause.columns.map((column) => `${column} = VALUES(${column})`),
      'updated_by = VALUES(updated_by)',
      'updated_at = CURRENT_TIMESTAMP'
    ]
    await conn.query(
      `INSERT INTO payroll_inputs (${insertColumns.join(', ')})
       VALUES (${insertColumns.map(() => '?').join(', ')})
       ON DUPLICATE KEY UPDATE ${duplicateUpdates.join(', ')}`,
      insertValues
    )
    const invalidatedDraftRuns = await invalidateDraftRunsForPeriods(conn, [periodId])

    const [rows] = await conn.query(
      `SELECT pi.*, u.username, u.full_name
       FROM payroll_inputs pi
       JOIN users u ON u.id = pi.user_id
       WHERE pi.payroll_period_id = ? AND pi.user_id = ?
       LIMIT 1`,
      [periodId, userId]
    )
    const updated = rows[0]
    await logAuditEventSafe(conn, {
      userId: req.auth.id,
      action: 'PAYROLL_INPUT_UPDATED',
      resourceType: 'PayrollInput',
      resourceId: `${periodId}:${userId}`,
      details: {
        module: 'finance',
        severity: 'medium',
        target_label: `${period.code} - ${profileRows[0].full_name || profileRows[0].username}`,
        summary: `Updated payroll input for ${profileRows[0].full_name || profileRows[0].username} in ${period.code}`,
        after: updated,
        metrics: { invalidated_draft_runs: invalidatedDraftRuns }
      }
    })
    await conn.commit()
    res.json(updated)
  } catch (err) {
    await conn.rollback().catch(() => {})
    handleControllerError(res, err, 'failed to update payroll input')
  } finally {
    conn.release()
  }
}

async function computePeriod(req, res) {
  try {
    const periodId = asPositiveId(req.params.id, 'period id')
    const run = await computePayrollRun(periodId, req.auth.id)
    await logAuditEventSafe(db.pool, {
      userId: req.auth.id,
      action: 'PAYROLL_COMPUTED',
      resourceType: 'PayrollRun',
      resourceId: run.id,
      details: {
        module: 'finance',
        severity: 'high',
        target_label: run.run_number,
        summary: `Computed payroll run ${run.run_number}`,
        metrics: {
          employee_count: run.employee_count,
          total_gross_pay: run.total_gross_pay,
          total_net_pay: run.total_net_pay
        }
      }
    })
    res.json(run)
  } catch (err) {
    handleControllerError(res, err, 'failed to compute payroll period')
  }
}

async function getPreview(req, res) {
  try {
    const periodId = asPositiveId(req.params.id, 'period id')
    const run = await getPayrollPreview(periodId)
    if (!run) return res.status(404).json({ error: 'payroll preview not found; compute the period first' })
    res.json(run)
  } catch (err) {
    handleControllerError(res, err, 'failed to fetch payroll preview')
  }
}

async function finalize(req, res) {
  try {
    const runId = asPositiveId(req.params.id, 'run id')
    const run = await finalizeRun(runId, req.auth.id)
    await logAuditEventSafe(db.pool, {
      userId: req.auth.id,
      action: 'PAYROLL_FINALIZED',
      resourceType: 'PayrollRun',
      resourceId: runId,
      details: {
        module: 'finance',
        severity: 'high',
        target_label: run.run_number,
        summary: `Finalized payroll run ${run.run_number}`,
        metrics: {
          employee_count: run.employee_count,
          total_net_pay: run.total_net_pay
        }
      }
    })
    res.json(run)
  } catch (err) {
    handleControllerError(res, err, 'failed to finalize payroll run')
  }
}

async function release(req, res) {
  try {
    const runId = asPositiveId(req.params.id, 'run id')
    const run = await releaseRun(runId, req.auth.id)
    await logAuditEventSafe(db.pool, {
      userId: req.auth.id,
      action: 'PAYROLL_RELEASED',
      resourceType: 'PayrollRun',
      resourceId: runId,
      details: {
        module: 'finance',
        severity: 'high',
        target_label: run.run_number,
        summary: `Released payroll run ${run.run_number}`,
        metrics: {
          employee_count: run.employee_count,
          total_net_pay: run.total_net_pay
        }
      }
    })
    res.json(run)
  } catch (err) {
    handleControllerError(res, err, 'failed to release payroll run')
  }
}

async function voidPayroll(req, res) {
  try {
    const runId = asPositiveId(req.params.id, 'run id')
    const run = await voidRun(runId, req.auth.id)
    await logAuditEventSafe(db.pool, {
      userId: req.auth.id,
      action: 'PAYROLL_VOIDED',
      resourceType: 'PayrollRun',
      resourceId: runId,
      details: {
        module: 'finance',
        severity: 'high',
        target_label: run.run_number,
        summary: `Voided payroll run ${run.run_number}`,
        reason: req.body?.reason || null
      }
    })
    res.json(run)
  } catch (err) {
    handleControllerError(res, err, 'failed to void payroll run')
  }
}

async function getRunItems(req, res) {
  try {
    const runId = asPositiveId(req.params.id, 'run id')
    const run = await getRunDetails(db.pool, runId)
    if (!run) return res.status(404).json({ error: 'payroll run not found' })
    res.json(run)
  } catch (err) {
    handleControllerError(res, err, 'failed to fetch payroll run items')
  }
}

async function getPayslip(req, res) {
  try {
    const runId = asPositiveId(req.params.id, 'run id')
    const itemId = asPositiveId(req.params.itemId, 'item id')
    const [rows] = await db.pool.query(
      `SELECT
         items.*,
         runs.run_number,
         runs.status AS run_status,
         periods.code AS period_code,
         periods.start_date,
         periods.end_date,
         periods.payout_date,
         periods.frequency AS period_frequency,
         users.username,
         users.full_name,
         users.email
       FROM payroll_run_items items
       JOIN payroll_runs runs ON runs.id = items.payroll_run_id
       JOIN payroll_periods periods ON periods.id = runs.payroll_period_id
       JOIN users ON users.id = items.user_id
       WHERE items.payroll_run_id = ? AND items.id = ?
       LIMIT 1`,
      [runId, itemId]
    )
    if (!rows.length) return res.status(404).json({ error: 'payslip not found' })

    const item = rows[0]
    const canViewAll = hasPermission(req, 'payroll.payslip.view')
    const isOwnPayslip = Number(item.user_id) === Number(req.auth.id)
    if (!canViewAll && !isOwnPayslip) return res.status(403).json({ error: 'forbidden' })
    if (!canViewAll && !['finalized', 'released'].includes(String(item.status))) {
      return res.status(403).json({ error: 'own payslip is only available after finalization' })
    }

    const [lines] = await db.pool.query(
      `SELECT *
       FROM payroll_item_lines
       WHERE payroll_run_item_id = ?
       ORDER BY sort_order, id`,
      [item.id]
    )
    const normalizedLines = lines.map((entry) => ({
      ...entry,
      metadata_json: parseJson(entry.metadata_json, null)
    }))
    const payrollProfileSnapshot = parseJson(item.payroll_profile_snapshot_json, {})
    const inputSnapshot = parseJson(item.input_snapshot_json, {})
    const settingsSnapshot = parseJson(item.settings_snapshot_json, {})
    res.json({
      ...item,
      payroll_profile_snapshot_json: payrollProfileSnapshot,
      input_snapshot_json: inputSnapshot,
      settings_snapshot_json: settingsSnapshot,
      payslip_view: buildPayslipView({
        item,
        profile: payrollProfileSnapshot,
        input: inputSnapshot,
        settings: settingsSnapshot,
        lines: normalizedLines,
        employee: {
          full_name: item.full_name,
          username: item.username,
          email: item.email,
          user_id: item.user_id
        }
      }),
      lines: normalizedLines
    })
  } catch (err) {
    handleControllerError(res, err, 'failed to fetch payslip')
  }
}

async function getRegisterReport(req, res) {
  try {
    res.json(await getPayrollRegister(parseReportQuery(req.query || {})))
  } catch (err) {
    handleControllerError(res, err, 'failed to generate payroll register')
  }
}

async function getStatutoryReport(req, res) {
  try {
    res.json(await getStatutorySummary(parseReportQuery(req.query || {})))
  } catch (err) {
    handleControllerError(res, err, 'failed to generate statutory summary')
  }
}

async function getEmployeeHistoryReport(req, res) {
  try {
    const query = parseReportQuery(req.query || {})
    if (!hasPermission(req, 'payroll.report.view')) {
      query.user_id = req.auth.id
    }
    res.json(await getEmployeeHistory(query))
  } catch (err) {
    handleControllerError(res, err, 'failed to generate employee payroll history')
  }
}

async function getMyPayslips(req, res) {
  try {
    const [rows] = await db.pool.query(
      `SELECT
         items.id,
         items.payroll_run_id,
         items.net_pay,
         items.gross_pay,
         items.total_deductions,
         items.status AS item_status,
         runs.run_number,
         runs.status AS run_status,
         periods.id AS period_id,
         periods.code AS period_code,
         periods.start_date,
         periods.end_date,
         periods.payout_date,
         periods.frequency AS period_frequency
       FROM payroll_run_items items
       JOIN payroll_runs runs ON runs.id = items.payroll_run_id
       JOIN payroll_periods periods ON periods.id = runs.payroll_period_id
       WHERE items.user_id = ? AND runs.status IN ('finalized', 'released')
       ORDER BY periods.start_date DESC`,
      [req.auth.id]
    )
    res.json(rows)
  } catch (err) {
    handleControllerError(res, err, 'failed to load payslips')
  }
}

async function getBusinessSummaryReport(req, res) {
  try {
    const q = req.query || {}
    const query = {
      from: q.from || null,
      to: q.to || null
    }
    res.json(await getBusinessSummary(query))
  } catch (err) {
    handleControllerError(res, err, 'failed to generate business payroll summary')
  }
}

async function getSettings(req, res) {
  try {
    const active = await getActivePayrollSettings(db.pool)
    const [history] = await db.pool.query(
      `SELECT id, version_name, effective_from, effective_to, is_active, settings_json, created_by, created_at, updated_at
       FROM payroll_settings_versions
       ORDER BY effective_from DESC, id DESC
       LIMIT 20`
    )
    res.json({
      active,
      history: history.map((row) => ({
        ...row,
        settings_json: parseJson(row.settings_json, {})
      }))
    })
  } catch (err) {
    handleControllerError(res, err, 'failed to fetch payroll settings')
  }
}

async function updateSettings(req, res) {
  const conn = await db.pool.getConnection()
  try {
    const payload = validateSettingsPayload(req.body || {})
    await conn.beginTransaction()

    const [beforeRows] = await conn.query(
      `SELECT *
       FROM payroll_settings_versions
       WHERE is_active = 1
       ORDER BY effective_from DESC, id DESC
       LIMIT 1`
    )
    const before = beforeRows[0]
      ? { ...beforeRows[0], settings_json: parseJson(beforeRows[0].settings_json, {}) }
      : null

    await conn.query(
      `UPDATE payroll_settings_versions
       SET effective_to = CASE
             WHEN effective_to IS NULL OR effective_to >= ? THEN DATE_SUB(?, INTERVAL 1 DAY)
             ELSE effective_to
           END,
           updated_at = CURRENT_TIMESTAMP
       WHERE is_active = 1
         AND effective_from <= ?
         AND (effective_to IS NULL OR effective_to >= ?)`,
      [payload.effective_from, payload.effective_from, payload.effective_from, payload.effective_from]
    )

    const [result] = await conn.query(
      `INSERT INTO payroll_settings_versions (
         version_name, effective_from, effective_to, is_active, settings_json, created_by
       ) VALUES (?, ?, NULL, 1, ?, ?)`,
      [
        payload.version_name,
        payload.effective_from,
        JSON.stringify(payload.settings_json),
        req.auth.id
      ]
    )
    const [afterRows] = await conn.query(
      'SELECT * FROM payroll_settings_versions WHERE id = ? LIMIT 1',
      [result.insertId]
    )
    const after = { ...afterRows[0], settings_json: parseJson(afterRows[0].settings_json, {}) }
    const [draftPeriodRows] = await conn.query(
      `SELECT DISTINCT payroll_period_id
       FROM payroll_runs
       WHERE status = 'draft'`
    )
    const invalidatedDraftRuns = await invalidateDraftRunsForPeriods(
      conn,
      draftPeriodRows.map((row) => row.payroll_period_id)
    )

    await logAuditEventSafe(conn, {
      userId: req.auth.id,
      action: 'PAYROLL_SETTINGS_UPDATED',
      resourceType: 'PayrollSettingsVersion',
      resourceId: result.insertId,
      details: {
        module: 'finance',
        severity: 'high',
        target_label: payload.version_name,
        summary: `Activated payroll settings version ${payload.version_name}`,
        before,
        after,
        metrics: { invalidated_draft_runs: invalidatedDraftRuns }
      }
    })
    await conn.commit()
    res.json(after)
  } catch (err) {
    await conn.rollback().catch(() => {})
    handleControllerError(res, err, 'failed to update payroll settings')
  } finally {
    conn.release()
  }
}

module.exports = {
  computePeriod,
  createPeriod,
  createProfile,
  finalize,
  getBusinessSummaryReport,
  getEmployeeHistoryReport,
  getMyPayslips,
  getPayslip,
  getPeriod,
  getPreview,
  getRegisterReport,
  getRunItems,
  getSettings,
  getStatutoryReport,
  listPeriods,
  listProfiles,
  loadInputs,
  release,
  updateInput,
  updateProfile,
  updateSettings,
  voidPayroll
}
