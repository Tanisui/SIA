const db = require('../../database')
const { computeEmployeePayroll, roundMoney } = require('./computeEmployeePayroll')

const schemaCapabilityCache = new Map()

function serviceError(statusCode, message) {
  const err = new Error(message)
  err.statusCode = statusCode
  return err
}

function safeJson(value, fallback = null) {
  if (value === null || value === undefined || value === '') return fallback
  if (typeof value === 'object') return value
  try {
    return JSON.parse(String(value))
  } catch {
    return fallback
  }
}

function hasConfiguredFlag(value) {
  return value === 0 || value === 1 || value === true || value === false
}

function hasPositiveRate(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0
}

function getProfileMissingFields(profile = {}) {
  const missingFields = []
  if (String(profile.status || '').toLowerCase() !== 'active') missingFields.push('payroll_eligible')
  if (!String(profile.pay_basis || '').trim()) missingFields.push('pay_basis')
  if (!hasPositiveRate(profile.pay_rate)) missingFields.push('pay_rate')
  if (!String(profile.payroll_frequency || '').trim()) missingFields.push('payroll_frequency')
  if (!String(profile.payroll_method || '').trim()) missingFields.push('payroll_method')
  for (const key of ['tax_enabled', 'sss_enabled', 'philhealth_enabled', 'pagibig_enabled']) {
    if (!hasConfiguredFlag(profile[key])) missingFields.push(key)
  }
  return missingFields
}

function getProfileDisplayName(profile = {}) {
  return profile.full_name || profile.username || `user #${profile.user_id || 'unknown'}`
}

function assertProfilesReadyForPayroll(profiles = []) {
  const incomplete = profiles
    .map((profile) => ({ profile, missingFields: getProfileMissingFields(profile) }))
    .filter((entry) => entry.missingFields.length > 0)

  if (!incomplete.length) return

  const preview = incomplete
    .slice(0, 5)
    .map((entry) => `${getProfileDisplayName(entry.profile)} [${entry.missingFields.join(', ')}]`)
    .join('; ')
  const remainingCount = incomplete.length - 5
  const remainingSuffix = remainingCount > 0 ? ` (+${remainingCount} more)` : ''
  throw serviceError(
    400,
    `incomplete payroll profiles detected: ${preview}${remainingSuffix}. Configure payroll profile before loading payroll.`
  )
}

function normalizeRunItem(row) {
  return {
    ...row,
    payroll_profile_snapshot_json: safeJson(row.payroll_profile_snapshot_json, {}),
    input_snapshot_json: safeJson(row.input_snapshot_json, {}),
    settings_snapshot_json: safeJson(row.settings_snapshot_json, {})
  }
}

async function tableExists(tableName, conn = db.pool) {
  const cacheKey = `table:${tableName}`
  if (conn === db.pool && schemaCapabilityCache.has(cacheKey)) {
    return schemaCapabilityCache.get(cacheKey)
  }

  const [rows] = await conn.query(
    `SELECT 1 AS found
     FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
     LIMIT 1`,
    [tableName]
  )
  const exists = rows.length > 0
  if (conn === db.pool) schemaCapabilityCache.set(cacheKey, exists)
  return exists
}

async function columnExists(tableName, columnName, conn = db.pool) {
  const cacheKey = `column:${tableName}.${columnName}`
  if (conn === db.pool && schemaCapabilityCache.has(cacheKey)) {
    return schemaCapabilityCache.get(cacheKey)
  }

  const [rows] = await conn.query(
    `SELECT 1 AS found
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND COLUMN_NAME = ?
     LIMIT 1`,
    [tableName, columnName]
  )
  const exists = rows.length > 0
  if (conn === db.pool) schemaCapabilityCache.set(cacheKey, exists)
  return exists
}

