const db = require('./src/database');

(async () => {
  try {
    const [cols] = await db.pool.query('SHOW COLUMNS FROM employees');
    console.log('Employees table columns:');
    cols.forEach(c => console.log(`  ${c.Field} (${c.Type})`));
    
    const [rows] = await db.pool.query('SELECT id, name, role, contact_type, contact FROM employees LIMIT 3');
    console.log('\nSample employee data:');
    rows.forEach(r => console.log(`  ID ${r.id}: ${r.name} - contact_type="${r.contact_type}", contact="${r.contact}"`));
    
    process.exit(0);
  } catch(e) {
    console.error('Error:', e.message);
    process.exit(1);
  }
})();
