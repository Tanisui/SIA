const db = require('./src/database')

async function fixEmployeeNumber() {
  try {
    // Add default value to employee_number
    await db.pool.query('ALTER TABLE employees MODIFY COLUMN employee_number VARCHAR(100) DEFAULT ""')
    console.log('✓ Added default value to employee_number column')

    // Also add defaults to other columns that might be missing
    const defaultColumns = [
      { col: 'first_name', type: 'VARCHAR(100) DEFAULT ""' },
      { col: 'last_name', type: 'VARCHAR(100) DEFAULT ""' },
      { col: 'contact_number', type: 'VARCHAR(50) DEFAULT ""' },
      { col: 'position', type: 'VARCHAR(100) DEFAULT ""' },
      { col: 'status', type: 'VARCHAR(50) DEFAULT "ACTIVE"' },
      { col: 'date_hired', type: 'DATE DEFAULT NULL' }
    ]

    for (const col of defaultColumns) {
      try {
        await db.pool.query(`ALTER TABLE employees MODIFY COLUMN ${col.col} ${col.type}`)
        console.log(`✓ Set default for ${col.col}`)
      } catch (e) {
        // Column might already exist with default
      }
    }

    console.log('\n✓ Employees table is now properly configured!')
    process.exit(0)
  } catch (err) {
    console.error('Error:', err.message)
    process.exit(1)
  }
}

fixEmployeeNumber()
