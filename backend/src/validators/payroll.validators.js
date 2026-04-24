const PAY_BASIS_VALUES = ['monthly', 'daily', 'hourly']
const PAYROLL_FREQUENCIES = ['weekly', 'semi_monthly', 'monthly']
const PAYROLL_METHODS = ['cash', 'bank_transfer', 'ewallet']
const PROFILE_STATUSES = ['active', 'inactive']
const PERIOD_STATUSES = ['draft', 'computed', 'finalized', 'released', 'void']
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

function validationError(message) {
  const err = new Error(message)
  err.statusCode = 400
  return err
}

function hasOwn(payload, key) {
  return Object.prototype.hasOwnProperty.call(payload || {}, key)
}

function asText(value, fieldName, options = {}) {
  if (value === undefined || value === null) {
    if (options.required) throw validationError(`${fieldName} is required`)
    return options.defaultValue
  }
  const normalized = String(value).trim()
  if (!normalized && options.required) throw validationError(`${fieldName} is required`)
  if (!normalized) return options.defaultValue ?? null
  if (options.maxLength && normalized.length > options.maxLength) {
    throw validationError(`${fieldName} must be ${options.maxLength} characters or fewer`)
  }
  return normalized
}

function asEnum(value, fieldName, allowedValues, options = {}) {
  const raw = value === undefined || value === null || value === ''
    ? options.defaultValue
    : String(value).trim().toLowerCase()
  if (!raw) {
    if (options.required) throw validationError(`${fieldName} is required`)
    return options.defaultValue
  }
  const normalized = raw === 'e_wallet' || raw === 'e-wallet' ? 'ewallet' : raw
  if (!allowedValues.includes(normalized)) {
    throw validationError(`${fieldName} must be one of: ${allowedValues.join(', ')}`)
  }
  return normalized
}

function asNumber(value, fieldName, options = {}) {
  if (value === undefined || value === null || value === '') {
    if (options.required) throw validationError(`${fieldName} is required`)
    return options.defaultValue ?? 0
  }
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) throw validationError(`${fieldName} must be a valid number`)
  if (options.integer && Math.trunc(parsed) !== parsed) throw validationError(`${fieldName} must be a whole number`)
  if (options.min !== undefined && parsed < options.min) throw validationError(`${fieldName} must be at least ${options.min}`)
  return options.integer ? Math.trunc(parsed) : Math.round(parsed * 100) / 100
}

function asOptionalNumber(value, fieldName, options = {}) {
  if (value === undefined || value === null || value === '') return null
  return asNumber(value, fieldName, options)
}

function asBooleanFlag(value, defaultValue = 0) {
  if (value === undefined || value === null || value === '') return defaultValue ? 1 : 0
  if (value === true || value === 1 || value === '1') return 1
  if (value === false || value === 0 || value === '0') return 0
  const normalized = String(value).trim().toLowerCase()
  if (['true', 'yes', 'on'].includes(normalized)) return 1
  if (['false', 'no', 'off'].includes(normalized)) return 0
  return defaultValue ? 1 : 0
}

function asDateOnly(value, fieldName, options = {}) {
  if (value === undefined || value === null || value === '') {
    if (options.required) throw validationError(`${fieldName} is required`)
    return options.defaultValue ?? null
  }
  const normalized = String(value).trim().slice(0, 10)
  if (!DATE_PATTERN.test(normalized)) throw validationError(`${fieldName} must use YYYY-MM-DD format`)
  const parsed = new Date(`${normalized}T00:00:00.000Z`)
  if (Number.isNaN(parsed.getTime())) throw validationError(`${fieldName} is not a valid date`)
  return normalized
}

function asPositiveId(value, fieldName = 'id') {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) throw validationError(`${fieldName} must be a valid positive integer`)
  return parsed
}

