const test = require('node:test')
const assert = require('node:assert/strict')

const { processSaleReturn, getSaleItems } = require('../src/utils/salesSupport')

function createReturnConnection(overrides = {}) {
  const state = {
    saleStatus: overrides.saleStatus || 'COMPLETED',
    saleItems: (overrides.saleItems || []).map((item) => ({ ...item })),
    saleReturnItems: (overrides.saleReturnItems || []).map((item, index) => ({
      id: item.id || index + 1,
      ...item
    })),
    products: new Map((overrides.products || []).map((product) => [Number(product.id), { ...product }])),
    inventoryTransactions: []
  }

  return {
    state,
    conn: {
      async query(sql, params = []) {
        const normalizedSql = String(sql).replace(/\s+/g, ' ').trim()

        if (normalizedSql === 'SELECT id, sale_id, product_id, qty, unit_price FROM sale_items WHERE sale_id = ? FOR UPDATE') {
          return [state.saleItems.filter((item) => Number(item.sale_id) === Number(params[0]))]
        }

        if (normalizedSql === 'SELECT sale_item_id, SUM(quantity) AS returned_qty FROM sale_return_items WHERE sale_id = ? GROUP BY sale_item_id') {
          const grouped = new Map()
          for (const row of state.saleReturnItems.filter((item) => Number(item.sale_id) === Number(params[0]))) {
            grouped.set(Number(row.sale_item_id), (grouped.get(Number(row.sale_item_id)) || 0) + (Number(row.quantity) || 0))
          }
          return [[...grouped.entries()].map(([sale_item_id, returned_qty]) => ({ sale_item_id, returned_qty }))]
        }

        if (normalizedSql === 'SELECT id, name, stock_quantity FROM products WHERE id = ? FOR UPDATE') {
          const product = state.products.get(Number(params[0]))
          return [[product].filter(Boolean)]
        }

        if (normalizedSql === "UPDATE products SET stock_quantity = ?, status = 'available' WHERE id = ?") {
          const product = state.products.get(Number(params[1]))
          if (product) {
            product.stock_quantity = Number(params[0])
            product.status = 'available'
          }
          return [{ affectedRows: product ? 1 : 0 }]
        }

        if (normalizedSql.startsWith('UPDATE products SET stock_quantity = ? WHERE id = ?')) {
          const product = state.products.get(Number(params[1]))
          if (product) product.stock_quantity = Number(params[0])
          return [{ affectedRows: product ? 1 : 0 }]
        }

        if (normalizedSql.startsWith('UPDATE products SET stock_quantity = ?, status = CASE')) {
          const product = state.products.get(Number(params[3]))
          if (product) {
            product.stock_quantity = Number(params[0])
            product.status = Number(params[1]) <= 0 ? params[2] : (product.status || 'available')
          }
          return [{ affectedRows: product ? 1 : 0 }]
        }

        if (normalizedSql.startsWith("INSERT INTO inventory_transactions (product_id, transaction_type, quantity, user_id, reason, balance_after, reference) VALUES (?, 'RETURN'")) {
          state.inventoryTransactions.push({
            product_id: params[0],
            transaction_type: 'RETURN',
            quantity: params[1],
            reason: params[3],
            balance_after: params[4]
          })
          return [{ insertId: state.inventoryTransactions.length }]
        }

        if (normalizedSql.startsWith("INSERT INTO inventory_transactions (product_id, transaction_type, quantity, user_id, reason, balance_after, reference) VALUES (?, 'OUT'")) {
          state.inventoryTransactions.push({
            product_id: params[0],
            transaction_type: 'OUT',
            quantity: params[1],
            reason: params[3],
            balance_after: params[4]
          })
          return [{ insertId: state.inventoryTransactions.length }]
        }

        if (normalizedSql.startsWith('INSERT INTO sale_return_items (sale_id, sale_item_id, product_id, quantity, unit_price, reason, return_disposition, accounting_reference, processed_by)')) {
          state.saleReturnItems.push({
            id: state.saleReturnItems.length + 1,
            sale_id: Number(params[0]),
            sale_item_id: Number(params[1]),
            product_id: Number(params[2]),
            quantity: Number(params[3]),
            unit_price: Number(params[4]),
            reason: params[5],
            return_disposition: params[6],
            accounting_reference: params[7],
            processed_by: params[8]
          })
          return [{ insertId: state.saleReturnItems.length }]
        }

        if (normalizedSql.startsWith('SELECT COALESCE((SELECT SUM(qty) FROM sale_items WHERE sale_id = ?), 0) AS sold_qty,')) {
          const soldQty = state.saleItems
            .filter((item) => Number(item.sale_id) === Number(params[0]))
            .reduce((sum, item) => sum + (Number(item.qty) || 0), 0)
          const returnedQty = state.saleReturnItems
            .filter((item) => Number(item.sale_id) === Number(params[1]))
            .reduce((sum, item) => sum + (Number(item.quantity) || 0), 0)
          return [[{ sold_qty: soldQty, returned_qty: returnedQty }]]
        }

        if (normalizedSql === 'UPDATE sales SET status = ? WHERE id = ?') {
          state.saleStatus = String(params[0])
          return [{ affectedRows: 1 }]
        }

        if (normalizedSql.includes('FROM sale_items si') && normalizedSql.includes('LEFT JOIN products p ON p.id = si.product_id')) {
          const saleId = Number(params[0])
          const returnedQtyByItem = new Map()
          for (const row of state.saleReturnItems.filter((item) => Number(item.sale_id) === saleId)) {
            returnedQtyByItem.set(Number(row.sale_item_id), (returnedQtyByItem.get(Number(row.sale_item_id)) || 0) + (Number(row.quantity) || 0))
          }

          const rows = state.saleItems
            .filter((item) => Number(item.sale_id) === saleId)
            .map((item) => {
              const product = state.products.get(Number(item.product_id)) || {}
              return {
                ...item,
                product_name: item.product_name_snapshot || product.name || null,
                sku: item.sku_snapshot || product.sku || null,
                brand: item.brand_snapshot || product.brand || null,
                barcode: item.barcode_snapshot || product.barcode || null,
                size: item.size_snapshot || product.size || null,
                color: item.color_snapshot || product.color || null,
                returned_qty: returnedQtyByItem.get(Number(item.id)) || 0
              }
            })
          return [rows]
        }

        throw new Error(`Unsupported sales return query: ${normalizedSql}`)
      }
    }
  }
}

