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

function createInventoryRouteHarness(rows) {
  const restorers = []
  let ensureSchemaCalls = 0
  const queryCalls = []

  const dbMock = {
    pool: {
      async query(sql, params = []) {
        queryCalls.push({ sql, params })
        return [rows]
      }
    }
  }

  const authMock = {
    verifyToken: (_req, _res, next) => next(),
    authorize: () => (_req, _res, next) => next()
  }

  const reportsMock = {
    ensureAutomatedReportsSchema: async () => {
      ensureSchemaCalls += 1
    }
  }

  restorers.push(mockModule('../src/database', dbMock))
  restorers.push(mockModule('../src/middleware/authMiddleware', authMock))
  restorers.push(mockModule('../src/utils/automatedReports', reportsMock))

  const routeModulePath = require.resolve('../src/routes/inventory')
  delete require.cache[routeModulePath]
  const router = require('../src/routes/inventory')
  const handler = getFinalRouteHandler(router, '/stock-in/bale-options', 'get')

  return {
    handler,
    queryCalls,
    get ensureSchemaCalls() {
      return ensureSchemaCalls
    },
    cleanup() {
      delete require.cache[routeModulePath]
      restorers.reverse().forEach((restore) => restore())
    }
  }
}

function createInventoryPostRouteHarness(options) {
  const restorers = []
  let ensureSchemaCalls = 0
  let skuCounter = 0
  let barcodeCounter = 0
  let productInsertCounter = Number(options?.startingProductId || 900)

  const applyStockCalls = []
  const qrGenerateCalls = []
  const qrUpdateCalls = []
  const auditCalls = []

  const connectionState = {
    beginCount: 0,
    commitCount: 0,
    rollbackCount: 0,
    releaseCount: 0,
    queries: []
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
      connectionState.queries.push({ sql: normalizedSql, params })

      if (normalizedSql.includes('FROM bale_breakdowns bb') && normalizedSql.includes('FOR UPDATE')) {
        return [options?.breakdownRows || []]
      }

      if (normalizedSql.includes('FROM products') && normalizedSql.includes("condition_grade IN ('premium', 'standard')")) {
        return [options?.existingRows || []]
      }

      if (normalizedSql.includes('FROM categories')) {
        if (!options?.categoryId) return [[]]
        return [[{ id: Number(options.categoryId) }]]
      }

      if (normalizedSql.includes('INSERT INTO products')) {
        productInsertCounter += 1
        return [{ insertId: productInsertCounter }]
      }

      throw new Error(`Unsupported POST harness query: ${normalizedSql}`)
    }
  }

  const dbMock = {
    pool: {
      async getConnection() {
        return conn
      }
    }
  }

  const authMock = {
    verifyToken: (_req, _res, next) => next(),
    authorize: () => (_req, _res, next) => next()
  }

  const reportsMock = {
    ensureAutomatedReportsSchema: async () => {
      ensureSchemaCalls += 1
    }
  }

  const stockMock = {
    applyProductStockDelta: async (_conn, payload) => {
      applyStockCalls.push(payload)
      return { afterQuantity: 1 }
    }
  }

  const barcodeMock = {
    getNextSequentialSKU: async () => {
      skuCounter += 1
      return `SKU-T-${String(skuCounter).padStart(4, '0')}`
    },
    getNextSequentialBarcode: async () => {
      barcodeCounter += 1
      return `BAR-T-${String(barcodeCounter).padStart(4, '0')}`
    }
  }

  const qrMock = {
    generateProductQrImage: async (payload) => {
      qrGenerateCalls.push(payload)
      return { publicPath: `/uploads/qr/test-${payload.productId}.png` }
    }
  }

  const productRepoMock = {
    updateProductQrImagePath: async (_conn, productId, path) => {
      qrUpdateCalls.push({ productId, path })
    }
  }

  const auditMock = {
    logAuditEventSafe: async (_conn, payload) => {
      auditCalls.push(payload)
    }
  }

  restorers.push(mockModule('../src/database', dbMock))
  restorers.push(mockModule('../src/middleware/authMiddleware', authMock))
  restorers.push(mockModule('../src/utils/automatedReports', reportsMock))
  restorers.push(mockModule('../src/utils/inventoryStock', stockMock))
  restorers.push(mockModule('../src/utils/barcodeSupport', barcodeMock))
  restorers.push(mockModule('../src/services/qrCodeService', qrMock))
  restorers.push(mockModule('../src/repositories/productRepository', productRepoMock))
  restorers.push(mockModule('../src/utils/auditLog', auditMock))

  const routeModulePath = require.resolve('../src/routes/inventory')
  delete require.cache[routeModulePath]
  const router = require('../src/routes/inventory')
  const handler = getFinalRouteHandler(router, '/stock-in/bale', 'post')

  return {
    handler,
    connectionState,
    applyStockCalls,
    qrGenerateCalls,
    qrUpdateCalls,
    auditCalls,
    get ensureSchemaCalls() {
      return ensureSchemaCalls
    },
    cleanup() {
      delete require.cache[routeModulePath]
      restorers.reverse().forEach((restore) => restore())
    }
  }
}

