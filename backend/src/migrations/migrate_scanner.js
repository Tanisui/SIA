require('dotenv').config()

const { generateProductQrImage } = require('../services/qrCodeService')
const { updateProductQrImagePath } = require('../repositories/productRepository')
const {
  generateUniqueBarcodeForProduct,
  isBarcodeBlank,
  normalizeBarcode
} = require('../utils/barcodeSupport')

async function backfillScannerAssets(conn, dependencies = {}) {
  const generateBarcode = dependencies.generateBarcode || generateUniqueBarcodeForProduct
  const generateQrImage = dependencies.generateQrImage || generateProductQrImage
  const persistQrPath = dependencies.persistQrPath || updateProductQrImagePath

  const [rows] = await conn.query(`
    SELECT id, barcode, sku, qr_image_path
    FROM products
    ORDER BY id ASC
  `)

  let barcodeBackfilled = 0
  let qrBackfilled = 0

  for (const row of rows) {
    let nextBarcode = normalizeBarcode(row.barcode)
    let barcodeWasGenerated = false

    if (isBarcodeBlank(nextBarcode)) {
      nextBarcode = await generateBarcode(conn, row.id, row.id)
      await conn.query(
        'UPDATE products SET barcode = ? WHERE id = ?',
        [nextBarcode, row.id]
      )
      barcodeWasGenerated = true
      barcodeBackfilled += 1
    }

    if (barcodeWasGenerated || !String(row.qr_image_path || '').trim()) {
      const qrAsset = await generateQrImage({
        productId: row.id,
        code: nextBarcode || row.sku
      })
      await persistQrPath(conn, row.id, qrAsset.publicPath)
      qrBackfilled += 1
    }
  }

  return {
    barcodeBackfilled,
    qrBackfilled
  }
}

async function migrate() {
  const db = require('../database')
  const { ensureSalesSchema } = require('../utils/salesSupport')
  const { ensureScannerSchema } = require('../services/scannerSchemaService')

  await ensureSalesSchema()
  const conn = await db.pool.getConnection()

  try {
    await ensureScannerSchema(conn)
    const result = await backfillScannerAssets(conn)
    console.log(
      `Scanner migration complete. Backfilled ${result.barcodeBackfilled} barcode(s) and ${result.qrBackfilled} QR image(s).`
    )
    return result
  } finally {
    conn.release()
  }
}

if (require.main === module) {
  migrate()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('Scanner migration failed:', error)
      process.exit(1)
    })
}

module.exports = {
  backfillScannerAssets,
  migrate
}