async function getPayrollReportCapabilities(conn = db.pool) {
  const requiredTables = ['payroll_run_items', 'payroll_runs', 'payroll_periods', 'users']
  const requiredTableStates = await Promise.all(
    requiredTables.map(async (tableName) => [tableName, await tableExists(tableName, conn)])
  )
  const missingTables = requiredTableStates.filter(([, exists]) => !exists).map(([tableName]) => tableName)
  if (missingTables.length) {
    return { ready: false, missingTables }
  }

  const itemColumns = [
    'status',
    'gross_basic_pay',
    'gross_overtime_pay',
    'gross_holiday_pay',
    'gross_rest_day_pay',
    'gross_bonus',
    'gross_commission',
    'gross_allowances',
    'gross_pay',
    'taxable_income',
    'withholding_tax',
    'employee_sss',
    'employer_sss',
    'ec_contribution',
    'employee_philhealth',
    'employer_philhealth',
    'employee_pagibig',
    'employer_pagibig',
    'other_deductions',
    'total_deductions',
    'net_pay',
    'created_at'
  ]
  const userColumns = ['full_name', 'email']
  const periodColumns = ['payout_date']

  const itemColumnStates = await Promise.all(
    itemColumns.map(async (columnName) => [columnName, await columnExists('payroll_run_items', columnName, conn)])
  )
  const userColumnStates = await Promise.all(
    userColumns.map(async (columnName) => [columnName, await columnExists('users', columnName, conn)])
  )
  const periodColumnStates = await Promise.all(
    periodColumns.map(async (columnName) => [columnName, await columnExists('payroll_periods', columnName, conn)])
  )

  return {
    ready: true,
    columns: {
      payroll_run_items: Object.fromEntries(itemColumnStates),
      users: Object.fromEntries(userColumnStates),
      payroll_periods: Object.fromEntries(periodColumnStates)
    }
  }
}

function reportEmptyResult(query = {}, extra = {}) {
  return {
    generated_at: new Date().toISOString(),
    filters: query,
    ...extra
  }
}

function reportNoDataNotice() {
  return 'No finalized or released payroll runs found yet. Create a payroll period, load inputs, compute payroll, then finalize or release a run to populate reports.'
}

function reportSetupNotice(missingTables = []) {
  return `Payroll reporting tables are not fully available yet (${missingTables.join(', ')}). Create/load the payroll schema before using payroll reports.`
}

function selectNumericColumn(columns, columnName, alias = columnName) {
  return columns[columnName] ? `items.${columnName}` : `0 AS ${alias}`
}

function selectItemStatusFilter(columns, where) {
  if (columns.status) where.push("items.status IN ('finalized', 'released')")
}

function selectUserFullName(columns) {
  return columns.full_name ? 'users.full_name' : 'NULL AS full_name'
}

function selectUserEmail(columns) {
  return columns.email ? 'users.email' : 'NULL AS email'
}

function userOrderBy(columns) {
  return columns.full_name ? 'users.full_name, users.username' : 'users.username'
}

function payoutDateSelect(columns) {
  return columns.payout_date ? 'periods.payout_date' : 'NULL AS payout_date'
}

function payoutDateGroupBy(columns) {
  return columns.payout_date ? ', periods.payout_date' : ''
}

function payoutDateOrderBy(columns, fallback = 'runs.id DESC') {
  return columns.payout_date ? `periods.payout_date DESC, ${fallback}` : fallback
}

async function getActivePayrollSettings(conn, effectiveDate = null) {
  const asOf = effectiveDate || new Date().toISOString().slice(0, 10)
  const [rows] = await conn.query(
    `SELECT *
     FROM payroll_settings_versions
     WHERE is_active = 1
       AND effective_from <= ?
       AND (effective_to IS NULL OR effective_to >= ?)
     ORDER BY effective_from DESC, id DESC
     LIMIT 1`,
    [asOf, asOf]
  )
  if (!rows.length) throw serviceError(500, 'active payroll settings are not configured')
  const row = rows[0]
  return {
    id: row.id,
    version_name: row.version_name,
    effective_from: row.effective_from,
    effective_to: row.effective_to,
    settings_json: safeJson(row.settings_json, {})
  }
}

async function getPeriod(conn, periodId, options = {}) {
  const lock = options.forUpdate ? ' FOR UPDATE' : ''
  const [rows] = await conn.query(`SELECT * FROM payroll_periods WHERE id = ? LIMIT 1${lock}`, [Number(periodId)])
  return rows[0] || null
}

