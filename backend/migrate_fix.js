const mysql = require('mysql2/promise')
require('dotenv').config()

async function run() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USERNAME || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_DATABASE || 'cecilles_nstyle_db'
  })

  console.log('Connected to database.\n')

  // ── 1. Ensure products table has low_stock_threshold + is_active ──
  try {
    const [cols] = await conn.query("SHOW COLUMNS FROM products LIKE 'low_stock_threshold'")
    if (!cols.length) {
      await conn.query("ALTER TABLE products ADD COLUMN low_stock_threshold INT DEFAULT 10 AFTER stock_quantity")
      console.log('Added low_stock_threshold column to products')
    } else {
      console.log('low_stock_threshold column already exists')
    }
  } catch (e) { console.error('Error checking low_stock_threshold:', e.message) }

  try {
    const [cols] = await conn.query("SHOW COLUMNS FROM products LIKE 'is_active'")
    if (!cols.length) {
      await conn.query("ALTER TABLE products ADD COLUMN is_active TINYINT(1) DEFAULT 1 AFTER barcode")
      console.log('Added is_active column to products')
    } else {
      console.log('is_active column already exists')
    }
  } catch (e) { console.error('Error checking is_active:', e.message) }

  // ── 2. Ensure inventory_transactions table exists ──
  await conn.query(`
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
  console.log('Ensured inventory_transactions table exists')

  // ── 3. Ensure damaged_inventory table exists ──
  await conn.query(`
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
  console.log('Ensured damaged_inventory table exists')

  // ── 4. Ensure customers table exists ──
  await conn.query(`
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
  console.log('Ensured customers table exists')

  // ── 5. Ensure suppliers table exists ──
  await conn.query(`
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
  console.log('Ensured suppliers table exists')

  // ── 6. Ensure purchase_orders table exists ──
  await conn.query(`
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
  console.log('Ensured purchase_orders table exists')

  // ── 7. Ensure purchase_items table exists ──
  await conn.query(`
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
  console.log('Ensured purchase_items table exists')

  // ── 8. Ensure sales table exists ──
  await conn.query(`
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
  console.log('Ensured sales table exists')

  // ── 9. Fix sale_items: drop and recreate with nullable product_id ──
  // Check if sale_items exists and has the NOT NULL constraint issue
  try {
    const [tables] = await conn.query("SHOW TABLES LIKE 'sale_items'")
    if (tables.length) {
      // Check if product_id is NOT NULL (the bug)
      const [cols] = await conn.query("SHOW COLUMNS FROM sale_items WHERE Field = 'product_id'")
      if (cols.length && cols[0].Null === 'NO') {
        console.log('sale_items.product_id is NOT NULL — fixing...')
        // Drop and recreate the table
        await conn.query('DROP TABLE sale_items')
        console.log('Dropped old sale_items table')
      } else {
        console.log('sale_items table exists and product_id is already nullable — OK')
      }
    }
  } catch (e) { /* table doesn't exist, will create below */ }

  await conn.query(`
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
  console.log('Ensured sale_items table exists (product_id nullable, ON DELETE SET NULL)')

  // ── 10. Seed missing permissions ──
  const newPermissions = [
    'purchase.update',
    'purchase.delete',
    'inventory.create',
    'inventory.update'
  ]
  for (const perm of newPermissions) {
    await conn.query('INSERT IGNORE INTO permissions (name, description) VALUES (?, ?)', [perm, perm])
  }
  console.log('Ensured new permissions exist: ' + newPermissions.join(', '))

  console.log('\n✓ Migration complete!')
  await conn.end()
}

run().catch(err => {
  console.error('Migration error:', err)
  process.exit(1)
})
