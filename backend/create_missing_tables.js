const db = require('./src/database')

async function createMissingTables() {
  try {
    // Check and create sale_items table
    await db.pool.query(`
      CREATE TABLE IF NOT EXISTS sale_items (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        sale_id BIGINT UNSIGNED NOT NULL,
        product_id BIGINT,
        qty INT NOT NULL,
        unit_price DECIMAL(12,2) DEFAULT 0.00,
        line_total DECIMAL(12,2) DEFAULT 0.00,
        FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE,
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `)
    console.log('✓ sale_items table created/verified')

    // Check and create inventory_transactions table
    await db.pool.query(`
      CREATE TABLE IF NOT EXISTS inventory_transactions (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        product_id BIGINT,
        transaction_type ENUM('IN','OUT','ADJUST','RETURN') NOT NULL,
        quantity INT NOT NULL,
        location VARCHAR(255),
        reference VARCHAR(255),
        user_id INT UNSIGNED,
        reason TEXT,
        balance_after INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `)
    console.log('✓ inventory_transactions table created/verified')

    // Check and create damaged_inventory table
    await db.pool.query(`
      CREATE TABLE IF NOT EXISTS damaged_inventory (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        product_id BIGINT,
        quantity INT NOT NULL,
        reason TEXT,
        reported_by INT UNSIGNED,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL,
        FOREIGN KEY (reported_by) REFERENCES users(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `)
    console.log('✓ damaged_inventory table created/verified')

    console.log('\n✓ All missing tables have been created!')
    process.exit(0)
  } catch (err) {
    console.error('Error:', err.message)
    process.exit(1)
  }
}

createMissingTables()