async function getRun(conn, runId, options = {}) {
  const lock = options.forUpdate ? ' FOR UPDATE' : ''
  const [rows] = await conn.query(`SELECT * FROM payroll_runs WHERE id = ? LIMIT 1${lock}`, [Number(runId)])
  return rows[0] || null
}

async function getLatestRunForPeriod(conn, periodId) {
  const [rows] = await conn.query(
    `SELECT *
     FROM payroll_runs
     WHERE payroll_period_id = ?
     ORDER BY FIELD(status, 'draft', 'finalized', 'released', 'void'), id DESC
     LIMIT 1`,
    [Number(periodId)]
  )
  return rows[0] || null
}

async function getRunDetails(conn, runId) {
  const run = await getRun(conn, runId)
  if (!run) return null
  const [items] = await conn.query(
    `SELECT
       pri.*,
       u.username,
       u.full_name,
       u.email
     FROM payroll_run_items pri
     JOIN users u ON u.id = pri.user_id
     WHERE pri.payroll_run_id = ?
     ORDER BY COALESCE(u.full_name, u.username), pri.id`,
    [run.id]
  )
  const normalizedItems = []
  for (const item of items) {
    const [lines] = await conn.query(
      `SELECT * FROM payroll_item_lines WHERE payroll_run_item_id = ? ORDER BY sort_order, id`,
      [item.id]
    )
    normalizedItems.push({
      ...normalizeRunItem(item),
      lines: lines.map((line) => ({
        ...line,
        metadata_json: safeJson(line.metadata_json, null)
      }))
    })
  }
  return { ...run, items: normalizedItems }
}

async function loadProfilesForCompute(conn, period = null) {
  const where = [
    "pp.status = 'active'",
    'COALESCE(u.is_active, 1) = 1'
  ]
  const params = []
  if (period?.frequency) {
    where.push('pp.payroll_frequency = ?')
    params.push(period.frequency)
  }
  if (period?.branch_id) {
    where.push('(pp.branch_id = ? OR pp.branch_id IS NULL)')
    params.push(period.branch_id)
  }

  const [rows] = await conn.query(
    `SELECT
       pp.*,
       u.username,
       u.full_name,
       u.email
     FROM payroll_profiles pp
     JOIN users u ON u.id = pp.user_id
     WHERE ${where.join(' AND ')}
     ORDER BY COALESCE(u.full_name, u.username), pp.id`,
    params
  )
  assertProfilesReadyForPayroll(rows)
  return rows
}

async function loadInputsMap(conn, periodId) {
  const [rows] = await conn.query('SELECT * FROM payroll_inputs WHERE payroll_period_id = ?', [Number(periodId)])
  return new Map(rows.map((row) => [Number(row.user_id), row]))
}

async function generateRunNumber(conn, period) {
  const prefix = `PAYRUN-${period.code}`
  const [rows] = await conn.query(
    `SELECT COUNT(*) AS count FROM payroll_runs WHERE payroll_period_id = ?`,
    [period.id]
  )
  return `${prefix}-${String((Number(rows[0]?.count) || 0) + 1).padStart(3, '0')}`
}

async function clearDraftRun(conn, runId) {
  await conn.query(
    `DELETE pil
     FROM payroll_item_lines pil
     JOIN payroll_run_items pri ON pri.id = pil.payroll_run_item_id
     WHERE pri.payroll_run_id = ?`,
    [runId]
  )
  await conn.query('DELETE FROM payroll_run_items WHERE payroll_run_id = ?', [runId])
}

