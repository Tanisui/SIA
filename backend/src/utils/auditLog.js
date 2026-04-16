const db = require('../database')

const MODULE_LABELS = {
  inventory: 'Inventory',
  sales: 'Sales',
  access: 'Access',
  purchasing: 'Purchasing',
  system: 'System',
  catalog: 'Catalog',
  customers: 'Customers',
  hr: 'HR',
  finance: 'Finance',
  other: 'Other'
}

const ACTION_LABELS = {
  AUTH_LOGIN: 'Successful login',
  AUTH_LOGOUT: 'User logged out',
  AUTH_LOGIN_FAILED: 'Failed login',
  AUTH_LOGIN_BLOCKED: 'Blocked login',
  AUTH_PASSWORD_CHANGED: 'Password changed',
  AUTH_PASSWORD_RESET: 'Password reset',
  USER_CREATED: 'User created',
  USER_UPDATED: 'User updated',
  USER_DELETED: 'User deleted',
  ROLE_CREATED: 'Role created',
  ROLE_UPDATED: 'Role updated',
  ROLE_DELETED: 'Role deleted',
  ROLE_CHANGED: 'Role changed',
  PRODUCT_CREATED: 'Product added',
  PRODUCT_UPDATED: 'Product updated',
  PRODUCT_DELETED: 'Product deleted',
  SUPPLIER_CREATED: 'Supplier created',
  SUPPLIER_UPDATED: 'Supplier updated',
  SUPPLIER_DELETED: 'Supplier deleted',
  BALE_PURCHASE_CREATED: 'Purchase order created',
  BALE_PURCHASE_UPDATED: 'Purchase order updated',
  BALE_PURCHASE_DELETED: 'Purchase order deleted',
  BALE_BREAKDOWN_SAVED: 'Bale breakdown saved',
  PURCHASE_ORDER_RECEIVED: 'Purchase order received',
  PURCHASE_RECORDED: 'Purchase recorded',
  INVENTORY_ADJUSTED: 'Inventory adjusted',
  INVENTORY_STOCK_IN: 'Inventory stock in',
  INVENTORY_SHRINKAGE_OUT: 'Inventory shrinkage out',
  INVENTORY_DAMAGE_OUT: 'Inventory damage out',
  SALE_CREATED: 'Sale created',
  SALE_COMPLETED: 'Sale completed',
  SALE_VOIDED: 'Sale voided',
  SALE_RETURN: 'Sale return processed',
  SALE_REFUND: 'Sale refunded',
  DISCOUNT_APPLIED: 'Discount applied',
  EMPLOYEE_DOCUMENT_UPLOADED: 'Employee document uploaded',
  EMPLOYEE_DOCUMENT_UPDATED: 'Employee document updated',
  EMPLOYEE_DOCUMENT_DELETED: 'Employee document deleted',
  EMPLOYEE_DOCUMENT_VERIFIED: 'Employee document verified',
  CONFIG_CREATED: 'Setting created',
  CONFIG_UPDATED: 'Setting updated',
  CONFIG_DELETED: 'Setting deleted',
  CONFIG_BULK_UPDATED: 'Bulk settings updated'
}

let ensureAuditSchemaPromise = null

function humanizeCode(value) {
  return String(value || '')
    .trim()
    .replace(/[_-]+/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (ch) => ch.toUpperCase())
}

function safeJsonParse(value) {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'object' && !Array.isArray(value)) return value
  try {
    const parsed = JSON.parse(String(value))
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null
  } catch (err) {
    return null
  }
}

function cleanObject(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => cleanObject(item))
      .filter((item) => item !== undefined)
  }

  if (value && typeof value === 'object') {
    const next = {}
    for (const [key, item] of Object.entries(value)) {
      const cleaned = cleanObject(item)
      if (cleaned !== undefined) next[key] = cleaned
    }
    return Object.keys(next).length ? next : undefined
  }

  if (value === undefined) return undefined
  return value
}

function normalizeModule(moduleName) {
  const normalized = String(moduleName || '').trim().toLowerCase()
  if (!normalized) return undefined
  if (normalized === 'auth' || normalized === 'users' || normalized === 'roles') return 'access'
  if (normalized === 'supplier' || normalized === 'suppliers' || normalized === 'purchase_order' || normalized === 'purchase_orders' || normalized === 'bale_purchase') {
    return 'purchasing'
  }
  return normalized
}

