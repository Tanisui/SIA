const db = require('../../database')
const { computeEmployeePayroll, getDailyRate, getHourlyRate, roundMoney } = require('./computeEmployeePayroll')

const schemaCapabilityCache = new Map()
const PAYROLL_PROFILE_BOOTSTRAP_DEFAULTS = Object.freeze({
  pay_basis: 'monthly',
  payroll_method: 'cash',
  standard_work_days_per_month: 22,
  standard_hours_per_day: 8,
  overtime_eligible: 1,
  late_deduction_enabled: 1,
  undertime_deduction_enabled: 1,
  tax_enabled: 1,
  sss_enabled: 1,
  philhealth_enabled: 1,
  pagibig_enabled: 1,
  status: 'active'
})

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

function normalizeBootstrapPayBasis(value, period = null) {
  const normalized = String(value || '').trim().toLowerCase()
  if (['daily', 'monthly', 'hourly'].includes(normalized)) return normalized
  if (normalized === 'day') return 'daily'
  if (normalized === 'month') return 'monthly'
  if (period?.frequency === 'weekly') return 'daily'
  return PAYROLL_PROFILE_BOOTSTRAP_DEFAULTS.pay_basis
}

function normalizeBootstrapPayrollMethod(value) {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === 'cash') return 'cash'
  if (normalized === 'bank_transfer' || normalized === 'bank transfer') return 'bank_transfer'
  if (normalized === 'e_wallet' || normalized === 'e-wallet' || normalized === 'ewallet') return 'ewallet'
  return PAYROLL_PROFILE_BOOTSTRAP_DEFAULTS.payroll_method
}

function normalizeBootstrapEmploymentType(value) {
  const normalized = String(value || '').trim().toLowerCase()
  return normalized || null
}

function normalizePayrollFrequency(value, period = null) {
  const normalized = String(value || '').trim().toLowerCase()
  if (['daily', 'weekly', 'semi_monthly', 'monthly'].includes(normalized)) return normalized
  if (normalized === 'semi-monthly' || normalized === 'semimonthly') return 'semi_monthly'
  return period?.frequency || 'semi_monthly'
}

function extractBootstrapBankFields(value) {
  const bankDetails = safeJson(value, {})
  if (!bankDetails || typeof bankDetails !== 'object' || Array.isArray(bankDetails)) {
    return {
      bank_name: null,
      bank_account_name: null,
      bank_account_number: null
    }
  }

  return {
    bank_name: bankDetails.provider_name || bankDetails.bank_name || null,
    bank_account_name: bankDetails.account_name || null,
    bank_account_number: bankDetails.account_number || null
  }
}

