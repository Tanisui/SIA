const db = require('../database')

const DEFAULT_TAX_RATE = 0.12
const PAYMENT_METHODS = ['cash']
const WALK_IN_CUSTOMER_LABEL = 'Walk-in Customer'
const RETURN_DISPOSITIONS = ['RESTOCK', 'DAMAGE', 'SHRINKAGE']

let ensureSalesSchemaPromise = null

function roundMoney(value) {
  return Math.round((Number(value) || 0) * 100) / 100
}

function normalizeDiscountPercentage(value) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return 0
  return Math.min(Math.max(parsed, 0), 100)
}

function normalizeTaxRate(value) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) return DEFAULT_TAX_RATE
  if (parsed > 1) return parsed / 100
  return parsed
}

function formatCustomerCode(customerId) {
  const idNumber = Number(customerId)
  if (!Number.isInteger(idNumber) || idNumber <= 0) return null
  return `CUST-${String(idNumber).padStart(6, '0')}`
}

function normalizeCustomerProfileToken(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
}

function composeWalkInCustomerProfileName({ receiptNo, saleNumber, saleId } = {}) {
  const reference = normalizeCustomerProfileToken(receiptNo)
    || normalizeCustomerProfileToken(saleNumber)
    || (saleId ? `Sale #${saleId}` : '')

  return reference ? `${WALK_IN_CUSTOMER_LABEL} - ${reference}` : WALK_IN_CUSTOMER_LABEL
}

async function ensureSalesCustomerProfileSchema(queryable = db.pool) {
  await queryable.query('ALTER TABLE customers ADD COLUMN customer_code VARCHAR(40) NULL AFTER id').catch(() => {})
  await queryable.query('ALTER TABLE customers ADD COLUMN full_name VARCHAR(255) NULL AFTER customer_code').catch(() => {})
  await queryable.query('ALTER TABLE customers ADD COLUMN updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_at').catch(() => {})
  await queryable.query('CREATE INDEX idx_customers_customer_code ON customers(customer_code)').catch(() => {})
  await queryable.query(`
    UPDATE customers
    SET full_name = COALESCE(NULLIF(TRIM(full_name), ''), NULLIF(TRIM(name), ''))
    WHERE full_name IS NULL OR TRIM(full_name) = ''
  `).catch(() => {})
  await queryable.query(`
    UPDATE customers
    SET customer_code = CONCAT('CUST-', LPAD(id, 6, '0'))
    WHERE customer_code IS NULL OR TRIM(customer_code) = ''
  `).catch(() => {})
}

async function createWalkInCustomerProfile(conn, { receiptNo, saleNumber, saleId } = {}) {
  const profileName = composeWalkInCustomerProfileName({ receiptNo, saleNumber, saleId })
  const notes = [
    'Auto-created walk-in customer profile.',
    receiptNo ? `Receipt: ${normalizeCustomerProfileToken(receiptNo)}` : null,
    saleNumber ? `Sale: ${normalizeCustomerProfileToken(saleNumber)}` : null,
    saleId ? `Sale ID: ${saleId}` : null
  ].filter(Boolean).join(' ')

  const [result] = await conn.query(
    `INSERT INTO customers (customer_code, full_name, name, phone, email, notes)
     VALUES (NULL, ?, ?, NULL, NULL, ?)`,
    [profileName, profileName, notes]
  )

  const customerId = Number(result.insertId)
  const customerCode = formatCustomerCode(customerId)
  if (customerCode) {
    await conn.query(
      'UPDATE customers SET customer_code = ? WHERE id = ?',
      [customerCode, customerId]
    )
  }

  return {
    id: customerId,
    customer_code: customerCode,
    full_name: profileName,
    phone: null,
    email: null
  }
}