async function insertComputedItem(conn, runId, profile, input, settingsVersion, computed) {
  const [result] = await conn.query(
    `INSERT INTO payroll_run_items (
       payroll_run_id, user_id, payroll_profile_snapshot_json, input_snapshot_json, settings_snapshot_json,
       gross_basic_pay, gross_overtime_pay, gross_holiday_pay, gross_rest_day_pay, gross_bonus,
       gross_commission, gross_allowances, gross_pay, taxable_income, withholding_tax,
       employee_sss, employer_sss, ec_contribution, employee_philhealth, employer_philhealth,
       employee_pagibig, employer_pagibig, other_deductions, total_deductions, net_pay, status
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft')`,
    [
      runId,
      profile.user_id,
      JSON.stringify(computed.payroll_profile_snapshot),
      JSON.stringify(computed.input_snapshot),
      JSON.stringify({
        id: settingsVersion.id,
        version_name: settingsVersion.version_name,
        effective_from: settingsVersion.effective_from,
        effective_to: settingsVersion.effective_to,
        settings: settingsVersion.settings_json
      }),
      computed.gross_basic_pay,
      computed.gross_overtime_pay,
      computed.gross_holiday_pay,
      computed.gross_rest_day_pay,
      computed.gross_bonus,
      computed.gross_commission,
      computed.gross_allowances,
      computed.gross_pay,
      computed.taxable_income,
      computed.withholding_tax,
      computed.employee_sss,
      computed.employer_sss,
      computed.ec_contribution,
      computed.employee_philhealth,
      computed.employer_philhealth,
      computed.employee_pagibig,
      computed.employer_pagibig,
      computed.other_deductions,
      computed.total_deductions,
      computed.net_pay
    ]
  )

  for (const itemLine of computed.lines) {
    await conn.query(
      `INSERT INTO payroll_item_lines (
         payroll_run_item_id, line_type, code, label, amount, sort_order, metadata_json
       ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        result.insertId,
        itemLine.line_type,
        itemLine.code,
        itemLine.label,
        itemLine.amount,
        itemLine.sort_order,
        itemLine.metadata_json ? JSON.stringify(itemLine.metadata_json) : null
      ]
    )
  }

  return result.insertId
}

async function loadInputsForPeriod(periodId, actorId) {
  const conn = await db.pool.getConnection()
  try {
    await conn.beginTransaction()
    const period = await getPeriod(conn, periodId, { forUpdate: true })
    if (!period) throw serviceError(404, 'payroll period not found')
    if (['finalized', 'released', 'void'].includes(String(period.status))) {
      throw serviceError(400, 'payroll inputs cannot be loaded for finalized, released, or void periods')
    }

    const profiles = await loadProfilesForCompute(conn, period)
    for (const profile of profiles) {
      await conn.query(
        `INSERT IGNORE INTO payroll_inputs (payroll_period_id, user_id, created_by, updated_by)
         VALUES (?, ?, ?, ?)`,
        [period.id, profile.user_id, actorId || null, actorId || null]
      )
    }

    await conn.commit()
    return { period, loaded_count: profiles.length }
  } catch (err) {
    await conn.rollback().catch(() => {})
    throw err
  } finally {
    conn.release()
  }
}

async function computePayrollRun(periodId, actorId) {
  const conn = await db.pool.getConnection()
  try {
    await conn.beginTransaction()
    const period = await getPeriod(conn, periodId, { forUpdate: true })
    if (!period) throw serviceError(404, 'payroll period not found')
    if (['finalized', 'released', 'void'].includes(String(period.status))) {
      throw serviceError(400, 'finalized, released, or void payroll periods cannot be recomputed')
    }

    const [lockedRuns] = await conn.query(
      `SELECT * FROM payroll_runs WHERE payroll_period_id = ? FOR UPDATE`,
      [period.id]
    )
    if (lockedRuns.some((run) => ['finalized', 'released'].includes(String(run.status)))) {
      throw serviceError(400, 'this payroll period already has a finalized or released run')
    }

    const settingsVersion = await getActivePayrollSettings(conn, period.payout_date || period.end_date)
    const profiles = await loadProfilesForCompute(conn, period)
    if (!profiles.length) {
      throw serviceError(400, 'no active payroll profiles match this period frequency')
    }

    let draftRun = lockedRuns.find((run) => String(run.status) === 'draft') || null
    if (!draftRun) {
      const runNumber = await generateRunNumber(conn, period)
      const [runResult] = await conn.query(
        `INSERT INTO payroll_runs (payroll_period_id, run_number, status, created_by)
         VALUES (?, ?, 'draft', ?)`,
        [period.id, runNumber, actorId || null]
      )
      draftRun = await getRun(conn, runResult.insertId, { forUpdate: true })
    } else {
      await clearDraftRun(conn, draftRun.id)
    }

    const inputMap = await loadInputsMap(conn, period.id)
    const emptyInput = { payroll_period_id: period.id }

    let totalGrossPay = 0
    let totalEmployeeDeductions = 0
    let totalEmployerContributions = 0
    let totalNetPay = 0

    for (const profile of profiles) {
      const input = inputMap.get(Number(profile.user_id)) || { ...emptyInput, user_id: profile.user_id }
      const computed = computeEmployeePayroll({
        profile,
        input,
        settings: settingsVersion.settings_json,
        period
      })
      await insertComputedItem(conn, draftRun.id, profile, input, settingsVersion, computed)
      totalGrossPay += computed.gross_pay
      totalEmployeeDeductions += computed.total_deductions
      totalEmployerContributions += computed.employer_contributions
      totalNetPay += computed.net_pay
    }

    await conn.query(
      `UPDATE payroll_runs
       SET total_gross_pay = ?,
           total_employee_deductions = ?,
           total_employer_contributions = ?,
           total_net_pay = ?,
           employee_count = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        roundMoney(totalGrossPay),
        roundMoney(totalEmployeeDeductions),
        roundMoney(totalEmployerContributions),
        roundMoney(totalNetPay),
        profiles.length,
        draftRun.id
      ]
    )
    await conn.query("UPDATE payroll_periods SET status = 'computed' WHERE id = ?", [period.id])

    await conn.commit()
    return getRunDetails(db.pool, draftRun.id)
  } catch (err) {
    await conn.rollback().catch(() => {})
    throw err
  } finally {
    conn.release()
  }
}

