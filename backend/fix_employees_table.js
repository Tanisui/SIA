const db = require('./src/database')

async function fixEmployees() {
  try {
    // Check employees table structure
    const [rows] = await db.pool.query('DESCRIBE cecilles_nstyle_db.employees')
    console.log('Current employees table structure:')
    const columns = rows.map(r => r.Field)
    columns.forEach(c => console.log(`  - ${c}`))
    
    // Check if contact_type exists
    if (!columns.includes('contact_type')) {
      console.log('\nAdding missing contact_type column...')
      await db.pool.query('ALTER TABLE employees ADD COLUMN contact_type VARCHAR(50) AFTER role')
      console.log('✓ contact_type column added')
    } else {
      console.log('✓ contact_type column already exists')
    }

    // Check if contact exists
    if (!columns.includes('contact')) {
      console.log('Adding missing contact column...')
      await db.pool.query('ALTER TABLE employees ADD COLUMN contact VARCHAR(255) AFTER contact_type')
      console.log('✓ contact column added')
    } else {
      console.log('✓ contact column already exists')
    }

    console.log('\n✓ Employees table is now properly configured!')
    process.exit(0)
  } catch (err) {
    console.error('Error:', err.message)
    process.exit(1)
  }
}

fixEmployees()
