/**
 * Final foreign key constraint fix
 * - Convert users.id from BIGINT to INT UNSIGNED
 * - Handle existing foreign key constraints
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

  const exec = async (label, sql) => {
    try {
      await conn.query(sql)
      console.log('  ✓ ' + label)
      return true
    } catch (e) {
      console.error('  ✗ ' + label + ': ' + e.message)
      return false
    }
  }

  console.log('Starting final foreign key fix...\n')

  try {
    console.log('1. Disabling foreign key checks...')
    await conn.query('SET FOREIGN_KEY_CHECKS = 0')
    console.log('  ✓ Foreign key checks disabled\n')

    // Drop the existing foreign key
    console.log('2. Dropping existing foreign key constraints...')
    await exec('Drop fk_employee_user', 'ALTER TABLE employees DROP FOREIGN KEY fk_employee_user')

    // Convert users.id type
    console.log('\n3. Converting users.id to INT UNSIGNED...')
    // First drop the primary key constraint on AUTO_INCREMENT column
    await exec('Drop users PRIMARY KEY', 'ALTER TABLE users DROP PRIMARY KEY')
    // Change the column type
    await exec('Change users.id type', 'ALTER TABLE users CHANGE COLUMN id id INT UNSIGNED NOT NULL AUTO_INCREMENT')
    // Re-add the primary key
    await exec('Add users PRIMARY KEY', 'ALTER TABLE users ADD PRIMARY KEY (id)')

    // If employees.user_id exists, convert it too
    console.log('\n4. Checking and fixing employees.user_id if exists...')
    const [empCols] = await conn.query('SHOW COLUMNS FROM employees WHERE Field = "user_id"')
    if (empCols.length) {
      await exec('Change employees.user_id type', 'ALTER TABLE employees MODIFY user_id INT UNSIGNED')
    }

    // Re-add the foreign key constraint
    console.log('\n5. Re-adding foreign key constraints...')
    if (empCols.length) {
      await exec('Add fk_employee_user FK', 
        'ALTER TABLE employees ADD CONSTRAINT fk_employee_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL')
    }

    console.log('\n6. Re-enabling foreign key checks...')
    await conn.query('SET FOREIGN_KEY_CHECKS = 1')
    console.log('  ✓ Foreign key checks re-enabled\n')

    console.log('═══════════════════════════════════════')
    console.log('✓ Foreign key constraints fixed!')
    console.log('✓ users.id is now INT UNSIGNED')
    console.log('✓ All references are now compatible')
    console.log('═══════════════════════════════════════')
  } catch (err) {
    console.error('\nFix FAILED:', err.message)
  } finally {
    await conn.end()
  }
}

run().catch(err => {
  console.error('\nFatal error:', err)
  process.exit(1)
})
