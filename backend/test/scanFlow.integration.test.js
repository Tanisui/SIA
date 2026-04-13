const test = require('node:test')
const assert = require('node:assert/strict')

const { normalizeScannedCode } = require('../src/utils/scannerSupport')
const { findProductByScannedCode } = require('../src/repositories/productRepository')
const { createMockConnection } = require('./fixtures/scannerFixtures')

test('scan to lookup integration resolves a product from scanned code', async () => {
  const conn = createMockConnection({
    products: [
      { id: 9, sku: 'SKU-009', barcode: 'PRD00000009', name: 'Floral Dress', price: 1299, stock_quantity: 4 }
    ]
  })

  const scannedCode = normalizeScannedCode('PRD00000009\r\n')
  const product = await findProductByScannedCode(conn, scannedCode)

  assert.equal(product?.id, 9)
  assert.equal(product?.price, 1299)
  assert.equal(product?.stock_quantity, 4)
})
