const db = require('./src/database')
const {
  normalizeBarcode,
  validateBarcodeFormat,
  generateUniqueBarcodeForProduct
} = require('./src/utils/barcodeSupport')

async function ensureBarcodeUniqueIndex() {
  const [indexRows] = await db.pool.query(
    `
      SELECT 1
      FROM information_schema.statistics
      WHERE table_schema = DATABASE()
        AND table_name = 'products'
        AND index_name = 'ux_products_barcode'
      LIMIT 1
    `
  )

  if (indexRows.length) {
    console.log('Barcode unique index already exists')
    return
  }

  await db.pool.query('ALTER TABLE products ADD UNIQUE INDEX ux_products_barcode (barcode)')
  console.log('Added unique index ux_products_barcode')
}

async function normalizeAndBackfillBarcodes() {
  await db.pool.query(`
    UPDATE products
    SET barcode = UPPER(TRIM(barcode))
    WHERE barcode IS NOT NULL
  `)
  console.log('Normalized existing product barcodes')

  const [missingRows] = await db.pool.query(`
    SELECT id
    FROM products
    WHERE barcode IS NULL OR TRIM(barcode) = ''
    ORDER BY id ASC
  `)

  for (const row of missingRows) {
    const generatedBarcode = await generateUniqueBarcodeForProduct(db.pool, row.id, row.id)
    await db.pool.query(
      'UPDATE products SET barcode = ? WHERE id = ?',
      [generatedBarcode, row.id]
    )
  }
  console.log(`Backfilled barcodes for ${missingRows.length} product(s)`)
}

async function assertBarcodeFormatIsValid() {
  const [rows] = await db.pool.query(`
    SELECT id, barcode
    FROM products
    WHERE barcode IS NOT NULL AND TRIM(barcode) <> ''
    ORDER BY id ASC
  `)

  const invalidRows = rows.filter((row) => !validateBarcodeFormat(normalizeBarcode(row.barcode)))
  if (!invalidRows.length) return

  console.error('\nInvalid barcode format detected. Fix these rows manually first:')
  for (const row of invalidRows) {
    console.error(`  - Product #${row.id}: "${row.barcode}"`)
  }

  throw new Error('migration blocked due to invalid barcode format')
}

async function assertBarcodeDuplicatesAreResolved() {
  const [duplicates] = await db.pool.query(`
    SELECT
      UPPER(TRIM(barcode)) AS barcode_normalized,
      COUNT(*) AS duplicate_count,
      GROUP_CONCAT(id ORDER BY id ASC) AS product_ids
    FROM products
    WHERE barcode IS NOT NULL AND TRIM(barcode) <> ''
    GROUP BY UPPER(TRIM(barcode))
    HAVING COUNT(*) > 1
    ORDER BY duplicate_count DESC, barcode_normalized ASC
  `)

  if (!duplicates.length) return

  console.error('\nDuplicate barcodes detected. Fix these rows manually before re-running migration:')
  for (const row of duplicates) {
    console.error(
      `  - ${row.barcode_normalized}: ${row.duplicate_count} products (IDs: ${row.product_ids})`
    )
  }

  throw new Error('migration blocked due to duplicate product barcodes')
}

(async () => {
  try {
    // Add low_stock_threshold column to products if not exists
    try {
      await db.pool.query('ALTER TABLE products ADD COLUMN low_stock_threshold INT DEFAULT 10 AFTER stock_quantity')
      console.log('Added low_stock_threshold column')
    } catch (e) {
      if (e.code === 'ER_DUP_FIELDNAME') console.log('low_stock_threshold column already exists')
      else console.log('low_stock_threshold error:', e.message)
    }

    // Add is_active column to products if not exists
    try {
      await db.pool.query('ALTER TABLE products ADD COLUMN is_active TINYINT(1) DEFAULT 1 AFTER images')
      console.log('Added is_active column to products')
    } catch (e) {
      if (e.code === 'ER_DUP_FIELDNAME') console.log('is_active column already exists in products')
      else console.log('is_active error:', e.message)
    }

    // Ensure barcode column exists for older databases
    try {
      await db.pool.query('ALTER TABLE products ADD COLUMN barcode VARCHAR(128) NULL AFTER color')
      console.log('Added barcode column to products')
    } catch (e) {
      if (e.code === 'ER_DUP_FIELDNAME') console.log('barcode column already exists in products')
      else console.log('barcode column error:', e.message)
    }

    // Create damaged_inventory table
    await db.pool.query(`
      CREATE TABLE IF NOT EXISTS damaged_inventory (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        product_id BIGINT UNSIGNED NOT NULL,
        quantity INT NOT NULL,
        reason TEXT,
        reported_by BIGINT UNSIGNED,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
        FOREIGN KEY (reported_by) REFERENCES users(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `)
    console.log('Created/verified damaged_inventory table')

    await normalizeAndBackfillBarcodes()
    await assertBarcodeFormatIsValid()
    await assertBarcodeDuplicatesAreResolved()
    await ensureBarcodeUniqueIndex()

    console.log('\nMigration complete!')
    process.exit(0)
  } catch (err) {
    console.error('\nMigration error:', err.message || err)
    process.exit(1)
  }
})()