async function ensureWalkInCustomerProfiles() {
  const conn = await db.pool.getConnection()
  let transactionStarted = false

  try {
    await ensureSalesCustomerProfileSchema(conn)

    await conn.beginTransaction()
    transactionStarted = true

    const [sales] = await conn.query(
      `SELECT id, sale_number, receipt_no
       FROM sales
       WHERE customer_id IS NULL
         AND status IN ('COMPLETED', 'REFUNDED')
       ORDER BY id ASC
       FOR UPDATE`
    )

    if (!sales.length) {
      await conn.commit()
      transactionStarted = false
      return { created: 0 }
    }

    let created = 0
    for (const sale of sales) {
      const customer = await createWalkInCustomerProfile(conn, {
        receiptNo: sale.receipt_no,
        saleNumber: sale.sale_number,
        saleId: sale.id
      })

      const [updateResult] = await conn.query(
        `UPDATE sales
         SET customer_id = ?,
             customer_name_snapshot = COALESCE(NULLIF(TRIM(customer_name_snapshot), ''), ?)
         WHERE id = ?
           AND customer_id IS NULL`,
        [customer.id, WALK_IN_CUSTOMER_LABEL, sale.id]
      )

      if (Number(updateResult.affectedRows) > 0) created += 1
    }

    await conn.commit()
    transactionStarted = false
    return { created }
  } catch (err) {
    if (transactionStarted) await conn.rollback().catch(() => {})
    throw err
  } finally {
    conn.release()
  }
}

function calculateSaleTaxBreakdown(totalAmount, taxRateValue) {
  const total = roundMoney(totalAmount)
  const taxRate = normalizeTaxRate(taxRateValue)

  if (total <= 0 || taxRate <= 0) {
    return {
      total,
      taxRate,
      taxRatePercentage: roundMoney(Math.max(taxRate, 0) * 100),
      vatableSales: 0,
      vatAmount: 0,
      nonVatSales: total,
      taxCalculationMethod: 'NON_VAT',
      invoiceType: 'Non-VAT Invoice'
    }
  }

  const vatableSales = roundMoney(total / (1 + taxRate))
  const vatAmount = roundMoney(total - vatableSales)

  return {
    total,
    taxRate,
    taxRatePercentage: roundMoney(taxRate * 100),
    vatableSales,
    vatAmount,
    nonVatSales: 0,
    taxCalculationMethod: 'INCLUSIVE',
    invoiceType: 'VAT Invoice'
  }
}

