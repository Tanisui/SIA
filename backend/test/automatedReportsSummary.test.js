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

test('summary counts items added to inventory from bale breakdown saleable items within range', async (t) => {
  const queries = []
  const restorers = []

  restorers.push(mockModule('../src/database', {
    pool: {
      query: async (sql) => {
        const normalizedSql = String(sql)
        queries.push(normalizedSql)

        if (normalizedSql.includes('FROM sale_items si') && normalizedSql.includes('AS total_sales')) {
          return [[{ total_sales: 1400 }]]
        }
        if (normalizedSql.includes('AS bales_purchased')) {
          return [[{ bales_purchased: 2, total_bale_purchases: 30000 }]]
        }
        if (normalizedSql.includes('SUM(x.saleable_items)') && normalizedSql.includes('AS items_added')) {
          return [[{ items_added: 57 }]]
        }
        if (normalizedSql.includes('AS items_sold')) {
          return [[{ items_sold: 50 }]]
        }
        if (normalizedSql.includes('AS damaged_items')) {
          return [[{ damaged_items: 75 }]]
        }
        if (normalizedSql.includes('FROM inventory_adjustments ia')) {
          return [[{ records: 0, total: 0 }]]
        }
        if (normalizedSql.includes('FROM inventory_transactions it')) {
          return [[{ total: 0 }]]
        }
        if (normalizedSql.includes('AS remaining_saleable_items')) {
          return [[{ remaining_saleable_items: 7 }]]
        }

        throw new Error(`Unexpected SQL in test: ${normalizedSql}`)
      }
    }
  }))

  const servicePath = require.resolve('../src/utils/automatedReports')
  delete require.cache[servicePath]
  const { getSummary } = require('../src/utils/automatedReports')

  t.after(() => {
    delete require.cache[servicePath]
    restorers.reverse().forEach((restore) => restore())
  })

  const summary = await getSummary({ from: '2026-04-10', to: '2026-04-20' })

  assert.equal(summary.itemsAddedToInventory, 57)
  assert.equal(summary.itemsSold, 50)
  assert.equal(summary.damagedUnsellableItems, 75)
  assert.equal(summary.remainingSaleableItems, 7)
  assert.equal(summary.totalSales, 1400)
  assert.equal(summary.grossProfit, -28600)
  assert.ok(queries.some((sql) => sql.includes('FROM sale_items si') && sql.includes('JOIN bale_purchases bp ON bp.id = p.bale_purchase_id') && sql.includes('AS total_sales')))
  assert.ok(queries.some((sql) => sql.includes('SUM(x.saleable_items)') && sql.includes('AS items_added')))
})