function createInventoryWorkflowHarness(options) {
  const restorers = []
  const state = {
    breakdown: options?.breakdown || null,
    categoryId: Number(options?.categoryId || 1),
    products: [...(options?.products || [])],
    nextProductId: Number(options?.startingProductId || 3000)
  }

  let ensureSchemaCalls = 0
  let skuCounter = 0
  let barcodeCounter = 0
  const applyStockCalls = []

  const connectionState = {
    beginCount: 0,
    commitCount: 0,
    rollbackCount: 0,
    releaseCount: 0
  }

  function getBaleOptionRows() {
    const breakdown = state.breakdown
    if (!breakdown) return []

    const relevantProducts = state.products.filter((product) => (
      Number(product.bale_purchase_id) === Number(breakdown.bale_purchase_id)
      && (product.condition_grade === 'premium' || product.condition_grade === 'standard')
    ))

    const premiumStocked = relevantProducts.filter((product) => product.condition_grade === 'premium').length
    const standardStocked = relevantProducts.filter((product) => product.condition_grade === 'standard').length
    const premiumReady = relevantProducts.filter((product) => (
      product.condition_grade === 'premium'
      && Number(product.is_active ?? 1) === 1
      && Number(product.stock_quantity || 0) > 0
    )).length
    const standardReady = relevantProducts.filter((product) => (
      product.condition_grade === 'standard'
      && Number(product.is_active ?? 1) === 1
      && Number(product.stock_quantity || 0) > 0
    )).length

    return [{
      breakdown_id: breakdown.breakdown_id,
      bale_purchase_id: breakdown.bale_purchase_id,
      bale_batch_no: breakdown.bale_batch_no,
      supplier_name: breakdown.supplier_name,
      purchase_date: breakdown.purchase_date || breakdown.breakdown_event_date,
      breakdown_date: breakdown.breakdown_event_date,
      cost_per_saleable_item: breakdown.cost_per_saleable_item,
      premium_items: breakdown.premium_items,
      standard_items: breakdown.standard_items,
      damaged_items: breakdown.damaged_items || 0,
      premium_stocked: premiumStocked,
      standard_stocked: standardStocked,
      premium_ready: premiumReady,
      standard_ready: standardReady
    }]
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

      if (normalizedSql.includes('FROM bale_breakdowns bb') && normalizedSql.includes('FOR UPDATE')) {
        if (!state.breakdown) return [[]]
        return [[state.breakdown]]
      }

      if (normalizedSql.includes('FROM products') && normalizedSql.includes("condition_grade IN ('premium', 'standard')")) {
        const balePurchaseId = Number(params[0])
        const rows = state.products.filter((product) => (
          Number(product.bale_purchase_id) === balePurchaseId
          && (product.condition_grade === 'premium' || product.condition_grade === 'standard')
        ))
        return [rows]
      }

      if (normalizedSql.includes('FROM categories')) {
        if (!state.categoryId) return [[]]
        return [[{ id: state.categoryId }]]
      }

      if (normalizedSql.includes('INSERT INTO products')) {
        state.nextProductId += 1
        const insertedId = state.nextProductId
        state.products.push({
          id: insertedId,
          bale_purchase_id: Number(params[12]),
          condition_grade: String(params[14]),
          stock_quantity: Number(params[7]) || 0,
          is_active: Number(params[20] ?? 1)
        })
        return [{ insertId: insertedId }]
      }

      throw new Error(`Unsupported workflow harness query: ${normalizedSql}`)
    }
  }

  const dbMock = {
    pool: {
      async query(sql) {
        const normalizedSql = String(sql).replace(/\s+/g, ' ').trim()
        if (normalizedSql.includes('FROM bale_breakdowns bb') && normalizedSql.includes('LEFT JOIN (')) {
          return [getBaleOptionRows()]
        }
        throw new Error(`Unsupported workflow pool query: ${normalizedSql}`)
      },
      async getConnection() {
        return conn
      }
    }
  }

  const authMock = {
    verifyToken: (_req, _res, next) => next(),
    authorize: () => (_req, _res, next) => next()
  }

  const reportsMock = {
    ensureAutomatedReportsSchema: async () => {
      ensureSchemaCalls += 1
    }
  }

  const stockMock = {
    applyProductStockDelta: async (_conn, payload) => {
      applyStockCalls.push(payload)
      const product = state.products.find((item) => Number(item.id) === Number(payload.productId))
      if (product) {
        product.stock_quantity = (Number(product.stock_quantity) || 0) + (Number(payload.deltaQuantity) || 0)
      }
      return { afterQuantity: product ? Number(product.stock_quantity) : 0 }
    }
  }

  const barcodeMock = {
    getNextSequentialSKU: async () => {
      skuCounter += 1
      return `SKU-W-${String(skuCounter).padStart(4, '0')}`
    },
    getNextSequentialBarcode: async () => {
      barcodeCounter += 1
      return `BAR-W-${String(barcodeCounter).padStart(4, '0')}`
    }
  }

  const qrMock = {
    generateProductQrImage: async ({ productId }) => ({ publicPath: `/uploads/qr/workflow-${productId}.png` })
  }

  const productRepoMock = {
    updateProductQrImagePath: async () => {}
  }

  const auditMock = {
    logAuditEventSafe: async () => {}
  }

  restorers.push(mockModule('../src/database', dbMock))
  restorers.push(mockModule('../src/middleware/authMiddleware', authMock))
  restorers.push(mockModule('../src/utils/automatedReports', reportsMock))
  restorers.push(mockModule('../src/utils/inventoryStock', stockMock))
  restorers.push(mockModule('../src/utils/barcodeSupport', barcodeMock))
  restorers.push(mockModule('../src/services/qrCodeService', qrMock))
  restorers.push(mockModule('../src/repositories/productRepository', productRepoMock))
  restorers.push(mockModule('../src/utils/auditLog', auditMock))

  const routeModulePath = require.resolve('../src/routes/inventory')
  delete require.cache[routeModulePath]
  const router = require('../src/routes/inventory')

  return {
    getHandler: getFinalRouteHandler(router, '/stock-in/bale-options', 'get'),
    postHandler: getFinalRouteHandler(router, '/stock-in/bale', 'post'),
    applyStockCalls,
    connectionState,
    get ensureSchemaCalls() {
      return ensureSchemaCalls
    },
    cleanup() {
      delete require.cache[routeModulePath]
      restorers.reverse().forEach((restore) => restore())
    }
  }
}