test('partial return keeps the sale completed and reduces available_to_return', async () => {
  const harness = createReturnConnection({
    saleItems: [{ id: 10, sale_id: 1, product_id: 100, qty: 3, unit_price: 100 }],
    products: [{ id: 100, name: 'Floral Dress', stock_quantity: 5, status: 'available' }]
  })
  const sale = { id: 1, receipt_no: 'RCT-001', status: 'COMPLETED' }

  const returned = await processSaleReturn(
    harness.conn,
    sale,
    [{ sale_item_id: 10, quantity: 1 }],
    55,
    'size issue',
    null,
    'RESTOCK'
  )

  const items = await getSaleItems(harness.conn, 1)

  assert.equal(returned.length, 1)
  assert.equal(harness.state.saleStatus, 'COMPLETED')
  assert.equal(items[0].available_to_return, 2)
  assert.equal(harness.state.products.get(100).stock_quantity, 6)
})

test('full refund marks the sale as refunded', async () => {
  const harness = createReturnConnection({
    saleItems: [{ id: 20, sale_id: 2, product_id: 200, qty: 2, unit_price: 150 }],
    products: [{ id: 200, name: 'Jeans', stock_quantity: 1, status: 'available' }]
  })
  const sale = { id: 2, receipt_no: 'RCT-002', status: 'COMPLETED' }

  await processSaleReturn(
    harness.conn,
    sale,
    [{ sale_item_id: 20, quantity: 2 }],
    55,
    'refund',
    null,
    'RESTOCK'
  )

  assert.equal(harness.state.saleStatus, 'REFUNDED')
})

test('return logic rejects over-return quantities', async () => {
  const harness = createReturnConnection({
    saleItems: [{ id: 30, sale_id: 3, product_id: 300, qty: 1, unit_price: 80 }],
    products: [{ id: 300, name: 'Skirt', stock_quantity: 2, status: 'available' }]
  })
  const sale = { id: 3, receipt_no: 'RCT-003', status: 'COMPLETED' }

  await assert.rejects(
    () => processSaleReturn(
      harness.conn,
      sale,
      [{ sale_item_id: 30, quantity: 2 }],
      55,
      'invalid',
      null,
      'RESTOCK'
    ),
    (error) => {
      assert.equal(error?.statusCode, 400)
      assert.match(error?.message || '', /only 1 item\(s\) available/i)
      return true
    }
  )
})

test('return logic rejects sale items from a different receipt', async () => {
  const harness = createReturnConnection({
    saleItems: [{ id: 40, sale_id: 4, product_id: 400, qty: 1, unit_price: 120 }],
    products: [{ id: 400, name: 'Blouse', stock_quantity: 2, status: 'available' }]
  })
  const sale = { id: 4, receipt_no: 'RCT-004', status: 'COMPLETED' }

  await assert.rejects(
    () => processSaleReturn(
      harness.conn,
      sale,
      [{ sale_item_id: 999, quantity: 1 }],
      55,
      'invalid',
      null,
      'RESTOCK'
    ),
    (error) => {
      assert.equal(error?.statusCode, 400)
      assert.match(error?.message || '', /not part of receipt/i)
      return true
    }
  )
})
