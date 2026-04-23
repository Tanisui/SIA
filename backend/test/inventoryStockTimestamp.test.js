const test = require('node:test')
const assert = require('node:assert/strict')

const { resolveStockTransactionTimestamp } = require('../src/utils/inventoryStock')

test('date-only stock transaction timestamps keep the selected date and include a real time', () => {
  const timestamp = resolveStockTransactionTimestamp('2026-04-22')

  assert.match(timestamp, /^2026-04-22 \d{2}:\d{2}:\d{2}$/)
  assert.notEqual(timestamp, '2026-04-22 00:00:00')
})

test('local stock transaction datetime strings are stored as local MySQL timestamps', () => {
  assert.equal(
    resolveStockTransactionTimestamp('2026-04-22 14:05:06'),
    '2026-04-22 14:05:06'
  )
})

test('invalid stock transaction dates are rejected', () => {
  assert.throws(
    () => resolveStockTransactionTimestamp('2026-02-31'),
    /created_at must be a valid date/
  )
})
