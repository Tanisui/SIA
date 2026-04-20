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

function createCheckoutHarness() {
  const restorers = []
  let docCounter = 0

  const state = {
    sale: {
      id: 41,
      status: 'DRAFT',
      customer_id: 7,
      customer_code: 'CUST-000007',
      customer_name_snapshot: 'Maria Santos',
      customer_phone_snapshot: '+639171234567',
      customer_email_snapshot: 'maria@example.com',
      order_note: null,
      subtotal: 0,
      vatable_sales: 0,
      vat_amount: 0,
      tax_calculation_method: null,
      tax: 0,
      discount: 0,
      total: 0,
      payment_method: null,
      receipt_no: null,
      sale_number: 'DRF-TEST-0041'
    },
    paymentRows: [],
    draftInventoryApplied: false
  }

  const conn = {
    async beginTransaction() {},
    async commit() {},
    async rollback() {},
    release() {},
    async query(sql, params = []) {
      const normalizedSql = String(sql).replace(/\s+/g, ' ').trim()

      if (normalizedSql.startsWith('UPDATE sales SET sale_number = ?,')) {
        state.sale.sale_number = params[0]
        state.sale.clerk_id = params[1]
        state.sale.customer_id = params[2]
        state.sale.customer_name_snapshot = params[3]
        state.sale.customer_phone_snapshot = params[4]
        state.sale.customer_email_snapshot = params[5]
        state.sale.order_note = params[6]
        state.sale.subtotal = params[7]
        state.sale.vatable_sales = params[8]
        state.sale.vat_amount = params[9]
        state.sale.tax_calculation_method = params[10]
        state.sale.tax = params[11]
        state.sale.discount = params[12]
        state.sale.total = params[13]
        state.sale.payment_method = params[14]
        state.sale.receipt_no = params[15]
        state.sale.status = 'COMPLETED'
        return [{ affectedRows: 1 }]
      }

      if (normalizedSql.startsWith('INSERT INTO sales_payments')) {
        state.paymentRows.push({
          sale_id: params[0],
          amount_received: params[1],
          change_amount: params[2],
          payment_method: params[3]
        })
        return [{ insertId: 901 }]
      }

      throw new Error(`Unsupported checkout query: ${normalizedSql}`)
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

  const salesSupportMock = {
    PAYMENT_METHODS: ['cash'],
    WALK_IN_CUSTOMER_LABEL: 'Walk-in Customer',
    roundMoney: (value) => Math.round((Number(value) || 0) * 100) / 100,
    normalizeDiscountPercentage: (value) => Math.max(0, Math.min(Number(value) || 0, 100)),
    calculateSaleTaxBreakdown: (totalAmount, taxRateValue) => {
      const total = Math.round((Number(totalAmount) || 0) * 100) / 100
      const normalizedTaxRate = Number(taxRateValue) || 0
      const vatableSales = Math.round((total / (1 + normalizedTaxRate)) * 100) / 100
      const vatAmount = Math.round((total - vatableSales) * 100) / 100

      return {
        total,
        vatableSales,
        vatAmount,
        nonVatSales: 0,
        taxRate: normalizedTaxRate,
        taxRatePercentage: Math.round(normalizedTaxRate * 10000) / 100,
        taxCalculationMethod: 'INCLUSIVE',
        invoiceType: 'VAT Invoice'
      }
    },
    ensureSalesSchema: async () => {},
    buildDateFilter: () => '',
    enrichSaleRecord: (row) => row,
    generateDocumentNumber: async (_conn, _tableName, columnName, prefix) => {
      docCounter += 1
      return `${prefix}-TEST-${String(docCounter).padStart(4, '0')}${columnName === 'receipt_no' ? '-RCT' : ''}`
    },
    prepareSaleItems: async () => {
      throw new Error('prepareSaleItems should not be called for draft checkout in this test')
    },
    applySaleInventoryChanges: async () => {},
    getSaleItems: async () => [],
    getSaleById: async () => ({
      ...state.sale,
      customer_name: state.sale.customer_name_snapshot,
      customer_phone: state.sale.customer_phone_snapshot,
      customer_email: state.sale.customer_email_snapshot,
      amount_received: state.paymentRows[0]?.amount_received || 0,
      change_amount: state.paymentRows[0]?.change_amount || 0,
      items: [
        {
          id: 1,
          product_id: 99,
          qty: 2,
          unit_price: 200,
          line_total: 400,
          product_name: 'Blue Dress'
        }
      ]
    }),
    getSaleByReceipt: async () => null,
    processSaleReturn: async () => []
  }

  const runtimeConfigMock = {
    getRuntimeConfig: async () => ({
      currency: 'PHP',
      taxRate: 0.12,
      scannerDebounceMs: 250
    })
  }

  const scannerSchemaMock = {
    ensureScannerSchema: async () => {}
  }

  const auditMock = {
    logAuditEventSafe: async () => {}
  }

  const draftSaleServiceMock = {
    ensureDraftSale: async () => null,
    getLockedDraftSale: async () => null,
    addDraftSaleItem: async () => null,
    updateDraftSaleItem: async () => null,
    removeDraftSaleItem: async () => null,
    updateDraftSaleCustomer: async () => null,
    findRecentScanEvent: async () => null,
    recordScanEvent: async () => null,
    prepareDraftSaleForCheckout: async () => ({
      sale: { ...state.sale },
      processedItems: [
        {
          draft_item_id: 1,
          product_id: 99,
          quantity: 2,
          unit_price: 200,
          line_total: 400,
          product_name: 'Blue Dress'
        }
      ],
      subtotal: 400,
      productRows: new Map([[99, { id: 99, stock_quantity: 5, price: 200 }]])
    }),
    applyDraftSaleInventoryChanges: async () => {
      state.draftInventoryApplied = true
    }
  }

  restorers.push(mockModule('../src/database', dbMock))
  restorers.push(mockModule('../src/middleware/authMiddleware', authMock))
  restorers.push(mockModule('../src/utils/salesSupport', salesSupportMock))
  restorers.push(mockModule('../src/services/runtimeConfigService', runtimeConfigMock))
  restorers.push(mockModule('../src/services/scannerSchemaService', scannerSchemaMock))
  restorers.push(mockModule('../src/utils/auditLog', auditMock))
  restorers.push(mockModule('../src/services/draftSaleService', draftSaleServiceMock))

  const routeModulePath = require.resolve('../src/routes/sales')
  delete require.cache[routeModulePath]
  const router = require('../src/routes/sales')
  const handler = getFinalRouteHandler(router, '/', 'post')

  return {
    handler,
    state,
    cleanup() {
      delete require.cache[routeModulePath]
      restorers.reverse().forEach((restore) => restore())
    }
  }
}

test('draft checkout preserves customer snapshots on the finalized sale', async (t) => {
  const harness = createCheckoutHarness()
  t.after(() => harness.cleanup())

  const req = {
    auth: { id: 88, permissions: ['sales.create', 'sales.view'] },
    body: {
      draft_sale_id: 41,
      payment_method: 'cash',
      payment_amount: 500,
      order_note: 'VIP sale'
    }
  }
  const res = createMockResponse()

  await harness.handler(req, res)

  assert.equal(res.statusCode, 200)
  assert.equal(res.body.customer_id, 7)
  assert.equal(res.body.customer_name_snapshot, 'Maria Santos')
  assert.equal(res.body.customer_phone_snapshot, '+639171234567')
  assert.equal(res.body.customer_email_snapshot, 'maria@example.com')
  assert.equal(res.body.vatable_sales, 357.14)
  assert.equal(res.body.vat_amount, 42.86)
  assert.equal(res.body.tax_calculation_method, 'INCLUSIVE')
  assert.equal(harness.state.sale.status, 'COMPLETED')
  assert.equal(harness.state.draftInventoryApplied, true)
})