async function getPayrollPreview(periodId) {
  const run = await getLatestRunForPeriod(db.pool, periodId)
  if (!run) return null
  return getRunDetails(db.pool, run.id)
}

async function getPeriodDetail(periodId) {
  const period = await getPeriod(db.pool, periodId)
  if (!period) return null

  const [inputs] = await db.pool.query(
    `SELECT
       pi.*,
       u.username,
       u.full_name,
       u.email,
       pp.id AS payroll_profile_id,
       pp.pay_basis,
       pp.pay_rate,
       pp.payroll_frequency,
       pp.status AS payroll_profile_status
     FROM payroll_inputs pi
     JOIN users u ON u.id = pi.user_id
     LEFT JOIN payroll_profiles pp ON pp.user_id = pi.user_id
     WHERE pi.payroll_period_id = ?
     ORDER BY COALESCE(u.full_name, u.username), pi.id`,
    [Number(periodId)]
  )

  const [runs] = await db.pool.query(
    `SELECT *
     FROM payroll_runs
     WHERE payroll_period_id = ?
     ORDER BY id DESC`,
    [Number(periodId)]
  )

  return { ...period, inputs, runs }
}

async function finalizeRun(runId, actorId) {
  return transitionRun(runId, actorId, {
    from: ['draft'],
    to: 'finalized',
    periodStatus: 'finalized',
    actorColumn: 'finalized_by'
  })
}

async function releaseRun(runId, actorId) {
  return transitionRun(runId, actorId, {
    from: ['finalized'],
    to: 'released',
    periodStatus: 'released',
    actorColumn: 'released_by'
  })
}

async function voidRun(runId, actorId) {
  return transitionRun(runId, actorId, {
    from: ['draft', 'finalized', 'released'],
    to: 'void',
    periodStatus: 'void',
    actorColumn: null
  })
}

