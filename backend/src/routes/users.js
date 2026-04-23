const express = require('express')
const router = express.Router()
const db = require('../database')
const fs = require('fs/promises')
const path = require('path')
const crypto = require('crypto')
const bcrypt = require('bcrypt')
const multer = require('multer')
const { verifyToken, authorize } = require('../middleware/authMiddleware')
const { getDefaultNewUserPassword } = require('../config/security')
const { logAuditEventSafe } = require('../utils/auditLog')

const PRIVATE_UPLOAD_ROOT = path.join(__dirname, '..', '..', 'private_uploads')
const EMPLOYEE_DOCS_DIR = path.join(PRIVATE_UPLOAD_ROOT, 'employee-docs')
const MAX_DOCUMENT_SIZE = 50 * 1024 * 1024
const DOCUMENT_STATUSES = ['NOT_SUBMITTED', 'SUBMITTED', 'VERIFIED', 'REJECTED', 'EXPIRED']
const EMPLOYMENT_TYPES = ['PROBATIONARY', 'REGULAR', 'CONTRACTUAL', 'PART_TIME', 'SEASONAL', 'INTERN']
const EMPLOYMENT_STATUSES = ['ACTIVE', 'INACTIVE', 'TERMINATED']
const PAY_BASES = ['DAILY', 'MONTHLY']
const PAYROLL_METHODS = ['CASH', 'BANK_TRANSFER', 'E_WALLET']
const PAYROLL_FREQUENCIES = ['WEEKLY', 'SEMI_MONTHLY', 'MONTHLY']
const ALLOWED_MIME_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png'])
const ALLOWED_EXTENSIONS = new Set(['.pdf', '.jpg', '.jpeg', '.png'])
const EMPLOYEE_DOCUMENT_TYPES = [
  { type: 'PSA_BIRTH_CERTIFICATE', label: 'PSA Birth Certificate', required: true },
  { type: 'VALID_GOVERNMENT_ID', label: 'Valid Government ID', required: true },
  { type: 'TIN_PROOF_OR_BIR_1902', label: 'TIN Proof / BIR Form 1902', required: true },
  { type: 'SSS_PROOF', label: 'SSS Proof', required: true },
  { type: 'PHILHEALTH_PROOF', label: 'PhilHealth Proof', required: true },
  { type: 'PAGIBIG_PROOF', label: 'Pag-IBIG Proof', required: true },
  { type: 'NBI_CLEARANCE', label: 'NBI Clearance', required: true },
  { type: 'MARRIAGE_CERTIFICATE', label: 'Marriage Certificate', required: false },
  { type: 'DEPENDENT_BIRTH_CERTIFICATE', label: 'Dependent Birth Certificate', required: false },
  { type: 'ACR_WORK_PERMIT_PASSPORT', label: 'ACR / Work Permit / Passport', required: false },
  { type: 'MEDICAL_CERTIFICATE', label: 'Medical Certificate', required: false }
]
const EMPLOYEE_DOCUMENT_TYPE_MAP = new Map(EMPLOYEE_DOCUMENT_TYPES.map((item) => [item.type, item]))
const EMPLOYEE_SELECT_COLUMNS = [
  'id',
  'name',
  'first_name',
  'last_name',
  'role',
  'contact_type',
  'contact',
  'hire_date',
  'pay_rate',
  'employment_status',
  'bank_details',
  'birth_date',
  'sex',
  'civil_status',
  'nationality',
  'mobile_number',
  'present_address',
  'permanent_address',
  'position_title',
  'department_name',
  'employment_type',
  'pay_basis',
  'payroll_method',
  'tin',
  'sss_number',
  'philhealth_pin',
  'pagibig_mid',
  'emergency_contact_name',
  'emergency_contact_relationship',
  'emergency_contact_number',
  'emergency_contact_address',
  'created_at'
]
const EMPLOYEE_PROFILE_KEYS = [
  'birth_date',
  'sex',
  'civil_status',
  'nationality',
  'mobile_number',
  'present_address',
  'permanent_address',
  'position_title',
  'department_name',
  'hire_date',
  'employment_type',
  'employment_status',
  'pay_basis',
  'pay_rate',
  'payroll_method',
  'tin',
  'sss_number',
  'philhealth_pin',
  'pagibig_mid',
  'emergency_contact_name',
  'emergency_contact_relationship',
  'emergency_contact_number',
  'emergency_contact_address',
  'bank_details',
  'contact_type',
  'contact'
]
const PAYROLL_PROFILE_SELECT_COLUMNS = [
  'id',
  'user_id',
  'employment_type',
  'pay_basis',
  'pay_rate',
  'payroll_frequency',
  'overtime_eligible',
  'late_deduction_enabled',
  'undertime_deduction_enabled',
  'tax_enabled',
  'sss_enabled',
  'philhealth_enabled',
  'pagibig_enabled',
  'payroll_method',
  'status'
]

let ensureEmployeeSchemaPromise = null
let hasUsersRoleIdColumnCache = null
let hasUsersEmployeeIdColumnCache = null
let hasEmployeesEmailColumnCache = null
let hasEmployeesUserIdColumnCache = null
let hasPayrollProfilesTableCache = null

async function ensureDirectory(targetPath) {
  await fs.mkdir(targetPath, { recursive: true })
}

const documentStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    ensureDirectory(EMPLOYEE_DOCS_DIR)
      .then(() => cb(null, EMPLOYEE_DOCS_DIR))
      .catch(cb)
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase()
    const safeExt = ALLOWED_EXTENSIONS.has(ext) ? ext : ''
    const fileName = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${safeExt}`
    cb(null, fileName)
  }
})

const documentUpload = multer({
  storage: documentStorage,
  limits: { fileSize: MAX_DOCUMENT_SIZE },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase()
    if (!ALLOWED_EXTENSIONS.has(ext) || !ALLOWED_MIME_TYPES.has(String(file.mimetype || '').toLowerCase())) {
      cb(new Error('Only PDF, JPG, JPEG, and PNG files are allowed'))
      return
    }
    cb(null, true)
  }
})

function handleDocumentUpload(req, res, next) {
  documentUpload.single('file')(req, res, (err) => {
    if (!err) {
      next()
      return
    }

    if (err.code === 'LIMIT_FILE_SIZE') {
      res.status(400).json({ error: 'Document files must be 50MB or smaller' })
      return
    }

    res.status(400).json({ error: err.message || 'Invalid document upload' })
  })
}

function safeJsonParse(value) {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'object') return value
  try {
    return JSON.parse(String(value))
  } catch (err) {
    return null
  }
}

function normalizeText(value) {
  const text = String(value ?? '').trim()
  return text || null
}

function splitFullName(value) {
  const fullName = String(value || '').trim().replace(/\s+/g, ' ')
  if (!fullName) return { firstName: null, lastName: null }
  const [firstName, ...rest] = fullName.split(' ')
  return {
    firstName: normalizeText(firstName),
    lastName: normalizeText(rest.join(' '))
  }
}

function composeFullName(firstName, lastName, fallback = null) {
  const name = [firstName, lastName].map((part) => normalizeText(part)).filter(Boolean).join(' ')
  return normalizeText(name) || normalizeText(fallback)
}

function normalizePersonNamePayload(payload = {}, fallback = {}) {
  const fallbackParts = splitFullName(fallback.full_name || fallback.name)
  let firstName = Object.prototype.hasOwnProperty.call(payload, 'first_name')
    ? normalizeText(payload.first_name)
    : normalizeText(fallback.first_name) || fallbackParts.firstName
  let lastName = Object.prototype.hasOwnProperty.call(payload, 'last_name')
    ? normalizeText(payload.last_name)
    : normalizeText(fallback.last_name) || fallbackParts.lastName
  const legacyFullName = normalizeText(payload.full_name)

  if ((!firstName || !lastName) && legacyFullName) {
    const legacyParts = splitFullName(legacyFullName)
    if (!firstName) firstName = legacyParts.firstName
    if (!lastName) lastName = legacyParts.lastName
  }

  return {
    firstName,
    lastName,
    fullName: composeFullName(firstName, lastName, legacyFullName || fallback.full_name || fallback.name)
  }
}

function hasNamePayload(payload = {}) {
  return Object.prototype.hasOwnProperty.call(payload, 'first_name')
    || Object.prototype.hasOwnProperty.call(payload, 'last_name')
    || Object.prototype.hasOwnProperty.call(payload, 'full_name')
}

function normalizeUpperText(value) {
  const text = normalizeText(value)
  return text ? text.toUpperCase() : null
}

function normalizeDateValue(value) {
  if (value === null || value === undefined || value === '') return null
  const raw = String(value).trim()
  if (!raw) return null
  const isoDate = raw.length >= 10 ? raw.slice(0, 10) : raw
  return /^\d{4}-\d{2}-\d{2}$/.test(isoDate) ? isoDate : null
}

function normalizeNumericRate(value) {
  if (value === null || value === undefined || value === '') return null
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

function normalizePhoneNumber(value) {
  const text = normalizeText(value)
  if (!text) return null
  return text.replace(/\s+/g, '')
}

function normalizeGovernmentId(value) {
  const text = normalizeText(value)
  if (!text) return null
  return text.replace(/\s+/g, '').toUpperCase()
}

function normalizeEnumValue(value, allowedValues, fallback = null) {
  if (value === null || value === undefined || value === '') return fallback
  const normalized = String(value).trim().toUpperCase()
  return allowedValues.includes(normalized) ? normalized : fallback
}

function normalizeBankDetails(value) {
  const raw = safeJsonParse(value)
  if (!raw || typeof raw !== 'object') return null

  const details = {
    provider_name: normalizeText(raw.provider_name || raw.bank_name || raw.provider),
    account_name: normalizeText(raw.account_name || raw.account_holder),
    account_number: normalizeText(raw.account_number),
    account_type: normalizeText(raw.account_type)
  }

  return Object.values(details).some(Boolean) ? details : null
}

function normalizeBooleanFlag(value) {
  if (value === null || value === undefined || value === '') return null
  return Number(value) === 1
}

function hasConfiguredValue(value) {
  return value !== null && value !== undefined && value !== ''
}

function hasPositiveRate(value) {
  if (!hasConfiguredValue(value)) return false
  const numeric = Number(value)
  return Number.isFinite(numeric) && numeric > 0
}

function getProvidedEmployeeKeys(payload = {}) {
  return EMPLOYEE_PROFILE_KEYS.filter((key) => Object.prototype.hasOwnProperty.call(payload, key))
}

function hasEmployeePayload(payload = {}) {
  return getProvidedEmployeeKeys(payload).length > 0
}

function normalizeEmployeePayload(payload = {}) {
  const mobileNumber = normalizePhoneNumber(payload.mobile_number || payload.contact)
  return {
    birth_date: normalizeDateValue(payload.birth_date),
    sex: normalizeUpperText(payload.sex),
    civil_status: normalizeUpperText(payload.civil_status),
    nationality: normalizeText(payload.nationality) || 'Filipino',
    mobile_number: mobileNumber,
    present_address: normalizeText(payload.present_address),
    permanent_address: normalizeText(payload.permanent_address),
    position_title: normalizeText(payload.position_title),
    department_name: normalizeText(payload.department_name),
    hire_date: normalizeDateValue(payload.hire_date),
    employment_type: normalizeEnumValue(payload.employment_type, EMPLOYMENT_TYPES),
    employment_status: normalizeEnumValue(payload.employment_status, EMPLOYMENT_STATUSES, 'ACTIVE'),
    pay_basis: normalizeEnumValue(payload.pay_basis, PAY_BASES),
    pay_rate: normalizeNumericRate(payload.pay_rate),
    payroll_method: normalizeEnumValue(payload.payroll_method, PAYROLL_METHODS),
    bank_details: normalizeBankDetails(payload.bank_details),
    tin: normalizeGovernmentId(payload.tin),
    sss_number: normalizeGovernmentId(payload.sss_number),
    philhealth_pin: normalizeGovernmentId(payload.philhealth_pin),
    pagibig_mid: normalizeGovernmentId(payload.pagibig_mid),
    emergency_contact_name: normalizeText(payload.emergency_contact_name),
    emergency_contact_relationship: normalizeText(payload.emergency_contact_relationship),
    emergency_contact_number: normalizePhoneNumber(payload.emergency_contact_number),
    emergency_contact_address: normalizeText(payload.emergency_contact_address),
    contact_type: mobileNumber ? 'Mobile' : normalizeText(payload.contact_type),
    contact: mobileNumber || normalizeText(payload.contact)
  }
}

function validateGovernmentId(value) {
  if (!value) return true
  return /^[0-9-]+$/.test(value)
}

function validateMobileNumber(value) {
  if (!value) return false
  return /^(09\d{9}|\+639\d{9})$/.test(value)
}

function validateEmployeePayload(employee, { requireStarterProfile = false } = {}) {
  if (employee.mobile_number && !validateMobileNumber(employee.mobile_number)) {
    return 'Mobile number must use 09xxxxxxxxx or +639xxxxxxxxx format'
  }

  if (employee.pay_rate !== null && employee.pay_rate !== undefined) {
    if (!Number.isFinite(employee.pay_rate) || employee.pay_rate <= 0) return 'Pay rate must be greater than 0'
  }

  for (const idValue of [employee.tin, employee.sss_number, employee.philhealth_pin, employee.pagibig_mid]) {
    if (!validateGovernmentId(idValue)) return 'Government numbers may only contain digits and hyphens'
  }

  if (!requireStarterProfile) return null

  if (!employee.position_title) return 'Position title is required'
  if (!employee.hire_date) return 'Hire date is required'
  if (!employee.employment_status) return 'Employment status is required'

  return null
}

function normalizeDocumentType(value) {
  const normalized = normalizeUpperText(value)
  return normalized && EMPLOYEE_DOCUMENT_TYPE_MAP.has(normalized) ? normalized : null
}

function normalizeDocumentStatus(value, hasFile) {
  const status = normalizeEnumValue(value, DOCUMENT_STATUSES, hasFile ? 'SUBMITTED' : 'NOT_SUBMITTED')
  if (status === 'VERIFIED' && !hasFile) return null
  return status
}

function getDocumentLabel(documentType) {
  return EMPLOYEE_DOCUMENT_TYPE_MAP.get(documentType)?.label || documentType
}

async function columnExists(tableName, columnName, conn = db.pool) {
  const [rows] = await conn.query(
    `SELECT 1 AS found
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND COLUMN_NAME = ?
     LIMIT 1`,
    [tableName, columnName]
  )
  return rows.length > 0
}

async function tableExists(tableName, conn = db.pool) {
  const [rows] = await conn.query(
    `SELECT 1 AS found
     FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
     LIMIT 1`,
    [tableName]
  )
  return rows.length > 0
}

async function hasUsersRoleIdColumn(conn = db.pool) {
  if (hasUsersRoleIdColumnCache !== null) return hasUsersRoleIdColumnCache
  hasUsersRoleIdColumnCache = await columnExists('users', 'role_id', conn)
  return hasUsersRoleIdColumnCache
}

async function hasUsersEmployeeIdColumn(conn = db.pool) {
  if (hasUsersEmployeeIdColumnCache !== null) return hasUsersEmployeeIdColumnCache
  hasUsersEmployeeIdColumnCache = await columnExists('users', 'employee_id', conn)
  return hasUsersEmployeeIdColumnCache
}

async function hasEmployeesEmailColumn(conn = db.pool) {
  if (hasEmployeesEmailColumnCache !== null) return hasEmployeesEmailColumnCache
  hasEmployeesEmailColumnCache = await columnExists('employees', 'email', conn)
  return hasEmployeesEmailColumnCache
}

async function hasEmployeesUserIdColumn(conn = db.pool) {
  if (hasEmployeesUserIdColumnCache !== null) return hasEmployeesUserIdColumnCache
  hasEmployeesUserIdColumnCache = await columnExists('employees', 'user_id', conn)
  return hasEmployeesUserIdColumnCache
}

async function hasPayrollProfilesTable(conn = db.pool) {
  if (hasPayrollProfilesTableCache !== null) return hasPayrollProfilesTableCache
  hasPayrollProfilesTableCache = await tableExists('payroll_profiles', conn)
  return hasPayrollProfilesTableCache
}

async function ensureEmployeeSchema() {
  if (ensureEmployeeSchemaPromise) return ensureEmployeeSchemaPromise

  ensureEmployeeSchemaPromise = (async () => {
    const statements = [
      "ALTER TABLE users ADD COLUMN first_name VARCHAR(120) NULL AFTER full_name",
      "ALTER TABLE users ADD COLUMN last_name VARCHAR(120) NULL AFTER first_name",
      "ALTER TABLE employees ADD COLUMN birth_date DATE NULL AFTER name",
      "ALTER TABLE employees ADD COLUMN first_name VARCHAR(120) NULL AFTER name",
      "ALTER TABLE employees ADD COLUMN last_name VARCHAR(120) NULL AFTER first_name",
      "ALTER TABLE employees ADD COLUMN sex VARCHAR(32) NULL AFTER birth_date",
      "ALTER TABLE employees ADD COLUMN civil_status VARCHAR(32) NULL AFTER sex",
      "ALTER TABLE employees ADD COLUMN nationality VARCHAR(100) NULL AFTER civil_status",
      "ALTER TABLE employees ADD COLUMN mobile_number VARCHAR(32) NULL AFTER nationality",
      "ALTER TABLE employees ADD COLUMN present_address TEXT NULL AFTER mobile_number",
      "ALTER TABLE employees ADD COLUMN permanent_address TEXT NULL AFTER present_address",
      "ALTER TABLE employees ADD COLUMN position_title VARCHAR(150) NULL AFTER permanent_address",
      "ALTER TABLE employees ADD COLUMN department_name VARCHAR(150) NULL AFTER position_title",
      "ALTER TABLE employees ADD COLUMN employment_type ENUM('PROBATIONARY','REGULAR','CONTRACTUAL','PART_TIME','SEASONAL','INTERN') NULL AFTER hire_date",
      "ALTER TABLE employees ADD COLUMN pay_basis ENUM('DAILY','MONTHLY') NULL AFTER employment_status",
      "ALTER TABLE employees ADD COLUMN payroll_method ENUM('CASH','BANK_TRANSFER','E_WALLET') NULL AFTER pay_rate",
      "ALTER TABLE employees ADD COLUMN tin VARCHAR(64) NULL AFTER payroll_method",
      "ALTER TABLE employees ADD COLUMN sss_number VARCHAR(64) NULL AFTER tin",
      "ALTER TABLE employees ADD COLUMN philhealth_pin VARCHAR(64) NULL AFTER sss_number",
      "ALTER TABLE employees ADD COLUMN pagibig_mid VARCHAR(64) NULL AFTER philhealth_pin",
      "ALTER TABLE employees ADD COLUMN emergency_contact_name VARCHAR(255) NULL AFTER pagibig_mid",
      "ALTER TABLE employees ADD COLUMN emergency_contact_relationship VARCHAR(120) NULL AFTER emergency_contact_name",
      "ALTER TABLE employees ADD COLUMN emergency_contact_number VARCHAR(32) NULL AFTER emergency_contact_relationship",
      "ALTER TABLE employees ADD COLUMN emergency_contact_address TEXT NULL AFTER emergency_contact_number"
    ]

    for (const statement of statements) {
      try {
        await db.pool.query(statement)
      } catch (err) {
        if (err?.code !== 'ER_DUP_FIELDNAME') throw err
      }
    }

    await db.pool.query(`
      UPDATE users
      SET
        first_name = COALESCE(NULLIF(TRIM(first_name), ''), NULLIF(TRIM(SUBSTRING_INDEX(COALESCE(NULLIF(full_name, ''), username, email, ''), ' ', 1)), '')),
        last_name = COALESCE(NULLIF(TRIM(last_name), ''), NULLIF(TRIM(SUBSTRING(COALESCE(NULLIF(full_name, ''), ''), LENGTH(SUBSTRING_INDEX(COALESCE(NULLIF(full_name, ''), ''), ' ', 1)) + 1)), ''))
      WHERE first_name IS NULL OR TRIM(first_name) = '' OR last_name IS NULL
    `)

    await db.pool.query(`
      UPDATE employees
      SET
        first_name = COALESCE(NULLIF(TRIM(first_name), ''), NULLIF(TRIM(SUBSTRING_INDEX(COALESCE(NULLIF(name, ''), ''), ' ', 1)), '')),
        last_name = COALESCE(NULLIF(TRIM(last_name), ''), NULLIF(TRIM(SUBSTRING(COALESCE(NULLIF(name, ''), ''), LENGTH(SUBSTRING_INDEX(COALESCE(NULLIF(name, ''), ''), ' ', 1)) + 1)), ''))
      WHERE first_name IS NULL OR TRIM(first_name) = '' OR last_name IS NULL
    `)

    await db.pool.query(`
      CREATE TABLE IF NOT EXISTS employee_documents (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        employee_id BIGINT UNSIGNED NOT NULL,
        file_id BIGINT UNSIGNED NULL,
        document_type VARCHAR(100) NOT NULL,
        document_number VARCHAR(255) NULL,
        issuing_agency VARCHAR(255) NULL,
        issue_date DATE NULL,
        expiry_date DATE NULL,
        status ENUM('NOT_SUBMITTED','SUBMITTED','VERIFIED','REJECTED','EXPIRED') DEFAULT 'NOT_SUBMITTED',
        remarks TEXT NULL,
        verified_by BIGINT UNSIGNED NULL,
        verified_at TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_employee_documents_employee FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
        CONSTRAINT fk_employee_documents_file FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE SET NULL,
        CONSTRAINT fk_employee_documents_verified_by FOREIGN KEY (verified_by) REFERENCES users(id) ON DELETE SET NULL,
        UNIQUE KEY uq_employee_documents_employee_type (employee_id, document_type),
        KEY idx_employee_documents_status (status),
        KEY idx_employee_documents_expiry_date (expiry_date)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `)
  })().catch((err) => {
    ensureEmployeeSchemaPromise = null
    throw err
  })

  return ensureEmployeeSchemaPromise
}

async function resolvePrimaryRoleLabel(roles, conn) {
  if (!Array.isArray(roles) || !roles.length) return null
  const first = roles[0]
  if (Number(first)) {
    const [rows] = await conn.query('SELECT name FROM roles WHERE id = ? LIMIT 1', [Number(first)])
    return rows.length ? rows[0].name : null
  }
  return String(first || '').trim() || null
}

async function getUserRoles(conn, userId, directRoleId) {
  const includeDirectRole = await hasUsersRoleIdColumn(conn)
  const roleSql = includeDirectRole
    ? `SELECT DISTINCT name FROM roles WHERE id IN (SELECT role_id FROM user_roles WHERE user_id = ?) OR id = ?`
    : `SELECT DISTINCT name FROM roles WHERE id IN (SELECT role_id FROM user_roles WHERE user_id = ?)`
  const roleParams = includeDirectRole ? [userId, directRoleId || null] : [userId]
  const [roleRows] = await conn.query(roleSql, roleParams)
  return roleRows.map((row) => row.name)
}

async function findEmployeeForUser(conn, userRow) {
  const includeEmployeesUserId = await hasEmployeesUserIdColumn(conn)
  const includeEmployeeLink = await hasUsersEmployeeIdColumn(conn)
  const includeEmployeesEmail = await hasEmployeesEmailColumn(conn)
  const selectColumns = EMPLOYEE_SELECT_COLUMNS.join(', ')

  if (includeEmployeesUserId) {
    const [rows] = await conn.query(`SELECT ${selectColumns} FROM employees WHERE user_id = ? LIMIT 1`, [userRow.id])
    if (rows.length) return rows[0]
  }

  if (includeEmployeeLink && userRow.employee_id) {
    const [rows] = await conn.query(`SELECT ${selectColumns} FROM employees WHERE id = ? LIMIT 1`, [userRow.employee_id])
    if (rows.length) return rows[0]
  }

  if (includeEmployeesEmail && userRow.email) {
    const [rows] = await conn.query(`SELECT ${selectColumns} FROM employees WHERE email = ? LIMIT 1`, [userRow.email])
    if (rows.length) return rows[0]
  }

  return null
}

async function findPayrollProfileForUser(conn, userId) {
  const includePayrollProfiles = await hasPayrollProfilesTable(conn)
  if (!includePayrollProfiles) return null

  const [rows] = await conn.query(
    `SELECT ${PAYROLL_PROFILE_SELECT_COLUMNS.join(', ')}
     FROM payroll_profiles
     WHERE user_id = ?
     ORDER BY id DESC
     LIMIT 1`,
    [userId]
  )

  return rows[0] || null
}

function mapEmployeeRow(row) {
  if (!row) return null
  const employee = { ...row }
  const nameParts = splitFullName(employee.name)
  employee.first_name = employee.first_name || nameParts.firstName || null
  employee.last_name = employee.last_name || nameParts.lastName || null
  employee.bank_details = safeJsonParse(employee.bank_details) || null
  employee.mobile_number = employee.mobile_number || employee.contact || null
  employee.contact = employee.contact || employee.mobile_number || null
  employee.contact_type = employee.contact_type || (employee.contact ? 'Mobile' : null)
  return employee
}

function mapPayrollProfileRow(row) {
  if (!row) return null
  return {
    ...row,
    employment_type: normalizeUpperText(row.employment_type),
    pay_basis: normalizeUpperText(row.pay_basis),
    payroll_frequency: normalizeEnumValue(row.payroll_frequency, PAYROLL_FREQUENCIES),
    payroll_method: normalizeEnumValue(row.payroll_method, PAYROLL_METHODS),
    status: String(row.status || '').trim().toLowerCase() || 'inactive',
    pay_rate: hasConfiguredValue(row.pay_rate) ? Number(row.pay_rate) : null,
    overtime_eligible: normalizeBooleanFlag(row.overtime_eligible),
    late_deduction_enabled: normalizeBooleanFlag(row.late_deduction_enabled),
    undertime_deduction_enabled: normalizeBooleanFlag(row.undertime_deduction_enabled),
    tax_enabled: normalizeBooleanFlag(row.tax_enabled),
    sss_enabled: normalizeBooleanFlag(row.sss_enabled),
    philhealth_enabled: normalizeBooleanFlag(row.philhealth_enabled),
    pagibig_enabled: normalizeBooleanFlag(row.pagibig_enabled)
  }
}

function composeUserDisplayName(userRow = {}, employee = null) {
  const composed = [userRow.first_name, userRow.last_name]
    .map((part) => normalizeText(part))
    .filter(Boolean)
    .join(' ')
  return composed || normalizeText(userRow.full_name) || normalizeText(employee?.name) || null
}

function buildPayrollOverview(employee = null, payrollProfileRow = null) {
  const payrollProfile = mapPayrollProfileRow(payrollProfileRow)
  const payrollEligible = payrollProfile ? payrollProfile.status === 'active' : Boolean(employee)
  const payBasis = payrollProfile?.pay_basis || normalizeUpperText(employee?.pay_basis)
  const payRate = hasConfiguredValue(payrollProfile?.pay_rate)
    ? Number(payrollProfile.pay_rate)
    : (hasConfiguredValue(employee?.pay_rate) ? Number(employee.pay_rate) : null)
  const payrollFrequency = payrollProfile?.payroll_frequency || null
  const employmentType = payrollProfile?.employment_type || normalizeUpperText(employee?.employment_type)
  const payrollMethod = payrollProfile?.payroll_method || normalizeEnumValue(employee?.payroll_method, PAYROLL_METHODS)

  const deductionFlags = {
    tax_enabled: payrollProfile ? payrollProfile.tax_enabled : null,
    sss_enabled: payrollProfile ? payrollProfile.sss_enabled : null,
    philhealth_enabled: payrollProfile ? payrollProfile.philhealth_enabled : null,
    pagibig_enabled: payrollProfile ? payrollProfile.pagibig_enabled : null
  }

  const governmentIdsComplete = Boolean(
    normalizeText(employee?.tin)
    && normalizeText(employee?.sss_number)
    && normalizeText(employee?.philhealth_pin)
    && normalizeText(employee?.pagibig_mid)
  )

  const missingFields = []
  if (payrollEligible) {
    if (!payBasis) missingFields.push('pay_basis')
    if (!hasPositiveRate(payRate)) missingFields.push('pay_rate')
    if (!payrollFrequency) missingFields.push('payroll_frequency')
    if (!payrollMethod) missingFields.push('payroll_method')
    for (const [key, value] of Object.entries(deductionFlags)) {
      if (value === null || value === undefined) missingFields.push(key)
    }
  }

  return {
    profile_id: payrollProfile?.id || null,
    payroll_eligible: Boolean(payrollEligible),
    pay_basis: payBasis || null,
    pay_rate: hasConfiguredValue(payRate) && Number.isFinite(Number(payRate)) ? Number(payRate) : null,
    payroll_frequency: payrollFrequency || null,
    employment_type: employmentType || null,
    payroll_method: payrollMethod || null,
    deduction_flags: deductionFlags,
    government_ids_status: governmentIdsComplete ? 'COMPLETE' : 'INCOMPLETE',
    payroll_profile_status: missingFields.length ? 'INCOMPLETE' : 'COMPLETE',
    payroll_profile_missing_fields: missingFields
  }
}

function serializeDocumentRow(row, userId) {
  const definition = EMPLOYEE_DOCUMENT_TYPE_MAP.get(row.document_type)
  const hasFile = Boolean(row.file_id)
  const status = normalizeDocumentStatus(row.status, hasFile) || (hasFile ? 'SUBMITTED' : 'NOT_SUBMITTED')

  return {
    id: row.id || null,
    document_type: row.document_type,
    label: definition?.label || row.document_type,
    required: Boolean(definition?.required),
    document_number: row.document_number || '',
    issuing_agency: row.issuing_agency || '',
    issue_date: normalizeDateValue(row.issue_date) || '',
    expiry_date: normalizeDateValue(row.expiry_date) || '',
    status,
    remarks: row.remarks || '',
    verified_by: row.verified_by || null,
    verified_at: row.verified_at || null,
    has_file: hasFile,
    original_name: row.original_name || null,
    type: row.file_type || null,
    size: row.file_size || null,
    uploaded_at: row.file_uploaded_at || null,
    download_url: hasFile ? `/users/${userId}/documents/${row.id}/download` : null
  }
}

function buildDefaultDocumentRows(existingRows = [], userId) {
  const existingMap = new Map(existingRows.map((row) => [row.document_type, row]))
  return EMPLOYEE_DOCUMENT_TYPES.map((definition) => {
    const existing = existingMap.get(definition.type)
    if (existing) return serializeDocumentRow(existing, userId)
    return {
      id: null,
      document_type: definition.type,
      label: definition.label,
      required: definition.required,
      document_number: '',
      issuing_agency: '',
      issue_date: '',
      expiry_date: '',
      status: 'NOT_SUBMITTED',
      remarks: '',
      verified_by: null,
      verified_at: null,
      has_file: false,
      original_name: null,
      type: null,
      size: null,
      uploaded_at: null,
      download_url: null
    }
  })
}

async function getEmployeeDocuments(conn, employeeId, userId) {
  if (!employeeId) return buildDefaultDocumentRows([], userId)
  const [rows] = await conn.query(
    `SELECT ed.*, f.original_name, f.type AS file_type, f.size AS file_size, f.uploaded_at AS file_uploaded_at
     FROM employee_documents ed
     LEFT JOIN files f ON f.id = ed.file_id
     WHERE ed.employee_id = ?
     ORDER BY ed.created_at ASC`,
    [employeeId]
  )
  return buildDefaultDocumentRows(rows, userId)
}

async function fetchUserRow(conn, id) {
  const includeDirectRole = await hasUsersRoleIdColumn(conn)
  const includeEmployeeLink = await hasUsersEmployeeIdColumn(conn)
  const columns = ['id', 'username', 'email', 'first_name', 'last_name', 'full_name', 'is_active', 'created_at', 'updated_at']
  if (includeDirectRole) columns.push('role_id')
  if (includeEmployeeLink) columns.push('employee_id')
  const [rows] = await conn.query(`SELECT ${columns.join(', ')} FROM users WHERE id = ? LIMIT 1`, [id])
  return rows[0] || null
}

async function buildUserResponse(conn, userRow, { includeDocuments = false } = {}) {
  const roles = await getUserRoles(conn, userRow.id, userRow.role_id)
  const employeeRow = await findEmployeeForUser(conn, userRow)
  const payrollProfileRow = await findPayrollProfileForUser(conn, userRow.id)
  const employee = mapEmployeeRow(employeeRow)
  const payrollProfile = buildPayrollOverview(employee, payrollProfileRow)
  const displayName = composeUserDisplayName(userRow, employee)
  const primaryRole = roles[0] || null
  const contactNumber = normalizeText(employee?.mobile_number) || normalizeText(employee?.contact) || null
  const employmentType = normalizeText(employee?.employment_type) || null
  const positionLabel = normalizeText(employee?.position_title) || normalizeText(employee?.role) || null

  if (employee && includeDocuments) {
    employee.documents = await getEmployeeDocuments(conn, employee.id, userRow.id)
  }

  return {
    ...userRow,
    display_name: displayName,
    primary_role: primaryRole,
    contact_number: contactNumber,
    employment_type: employmentType,
    position_label: positionLabel,
    roles,
    employee: employee || null,
    payroll_profile: payrollProfile,
    payroll_eligible: payrollProfile.payroll_eligible,
    government_ids_status: payrollProfile.government_ids_status,
    payroll_profile_status: payrollProfile.payroll_profile_status
  }
}

async function getUserAuditState(conn, userId) {
  const user = await fetchUserRow(conn, userId)
  if (!user) return null

  const roles = await getUserRoles(conn, userId, user.role_id)
  const employeeRow = await findEmployeeForUser(conn, user)
  const employee = mapEmployeeRow(employeeRow)

  return {
    id: user.id,
    username: user.username,
    email: user.email,
    first_name: user.first_name,
    last_name: user.last_name,
    full_name: user.full_name,
    is_active: Number(user.is_active) === 1,
    roles,
    employee: employee
      ? {
          id: employee.id,
          employment_status: employee.employment_status,
          employment_type: employee.employment_type,
          position_title: employee.position_title,
          department_name: employee.department_name
        }
      : null
  }
}

async function upsertEmployeeRecord(conn, userRow, nameParts, primaryRoleLabel, employeeInput, employeeKeys) {
  const existingEmployee = await findEmployeeForUser(conn, userRow)
  const includeEmployeesEmail = await hasEmployeesEmailColumn(conn)
  const includeEmployeesUserId = await hasEmployeesUserIdColumn(conn)
  const includeEmployeeLink = await hasUsersEmployeeIdColumn(conn)

  const fullName = nameParts?.fullName || userRow.full_name || userRow.username || userRow.email
  const baseValues = {
    name: fullName,
    first_name: nameParts?.firstName || userRow.first_name || splitFullName(fullName).firstName,
    last_name: nameParts?.lastName || userRow.last_name || splitFullName(fullName).lastName,
    role: primaryRoleLabel,
    contact_type: employeeInput.mobile_number ? 'Mobile' : employeeInput.contact_type,
    contact: employeeInput.mobile_number || employeeInput.contact,
    hire_date: employeeInput.hire_date,
    pay_rate: employeeInput.pay_rate,
    employment_status: employeeInput.employment_status || 'ACTIVE',
    bank_details: employeeInput.bank_details ? JSON.stringify(employeeInput.bank_details) : null,
    birth_date: employeeInput.birth_date,
    sex: employeeInput.sex,
    civil_status: employeeInput.civil_status,
    nationality: employeeInput.nationality,
    mobile_number: employeeInput.mobile_number,
    present_address: employeeInput.present_address,
    permanent_address: employeeInput.permanent_address,
    position_title: employeeInput.position_title,
    department_name: employeeInput.department_name,
    employment_type: employeeInput.employment_type,
    pay_basis: employeeInput.pay_basis,
    payroll_method: employeeInput.payroll_method,
    tin: employeeInput.tin,
    sss_number: employeeInput.sss_number,
    philhealth_pin: employeeInput.philhealth_pin,
    pagibig_mid: employeeInput.pagibig_mid,
    emergency_contact_name: employeeInput.emergency_contact_name,
    emergency_contact_relationship: employeeInput.emergency_contact_relationship,
    emergency_contact_number: employeeInput.emergency_contact_number,
    emergency_contact_address: employeeInput.emergency_contact_address
  }

  if (includeEmployeesEmail) baseValues.email = userRow.email
  if (includeEmployeesUserId) baseValues.user_id = userRow.id

  if (!existingEmployee) {
    const columns = Object.keys(baseValues)
    const placeholders = columns.map(() => '?').join(', ')
    const values = columns.map((column) => baseValues[column])
    const [insertResult] = await conn.query(
      `INSERT INTO employees (${columns.join(', ')}) VALUES (${placeholders})`,
      values
    )
    if (includeEmployeeLink) {
      await conn.query('UPDATE users SET employee_id = ? WHERE id = ?', [insertResult.insertId, userRow.id])
    }
    return insertResult.insertId
  }

  const updates = []
  const params = []

  if (fullName !== undefined) {
    updates.push('name = ?')
    params.push(baseValues.name)
    updates.push('first_name = ?')
    params.push(baseValues.first_name)
    updates.push('last_name = ?')
    params.push(baseValues.last_name)
  }

  if (primaryRoleLabel !== undefined) {
    updates.push('role = ?')
    params.push(baseValues.role)
  }

  if (includeEmployeesEmail) {
    updates.push('email = ?')
    params.push(baseValues.email)
  }

  if (includeEmployeesUserId) {
    updates.push('user_id = ?')
    params.push(baseValues.user_id)
  }

  for (const key of employeeKeys) {
    if (key === 'bank_details') {
      updates.push('bank_details = ?')
      params.push(baseValues.bank_details)
      continue
    }

    if (key === 'mobile_number' || key === 'contact' || key === 'contact_type') {
      if (!updates.includes('mobile_number = ?')) {
        updates.push('mobile_number = ?')
        params.push(baseValues.mobile_number)
      }
      if (!updates.includes('contact = ?')) {
        updates.push('contact = ?')
        params.push(baseValues.contact)
      }
      if (!updates.includes('contact_type = ?')) {
        updates.push('contact_type = ?')
        params.push(baseValues.contact_type)
      }
      continue
    }

    if (Object.prototype.hasOwnProperty.call(baseValues, key)) {
      updates.push(`${key} = ?`)
      params.push(baseValues[key])
    }
  }

  if (updates.length) {
    params.push(existingEmployee.id)
    await conn.query(`UPDATE employees SET ${updates.join(', ')} WHERE id = ?`, params)
  }

  return existingEmployee.id
}

async function getDocumentRow(conn, employeeId, documentId) {
  const [rows] = await conn.query(
    `SELECT ed.*, f.path AS file_path, f.original_name, f.type AS file_type, f.size AS file_size
     FROM employee_documents ed
     LEFT JOIN files f ON f.id = ed.file_id
     WHERE ed.id = ? AND ed.employee_id = ?
     LIMIT 1`,
    [documentId, employeeId]
  )
  return rows[0] || null
}

async function deletePhysicalFile(filePath) {
  if (!filePath) return
  const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(PRIVATE_UPLOAD_ROOT, filePath)
  try {
    await fs.unlink(absolutePath)
  } catch (err) {
    if (err?.code !== 'ENOENT') throw err
  }
}

async function deleteEmployeeDocumentsForEmployee(conn, employeeId) {
  const [rows] = await conn.query(
    `SELECT ed.id, ed.file_id, f.path AS file_path
     FROM employee_documents ed
     LEFT JOIN files f ON f.id = ed.file_id
     WHERE ed.employee_id = ?`,
    [employeeId]
  )

  if (!rows.length) return

  const fileIds = rows.map((row) => row.file_id).filter(Boolean)
  await conn.query('DELETE FROM employee_documents WHERE employee_id = ?', [employeeId])
  if (fileIds.length) {
    await conn.query(`DELETE FROM files WHERE id IN (${fileIds.map(() => '?').join(', ')})`, fileIds)
  }

  for (const row of rows) {
    await deletePhysicalFile(row.file_path)
  }
}

function parseDocumentMetadata(body = {}, hasFile = false) {
  const documentType = normalizeDocumentType(body.document_type)
  if (!documentType) return { error: 'A valid document type is required' }

  const status = normalizeDocumentStatus(body.status, hasFile)
  if (body.status && !status) {
    return { error: 'Verified status requires an uploaded file' }
  }

  return {
    value: {
      document_type: documentType,
      document_number: normalizeText(body.document_number),
      issuing_agency: normalizeText(body.issuing_agency),
      issue_date: normalizeDateValue(body.issue_date),
      expiry_date: normalizeDateValue(body.expiry_date),
      status,
      remarks: normalizeText(body.remarks)
    }
  }
}

router.get('/', verifyToken, authorize('users.view'), async (req, res) => {
  try {
    await ensureEmployeeSchema()
    const includeDirectRole = await hasUsersRoleIdColumn()
    const includeEmployeeLink = await hasUsersEmployeeIdColumn()
    const columns = ['id', 'username', 'email', 'first_name', 'last_name', 'full_name', 'is_active', 'created_at', 'updated_at']
    if (includeDirectRole) columns.push('role_id')
    if (includeEmployeeLink) columns.push('employee_id')

    const [rows] = await db.pool.query(`SELECT ${columns.join(', ')} FROM users ORDER BY id DESC`)
    const result = []
    for (const userRow of rows) {
      result.push(await buildUserResponse(db.pool, userRow))
    }
    res.json(result)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'failed to fetch users' })
  }
})

router.get('/:id/documents', verifyToken, authorize('users.view'), async (req, res) => {
  try {
    await ensureEmployeeSchema()
    const user = await fetchUserRow(db.pool, Number(req.params.id))
    if (!user) return res.status(404).json({ error: 'user not found' })

    const employee = await findEmployeeForUser(db.pool, user)
    if (!employee) {
      res.json(buildDefaultDocumentRows([], user.id))
      return
    }

    res.json(await getEmployeeDocuments(db.pool, employee.id, user.id))
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'failed to fetch employee documents' })
  }
})

router.get('/:id/documents/:documentId/download', verifyToken, authorize('users.view'), async (req, res) => {
  try {
    await ensureEmployeeSchema()
    const user = await fetchUserRow(db.pool, Number(req.params.id))
    if (!user) return res.status(404).json({ error: 'user not found' })

    const employee = await findEmployeeForUser(db.pool, user)
    if (!employee) return res.status(404).json({ error: 'employee record not found' })

    const documentRow = await getDocumentRow(db.pool, employee.id, Number(req.params.documentId))
    if (!documentRow || !documentRow.file_path) return res.status(404).json({ error: 'document file not found' })

    const absolutePath = path.isAbsolute(documentRow.file_path)
      ? documentRow.file_path
      : path.join(PRIVATE_UPLOAD_ROOT, documentRow.file_path)

    res.download(absolutePath, documentRow.original_name || `${documentRow.document_type}.pdf`)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'failed to download document' })
  }
})

router.get('/:id', verifyToken, authorize('users.view'), async (req, res) => {
  try {
    await ensureEmployeeSchema()
    const user = await fetchUserRow(db.pool, Number(req.params.id))
    if (!user) return res.status(404).json({ error: 'user not found' })
    res.json(await buildUserResponse(db.pool, user, { includeDocuments: true }))
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'failed to fetch user' })
  }
})

router.post('/', express.json(), verifyToken, authorize('users.create'), async (req, res) => {
  let conn
  try {
    await ensureEmployeeSchema()
    const payload = req.body || {}
    const normalizedEmail = String(payload.email || '').trim().toLowerCase()
    const normalizedUsername = String(payload.username || normalizedEmail).trim().toLowerCase()
    const normalizedName = normalizePersonNamePayload(payload)
    const wantsEmployeeProfile = hasEmployeePayload(payload)
    const employeeKeys = getProvidedEmployeeKeys(payload)
    const employeeInput = normalizeEmployeePayload(payload)
    const employeeValidationError = validateEmployeePayload(employeeInput, { requireStarterProfile: wantsEmployeeProfile })
    if (!normalizedEmail) return res.status(400).json({ error: 'email required' })
    if (!normalizedUsername) return res.status(400).json({ error: 'unable to derive username from email' })
    if (wantsEmployeeProfile && !normalizedName.firstName) return res.status(400).json({ error: 'First name is required' })
    if (wantsEmployeeProfile && !normalizedName.lastName) return res.status(400).json({ error: 'Last name is required' })
    if (employeeValidationError) return res.status(400).json({ error: employeeValidationError })

    const defaultPassword = getDefaultNewUserPassword()
    const passwordHash = await bcrypt.hash(defaultPassword, 10)
    const isActive = payload.is_active !== undefined
      ? ((String(payload.is_active) === '1' || payload.is_active === 1 || payload.is_active === true) ? 1 : 0)
      : 1

    conn = await db.pool.getConnection()
    await conn.beginTransaction()

    const [result] = await conn.query(
      'INSERT INTO users (username, email, password_hash, first_name, last_name, full_name, is_active) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [normalizedUsername, normalizedEmail, passwordHash, normalizedName.firstName, normalizedName.lastName, normalizedName.fullName, isActive]
    )
    const userId = result.insertId

    const roles = Array.isArray(payload.roles) ? payload.roles : []
    if (roles.length) {
      for (const roleId of roles) {
        if (Number(roleId)) {
          await conn.query('INSERT IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)', [userId, Number(roleId)])
        } else {
          const [roleRows] = await conn.query('SELECT id FROM roles WHERE name = ? LIMIT 1', [roleId])
          if (roleRows.length) {
            await conn.query('INSERT IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)', [userId, roleRows[0].id])
          }
        }
      }
    }

    const userRow = await fetchUserRow(conn, userId)
    const primaryRoleLabel = await resolvePrimaryRoleLabel(roles, conn)
    let employeeId = null
    if (wantsEmployeeProfile) {
      employeeId = await upsertEmployeeRecord(conn, userRow, normalizedName, primaryRoleLabel, employeeInput, employeeKeys)
    }

    await conn.commit()

    const createdState = await getUserAuditState(db.pool, userId)
    await logAuditEventSafe(db.pool, {
      userId: req.auth.id,
      action: 'USER_CREATED',
      resourceType: 'User',
      resourceId: userId,
      details: {
        module: 'access',
        severity: 'high',
        target_label: createdState?.username || normalizedUsername,
        summary: `Created user "${createdState?.username || normalizedUsername}"`,
        after: createdState,
        metrics: {
          role_count: createdState?.roles?.length || 0,
          is_active: createdState?.is_active ? 1 : 0,
          employee_profile_created: employeeId ? 1 : 0
        }
      }
    })

    res.json({ id: userId })
  } catch (err) {
    if (conn) await conn.rollback()
    console.error('users POST error', err)
    if (err?.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: 'username or email already exists' })
    }
    res.status(500).json({ error: err.message || 'failed to create user' })
  } finally {
    if (conn) conn.release()
  }
})

router.post('/:id/documents', verifyToken, authorize('users.update'), handleDocumentUpload, async (req, res) => {
  let conn
  let oldFilePath = null
  try {
    await ensureEmployeeSchema()
    const userId = Number(req.params.id)
    const parsed = parseDocumentMetadata(req.body, Boolean(req.file))
    if (parsed.error) {
      if (req.file?.path) await deletePhysicalFile(req.file.path)
      return res.status(400).json({ error: parsed.error })
    }

    const userRow = await fetchUserRow(db.pool, userId)
    if (!userRow) {
      if (req.file?.path) await deletePhysicalFile(req.file.path)
      return res.status(404).json({ error: 'user not found' })
    }

    const employee = await findEmployeeForUser(db.pool, userRow)
    if (!employee) {
      if (req.file?.path) await deletePhysicalFile(req.file.path)
      return res.status(400).json({ error: 'employee record not found' })
    }

    conn = await db.pool.getConnection()
    await conn.beginTransaction()

    const [existingRows] = await conn.query(
      `SELECT ed.*, f.path AS file_path
       FROM employee_documents ed
       LEFT JOIN files f ON f.id = ed.file_id
       WHERE ed.employee_id = ? AND ed.document_type = ?
       LIMIT 1`,
      [employee.id, parsed.value.document_type]
    )
    const existing = existingRows[0] || null
    let fileId = existing?.file_id || null

    if (req.file) {
      const storedPath = path.join('employee-docs', path.basename(req.file.path))
      if (fileId) {
        await conn.query(
          `UPDATE files
           SET path = ?, original_name = ?, type = ?, size = ?, uploaded_by = ?, uploaded_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [storedPath, req.file.originalname || null, req.file.mimetype || null, req.file.size || null, req.auth.id, fileId]
        )
        oldFilePath = existing?.file_path || null
      } else {
        const [fileResult] = await conn.query(
          `INSERT INTO files (path, original_name, type, size, uploaded_by)
           VALUES (?, ?, ?, ?, ?)`,
          [storedPath, req.file.originalname || null, req.file.mimetype || null, req.file.size || null, req.auth.id]
        )
        fileId = fileResult.insertId
      }
    }

    const status = normalizeDocumentStatus(parsed.value.status, Boolean(fileId))
    if (!status) {
      if (req.file?.path) await deletePhysicalFile(req.file.path)
      await conn.rollback()
      return res.status(400).json({ error: 'Verified status requires an uploaded file' })
    }

    if (existing) {
      await conn.query(
        `UPDATE employee_documents
         SET file_id = ?, document_number = ?, issuing_agency = ?, issue_date = ?, expiry_date = ?, status = ?, remarks = ?,
             verified_by = ?, verified_at = ?
         WHERE id = ?`,
        [
          fileId,
          parsed.value.document_number,
          parsed.value.issuing_agency,
          parsed.value.issue_date,
          parsed.value.expiry_date,
          status,
          parsed.value.remarks,
          status === 'VERIFIED' ? req.auth.id : null,
          status === 'VERIFIED' ? new Date() : null,
          existing.id
        ]
      )
    } else {
      await conn.query(
        `INSERT INTO employee_documents
         (employee_id, file_id, document_type, document_number, issuing_agency, issue_date, expiry_date, status, remarks, verified_by, verified_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          employee.id,
          fileId,
          parsed.value.document_type,
          parsed.value.document_number,
          parsed.value.issuing_agency,
          parsed.value.issue_date,
          parsed.value.expiry_date,
          status,
          parsed.value.remarks,
          status === 'VERIFIED' ? req.auth.id : null,
          status === 'VERIFIED' ? new Date() : null
        ]
      )
    }

    await conn.commit()
    if (oldFilePath) await deletePhysicalFile(oldFilePath)

    await logAuditEventSafe(db.pool, {
      userId: req.auth.id,
      action: req.file ? 'EMPLOYEE_DOCUMENT_UPLOADED' : 'EMPLOYEE_DOCUMENT_UPDATED',
      resourceType: 'EmployeeDocument',
      resourceId: `${employee.id}:${parsed.value.document_type}`,
      details: {
        module: 'hr',
        severity: 'high',
        target_label: `${employee.name || userRow.full_name || userRow.username} - ${getDocumentLabel(parsed.value.document_type)}`,
        summary: req.file
          ? `Uploaded ${getDocumentLabel(parsed.value.document_type)} for ${employee.name || userRow.full_name || userRow.username}`
          : `Updated ${getDocumentLabel(parsed.value.document_type)} for ${employee.name || userRow.full_name || userRow.username}`,
        metadata: {
          document_type: parsed.value.document_type,
          status
        }
      }
    })

    res.json(await getEmployeeDocuments(db.pool, employee.id, userId))
  } catch (err) {
    if (conn) await conn.rollback()
    if (req.file?.path) await deletePhysicalFile(req.file.path)
    console.error(err)
    res.status(500).json({ error: 'failed to save employee document' })
  } finally {
    if (conn) conn.release()
  }
})

router.put('/:id/documents/:documentId', express.json(), verifyToken, authorize('users.update'), async (req, res) => {
  let conn
  try {
    await ensureEmployeeSchema()
    const user = await fetchUserRow(db.pool, Number(req.params.id))
    if (!user) return res.status(404).json({ error: 'user not found' })

    const employee = await findEmployeeForUser(db.pool, user)
    if (!employee) return res.status(400).json({ error: 'employee record not found' })

    const documentRow = await getDocumentRow(db.pool, employee.id, Number(req.params.documentId))
    if (!documentRow) return res.status(404).json({ error: 'document not found' })

    const nextStatus = normalizeDocumentStatus(req.body.status ?? documentRow.status, Boolean(documentRow.file_id))
    if (!nextStatus) return res.status(400).json({ error: 'Verified status requires an uploaded file' })

    conn = await db.pool.getConnection()
    await conn.beginTransaction()
    await conn.query(
      `UPDATE employee_documents
       SET document_number = ?, issuing_agency = ?, issue_date = ?, expiry_date = ?, status = ?, remarks = ?,
           verified_by = ?, verified_at = ?
       WHERE id = ?`,
      [
        normalizeText(req.body.document_number) ?? documentRow.document_number ?? null,
        normalizeText(req.body.issuing_agency) ?? documentRow.issuing_agency ?? null,
        normalizeDateValue(req.body.issue_date) ?? normalizeDateValue(documentRow.issue_date),
        normalizeDateValue(req.body.expiry_date) ?? normalizeDateValue(documentRow.expiry_date),
        nextStatus,
        normalizeText(req.body.remarks) ?? documentRow.remarks ?? null,
        nextStatus === 'VERIFIED' ? req.auth.id : null,
        nextStatus === 'VERIFIED' ? new Date() : null,
        documentRow.id
      ]
    )
    await conn.commit()

    await logAuditEventSafe(db.pool, {
      userId: req.auth.id,
      action: nextStatus === 'VERIFIED' ? 'EMPLOYEE_DOCUMENT_VERIFIED' : 'EMPLOYEE_DOCUMENT_UPDATED',
      resourceType: 'EmployeeDocument',
      resourceId: documentRow.id,
      details: {
        module: 'hr',
        severity: 'high',
        target_label: `${employee.name || user.full_name || user.username} - ${getDocumentLabel(documentRow.document_type)}`,
        summary: nextStatus === 'VERIFIED'
          ? `Verified ${getDocumentLabel(documentRow.document_type)} for ${employee.name || user.full_name || user.username}`
          : `Updated ${getDocumentLabel(documentRow.document_type)} for ${employee.name || user.full_name || user.username}`,
        metadata: {
          document_type: documentRow.document_type,
          status: nextStatus
        }
      }
    })

    res.json(await getEmployeeDocuments(db.pool, employee.id, user.id))
  } catch (err) {
    if (conn) await conn.rollback()
    console.error(err)
    res.status(500).json({ error: 'failed to update employee document' })
  } finally {
    if (conn) conn.release()
  }
})

router.delete('/:id/documents/:documentId', verifyToken, authorize('users.update'), async (req, res) => {
  let conn
  try {
    await ensureEmployeeSchema()
    const user = await fetchUserRow(db.pool, Number(req.params.id))
    if (!user) return res.status(404).json({ error: 'user not found' })

    const employee = await findEmployeeForUser(db.pool, user)
    if (!employee) return res.status(400).json({ error: 'employee record not found' })

    const documentRow = await getDocumentRow(db.pool, employee.id, Number(req.params.documentId))
    if (!documentRow) return res.status(404).json({ error: 'document not found' })

    conn = await db.pool.getConnection()
    await conn.beginTransaction()
    await conn.query('DELETE FROM employee_documents WHERE id = ?', [documentRow.id])
    if (documentRow.file_id) {
      await conn.query('DELETE FROM files WHERE id = ?', [documentRow.file_id])
    }
    await conn.commit()

    await deletePhysicalFile(documentRow.file_path)

    await logAuditEventSafe(db.pool, {
      userId: req.auth.id,
      action: 'EMPLOYEE_DOCUMENT_DELETED',
      resourceType: 'EmployeeDocument',
      resourceId: documentRow.id,
      details: {
        module: 'hr',
        severity: 'high',
        target_label: `${employee.name || user.full_name || user.username} - ${getDocumentLabel(documentRow.document_type)}`,
        summary: `Deleted ${getDocumentLabel(documentRow.document_type)} for ${employee.name || user.full_name || user.username}`,
        metadata: {
          document_type: documentRow.document_type
        }
      }
    })

    res.json(await getEmployeeDocuments(db.pool, employee.id, user.id))
  } catch (err) {
    if (conn) await conn.rollback()
    console.error(err)
    res.status(500).json({ error: 'failed to delete employee document' })
  } finally {
    if (conn) conn.release()
  }
})

router.put('/:id', express.json(), verifyToken, authorize('users.update'), async (req, res) => {
  let conn
  try {
    await ensureEmployeeSchema()
    const id = Number(req.params.id)
    const payload = req.body || {}
    const wantsEmployeeProfile = hasEmployeePayload(payload)
    const employeeKeys = getProvidedEmployeeKeys(payload)
    const employeeInput = normalizeEmployeePayload(payload)
    const employeeValidationError = validateEmployeePayload(employeeInput, { requireStarterProfile: wantsEmployeeProfile })
    if (employeeValidationError) return res.status(400).json({ error: employeeValidationError })

    conn = await db.pool.getConnection()
    await conn.beginTransaction()

    const beforeState = await getUserAuditState(conn, id)
    if (!beforeState) {
      await conn.rollback()
      return res.status(404).json({ error: 'user not found' })
    }

    const updates = []
    const params = []
    if (payload.username) {
      updates.push('username = ?')
      params.push(String(payload.username).trim().toLowerCase())
    }
    if (payload.email) {
      updates.push('email = ?')
      params.push(String(payload.email).trim().toLowerCase())
    }
    const currentUserRow = await fetchUserRow(conn, id)
    const normalizedName = hasNamePayload(payload)
      ? normalizePersonNamePayload(payload, currentUserRow || {})
      : null
    if (normalizedName) {
      if (!normalizedName.firstName) {
        await conn.rollback()
        return res.status(400).json({ error: 'First name is required' })
      }
      if (!normalizedName.lastName) {
        await conn.rollback()
        return res.status(400).json({ error: 'Last name is required' })
      }
      updates.push('first_name = ?')
      params.push(normalizedName.firstName)
      updates.push('last_name = ?')
      params.push(normalizedName.lastName)
      updates.push('full_name = ?')
      params.push(normalizedName.fullName)
    }
    if (payload.is_active !== undefined) {
      const activeVal = (String(payload.is_active) === '1' || payload.is_active === 1 || payload.is_active === true) ? 1 : 0
      updates.push('is_active = ?')
      params.push(activeVal)
    }
    if (payload.password) {
      updates.push('password_hash = ?')
      params.push(await bcrypt.hash(payload.password, 10))
    }

    if (updates.length) {
      params.push(id)
      await conn.query(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params)
    }

    if (Array.isArray(payload.roles)) {
      await conn.query('DELETE FROM user_roles WHERE user_id = ?', [id])
      for (const roleId of payload.roles) {
        if (Number(roleId)) {
          await conn.query('INSERT IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)', [id, Number(roleId)])
        } else {
          const [roleRows] = await conn.query('SELECT id FROM roles WHERE name = ? LIMIT 1', [roleId])
          if (roleRows.length) {
            await conn.query('INSERT IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)', [id, roleRows[0].id])
          }
        }
      }
    }

    const userRow = await fetchUserRow(conn, id)
    const primaryRoleLabel = Array.isArray(payload.roles) ? await resolvePrimaryRoleLabel(payload.roles, conn) : undefined
    const shouldMaintainEmployee = wantsEmployeeProfile || Boolean(normalizedName) || payload.email !== undefined || Array.isArray(payload.roles)
    if (shouldMaintainEmployee) {
      await upsertEmployeeRecord(conn, userRow, normalizedName || normalizePersonNamePayload({}, userRow), primaryRoleLabel, employeeInput, employeeKeys)
    }

    await conn.commit()

    const afterState = await getUserAuditState(db.pool, id)
    await logAuditEventSafe(db.pool, {
      userId: req.auth.id,
      action: 'USER_UPDATED',
      resourceType: 'User',
      resourceId: id,
      details: {
        module: 'access',
        severity: 'high',
        target_label: afterState?.username || beforeState.username,
        summary: `Updated user "${afterState?.username || beforeState.username}"`,
        before: beforeState,
        after: afterState,
        metrics: { role_count: afterState?.roles?.length || 0, is_active: afterState?.is_active ? 1 : 0 }
      }
    })

    res.json({ ok: true })
  } catch (err) {
    if (conn) await conn.rollback()
    console.error(err)
    res.status(500).json({ error: 'failed to update user' })
  } finally {
    if (conn) conn.release()
  }
})

router.delete('/:id', verifyToken, authorize('users.delete'), async (req, res) => {
  let conn
  try {
    await ensureEmployeeSchema()
    const id = Number(req.params.id)
    conn = await db.pool.getConnection()
    await conn.beginTransaction()

    const beforeState = await getUserAuditState(conn, id)
    if (!beforeState) {
      await conn.rollback()
      return res.status(404).json({ error: 'user not found' })
    }

    const userRow = await fetchUserRow(conn, id)
    const employee = await findEmployeeForUser(conn, userRow)
    if (employee) {
      await deleteEmployeeDocumentsForEmployee(conn, employee.id)
      await conn.query('DELETE FROM attendance WHERE employee_id = ?', [employee.id])
      await conn.query('DELETE FROM payrolls WHERE employee_id = ?', [employee.id])
      await conn.query('DELETE FROM employees WHERE id = ?', [employee.id])
    }

    await conn.query('DELETE FROM users WHERE id = ?', [id])
    await conn.commit()

    await logAuditEventSafe(db.pool, {
      userId: req.auth.id,
      action: 'USER_DELETED',
      resourceType: 'User',
      resourceId: id,
      details: {
        module: 'access',
        severity: 'high',
        target_label: beforeState.username,
        summary: `Deleted user "${beforeState.username}"`,
        before: beforeState,
        metrics: { role_count: beforeState.roles?.length || 0 }
      }
    })

    res.json({ ok: true })
  } catch (err) {
    if (conn) await conn.rollback()
    console.error(err)
    res.status(500).json({ error: 'failed to delete user' })
  } finally {
    if (conn) conn.release()
  }
})

module.exports = router
