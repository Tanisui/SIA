const db = require('./src/database')

async function check() {
  try {
    const [rows] = await db.pool.query('DESCRIBE cecilles_nstyle_db.products')
    console.log('Products table structure:')
    rows.forEach(r => {
      console.log(`  ${r.Field}: ${r.Type}`)
    })
  } catch (e) {
    console.error('Error:', e.message)
  }
  process.exit(0)
}

check()
