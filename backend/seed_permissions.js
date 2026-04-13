/**
 * Seed permissions and RBAC for the system
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
      if (e.code === 'ER_DUP_ENTRY') {
        console.log('  · ' + label + ' (already exists)')
        return true
      }
      console.error('  ✗ ' + label + ': ' + e.message)
      return false
    }
  }

  console.log('Setting up permissions and RBAC...\n')

  try {
    // Define all permissions
    const permissions = [
      // Dashboard
      { name: 'dashboard.view', desc: 'View dashboard' },
      
      // Products & Inventory
      { name: 'products.view', desc: 'View products' },
      { name: 'products.create', desc: 'Create products' },
      { name: 'products.edit', desc: 'Edit products' },
      { name: 'products.delete', desc: 'Delete products' },
      { name: 'inventory.view', desc: 'View inventory' },
      { name: 'inventory.edit', desc: 'Adjust inventory' },
      
      // Sales
      { name: 'sales.view', desc: 'View sales' },
      { name: 'sales.create', desc: 'Create sales' },
      { name: 'sales.edit', desc: 'Edit sales' },
      
      // Customers
      { name: 'customers.view', desc: 'View customers' },
      { name: 'customers.create', desc: 'Create customers' },
      { name: 'customers.edit', desc: 'Edit customers' },
      
      // Employees
      { name: 'employees.view', desc: 'View employees' },
      { name: 'employees.create', desc: 'Create employees' },
      { name: 'employees.edit', desc: 'Edit employees' },
      
      // Attendance
      { name: 'attendance.view', desc: 'View attendance' },
      { name: 'attendance.create', desc: 'Create attendance' },
      
      // Payroll
      { name: 'payroll.view', desc: 'View payroll' },
      { name: 'payroll.create', desc: 'Process payroll' },
      
      // Finance
      { name: 'finance.reports.view', desc: 'View financial reports' },
      { name: 'expenses.view', desc: 'View expenses' },
      { name: 'expenses.create', desc: 'Create expenses' },
      
      // Categories
      { name: 'categories.view', desc: 'View categories' },
      { name: 'categories.create', desc: 'Create categories' },
      
      // Audit & Logs
      { name: 'system.audit.view', desc: 'View audit logs' },
      
      // Users & Roles
      { name: 'users.view', desc: 'View users' },
      { name: 'users.create', desc: 'Create users' },
      { name: 'users.edit', desc: 'Edit users' },
      { name: 'roles.view', desc: 'View roles' },
      { name: 'roles.create', desc: 'Create roles' },
      { name: 'roles.edit', desc: 'Edit roles' },
      
      // Reports
      { name: 'reports.view', desc: 'View reports' },
      
      // Admin wildcard
      { name: 'admin.*', desc: 'Admin access to all' }
    ]

    console.log('1. Creating permissions...')
    for (const perm of permissions) {
      await exec(
        `Create permission: ${perm.name}`,
        'INSERT IGNORE INTO permissions (name, description) VALUES (?, ?)',
        [perm.name, perm.desc]
      )
    }

    // Get role IDs
    console.log('\n2. Getting role IDs...')
    const [[adminRole], [managerRole], [employeeRole]] = await Promise.all([
      conn.query('SELECT id FROM roles WHERE name = "super_admin" LIMIT 1'),
      conn.query('SELECT id FROM roles WHERE name = "manager" LIMIT 1'),
      conn.query('SELECT id FROM roles WHERE name = "employee" LIMIT 1')
    ])

    if (!adminRole.length || !managerRole.length || !employeeRole.length) {
      throw new Error('Roles not found')
    }

    const adminRoleId = adminRole[0].id
    const managerRoleId = managerRole[0].id
    const employeeRoleId = employeeRole[0].id

    console.log(`  ✓ Admin role ID: ${adminRoleId}`)
    console.log(`  ✓ Manager role ID: ${managerRoleId}`)
    console.log(`  ✓ Employee role ID: ${employeeRoleId}`)

    // Get permission IDs
    console.log('\n3. Assigning permissions to roles...')
    
    // Admin gets all permissions
    const [allPerms] = await conn.query('SELECT id, name FROM permissions')
    for (const perm of allPerms) {
      await exec(
        `Assign ${perm.name} to admin`,
        'INSERT IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)',
        [adminRoleId, perm.id]
      )
    }

    // Manager permissions
    const managerPermNames = [
      'dashboard.view',
      'products.view', 'products.create', 'products.edit',
      'inventory.view', 'inventory.edit',
      'sales.view', 'sales.create', 'sales.edit',
      'customers.view', 'customers.create', 'customers.edit',
      'employees.view',
      'attendance.view', 'attendance.create',
      'payroll.view',
      'finance.reports.view', 'expenses.view', 'expenses.create',
      'categories.view',
      'reports.view'
    ]

    for (const permName of managerPermNames) {
      const [perm] = await conn.query('SELECT id FROM permissions WHERE name = ? LIMIT 1', [permName])
      if (perm.length) {
        await exec(
          `Assign ${permName} to manager`,
          'INSERT IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)',
          [managerRoleId, perm[0].id]
        )
      }
    }

    // Employee permissions (limited)
    const employeePermNames = [
      'dashboard.view',
      'products.view',
      'inventory.view',
      'sales.view',
      'customers.view',
      'attendance.view',
      'attendance.create'
    ]

    for (const permName of employeePermNames) {
      const [perm] = await conn.query('SELECT id FROM permissions WHERE name = ? LIMIT 1', [permName])
      if (perm.length) {
        await exec(
          `Assign ${permName} to employee`,
          'INSERT IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)',
          [employeeRoleId, perm[0].id]
        )
      }
    }

    console.log('\n═══════════════════════════════════════')
    console.log('✓ RBAC setup complete!')
    console.log('═══════════════════════════════════════\n')
    console.log(`Created ${allPerms.length} permissions`)
    console.log(`Assigned to super_admin role`)
    console.log(`Assigned ${managerPermNames.length} permissions to manager role`)
    console.log(`Assigned ${employeePermNames.length} permissions to employee role`)

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
