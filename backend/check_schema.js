/**
 * Check current schema to understand the state
 */
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
    console.log('Current Database Schema Status:\n')

    // Check users table
    console.log('=== USERS TABLE ===')
    const [userCols] = await conn.query('SHOW COLUMNS FROM users WHERE Field = "id"')
    console.log('users.id type:', userCols[0]?.Type)

    // Check employees table
    console.log('\n=== EMPLOYEES TABLE ===')
    const [empCols] = await conn.query('SHOW COLUMNS FROM employees WHERE Field = "id"')
    console.log('employees.id type:', empCols[0]?.Type)

    // Check all tables
    console.log('\n=== ALL TABLES ===')
    const [tables] = await conn.query('SHOW TABLES')
    const tableNames = tables.map(t => Object.values(t)[0])
    console.log(tableNames.join('\n'))

    // Check foreign keys for users
    console.log('\n=== FOREIGN KEYS REFERENCING USERS ===')
    const [fks] = await conn.query(`
      SELECT TABLE_NAME, COLUMN_NAME, CONSTRAINT_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
      FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
      WHERE REFERENCED_TABLE_NAME = 'users' AND TABLE_SCHEMA = 'cecilles_nstyle_db'
    `)
    fks.forEach(fk => {
      console.log(`${fk.TABLE_NAME}.${fk.COLUMN_NAME} -> users.${fk.REFERENCED_COLUMN_NAME} (${fk.CONSTRAINT_NAME})`)
    })

    // Check foreign keys for employees
    console.log('\n=== FOREIGN KEYS REFERENCING EMPLOYEES ===')
    const [empFks] = await conn.query(`
      SELECT TABLE_NAME, COLUMN_NAME, CONSTRAINT_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
      FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
      WHERE REFERENCED_TABLE_NAME = 'employees' AND TABLE_SCHEMA = 'cecilles_nstyle_db'
    `)
    empFks.forEach(fk => {
      console.log(`${fk.TABLE_NAME}.${fk.COLUMN_NAME} -> employees.${fk.REFERENCED_COLUMN_NAME} (${fk.CONSTRAINT_NAME})`)
    })
  } catch (err) {
    console.error('Error:', err.message)
  } finally {
    await conn.end()
  }
}

run()
