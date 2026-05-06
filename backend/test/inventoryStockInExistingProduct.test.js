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

function createMockResponse() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code
      return this
    },
    json(payload) {
      this.body = payload
      return this
    }
  }
}

function getFinalRouteHandler(router, routePath, method) {
  const normalizedMethod = String(method || 'get').toLowerCase()
  const layer = router.stack.find((entry) => (
    entry.route
    && entry.route.path === routePath
    && entry.route.methods[normalizedMethod]
  ))

  assert.ok(layer, `Expected route ${normalizedMethod.toUpperCase()} ${routePath} to exist`)
  return layer.route.stack[layer.route.stack.length - 1].handle
}

function createStockInHarness(options = {}) {
  const restorers = []
  const applyStockCalls = []
  const auditCalls = []
  const queryCalls = []
  const consoleErrors = []
  const originalConsoleError = console.error
  console.error = (...args) => {
    consoleErrors.push(args)
  }
  const product = {
    id: 7,
    name: 'Dress blue',
    sku: 'SKU000007',
    stock_quantity: 2,
    cost: 266.67,
    product_source: 'bale_breakdown',
    bale_purchase_id: 9,
    ...options.product
  }
  const bale = {
    bale_purchase_id: 9,
    supplier_id: 8,
    supplier_name: 'ABCD',
    bale_batch_no: 'UKAY-001',
    bale_category: 'Ukay-Ukay',
    breakdown_id: 21,
    ...options.bale
  }
  const connectionState = {
    beginCount: 0,
    commitCount: 0,
    rollbackCount: 0,
    releaseCount: 0
  }

  const conn = {
    async beginTransaction() {
      connectionState.beginCount += 1
    },
    async commit() {
      connectionState.commitCount += 1
    },
    async rollback() {
      connectionState.rollbackCount += 1
    },
    release() {
      connectionState.releaseCount += 1
    },
    async query(sql, params = []) {
      const normalizedSql = String(sql).replace(/\s+/g, ' ').trim()
      queryCalls.push({ sql: normalizedSql, params })

      if (normalizedSql.includes('FROM products') && normalizedSql.includes('FOR UPDATE')) {
        return product ? [[{ ...product, id: Number(params[0]) }]] : [[]]
      }

      if (normalizedSql === 'SELECT id, name FROM suppliers WHERE id = ? LIMIT 1') {
        return [[{ id: Number(params[0]), name: 'ABCD' }]]
      }

      if (normalizedSql.includes('FROM bale_purchases bp') && normalizedSql.includes('LEFT JOIN bale_breakdowns bb')) {
        return [[{ ...bale, bale_purchase_id: Number(params[0]) }]]
      }

      throw new Error(`Unsupported stock-in harness query: ${normalizedSql}`)
    }
  }

  restorers.push(mockModule('../src/database', {
    pool: {
      async getConnection() {
        return conn
      },
      async query(sql, params = []) {
        queryCalls.push({ sql: String(sql).replace(/\s+/g, ' ').trim(), params })
        return [options.summaryRows || []]
      }
    }
  }))
  restorers.push(mockModule('../src/middleware/authMiddleware', {
    verifyToken: (_req, _res, next) => next(),
    authorize: () => (_req, _res, next) => next()
  }))
  restorers.push(mockModule('../src/utils/automatedReports', {
    ensureAutomatedReportsSchema: async () => {}
  }))
  restorers.push(mockModule('../src/utils/inventoryStock', {
    applyProductStockDelta: async (_conn, payload) => {
      applyStockCalls.push(payload)
      return {
        product: payload.lockedProduct,
        beforeQuantity: Number(payload.lockedProduct.stock_quantity),
        afterQuantity: Number(payload.lockedProduct.stock_quantity) + Number(payload.deltaQuantity),
        beforeCost: Number(payload.lockedProduct.cost) || 0,
        afterCost: Number(payload.lockedProduct.cost) || 0
      }
    }
  }))
  restorers.push(mockModule('../src/utils/auditLog', {
    logAuditEventSafe: async (_conn, payload) => {
      auditCalls.push(payload)
    }
  }))

  const routeModulePath = require.resolve('../src/routes/inventory')
  delete require.cache[routeModulePath]
  const router = require('../src/routes/inventory')

  return {
    router,
    handler: getFinalRouteHandler(router, '/stock-in', 'post'),
    applyStockCalls,
    auditCalls,
    queryCalls,
    consoleErrors,
    connectionState,
    cleanup() {
      console.error = originalConsoleError
      delete require.cache[routeModulePath]
      restorers.reverse().forEach((restore) => restore())
    }
  }
}