async function ensureSalesSchema() {
  if (ensureSalesSchemaPromise) return ensureSalesSchemaPromise

  ensureSalesSchemaPromise = (async () => {
    await db.pool.query(`
      CREATE TABLE IF NOT EXISTS configs (
        config_key VARCHAR(255) PRIMARY KEY,
        config_value TEXT,
        last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `)

    await db.pool.query(`
      CREATE TABLE IF NOT EXISTS sales_payments (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        sale_id BIGINT UNSIGNED NOT NULL UNIQUE,
        amount_received DECIMAL(12,2) DEFAULT 0.00,
        change_amount DECIMAL(12,2) DEFAULT 0.00,
        payment_method VARCHAR(64),
        received_by BIGINT UNSIGNED,
        received_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE,
        FOREIGN KEY (received_by) REFERENCES users(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `)

    await db.pool.query(`
      CREATE TABLE IF NOT EXISTS sale_return_items (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        sale_id BIGINT UNSIGNED NOT NULL,
        sale_item_id BIGINT UNSIGNED NOT NULL,
        product_id BIGINT UNSIGNED,
        quantity INT NOT NULL,
        unit_price DECIMAL(12,2) DEFAULT 0.00,
        reason TEXT,
        return_disposition VARCHAR(32) DEFAULT 'RESTOCK',
        accounting_reference VARCHAR(255),
        processed_by BIGINT UNSIGNED,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE,
        FOREIGN KEY (sale_item_id) REFERENCES sale_items(id) ON DELETE CASCADE,
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL,
        FOREIGN KEY (processed_by) REFERENCES users(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `)

    await db.pool.query(
      `INSERT IGNORE INTO configs (config_key, config_value) VALUES ('sales.tax_rate', ?)` ,
      [String(DEFAULT_TAX_RATE)]
    )

    const posPermissions = [
      ['sales.discount', 'Allow applying percentage discounts during POS checkout'],
      ['sales.price_override', 'Allow overriding line-item selling prices during POS checkout']
    ]
    for (const [name, description] of posPermissions) {
      await db.pool.query(
        'INSERT IGNORE INTO permissions (name, description) VALUES (?, ?)',
        [name, description]
      ).catch(() => {})
    }

    const rolePermissionGrants = {
      Admin: ['sales.discount', 'sales.price_override'],
      Manager: ['sales.discount', 'sales.price_override']
    }
    for (const [roleName, permissions] of Object.entries(rolePermissionGrants)) {
      const [roleRows] = await db.pool.query(
        'SELECT id FROM roles WHERE name = ? LIMIT 1',
        [roleName]
      ).catch(() => [[]])
      if (!roleRows.length) continue

      for (const permissionName of permissions) {
        const [permissionRows] = await db.pool.query(
          'SELECT id FROM permissions WHERE name = ? LIMIT 1',
          [permissionName]
        ).catch(() => [[]])
        if (!permissionRows.length) continue

        await db.pool.query(
          'INSERT IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)',
          [roleRows[0].id, permissionRows[0].id]
        ).catch(() => {})
      }
    }

    await db.pool.query('ALTER TABLE sales ADD COLUMN customer_name_snapshot VARCHAR(255) NULL').catch(() => {})
    await db.pool.query('ALTER TABLE sales ADD COLUMN customer_phone_snapshot VARCHAR(64) NULL').catch(() => {})
    await db.pool.query('ALTER TABLE sales ADD COLUMN customer_email_snapshot VARCHAR(255) NULL').catch(() => {})
    await db.pool.query('ALTER TABLE sales ADD COLUMN order_note TEXT NULL').catch(() => {})
    await db.pool.query("ALTER TABLE sales ADD COLUMN tax_calculation_method VARCHAR(16) NULL DEFAULT 'INCLUSIVE'").catch(() => {})
    await db.pool.query('ALTER TABLE sales ADD COLUMN vatable_sales DECIMAL(12,2) DEFAULT 0.00').catch(() => {})
    await db.pool.query('ALTER TABLE sales ADD COLUMN vat_amount DECIMAL(12,2) DEFAULT 0.00').catch(() => {})
    await db.pool.query('ALTER TABLE sale_items ADD COLUMN product_name_snapshot VARCHAR(255) NULL').catch(() => {})
    await db.pool.query('ALTER TABLE sale_items ADD COLUMN sku_snapshot VARCHAR(100) NULL').catch(() => {})
    await db.pool.query('ALTER TABLE sale_items ADD COLUMN brand_snapshot VARCHAR(255) NULL').catch(() => {})
    await db.pool.query('ALTER TABLE sale_items ADD COLUMN barcode_snapshot VARCHAR(128) NULL').catch(() => {})
    await db.pool.query('ALTER TABLE sale_items ADD COLUMN size_snapshot VARCHAR(64) NULL').catch(() => {})
    await db.pool.query('ALTER TABLE sale_items ADD COLUMN color_snapshot VARCHAR(64) NULL').catch(() => {})
    await db.pool.query('ALTER TABLE sale_items ADD COLUMN vat_amount DECIMAL(12,2) DEFAULT 0.00').catch(() => {})
    await db.pool.query("ALTER TABLE products ADD COLUMN status ENUM('available','sold','damaged','reserved','archived') DEFAULT 'available'").catch(() => {})
    await db.pool.query('CREATE INDEX idx_sales_tax_calculation_method ON sales(tax_calculation_method)').catch(() => {})
    await db.pool.query('CREATE INDEX idx_sales_vatable_sales ON sales(vatable_sales)').catch(() => {})

    // Keep older databases compatible when this column was introduced after table creation.
    await db.pool.query('ALTER TABLE sale_return_items ADD COLUMN accounting_reference VARCHAR(255) NULL')
      .catch(() => {})
    await db.pool.query("ALTER TABLE sale_return_items ADD COLUMN return_disposition VARCHAR(32) NULL DEFAULT 'RESTOCK'")
      .catch(() => {})

    await ensureSalesCustomerProfileSchema(db.pool)
  })().catch((err) => {
    ensureSalesSchemaPromise = null
    throw err
  })

  return ensureSalesSchemaPromise
}

async function getSalesTaxRate(conn = db.pool) {
  await ensureSalesSchema()
  try {
    const [rows] = await conn.query(
      'SELECT config_value FROM configs WHERE config_key = ? LIMIT 1',
      ['sales.tax_rate']
    )
    if (!rows.length) return DEFAULT_TAX_RATE
    return normalizeTaxRate(rows[0].config_value)
  } catch (err) {
    return DEFAULT_TAX_RATE
  }
}