test('bale options include completed rows when include_all=1 and map left/ready metrics', async (t) => {
  const fixtureRows = [
    {
      breakdown_id: 1001,
      bale_purchase_id: 501,
      bale_batch_no: 'BALE-501',
      supplier_name: 'Supplier A',
      premium_items: '5',
      standard_items: '3',
      premium_stocked: '4',
      standard_stocked: '1',
      premium_ready: '3',
      standard_ready: '1'
    },
    {
      breakdown_id: 1002,
      bale_purchase_id: 502,
      bale_batch_no: 'BALE-502',
      supplier_name: 'Supplier B',
      premium_items: '2',
      standard_items: '1',
      premium_stocked: '2',
      standard_stocked: '1',
      premium_ready: '1',
      standard_ready: '0'
    }
  ]

  const harness = createInventoryRouteHarness(fixtureRows)
  t.after(() => harness.cleanup())

  const req = { query: { include_all: '1' } }
  const res = createMockResponse()

  await harness.handler(req, res)

  assert.equal(res.statusCode, 200)
  assert.equal(Array.isArray(res.body), true)
  assert.equal(res.body.length, 2)

  const pendingRow = res.body.find((row) => Number(row.breakdown_id) === 1001)
  const completedRow = res.body.find((row) => Number(row.breakdown_id) === 1002)

  assert.ok(pendingRow)
  assert.equal(pendingRow.left_to_stock_in, 3)
  assert.equal(pendingRow.pending_total, 3)
  assert.equal(pendingRow.ready_for_product_management, 4)
  assert.equal(pendingRow.saleable_total, 8)

  assert.ok(completedRow)
  assert.equal(completedRow.left_to_stock_in, 0)
  assert.equal(completedRow.pending_total, 0)
  assert.equal(completedRow.ready_for_product_management, 1)

  assert.equal(harness.ensureSchemaCalls, 1)
  assert.equal(harness.queryCalls.length, 1)
  assert.match(harness.queryCalls[0].sql, /premium_ready/i)
  assert.match(harness.queryCalls[0].sql, /standard_ready/i)
})

