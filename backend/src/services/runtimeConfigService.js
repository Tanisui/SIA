const db = require('../database')
const { ensureConfigsTable, upsertConfigValues, getConfigMap } = require('../repositories/configRepository')

const CONFIG_KEYS = {
  scannerDebounceMs: 'scanner.debounce_ms',
  currency: 'sales.currency',
  taxRate: 'sales.tax_rate',
  invoiceDisplayName: 'invoice.display_name',
  invoiceRegisteredName: 'invoice.registered_name',
  invoiceRegistrationType: 'invoice.registration_type',
  invoiceSellerTin: 'invoice.seller_tin',
  invoiceBranchCode: 'invoice.branch_code',
  invoiceRegisteredBusinessAddress: 'invoice.registered_business_address',
  invoiceBirPermitNumber: 'invoice.bir_permit_number',
  invoiceBirPermitDateIssued: 'invoice.bir_permit_date_issued',
  invoiceAtpNumber: 'invoice.atp_number',
  invoiceAtpDateIssued: 'invoice.atp_date_issued',
  invoiceApprovedSeries: 'invoice.approved_series'
}

const CONFIG_DEFAULTS = {
  [CONFIG_KEYS.scannerDebounceMs]: '250',
  [CONFIG_KEYS.currency]: 'PHP',
  [CONFIG_KEYS.taxRate]: '0.12',
  [CONFIG_KEYS.invoiceDisplayName]: "Cecille's N'Style",
  [CONFIG_KEYS.invoiceRegisteredName]: '',
  [CONFIG_KEYS.invoiceRegistrationType]: 'VAT',
  [CONFIG_KEYS.invoiceSellerTin]: '',
  [CONFIG_KEYS.invoiceBranchCode]: '',
  [CONFIG_KEYS.invoiceRegisteredBusinessAddress]: '',
  [CONFIG_KEYS.invoiceBirPermitNumber]: '',
  [CONFIG_KEYS.invoiceBirPermitDateIssued]: '',
  [CONFIG_KEYS.invoiceAtpNumber]: '',
  [CONFIG_KEYS.invoiceAtpDateIssued]: '',
  [CONFIG_KEYS.invoiceApprovedSeries]: ''
}

function normalizePositiveInteger(value, fallback) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) return fallback
  return Math.floor(parsed)
}

function normalizeTaxRate(value) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) return 0
  if (parsed > 1) return parsed / 100
  return parsed
}

function normalizeSingleLine(value, fallback = '') {
  const normalized = String(value ?? '').trim()
  return normalized || fallback
}

function normalizeRegistrationType(value) {
  const normalized = String(value || '').trim().toUpperCase()
  return normalized === 'NON_VAT' ? 'NON_VAT' : 'VAT'
}

function normalizeDateValue(value) {
  const normalized = String(value || '').trim()
  if (!normalized) return ''
  const parsed = new Date(normalized)
  if (Number.isNaN(parsed.getTime())) return ''
  return parsed.toISOString().slice(0, 10)
}

function buildInvoiceMissingFields(invoiceConfig) {
  const fields = []
  if (!invoiceConfig.registeredName) fields.push('Registered Name')
  if (!invoiceConfig.sellerTin) fields.push('Seller TIN')
  if (!invoiceConfig.branchCode) fields.push('Branch Code')
  if (!invoiceConfig.registeredBusinessAddress) fields.push('Registered Business Address')
  if (!invoiceConfig.birPermitNumber) fields.push('BIR Permit No.')
  if (!invoiceConfig.birPermitDateIssued) fields.push('BIR Permit Date Issued')
  if (!invoiceConfig.atpNumber) fields.push('Authority to Print No.')
  if (!invoiceConfig.atpDateIssued) fields.push('Authority to Print Date Issued')
  if (!invoiceConfig.approvedSeries) fields.push('Approved Serial Range')
  return fields
}

async function ensureRuntimeConfig(conn = db.pool) {
  await ensureConfigsTable(conn)
  await upsertConfigValues(conn, CONFIG_DEFAULTS)
}

async function getRuntimeConfig(conn = db.pool) {
  await ensureRuntimeConfig(conn)
  const configMap = await getConfigMap(conn, Object.values(CONFIG_KEYS))
  const registrationType = normalizeRegistrationType(configMap[CONFIG_KEYS.invoiceRegistrationType] ?? CONFIG_DEFAULTS[CONFIG_KEYS.invoiceRegistrationType])
  const configuredTaxRate = normalizeTaxRate(configMap[CONFIG_KEYS.taxRate] ?? CONFIG_DEFAULTS[CONFIG_KEYS.taxRate])
  const invoice = {
    displayName: normalizeSingleLine(configMap[CONFIG_KEYS.invoiceDisplayName], CONFIG_DEFAULTS[CONFIG_KEYS.invoiceDisplayName]),
    registeredName: normalizeSingleLine(configMap[CONFIG_KEYS.invoiceRegisteredName]),
    registrationType,
    sellerTin: normalizeSingleLine(configMap[CONFIG_KEYS.invoiceSellerTin]),
    branchCode: normalizeSingleLine(configMap[CONFIG_KEYS.invoiceBranchCode]),
    registeredBusinessAddress: normalizeSingleLine(configMap[CONFIG_KEYS.invoiceRegisteredBusinessAddress]),
    birPermitNumber: normalizeSingleLine(configMap[CONFIG_KEYS.invoiceBirPermitNumber]),
    birPermitDateIssued: normalizeDateValue(configMap[CONFIG_KEYS.invoiceBirPermitDateIssued]),
    atpNumber: normalizeSingleLine(configMap[CONFIG_KEYS.invoiceAtpNumber]),
    atpDateIssued: normalizeDateValue(configMap[CONFIG_KEYS.invoiceAtpDateIssued]),
    approvedSeries: normalizeSingleLine(configMap[CONFIG_KEYS.invoiceApprovedSeries])
  }
  const missingFields = buildInvoiceMissingFields(invoice)

  return {
    scannerDebounceMs: normalizePositiveInteger(configMap[CONFIG_KEYS.scannerDebounceMs], normalizePositiveInteger(CONFIG_DEFAULTS[CONFIG_KEYS.scannerDebounceMs], 250)),
    currency: String(configMap[CONFIG_KEYS.currency] || CONFIG_DEFAULTS[CONFIG_KEYS.currency]).trim() || 'PHP',
    configuredTaxRate,
    taxRate: registrationType === 'NON_VAT' ? 0 : configuredTaxRate,
    invoice: {
      ...invoice,
      missingFields,
      requirementsComplete: missingFields.length === 0
    }
  }
}

module.exports = {
  CONFIG_KEYS,
  CONFIG_DEFAULTS,
  ensureRuntimeConfig,
  getRuntimeConfig
}
