const test = require('node:test')
const assert = require('node:assert/strict')

const { getSupplierPerformance } = require('../src/utils/automatedReports')

test('supplier performance only aggregates bales purchased within the selected range', () => {
  const range = { from: '2026-04-01', to: '2026-04-30' }
  const rows = [
    {
      supplier_name: 'Boltzmann Trading',
      bale_batch_no: '124-001',
      purchase_date: '2026-04-17',
      total_purchase_cost: 10000,
      saleable_items: 50,
      damaged_items: 5,
      revenue_generated: 27100,
      gross_profit: 17100
    },
    {
      supplier_name: 'Boltzmann Trading',
      bale_batch_no: '123-900',
      purchase_date: '2026-03-10',
      total_purchase_cost: 9000,
      saleable_items: 42,
      damaged_items: 4,
      revenue_generated: 6800,
      gross_profit: -2200
    },
    {
      supplier_name: 'Auto Bale Supplier',
      bale_batch_no: '124-002',
      purchase_date: '2026-04-10',
      total_purchase_cost: 8000,
      saleable_items: 28,
      damaged_items: 2,
      revenue_generated: 7200,
      gross_profit: -800
    }
  ]

  const result = getSupplierPerformance(rows, range)

  assert.deepEqual(result, [
    {
      supplier_name: 'Boltzmann Trading',
      number_of_bales_purchased: 1,
      average_bale_cost: 10000,
      average_saleable_items: 50,
      average_damaged_items: 5,
      total_revenue_generated: 27100,
      estimated_gross_profit: 17100,
      best_performing_bale: '124-001'
    },
    {
      supplier_name: 'Auto Bale Supplier',
      number_of_bales_purchased: 1,
      average_bale_cost: 8000,
      average_saleable_items: 28,
      average_damaged_items: 2,
      total_revenue_generated: 7200,
      estimated_gross_profit: -800,
      best_performing_bale: '124-002'
    }
  ])
})

test('supplier performance hides suppliers that only have out-of-range sales from older bales', () => {
  const range = { from: '2026-04-01', to: '2026-04-30' }
  const rows = [
    {
      supplier_name: 'Legacy Supplier',
      bale_batch_no: '122-001',
      purchase_date: '2026-02-12',
      total_purchase_cost: 9500,
      saleable_items: 41,
      damaged_items: 3,
      revenue_generated: 5000,
      gross_profit: -4500
    }
  ]

  const result = getSupplierPerformance(rows, range)

  assert.deepEqual(result, [])
})

test('supplier performance keeps in-range bales when purchase_date is returned as a Date object', () => {
  const range = { from: '2026-04-01', to: '2026-04-30' }
  const rows = [
    {
      supplier_name: 'Date Object Supplier',
      bale_batch_no: '124-003',
      purchase_date: new Date('2026-04-12T00:00:00'),
      total_purchase_cost: 12000,
      saleable_items: 60,
      damaged_items: 6,
      revenue_generated: 1500,
      gross_profit: -10500
    }
  ]

  const result = getSupplierPerformance(rows, range)

  assert.deepEqual(result, [
    {
      supplier_name: 'Date Object Supplier',
      number_of_bales_purchased: 1,
      average_bale_cost: 12000,
      average_saleable_items: 60,
      average_damaged_items: 6,
      total_revenue_generated: 1500,
      estimated_gross_profit: -10500,
      best_performing_bale: '124-003'
    }
  ])
})
