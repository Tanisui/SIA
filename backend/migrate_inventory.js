const db = require('./src/database');

(async () => {
  try {
    // Add low_stock_threshold column to products if not exists
    try {
      await db.pool.query('ALTER TABLE products ADD COLUMN low_stock_threshold INT DEFAULT 10 AFTER stock_quantity');
      console.log('Added low_stock_threshold column');
    } catch(e) {
      if (e.code === 'ER_DUP_FIELDNAME') console.log('low_stock_threshold column already exists');
      else console.log('low_stock_threshold error:', e.message);
    }

    // Add is_active column to products if not exists
    try {
      await db.pool.query('ALTER TABLE products ADD COLUMN is_active TINYINT(1) DEFAULT 1 AFTER images');
      console.log('Added is_active column to products');
    } catch(e) {
      if (e.code === 'ER_DUP_FIELDNAME') console.log('is_active column already exists in products');
      else console.log('is_active error:', e.message);
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
    `);
    console.log('Created/verified damaged_inventory table');

    console.log('\nMigration complete!');
    process.exit(0);
  } catch(err) {
    console.error('Migration error:', err);
    process.exit(1);
  }
})();