function validateProfilePayload(payload = {}, options = {}) {
  const partial = options.partial === true
  const body = payload || {}
  const profile = {}

  if (!partial || hasOwn(body, 'user_id')) profile.user_id = asPositiveId(body.user_id, 'user_id')
  if (hasOwn(body, 'branch_id')) profile.branch_id = body.branch_id ? asPositiveId(body.branch_id, 'branch_id') : null
  if (!partial || hasOwn(body, 'employment_type')) profile.employment_type = asText(body.employment_type, 'employment_type', { maxLength: 64, defaultValue: null })
  if (!partial || hasOwn(body, 'pay_basis')) profile.pay_basis = asEnum(body.pay_basis, 'pay_basis', PAY_BASIS_VALUES, { required: !partial })
  if (!partial || hasOwn(body, 'pay_rate')) profile.pay_rate = asNumber(body.pay_rate, 'pay_rate', { required: !partial, min: 0 })
  if (!partial || hasOwn(body, 'payroll_frequency')) profile.payroll_frequency = asEnum(body.payroll_frequency, 'payroll_frequency', PAYROLL_FREQUENCIES, { defaultValue: 'semi_monthly' })
  if (hasOwn(body, 'standard_work_days_per_month')) profile.standard_work_days_per_month = asOptionalNumber(body.standard_work_days_per_month, 'standard_work_days_per_month', { min: 0 })
  if (hasOwn(body, 'standard_hours_per_day')) profile.standard_hours_per_day = asOptionalNumber(body.standard_hours_per_day, 'standard_hours_per_day', { min: 0 })

  for (const key of ['overtime_eligible', 'late_deduction_enabled', 'undertime_deduction_enabled', 'tax_enabled', 'sss_enabled', 'philhealth_enabled', 'pagibig_enabled']) {
    if (!partial || hasOwn(body, key)) profile[key] = asBooleanFlag(body[key], key === 'overtime_eligible' ? 1 : 1)
  }

  if (!partial || hasOwn(body, 'payroll_method')) profile.payroll_method = asEnum(body.payroll_method, 'payroll_method', PAYROLL_METHODS, { defaultValue: 'cash' })
  if (hasOwn(body, 'bank_name')) profile.bank_name = asText(body.bank_name, 'bank_name', { maxLength: 150, defaultValue: null })
  if (hasOwn(body, 'bank_account_name')) profile.bank_account_name = asText(body.bank_account_name, 'bank_account_name', { maxLength: 180, defaultValue: null })
  if (hasOwn(body, 'bank_account_number')) profile.bank_account_number = asText(body.bank_account_number, 'bank_account_number', { maxLength: 80, defaultValue: null })
  if (!partial || hasOwn(body, 'status')) profile.status = asEnum(body.status, 'status', PROFILE_STATUSES, { defaultValue: 'active' })

  return profile
}

function validatePeriodPayload(payload = {}) {
  const body = payload || {}
  const startDate = asDateOnly(body.start_date, 'start_date', { required: true })
  const endDate = asDateOnly(body.end_date, 'end_date', { required: true })
  if (startDate > endDate) throw validationError('start_date must be earlier than or equal to end_date')

  return {
    branch_id: body.branch_id ? asPositiveId(body.branch_id, 'branch_id') : null,
    code: asText(body.code || `PAY-${startDate}-${endDate}`, 'code', { required: true, maxLength: 80 }),
    start_date: startDate,
    end_date: endDate,
    payout_date: asDateOnly(body.payout_date, 'payout_date', { required: true }),
    frequency: asEnum(body.frequency, 'frequency', PAYROLL_FREQUENCIES, { defaultValue: 'semi_monthly' }),
    notes: asText(body.notes, 'notes', { defaultValue: null })
  }
}

function validateInputPayload(payload = {}) {
  const body = payload || {}
  const result = {}
  for (const key of [
    'days_worked',
    'hours_worked',
    'overtime_hours',
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
    'manual_deduction'
  ]) {
    if (hasOwn(body, key)) result[key] = asNumber(body[key], key, { min: 0 })
  }
  for (const key of ['late_minutes', 'undertime_minutes', 'night_differential_minutes']) {
    if (hasOwn(body, key)) result[key] = asNumber(body[key], key, { min: 0, integer: true })
  }
  if (hasOwn(body, 'remarks')) result.remarks = asText(body.remarks, 'remarks', { defaultValue: null })
  return result
}

function validateSettingsPayload(payload = {}) {
  const body = payload || {}
  const settings = body.settings_json || body.settings || (() => {
    const { version_name, effective_from, effective_to, is_active, created_by, ...rest } = body
    return rest
  })()
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
    throw validationError('settings_json must be an object')
  }
  return {
    version_name: asText(body.version_name || 'Payroll Settings', 'version_name', { required: true, maxLength: 120 }),
    effective_from: asDateOnly(body.effective_from || new Date().toISOString().slice(0, 10), 'effective_from', { required: true }),
    settings_json: settings
  }
}

function parseReportQuery(query = {}) {
  return {
    from: asDateOnly(query.from, 'from'),
    to: asDateOnly(query.to, 'to'),
    payroll_period_id: query.payroll_period_id ? asPositiveId(query.payroll_period_id, 'payroll_period_id') : null,
    payroll_run_id: query.payroll_run_id ? asPositiveId(query.payroll_run_id, 'payroll_run_id') : null,
    user_id: query.user_id ? asPositiveId(query.user_id, 'user_id') : null
  }
}

module.exports = {
  PERIOD_STATUSES,
  PROFILE_STATUSES,
  PAYROLL_FREQUENCIES,
  PAYROLL_METHODS,
  PAY_BASIS_VALUES,
  asPositiveId,
  parseReportQuery,
  validateInputPayload,
  validatePeriodPayload,
  validateProfilePayload,
  validateSettingsPayload,
  validationError
}
