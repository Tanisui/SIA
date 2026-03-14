/**
 * Migration to update users table and set up proper authentication
 * - Add missing columns: email, full_name, password_hash
 * - Create proper test password hashes
 * - Set up RBAC (roles and permissions)
 */
const mysql = require('mysql2/promise')
const crypto = require('crypto')
require('dotenv').config()

// Generate proper PBKDF2 password hash (matches the auth.js verifyPassword function)
function hashPassword(password) {
  const iterations = 100000
  const salt = crypto.randomBytes(32).toString('hex')
  const derived = crypto.pbkdf2Sync(password, salt, iterations, 64, 'sha512').toString('hex')
  return `pbkdf2_sha512$${iterations}$${salt}$${derived}`
}

async function run() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USERNAME || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_DATABASE || 'cecilles_nstyle_db'
  })

  const exec = async (label, sql, params = []) => {
    try {
      if (params.length) {
        await conn.query(sql, params)
      } else {
        await conn.query(sql)
      }
      console.log('  ✓ ' + label)
      return true
    } catch (e) {
      console.error('  ✗ ' + label + ': ' + e.message)
      return false
    }
  }

  console.log('Setting up authentication...\n')

  try {
    // Add missing columns to users table
    console.log('1. Adding missing columns to users table...')
    const [cols] = await conn.query('SHOW COLUMNS FROM users WHERE Field IN ("email", "full_name", "password_hash")')
    
    if (!cols.find(c => c.Field === 'email')) {
      await exec('Add email column', 
        'ALTER TABLE users ADD COLUMN email VARCHAR(255) UNIQUE AFTER username')
    }
    
    if (!cols.find(c => c.Field === 'full_name')) {
      await exec('Add full_name column', 
        'ALTER TABLE users ADD COLUMN full_name VARCHAR(255) AFTER email')
    }
    
    if (!cols.find(c => c.Field === 'password_hash')) {
      await exec('Add password_hash column', 
        'ALTER TABLE users ADD COLUMN password_hash VARCHAR(255) AFTER password')
    }

    // Create proper password hashes for test users
    console.log('\n2. Creating proper password hashes for test users...')
    const testUsers = [
      { id: 1, username: 'admin', password: 'admin123', email: 'admin@cecilles.local', full_name: 'Administrator' },
      { id: 2, username: 'manager1', password: 'manager123', email: 'manager@cecilles.local', full_name: 'Manager' },
      { id: 3, username: 'employee1', password: 'employee123', email: 'employee@cecilles.local', full_name: 'Employee' }
    ]

    for (const user of testUsers) {
      const hash = hashPassword(user.password)
      await exec(
        `Set password_hash for ${user.username}`,
        `UPDATE users SET password_hash = ?, email = ?, full_name = ? WHERE id = ?`,
        [hash, user.email, user.full_name, user.id]
      )
    }

    console.log('\n3. Creating RBAC structure...')
    
    // Create roles if they don't exist
    const [roles] = await conn.query('SELECT id FROM roles LIMIT 1')
    if (!roles.length) {
      const roleList = [
        { name: 'super_admin', description: 'Super Administrator' },
        { name: 'manager', description: 'Manager' },
        { name: 'employee', description: 'Employee' }
      ]
      for (const role of roleList) {
        await exec(`Create ${role.name} role`,
          'INSERT INTO roles (name, description) VALUES (?, ?)',
          [role.name, role.description]
        )
      }
    }

    // Get role IDs
    const [[adminRole], [managerRole], [employeeRole]] = await Promise.all([
      conn.query('SELECT id FROM roles WHERE name = "super_admin" LIMIT 1'),
      conn.query('SELECT id FROM roles WHERE name = "manager" LIMIT 1'),
      conn.query('SELECT id FROM roles WHERE name = "employee" LIMIT 1')
    ])

    // Assign roles to users (if not already assigned)
    const [userRoles] = await conn.query('SELECT user_id FROM user_roles LIMIT 1')
    if (!userRoles.length) {
      await exec('Assign super_admin role to admin user',
        'INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)',
        [1, adminRole[0].id]
      )
      await exec('Assign manager role to manager user',
        'INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)',
        [2, managerRole[0].id]
      )
      await exec('Assign employee role to employee user',
        'INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)',
        [3, employeeRole[0].id]
      )
    }

    console.log('\n═══════════════════════════════════════')
    console.log('✓ Authentication setup complete!')
    console.log('═══════════════════════════════════════')
    console.log('\nTest credentials:')
    console.log('  Admin:    username: admin, password: admin123')
    console.log('  Manager:  username: manager1, password: manager123')
    console.log('  Employee: username: employee1, password: employee123')

  } catch (err) {
    console.error('\nSetup FAILED:', err.message)
  } finally {
    await conn.end()
  }
}

run().catch(err => {
  console.error('\nFatal error:', err)
  process.exit(1)
})