function buildBootstrapProfileSeed(candidate, period = null) {
  const payRate = Number(candidate?.pay_rate || 0)
  if (!hasPositiveRate(payRate)) {
    return { profile: null, reason: 'missing pay rate' }
  }

  const bankFields = extractBootstrapBankFields(candidate?.bank_details)
  return {
    profile: {
      user_id: Number(candidate.user_id),
      employment_type: normalizeBootstrapEmploymentType(candidate.employment_type),
      pay_basis: normalizeBootstrapPayBasis(candidate.pay_basis, period),
      pay_rate: payRate,
      payroll_frequency: period?.frequency || 'semi_monthly',
      standard_work_days_per_month: PAYROLL_PROFILE_BOOTSTRAP_DEFAULTS.standard_work_days_per_month,
      standard_hours_per_day: PAYROLL_PROFILE_BOOTSTRAP_DEFAULTS.standard_hours_per_day,
      overtime_eligible: PAYROLL_PROFILE_BOOTSTRAP_DEFAULTS.overtime_eligible,
      late_deduction_enabled: PAYROLL_PROFILE_BOOTSTRAP_DEFAULTS.late_deduction_enabled,
      undertime_deduction_enabled: PAYROLL_PROFILE_BOOTSTRAP_DEFAULTS.undertime_deduction_enabled,
      tax_enabled: PAYROLL_PROFILE_BOOTSTRAP_DEFAULTS.tax_enabled,
      sss_enabled: PAYROLL_PROFILE_BOOTSTRAP_DEFAULTS.sss_enabled,
      philhealth_enabled: PAYROLL_PROFILE_BOOTSTRAP_DEFAULTS.philhealth_enabled,
      pagibig_enabled: PAYROLL_PROFILE_BOOTSTRAP_DEFAULTS.pagibig_enabled,
      payroll_method: normalizeBootstrapPayrollMethod(candidate.payroll_method),
      bank_name: bankFields.bank_name,
      bank_account_name: bankFields.bank_account_name,
      bank_account_number: bankFields.bank_account_number,
      status: PAYROLL_PROFILE_BOOTSTRAP_DEFAULTS.status
    },
    reason: null
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

function normalizeProfileForCompute(profile = {}, period = null) {
  const normalized = {
    ...profile,
    pay_basis: normalizeBootstrapPayBasis(profile.pay_basis, period),
    payroll_frequency: normalizePayrollFrequency(profile.payroll_frequency, period),
    payroll_method: normalizeBootstrapPayrollMethod(profile.payroll_method)
  }

  for (const [key, fallback] of Object.entries({
    overtime_eligible: PAYROLL_PROFILE_BOOTSTRAP_DEFAULTS.overtime_eligible,
    late_deduction_enabled: PAYROLL_PROFILE_BOOTSTRAP_DEFAULTS.late_deduction_enabled,
    undertime_deduction_enabled: PAYROLL_PROFILE_BOOTSTRAP_DEFAULTS.undertime_deduction_enabled,
    tax_enabled: PAYROLL_PROFILE_BOOTSTRAP_DEFAULTS.tax_enabled,
    sss_enabled: PAYROLL_PROFILE_BOOTSTRAP_DEFAULTS.sss_enabled,
    philhealth_enabled: PAYROLL_PROFILE_BOOTSTRAP_DEFAULTS.philhealth_enabled,
    pagibig_enabled: PAYROLL_PROFILE_BOOTSTRAP_DEFAULTS.pagibig_enabled
  })) {
    if (!hasConfiguredFlag(normalized[key])) normalized[key] = fallback
  }

  if (!hasPositiveRate(normalized.standard_work_days_per_month)) {
    normalized.standard_work_days_per_month = PAYROLL_PROFILE_BOOTSTRAP_DEFAULTS.standard_work_days_per_month
  }
  if (!hasPositiveRate(normalized.standard_hours_per_day)) {
    normalized.standard_hours_per_day = PAYROLL_PROFILE_BOOTSTRAP_DEFAULTS.standard_hours_per_day
  }
  if (!String(normalized.status || '').trim()) {
    normalized.status = PAYROLL_PROFILE_BOOTSTRAP_DEFAULTS.status
  }

  return normalized
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
    'payroll_profile_snapshot_json',
    'input_snapshot_json',
    'settings_snapshot_json',
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

function selectJsonColumn(columns, columnName, alias = columnName) {
  return columns[columnName] ? `items.${columnName}` : `NULL AS ${alias}`
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

function num(value, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function hasOwn(object, key) {
  return Boolean(object) && Object.prototype.hasOwnProperty.call(object, key)
}

function boolFlag(value) {
  return value === true || Number(value) === 1
}

function normalizeReportSettingsSnapshot(settingsSnapshot = {}) {
  const parsed = safeJson(settingsSnapshot, {})
  if (parsed && typeof parsed === 'object' && parsed.settings && typeof parsed.settings === 'object') {
    return parsed.settings
  }
  return parsed || {}
}

function getWithholdingTaxBrackets(settings = {}, periodFrequency = 'semi_monthly') {
  const configured = settings?.withholding_tax?.brackets
  if (Array.isArray(configured)) return configured
  if (configured && typeof configured === 'object') {
    return configured[periodFrequency] || configured.monthly || []
  }
  return []
}

function getWithholdingTaxBracket(brackets = [], taxableIncome = 0) {
  const income = Math.max(num(taxableIncome), 0)
  return brackets
    .filter((row) => income >= num(row.from) && (row.to === null || row.to === undefined || income <= num(row.to, Number.MAX_SAFE_INTEGER)))
    .sort((a, b) => num(b.from) - num(a.from))[0] || null
}

function formatBracketAmount(value) {
  return `PHP ${roundMoney(num(value)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatPercentage(value) {
  return `${(num(value) * 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`
}

function buildWithholdingTaxExplanation({ taxableIncome, withholdingTax, periodFrequency, profile, settings }) {
  const income = Math.max(roundMoney(num(taxableIncome)), 0)
  const taxEnabled = boolFlag(profile?.tax_enabled) && boolFlag(settings?.withholding_tax?.enabled)
  if (!taxEnabled) {
    return {
      withholding_tax_bracket: null,
      withholding_tax_formula: {
        text: 'Withholding tax is disabled for this payroll profile or settings version.',
        taxable_income: income,
        base_tax: 0,
        excess_over: 0,
        rate: 0,
        computed_amount: 0,
        stored_amount: roundMoney(num(withholdingTax))
      }
    }
  }

  const brackets = getWithholdingTaxBrackets(settings, periodFrequency)
  const bracket = getWithholdingTaxBracket(brackets, income)
  if (!bracket) {
    return {
      withholding_tax_bracket: null,
      withholding_tax_formula: {
        text: `No withholding tax bracket matched taxable income ${formatBracketAmount(income)}.`,
        taxable_income: income,
        base_tax: 0,
        excess_over: 0,
        rate: 0,
        computed_amount: 0,
        stored_amount: roundMoney(num(withholdingTax))
      }
    }
  }

  const normalizedBracket = {
    from: roundMoney(num(bracket.from)),
    to: bracket.to === null || bracket.to === undefined ? null : roundMoney(num(bracket.to)),
    base_tax: roundMoney(num(bracket.base_tax)),
    excess_over: roundMoney(num(bracket.excess_over, bracket.from)),
    rate: num(bracket.rate)
  }
  const computedAmount = roundMoney(
    normalizedBracket.base_tax + Math.max(income - normalizedBracket.excess_over, 0) * normalizedBracket.rate
  )

  return {
    withholding_tax_bracket: normalizedBracket,
    withholding_tax_formula: {
      text: `${formatBracketAmount(normalizedBracket.base_tax)} + max(${formatBracketAmount(income)} - ${formatBracketAmount(normalizedBracket.excess_over)}, 0) x ${formatPercentage(normalizedBracket.rate)} = ${formatBracketAmount(computedAmount)}`,
      taxable_income: income,
      base_tax: normalizedBracket.base_tax,
      excess_over: normalizedBracket.excess_over,
      rate: normalizedBracket.rate,
      computed_amount: computedAmount,
      stored_amount: roundMoney(num(withholdingTax))
    }
  }
}

function buildRegisterBasisDetails(row = {}) {
  const rawProfile = safeJson(row.payroll_profile_snapshot_json, {})
  const inputSnapshot = safeJson(row.input_snapshot_json, {})
  const settings = normalizeReportSettingsSnapshot(row.settings_snapshot_json)
  const periodFrequency = normalizePayrollFrequency(row.period_frequency || rawProfile?.payroll_frequency)
  const profile = normalizeProfileForCompute(rawProfile, { frequency: periodFrequency })
  const dailyRate = getDailyRate(profile)
  const hourlyRate = getHourlyRate(profile)
  const overtimeMultiplier = num(settings.overtime_multiplier, 1.25)
  const nightDifferentialMultiplier = num(settings.night_differential_multiplier, 0.1)
  const regularHolidayMultiplier = num(settings.regular_holiday_multiplier, 2)
  const specialHolidayMultiplier = num(settings.special_holiday_multiplier, 1.3)
  const restDayMultiplier = num(settings.rest_day_multiplier, 1.3)

  const daysWorked = roundMoney(num(inputSnapshot.days_worked))
  const hoursWorked = roundMoney(num(inputSnapshot.hours_worked))
  const overtimeHours = roundMoney(num(inputSnapshot.overtime_hours))
  const lateMinutes = Math.round(num(inputSnapshot.late_minutes))
  const undertimeMinutes = Math.round(num(inputSnapshot.undertime_minutes))
  const nightDifferentialMinutes = Math.round(num(inputSnapshot.night_differential_minutes))

  const grossNightDifferentialPay = roundMoney((nightDifferentialMinutes / 60) * hourlyRate * nightDifferentialMultiplier)
  const regularHolidayPay = roundMoney(num(inputSnapshot.regular_holiday_days) * dailyRate * regularHolidayMultiplier)
  const specialHolidayPay = roundMoney(num(inputSnapshot.special_holiday_days) * dailyRate * specialHolidayMultiplier)
  const holidayPay = roundMoney(regularHolidayPay + specialHolidayPay)
  const restDayPay = roundMoney(num(inputSnapshot.rest_day_days) * dailyRate * restDayMultiplier)
  const absenceDeduction = roundMoney((num(inputSnapshot.absent_days) + num(inputSnapshot.unpaid_leave_days)) * dailyRate)
  const lateDeduction = boolFlag(profile.late_deduction_enabled)
    ? roundMoney((lateMinutes / 60) * hourlyRate)
    : 0
  const undertimeDeduction = boolFlag(profile.undertime_deduction_enabled)
    ? roundMoney((undertimeMinutes / 60) * hourlyRate)
    : 0
  const loanDeduction = roundMoney(num(inputSnapshot.loan_deduction))
  const manualDeduction = roundMoney(num(inputSnapshot.manual_deduction))
  const contributionBase = Math.max(
    roundMoney(num(row.gross_pay) - absenceDeduction - lateDeduction - undertimeDeduction),
    0
  )
  const taxExplanation = buildWithholdingTaxExplanation({
    taxableIncome: row.taxable_income,
    withholdingTax: row.withholding_tax,
    periodFrequency,
    profile,
    settings
  })

  let grossZeroReason = null
  if (roundMoney(num(row.gross_pay)) === 0) {
    if (String(profile.pay_basis || '').toLowerCase() === 'daily' && daysWorked === 0) {
      grossZeroReason = 'Stored payroll input had 0 days worked for this daily-rate employee.'
    } else if (String(profile.pay_basis || '').toLowerCase() === 'hourly' && hoursWorked === 0) {
      grossZeroReason = 'Stored payroll input had 0 hours worked for this hourly-rate employee.'
    }
  }

  return {
    pay_basis: profile.pay_basis || null,
    pay_rate: roundMoney(num(profile.pay_rate)),
    period_frequency: periodFrequency,
    days_worked: daysWorked,
    hours_worked: hoursWorked,
    overtime_hours: overtimeHours,
    late_minutes: lateMinutes,
    undertime_minutes: undertimeMinutes,
    gross_basic_pay: roundMoney(num(row.gross_basic_pay)),
    gross_overtime_pay: roundMoney(num(row.gross_overtime_pay)),
    gross_night_differential_pay: grossNightDifferentialPay,
    gross_holiday_pay: hasOwn(row, 'gross_holiday_pay')
      ? roundMoney(num(row.gross_holiday_pay))
      : holidayPay,
    gross_rest_day_pay: hasOwn(row, 'gross_rest_day_pay')
      ? roundMoney(num(row.gross_rest_day_pay))
      : restDayPay,
    gross_bonus: roundMoney(num(row.gross_bonus)),
    gross_commission: roundMoney(num(row.gross_commission)),
    gross_allowances: roundMoney(num(row.gross_allowances)),
    gross_pay: roundMoney(num(row.gross_pay)),
    contribution_base: contributionBase,
    taxable_income: roundMoney(num(row.taxable_income)),
    employee_sss: roundMoney(num(row.employee_sss)),
    employee_philhealth: roundMoney(num(row.employee_philhealth)),
    employee_pagibig: roundMoney(num(row.employee_pagibig)),
    withholding_tax: roundMoney(num(row.withholding_tax)),
    total_deductions: roundMoney(num(row.total_deductions)),
    net_pay: roundMoney(num(row.net_pay)),
    other_deductions: roundMoney(num(row.other_deductions)),
    absence_deduction: absenceDeduction,
    late_deduction: lateDeduction,
    undertime_deduction: undertimeDeduction,
    loan_deduction: loanDeduction,
    manual_deduction: manualDeduction,
    withholding_tax_bracket: taxExplanation.withholding_tax_bracket,
    withholding_tax_formula: taxExplanation.withholding_tax_formula,
    gross_zero_reason: grossZeroReason
  }
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

async function listProfileBootstrapCandidates(conn) {
  const hasEmployeesTable = await tableExists('employees', conn)
  if (!hasEmployeesTable) return []

  const joinConditions = []
  if (await columnExists('employees', 'user_id', conn)) joinConditions.push('e.user_id = u.id')
  if (await columnExists('users', 'employee_id', conn)) joinConditions.push('u.employee_id = e.id')
  if (!joinConditions.length) return []

  const [rows] = await conn.query(
    `SELECT DISTINCT
       u.id AS user_id,
       u.username,
       u.full_name,
       u.email,
       e.id AS employee_id,
       e.name AS employee_name,
       e.employment_type,
       e.pay_basis,
       e.pay_rate,
       e.payroll_method,
       e.bank_details
     FROM users u
     JOIN employees e ON (${joinConditions.join(' OR ')})
     LEFT JOIN payroll_profiles pp ON pp.user_id = u.id
     WHERE pp.id IS NULL
       AND COALESCE(u.is_active, 1) = 1
       AND COALESCE(e.employment_status, 'ACTIVE') = 'ACTIVE'
     ORDER BY COALESCE(u.full_name, u.username), u.id`
  )

  return rows
}

async function ensureProfilesForPeriod(conn, period = null) {
  const candidates = await listProfileBootstrapCandidates(conn)
  if (!candidates.length) {
    return {
      auto_created_count: 0,
      skipped_count: 0,
      skipped_employees: []
    }
  }

  const skippedEmployees = []
  let autoCreatedCount = 0

  for (const candidate of candidates) {
    const { profile, reason } = buildBootstrapProfileSeed(candidate, period)
    if (!profile) {
      skippedEmployees.push({
        user_id: Number(candidate.user_id),
        employee_id: Number(candidate.employee_id),
        name: candidate.full_name || candidate.username || candidate.employee_name || `user #${candidate.user_id}`,
        reason
      })
      continue
    }

    const columns = Object.keys(profile)
    await conn.query(
      `INSERT INTO payroll_profiles (${columns.join(', ')})
       VALUES (${columns.map(() => '?').join(', ')})
       ON DUPLICATE KEY UPDATE updated_at = updated_at`,
      columns.map((column) => profile[column])
    )
    autoCreatedCount += 1
  }

  return {
    auto_created_count: autoCreatedCount,
    skipped_count: skippedEmployees.length,
    skipped_employees: skippedEmployees
  }
}

async function loadProfilesForCompute(conn, period = null) {
  const where = [
    "(pp.status = 'active' OR pp.status IS NULL OR pp.status = '')",
    'COALESCE(u.is_active, 1) = 1'
  ]
  const params = []
  if (period?.frequency) {
    where.push("(pp.payroll_frequency = ? OR pp.payroll_frequency IS NULL OR pp.payroll_frequency = '')")
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
  const normalizedRows = rows.map((row) => normalizeProfileForCompute(row, period))
  assertProfilesReadyForPayroll(normalizedRows)
  return normalizedRows
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

    const bootstrap = await ensureProfilesForPeriod(conn, period)
    const profiles = await loadProfilesForCompute(conn, period)
    for (const profile of profiles) {
      await conn.query(
        `INSERT IGNORE INTO payroll_inputs (payroll_period_id, user_id, created_by, updated_by)
         VALUES (?, ?, ?, ?)`,
        [period.id, profile.user_id, actorId || null, actorId || null]
      )
    }

    await conn.commit()
    return { period, loaded_count: profiles.length, ...bootstrap }
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

    const { syncAttendanceToInputs } = require('./syncAttendanceToInputs')
    const syncSummary = await syncAttendanceToInputs(period.id, actorId, { conn })
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
    const runDetails = await getRunDetails(db.pool, draftRun.id)
    return {
      ...runDetails,
      sync_summary: syncSummary
    }
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
       periods.frequency AS period_frequency,
       ${payoutDateSelect(capabilities.columns.payroll_periods)},
       users.id AS user_id,
       users.username,
       ${selectUserFullName(capabilities.columns.users)},
       items.id AS payroll_run_item_id,
       ${selectJsonColumn(capabilities.columns.payroll_run_items, 'payroll_profile_snapshot_json')},
       ${selectJsonColumn(capabilities.columns.payroll_run_items, 'input_snapshot_json')},
       ${selectJsonColumn(capabilities.columns.payroll_run_items, 'settings_snapshot_json')},
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
  const rowsWithBasis = rows.map((row) => ({
    ...row,
    basis_details: buildRegisterBasisDetails(row)
  }))

  return {
    ...reportEmptyResult(query),
    totals: summarizeRegisterRows(rowsWithBasis),
    rows: rowsWithBasis,
    notice: rowsWithBasis.length ? null : reportNoDataNotice()
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

async function getBusinessSummary(query = {}) {
  const capabilities = await getPayrollReportCapabilities()
  const emptyTotals = {
    gross_pay: 0,
    total_deductions: 0,
    net_pay: 0,
    withholding_tax: 0,
    employee_sss: 0,
    employer_sss: 0,
    ec_contribution: 0,
    employee_philhealth: 0,
    employer_philhealth: 0,
    employee_pagibig: 0,
    employer_pagibig: 0,
    employee_count: 0,
    period_count: 0,
    run_count: 0
  }

  if (!capabilities.ready) {
    return {
      ...reportEmptyResult(query),
      totals: emptyTotals,
      by_month: [],
      by_period: [],
      notice: reportSetupNotice(capabilities.missingTables)
    }
  }

  const where = ["runs.status IN ('finalized', 'released')"]
  selectItemStatusFilter(capabilities.columns.payroll_run_items, where)
  const params = []

  if (query.from) {
    where.push('periods.start_date >= ?')
    params.push(query.from)
  }
  if (query.to) {
    where.push('periods.end_date <= ?')
    params.push(query.to)
  }

  const hasGross = capabilities.columns.payroll_run_items.gross_pay
  const hasSss = capabilities.columns.payroll_run_items.employee_sss
  const hasPhilhealth = capabilities.columns.payroll_run_items.employee_philhealth
  const hasPagibig = capabilities.columns.payroll_run_items.employee_pagibig
  const hasTax = capabilities.columns.payroll_run_items.withholding_tax
  const hasDed = capabilities.columns.payroll_run_items.total_deductions
  const hasNet = capabilities.columns.payroll_run_items.net_pay
  const hasErSss = capabilities.columns.payroll_run_items.employer_sss
  const hasErPh = capabilities.columns.payroll_run_items.employer_philhealth
  const hasErPi = capabilities.columns.payroll_run_items.employer_pagibig
  const hasEc = capabilities.columns.payroll_run_items.ec_contribution

  const colSel = (col, alias) =>
    `COALESCE(SUM(${col ? `items.${alias}` : '0'}), 0) AS ${alias}`

  const aggregateCols = [
    colSel(hasGross, 'gross_pay'),
    colSel(hasDed, 'total_deductions'),
    colSel(hasNet, 'net_pay'),
    colSel(hasTax, 'withholding_tax'),
    colSel(hasSss, 'employee_sss'),
    colSel(hasErSss, 'employer_sss'),
    colSel(hasEc, 'ec_contribution'),
    colSel(hasPhilhealth, 'employee_philhealth'),
    colSel(hasErPh, 'employer_philhealth'),
    colSel(hasPagibig, 'employee_pagibig'),
    colSel(hasErPi, 'employer_pagibig')
  ].join(',\n       ')

  const whereClause = `WHERE ${where.join(' AND ')}`

  const [[overall]] = await db.pool.query(
    `SELECT
       ${aggregateCols},
       COUNT(DISTINCT items.user_id) AS employee_count,
       COUNT(DISTINCT periods.id) AS period_count,
       COUNT(DISTINCT runs.id) AS run_count
     FROM payroll_run_items items
     JOIN payroll_runs runs ON runs.id = items.payroll_run_id
     JOIN payroll_periods periods ON periods.id = runs.payroll_period_id
     ${whereClause}`,
    params
  )

  const [byMonth] = await db.pool.query(
    `SELECT
       DATE_FORMAT(periods.start_date, '%Y-%m') AS month_key,
       DATE_FORMAT(periods.start_date, '%b %Y') AS month_label,
       ${aggregateCols},
       COUNT(DISTINCT items.user_id) AS employee_count,
       COUNT(DISTINCT periods.id) AS period_count
     FROM payroll_run_items items
     JOIN payroll_runs runs ON runs.id = items.payroll_run_id
     JOIN payroll_periods periods ON periods.id = runs.payroll_period_id
     ${whereClause}
     GROUP BY DATE_FORMAT(periods.start_date, '%Y-%m'), DATE_FORMAT(periods.start_date, '%b %Y')
     ORDER BY month_key ASC`,
    params
  )

  const [byPeriod] = await db.pool.query(
    `SELECT
       periods.id AS payroll_period_id,
       periods.code AS period_code,
       periods.start_date,
       periods.end_date,
       periods.frequency AS period_frequency,
       ${payoutDateSelect(capabilities.columns.payroll_periods)},
       runs.id AS payroll_run_id,
       runs.run_number,
       runs.status AS run_status,
       ${aggregateCols},
       COUNT(DISTINCT items.user_id) AS employee_count
     FROM payroll_run_items items
     JOIN payroll_runs runs ON runs.id = items.payroll_run_id
     JOIN payroll_periods periods ON periods.id = runs.payroll_period_id
     ${whereClause}
     GROUP BY periods.id, periods.code, periods.start_date, periods.end_date, periods.frequency${payoutDateGroupBy(capabilities.columns.payroll_periods)}, runs.id, runs.run_number, runs.status
     ORDER BY ${payoutDateOrderBy(capabilities.columns.payroll_periods, 'runs.id DESC')}`,
    params
  )

  const numFields = [
    'gross_pay', 'total_deductions', 'net_pay', 'withholding_tax',
    'employee_sss', 'employer_sss', 'ec_contribution',
    'employee_philhealth', 'employer_philhealth',
    'employee_pagibig', 'employer_pagibig'
  ]
  const totals = { ...emptyTotals }
  for (const f of numFields) totals[f] = roundMoney(Number(overall?.[f] || 0))
  totals.employee_count = Number(overall?.employee_count || 0)
  totals.period_count = Number(overall?.period_count || 0)
  totals.run_count = Number(overall?.run_count || 0)

  return {
    ...reportEmptyResult(query),
    totals,
    by_month: byMonth.map((r) => {
      const m = { ...r }
      for (const f of numFields) m[f] = roundMoney(Number(m[f] || 0))
      m.employee_count = Number(m.employee_count || 0)
      m.period_count = Number(m.period_count || 0)
      return m
    }),
    by_period: byPeriod.map((r) => {
      const p = { ...r }
      for (const f of numFields) p[f] = roundMoney(Number(p[f] || 0))
      p.employee_count = Number(p.employee_count || 0)
      return p
    }),
    notice: totals.run_count ? null : reportNoDataNotice()
  }
}

module.exports = {
  computePayrollRun,
  ensureProfilesForPeriod,
  finalizeRun,
  getActivePayrollSettings,
  getBusinessSummary,
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