test('bale stock-in succeeds for an existing product linked to the selected bale', async (t) => {
  const harness = createStockInHarness()
  t.after(() => harness.cleanup())

  const req = {
    auth: { id: 42 },
    body: {
      product_id: 7,
      quantity: 1,
      source_type: 'bale',
      bale_purchase_id: 9,
      reference: 'Dress blue replenishment',
      date: '2026-05-05'
    }
  }
  const res = createMockResponse()

  await harness.handler(req, res)

  assert.equal(res.statusCode, 200)
  assert.deepEqual(res.body, { success: true, new_quantity: 3 })
  assert.equal(harness.connectionState.commitCount, 1)
  assert.equal(harness.connectionState.rollbackCount, 0)
  assert.equal(harness.applyStockCalls.length, 1)
  assert.equal(harness.applyStockCalls[0].productId, 7)
  assert.equal(harness.applyStockCalls[0].deltaQuantity, 1)
  assert.equal(harness.applyStockCalls[0].supplierId, 8)
  assert.equal(harness.applyStockCalls[0].reason, 'Stock in from bale source')
  assert.match(
    harness.applyStockCalls[0].reference,
    /^STOCK_IN\|source=BALE\|bale_purchase_id=9\|breakdown_id=21\|batch=UKAY-001\|supplier=ABCD\|note=Dress blue replenishment$/
  )
  assert.equal(harness.auditCalls[0].details.references.stock_source, 'bale')
  assert.equal(harness.auditCalls[0].details.references.bale_purchase_id, 9)
})

test('bale stock-in rejects an existing product from another bale', async (t) => {
  const harness = createStockInHarness({
    product: { bale_purchase_id: 10 }
  })
  t.after(() => harness.cleanup())

  const res = createMockResponse()
  await harness.handler({
    auth: { id: 42 },
    body: {
      product_id: 7,
      quantity: 1,
      source_type: 'bale',
      bale_purchase_id: 9
    }
  }, res)

  assert.equal(res.statusCode, 400)
  assert.match(res.body.error, /not linked to the selected bale batch/)
  assert.equal(harness.applyStockCalls.length, 0)
  assert.equal(harness.connectionState.rollbackCount, 1)
})

test('manual correction stock-in succeeds with a required reference note', async (t) => {
  const harness = createStockInHarness({
    product: {
      product_source: 'manual',
      bale_purchase_id: null
    }
  })
  t.after(() => harness.cleanup())

  const res = createMockResponse()
  await harness.handler({
    auth: { id: 42 },
    body: {
      product_id: 5,
      quantity: 3,
      source_type: 'manual',
      reference: 'Count correction after shelf recount',
      date: '2026-05-05'
    }
  }, res)

  assert.equal(res.statusCode, 200)
  assert.equal(harness.applyStockCalls.length, 1)
  assert.equal(harness.applyStockCalls[0].supplierId, null)
  assert.equal(harness.applyStockCalls[0].reason, 'Manual stock correction')
  assert.match(harness.applyStockCalls[0].reference, /^STOCK_IN\|source=MANUAL\|note=Count correction after shelf recount$/)
})

test('manual correction stock-in rejects missing reference note', async (t) => {
  const harness = createStockInHarness()
  t.after(() => harness.cleanup())

  const res = createMockResponse()
  await harness.handler({
    auth: { id: 42 },
    body: {
      product_id: 7,
      quantity: 1,
      source_type: 'manual',
      reference: '   '
    }
  }, res)

  assert.equal(res.statusCode, 400)
  assert.match(res.body.error, /reference is required/)
  assert.equal(harness.applyStockCalls.length, 0)
  assert.equal(harness.connectionState.rollbackCount, 1)
})

test('existing-product stock-in rejects supplier source', async (t) => {
  const harness = createStockInHarness()
  t.after(() => harness.cleanup())

  const res = createMockResponse()
  await harness.handler({
    auth: { id: 42 },
    body: {
      product_id: 7,
      quantity: 1,
      source_type: 'supplier',
      supplier_id: 8,
      reference: 'RCPT-1'
    }
  }, res)

  assert.equal(res.statusCode, 400)
  assert.match(res.body.error, /Supplier Delivery is not available/)
  assert.equal(harness.applyStockCalls.length, 0)
  assert.equal(harness.connectionState.rollbackCount, 1)
})

test('inventory summary report keeps stock-in totals sourced from inventory transactions', async (t) => {
  const harness = createStockInHarness({
    summaryRows: [{
      id: 7,
      sku: 'SKU000007',
      name: 'Dress blue',
      stock_quantity: 3,
      cost: 100,
      price: 200,
      total_in_units: 13,
      total_out_units: 10,
      total_adjustment_units: 0,
      total_return_units: 0,
      stock_value: 300,
      retail_value: 600
    }]
  })
  t.after(() => harness.cleanup())

  const handler = getFinalRouteHandler(harness.router, '/reports/summary', 'get')
  const res = createMockResponse()
  await handler({ auth: { id: 42 }, query: {} }, res)

  assert.equal(res.statusCode, 200)
  assert.equal(res.body.products[0].total_in_units, 13)
  assert.equal(res.body.totalItems, 3)
  assert.ok(harness.queryCalls.some((call) => call.sql.includes("SUM(CASE WHEN transaction_type = 'IN'")))
})