test('bale options default behavior excludes fully stocked rows', async (t) => {
  const fixtureRows = [
    {
      breakdown_id: 2001,
      bale_purchase_id: 601,
      bale_batch_no: 'BALE-601',
      supplier_name: 'Supplier C',
      premium_items: '1',
      standard_items: '1',
      premium_stocked: '0',
      standard_stocked: '1',
      premium_ready: '0',
      standard_ready: '1'
    },
    {
      breakdown_id: 2002,
      bale_purchase_id: 602,
      bale_batch_no: 'BALE-602',
      supplier_name: 'Supplier D',
      premium_items: '1',
      standard_items: '1',
      premium_stocked: '1',
      standard_stocked: '1',
      premium_ready: '1',
      standard_ready: '0'
    }
  ]

  const harness = createInventoryRouteHarness(fixtureRows)
  t.after(() => harness.cleanup())

  const req = { query: {} }
  const res = createMockResponse()

  await harness.handler(req, res)

  assert.equal(res.statusCode, 200)
  assert.equal(Array.isArray(res.body), true)
  assert.equal(res.body.length, 1)
  assert.equal(Number(res.body[0].breakdown_id), 2001)
  assert.equal(res.body[0].left_to_stock_in, 1)
  assert.equal(harness.ensureSchemaCalls, 1)
})

test('bale stock-in endpoint rejects automatic flow and instructs detailed product creation', async (t) => {
  const harness = createInventoryPostRouteHarness({})
  t.after(() => harness.cleanup())

  const req = {
    auth: { id: 55 },
    body: { bale_purchase_id: 77 },
    query: {}
  }
  const res = createMockResponse()

  await harness.handler(req, res)

  assert.equal(res.statusCode, 400)
  assert.equal(res.body?.error, 'Automatic bale stock-in is disabled. Create products one by one from Product Management with full details.')
  assert.equal(harness.ensureSchemaCalls, 0)
  assert.equal(harness.connectionState.beginCount, 0)
  assert.equal(harness.connectionState.commitCount, 0)
  assert.equal(harness.connectionState.rollbackCount, 0)
  assert.equal(harness.connectionState.releaseCount, 0)
  assert.equal(harness.applyStockCalls.length, 0)
  assert.equal(harness.auditCalls.length, 0)
})

test('bale stock-in endpoint validates bale_purchase_id', async (t) => {
  const harness = createInventoryPostRouteHarness({})
  t.after(() => harness.cleanup())

  const req = {
    auth: { id: 56 },
    body: {},
    query: {}
  }
  const res = createMockResponse()

  await harness.handler(req, res)

  assert.equal(res.statusCode, 400)
  assert.equal(res.body?.error, 'bale_purchase_id must be a valid positive integer')
})

test('workflow consistency: blocked bale stock-in leaves bale options unchanged', async (t) => {
  const harness = createInventoryWorkflowHarness({
    categoryId: 3,
    breakdown: {
      breakdown_id: 501,
      bale_purchase_id: 900,
      premium_items: 2,
      standard_items: 2,
      cost_per_saleable_item: 120,
      breakdown_event_date: '2026-04-18',
      purchase_date: '2026-04-18',
      bale_batch_no: 'BALE-900',
      supplier_name: 'Workflow Supplier',
      bale_category: 'Mixed'
    },
    products: [
      { id: 1, bale_purchase_id: 900, condition_grade: 'premium', stock_quantity: 1, is_active: 1 },
      { id: 2, bale_purchase_id: 900, condition_grade: 'standard', stock_quantity: 1, is_active: 1 }
    ]
  })
  t.after(() => harness.cleanup())

  const preGetReq = { query: { include_all: '1' } }
  const preGetRes = createMockResponse()
  await harness.getHandler(preGetReq, preGetRes)

  assert.equal(preGetRes.statusCode, 200)
  assert.equal(preGetRes.body.length, 1)
  assert.equal(preGetRes.body[0].left_to_stock_in, 2)
  assert.equal(preGetRes.body[0].ready_for_product_management, 2)

  const postReq = { auth: { id: 9 }, query: {}, body: { bale_purchase_id: 900 } }
  const postRes = createMockResponse()
  await harness.postHandler(postReq, postRes)

  assert.equal(postRes.statusCode, 400)
  assert.equal(postRes.body?.error, 'Automatic bale stock-in is disabled. Create products one by one from Product Management with full details.')

  const postGetReq = { query: { include_all: '1' } }
  const postGetRes = createMockResponse()
  await harness.getHandler(postGetReq, postGetRes)

  assert.equal(postGetRes.statusCode, 200)
  assert.equal(postGetRes.body.length, 1)
  assert.equal(postGetRes.body[0].left_to_stock_in, 2)
  assert.equal(postGetRes.body[0].ready_for_product_management, 2)

  assert.equal(harness.applyStockCalls.length, 0)
  assert.equal(harness.connectionState.commitCount, 0)
  assert.equal(harness.connectionState.rollbackCount, 0)
  assert.equal(harness.ensureSchemaCalls, 2)
})