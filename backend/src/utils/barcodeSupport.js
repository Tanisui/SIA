const BARCODE_PATTERN = /^[A-Z0-9._-]{4,64}$/

function normalizeBarcode(value) {
  return String(value || '').trim().toUpperCase()
}

function isBarcodeBlank(value) {
  return normalizeBarcode(value) === ''
}

function validateBarcodeFormat(barcode) {
  return BARCODE_PATTERN.test(String(barcode || ''))
}

function baseBarcodeForProduct(productId) {
  const parsedId = Number(productId)
  if (!Number.isFinite(parsedId) || parsedId <= 0) {
    throw new Error('product id is required to generate barcode')
  }

  return `PRD${String(Math.trunc(parsedId)).padStart(8, '0')}`
}

async function barcodeExists(conn, barcode, excludeProductId = null) {
  const normalizedBarcode = normalizeBarcode(barcode)
  if (!normalizedBarcode) return false

  const params = [normalizedBarcode]
  let sql = `
    SELECT id
    FROM products
    WHERE UPPER(TRIM(barcode)) = ?
  `
  if (excludeProductId) {
    sql += ' AND id <> ?'
    params.push(Number(excludeProductId))
  }
  sql += ' LIMIT 1'

  const [rows] = await conn.query(sql, params)
  return rows.length > 0
}

async function generateUniqueBarcodeForProduct(conn, productId, excludeProductId = null) {
  const base = baseBarcodeForProduct(productId)

  for (let suffix = 0; suffix < 10000; suffix += 1) {
    const candidate = suffix === 0 ? base : `${base}-${suffix}`
    const exists = await barcodeExists(conn, candidate, excludeProductId)
    if (!exists) return candidate
  }

  throw new Error(`failed to generate unique barcode for product ${productId}`)
}

module.exports = {
  BARCODE_PATTERN,
  normalizeBarcode,
  isBarcodeBlank,
  validateBarcodeFormat,
  baseBarcodeForProduct,
  barcodeExists,
  generateUniqueBarcodeForProduct
}
