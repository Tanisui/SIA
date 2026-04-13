const test = require('node:test')
const assert = require('node:assert/strict')

const { findProductByScannedCode } = require('../src/repositories/productRepository')
const { createMockConnection } = require('./fixtures/scannerFixtures')

test('findProductByScannedCode matches by barcode first', async () => {
  const conn = createMockConnection({
    products: [
      { id: 1, sku: 'SKU-001', barcode: 'BAR-001', name: 'Dress A' }
    ]
  })

  const product = await findProductByScannedCode(conn, '  bar-001\n')
  assert.equal(product?.id, 1)
  assert.equal(product?.name, 'Dress A')
})

test('findProductByScannedCode falls back to SKU when barcode does not match', async () => {
  const conn = createMockConnection({
    products: [
      { id: 3, sku: 'SKU-003', barcode: 'BAR-003', name: 'Dress C' }
    ]
  })

  const product = await findProductByScannedCode(conn, 'sku-003')
  assert.equal(product?.id, 3)
})