function deriveModule({ action, resourceType, details }) {
  const explicitModule = normalizeModule(details?.module)
  if (explicitModule) return explicitModule

  const normalizedAction = String(action || '').trim().toUpperCase()
  const normalizedResource = String(resourceType || '').trim().toLowerCase()

  if (normalizedAction.startsWith('INVENTORY_')) return 'inventory'
  if (normalizedAction.startsWith('SALE_')) return 'sales'
  if (normalizedAction.startsWith('AUTH_') || normalizedAction.startsWith('USER_') || normalizedAction.startsWith('ROLE_')) return 'access'
  if (normalizedAction.startsWith('SUPPLIER_') || normalizedAction.startsWith('PURCHASE_ORDER_') || normalizedAction.startsWith('BALE_')) return 'purchasing'
  if (normalizedAction.startsWith('CONFIG_') || normalizedAction.startsWith('SYSTEM_')) return 'system'
  if (normalizedAction.startsWith('EMPLOYEE_')) return 'hr'
  if (normalizedAction.startsWith('PRODUCT_')) return 'catalog'
  if (normalizedAction.startsWith('CUSTOMER_')) return 'customers'
  if (normalizedAction.startsWith('PAYROLL_') || normalizedAction.startsWith('FINANCE_')) return 'finance'

  if (normalizedResource.includes('product') || normalizedResource.includes('inventory')) return 'inventory'
  if (normalizedResource.includes('sale')) return 'sales'
  if (normalizedResource.includes('supplier') || normalizedResource.includes('purchase')) return 'purchasing'
  if (normalizedResource.includes('config') || normalizedResource.includes('system')) return 'system'
  if (normalizedResource.includes('role') || normalizedResource.includes('user') || normalizedResource.includes('auth')) return 'access'
  if (normalizedResource.includes('employee')) return 'hr'
  if (normalizedResource.includes('customer')) return 'customers'

  return 'other'
}

function deriveSeverity({ action, details }) {
  const explicitSeverity = String(details?.severity || '').trim().toLowerCase()
  if (explicitSeverity) return explicitSeverity

  const normalizedAction = String(action || '').trim().toUpperCase()
  if (/(FAILED|BLOCKED|DELETE|PASSWORD|REFUND|PRICE_OVERRIDE|CONFIG|ROLE_|USER_DELETED|REVERS)/.test(normalizedAction)) return 'high'
  if (/(DISCOUNT|CREATE|UPDATE|RECEIVE|DAMAGE|SHRINKAGE|RETURN)/.test(normalizedAction)) return 'medium'
  return 'low'
}

function isSensitiveAuditEvent({ action, details, severity }) {
  if (details?.metadata?.sensitive === true) return true
  if (severity === 'critical' || severity === 'high') return true
  return /(FAILED|BLOCKED|DELETE|PASSWORD|REFUND|PRICE_OVERRIDE|CONFIG|ROLE_|PERMISSION)/.test(String(action || '').toUpperCase())
}

function summarizeLegacyDetails(details) {
  if (!details || typeof details !== 'object') return ''

  const parts = []
  const movementType = details.movement_type ? humanizeCode(details.movement_type) : ''
  const reason = details.reason ? String(details.reason).trim() : ''
  if (details.summary) return String(details.summary)
  if (movementType) parts.push(`Type: ${movementType}`)
  if (details.quantity_removed !== undefined && details.quantity_removed !== null) parts.push(`Qty removed: ${details.quantity_removed}`)
  if (details.quantity_restored !== undefined && details.quantity_restored !== null) parts.push(`Qty restored: ${details.quantity_restored}`)
  if (details.quantity_received !== undefined && details.quantity_received !== null) parts.push(`Qty received: ${details.quantity_received}`)
  if (details.new_quantity !== undefined && details.new_quantity !== null) parts.push(`New qty: ${details.new_quantity}`)
  if (reason) parts.push(`Reason: ${reason}`)
  if (details.record_type) parts.push(`Record: ${humanizeCode(details.record_type)}`)
  if (details.product_id !== undefined && details.product_id !== null) parts.push(`Product ID: ${details.product_id}`)
  if (details.record_id !== undefined && details.record_id !== null) parts.push(`Record ID: ${details.record_id}`)
  if (details.sale_number) parts.push(`Sale: ${details.sale_number}`)
  if (details.receipt_no) parts.push(`Receipt: ${details.receipt_no}`)

  if (parts.length) return parts.join(' • ')

  return Object.entries(details)
    .map(([key, val]) => `${humanizeCode(key)}: ${val === null || val === undefined ? '—' : String(val)}`)
    .join(' • ')
}

function getActionLabel(action, details) {
  return details?.summary || ACTION_LABELS[String(action || '').toUpperCase()] || humanizeCode(action) || 'Unknown event'
}

function getTargetLabel(row, details) {
  if (details?.target_label) return String(details.target_label)
  if (details?.metadata?.username) return String(details.metadata.username)
  if (row.resource_type && row.resource_id) return `${humanizeCode(row.resource_type)} #${row.resource_id}`
  if (row.resource_type) return humanizeCode(row.resource_type)
  if (row.resource_id) return `Record #${row.resource_id}`
  return 'General event'
}

function getSummary(row, details) {
  if (details?.summary) return String(details.summary)
  const legacySummary = summarizeLegacyDetails(details)
  if (legacySummary) return legacySummary
  return humanizeCode(row.action) || 'No summary'
}