function buildDateFilter(alias, column, from, to, params) {
  let clause = ''
  if (from) {
    clause += ` AND ${alias}.${column} >= ?`
    params.push(from)
  }
  if (to) {
    clause += ` AND ${alias}.${column} < DATE_ADD(?, INTERVAL 1 DAY)`
    params.push(to)
  }
  return clause
}

function buildSalesReturnStatus(soldQty, returnedQty) {
  const sold = Number(soldQty) || 0
  const returned = Number(returnedQty) || 0
  if (returned <= 0) return 'NONE'
  if (returned >= sold && sold > 0) return 'FULL'
  return 'PARTIAL'
}

function enrichSaleRecord(sale) {
  if (!sale) return sale

  const subtotal = roundMoney(sale.subtotal)
  const discount = roundMoney(sale.discount)
  const tax = roundMoney(sale.tax)
  const total = roundMoney(sale.total)
  const returnedQty = Number(sale.returned_qty) || 0
  const soldQty = Number(sale.sold_qty) || 0
  const returnedAmount = roundMoney(sale.returned_amount)
  const discountPercentage = subtotal > 0 ? roundMoney((discount / subtotal) * 100) : 0
  const storedVatableSales = roundMoney(sale.vatable_sales)
  const storedVatAmount = roundMoney(sale.vat_amount || tax)
  const derivedVatableSales = storedVatAmount > 0
    ? roundMoney(storedVatableSales > 0 ? storedVatableSales : Math.max(total - storedVatAmount, 0))
    : 0
  const nonVatSales = storedVatAmount > 0 ? 0 : total
  const taxRate = storedVatAmount > 0 && derivedVatableSales > 0
    ? roundMoney((storedVatAmount / derivedVatableSales) * 100)
    : 0

  return {
    ...sale,
    subtotal,
    discount,
    tax,
    vatable_sales: derivedVatableSales,
    vat_amount: storedVatAmount,
    non_vat_sales: roundMoney(nonVatSales),
    total,
    amount_received: roundMoney(sale.amount_received),
    change_amount: roundMoney(sale.change_amount),
    returned_amount: returnedAmount,
    returned_qty: returnedQty,
    sold_qty: soldQty,
    discount_percentage: discountPercentage,
    tax_rate_percentage: taxRate,
    tax_calculation_method: sale.tax_calculation_method || (storedVatAmount > 0 ? 'INCLUSIVE' : 'NON_VAT'),
    invoice_type: storedVatAmount > 0 ? 'VAT Invoice' : 'Non-VAT Invoice',
    return_status: buildSalesReturnStatus(soldQty, returnedQty)
  }
}

async function generateDocumentNumber(conn, tableName, columnName, prefix) {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)
    const random = String(Math.floor(Math.random() * 100000)).padStart(5, '0')
    const candidate = `${prefix}-${stamp}-${random}`
    const [rows] = await conn.query(
      `SELECT 1 AS found FROM ${tableName} WHERE ${columnName} = ? LIMIT 1`,
      [candidate]
    )
    if (!rows.length) return candidate
  }

  throw new Error(`failed to generate unique ${columnName}`)
}

async function loadProductsForSale(conn, productIds) {
  const uniqueProductIds = Array.from(
    new Set(
      productIds
        .map((id) => Number(id))
        .filter((id) => Number.isFinite(id) && id > 0)
    )
  )

  const products = new Map()
  for (const productId of uniqueProductIds) {
    const [rows] = await conn.query(
      'SELECT id, name, sku, brand, barcode, size, color, price, stock_quantity FROM products WHERE id = ? FOR UPDATE',
      [productId]
    )
    if (rows.length) products.set(productId, rows[0])
  }

  return products
}

