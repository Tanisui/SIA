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

function createReturnRouteHarness(options = {}) {
  const restorers = []
  const state = {
    purchase: options.purchase || {
      id: 10,
      supplier_id: 5,
      supplier_name: 'Test Supplier',
      bale_batch_no: 'BALE-10',
      quantity_ordered: 8,
      quantity_received: 5,
      po_status: 'COMPLETED'
    },
    supplier: options.supplier || { id: 5, name: 'Test Supplier' },
    existingReturnedQuantity: Number(options.existingReturnedQuantity || 0),
    nextReturnId: 100,
    returnHeader: null,
    returnItems: [],
    inventoryAdjustments: [],
    beginCount: 0,
    commitCount: 0,
    rollbackCount: 0,
    releaseCount: 0,
    auditCalls: []
  }

  const conn = {
    async beginTransaction() {
      state.beginCount += 1
    },
    async commit() {
      state.commitCount += 1
    },
    async rollback() {
      state.rollbackCount += 1
    },
    release() {
      state.releaseCount += 1
    },
    async query(sql, params = []) {
      const normalizedSql = String(sql).replace(/\s+/g, ' ').trim()

      if (normalizedSql.includes('FROM bale_purchases') && normalizedSql.includes('FOR UPDATE')) {
        return [[state.purchase].filter(Boolean)]
      }

      if (normalizedSql === 'SELECT id, name FROM suppliers WHERE id = ? LIMIT 1') {
        if (Number(params[0]) !== Number(state.supplier?.id)) return [[]]
        return [[state.supplier]]
      }

      if (normalizedSql.startsWith('SELECT COALESCE(SUM(bsri.quantity), 0) AS returned_quantity FROM bale_supplier_returns')) {
        return [[{ returned_quantity: state.existingReturnedQuantity }]]
      }

      if (normalizedSql.startsWith('INSERT INTO bale_supplier_returns')) {
        state.nextReturnId += 1
        state.returnHeader = {
          id: state.nextReturnId,
          supplier_id: params[0],
          supplier_name: params[1],
          bale_purchase_id: params[2],
          return_date: params[3],
          notes: params[4],
          processed_by: params[5]
        }
        return [{ insertId: state.nextReturnId }]
      }

      if (normalizedSql.startsWith('INSERT INTO bale_supplier_return_items')) {
        state.returnItems.push({
          return_id: params[0],
          quantity: Number(params[1]),
          reason: params[2]
        })
        return [{ insertId: state.returnItems.length }]
      }

      if (normalizedSql.startsWith('INSERT INTO inventory_adjustments')) {
        state.inventoryAdjustments.push({
          bale_purchase_id: params[0],
          adjustment_type: params[1],
          quantity: Number(params[2]),
          reason: params[3],
          adjustment_date: params[4]
        })
        return [{ insertId: state.inventoryAdjustments.length }]
      }

      throw new Error(`Unsupported return route conn query: ${normalizedSql}`)
    }
  }

  const dbMock = {
    pool: {
      async getConnection() {
        return conn
      },
      async query(sql, params = []) {
        const normalizedSql = String(sql).replace(/\s+/g, ' ').trim()

        if (normalizedSql.includes('FROM bale_purchases bp') && normalizedSql.includes('returnable_quantity')) {
          const returned = state.existingReturnedQuantity + state.returnItems.reduce((sum, item) => sum + item.quantity, 0)
          return [[{
            ...state.purchase,
            returned_quantity: returned,
            returnable_quantity: Math.max(Number(state.purchase.quantity_received || 0) - returned, 0)
          }]]
        }

        if (normalizedSql.includes('FROM bale_supplier_returns bsr') && normalizedSql.includes('GROUP BY')) {
          if (!state.returnHeader) return [[]]
          return [[{
            ...state.returnHeader,
            bale_batch_no: state.purchase.bale_batch_no,
            purchase_date: '2026-04-01',
            quantity_ordered: state.purchase.quantity_ordered,
            quantity_received: state.purchase.quantity_received,
            po_status: state.purchase.po_status,
            total_returned_quantity: state.returnItems.reduce((sum, item) => sum + item.quantity, 0),
            item_count: state.returnItems.length
          }]]
        }

        if (normalizedSql.startsWith('SELECT id, return_id, quantity, reason, created_at FROM bale_supplier_return_items')) {
          return [state.returnItems.map((item, index) => ({
            id: index + 1,
            return_id: item.return_id,
            quantity: item.quantity,
            reason: item.reason,
            created_at: '2026-04-21'
          }))]
        }

        throw new Error(`Unsupported return route pool query: ${normalizedSql}`)
      }
    }
  }

  const authMock = {
    verifyToken: (_req, _res, next) => next(),
    authorize: () => (_req, _res, next) => next()
  }

  const reportsMock = {
    ensureAutomatedReportsSchema: async () => {}
  }

  const auditMock = {
    logAuditEventSafe: async (_pool, payload) => {
      state.auditCalls.push(payload)
    }
  }

  restorers.push(mockModule('../src/database', dbMock))
  restorers.push(mockModule('../src/middleware/authMiddleware', authMock))
  restorers.push(mockModule('../src/utils/automatedReports', reportsMock))
  restorers.push(mockModule('../src/utils/auditLog', auditMock))

  const routeModulePath = require.resolve('../src/routes/balePurchases')
  delete require.cache[routeModulePath]
  const router = require('../src/routes/balePurchases')

  return {
    handler: getFinalRouteHandler(router, '/returns', 'post'),
    state,
    cleanup() {
      delete require.cache[routeModulePath]
      restorers.reverse().forEach((restore) => restore())
    }
  }
}

