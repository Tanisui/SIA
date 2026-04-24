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

const hasExplicitDbPassword = Object.prototype.hasOwnProperty.call(process.env, 'DB_PASSWORD')
const resolvedDbPassword = hasExplicitDbPassword ? DB_PASSWORD : ''

if (!DB_HOST || !DB_DATABASE || !DB_USERNAME) {
  console.warn('Missing DB configuration in .env - database connection may fail.')
}

const pool = mysql.createPool({
  host: DB_HOST || 'localhost',
  port: DB_PORT ? Number(DB_PORT) : 3306,
  user: DB_USERNAME || 'root',
  password: resolvedDbPassword,
  database: DB_DATABASE || 'cecilles_nstyle_db',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
})

async function testConnection() {
  const conn = await pool.getConnection()
  try {
    await conn.ping()
  } finally {
    conn.release()
  }
}

testConnection()
  .then(() => {
    console.log('Database connection established')
  })
  .catch((err) => {
    console.error('Database connection error:', err.message || err)
  })

module.exports = {
  pool,
  testConnection
}