async function prepareSaleItems(conn, items, options = {}) {
  const allowPriceOverride = options.allowPriceOverride === true
  const normalizedItems = Array.isArray(items)
    ? items
        .map((item) => ({
          product_id: Number(item?.product_id),
          quantity: Number(item?.quantity),
          unit_price: item?.unit_price
        }))
        .filter((item) => Number.isFinite(item.product_id) && item.product_id > 0 && Number.isFinite(item.quantity) && item.quantity > 0)
    : []

  if (!normalizedItems.length) {
    const err = new Error('at least one valid item is required')
    err.statusCode = 400
    throw err
  }

  const requestedQtyByProduct = new Map()
  for (const item of normalizedItems) {
    requestedQtyByProduct.set(
      item.product_id,
      (requestedQtyByProduct.get(item.product_id) || 0) + item.quantity
    )
  }

  const productRows = await loadProductsForSale(conn, normalizedItems.map((item) => item.product_id))
  for (const [productId, requestedQty] of requestedQtyByProduct.entries()) {
    const product = productRows.get(productId)
    if (!product) {
      const err = new Error(`product ${productId} not found`)
      err.statusCode = 400
      throw err
    }

    const availableStock = Number(product.stock_quantity) || 0
    if (requestedQty > availableStock) {
      const err = new Error(`Insufficient stock for ${product.name}. Available: ${availableStock}`)
      err.statusCode = 400
      throw err
    }
  }

  let subtotal = 0
  const processedItems = normalizedItems.map((item) => {
    const product = productRows.get(item.product_id)
    const hasExplicitUnitPrice = item.unit_price !== undefined && item.unit_price !== null && String(item.unit_price) !== ''
    const defaultUnitPrice = roundMoney(product.price)
    const requestedUnitPrice = hasExplicitUnitPrice
      ? Number(item.unit_price)
      : defaultUnitPrice

    if (!Number.isFinite(requestedUnitPrice) || requestedUnitPrice < 0) {
      const err = new Error('unit_price must be zero or greater')
      err.statusCode = 400
      throw err
    }

    const unitPrice = roundMoney(requestedUnitPrice)
    if (hasExplicitUnitPrice && unitPrice !== defaultUnitPrice && !allowPriceOverride) {
      const err = new Error(`Price override is not allowed for ${product.name}`)
      err.statusCode = 403
      throw err
    }

    const lineTotal = roundMoney(unitPrice * item.quantity)
    subtotal = roundMoney(subtotal + lineTotal)

    return {
      product_id: item.product_id,
      quantity: item.quantity,
      unit_price: roundMoney(unitPrice),
      line_total: lineTotal,
      product_name: product.name,
      sku: product.sku,
      brand: product.brand || null,
      barcode: product.barcode || null,
      size: product.size || null,
      color: product.color || null,
      stock_quantity: Number(product.stock_quantity) || 0
    }
  })

  return { processedItems, subtotal, productRows }
}