test('supplier return creates return rows and a negative inventory adjustment', async (t) => {
  const harness = createReturnRouteHarness({ existingReturnedQuantity: 1 })
  t.after(() => harness.cleanup())

  const req = {
    auth: { id: 44 },
    body: {
      supplier_id: 5,
      bale_purchase_id: 10,
      return_date: '2026-04-21',
      items: [
        { quantity: 2, reason: 'Damaged bale' },
        { quantity: 1, reason: 'Wrong bale type' }
      ],
      notes: 'Supplier approved replacement'
    }
  }
  const res = createMockResponse()

  await harness.handler(req, res)

  assert.equal(res.statusCode, 200)
  assert.equal(res.body?.success, true)
  assert.equal(harness.state.commitCount, 1)
  assert.equal(harness.state.rollbackCount, 0)
  assert.equal(harness.state.returnItems.length, 2)
  assert.deepEqual(harness.state.inventoryAdjustments[0], {
    bale_purchase_id: 10,
    adjustment_type: 'correction',
    quantity: -3,
    reason: 'Returned 3 bale(s) to supplier Test Supplier',
    adjustment_date: '2026-04-21'
  })
  assert.equal(res.body?.purchase_order?.returnable_quantity, 1)
  assert.equal(harness.state.auditCalls[0]?.action, 'BALE_SUPPLIER_RETURN_CREATED')
})

test('supplier return rejects quantities above received minus previous returns', async (t) => {
  const harness = createReturnRouteHarness({ existingReturnedQuantity: 4 })
  t.after(() => harness.cleanup())

  const req = {
    auth: { id: 45 },
    body: {
      supplier_id: 5,
      bale_purchase_id: 10,
      return_date: '2026-04-21',
      items: [{ quantity: 2, reason: 'Damaged bale' }]
    }
  }
  const res = createMockResponse()

  await harness.handler(req, res)

  assert.equal(res.statusCode, 400)
  assert.match(res.body?.error || '', /cannot exceed available received bales \(1\)/i)
  assert.equal(harness.state.commitCount, 0)
  assert.equal(harness.state.rollbackCount, 1)
  assert.equal(harness.state.returnItems.length, 0)
  assert.equal(harness.state.inventoryAdjustments.length, 0)
})
