const db = require('../database')
const { ensureConfigsTable, upsertConfigValues, getConfigMap } = require('../repositories/configRepository')

const CONFIG_KEYS = {
  scannerDebounceMs: 'scanner.debounce_ms',
  currency: 'sales.currency',
  taxRate: 'sales.tax_rate'
}

const CONFIG_DEFAULTS = {
  [CONFIG_KEYS.scannerDebounceMs]: '250',
  [CONFIG_KEYS.currency]: 'PHP',
  [CONFIG_KEYS.taxRate]: '0'
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

async function ensureRuntimeConfig(conn = db.pool) {
  await ensureConfigsTable(conn)
  await upsertConfigValues(conn, CONFIG_DEFAULTS)
}

async function getRuntimeConfig(conn = db.pool) {
  await ensureRuntimeConfig(conn)
  const configMap = await getConfigMap(conn, Object.values(CONFIG_KEYS))

  return {
    scannerDebounceMs: normalizePositiveInteger(configMap[CONFIG_KEYS.scannerDebounceMs], normalizePositiveInteger(CONFIG_DEFAULTS[CONFIG_KEYS.scannerDebounceMs], 250)),
    currency: String(configMap[CONFIG_KEYS.currency] || CONFIG_DEFAULTS[CONFIG_KEYS.currency]).trim() || 'PHP',
    taxRate: normalizeTaxRate(configMap[CONFIG_KEYS.taxRate] ?? CONFIG_DEFAULTS[CONFIG_KEYS.taxRate])
  }
}

module.exports = {
  CONFIG_KEYS,
  CONFIG_DEFAULTS,
  ensureRuntimeConfig,
  getRuntimeConfig
}
