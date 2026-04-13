const { normalizeScannedCode } = require('../utils/scannerSupport')

async function findProductByScannedCode(conn, rawCode) {
  const normalizedCode = normalizeScannedCode(rawCode)
  if (!normalizedCode) return null

  const [rows] = await conn.query(
    `
      SELECT *
      FROM products
      WHERE is_active = 1
        AND (
          UPPER(TRIM(barcode)) = ?
          OR UPPER(TRIM(sku)) = ?
        )
      ORDER BY CASE WHEN UPPER(TRIM(barcode)) = ? THEN 0 ELSE 1 END, id ASC
      LIMIT 1
    `,
    [normalizedCode, normalizedCode, normalizedCode]
  )

  return rows[0] || null
}

async function findProductByIdForUpdate(conn, productId) {
  const [rows] = await conn.query(
    `
      SELECT *
      FROM products
      WHERE id = ?
      LIMIT 1
      FOR UPDATE
    `,
    [Number(productId)]
  )
  return rows[0] || null
}

async function updateProductQrImagePath(conn, productId, qrImagePath) {
  await conn.query(
    'UPDATE products SET qr_image_path = ? WHERE id = ?',
    [qrImagePath || null, Number(productId)]
  )
}

module.exports = {
  findProductByScannedCode,
  findProductByIdForUpdate,
  updateProductQrImagePath
}
