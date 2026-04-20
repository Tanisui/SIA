const test = require('node:test')
const assert = require('node:assert/strict')

function mockModule(modulePath, exportsValue) {
  const resolved = require.resolve(modulePath)
  const original = require.cache[resolved]

  require.cache[resolved] = {
    id: resolved,
    filename: resolved,
    loaded: true,
    exports: exportsValue
  }

  return () => {
    if (original) require.cache[resolved] = original
    else delete require.cache[resolved]
  }
}

test('runtime config forces non-vat sales to zero VAT and reports missing invoice fields', async (t) => {
  const restorers = []

  restorers.push(mockModule('../src/database', { pool: {} }))
  restorers.push(mockModule('../src/repositories/configRepository', {
    ensureConfigsTable: async () => {},
    upsertConfigValues: async () => {},
    getConfigMap: async () => ({
      'scanner.debounce_ms': '300',
      'sales.currency': 'PHP',
      'sales.tax_rate': '0.12',
      'invoice.display_name': "Cecille's N'Style",
      'invoice.registered_name': '',
      'invoice.registration_type': 'NON_VAT',
      'invoice.seller_tin': '',
      'invoice.branch_code': '',
      'invoice.registered_business_address': '',
      'invoice.bir_permit_number': '',
      'invoice.bir_permit_date_issued': '',
      'invoice.atp_number': '',
      'invoice.atp_date_issued': '',
      'invoice.approved_series': ''
    })
  }))

  const servicePath = require.resolve('../src/services/runtimeConfigService')
  delete require.cache[servicePath]
  const { getRuntimeConfig } = require('../src/services/runtimeConfigService')

  t.after(() => {
    delete require.cache[servicePath]
    restorers.reverse().forEach((restore) => restore())
  })

  const config = await getRuntimeConfig({})

  assert.equal(config.scannerDebounceMs, 300)
  assert.equal(config.currency, 'PHP')
  assert.equal(config.configuredTaxRate, 0.12)
  assert.equal(config.taxRate, 0)
  assert.equal(config.invoice.registrationType, 'NON_VAT')
  assert.equal(config.invoice.requirementsComplete, false)
  assert.ok(config.invoice.missingFields.includes('Registered Name'))
  assert.ok(config.invoice.missingFields.includes('Seller TIN'))
  assert.ok(config.invoice.missingFields.includes('Authority to Print No.'))
})