function normalizeResultStatus(value) {
  const normalized = String(value || '').trim().toLowerCase()
  if (!normalized) return null
  if (['success', 'failed', 'warning', 'critical', 'reversed', 'adjusted'].includes(normalized)) {
    if (normalized === 'warning') return 'adjusted'
    if (normalized === 'critical') return 'failed'
    return normalized
  }
  return null
}

function deriveResultStatus({ action, details }) {
  const explicit = normalizeResultStatus(details?.result || details?.status)
  if (explicit) return explicit

  const normalizedAction = String(action || '').trim().toUpperCase()
  if (/FAILED|BLOCKED|DENIED/.test(normalizedAction)) return 'failed'
  if (/REFUND|RETURN|VOID|DELETE/.test(normalizedAction)) return 'reversed'
  if (/ADJUST|DAMAGE|SHRINKAGE|UPDATE|CHANGE/.test(normalizedAction)) return 'adjusted'
  return 'success'
}

function buildAuditDetails(payload = {}) {
  const normalized = cleanObject({
    module: normalizeModule(payload.module),
    summary: payload.summary ? String(payload.summary).trim() : undefined,
    severity: payload.severity ? String(payload.severity).trim().toLowerCase() : undefined,
    result: normalizeResultStatus(payload.result),
    target_label: payload.target_label ? String(payload.target_label).trim() : undefined,
    reason: payload.reason ? String(payload.reason).trim() : undefined,
    remarks: payload.remarks ? String(payload.remarks).trim() : undefined,
    before: payload.before,
    after: payload.after,
    metrics: payload.metrics,
    references: payload.references,
    metadata: payload.metadata
  })

  return normalized || {}
}

async function ensureAuditSchema() {
  if (ensureAuditSchemaPromise) return ensureAuditSchemaPromise

  ensureAuditSchemaPromise = (async () => {
    await db.pool.query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        user_id BIGINT UNSIGNED NULL,
        action VARCHAR(255) NOT NULL,
        resource_type VARCHAR(100) NULL,
        resource_id VARCHAR(255) NULL,
        details JSON NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `)

    const indexStatements = [
      'ALTER TABLE audit_logs ADD INDEX idx_audit_logs_created_at (created_at)',
      'ALTER TABLE audit_logs ADD INDEX idx_audit_logs_user_created_at (user_id, created_at)',
      'ALTER TABLE audit_logs ADD INDEX idx_audit_logs_resource_created_at (resource_type, created_at)',
      'ALTER TABLE audit_logs ADD INDEX idx_audit_logs_action_created_at (action, created_at)'
    ]

    for (const statement of indexStatements) {
      try {
        await db.pool.query(statement)
      } catch (err) {
        if (!['ER_DUP_KEYNAME', 'ER_MULTIPLE_KEY'].includes(err?.code)) throw err
      }
    }
  })().catch((err) => {
    ensureAuditSchemaPromise = null
    throw err
  })

  return ensureAuditSchemaPromise
}

async function logAuditEvent(conn, event = {}) {
  await ensureAuditSchema()

  const executor = conn && typeof conn.query === 'function' ? conn : db.pool
  const details = buildAuditDetails(event.details || {})

  await executor.query(
    `INSERT INTO audit_logs (user_id, action, resource_type, resource_id, details)
     VALUES (?, ?, ?, ?, ?)`,
    [
      event.userId || null,
      String(event.action || '').trim() || 'UNKNOWN_EVENT',
      event.resourceType ? String(event.resourceType) : null,
      event.resourceId !== undefined && event.resourceId !== null ? String(event.resourceId) : null,
      JSON.stringify(details)
    ]
  )
}

async function logAuditEventSafe(conn, event = {}) {
  try {
    await logAuditEvent(conn, event)
  } catch (err) {
    console.error('audit log failed', err)
  }
}

function enrichAuditRow(row) {
  const details = safeJsonParse(row?.details)
  const moduleKey = deriveModule({ action: row?.action, resourceType: row?.resource_type, details })
  const severity = deriveSeverity({ action: row?.action, details })
  const sensitive = isSensitiveAuditEvent({ action: row?.action, details, severity })
  const resultStatus = deriveResultStatus({ action: row?.action, details })

  return {
    ...row,
    details,
    module: moduleKey,
    module_label: MODULE_LABELS[moduleKey] || humanizeCode(moduleKey),
    severity,
    result_status: resultStatus,
    result_label: humanizeCode(resultStatus),
    is_sensitive: sensitive,
    event_label: getActionLabel(row?.action, details),
    target_label: getTargetLabel(row, details),
    summary: getSummary(row, details)
  }
}

module.exports = {
  ACTION_LABELS,
  MODULE_LABELS,
  buildAuditDetails,
  deriveModule,
  deriveSeverity,
  enrichAuditRow,
  ensureAuditSchema,
  humanizeCode,
  isSensitiveAuditEvent,
  logAuditEvent,
  logAuditEventSafe,
  safeJsonParse,
  summarizeLegacyDetails
}
