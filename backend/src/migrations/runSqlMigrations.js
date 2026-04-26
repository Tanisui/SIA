require('dotenv').config()

const fs = require('fs')
const path = require('path')
const mysql = require('mysql2/promise')

const SQL_MIGRATION_FILES = [
  path.join(__dirname, '..', 'database', 'migrations', '20260421_create_payroll_tables.sql'),
  path.join(__dirname, '..', 'database', 'migrations', '20260422_po_returns_attendance.sql'),
  path.join(__dirname, '..', 'database', 'migrations', '20260423_add_user_employee_name_parts.sql'),
  path.join(__dirname, '..', 'database', 'migrations', '20260423_add_payroll_input_payslip_fields.sql'),
  path.join(__dirname, '..', 'seeders', '20260421_seed_payroll_permissions.sql'),
  path.join(__dirname, '..', 'seeders', '20260421_seed_payroll_ph_settings.sql'),
  path.join(__dirname, '..', 'database', 'migrations', '20260424_payroll_frequency_and_attendance_permissions.sql'),
  path.join(__dirname, '..', 'database', 'migrations', '20260426_rbac_payroll_view_only_non_admin.sql'),
  path.join(__dirname, '..', 'database', 'migrations', '20260426_attendance_admin_only_modify.sql'),
  path.join(__dirname, '..', 'database', 'migrations', '20260426_notifications_read_state.sql')
]

const DUPLICATE_ERROR_CODES = new Set([
  'ER_DUP_FIELDNAME',
  'ER_DUP_KEYNAME',
  'ER_DUP_ENTRY',
  'ER_TABLE_EXISTS_ERROR',
  'ER_DUP_INDEX',
  'ER_FK_DUP_NAME'
])

function shouldIgnoreError(err, statement = '') {
  if (!err) return false
  if (DUPLICATE_ERROR_CODES.has(err.code)) return true

  const message = String(err.message || '')
  const normalizedStatement = String(statement || '').toUpperCase()
  return (
    err.errno === 121 ||
    message.includes('Duplicate column') ||
    message.includes('already exists') ||
    message.includes('Duplicate key name') ||
    message.includes('Duplicate entry') ||
    (
      message.includes('Duplicate key on write or update') &&
      (normalizedStatement.includes('ADD CONSTRAINT') || normalizedStatement.includes('CREATE INDEX'))
    )
  )
}

function collectSqlFiles() {
  return SQL_MIGRATION_FILES.filter((filePath) => fs.existsSync(filePath))
}

function splitSqlStatements(sql) {
  const statements = []
  let current = ''
  let quote = null
  let lineComment = false
  let blockComment = false

  for (let index = 0; index < sql.length; index += 1) {
    const char = sql[index]
    const next = sql[index + 1]

    if (lineComment) {
      if (char === '\n') {
        lineComment = false
        current += char
      }
      continue
    }

    if (blockComment) {
      if (char === '*' && next === '/') {
        blockComment = false
        index += 1
      }
      continue
    }

    if (!quote && char === '-' && next === '-') {
      lineComment = true
      index += 1
      continue
    }

    if (!quote && char === '/' && next === '*') {
      blockComment = true
      index += 1
      continue
    }

    if (quote) {
      current += char

      if (char === '\\') {
        if (index + 1 < sql.length) {
          current += sql[index + 1]
          index += 1
        }
        continue
      }

      if (char === quote) quote = null
      continue
    }

    if (char === '\'' || char === '"' || char === '`') {
      quote = char
      current += char
      continue
    }

    if (char === ';') {
      const statement = current.trim()
      if (statement) statements.push(statement)
      current = ''
      continue
    }

    current += char
  }

  const trailing = current.trim()
  if (trailing) statements.push(trailing)
  return statements
}

async function runSqlMigrations() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USERNAME || 'root',
    password: Object.prototype.hasOwnProperty.call(process.env, 'DB_PASSWORD') ? process.env.DB_PASSWORD : '',
    database: process.env.DB_DATABASE || 'cecilles_nstyle_db',
    multipleStatements: true
  })

  const files = collectSqlFiles()
  if (!files.length) {
    console.log('No SQL migration files found.')
    await connection.end()
    return
  }

  try {
    for (const filePath of files) {
      const relativePath = path.relative(path.join(__dirname, '..'), filePath)
      const statements = splitSqlStatements(fs.readFileSync(filePath, 'utf8'))
      console.log(`Applying ${relativePath} (${statements.length} statements)`)

      for (const statement of statements) {
        try {
          await connection.query(statement)
        } catch (err) {
          if (shouldIgnoreError(err, statement)) {
            console.log(`  skipped: ${err.code || err.message}`)
            continue
          }

          console.error(`  failed statement in ${relativePath}`)
          throw err
        }
      }
    }

    console.log('SQL migrations complete.')
  } finally {
    await connection.end()
  }
}

if (require.main === module) {
  runSqlMigrations()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('SQL migration failed:', err.message || err)
      process.exit(1)
    })
}

module.exports = {
  runSqlMigrations,
  splitSqlStatements
}
