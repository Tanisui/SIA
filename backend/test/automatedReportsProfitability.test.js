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

test('bale profitability does not label a loss-making bale as the best performer', async (t) => {
  const queries = []
  const restorers = []

  restorers.push(mockModule('../src/database', {
    pool: {
      query: async (sql) => {
        const normalizedSql = String(sql)
        queries.push(normalizedSql)

        if (normalizedSql.includes('FROM bale_purchases bp') && normalizedSql.includes('AS revenue_generated')) {
          return [[
            {
              bale_purchase_id: 1,
              bale_batch_no: '123-123',
              purchase_date: '2026-04-17',
              supplier_name: 'Auto Bale Supplier',
              bale_type: 'Dresses',
              total_purchase_cost: 15000,
              revenue_generated: 0,
              sold_pieces: 0,
              remaining_pieces: 0,
              saleable_items: 150,
              damaged_items: 50
            },
            {
              bale_purchase_id: 2,
              bale_batch_no: '123-124',
              purchase_date: '2026-04-17',
              supplier_name: 'Boltzmann Trading',
              bale_type: 'Dresses',
              total_purchase_cost: 15000,
              revenue_generated: 1400,
              sold_pieces: 2,
              remaining_pieces: 7,
              saleable_items: 125,
              damaged_items: 25
            }
          ]]
        }

        throw new Error(`Unexpected SQL in test: ${normalizedSql}`)
      }
    }
  }))

  const servicePath = require.resolve('../src/utils/automatedReports')
  delete require.cache[servicePath]
  const { getBaleProfitability } = require('../src/utils/automatedReports')

  t.after(() => {
    delete require.cache[servicePath]
    restorers.reverse().forEach((restore) => restore())
  })

  const result = await getBaleProfitability({ from: '2026-04-10', to: '2026-04-20' })

  assert.equal(result.rows.length, 2)
  assert.equal(result.rows[0].gross_profit, -15000)
  assert.equal(result.rows[1].gross_profit, -13600)
  assert.equal(result.highlights.best_performing_bale, null)
  assert.deepEqual(result.highlights.worst_performing_bale, {
    bale_batch_no: '123-123',
    gross_profit: -15000,
    supplier_name: 'Auto Bale Supplier'
  })
  assert.ok(queries.some((sql) => sql.includes('WHERE (bp.purchase_date >= ? AND bp.purchase_date < DATE_ADD(?, INTERVAL 1 DAY))')))
  assert.ok(queries.every((sql) => !sql.includes('OR sales_data.bale_purchase_id IS NOT NULL')))
})