async function transitionRun(runId, actorId, transition) {
  const conn = await db.pool.getConnection()
  try {
    await conn.beginTransaction()
    const run = await getRun(conn, runId, { forUpdate: true })
    if (!run) throw serviceError(404, 'payroll run not found')
    if (!transition.from.includes(String(run.status))) {
      throw serviceError(400, `payroll run must be ${transition.from.join(' or ')} before it can be ${transition.to}`)
    }

    if (transition.to === 'finalized') {
      const [periodRows] = await conn.query(
        'SELECT status FROM payroll_periods WHERE id = ? LIMIT 1 FOR UPDATE',
        [run.payroll_period_id]
      )
      if (!periodRows.length) throw serviceError(404, 'payroll period not found')
      if (String(periodRows[0].status) !== 'computed') {
        throw serviceError(400, 'payroll must be computed again before finalization')
      }

      const [itemCountRows] = await conn.query(
        'SELECT COUNT(*) AS item_count FROM payroll_run_items WHERE payroll_run_id = ?',
        [run.id]
      )
      if (!Number(itemCountRows[0]?.item_count)) {
        throw serviceError(400, 'payroll run has no computed employee items')
      }
    }

    const runUpdates = ['status = ?', 'updated_at = CURRENT_TIMESTAMP']
    const runParams = [transition.to]
    if (transition.actorColumn) {
      runUpdates.push(`${transition.actorColumn} = ?`)
      runParams.push(actorId || null)
    }
    runParams.push(run.id)
    await conn.query(`UPDATE payroll_runs SET ${runUpdates.join(', ')} WHERE id = ?`, runParams)
    await conn.query('UPDATE payroll_run_items SET status = ? WHERE payroll_run_id = ?', [transition.to, run.id])

    const periodUpdates = ['status = ?', 'updated_at = CURRENT_TIMESTAMP']
    const periodParams = [transition.periodStatus]
    if (transition.actorColumn) {
      periodUpdates.push(`${transition.actorColumn} = ?`)
      periodParams.push(actorId || null)
    }
    periodParams.push(run.payroll_period_id)
    await conn.query(`UPDATE payroll_periods SET ${periodUpdates.join(', ')} WHERE id = ?`, periodParams)

    await conn.commit()
    return getRunDetails(db.pool, run.id)
  } catch (err) {
    await conn.rollback().catch(() => {})
    throw err
  } finally {
    conn.release()
  }
}

function addReportFilters(where, params, query = {}) {
  if (query.from) {
    where.push('periods.start_date >= ?')
    params.push(query.from)
  }
  if (query.to) {
    where.push('periods.end_date <= ?')
    params.push(query.to)
  }
  if (query.payroll_period_id) {
    where.push('periods.id = ?')
    params.push(Number(query.payroll_period_id))
  }
  if (query.payroll_run_id) {
    where.push('runs.id = ?')
    params.push(Number(query.payroll_run_id))
  }
  if (query.user_id) {
    where.push('items.user_id = ?')
    params.push(Number(query.user_id))
  }
}

function summarizeRegisterRows(rows) {
  return rows.reduce((totals, row) => {
    totals.gross_pay = roundMoney(totals.gross_pay + Number(row.gross_pay || 0))
    totals.total_deductions = roundMoney(totals.total_deductions + Number(row.total_deductions || 0))
    totals.net_pay = roundMoney(totals.net_pay + Number(row.net_pay || 0))
    totals.withholding_tax = roundMoney(totals.withholding_tax + Number(row.withholding_tax || 0))
    totals.employee_sss = roundMoney(totals.employee_sss + Number(row.employee_sss || 0))
    totals.employee_philhealth = roundMoney(totals.employee_philhealth + Number(row.employee_philhealth || 0))
    totals.employee_pagibig = roundMoney(totals.employee_pagibig + Number(row.employee_pagibig || 0))
    return totals
  }, {
    gross_pay: 0,
    total_deductions: 0,
    net_pay: 0,
    withholding_tax: 0,
    employee_sss: 0,
    employee_philhealth: 0,
    employee_pagibig: 0
  })
}

