const test = require('node:test')
const assert = require('node:assert/strict')

const { backfillScannerAssets } = require('../src/migrations/migrate_scanner')

function createBackfillConnection(products) {
  const state = {
    products: products.map((product) => ({ ...product }))
  }

  return {
    state,
    async query(sql, params = []) {
      const normalizedSql = String(sql).replace(/\s+/g, ' ').trim()

      if (normalizedSql.startsWith('SELECT id, barcode, sku, qr_image_path FROM products')) {
        return [state.products.map((product) => ({ ...product }))]
      }

      if (normalizedSql === 'UPDATE products SET barcode = ? WHERE id = ?') {
        const [barcode, productId] = params
        const product = state.products.find((item) => Number(item.id) === Number(productId))
        if (product) product.barcode = barcode
        return [{ affectedRows: product ? 1 : 0 }]
      }

      throw new Error(`Unsupported backfill query: ${normalizedSql}`)
    }
  }
}

test('backfillScannerAssets only fills missing barcode and QR data', async () => {
  const conn = createBackfillConnection([
    { id: 1, sku: 'SKU-001', barcode: '', qr_image_path: null },
    { id: 2, sku: 'SKU-002', barcode: 'PRD00000002', qr_image_path: null },
    { id: 3, sku: 'SKU-003', barcode: 'PRD00000003', qr_image_path: '/uploads/qr/product-3-prd00000003.png' }
  ])

  const qrUpdates = new Map()
  const result = await backfillScannerAssets(conn, {
    generateBarcode: async () => 'PRD00000001',
    generateQrImage: async ({ productId, code }) => ({
      publicPath: `/uploads/qr/product-${productId}-${String(code).toLowerCase()}.png`
    }),
    persistQrPath: async (_conn, productId, qrPath) => {
      qrUpdates.set(Number(productId), qrPath)
      const product = conn.state.products.find((item) => Number(item.id) === Number(productId))
      if (product) product.qr_image_path = qrPath
    }
  })

  assert.deepEqual(result, {
    barcodeBackfilled: 1,
    qrBackfilled: 2
  })

  assert.equal(conn.state.products[0].barcode, 'PRD00000001')
  assert.equal(conn.state.products[0].qr_image_path, '/uploads/qr/product-1-prd00000001.png')
  assert.equal(conn.state.products[1].barcode, 'PRD00000002')
  assert.equal(conn.state.products[1].qr_image_path, '/uploads/qr/product-2-prd00000002.png')
  assert.equal(conn.state.products[2].barcode, 'PRD00000003')
  assert.equal(conn.state.products[2].qr_image_path, '/uploads/qr/product-3-prd00000003.png')
  assert.equal(qrUpdates.has(3), false)
})
