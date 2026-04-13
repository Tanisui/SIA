const db = require('../database')
const { ensureRuntimeConfig } = require('./runtimeConfigService')

let ensureScannerSchemaPromise = null

async function ensureDraftStatusEnum(conn) {
  const [rows] = await conn.query(
    `
      SELECT COLUMN_TYPE AS column_type
      FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = 'sales'
        AND column_name = 'status'
      LIMIT 1
    `
  )

  const columnType = String(rows[0]?.column_type || '')
  if (columnType.includes("'DRAFT'")) return

  await conn.query(
    `
      ALTER TABLE sales
      MODIFY COLUMN status ENUM('DRAFT','COMPLETED','REFUNDED','CANCELLED') DEFAULT 'COMPLETED'
    `
  )
}

async function ensureScannerSchema(conn = db.pool) {
  if (conn === db.pool) {
    if (ensureScannerSchemaPromise) return ensureScannerSchemaPromise
    ensureScannerSchemaPromise = (async () => ensureScannerSchema(await db.pool.getConnection()))()
      .catch((error) => {
        ensureScannerSchemaPromise = null
        throw error
      })
    return ensureScannerSchemaPromise
  }

  let ownsConnection = false
  try {
    if (typeof conn.release === 'function') ownsConnection = true

    await ensureRuntimeConfig(conn)

    await conn.query('ALTER TABLE products ADD COLUMN qr_image_path VARCHAR(255) NULL AFTER barcode').catch(() => {})
    await ensureDraftStatusEnum(conn)

    await conn.query(`
      CREATE TABLE IF NOT EXISTS sale_scan_events (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        sale_id BIGINT UNSIGNED NOT NULL,
        normalized_code VARCHAR(128) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE,
        INDEX idx_sale_scan_events_sale_code_created (sale_id, normalized_code, created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `)
  } finally {
    if (ownsConnection) conn.release()
  }
}

module.exports = {
  ensureScannerSchema
}