async function getPayrollRegister(query = {}) {
  const capabilities = await getPayrollReportCapabilities()
  if (!capabilities.ready) {
    return reportEmptyResult(query, {
      totals: summarizeRegisterRows([]),
      rows: [],
      notice: reportSetupNotice(capabilities.missingTables)
    })
  }

  const where = [
    "runs.status IN ('finalized', 'released')"
  ]
  selectItemStatusFilter(capabilities.columns.payroll_run_items, where)
  const params = []
  addReportFilters(where, params, query)

  const [rows] = await db.pool.query(
    `SELECT
       runs.id AS payroll_run_id,
       runs.run_number,
       runs.status AS run_status,
       periods.id AS payroll_period_id,
       periods.code AS period_code,
       periods.start_date,
       periods.end_date,
       ${payoutDateSelect(capabilities.columns.payroll_periods)},
       users.id AS user_id,
       users.username,
       ${selectUserFullName(capabilities.columns.users)},
       items.id AS payroll_run_item_id,
       ${selectNumericColumn(capabilities.columns.payroll_run_items, 'gross_basic_pay')},
       ${selectNumericColumn(capabilities.columns.payroll_run_items, 'gross_overtime_pay')},
       ${selectNumericColumn(capabilities.columns.payroll_run_items, 'gross_holiday_pay')},
       ${selectNumericColumn(capabilities.columns.payroll_run_items, 'gross_rest_day_pay')},
       ${selectNumericColumn(capabilities.columns.payroll_run_items, 'gross_bonus')},
       ${selectNumericColumn(capabilities.columns.payroll_run_items, 'gross_commission')},
       ${selectNumericColumn(capabilities.columns.payroll_run_items, 'gross_allowances')},
       ${selectNumericColumn(capabilities.columns.payroll_run_items, 'gross_pay')},
       ${selectNumericColumn(capabilities.columns.payroll_run_items, 'taxable_income')},
       ${selectNumericColumn(capabilities.columns.payroll_run_items, 'withholding_tax')},
       ${selectNumericColumn(capabilities.columns.payroll_run_items, 'employee_sss')},
       ${selectNumericColumn(capabilities.columns.payroll_run_items, 'employee_philhealth')},
       ${selectNumericColumn(capabilities.columns.payroll_run_items, 'employee_pagibig')},
       ${selectNumericColumn(capabilities.columns.payroll_run_items, 'other_deductions')},
       ${selectNumericColumn(capabilities.columns.payroll_run_items, 'total_deductions')},
       ${selectNumericColumn(capabilities.columns.payroll_run_items, 'net_pay')}
     FROM payroll_run_items items
     JOIN payroll_runs runs ON runs.id = items.payroll_run_id
     JOIN payroll_periods periods ON periods.id = runs.payroll_period_id
     JOIN users ON users.id = items.user_id
     WHERE ${where.join(' AND ')}
     ORDER BY ${payoutDateOrderBy(capabilities.columns.payroll_periods, userOrderBy(capabilities.columns.users))}`,
    params
  )

  return {
    ...reportEmptyResult(query),
    totals: summarizeRegisterRows(rows),
    rows,
    notice: rows.length ? null : reportNoDataNotice()
  }
}

async function getStatutorySummary(query = {}) {
  const capabilities = await getPayrollReportCapabilities()
  if (!capabilities.ready) {
    return reportEmptyResult(query, {
      totals: {
        employee_count: 0,
        employee_sss: 0,
        employer_sss: 0,
        ec_contribution: 0,
        employee_philhealth: 0,
        employer_philhealth: 0,
        employee_pagibig: 0,
        employer_pagibig: 0,
        withholding_tax: 0
      },
      rows: [],
      notice: reportSetupNotice(capabilities.missingTables)
    })
  }

  const where = [
    "runs.status IN ('finalized', 'released')"
  ]
  selectItemStatusFilter(capabilities.columns.payroll_run_items, where)
  const params = []
  addReportFilters(where, params, query)

  const [rows] = await db.pool.query(
    `SELECT
       runs.id AS payroll_run_id,
       runs.run_number,
       runs.status AS run_status,
       periods.id AS payroll_period_id,
       periods.code AS period_code,
       periods.start_date,
       periods.end_date,
       ${payoutDateSelect(capabilities.columns.payroll_periods)},
       COUNT(items.id) AS employee_count,
       COALESCE(SUM(${capabilities.columns.payroll_run_items.employee_sss ? 'items.employee_sss' : '0'}), 0) AS employee_sss,
       COALESCE(SUM(${capabilities.columns.payroll_run_items.employer_sss ? 'items.employer_sss' : '0'}), 0) AS employer_sss,
       COALESCE(SUM(${capabilities.columns.payroll_run_items.ec_contribution ? 'items.ec_contribution' : '0'}), 0) AS ec_contribution,
       COALESCE(SUM(${capabilities.columns.payroll_run_items.employee_philhealth ? 'items.employee_philhealth' : '0'}), 0) AS employee_philhealth,
       COALESCE(SUM(${capabilities.columns.payroll_run_items.employer_philhealth ? 'items.employer_philhealth' : '0'}), 0) AS employer_philhealth,
       COALESCE(SUM(${capabilities.columns.payroll_run_items.employee_pagibig ? 'items.employee_pagibig' : '0'}), 0) AS employee_pagibig,
       COALESCE(SUM(${capabilities.columns.payroll_run_items.employer_pagibig ? 'items.employer_pagibig' : '0'}), 0) AS employer_pagibig,
       COALESCE(SUM(${capabilities.columns.payroll_run_items.withholding_tax ? 'items.withholding_tax' : '0'}), 0) AS withholding_tax
     FROM payroll_run_items items
     JOIN payroll_runs runs ON runs.id = items.payroll_run_id
     JOIN payroll_periods periods ON periods.id = runs.payroll_period_id
     WHERE ${where.join(' AND ')}
     GROUP BY runs.id, runs.run_number, runs.status, periods.id, periods.code, periods.start_date, periods.end_date${payoutDateGroupBy(capabilities.columns.payroll_periods)}
     ORDER BY ${payoutDateOrderBy(capabilities.columns.payroll_periods)}`,
    params
  )

  const totals = rows.reduce((acc, row) => {
    for (const key of [
      'employee_sss',
      'employer_sss',
      'ec_contribution',
      'employee_philhealth',
      'employer_philhealth',
      'employee_pagibig',
      'employer_pagibig',
      'withholding_tax'
    ]) {
      acc[key] = roundMoney(acc[key] + Number(row[key] || 0))
    }
    acc.employee_count += Number(row.employee_count || 0)
    return acc
  }, {
    employee_count: 0,
    employee_sss: 0,
    employer_sss: 0,
    ec_contribution: 0,
    employee_philhealth: 0,
    employer_philhealth: 0,
    employee_pagibig: 0,
    employer_pagibig: 0,
    withholding_tax: 0
  })

  return {
    ...reportEmptyResult(query),
    totals,
    rows,
    notice: rows.length ? null : reportNoDataNotice()
  }
}

