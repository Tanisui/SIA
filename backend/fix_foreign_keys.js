/**
 * Migration to fix foreign key constraint errors
 * Converts BIGINT UNSIGNED to INT UNSIGNED for:
 * - users.id
 * - employees.id
 * - All user/employee references in dependent tables
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

  console.log('Starting foreign key migration...\n')

  try {
    console.log('1. Disabling foreign key checks...')
    await conn.query('SET FOREIGN_KEY_CHECKS = 0')
    console.log('  ✓ Foreign key checks disabled\n')

    // Drop the problematic tables first (with data loss)
    console.log('2. Dropping problematic tables that reference old data types...')
    const tablesToDrop = ['expenses', 'ledger']
    for (const table of tablesToDrop) {
      const [tables] = await conn.query(`SHOW TABLES LIKE '${table}'`)
      if (tables.length) {
        await exec(`Drop ${table} table`, `DROP TABLE ${table}`)
      }
    }

    console.log('\n3. Fixing users table primary key type...')
    // Drop dependent foreign keys first
    const userDependentTables = [
      { table: 'user_roles', fk: 'user_roles_ibfk_1' },
      { table: 'user_permissions', fk: 'user_permissions_ibfk_1' },
      { table: 'inventory_transactions', fk: 'inventory_transactions_ibfk_2' },
      { table: 'damaged_inventory', fk: 'damaged_inventory_ibfk_2' },
      { table: 'sales', fk: 'sales_ibfk_1' },
      { table: 'saved_reports', fk: 'saved_reports_ibfk_1' },
      { table: 'audit_logs', fk: 'audit_logs_ibfk_1' },
      { table: 'files', fk: 'files_ibfk_1' },
      { table: 'notifications', fk: 'notifications_ibfk_1' },
      { table: 'payrolls', fk: 'payrolls_ibfk_2' }
    ]

    for (const { table, fk } of userDependentTables) {
      const [tables] = await conn.query(`SHOW TABLES LIKE '${table}'`)
      if (tables.length) {
        await conn.query(`ALTER TABLE ${table} DROP FOREIGN KEY ${fk}`).catch(() => {})
      }
    }

    // Now change users.id type
    await exec('Drop users primary key', 'ALTER TABLE users DROP PRIMARY KEY')
    await exec('Change users.id to INT UNSIGNED', 'ALTER TABLE users CHANGE COLUMN id id INT UNSIGNED AUTO_INCREMENT UNIQUE')
    await exec('Add users primary key back', 'ALTER TABLE users ADD PRIMARY KEY (id)')

    console.log('\n4. Fixing employees table primary key type...')
    // Drop dependent foreign keys first
    const employeeDependentTables = [
      { table: 'attendance', fk: 'attendance_ibfk_1' },
      { table: 'payrolls', fk: 'payrolls_ibfk_1' }
    ]

    for (const { table, fk } of employeeDependentTables) {
      const [tables] = await conn.query(`SHOW TABLES LIKE '${table}'`)
      if (tables.length) {
        await conn.query(`ALTER TABLE ${table} DROP FOREIGN KEY ${fk}`).catch(() => {})
      }
    }

    // Now change employees.id type
    await exec('Drop employees primary key', 'ALTER TABLE employees DROP PRIMARY KEY')
    await exec('Change employees.id to INT UNSIGNED', 'ALTER TABLE employees CHANGE COLUMN id id INT UNSIGNED AUTO_INCREMENT UNIQUE')
    await exec('Add employees primary key back', 'ALTER TABLE employees ADD PRIMARY KEY (id)')

    console.log('\n5. Fixing dependent table columns...')
    const userFKTables = [
      { table: 'user_roles', column: 'user_id' },
      { table: 'user_permissions', column: 'user_id' },
      { table: 'inventory_transactions', column: 'user_id' },
      { table: 'damaged_inventory', column: 'reported_by' },
      { table: 'sales', column: 'clerk_id' },
      { table: 'saved_reports', column: 'owner_id' },
      { table: 'audit_logs', column: 'user_id' },
      { table: 'files', column: 'uploaded_by' },
      { table: 'notifications', column: 'recipient_user_id' },
      { table: 'payrolls', column: 'processed_by' }
    ]

    for (const { table, column } of userFKTables) {
      const [tables] = await conn.query(`SHOW TABLES LIKE '${table}'`)
      if (tables.length) {
        const [cols] = await conn.query(`SHOW COLUMNS FROM ${table} WHERE Field = '${column}'`)
        if (cols.length && cols[0].Type !== 'int(10) unsigned') {
          await exec(`Fix ${table}.${column} type`, `ALTER TABLE ${table} MODIFY ${column} INT UNSIGNED`)
        }
      }
    }

    const employeeFKTables = [
      { table: 'attendance', column: 'employee_id' },
      { table: 'payrolls', column: 'employee_id' }
    ]

    for (const { table, column } of employeeFKTables) {
      const [tables] = await conn.query(`SHOW TABLES LIKE '${table}'`)
      if (tables.length) {
        const [cols] = await conn.query(`SHOW COLUMNS FROM ${table} WHERE Field = '${column}'`)
        if (cols.length && cols[0].Type !== 'int(10) unsigned') {
          await exec(`Fix ${table}.${column} type`, `ALTER TABLE ${table} MODIFY ${column} INT UNSIGNED`)
        }
      }
    }

    console.log('\n6. Recreating expenses table with correct foreign keys...')
    await exec('Create expenses table', `
      CREATE TABLE IF NOT EXISTS expenses (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        expense_date DATE NOT NULL,
        category VARCHAR(255),
        description TEXT,
        amount DECIMAL(12,2) DEFAULT 0.00,
        vendor VARCHAR(255),
        employee_id INT UNSIGNED,
        status ENUM('PENDING','APPROVED','REJECTED','PAID') DEFAULT 'PENDING',
        approved_by INT UNSIGNED,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE SET NULL,
        FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `)

    console.log('\n7. Recreating ledger table with correct foreign keys...')
    await exec('Create ledger table', `
      CREATE TABLE IF NOT EXISTS ledger (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        account_code VARCHAR(100),
        entry_date DATE NOT NULL,
        description TEXT,
        debit DECIMAL(12,2) DEFAULT 0.00,
        credit DECIMAL(12,2) DEFAULT 0.00,
        reference VARCHAR(255),
        created_by INT UNSIGNED,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `)

    console.log('\n8. Recreating foreign keys for dependent tables...')
    // Recreate user foreign keys
    await exec('Recreate user_roles foreign keys', 
      'ALTER TABLE user_roles ADD FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE')
    await exec('Recreate user_permissions foreign keys', 
      'ALTER TABLE user_permissions ADD FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE')
    await exec('Recreate inventory_transactions user FK', 
      'ALTER TABLE inventory_transactions ADD FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL')
    await exec('Recreate damaged_inventory FK', 
      'ALTER TABLE damaged_inventory ADD FOREIGN KEY (reported_by) REFERENCES users(id) ON DELETE SET NULL')
    await exec('Recreate sales clerk FK', 
      'ALTER TABLE sales ADD FOREIGN KEY (clerk_id) REFERENCES users(id) ON DELETE SET NULL')
    await exec('Recreate saved_reports owner FK', 
      'ALTER TABLE saved_reports ADD FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE SET NULL')
    await exec('Recreate audit_logs user FK', 
      'ALTER TABLE audit_logs ADD FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL')
    await exec('Recreate files uploaded_by FK', 
      'ALTER TABLE files ADD FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL')
    await exec('Recreate notifications recipient FK', 
      'ALTER TABLE notifications ADD FOREIGN KEY (recipient_user_id) REFERENCES users(id) ON DELETE SET NULL')
    await exec('Recreate payrolls processed_by FK', 
      'ALTER TABLE payrolls ADD FOREIGN KEY (processed_by) REFERENCES users(id) ON DELETE SET NULL')

    // Recreate employee foreign keys
    await exec('Recreate attendance employee FK', 
      'ALTER TABLE attendance ADD FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE')
    await exec('Recreate payrolls employee FK', 
      'ALTER TABLE payrolls ADD FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE')

    console.log('\n9. Re-enabling foreign key checks...')
    await conn.query('SET FOREIGN_KEY_CHECKS = 1')
    console.log('  ✓ Foreign key checks re-enabled\n')

    console.log('═══════════════════════════════════════')
    console.log('✓ Foreign key migration complete!')
    console.log('═══════════════════════════════════════')
  } catch (err) {
    console.error('\nMigration FAILED:', err.message)
  } finally {
    await conn.end()
  }
}

run().catch(err => {
  console.error('\nFatal error:', err)
  process.exit(1)
})
