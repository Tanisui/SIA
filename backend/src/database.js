const dotenv = require('dotenv')
dotenv.config()

const mysql = require('mysql2/promise')

const {
  DB_HOST,
  DB_PORT,
  DB_DATABASE,
  DB_USERNAME,
  DB_PASSWORD
} = process.env;

if (!DB_HOST || !DB_DATABASE || !DB_USERNAME) {
  console.warn('Missing DB configuration in .env — database connection may fail.')
}

const pool = mysql.createPool({
  host: DB_HOST || 'localhost',
  port: DB_PORT ? Number(DB_PORT) : 3306,
  user: DB_USERNAME || 'root',
  password: DB_PASSWORD || '',
  database: DB_DATABASE || undefined,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
})

async function testConnection() {
  try {
    const conn = await pool.getConnection()
    await conn.ping()
    conn.release()
  } catch (err) {
    console.error('Database connection error:', err.message || err)
  }
}

testConnection()

module.exports = {
  pool,
  testConnection
}