async function getEmployeeHistory(query = {}) {
  const capabilities = await getPayrollReportCapabilities()
  if (!capabilities.ready) {
    return reportEmptyResult(query, {
      rows: [],
      notice: reportSetupNotice(capabilities.missingTables)
    })
  }

  const where = [
    "runs.status IN ('finalized', 'released')"
  ]
  selectItemStatusFilter(capabilities.columns.payroll_run_items, where)
  const params = []
  addReportFilters(where, params, query)

  const [rows] = await db.pool.query(
    `SELECT
       users.id AS user_id,
       users.username,
       ${selectUserFullName(capabilities.columns.users)},
       periods.id AS payroll_period_id,
       periods.code AS period_code,
       periods.start_date,
       periods.end_date,
       ${payoutDateSelect(capabilities.columns.payroll_periods)},
       runs.id AS payroll_run_id,
       runs.run_number,
       runs.status AS run_status,
       items.id AS payroll_run_item_id,
       ${selectNumericColumn(capabilities.columns.payroll_run_items, 'gross_pay')},
       ${selectNumericColumn(capabilities.columns.payroll_run_items, 'total_deductions')},
       ${selectNumericColumn(capabilities.columns.payroll_run_items, 'net_pay')},
       ${capabilities.columns.payroll_run_items.created_at ? 'items.created_at' : 'NULL AS created_at'}
     FROM payroll_run_items items
     JOIN payroll_runs runs ON runs.id = items.payroll_run_id
     JOIN payroll_periods periods ON periods.id = runs.payroll_period_id
     JOIN users ON users.id = items.user_id
     WHERE ${where.join(' AND ')}
     ORDER BY ${userOrderBy(capabilities.columns.users)}, ${capabilities.columns.payroll_periods.payout_date ? 'periods.payout_date DESC' : 'runs.id DESC'}`,
    params
  )

  return {
    ...reportEmptyResult(query),
    rows,
    notice: rows.length ? null : reportNoDataNotice()
  }
}

module.exports = {
  computePayrollRun,
  finalizeRun,
  getActivePayrollSettings,
  getEmployeeHistory,
  getPayrollRegister,
  getPayrollPreview,
  getPeriodDetail,
  getRunDetails,
  getStatutorySummary,
  loadInputsForPeriod,
  releaseRun,
  voidRun
}