async function applySaleInventoryChanges(conn, processedItems, productRows, userId, saleInfo) {
  const currentQtyByProduct = new Map()
  for (const [productId, product] of productRows.entries()) {
    currentQtyByProduct.set(productId, Number(product.stock_quantity) || 0)
  }

  for (const item of processedItems) {
    const currentQty = currentQtyByProduct.get(item.product_id)
    const newQty = currentQty - item.quantity
    currentQtyByProduct.set(item.product_id, newQty)

    await conn.query(
      `UPDATE products
       SET stock_quantity = ?,
           status = CASE
             WHEN ? <= 0 THEN 'sold'
             ELSE COALESCE(status, 'available')
           END
       WHERE id = ?`,
      [newQty, newQty, item.product_id]
    )
    await conn.query(
      `INSERT INTO inventory_transactions (product_id, transaction_type, quantity, user_id, reason, balance_after, reference)
       VALUES (?, 'OUT', ?, ?, ?, ?, ?)`,
      [
        item.product_id,
        -item.quantity,
        userId,
        'POS sale deduction',
        newQty,
        `SALE_LINK|sale_id=${saleInfo.saleId}|sale_no=${saleInfo.saleNumber}|receipt=${saleInfo.receiptNo}`
      ]
    )
    await conn.query(
      `INSERT INTO sale_items
       (sale_id, product_id, qty, unit_price, line_total, product_name_snapshot, sku_snapshot, brand_snapshot, barcode_snapshot, size_snapshot, color_snapshot)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        saleInfo.saleId,
        item.product_id,
        item.quantity,
        item.unit_price,
        item.line_total,
        item.product_name || null,
        item.sku || null,
        item.brand || null,
        item.barcode || null,
        item.size || null,
        item.color || null
      ]
    )
  }
}

async function getSaleItems(conn, saleId) {
  const [items] = await conn.query(`
    SELECT
      si.*,
      COALESCE(si.product_name_snapshot, p.name) AS product_name,
      COALESCE(si.sku_snapshot, p.sku) AS sku,
      COALESCE(si.brand_snapshot, p.brand) AS brand,
      COALESCE(si.barcode_snapshot, p.barcode) AS barcode,
      COALESCE(si.size_snapshot, p.size) AS size,
      COALESCE(si.color_snapshot, p.color) AS color,
      COALESCE(ret.returned_qty, 0) AS returned_qty
    FROM sale_items si
    LEFT JOIN products p ON p.id = si.product_id
    LEFT JOIN (
      SELECT sale_item_id, SUM(quantity) AS returned_qty
      FROM sale_return_items
      GROUP BY sale_item_id
    ) ret ON ret.sale_item_id = si.id
    WHERE si.sale_id = ?
    ORDER BY si.id ASC
  `, [saleId])

  return items.map((item) => ({
    ...item,
    unit_price: roundMoney(item.unit_price),
    line_total: roundMoney(item.line_total),
    returned_qty: Number(item.returned_qty) || 0,
    available_to_return: Math.max((Number(item.qty) || 0) - (Number(item.returned_qty) || 0), 0)
  }))
}

async function getSaleById(conn, saleId) {
  const [rows] = await conn.query(`
    SELECT
      s.*,
      u.username AS clerk_name,
      c.customer_code AS customer_code,
      COALESCE(s.customer_name_snapshot, NULLIF(c.full_name, ''), c.name) AS customer_name,
      COALESCE(s.customer_phone_snapshot, c.phone) AS customer_phone,
      COALESCE(s.customer_email_snapshot, c.email) AS customer_email,
      sp.amount_received,
      sp.change_amount,
      sp.received_at AS payment_received_at,
      COALESCE(sold.sold_qty, 0) AS sold_qty,
      COALESCE(ret.returned_qty, 0) AS returned_qty,
      COALESCE(ret.returned_amount, 0) AS returned_amount
    FROM sales s
    LEFT JOIN users u ON u.id = s.clerk_id
    LEFT JOIN customers c ON c.id = s.customer_id
    LEFT JOIN sales_payments sp ON sp.sale_id = s.id
    LEFT JOIN (
      SELECT sale_id, SUM(qty) AS sold_qty
      FROM sale_items
      GROUP BY sale_id
    ) sold ON sold.sale_id = s.id
    LEFT JOIN (
      SELECT sale_id, SUM(quantity) AS returned_qty, SUM(quantity * unit_price) AS returned_amount
      FROM sale_return_items
      GROUP BY sale_id
    ) ret ON ret.sale_id = s.id
    WHERE s.id = ?
    LIMIT 1
  `, [saleId])

  if (!rows.length) return null

  const sale = enrichSaleRecord(rows[0])
  sale.items = await getSaleItems(conn, sale.id)
  return sale
}

async function getSaleByReceipt(conn, receiptNo) {
  const raw = String(receiptNo || '').trim()
  if (!raw) return null

  const compact = raw.replace(/\r?\n/g, ' ').trim()
  const tokenMatch = compact.match(/\b(?:RCT|REC|RECEIPT)[-_: ]?[A-Z0-9-]{6,}\b/i)
  const normalizedToken = tokenMatch?.[0]
    ? tokenMatch[0]
      .replace(/^RECEIPT[-_: ]?/i, 'RCT-')
      .replace(/^REC[-_: ]?/i, 'RCT-')
      .replace(/^RCT[-_: ]?/i, 'RCT-')
      .replace(/\s+/g, '')
      .toUpperCase()
    : compact
  const normalizedInput = normalizedToken.toUpperCase()

  const [rows] = await conn.query(
    `SELECT id
     FROM sales
     WHERE UPPER(TRIM(receipt_no)) = ?
        OR UPPER(TRIM(sale_number)) = ?
     LIMIT 1`,
    [normalizedInput, normalizedInput]
  )

  if (!rows.length) return null
  return getSaleById(conn, rows[0].id)
}

async function processSaleReturn(conn, sale, requestedItems, userId, reason, accountingReference, returnDisposition) {
  if (!sale || !sale.id) {
    const err = new Error('sale not found')
    err.statusCode = 404
    throw err
  }

  if (String(sale.status).toUpperCase() === 'CANCELLED') {
    const err = new Error('cancelled sales cannot be returned')
    err.statusCode = 400
    throw err
  }

  const [lockedSaleItems] = await conn.query(
    'SELECT id, sale_id, product_id, qty, unit_price FROM sale_items WHERE sale_id = ? FOR UPDATE',
    [sale.id]
  )

  const [returnRows] = await conn.query(
    'SELECT sale_item_id, SUM(quantity) AS returned_qty FROM sale_return_items WHERE sale_id = ? GROUP BY sale_item_id',
    [sale.id]
  )

  const returnedQtyByItem = new Map(
    returnRows.map((row) => [Number(row.sale_item_id), Number(row.returned_qty) || 0])
  )
  const saleItemMap = new Map(lockedSaleItems.map((item) => [Number(item.id), item]))

  const normalizedRequests = Array.isArray(requestedItems)
    ? requestedItems
        .map((item) => ({
          sale_item_id: Number(item?.sale_item_id),
          quantity: Number(item?.quantity)
        }))
        .filter((item) => Number.isFinite(item.sale_item_id) && item.sale_item_id > 0 && Number.isFinite(item.quantity) && item.quantity > 0)
    : []

  if (!normalizedRequests.length) {
    const err = new Error('at least one return item is required')
    err.statusCode = 400
    throw err
  }

  const normalizedAccountingReference = String(accountingReference || '').trim()

  const normalizedDisposition = String(returnDisposition || 'RESTOCK').trim().toUpperCase()
  if (!RETURN_DISPOSITIONS.includes(normalizedDisposition)) {
    const err = new Error(`return_disposition must be one of: ${RETURN_DISPOSITIONS.join(', ')}`)
    err.statusCode = 400
    throw err
  }

  const productLocks = new Map()
  const processed = []

  for (const request of normalizedRequests) {
    const saleItem = saleItemMap.get(request.sale_item_id)
    if (!saleItem || Number(saleItem.sale_id) !== Number(sale.id)) {
      const err = new Error(`sale item ${request.sale_item_id} is not part of receipt ${sale.receipt_no}`)
      err.statusCode = 400
      throw err
    }

    const soldQty = Number(saleItem.qty) || 0
    const alreadyReturned = returnedQtyByItem.get(request.sale_item_id) || 0
    const availableToReturn = Math.max(soldQty - alreadyReturned, 0)
    if (request.quantity > availableToReturn) {
      const err = new Error(`Cannot return ${request.quantity}. Only ${availableToReturn} item(s) available to return for sale item ${saleItem.id}`)
      err.statusCode = 400
      throw err
    }

    if (!saleItem.product_id) {
      const err = new Error('returned item is no longer linked to a product')
      err.statusCode = 400
      throw err
    }

    if (!productLocks.has(saleItem.product_id)) {
      const [productRows] = await conn.query(
        'SELECT id, name, stock_quantity FROM products WHERE id = ? FOR UPDATE',
        [saleItem.product_id]
      )
      if (!productRows.length) {
        const err = new Error(`product ${saleItem.product_id} not found`)
        err.statusCode = 400
        throw err
      }
      productLocks.set(saleItem.product_id, productRows[0])
    }

    processed.push({
      sale_item_id: saleItem.id,
      product_id: saleItem.product_id,
      quantity: request.quantity,
      unit_price: roundMoney(saleItem.unit_price),
      product_name: productLocks.get(saleItem.product_id).name
    })
  }

  for (const item of processed) {
    const product = productLocks.get(item.product_id)
    const qtyBefore = Number(product.stock_quantity) || 0
    const qtyAfterReturn = qtyBefore + item.quantity
    product.stock_quantity = qtyAfterReturn

    const normalizedReason = String(reason || '').trim()
    const returnReasonText = normalizedReason || `Sale return (${normalizedDisposition})`

    if (normalizedDisposition === 'RESTOCK') {
      await conn.query(
        `UPDATE products
         SET stock_quantity = ?, status = 'available'
         WHERE id = ?`,
        [qtyAfterReturn, item.product_id]
      )
    } else {
      await conn.query(
        `UPDATE products
         SET stock_quantity = ?
         WHERE id = ?`,
        [qtyAfterReturn, item.product_id]
      )
    }
    await conn.query(
      `INSERT INTO inventory_transactions (product_id, transaction_type, quantity, user_id, reason, balance_after, reference)
       VALUES (?, 'RETURN', ?, ?, ?, ?, ?)`,
      [
        item.product_id,
        item.quantity,
        userId,
        returnReasonText,
        qtyAfterReturn,
        `SALE_RETURN|receipt=${sale.receipt_no}|sale_id=${sale.id}|sale_item_id=${item.sale_item_id}${normalizedAccountingReference ? `|acct_ref=${normalizedAccountingReference}` : ''}|disposition=${normalizedDisposition}`
      ]
    )

    if (normalizedDisposition !== 'RESTOCK') {
      const qtyAfterStockOut = Math.max(qtyAfterReturn - item.quantity, 0)
      product.stock_quantity = qtyAfterStockOut
      const dispositionStatus = normalizedDisposition === 'DAMAGE' ? 'damaged' : 'archived'
      await conn.query(
        `UPDATE products
         SET stock_quantity = ?,
             status = CASE
               WHEN ? <= 0 THEN ?
               ELSE COALESCE(status, 'available')
             END
         WHERE id = ?`,
        [qtyAfterStockOut, qtyAfterStockOut, dispositionStatus, item.product_id]
      )
      await conn.query(
        `INSERT INTO inventory_transactions (product_id, transaction_type, quantity, user_id, reason, balance_after, reference)
         VALUES (?, 'OUT', ?, ?, ?, ?, ?)`,
        [
          item.product_id,
          -item.quantity,
          userId,
          `STOCK_OUT:${normalizedDisposition}${normalizedReason ? ` | ${normalizedReason}` : ''}`,
          qtyAfterStockOut,
          `STOCK_OUT|disposition=${normalizedDisposition}|receipt=${sale.receipt_no}|sale_id=${sale.id}|sale_item_id=${item.sale_item_id}${normalizedAccountingReference ? `|acct_ref=${normalizedAccountingReference}` : ''}`
        ]
      )
    }

    await conn.query(
      `INSERT INTO sale_return_items (sale_id, sale_item_id, product_id, quantity, unit_price, reason, return_disposition, accounting_reference, processed_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [sale.id, item.sale_item_id, item.product_id, item.quantity, item.unit_price, reason || null, normalizedDisposition, normalizedAccountingReference || null, userId]
    )
  }

  const [totals] = await conn.query(
    `SELECT
       COALESCE((SELECT SUM(qty) FROM sale_items WHERE sale_id = ?), 0) AS sold_qty,
       COALESCE((SELECT SUM(quantity) FROM sale_return_items WHERE sale_id = ?), 0) AS returned_qty`,
    [sale.id, sale.id]
  )

  const soldQty = Number(totals[0]?.sold_qty) || 0
  const returnedQty = Number(totals[0]?.returned_qty) || 0
  const nextStatus = soldQty > 0 && returnedQty >= soldQty ? 'REFUNDED' : 'COMPLETED'
  await conn.query('UPDATE sales SET status = ? WHERE id = ?', [nextStatus, sale.id])

  return processed
}

module.exports = {
  DEFAULT_TAX_RATE,
  PAYMENT_METHODS,
  WALK_IN_CUSTOMER_LABEL,
  roundMoney,
  normalizeDiscountPercentage,
  normalizeTaxRate,
  calculateSaleTaxBreakdown,
  ensureSalesSchema,
  getSalesTaxRate,
  buildDateFilter,
  buildSalesReturnStatus,
  enrichSaleRecord,
  generateDocumentNumber,
  createWalkInCustomerProfile,
  ensureWalkInCustomerProfiles,
  prepareSaleItems,
  applySaleInventoryChanges,
  getSaleItems,
  getSaleById,
  getSaleByReceipt,
  processSaleReturn
}
