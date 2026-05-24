const db = require('../database')

const MANUAL_PRODUCT_ZERO_STOCK_TRIGGER_NAME = 'products_before_insert_manual_zero_stock'

let ensureManualProductInsertGuardPromise = null

async function ensureManualProductInsertGuard(conn = db.pool) {
  if (conn === db.pool) {
    if (ensureManualProductInsertGuardPromise) return ensureManualProductInsertGuardPromise
    ensureManualProductInsertGuardPromise = (async () => ensureManualProductInsertGuard(await db.pool.getConnection()))()
      .catch((error) => {
        ensureManualProductInsertGuardPromise = null
        throw error
      })
    return ensureManualProductInsertGuardPromise
  }

  let ownsConnection = false
  try {
    if (typeof conn.release === 'function') ownsConnection = true

    const [rows] = await conn.query(`
      SELECT TRIGGER_NAME
      FROM information_schema.TRIGGERS
      WHERE TRIGGER_SCHEMA = DATABASE()
        AND TRIGGER_NAME = ?
      LIMIT 1
    `, [MANUAL_PRODUCT_ZERO_STOCK_TRIGGER_NAME])

    if (rows.length) return

    await conn.query(`
      CREATE TRIGGER ${MANUAL_PRODUCT_ZERO_STOCK_TRIGGER_NAME}
      BEFORE INSERT ON products
      FOR EACH ROW
      SET
        NEW.stock_quantity = CASE
          WHEN COALESCE(NULLIF(LOWER(TRIM(NEW.product_source)), ''), 'manual') = 'manual'
            THEN 0
          ELSE COALESCE(NEW.stock_quantity, 0)
        END,
        NEW.status = CASE
          WHEN COALESCE(NULLIF(LOWER(TRIM(NEW.product_source)), ''), 'manual') = 'manual'
            THEN 'sold'
          WHEN COALESCE(NULLIF(TRIM(NEW.status), ''), '') <> ''
            THEN NEW.status
          WHEN COALESCE(NEW.stock_quantity, 0) > 0
            THEN 'available'
          ELSE 'sold'
        END
    `)
  } finally {
    if (ownsConnection) conn.release()
  }
}

module.exports = {
  ensureManualProductInsertGuard,
  MANUAL_PRODUCT_ZERO_STOCK_TRIGGER_NAME
}
