const db = require('../database')
const { roundMoney } = require('./salesSupport')

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const ADJUSTMENT_TYPES = ['damaged', 'unsellable', 'shrinkage']

let ensureAutomatedReportsSchemaPromise = null

function toNumber(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function formatDateOnly(date) {
  return date.toISOString().slice(0, 10)
}

function shiftDate(dateOnly, days) {
  const base = new Date(`${dateOnly}T00:00:00.000Z`)
  base.setUTCDate(base.getUTCDate() + Number(days || 0))
  return formatDateOnly(base)
}

function toLocalDateOnly(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function createValidationError(message) {
  const err = new Error(message)
  err.statusCode = 400
  return err
}

function parseDateOnly(value, label) {
  if (!value) return null
  const normalized = String(value).trim()
  if (!DATE_PATTERN.test(normalized)) {
    throw createValidationError(`${label} must use YYYY-MM-DD format`)
  }

  const parsed = new Date(`${normalized}T00:00:00.000Z`)
  if (Number.isNaN(parsed.getTime())) {
    throw createValidationError(`${label} is not a valid date`)
  }

  return normalized
}

function normalizeDateRange(fromInput, toInput) {
  const today = formatDateOnly(new Date())
  let from = parseDateOnly(fromInput, 'from')
  let to = parseDateOnly(toInput, 'to')

  if (!from && !to) {
    to = today
    from = shiftDate(today, -29)
  } else if (from && !to) {
    to = today
  } else if (!from && to) {
    from = shiftDate(to, -29)
  }

  if (from > to) {
    throw createValidationError('from must be earlier than or equal to to')
  }

  return { from, to }
}

function buildDateRangeClause(alias, column, range, params) {
  let clause = ''
  if (range.from) {
    clause += ` AND ${alias}.${column} >= ?`
    params.push(range.from)
  }
  if (range.to) {
    clause += ` AND ${alias}.${column} < DATE_ADD(?, INTERVAL 1 DAY)`
    params.push(range.to)
  }
  return clause
}

function buildBeforeDateClause(alias, column, boundary, params) {
  if (!boundary) return ''
  params.push(boundary)
  return ` AND ${alias}.${column} < ?`
}

function buildRangePredicate(alias, column, range, params) {
  const parts = []
  if (range.from) {
    parts.push(`${alias}.${column} >= ?`)
    params.push(range.from)
  }
  if (range.to) {
    parts.push(`${alias}.${column} < DATE_ADD(?, INTERVAL 1 DAY)`)
    params.push(range.to)
  }
  return parts.length ? parts.join(' AND ') : '1=1'
}

function toPercent(numerator, denominator) {
  const safeDenominator = toNumber(denominator)
  if (safeDenominator <= 0) return 0
  return roundMoney((toNumber(numerator) / safeDenominator) * 100)
}

async function runSchemaChange(sql, params = []) {
  try {
    await db.pool.query(sql, params)
  } catch (err) {
    const duplicateCode = new Set([
      'ER_DUP_FIELDNAME',
      'ER_DUP_KEYNAME',
      'ER_DUP_INDEX',
      'ER_FK_DUP_NAME',
      'ER_DUP_ENTRY'
    ])
    const duplicateText = /duplicate|already exists/i
    if (duplicateCode.has(err.code) || duplicateText.test(String(err.message || ''))) {
      return
    }
    throw err
  }
}

async function getTableColumnSet(tableName) {
  const [rows] = await db.pool.query(`
    SELECT COLUMN_NAME
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = ?
  `, [tableName])

  return new Set(rows.map((row) => String(row.COLUMN_NAME || '').toLowerCase()))
}

async function ensureEnumColumnDefinition(tableName, columnName, expectedDefinition) {
  const [rows] = await db.pool.query(`
    SELECT COLUMN_TYPE AS column_type
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = ?
      AND column_name = ?
    LIMIT 1
  `, [tableName, columnName])

  const columnType = String(rows[0]?.column_type || '').toLowerCase()
  if (!columnType || columnType === String(expectedDefinition || '').toLowerCase()) return

  const expectedValues = String(expectedDefinition || '')
    .match(/'[^']+'/g)
    ?.map((value) => value.toLowerCase()) || []

  const hasAllExpectedValues = expectedValues.every((value) => columnType.includes(value))
  if (!hasAllExpectedValues) {
    await db.pool.query(`
      ALTER TABLE ${tableName}
      MODIFY COLUMN ${columnName} ${expectedDefinition}
    `)
  }
}

async function ensureAutomatedReportsSchema() {
  if (ensureAutomatedReportsSchemaPromise) return ensureAutomatedReportsSchemaPromise

  ensureAutomatedReportsSchemaPromise = (async () => {
    await db.pool.query(`
      CREATE TABLE IF NOT EXISTS bale_purchases (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        bale_batch_no VARCHAR(100) NOT NULL UNIQUE,
        supplier_name VARCHAR(255),
        purchase_date DATE NOT NULL,
        bale_category VARCHAR(120),
        bale_cost DECIMAL(12,2) DEFAULT 0.00,
        total_purchase_cost DECIMAL(12,2) DEFAULT 0.00,
        payment_status ENUM('PAID', 'PARTIAL', 'UNPAID') DEFAULT 'UNPAID',
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `)

    await runSchemaChange('ALTER TABLE bale_purchases ADD COLUMN supplier_id BIGINT UNSIGNED NULL')
    await runSchemaChange('ALTER TABLE bale_purchases ADD COLUMN bale_category VARCHAR(120) NULL')
    await runSchemaChange('ALTER TABLE bale_purchases ADD COLUMN bale_cost DECIMAL(12,2) DEFAULT 0.00')
    await runSchemaChange('ALTER TABLE bale_purchases ADD COLUMN total_purchase_cost DECIMAL(12,2) DEFAULT 0.00')
    await runSchemaChange("ALTER TABLE bale_purchases ADD COLUMN payment_status ENUM('PAID', 'PARTIAL', 'UNPAID') DEFAULT 'UNPAID'")
    await runSchemaChange('ALTER TABLE bale_purchases ADD COLUMN quantity_ordered INT NOT NULL DEFAULT 0')
    await runSchemaChange('ALTER TABLE bale_purchases ADD COLUMN quantity_received INT NOT NULL DEFAULT 0')
    await runSchemaChange("ALTER TABLE bale_purchases ADD COLUMN po_status ENUM('PENDING', 'ORDERED', 'RECEIVED', 'COMPLETED', 'CANCELLED') DEFAULT 'PENDING'")
    await runSchemaChange('ALTER TABLE bale_purchases ADD COLUMN expected_delivery_date DATE NULL')
    await runSchemaChange('ALTER TABLE bale_purchases ADD COLUMN actual_delivery_date DATE NULL')
    await runSchemaChange('ALTER TABLE bale_purchases ADD COLUMN notes TEXT NULL')

    await db.pool.query(`
      CREATE TABLE IF NOT EXISTS bale_breakdowns (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        bale_purchase_id BIGINT UNSIGNED NOT NULL UNIQUE,
        total_pieces INT DEFAULT 0,
        saleable_items INT DEFAULT 0,
        premium_items INT DEFAULT 0,
        standard_items INT DEFAULT 0,
        low_grade_items INT DEFAULT 0,
        damaged_items INT DEFAULT 0,
        cost_per_saleable_item DECIMAL(12,2) DEFAULT 0.00,
        encoded_by BIGINT UNSIGNED NULL,
        breakdown_date DATE,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (bale_purchase_id) REFERENCES bale_purchases(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `)

    await runSchemaChange('ALTER TABLE bale_breakdowns ADD COLUMN premium_items INT DEFAULT 0 AFTER saleable_items')
    await runSchemaChange('ALTER TABLE bale_breakdowns ADD COLUMN standard_items INT DEFAULT 0 AFTER premium_items')
    await runSchemaChange('ALTER TABLE bale_breakdowns ADD COLUMN low_grade_items INT DEFAULT 0 AFTER standard_items')
    await runSchemaChange('ALTER TABLE bale_breakdowns ADD COLUMN damaged_items INT DEFAULT 0 AFTER low_grade_items')
    await runSchemaChange('ALTER TABLE bale_breakdowns ADD COLUMN cost_per_saleable_item DECIMAL(12,2) DEFAULT 0.00 AFTER damaged_items')
    await runSchemaChange('ALTER TABLE bale_breakdowns ADD COLUMN encoded_by BIGINT UNSIGNED NULL AFTER cost_per_saleable_item')
    await runSchemaChange('ALTER TABLE bale_breakdowns ADD COLUMN breakdown_date DATE NULL AFTER encoded_by')
    await runSchemaChange('ALTER TABLE bale_breakdowns ADD COLUMN notes TEXT NULL AFTER breakdown_date')

    await ensureEnumColumnDefinition(
      'bale_purchases',
      'payment_status',
      "ENUM('PAID', 'PARTIAL', 'UNPAID') DEFAULT 'UNPAID'"
    )
    await ensureEnumColumnDefinition(
      'bale_purchases',
      'po_status',
      "ENUM('PENDING', 'ORDERED', 'RECEIVED', 'COMPLETED', 'CANCELLED') DEFAULT 'PENDING'"
    )

    let balePurchaseColumns = await getTableColumnSet('bale_purchases')
    if (!balePurchaseColumns.has('supplier_name')) {
      await runSchemaChange('ALTER TABLE bale_purchases ADD COLUMN supplier_name VARCHAR(255) NULL AFTER bale_batch_no')
      balePurchaseColumns = await getTableColumnSet('bale_purchases')
    }

    const hasSupplierId = balePurchaseColumns.has('supplier_id')
    const supplierColumns = hasSupplierId ? await getTableColumnSet('suppliers') : new Set()
    const hasSuppliersTable = supplierColumns.has('id') && supplierColumns.has('name')
    if (hasSupplierId && hasSuppliersTable) {
      await db.pool.query(`
        UPDATE bale_purchases bp
        LEFT JOIN suppliers s ON s.id = bp.supplier_id
        SET bp.supplier_name = COALESCE(
          NULLIF(TRIM(bp.supplier_name), ''),
          NULLIF(TRIM(s.name), ''),
          CONCAT('Supplier #', bp.supplier_id)
        )
        WHERE bp.supplier_id IS NOT NULL
          AND (bp.supplier_name IS NULL OR TRIM(bp.supplier_name) = '')
      `)
    } else if (hasSupplierId) {
      await db.pool.query(`
        UPDATE bale_purchases
        SET supplier_name = COALESCE(
          NULLIF(TRIM(supplier_name), ''),
          CONCAT('Supplier #', supplier_id)
        )
        WHERE supplier_id IS NOT NULL
          AND (supplier_name IS NULL OR TRIM(supplier_name) = '')
      `)
    }

    await db.pool.query(`
      UPDATE bale_purchases
      SET quantity_ordered = COALESCE(quantity_ordered, 0),
          quantity_received = COALESCE(quantity_received, 0),
          total_purchase_cost = COALESCE(total_purchase_cost, bale_cost, 0),
          payment_status = COALESCE(NULLIF(payment_status, ''), 'UNPAID'),
          po_status = COALESCE(NULLIF(po_status, ''), 'PENDING')
    `)

    await db.pool.query(`
      CREATE TABLE IF NOT EXISTS inventory_adjustments (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        product_id BIGINT UNSIGNED NULL,
        bale_purchase_id BIGINT UNSIGNED NULL,
        adjustment_type ENUM('damaged', 'unsellable', 'shrinkage', 'correction') NOT NULL,
        quantity INT NOT NULL DEFAULT 0,
        reason TEXT,
        adjustment_date DATE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL,
        FOREIGN KEY (bale_purchase_id) REFERENCES bale_purchases(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `)

    await runSchemaChange('ALTER TABLE inventory_adjustments ADD COLUMN product_id BIGINT UNSIGNED NULL')
    await runSchemaChange('ALTER TABLE inventory_adjustments ADD COLUMN bale_purchase_id BIGINT UNSIGNED NULL')
    await runSchemaChange("ALTER TABLE inventory_adjustments ADD COLUMN adjustment_type ENUM('damaged', 'unsellable', 'shrinkage', 'correction') NOT NULL DEFAULT 'correction'")
    await runSchemaChange('ALTER TABLE inventory_adjustments ADD COLUMN quantity INT NOT NULL DEFAULT 0')
    await runSchemaChange('ALTER TABLE inventory_adjustments ADD COLUMN reason TEXT NULL')
    await runSchemaChange('ALTER TABLE inventory_adjustments ADD COLUMN adjustment_date DATE NULL')
    await runSchemaChange('ALTER TABLE inventory_adjustments ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP')

    await ensureEnumColumnDefinition(
      'inventory_adjustments',
      'adjustment_type',
      "ENUM('damaged', 'unsellable', 'shrinkage', 'correction') NOT NULL DEFAULT 'correction'"
    )

    await runSchemaChange('ALTER TABLE suppliers ADD COLUMN notes TEXT NULL')
    await runSchemaChange('ALTER TABLE suppliers ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP')

    await runSchemaChange('ALTER TABLE products ADD COLUMN item_code VARCHAR(128) NULL AFTER id')
    await runSchemaChange('ALTER TABLE products ADD COLUMN bale_purchase_id BIGINT UNSIGNED NULL AFTER id')
    await runSchemaChange('ALTER TABLE products ADD COLUMN source_breakdown_id BIGINT UNSIGNED NULL AFTER bale_purchase_id')
    await runSchemaChange('ALTER TABLE products ADD COLUMN subcategory VARCHAR(150) NULL AFTER category_id')
    await runSchemaChange("ALTER TABLE products ADD COLUMN condition_grade ENUM('premium','standard','low_grade','damaged','unsellable') NULL AFTER color")
    await runSchemaChange("ALTER TABLE products ADD COLUMN product_source ENUM('manual','bale_breakdown','repaired_damage') DEFAULT 'manual' AFTER condition_grade")
    await runSchemaChange('ALTER TABLE products ADD COLUMN allocated_cost DECIMAL(12,2) DEFAULT 0.00 AFTER cost')
    await runSchemaChange('ALTER TABLE products ADD COLUMN selling_price DECIMAL(12,2) DEFAULT 0.00 AFTER price')
    await runSchemaChange("ALTER TABLE products ADD COLUMN status ENUM('available','sold','damaged','reserved','archived') DEFAULT 'available' AFTER selling_price")
    await runSchemaChange('ALTER TABLE products ADD COLUMN date_encoded DATE NULL AFTER status')

    await runSchemaChange('CREATE UNIQUE INDEX idx_products_item_code ON products(item_code)')
    await runSchemaChange('CREATE INDEX idx_products_bale_purchase_id ON products(bale_purchase_id)')
    await runSchemaChange('CREATE INDEX idx_products_source_breakdown_id ON products(source_breakdown_id)')
    await runSchemaChange('CREATE INDEX idx_products_product_source ON products(product_source)')
    await runSchemaChange('CREATE INDEX idx_products_date_encoded ON products(date_encoded)')
    await runSchemaChange('CREATE INDEX idx_bale_purchase_date ON bale_purchases(purchase_date)')
    await runSchemaChange('CREATE INDEX idx_bale_purchase_supplier_id ON bale_purchases(supplier_id)')
    await runSchemaChange('CREATE INDEX idx_bale_purchase_po_status ON bale_purchases(po_status)')
    await runSchemaChange('CREATE INDEX idx_bale_breakdown_date ON bale_breakdowns(breakdown_date)')
    await runSchemaChange('CREATE INDEX idx_inventory_adjustments_date ON inventory_adjustments(adjustment_date)')
    await runSchemaChange('CREATE INDEX idx_inventory_adjustments_type ON inventory_adjustments(adjustment_type)')

    await runSchemaChange(`
      ALTER TABLE products
      ADD CONSTRAINT fk_products_bale_purchase
      FOREIGN KEY (bale_purchase_id) REFERENCES bale_purchases(id)
      ON DELETE SET NULL
    `)

    await db.pool.query(`
      UPDATE products p
      LEFT JOIN bale_breakdowns bb ON bb.bale_purchase_id = p.bale_purchase_id
      SET p.product_source = CASE
            WHEN p.bale_purchase_id IS NOT NULL
             AND COALESCE(p.condition_grade, '') IN ('premium', 'standard')
              THEN 'bale_breakdown'
            ELSE COALESCE(NULLIF(p.product_source, ''), 'manual')
          END,
          p.source_breakdown_id = CASE
            WHEN p.bale_purchase_id IS NOT NULL
             AND COALESCE(p.condition_grade, '') IN ('premium', 'standard')
              THEN COALESCE(p.source_breakdown_id, bb.id)
            ELSE p.source_breakdown_id
          END
    `)
    await db.pool.query(`
      UPDATE products
      SET selling_price = COALESCE(NULLIF(selling_price, 0), price, 0)
      WHERE selling_price IS NULL OR selling_price = 0
    `)
    await db.pool.query(`
      UPDATE products
      SET date_encoded = DATE(created_at)
      WHERE date_encoded IS NULL AND created_at IS NOT NULL
    `)
    await db.pool.query(`
      UPDATE products
      SET status = CASE
        WHEN COALESCE(stock_quantity, 0) > 0 THEN 'available'
        ELSE 'sold'
      END
      WHERE status IS NULL OR status = ''
    `)
    await ensureEnumColumnDefinition(
      'products',
      'product_source',
      "ENUM('manual','bale_breakdown','repaired_damage') DEFAULT 'manual'"
    )

    await db.pool.query(`
      CREATE TABLE IF NOT EXISTS damage_repair_events (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        damage_source_type ENUM('bale_breakdown', 'manual_damage', 'sales_return') NOT NULL,
        damage_source_id BIGINT UNSIGNED NOT NULL,
        product_id BIGINT UNSIGNED NOT NULL,
        quantity INT UNSIGNED NOT NULL DEFAULT 1,
        created_by BIGINT UNSIGNED NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `)

    await runSchemaChange("ALTER TABLE damage_repair_events ADD COLUMN damage_source_type ENUM('bale_breakdown', 'manual_damage', 'sales_return') NOT NULL")
    await runSchemaChange('ALTER TABLE damage_repair_events ADD COLUMN damage_source_id BIGINT UNSIGNED NOT NULL')
    await runSchemaChange('ALTER TABLE damage_repair_events ADD COLUMN product_id BIGINT UNSIGNED NOT NULL')
    await runSchemaChange('ALTER TABLE damage_repair_events ADD COLUMN quantity INT UNSIGNED NOT NULL DEFAULT 1')
    await runSchemaChange('ALTER TABLE damage_repair_events ADD COLUMN created_by BIGINT UNSIGNED NULL')
    await runSchemaChange('ALTER TABLE damage_repair_events ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP')
    await runSchemaChange('CREATE INDEX idx_damage_repair_events_source ON damage_repair_events(damage_source_type, damage_source_id)')
    await runSchemaChange('CREATE INDEX idx_damage_repair_events_product_id ON damage_repair_events(product_id)')
    await runSchemaChange('CREATE INDEX idx_damage_repair_events_created_at ON damage_repair_events(created_at)')
  })().catch((err) => {
    ensureAutomatedReportsSchemaPromise = null
    throw err
  })

  return ensureAutomatedReportsSchemaPromise
}

async function getLegacyDamageLossTotal(range, mode) {
  const params = []
  let dateFilter = ''
  if (mode === 'before') {
    dateFilter = buildBeforeDateClause('it', 'created_at', range.from, params)
  } else {
    dateFilter = buildDateRangeClause('it', 'created_at', range, params)
  }

  const [rows] = await db.pool.query(`
    SELECT COALESCE(SUM(ABS(it.quantity)), 0) AS total
    FROM inventory_transactions it
    JOIN products p ON p.id = it.product_id
    WHERE it.transaction_type = 'OUT'
      AND p.bale_purchase_id IS NOT NULL
      AND (
        it.reason LIKE 'STOCK_OUT:DAMAGE%'
        OR it.reason LIKE 'STOCK_OUT:SHRINKAGE%'
        OR it.reference LIKE 'STOCK_OUT|disposition=DAMAGE%'
        OR it.reference LIKE 'STOCK_OUT|disposition=SHRINKAGE%'
      )
      ${dateFilter}
  `, params)

  return toNumber(rows[0]?.total)
}

async function getAdjustmentDamageLossTotal(range, mode) {
  const params = []
  let dateFilter = ''
  if (mode === 'before') {
    dateFilter = buildBeforeDateClause('ia', 'adjustment_date', range.from, params)
  } else {
    dateFilter = buildDateRangeClause('ia', 'adjustment_date', range, params)
  }

  const [rows] = await db.pool.query(`
    SELECT
      COUNT(*) AS records,
      COALESCE(SUM(CASE WHEN ia.quantity < 0 THEN ABS(ia.quantity) ELSE ia.quantity END), 0) AS total
    FROM inventory_adjustments ia
    LEFT JOIN products p ON p.id = ia.product_id
    WHERE ia.adjustment_type IN (${ADJUSTMENT_TYPES.map(() => '?').join(', ')})
      AND (ia.bale_purchase_id IS NOT NULL OR p.bale_purchase_id IS NOT NULL)
      ${dateFilter}
  `, [...ADJUSTMENT_TYPES, ...params])

  return {
    records: Number(rows[0]?.records) || 0,
    total: toNumber(rows[0]?.total)
  }
}

async function getDamageLossTotal(range, mode = 'range') {
  const adjustment = await getAdjustmentDamageLossTotal(range, mode)
  if (adjustment.records > 0) return adjustment.total
  return getLegacyDamageLossTotal(range, mode)
}

async function getSummary(range) {
  const salesParams = []
  const salesPurchasePredicate = buildRangePredicate('bp', 'purchase_date', range, salesParams)
  const salesDateFilter = buildDateRangeClause('s', 'date', range, salesParams)
  const [salesRows] = await db.pool.query(`
    SELECT COALESCE(SUM(si.line_total), 0) AS total_sales
    FROM sale_items si
    JOIN sales s ON s.id = si.sale_id
    JOIN products p ON p.id = si.product_id
    JOIN bale_purchases bp ON bp.id = p.bale_purchase_id
    WHERE s.status <> 'CANCELLED'
      AND (${salesPurchasePredicate})
      ${salesDateFilter}
  `, salesParams)

  const baleParams = []
  const baleDateFilter = buildDateRangeClause('bp', 'purchase_date', range, baleParams)
  const [baleRows] = await db.pool.query(`
    SELECT
      COUNT(*) AS bales_purchased,
      COALESCE(SUM(COALESCE(bp.total_purchase_cost, bp.bale_cost)), 0) AS total_bale_purchases
    FROM bale_purchases bp
    WHERE 1=1${baleDateFilter}
  `, baleParams)

  const itemsAddedParams = []
  const itemsAddedDateFilter = buildDateRangeClause('x', 'event_date', range, itemsAddedParams)
  const [itemsAddedRows] = await db.pool.query(`
    SELECT COALESCE(SUM(x.saleable_items), 0) AS items_added
    FROM (
      SELECT
        COALESCE(bb.saleable_items, 0) AS saleable_items,
        COALESCE(bb.breakdown_date, bp.purchase_date) AS event_date
      FROM bale_breakdowns bb
      JOIN bale_purchases bp ON bp.id = bb.bale_purchase_id
    ) x
    WHERE 1=1${itemsAddedDateFilter}
  `, itemsAddedParams)

  const itemsSoldParams = []
  const itemsSoldPurchasePredicate = buildRangePredicate('bp', 'purchase_date', range, itemsSoldParams)
  const itemsSoldDateFilter = buildDateRangeClause('s', 'date', range, itemsSoldParams)
  const [itemsSoldRows] = await db.pool.query(`
    SELECT COALESCE(SUM(si.qty), 0) AS items_sold
    FROM sale_items si
    JOIN sales s ON s.id = si.sale_id
    JOIN products p ON p.id = si.product_id
    JOIN bale_purchases bp ON bp.id = p.bale_purchase_id
    WHERE (${itemsSoldPurchasePredicate})
      AND s.status <> 'CANCELLED'
      ${itemsSoldDateFilter}
  `, itemsSoldParams)

  const breakdownDamagedParams = []
  const breakdownDamagedDateFilter = buildDateRangeClause('x', 'event_date', range, breakdownDamagedParams)
  const [breakdownDamagedRows] = await db.pool.query(`
    SELECT COALESCE(SUM(x.damaged_items), 0) AS damaged_items
    FROM (
      SELECT
        bb.damaged_items,
        COALESCE(bb.breakdown_date, bp.purchase_date) AS event_date
      FROM bale_breakdowns bb
      JOIN bale_purchases bp ON bp.id = bb.bale_purchase_id
    ) x
    WHERE 1=1${breakdownDamagedDateFilter}
  `, breakdownDamagedParams)

  const remainingParams = []
  const remainingPurchasePredicate = buildRangePredicate('bp', 'purchase_date', range, remainingParams)
  const [remainingRows] = await db.pool.query(`
    SELECT
      COALESCE(SUM(
        CASE
          WHEN COALESCE(p.status, 'available') = 'available' THEN GREATEST(COALESCE(p.stock_quantity, 0), 0)
          ELSE 0
        END
      ), 0) AS remaining_saleable_items
    FROM products p
    JOIN bale_purchases bp ON bp.id = p.bale_purchase_id
    WHERE (${remainingPurchasePredicate})
  `, remainingParams)

  const totalSales = roundMoney(salesRows[0]?.total_sales)
  const totalBalePurchases = roundMoney(baleRows[0]?.total_bale_purchases)
  const balesPurchased = Number(baleRows[0]?.bales_purchased) || 0
  const itemsAddedToInventory = Number(itemsAddedRows[0]?.items_added) || 0
  const itemsSold = toNumber(itemsSoldRows[0]?.items_sold)
  const damagedFromBreakdown = toNumber(breakdownDamagedRows[0]?.damaged_items)
  const damagedFromAdjustments = await getDamageLossTotal(range, 'range')
  const damagedUnsellableItems = roundMoney(damagedFromBreakdown + damagedFromAdjustments)
  const remainingSaleableItems = toNumber(remainingRows[0]?.remaining_saleable_items)

  return {
    totalSales,
    totalBalePurchases,
    grossProfit: roundMoney(totalSales - totalBalePurchases),
    balesPurchased,
    itemsAddedToInventory,
    itemsSold,
    damagedUnsellableItems,
    remainingSaleableItems
  }
}

async function getBalePurchases(range) {
  const params = []
  const dateFilter = buildDateRangeClause('bp', 'purchase_date', range, params)
  const [rows] = await db.pool.query(`
    SELECT
      bp.id,
      bp.bale_batch_no,
      bp.purchase_date,
      bp.supplier_name,
      COALESCE(NULLIF(bp.bale_category, ''), 'Unspecified Bale') AS bale_category,
      COALESCE(bp.bale_cost, 0) AS bale_cost,
      COALESCE(bp.total_purchase_cost, COALESCE(bp.bale_cost, 0)) AS total_purchase_cost,
      COALESCE(NULLIF(bp.payment_status, ''), 'UNPAID') AS payment_status
    FROM bale_purchases bp
    WHERE 1=1${dateFilter}
    ORDER BY bp.purchase_date DESC, bp.id DESC
  `, params)

  const totals = rows.reduce((acc, row) => {
    acc.baleCost += toNumber(row.bale_cost)
    acc.totalPurchaseCost += toNumber(row.total_purchase_cost)
    return acc
  }, { baleCost: 0, totalPurchaseCost: 0 })

  return {
    rows: rows.map((row) => ({
      ...row,
      bale_cost: roundMoney(row.bale_cost),
      total_purchase_cost: roundMoney(row.total_purchase_cost)
    })),
    totals: {
      baleCost: roundMoney(totals.baleCost),
      totalPurchaseCost: roundMoney(totals.totalPurchaseCost)
    }
  }
}

async function getBaleBreakdowns(range) {
  const params = []
  const purchasePredicate = buildRangePredicate('bp', 'purchase_date', range, params)
  const breakdownPredicate = buildRangePredicate('bb', 'breakdown_date', range, params)

  const [rows] = await db.pool.query(`
    SELECT
      bp.id AS bale_purchase_id,
      bp.bale_batch_no,
      COALESCE(bb.total_pieces, 0) AS total_pieces,
      COALESCE(bb.saleable_items, 0) AS saleable_items,
      COALESCE(bb.premium_items, 0) AS premium_items,
      COALESCE(bb.standard_items, 0) AS standard_items,
      COALESCE(bb.low_grade_items, 0) AS low_grade_items,
      COALESCE(bb.damaged_items, 0) AS damaged_items,
      COALESCE(
        bb.cost_per_saleable_item,
        CASE
          WHEN COALESCE(bb.saleable_items, 0) > 0 THEN
            COALESCE(bp.total_purchase_cost, bp.bale_cost) / bb.saleable_items
          ELSE 0
        END
      ) AS cost_per_saleable_item
    FROM bale_purchases bp
    LEFT JOIN bale_breakdowns bb ON bb.bale_purchase_id = bp.id
    WHERE (${purchasePredicate}) OR (${breakdownPredicate})
    ORDER BY COALESCE(bb.breakdown_date, bp.purchase_date) DESC, bp.id DESC
  `, params)

  return rows.map((row) => {
    const premiumItems = toNumber(row.premium_items)
    const standardItems = toNumber(row.standard_items) + toNumber(row.low_grade_items)
    const saleableItems = toNumber(row.saleable_items) || (premiumItems + standardItems)

    return {
      ...row,
      total_pieces: toNumber(row.total_pieces),
      saleable_items: saleableItems,
      premium_items: premiumItems,
      standard_items: standardItems,
      low_grade_items: 0,
      damaged_items: toNumber(row.damaged_items),
      cost_per_saleable_item: roundMoney(row.cost_per_saleable_item)
    }
  })
}

async function getSalesByBale(range) {
  const params = []
  const salesDateFilter = buildDateRangeClause('s', 'date', range, params)
  const [rows] = await db.pool.query(`
    SELECT
      s.date AS date_sold,
      COALESCE(NULLIF(p.item_code, ''), NULLIF(p.sku, ''), CONCAT('PROD-', p.id)) AS item_code,
      COALESCE(si.product_name_snapshot, p.name, 'Unknown Item') AS product_name,
      COALESCE(c.name, p.subcategory, 'Uncategorized') AS category,
      bp.bale_batch_no,
      COALESCE(si.unit_price, 0) AS selling_price,
      COALESCE(si.qty, 0) AS quantity,
      COALESCE(si.line_total, 0) AS sales_total
    FROM sale_items si
    JOIN sales s ON s.id = si.sale_id
    JOIN products p ON p.id = si.product_id
    LEFT JOIN categories c ON c.id = p.category_id
    JOIN bale_purchases bp ON bp.id = p.bale_purchase_id
    WHERE s.status <> 'CANCELLED'
      ${salesDateFilter}
    ORDER BY s.date DESC, si.id DESC
  `, params)

  const totals = rows.reduce((acc, row) => {
    acc.quantity += toNumber(row.quantity)
    acc.salesTotal += toNumber(row.sales_total)
    return acc
  }, { quantity: 0, salesTotal: 0 })

  return {
    rows: rows.map((row) => ({
      ...row,
      quantity: toNumber(row.quantity),
      selling_price: roundMoney(row.selling_price),
      sales_total: roundMoney(row.sales_total)
    })),
    totals: {
      quantity: toNumber(totals.quantity),
      salesTotal: roundMoney(totals.salesTotal)
    }
  }
}

async function getBaleProfitability(range) {
  const revenueParams = []
  const revenueDateFilter = buildDateRangeClause('s', 'date', range, revenueParams)
  const params = [...revenueParams]
  const purchasePredicate = buildRangePredicate('bp', 'purchase_date', range, params)

  const [rows] = await db.pool.query(`
    SELECT
      bp.id AS bale_purchase_id,
      bp.bale_batch_no,
      bp.purchase_date,
      bp.supplier_name,
      COALESCE(NULLIF(bp.bale_category, ''), 'Unspecified Bale') AS bale_type,
      COALESCE(bp.total_purchase_cost, bp.bale_cost) AS total_purchase_cost,
      COALESCE(sales_data.revenue_generated, 0) AS revenue_generated,
      COALESCE(sales_data.sold_pieces, 0) AS sold_pieces,
      COALESCE(inventory_data.remaining_pieces, 0) AS remaining_pieces,
      COALESCE(bb.saleable_items, 0) AS saleable_items,
      COALESCE(bb.damaged_items, 0) AS damaged_items
    FROM bale_purchases bp
    LEFT JOIN bale_breakdowns bb ON bb.bale_purchase_id = bp.id
    LEFT JOIN (
      SELECT
        p.bale_purchase_id,
        COALESCE(SUM(si.line_total), 0) AS revenue_generated,
        COALESCE(SUM(si.qty), 0) AS sold_pieces
      FROM sale_items si
      JOIN sales s ON s.id = si.sale_id
      JOIN products p ON p.id = si.product_id
      WHERE p.bale_purchase_id IS NOT NULL
        AND s.status <> 'CANCELLED'
        ${revenueDateFilter}
      GROUP BY p.bale_purchase_id
    ) sales_data ON sales_data.bale_purchase_id = bp.id
    LEFT JOIN (
      SELECT
        p.bale_purchase_id,
        COALESCE(SUM(
          CASE
            WHEN COALESCE(p.status, 'available') = 'available' THEN GREATEST(COALESCE(p.stock_quantity, 0), 0)
            ELSE 0
          END
        ), 0) AS remaining_pieces
      FROM products p
      WHERE p.bale_purchase_id IS NOT NULL
      GROUP BY p.bale_purchase_id
    ) inventory_data ON inventory_data.bale_purchase_id = bp.id
    WHERE (${purchasePredicate})
    ORDER BY revenue_generated DESC, bp.id DESC
  `, params)

  const mappedRows = rows.map((row) => {
    const totalPurchaseCost = roundMoney(row.total_purchase_cost)
    const revenueGenerated = roundMoney(row.revenue_generated)
    const soldPieces = toNumber(row.sold_pieces)
    const remainingPieces = toNumber(row.remaining_pieces)
    const saleableItems = toNumber(row.saleable_items)
    const grossProfit = roundMoney(revenueGenerated - totalPurchaseCost)

    return {
      bale_purchase_id: row.bale_purchase_id,
      bale_batch_no: row.bale_batch_no,
      purchase_date: row.purchase_date,
      supplier_name: row.supplier_name,
      bale_type: row.bale_type,
      total_purchase_cost: totalPurchaseCost,
      revenue_generated: revenueGenerated,
      gross_profit: grossProfit,
      sold_pieces: soldPieces,
      remaining_pieces: remainingPieces,
      saleable_items: saleableItems,
      damaged_items: toNumber(row.damaged_items),
      sell_through_rate: toPercent(soldPieces, saleableItems)
    }
  })

  const profitableRows = mappedRows.filter((row) => row.gross_profit > 0)
  const best = profitableRows.length
    ? profitableRows.reduce((current, row) => (row.gross_profit > current.gross_profit ? row : current), profitableRows[0])
    : null
  const worst = mappedRows.length
    ? mappedRows.reduce((current, row) => (row.gross_profit < current.gross_profit ? row : current), mappedRows[0])
    : null

  return {
    rows: mappedRows,
    highlights: {
      best_performing_bale: best
        ? {
            bale_batch_no: best.bale_batch_no,
            gross_profit: best.gross_profit,
            supplier_name: best.supplier_name
          }
        : null,
      worst_performing_bale: worst
        ? {
            bale_batch_no: worst.bale_batch_no,
            gross_profit: worst.gross_profit,
            supplier_name: worst.supplier_name
          }
        : null
    }
  }
}

function isDateWithinRange(dateValue, range) {
  if (!dateValue) return true

  let normalized = null
  if (dateValue instanceof Date) {
    if (Number.isNaN(dateValue.getTime())) return true
    normalized = toLocalDateOnly(dateValue)
  } else {
    const rawValue = String(dateValue || '').trim()
    if (!rawValue) return true

    if (DATE_PATTERN.test(rawValue)) {
      normalized = rawValue
    } else {
      const datePrefixMatch = rawValue.match(/^(\d{4}-\d{2}-\d{2})/)
      if (datePrefixMatch) {
        normalized = datePrefixMatch[1]
      } else {
        const parsed = new Date(rawValue)
        if (Number.isNaN(parsed.getTime())) return true
        normalized = toLocalDateOnly(parsed)
      }
    }
  }

  if (!normalized) return true
  if (range.from && normalized < range.from) return false
  if (range.to && normalized > range.to) return false
  return true
}

function getSupplierPerformance(baleProfitabilityRows, range) {
  const grouped = new Map()

  for (const row of baleProfitabilityRows) {
    const purchasedInRange = isDateWithinRange(row.purchase_date, range)
    if (!purchasedInRange) continue

    const supplierName = row.supplier_name || 'Unknown Supplier'
    if (!grouped.has(supplierName)) {
      grouped.set(supplierName, {
        supplier_name: supplierName,
        number_of_bales_purchased: 0,
        purchased_bale_cost_total: 0,
        purchased_saleable_total: 0,
        purchased_damaged_total: 0,
        total_revenue_generated: 0,
        best_performing_bale: null,
        best_performing_gross_profit: Number.NEGATIVE_INFINITY
      })
    }

    const item = grouped.get(supplierName)
    item.number_of_bales_purchased += 1
    item.purchased_bale_cost_total += toNumber(row.total_purchase_cost)
    item.purchased_saleable_total += toNumber(row.saleable_items)
    item.purchased_damaged_total += toNumber(row.damaged_items)
    item.total_revenue_generated += toNumber(row.revenue_generated)

    if (toNumber(row.gross_profit) > item.best_performing_gross_profit) {
      item.best_performing_gross_profit = toNumber(row.gross_profit)
      item.best_performing_bale = row.bale_batch_no
    }
  }

  return Array.from(grouped.values())
    .map((row) => ({
      supplier_name: row.supplier_name,
      number_of_bales_purchased: row.number_of_bales_purchased,
      average_bale_cost: roundMoney(row.purchased_bale_cost_total / Math.max(row.number_of_bales_purchased, 1)),
      average_saleable_items: roundMoney(row.purchased_saleable_total / Math.max(row.number_of_bales_purchased, 1)),
      average_damaged_items: roundMoney(row.purchased_damaged_total / Math.max(row.number_of_bales_purchased, 1)),
      total_revenue_generated: roundMoney(row.total_revenue_generated),
      estimated_gross_profit: roundMoney(row.total_revenue_generated - row.purchased_bale_cost_total),
      best_performing_bale: row.best_performing_bale || '-'
    }))
    .filter((row) => row.number_of_bales_purchased > 0)
    .sort((a, b) => b.estimated_gross_profit - a.estimated_gross_profit)
}

async function getInventoryMovement(range) {
  const addedBeforeParams = []
  const addedBeforeFilter = buildBeforeDateClause('x', 'event_date', range.from, addedBeforeParams)
  const [addedBeforeRows] = await db.pool.query(`
    SELECT COALESCE(SUM(x.saleable_items), 0) AS total
    FROM (
      SELECT
        COALESCE(bb.saleable_items, 0) AS saleable_items,
        COALESCE(bb.breakdown_date, bp.purchase_date) AS event_date
      FROM bale_breakdowns bb
      JOIN bale_purchases bp ON bp.id = bb.bale_purchase_id
    ) x
    WHERE 1=1${addedBeforeFilter}
  `, addedBeforeParams)

  const addedRangeParams = []
  const addedRangeFilter = buildDateRangeClause('x', 'event_date', range, addedRangeParams)
  const [addedRangeRows] = await db.pool.query(`
    SELECT COALESCE(SUM(x.saleable_items), 0) AS total
    FROM (
      SELECT
        COALESCE(bb.saleable_items, 0) AS saleable_items,
        COALESCE(bb.breakdown_date, bp.purchase_date) AS event_date
      FROM bale_breakdowns bb
      JOIN bale_purchases bp ON bp.id = bb.bale_purchase_id
    ) x
    WHERE 1=1${addedRangeFilter}
  `, addedRangeParams)

  const soldBeforeParams = []
  const soldBeforeFilter = buildBeforeDateClause('s', 'date', range.from, soldBeforeParams)
  const [soldBeforeRows] = await db.pool.query(`
    SELECT COALESCE(SUM(si.qty), 0) AS total
    FROM sale_items si
    JOIN sales s ON s.id = si.sale_id
    JOIN products p ON p.id = si.product_id
    WHERE p.bale_purchase_id IS NOT NULL
      AND s.status <> 'CANCELLED'
      ${soldBeforeFilter}
  `, soldBeforeParams)

  const soldRangeParams = []
  const soldRangeFilter = buildDateRangeClause('s', 'date', range, soldRangeParams)
  const [soldRangeRows] = await db.pool.query(`
    SELECT COALESCE(SUM(si.qty), 0) AS total
    FROM sale_items si
    JOIN sales s ON s.id = si.sale_id
    JOIN products p ON p.id = si.product_id
    WHERE p.bale_purchase_id IS NOT NULL
      AND s.status <> 'CANCELLED'
      ${soldRangeFilter}
  `, soldRangeParams)

  const damagedBefore = await getDamageLossTotal(range, 'before')
  const damagedRange = await getDamageLossTotal(range, 'range')

  const openingInventoryRaw = toNumber(addedBeforeRows[0]?.total) - toNumber(soldBeforeRows[0]?.total) - damagedBefore
  const openingInventory = Math.max(roundMoney(openingInventoryRaw), 0)
  const itemsAddedFromBales = roundMoney(toNumber(addedRangeRows[0]?.total))
  const itemsSold = roundMoney(toNumber(soldRangeRows[0]?.total))
  const damagedLoss = roundMoney(damagedRange)
  const endingInventory = roundMoney(openingInventory + itemsAddedFromBales - itemsSold - damagedLoss)

  return {
    openingInventory,
    itemsAddedFromBales,
    itemsSold,
    damagedLoss,
    endingInventory
  }
}

async function getAutomatedReports(fromInput, toInput) {
  await ensureAutomatedReportsSchema()
  const range = normalizeDateRange(fromInput, toInput)

  const summary = await getSummary(range)
  const balePurchasesResult = await getBalePurchases(range)
  const baleBreakdowns = await getBaleBreakdowns(range)
  const salesByBaleResult = await getSalesByBale(range)
  const baleProfitabilityResult = await getBaleProfitability(range)
  const supplierPerformance = getSupplierPerformance(baleProfitabilityResult.rows, range)
  const inventoryMovement = await getInventoryMovement(range)

  return {
    generated_at: new Date().toISOString(),
    filters: {
      from: range.from,
      to: range.to
    },
    summary,
    balePurchases: balePurchasesResult.rows,
    balePurchasesTotals: balePurchasesResult.totals,
    baleBreakdowns,
    salesByBale: salesByBaleResult.rows,
    salesByBaleTotals: salesByBaleResult.totals,
    baleProfitability: baleProfitabilityResult.rows,
    profitabilityHighlights: baleProfitabilityResult.highlights,
    supplierPerformance,
    inventoryMovement
  }
}

function csvEscape(value) {
  const normalized = value === null || value === undefined ? '' : String(value)
  if (!/[",\n]/.test(normalized)) return normalized
  return `"${normalized.replace(/"/g, '""')}"`
}

function csvLine(columns) {
  return columns.map(csvEscape).join(',')
}

function buildAutomatedReportsCsv(reportPayload) {
  const lines = []
  lines.push(csvLine(['Section', 'Metric', 'Value']))

  const summary = reportPayload.summary || {}
  lines.push(csvLine(['Summary', 'Bale-linked Sales', summary.totalSales]))
  lines.push(csvLine(['Summary', 'Total Bale Purchases', summary.totalBalePurchases]))
  lines.push(csvLine(['Summary', 'Bale Gross Profit', summary.grossProfit]))
  lines.push(csvLine(['Summary', 'Bales Purchased', summary.balesPurchased]))
  lines.push(csvLine(['Summary', 'Saleable Pieces From Breakdown', summary.itemsAddedToInventory]))
  lines.push(csvLine(['Summary', 'Items Sold', summary.itemsSold]))
  lines.push(csvLine(['Summary', 'Damaged / Unsellable Items', summary.damagedUnsellableItems]))
  lines.push(csvLine(['Summary', 'Current Remaining Stock', summary.remainingSaleableItems]))

  lines.push('')
  lines.push(csvLine([
    'Bale Purchases',
    'Bale Batch No.',
    'Purchase Date',
    'Supplier Name',
    'Bale Category',
    'Bale Cost',
    'Total Purchase Cost'
  ]))
  for (const row of reportPayload.balePurchases || []) {
    lines.push(csvLine([
      'Bale Purchases',
      row.bale_batch_no,
      row.purchase_date,
      row.supplier_name,
      row.bale_category,
      row.bale_cost,
      row.total_purchase_cost
    ]))
  }

  lines.push('')
  lines.push(csvLine([
    'Bale Profitability',
    'Bale Batch No.',
    'Supplier Name',
    'Bale Type',
    'Total Purchase Cost',
    'Revenue Generated',
    'Gross Profit',
    'Sold Pieces',
    'Remaining Pieces',
    'Sell-through Rate'
  ]))
  for (const row of reportPayload.baleProfitability || []) {
    lines.push(csvLine([
      'Bale Profitability',
      row.bale_batch_no,
      row.supplier_name,
      row.bale_type,
      row.total_purchase_cost,
      row.revenue_generated,
      row.gross_profit,
      row.sold_pieces,
      row.remaining_pieces,
      row.sell_through_rate
    ]))
  }

  return lines.join('\n')
}

module.exports = {
  ensureAutomatedReportsSchema,
  normalizeDateRange,
  getSummary,
  getBaleProfitability,
  getSupplierPerformance,
  getAutomatedReports,
  buildAutomatedReportsCsv
}
