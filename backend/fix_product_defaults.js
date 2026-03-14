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

  try {
    await conn.query("ALTER TABLE products MODIFY name VARCHAR(255) NOT NULL DEFAULT ''")
    console.log('✓ Added default value to name column')
    
    await conn.query('ALTER TABLE products MODIFY price DECIMAL(12,2) NOT NULL DEFAULT 0.00')
    console.log('✓ Added default value to price column')
  } catch (err) {
    console.error('Error:', err.message)
  } finally {
    await conn.end()
  }
}

run()
