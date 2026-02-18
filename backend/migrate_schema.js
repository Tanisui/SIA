/**
 * Comprehensive migration: brings the existing Laravel-skeleton DB
 * in line with the Node.js backend's expected schema.
 */
const mysql = require('mysql2/promise')
require('dotenv').config()

async function run() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USERNAME || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_DATABASE || 'cecilles_nstyle_db',
    multipleStatements: true
  })

  const exec = async (label, sql, params) => {
    try {
      await conn.query(sql, params)
      console.log('  ✓ ' + label)
    } catch (e) {
      if (e.code === 'ER_DUP_FIELDNAME' || e.code === 'ER_DUP_COLUMN_NAME' || e.message.includes('Duplicate column')) {
        console.log('  · ' + label + ' (already exists)')
      } else {
        console.error('  ✗ ' + label + ': ' + e.message)
      }
    }
  }

  console.log('Connected to ' + (process.env.DB_DATABASE || 'cecilles_nstyle_db') + '\n')

  // ═══════════════════════════════════════════════════════
  // 1. FIX USERS TABLE — add missing columns
  // ═══════════════════════════════════════════════════════
  console.log('1. Fixing users table...')

  // Check if username column exists
  const [userCols] = await conn.query("SHOW COLUMNS FROM users")
  const colNames = userCols.map(c => c.Field)

  if (!colNames.includes('username')) {
    // Add username, default to name or email prefix
    await exec('Add username column', "ALTER TABLE users ADD COLUMN username VARCHAR(100) AFTER id")
    await exec('Populate username from name', "UPDATE users SET username = LOWER(REPLACE(name, ' ', '_')) WHERE username IS NULL AND name IS NOT NULL")
    await exec('Populate username from email', "UPDATE users SET username = SUBSTRING_INDEX(email, '@', 1) WHERE username IS NULL AND email IS NOT NULL")
    // Try making it unique (may fail if duplicates)
    try {
      await conn.query("ALTER TABLE users ADD UNIQUE INDEX idx_username (username)")
      console.log('  ✓ Made username unique')
    } catch (e) { console.log('  · username unique index: ' + e.message) }
  } else {
    console.log('  · username column already exists')
  }

  if (!colNames.includes('password_hash')) {
    await exec('Add password_hash column', "ALTER TABLE users ADD COLUMN password_hash VARCHAR(255) AFTER email")
    // Copy password to password_hash (they may be bcrypt hashes from Laravel, won't work with pbkdf2 but at least the column exists)
    await exec('Copy password to password_hash', "UPDATE users SET password_hash = password WHERE password_hash IS NULL AND password IS NOT NULL")
  } else {
    console.log('  · password_hash column already exists')
  }

  if (!colNames.includes('full_name')) {
    await exec('Add full_name column', "ALTER TABLE users ADD COLUMN full_name VARCHAR(255) AFTER password_hash")
    await exec('Populate full_name from name', "UPDATE users SET full_name = name WHERE full_name IS NULL AND name IS NOT NULL")
  } else {
    console.log('  · full_name column already exists')
  }

  if (!colNames.includes('is_active')) {
    await exec('Add is_active column', "ALTER TABLE users ADD COLUMN is_active TINYINT(1) DEFAULT 1")
  } else {
    console.log('  · is_active column already exists')
  }

  // ═══════════════════════════════════════════════════════
  // 2. FIX PRODUCTS TABLE — add all missing columns
  // ═══════════════════════════════════════════════════════
  console.log('\n2. Fixing products table...')

  const [prodCols] = await conn.query("SHOW COLUMNS FROM products")
  const prodColNames = prodCols.map(c => c.Field)

  const productAlters = [
    ['sku', "ADD COLUMN sku VARCHAR(100) UNIQUE AFTER id"],
    ['name', "ADD COLUMN name VARCHAR(255) NOT NULL DEFAULT '' AFTER sku"],
    ['description', "ADD COLUMN description TEXT AFTER name"],
    ['category_id', "ADD COLUMN category_id INT UNSIGNED AFTER description"],
    ['price', "ADD COLUMN price DECIMAL(12,2) DEFAULT 0.00 AFTER category_id"],
    ['cost', "ADD COLUMN cost DECIMAL(12,2) DEFAULT 0.00 AFTER price"],
    ['stock_quantity', "ADD COLUMN stock_quantity INT DEFAULT 0 AFTER cost"],
    ['low_stock_threshold', "ADD COLUMN low_stock_threshold INT DEFAULT 10 AFTER stock_quantity"],
    ['size', "ADD COLUMN size VARCHAR(64) AFTER low_stock_threshold"],
    ['color', "ADD COLUMN color VARCHAR(64) AFTER size"],
    ['barcode', "ADD COLUMN barcode VARCHAR(128) AFTER color"],
    ['images', "ADD COLUMN images JSON AFTER barcode"],
    ['is_active', "ADD COLUMN is_active TINYINT(1) DEFAULT 1 AFTER images"],
  ]

  for (const [col, alter] of productAlters) {
    if (!prodColNames.includes(col)) {
      await exec('Add products.' + col, 'ALTER TABLE products ' + alter)
    } else {
      console.log('  · products.' + col + ' already exists')
    }
  }

  // ═══════════════════════════════════════════════════════
  // 3. FIX EMPLOYEES TABLE — add missing columns
  // ═══════════════════════════════════════════════════════
  console.log('\n3. Fixing employees table...')

  const [empCols] = await conn.query("SHOW COLUMNS FROM employees")
  const empColNames = empCols.map(c => c.Field)

  const employeeAlters = [
    ['name', "ADD COLUMN name VARCHAR(255) NOT NULL DEFAULT '' AFTER id"],
    ['role', "ADD COLUMN role VARCHAR(100) AFTER name"],
    ['contact', "ADD COLUMN contact VARCHAR(255) AFTER role"],
    ['hire_date', "ADD COLUMN hire_date DATE AFTER contact"],
    ['pay_rate', "ADD COLUMN pay_rate DECIMAL(12,2) DEFAULT 0.00 AFTER hire_date"],
    ['employment_status', "ADD COLUMN employment_status ENUM('ACTIVE','INACTIVE','TERMINATED') DEFAULT 'ACTIVE' AFTER pay_rate"],
    ['bank_details', "ADD COLUMN bank_details JSON AFTER employment_status"],
  ]

  for (const [col, alter] of employeeAlters) {
    if (!empColNames.includes(col)) {
      await exec('Add employees.' + col, 'ALTER TABLE employees ' + alter)
    } else {
      console.log('  · employees.' + col + ' already exists')
    }
  }

  // ═══════════════════════════════════════════════════════
  // 4. CREATE RBAC TABLES
  // ═══════════════════════════════════════════════════════
  console.log('\n4. Creating RBAC tables...')

  await exec('Create categories table', `
    CREATE TABLE IF NOT EXISTS categories (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(150) NOT NULL,
      description TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)

  await exec('Create roles table', `
    CREATE TABLE IF NOT EXISTS roles (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(100) UNIQUE,
      description VARCHAR(255),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)

  await exec('Create permissions table', `
    CREATE TABLE IF NOT EXISTS permissions (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(150) UNIQUE,
      description VARCHAR(255)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)

  await exec('Create role_permissions table', `
    CREATE TABLE IF NOT EXISTS role_permissions (
      role_id INT UNSIGNED NOT NULL,
      permission_id INT UNSIGNED NOT NULL,
      PRIMARY KEY (role_id, permission_id),
      FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
      FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)

  await exec('Create user_roles table', `
    CREATE TABLE IF NOT EXISTS user_roles (
      user_id BIGINT UNSIGNED NOT NULL,
      role_id INT UNSIGNED NOT NULL,
      PRIMARY KEY (user_id, role_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)

  await exec('Create user_permissions table', `
    CREATE TABLE IF NOT EXISTS user_permissions (
      user_id BIGINT UNSIGNED NOT NULL,
      permission_id INT UNSIGNED NOT NULL,
      PRIMARY KEY (user_id, permission_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)

  // ═══════════════════════════════════════════════════════
  // 5. ENSURE OTHER TABLES EXIST
  // ═══════════════════════════════════════════════════════
  console.log('\n5. Ensuring other tables...')

  await exec('Ensure inventory_transactions', `
    CREATE TABLE IF NOT EXISTS inventory_transactions (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      product_id BIGINT UNSIGNED NOT NULL,
      transaction_type ENUM('IN','OUT','ADJUST','RETURN') NOT NULL,
      quantity INT NOT NULL,
      location VARCHAR(255),
      reference VARCHAR(255),
      user_id BIGINT UNSIGNED,
      reason TEXT,
      balance_after INT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)

  await exec('Ensure damaged_inventory', `
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

  await exec('Ensure customers', `
    CREATE TABLE IF NOT EXISTS customers (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      phone VARCHAR(50),
      email VARCHAR(255),
      address TEXT,
      notes TEXT,
      loyalty_points INT DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)

  await exec('Ensure suppliers', `
    CREATE TABLE IF NOT EXISTS suppliers (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      contact_person VARCHAR(255),
      phone VARCHAR(50),
      email VARCHAR(255),
      address TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)

  await exec('Ensure purchase_orders', `
    CREATE TABLE IF NOT EXISTS purchase_orders (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      po_number VARCHAR(100) UNIQUE,
      supplier_id BIGINT UNSIGNED,
      status ENUM('OPEN','RECEIVED','CANCELLED') DEFAULT 'OPEN',
      expected_date DATE,
      total DECIMAL(12,2) DEFAULT 0.00,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)

  await exec('Ensure purchase_items', `
    CREATE TABLE IF NOT EXISTS purchase_items (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      purchase_order_id BIGINT UNSIGNED NOT NULL,
      product_id BIGINT UNSIGNED NOT NULL,
      quantity INT NOT NULL,
      unit_cost DECIMAL(12,2) DEFAULT 0.00,
      FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)

  await exec('Ensure sales', `
    CREATE TABLE IF NOT EXISTS sales (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      sale_number VARCHAR(100) UNIQUE,
      date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      clerk_id BIGINT UNSIGNED,
      customer_id BIGINT UNSIGNED,
      subtotal DECIMAL(12,2) DEFAULT 0.00,
      tax DECIMAL(12,2) DEFAULT 0.00,
      discount DECIMAL(12,2) DEFAULT 0.00,
      total DECIMAL(12,2) DEFAULT 0.00,
      payment_method VARCHAR(64),
      status ENUM('COMPLETED','REFUNDED','CANCELLED') DEFAULT 'COMPLETED',
      receipt_no VARCHAR(100),
      FOREIGN KEY (clerk_id) REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)

  // Fix sale_items: ensure product_id is NULLABLE for ON DELETE SET NULL
  try {
    const [tables] = await conn.query("SHOW TABLES LIKE 'sale_items'")
    if (tables.length) {
      const [cols] = await conn.query("SHOW COLUMNS FROM sale_items WHERE Field = 'product_id'")
      if (cols.length && cols[0].Null === 'NO') {
        console.log('  ! sale_items.product_id is NOT NULL — recreating table...')
        await conn.query('SET FOREIGN_KEY_CHECKS = 0')
        await conn.query('DROP TABLE sale_items')
        await conn.query('SET FOREIGN_KEY_CHECKS = 1')
      }
    }
  } catch (e) { /* table doesn't exist */ }

  await exec('Ensure sale_items (product_id nullable)', `
    CREATE TABLE IF NOT EXISTS sale_items (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      sale_id BIGINT UNSIGNED NOT NULL,
      product_id BIGINT UNSIGNED,
      qty INT NOT NULL,
      unit_price DECIMAL(12,2) DEFAULT 0.00,
      line_total DECIMAL(12,2) DEFAULT 0.00,
      FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)

  // ═══════════════════════════════════════════════════════
  // 6. ENSURE PAYROLLS, ATTENDANCE, etc.
  // ═══════════════════════════════════════════════════════
  console.log('\n6. Ensuring remaining tables...')

  await exec('Ensure attendance', `
    CREATE TABLE IF NOT EXISTS attendance (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      employee_id BIGINT UNSIGNED NOT NULL,
      date DATE NOT NULL,
      clock_in TIME,
      clock_out TIME,
      hours_worked DECIMAL(5,2),
      notes TEXT,
      FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)

  await exec('Ensure payrolls', `
    CREATE TABLE IF NOT EXISTS payrolls (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      employee_id BIGINT UNSIGNED NOT NULL,
      period_start DATE,
      period_end DATE,
      gross_pay DECIMAL(12,2) DEFAULT 0.00,
      deductions DECIMAL(12,2) DEFAULT 0.00,
      advances DECIMAL(12,2) DEFAULT 0.00,
      net_pay DECIMAL(12,2) DEFAULT 0.00,
      status ENUM('PENDING','PROCESSED','PAID') DEFAULT 'PENDING',
      processed_by BIGINT UNSIGNED,
      processed_at TIMESTAMP NULL,
      FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
      FOREIGN KEY (processed_by) REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)

  await exec('Ensure saved_reports', `
    CREATE TABLE IF NOT EXISTS saved_reports (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255),
      filters JSON,
      owner_id BIGINT UNSIGNED,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)

  await exec('Ensure audit_logs', `
    CREATE TABLE IF NOT EXISTS audit_logs (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      user_id BIGINT UNSIGNED,
      action VARCHAR(255) NOT NULL,
      resource_type VARCHAR(100),
      resource_id VARCHAR(255),
      details JSON,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)

  await exec('Ensure files', `
    CREATE TABLE IF NOT EXISTS files (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      path VARCHAR(1024) NOT NULL,
      original_name VARCHAR(255),
      type VARCHAR(50),
      size BIGINT,
      uploaded_by BIGINT UNSIGNED,
      uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)

  await exec('Ensure notifications', `
    CREATE TABLE IF NOT EXISTS notifications (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      type VARCHAR(100),
      recipient_user_id BIGINT UNSIGNED,
      payload JSON,
      status ENUM('PENDING','SENT','FAILED') DEFAULT 'PENDING',
      sent_at TIMESTAMP NULL,
      FOREIGN KEY (recipient_user_id) REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)

  await exec('Ensure configs', `
    CREATE TABLE IF NOT EXISTS configs (
      config_key VARCHAR(255) PRIMARY KEY,
      config_value TEXT,
      last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)

  await exec('Ensure api_keys', `
    CREATE TABLE IF NOT EXISTS api_keys (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255),
      \`key\` VARCHAR(255) UNIQUE,
      permissions JSON,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)

  await exec('Ensure webhooks', `
    CREATE TABLE IF NOT EXISTS webhooks (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255),
      url VARCHAR(1024),
      events JSON,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)

  console.log('\n═══════════════════════════════════════')
  console.log('✓ Database migration complete!')
  console.log('═══════════════════════════════════════')
  console.log('\nNext: run "node src/migrations/seed.js" to seed roles & permissions.')

  await conn.end()
}

run().catch(err => {
  console.error('\nMigration FAILED:', err)
  process.exit(1)
})
