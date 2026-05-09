const dotenv = require('dotenv')
dotenv.config()

const mysql = require('mysql2/promise')

const {
	DB_HOST = 'localhost',
	DB_PORT = 3306,
	DB_DATABASE = 'cecilles_nstyle_db',
	DB_USERNAME = 'root',
	DB_PASSWORD = ''
} = process.env

async function connect() {
	return mysql.createConnection({
		host: DB_HOST,
		port: Number(DB_PORT),
		user: DB_USERNAME,
		password: DB_PASSWORD,
		database: DB_DATABASE
	})
}

const CANONICAL_ROLES = {
	'Admin': ['admin.*'],
	'Manager': [
		'users.view', 'users.create', 'users.update',
		'roles.view',
		'products.view', 'products.create', 'products.update', 'products.delete', 'products.import', 'products.export',
		'inventory.view', 'inventory.receive', 'inventory.dispatch', 'inventory.adjust', 'inventory.reconcile', 'inventory.export', 'inventory.lowstock_alert_manage',
		'purchase.view', 'purchase.create', 'purchase.update', 'purchase.delete', 'purchase.receive',
		'suppliers.view', 'suppliers.create', 'suppliers.update', 'suppliers.delete',
		'sales.view', 'sales.create', 'sales.refund', 'sales.print_receipt', 'sales.export', 'sales.discount', 'sales.price_override',
		'customers.view', 'customers.create', 'customers.update', 'customers.delete',
		'attendance.view', 'attendance.record', 'attendance.view_own',
		'payroll.view', 'payroll.process', 'payroll.adjust', 'payroll.export',
		'payroll.profile.view', 'payroll.profile.create', 'payroll.profile.update',
		'payroll.period.view', 'payroll.period.create', 'payroll.period.compute', 'payroll.period.finalize', 'payroll.period.release', 'payroll.period.void',
		'payroll.settings.view', 'payroll.settings.update',
		'payroll.report.view', 'payroll.report.export',
		'payroll.payslip.view', 'payroll.payslip.view_own',
		'reports.view', 'reports.generate', 'reports.export',
		'finance.reports.view',
		'employees.view', 'employees.create', 'employees.update', 'employees.delete',
		'system.audit.view'
	],
	'Sales Clerk': [
		'sales.view', 'sales.create', 'sales.print_receipt', 'sales.discount',
		'customers.view', 'customers.create',
		'products.view',
		'inventory.view',
		'attendance.record', 'attendance.view_own',
		'payroll.payslip.view_own'
	],
	'Store House Manager': [
		'suppliers.view', 'suppliers.create', 'suppliers.update',
		'purchase.view', 'purchase.create', 'purchase.update', 'purchase.receive',
		'inventory.view', 'inventory.receive', 'inventory.adjust',
		'products.view', 'products.create', 'products.update',
		'attendance.record', 'attendance.view_own',
		'payroll.payslip.view_own',
		'reports.view'
	],
	'Warehouse Manager': [
		'inventory.view', 'inventory.dispatch', 'inventory.adjust', 'inventory.reconcile', 'inventory.export', 'inventory.lowstock_alert_manage',
		'products.view',
		'suppliers.view',
		'attendance.record', 'attendance.view_own',
		'payroll.payslip.view_own',
		'reports.view'
	]
}

async function syncRoles() {
	const conn = await connect()

	try {
		// Step 1: Delete Senior Cashier role
		console.log('Deleting Senior Cashier role...')
		const [seniorCashierRows] = await conn.execute(`SELECT id FROM roles WHERE name = ? LIMIT 1`, ['Senior Cashier'])
		if (seniorCashierRows.length) {
			const scId = seniorCashierRows[0].id
			await conn.execute(`DELETE FROM role_permissions WHERE role_id = ?`, [scId])
			await conn.execute(`DELETE FROM user_roles WHERE role_id = ?`, [scId])
			await conn.execute(`DELETE FROM roles WHERE id = ?`, [scId])
			console.log('✓ Senior Cashier deleted')
		} else {
			console.log('✓ Senior Cashier not found (already deleted)')
		}

		// Step 2: Sync canonical roles
		for (const [roleName, perms] of Object.entries(CANONICAL_ROLES)) {
			console.log(`Syncing ${roleName}...`)

			const [roleRows] = await conn.execute(`SELECT id FROM roles WHERE name = ? LIMIT 1`, [roleName])
			if (!roleRows.length) {
				console.log(`  ⚠ Role ${roleName} not found, skipping`)
				continue
			}
			const roleId = roleRows[0].id

			// Clear existing permissions for this role
			await conn.execute(`DELETE FROM role_permissions WHERE role_id = ?`, [roleId])

			// Re-insert canonical permissions
			for (const permName of perms) {
				if (permName === 'admin.*') {
					const [allPerms] = await conn.execute(`SELECT id FROM permissions`)
					for (const p of allPerms) {
						await conn.execute(`INSERT IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)`, [roleId, p.id])
					}
					continue
				}

				const [permRows] = await conn.execute(`SELECT id FROM permissions WHERE name = ? LIMIT 1`, [permName])
				if (!permRows.length) {
					console.log(`  ⚠ Permission ${permName} not found, skipping`)
					continue
				}
				const permId = permRows[0].id
				await conn.execute(`INSERT IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)`, [roleId, permId])
			}
			console.log(`✓ ${roleName} synced (${perms.length} permissions)`)
		}

		console.log('\n✅ Role sync complete!')
	} catch (err) {
		console.error('Sync error:', err)
		process.exit(1)
	} finally {
		await conn.end()
	}
}

syncRoles()
