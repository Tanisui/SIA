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

function createProductsPostHarness(options = {}) {
  const restorers = []
  let nextProductId = Number(options.startingProductId || 500)
  let skuCounter = 0
  let barcodeCounter = 0

  const applyStockCalls = []
  const qrUpdateCalls = []
  const auditCalls = []
  const insertedProducts = new Map()
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

      if (normalizedSql.startsWith('SELECT p.id, p.sku, p.name, p.barcode, p.qr_image_path, p.stock_quantity FROM products p')) {
        return [options.findSimilarRows || []]
      }

      if (normalizedSql.includes('FROM bale_breakdowns bb') && normalizedSql.includes('FOR UPDATE')) {
        return [options.breakdownRows || []]
      }

      if (normalizedSql.includes('FROM products p') && normalizedSql.includes("condition_grade IN ('premium', 'standard')")) {
        return [options.stockedGradeRows || []]
      }

      if (normalizedSql.startsWith('INSERT INTO products')) {
        nextProductId += 1
        const insertedId = nextProductId
        insertedProducts.set(insertedId, {
          id: insertedId,
          sku: params[0],
          name: params[1],
          brand: params[2],
          description: params[3],
          category_id: params[4],
          subcategory: params[5],
          price: params[6],
          cost: params[7],
          stock_quantity: params[8],
          low_stock_threshold: params[9],
          size: params[10],
          color: params[11],
          barcode: params[12],
          product_source: params[13],
          source_breakdown_id: params[14],
          bale_purchase_id: params[15],
          condition_grade: params[16],
          allocated_cost: params[17],
          status: params[18],
          date_encoded: params[19],
          is_active: 1
        })
        return [{ insertId: insertedId }]
      }

      if (normalizedSql === 'UPDATE products SET barcode = ? WHERE id = ?') {
        const inserted = insertedProducts.get(Number(params[1]))
        if (inserted) inserted.barcode = params[0]
        return [{ affectedRows: 1 }]
      }

      if (normalizedSql === "UPDATE products SET stock_quantity = 0, status = 'sold' WHERE id = ?") {
        const inserted = insertedProducts.get(Number(params[0]))
        if (inserted) {
          inserted.stock_quantity = 0
          inserted.status = 'sold'
        }
        return [{ affectedRows: inserted ? 1 : 0 }]
      }

      if (normalizedSql.startsWith('SELECT id, sku, name, brand, description, category_id, subcategory, price, cost, stock_quantity, low_stock_threshold, size, color, barcode, is_active, product_source, source_breakdown_id, bale_purchase_id, condition_grade FROM products WHERE id = ? LIMIT 1')) {
        const inserted = insertedProducts.get(Number(params[0]))
        return [inserted ? [inserted] : []]
      }

      throw new Error(`Unsupported query in products POST harness: ${normalizedSql}`)
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

  const barcodeMock = {
    normalizeBarcode: (value) => String(value || '').trim().toUpperCase(),
    isBarcodeBlank: (value) => !String(value || '').trim(),
    validateBarcodeFormat: () => true,
    barcodeExists: async () => false,
    getNextSequentialBarcode: async () => {
      barcodeCounter += 1
      return `BAR-T-${String(barcodeCounter).padStart(4, '0')}`
    },
    getNextSequentialSKU: async () => {
      skuCounter += 1
      return `SKU-T-${String(skuCounter).padStart(4, '0')}`
    }
  }

  const stockMock = {
    applyProductStockDelta: async (_conn, payload) => {
      applyStockCalls.push(payload)
      return {
        beforeQuantity: 0,
        afterQuantity: Number(payload.deltaQuantity) || 0
      }
    }
  }

  const scannerSupportMock = {
    normalizeScannedCode: (value) => String(value || '').trim(),
    isScannedCodeValid: () => true
  }

  const scannerSchemaMock = {
    ensureScannerSchema: async () => {}
  }

  const qrMock = {
    generateProductQrImage: async ({ productId }) => ({ publicPath: `/uploads/qr/test-${productId}.png` })
  }

  const productRepositoryMock = {
    findProductByScannedCode: async () => null,
    updateProductQrImagePath: async (_conn, productId, qrPath) => {
      qrUpdateCalls.push({ productId, qrPath })
    }
  }

  const auditMock = {
    logAuditEventSafe: async (_conn, payload) => {
      auditCalls.push(payload)
    }
  }

  const reportsMock = {
    ensureAutomatedReportsSchema: async () => {}
  }

  const manualStockGuardMock = {
    ensureManualProductInsertGuard: async () => {}
  }

  restorers.push(mockModule('../src/database', dbMock))
  restorers.push(mockModule('../src/middleware/authMiddleware', authMock))
  restorers.push(mockModule('../src/utils/barcodeSupport', barcodeMock))
  restorers.push(mockModule('../src/utils/scannerSupport', scannerSupportMock))
  restorers.push(mockModule('../src/services/scannerSchemaService', scannerSchemaMock))
  restorers.push(mockModule('../src/services/qrCodeService', qrMock))
  restorers.push(mockModule('../src/utils/inventoryStock', stockMock))
  restorers.push(mockModule('../src/repositories/productRepository', productRepositoryMock))
  restorers.push(mockModule('../src/utils/auditLog', auditMock))
  restorers.push(mockModule('../src/utils/automatedReports', reportsMock))
  restorers.push(mockModule('../src/services/productManualStockGuardService', manualStockGuardMock))

  const routeModulePath = require.resolve('../src/routes/products')
  delete require.cache[routeModulePath]
  const router = require('../src/routes/products')

  return {
    handler: getFinalRouteHandler(router, '/', 'post'),
    connectionState,
    applyStockCalls,
    qrUpdateCalls,
    auditCalls,
    insertedProducts,
    cleanup() {
      delete require.cache[routeModulePath]
      restorers.reverse().forEach((restore) => restore())
    }
  }
}

