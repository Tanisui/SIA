const db = require('./src/database')

async function migrate() {
  const pool = db.pool
  let conn = null
  
  try {
    console.log('Connecting to database...')
    conn = await pool.getConnection()
    console.log('✓ Connected to database')
    
    console.log('Checking if employee_id column exists in users table...')
    
    const [columns] = await conn.query(
      "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'users' AND TABLE_SCHEMA = DATABASE() AND COLUMN_NAME = 'employee_id'"
    )
    
    if (columns.length === 0) {
      console.log('Adding employee_id column to users table...')
      await conn.query(
        'ALTER TABLE users ADD COLUMN employee_id BIGINT UNSIGNED DEFAULT NULL'
      )
      console.log('✓ Added employee_id column to users table')
    } else {
      console.log('✓ employee_id column already exists')
    }
    
    console.log('✓ Migration completed successfully')
    process.exit(0)
  } catch (err) {
    console.error('Migration failed:', err.message || err)
    process.exit(1)
  } finally {
    if (conn) conn.release()
  }
}

migrate()

