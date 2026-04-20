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

function createCustomersSearchHarness() {
  const restorers = []
  const fixtures = [
    { id: 1, customer_code: 'CUST-000001', full_name: 'Ana Reyes', phone: '+639171111111', email: 'ana@example.com' },
    { id: 2, customer_code: 'VIP-000002', full_name: 'Ben Cruz', phone: '+639181234567', email: 'ben@sample.com' }
  ]

  const dbMock = {
    pool: {
      async query(sql, params = []) {
        const normalizedSql = String(sql).replace(/\s+/g, ' ').trim()

        if (normalizedSql.includes('FROM INFORMATION_SCHEMA.COLUMNS')) {
          return [[
            'id',
            'customer_code',
            'full_name',
            'name',
            'phone',
            'email',
            'preferred_contact_method',
            'address_line',
            'address',
            'region_code',
            'region_name',
            'region',
            'province_code',
            'province_name',
            'province',
            'city_code',
            'city_name',
            'city',
            'barangay_code',
            'barangay_name',
            'barangay',
            'postal_code',
            'notes',
            'created_at',
            'updated_at'
          ].map((COLUMN_NAME) => ({ COLUMN_NAME }))]
        }

        if (normalizedSql.startsWith('SHOW INDEX FROM customers')) {
          return [[
            'PRIMARY',
            'idx_customers_customer_code',
            'idx_customers_phone',
            'idx_customers_email',
            'idx_customers_region_code',
            'idx_customers_province_code',
            'idx_customers_city_code',
            'idx_customers_barangay_code'
          ].map((Key_name) => ({ Key_name }))]
        }

        if (
          normalizedSql.startsWith('ALTER TABLE customers')
          || normalizedSql.startsWith('CREATE INDEX')
          || normalizedSql.startsWith('UPDATE customers')
        ) {
          return [{ affectedRows: 0 }]
        }

        if (normalizedSql.includes('FROM customers') && normalizedSql.includes('LIMIT ?')) {
          const q = String(params[0] || '').trim().toLowerCase()
          const limit = Number(params[5]) || 10
          const rows = fixtures
            .filter((customer) => {
              if (!q) return true
              return [
                customer.customer_code,
                customer.full_name,
                customer.phone,
                customer.email
              ].some((value) => String(value || '').toLowerCase().includes(q))
            })
            .slice(0, limit)

          return [rows]
        }

        throw new Error(`Unsupported customers search query: ${normalizedSql}`)
      }
    }
  }

  const authMock = {
    verifyToken: (_req, _res, next) => next(),
    authorize: () => (_req, _res, next) => next()
  }

  restorers.push(mockModule('../src/database', dbMock))
  restorers.push(mockModule('../src/middleware/authMiddleware', authMock))

  const routeModulePath = require.resolve('../src/routes/customers')
  delete require.cache[routeModulePath]
  const router = require('../src/routes/customers')
  const handler = getFinalRouteHandler(router, '/search', 'get')

  return {
    handler,
    cleanup() {
      delete require.cache[routeModulePath]
      restorers.reverse().forEach((restore) => restore())
    }
  }
}

test('customers search matches customer code, name, phone, and email', async (t) => {
  const harness = createCustomersSearchHarness()
  t.after(() => harness.cleanup())

  const checks = [
    ['VIP-000002', 2],
    ['Ana Reyes', 1],
    ['1234567', 2],
    ['ana@example.com', 1]
  ]

  for (const [query, expectedId] of checks) {
    const req = { query: { q: query, limit: '5' } }
    const res = createMockResponse()
    await harness.handler(req, res)

    assert.equal(res.statusCode, 200)
    assert.equal(Array.isArray(res.body), true)
    assert.equal(res.body[0]?.id, expectedId)
  }
})
