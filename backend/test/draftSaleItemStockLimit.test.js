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

function createDraftItemHarness() {
  const restorers = []

  const product = {
    id: 4,
    sku: 'SKU000004',
    barcode: 'BAR000004',
    name: 'Dolphin Shorts',
    price: 700,
    stock_quantity: 9
  }

  const salesSupportMock = {
    WALK_IN_CUSTOMER_LABEL: 'Walk-in Customer',
    roundMoney: (value) => Math.round((Number(value) || 0) * 100) / 100,
    generateDocumentNumber: async () => 'DRF-TEST-0001',
    getSaleById: async () => ({ id: 82, items: [] })
  }

  const productRepoMock = {
    findProductByScannedCode: async () => product,
    findProductByIdForUpdate: async () => product
  }

  restorers.push(mockModule('../src/utils/salesSupport', salesSupportMock))
  restorers.push(mockModule('../src/repositories/productRepository', productRepoMock))

  const servicePath = require.resolve('../src/services/draftSaleService')
  delete require.cache[servicePath]
  const service = require('../src/services/draftSaleService')

  const conn = {
    async query(sql) {
      const normalizedSql = String(sql).replace(/\s+/g, ' ').trim()

      if (normalizedSql.startsWith('SELECT id, qty, unit_price FROM sale_items')) {
        return [[
          { id: 80, qty: 9, unit_price: 700 }
        ]]
      }

      throw new Error(`Unsupported draft sale item query: ${normalizedSql}`)
    }
  }

  return {
    service,
    conn,
    cleanup() {
      delete require.cache[servicePath]
      restorers.reverse().forEach((restore) => restore())
    }
  }
}

test('addDraftSaleItem reports a draft stock limit when the draft already reserves all stock', async (t) => {
  const harness = createDraftItemHarness()
  t.after(() => harness.cleanup())

  await assert.rejects(
    () => harness.service.addDraftSaleItem(harness.conn, 82, { code: 'BAR000004', quantity: 1 }),
    (error) => {
      assert.equal(error?.statusCode, 409)
      assert.equal(error?.message, 'draft stock limit reached')
      assert.deepEqual(error?.meta, {
        stock_quantity: 9,
        already_reserved: 9,
        remaining_available: 0
      })
      return true
    }
  )
})