test('manual product create stores zero stock and does not write inventory transactions', async (t) => {
  const harness = createProductsPostHarness()
  t.after(() => harness.cleanup())

  const req = {
    auth: { id: 17 },
    body: {
      name: 'Classic Tee',
      brand: 'Daily',
      price: 299.5,
      cost: 125.25,
      low_stock_threshold: 4
    }
  }
  const res = createMockResponse()

  await harness.handler(req, res)

  assert.equal(res.statusCode, 200)
  assert.ok(res.body?.id)
  assert.equal(harness.applyStockCalls.length, 0)

  const insertQuery = harness.connectionState.queries.find((entry) => entry.sql.startsWith('INSERT INTO products'))
  assert.ok(insertQuery)
  assert.equal(insertQuery.params[7], 125.25)
  assert.equal(insertQuery.params[8], 0)
  assert.equal(insertQuery.params[18], 'sold')

  const createdProduct = harness.insertedProducts.get(Number(res.body.id))
  assert.equal(createdProduct?.stock_quantity, 0)
  assert.equal(createdProduct?.product_source, 'manual')
})

test('manual product create rejects positive stock quantity', async (t) => {
  const harness = createProductsPostHarness()
  t.after(() => harness.cleanup())

  const req = {
    auth: { id: 21 },
    body: {
      sku: 'SKU-MANUAL-01',
      name: 'Canvas Tote',
      price: 450,
      cost: 200,
      stock_quantity: 3
    }
  }
  const res = createMockResponse()

  await harness.handler(req, res)

  assert.equal(res.statusCode, 400)
  assert.equal(res.body?.error, 'Manual product creation does not add stock. Use Inventory > Stock In.')
  assert.equal(harness.applyStockCalls.length, 0)
  assert.equal(harness.connectionState.queries.some((entry) => entry.sql.startsWith('INSERT INTO products')), false)
})

test('manual product create requires cost price', async (t) => {
  const harness = createProductsPostHarness()
  t.after(() => harness.cleanup())

  const req = {
    auth: { id: 30 },
    body: {
      sku: 'SKU-MANUAL-02',
      name: 'Linen Polo',
      price: 599
    }
  }
  const res = createMockResponse()

  await harness.handler(req, res)

  assert.equal(res.statusCode, 400)
  assert.equal(res.body?.error, 'Cost price must be greater than 0')
  assert.equal(harness.connectionState.queries.some((entry) => entry.sql.startsWith('INSERT INTO products')), false)
})

test('manual product create blocks similar duplicates and points user to stock in', async (t) => {
  const harness = createProductsPostHarness({
    findSimilarRows: [{
      id: 99,
      sku: 'SKU-EXIST-99',
      name: 'Classic Tee',
      barcode: 'BAR-EXIST-99',
      qr_image_path: '/uploads/qr/existing-99.png',
      stock_quantity: 0
    }]
  })
  t.after(() => harness.cleanup())

  const req = {
    auth: { id: 44 },
    body: {
      name: 'Classic Tee',
      brand: 'Daily',
      price: 299.5,
      cost: 125.25
    }
  }
  const res = createMockResponse()

  await harness.handler(req, res)

  assert.equal(res.statusCode, 409)
  assert.match(String(res.body?.error || ''), /Inventory > Stock In/i)
  assert.equal(harness.connectionState.queries.some((entry) => entry.sql.startsWith('INSERT INTO products')), false)
})

test('bale product create keeps inventory-backed flow and auto-uses bale cost', async (t) => {
  const harness = createProductsPostHarness({
    breakdownRows: [{
      breakdown_id: 7001,
      bale_purchase_id: 900,
      premium_items: 6,
      standard_items: 2,
      cost_per_saleable_item: 37.5,
      breakdown_event_date: '2026-05-20',
      bale_batch_no: 'BALE-900',
      bale_category: null
    }],
    stockedGradeRows: []
  })
  t.after(() => harness.cleanup())

  const req = {
    auth: { id: 55 },
    body: {
      sku: 'SKU-BALE-01',
      name: 'Premium Top',
      price: 180,
      cost: 999,
      stock_quantity: 2,
      product_source: 'bale_breakdown',
      bale_purchase_id: 900,
      condition_grade: 'premium'
    }
  }
  const res = createMockResponse()

  await harness.handler(req, res)

  assert.equal(res.statusCode, 200)
  assert.equal(harness.applyStockCalls.length, 1)
  assert.equal(harness.applyStockCalls[0].deltaQuantity, 2)

  const insertQuery = harness.connectionState.queries.find((entry) => entry.sql.startsWith('INSERT INTO products'))
  assert.ok(insertQuery)
  assert.equal(insertQuery.params[7], 37.5)
  assert.equal(insertQuery.params[8], 0)
  assert.equal(insertQuery.params[15], 900)
})
