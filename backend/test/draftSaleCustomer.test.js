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

function createDraftServiceHarness() {
  const restorers = []
  const state = {
    sales: [
      {
        id: 11,
        status: 'DRAFT',
        customer_id: null,
        customer_name_snapshot: 'Walk-in Customer',
        customer_phone_snapshot: null,
        customer_email_snapshot: null
      },
      {
        id: 12,
        status: 'COMPLETED',
        customer_id: null,
        customer_name_snapshot: 'Walk-in Customer',
        customer_phone_snapshot: null,
        customer_email_snapshot: null
      }
    ],
    customers: [
      {
        id: 3,
        customer_code: 'CUST-000003',
        full_name: 'Maria Santos',
        phone: '+639171234567',
        email: 'maria@example.com'
      }
    ]
  }

  const salesSupportMock = {
    WALK_IN_CUSTOMER_LABEL: 'Walk-in Customer',
    roundMoney: (value) => Math.round((Number(value) || 0) * 100) / 100,
    generateDocumentNumber: async () => 'DRF-TEST-0001',
    getSaleById: async (_conn, saleId) => {
      const sale = state.sales.find((entry) => Number(entry.id) === Number(saleId))
      if (!sale) return null
      return {
        ...sale,
        customer_code: state.customers.find((entry) => Number(entry.id) === Number(sale.customer_id))?.customer_code || null,
        customer_name: sale.customer_name_snapshot,
        customer_phone: sale.customer_phone_snapshot,
        customer_email: sale.customer_email_snapshot,
        items: []
      }
    }
  }

  const productRepoMock = {
    findProductByScannedCode: async () => null,
    findProductByIdForUpdate: async () => null
  }

  restorers.push(mockModule('../src/utils/salesSupport', salesSupportMock))
  restorers.push(mockModule('../src/repositories/productRepository', productRepoMock))

  const servicePath = require.resolve('../src/services/draftSaleService')
  delete require.cache[servicePath]
  const service = require('../src/services/draftSaleService')

  const conn = {
    async query(sql, params = []) {
      const normalizedSql = String(sql).replace(/\s+/g, ' ').trim()

      if (normalizedSql.startsWith('SELECT id, status FROM sales')) {
        const sale = state.sales.find((entry) => Number(entry.id) === Number(params[0]))
        return [[sale].filter(Boolean)]
      }

      if (normalizedSql.includes('FROM customers') && normalizedSql.includes('LIMIT 1')) {
        const customer = state.customers.find((entry) => Number(entry.id) === Number(params[0]))
        return [[customer].filter(Boolean)]
      }

      if (normalizedSql.startsWith('UPDATE sales SET customer_id = NULL')) {
        const sale = state.sales.find((entry) => Number(entry.id) === Number(params[1]))
        if (sale) {
          sale.customer_id = null
          sale.customer_name_snapshot = params[0]
          sale.customer_phone_snapshot = null
          sale.customer_email_snapshot = null
        }
        return [{ affectedRows: sale ? 1 : 0 }]
      }

      if (normalizedSql.startsWith('UPDATE sales SET customer_id = ?')) {
        const sale = state.sales.find((entry) => Number(entry.id) === Number(params[4]))
        if (sale) {
          sale.customer_id = Number(params[0])
          sale.customer_name_snapshot = params[1]
          sale.customer_phone_snapshot = params[2]
          sale.customer_email_snapshot = params[3]
        }
        return [{ affectedRows: sale ? 1 : 0 }]
      }

      throw new Error(`Unsupported draft sale service query: ${normalizedSql}`)
    }
  }

  return {
    service,
    conn,
    state,
    cleanup() {
      delete require.cache[servicePath]
      restorers.reverse().forEach((restore) => restore())
    }
  }
}

test('updateDraftSaleCustomer stores customer snapshots on a draft sale', async (t) => {
  const harness = createDraftServiceHarness()
  t.after(() => harness.cleanup())

  const sale = await harness.service.updateDraftSaleCustomer(harness.conn, 11, 3)

  assert.equal(sale.customer_id, 3)
  assert.equal(sale.customer_name_snapshot, 'Maria Santos')
  assert.equal(sale.customer_phone_snapshot, '+639171234567')
  assert.equal(sale.customer_email_snapshot, 'maria@example.com')
})

test('updateDraftSaleCustomer clears a draft back to walk-in', async (t) => {
  const harness = createDraftServiceHarness()
  t.after(() => harness.cleanup())

  await harness.service.updateDraftSaleCustomer(harness.conn, 11, 3)
  const sale = await harness.service.updateDraftSaleCustomer(harness.conn, 11, null)

  assert.equal(sale.customer_id, null)
  assert.equal(sale.customer_name_snapshot, 'Walk-in Customer')
  assert.equal(sale.customer_phone_snapshot, null)
  assert.equal(sale.customer_email_snapshot, null)
})

test('updateDraftSaleCustomer rejects non-draft sales', async (t) => {
  const harness = createDraftServiceHarness()
  t.after(() => harness.cleanup())

  await assert.rejects(
    () => harness.service.updateDraftSaleCustomer(harness.conn, 12, 3),
    (error) => {
      assert.equal(error?.statusCode, 400)
      assert.match(error?.message || '', /draft sale/i)
      return true
    }
  )
})
