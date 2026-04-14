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

// Get next sequential barcode starting with "BAR" (e.g., BAR000001, BAR000002)
async function getNextSequentialBarcode(conn) {
  try {
    // Get the highest barcode number that starts with "BAR"
    const [rows] = await conn.query(`
      SELECT barcode
      FROM products
      WHERE barcode LIKE 'BAR%'
      ORDER BY 
        CAST(SUBSTRING(barcode, 4, LENGTH(barcode)-3) AS UNSIGNED) DESC
      LIMIT 1
    `)
    
    if (rows.length === 0) {
      return 'BAR000001'
    }
    
    const lastBarcode = rows[0].barcode
    const numPart = parseInt(lastBarcode.substring(3), 10)
    const nextNum = numPart + 1
    return `BAR${String(nextNum).padStart(6, '0')}`
  } catch (err) {
    console.error('Error getting next sequential barcode:', err)
    return 'BAR000001'
  }
}

// Get next sequential SKU (similar to barcode)
async function getNextSequentialSKU(conn) {
  try {
    // Get the highest SKU number that starts with "SKU"
    const [rows] = await conn.query(`
      SELECT sku
      FROM products
      WHERE sku LIKE 'SKU%'
      ORDER BY 
        CAST(SUBSTRING(sku, 4, LENGTH(sku)-3) AS UNSIGNED) DESC
      LIMIT 1
    `)
    
    if (rows.length === 0) {
      return 'SKU000001'
    }
    
    const lastSku = rows[0].sku
    const numPart = parseInt(lastSku.substring(3), 10)
    const nextNum = numPart + 1
    return `SKU${String(nextNum).padStart(6, '0')}`
  } catch (err) {
    console.error('Error getting next sequential SKU:', err)
    return 'SKU000001'
  }
}

module.exports = {
  BARCODE_PATTERN,
  normalizeBarcode,
  isBarcodeBlank,
  validateBarcodeFormat,
  baseBarcodeForProduct,
  barcodeExists,
  generateUniqueBarcodeForProduct,
  getNextSequentialBarcode,
  getNextSequentialSKU
}
