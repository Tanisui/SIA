const dotenv = require('dotenv')
dotenv.config()

const mysql = require('mysql2/promise')
const crypto = require('crypto')

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

function hashPassword(password) {
	const salt = crypto.randomBytes(16).toString('hex')
	const derived = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex')
	return `pbkdf2_sha512$100000$${salt}$${derived}`
}

async function seed() {
	const conn = await connect()

	const permissions = [
		'auth.login','auth.logout',
		'users.view','users.create','users.update','users.delete',
		'roles.view','roles.create','roles.update','roles.delete',

		'products.view','products.create','products.update','products.delete','products.import','products.export',

		'inventory.view','inventory.receive','inventory.dispatch','inventory.adjust','inventory.reconcile','inventory.export','inventory.lowstock_alert_manage',

		'sales.view','sales.create','sales.refund','sales.print_receipt','sales.export',

		'customers.view','customers.create','customers.update','customers.delete',

		'suppliers.view','suppliers.create','suppliers.update','suppliers.delete',
		'purchase.create','purchase.view','purchase.receive','purchase.update','purchase.delete',

		'employees.view','employees.create','employees.update','employees.delete','attendance.record','attendance.view',

		'payroll.view','payroll.process','payroll.adjust','payroll.export','finance.reports.view',

		'reports.view','reports.generate','reports.export',

		'system.health','system.config.update','system.audit.view',
		'admin.*'
	]

	for (const name of permissions) {
		await conn.execute(`INSERT IGNORE INTO permissions (name, description) VALUES (?, ?)`,[name, name])
	}

	const roles = {
		'Admin': ['admin.*'],
		'Manager': [
			'reports.view','reports.generate','products.view','products.create','products.update',
			'inventory.view','inventory.receive','inventory.dispatch','inventory.adjust','inventory.reconcile',
			'suppliers.view','suppliers.create','suppliers.update',
			'purchase.create','purchase.view','purchase.receive','purchase.update',
			'sales.view','sales.create','sales.refund',
			'customers.view','customers.create','customers.update',
			'payroll.view'
		],
		'Sales Clerk': [
			'sales.create','sales.view','sales.print_receipt','sales.refund',
			'customers.create','customers.view','customers.update',
			'products.view','inventory.view'
		],
		'Inventory Clerk': [
			'inventory.view','inventory.receive','inventory.dispatch','inventory.adjust',
			'products.view','products.create','products.update',
			'suppliers.view','purchase.view','purchase.create','purchase.receive'
		],
		'Accountant': [
			'payroll.view','payroll.process','payroll.export','finance.reports.view','reports.view'
		],
		'HR': [
			'employees.view','employees.create','employees.update','attendance.record','attendance.view'
		],
		'Auditor': ['reports.view','reports.export','system.audit.view'],
		'Supplier': ['suppliers.view','purchase.view']
	}

	for (const roleName of Object.keys(roles)) {
		await conn.execute(`INSERT IGNORE INTO roles (name, description) VALUES (?, ?)`,[roleName, roleName])
	}

	for (const [roleName, perms] of Object.entries(roles)) {
		const [rowsRole] = await conn.execute(`SELECT id FROM roles WHERE name = ? LIMIT 1`, [roleName])
		if (!rowsRole.length) continue
		const roleId = rowsRole[0].id

		for (const permName of perms) {
			if (permName === 'admin.*') {
				const [allPerms] = await conn.execute(`SELECT id FROM permissions`)
				for (const p of allPerms) {
					await conn.execute(`INSERT IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)`, [roleId, p.id])
				}
				continue
			}

			const [rowsPerm] = await conn.execute(`SELECT id FROM permissions WHERE name = ? LIMIT 1`, [permName])
			if (!rowsPerm.length) continue
			const permId = rowsPerm[0].id
			await conn.execute(`INSERT IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)`, [roleId, permId])
		}
	}

	const adminEmail = process.env.BOOTSTRAP_ADMIN_EMAIL || 'admin@cecillenstyles.com'
	const adminUser = process.env.BOOTSTRAP_ADMIN_USER || 'admin'
	const adminPass = process.env.BOOTSTRAP_ADMIN_PASS || 'admin123'

	const [urows] = await conn.execute(`SELECT id FROM users WHERE username = ? LIMIT 1`, [adminUser])
	let adminId
	if (!urows.length) {
		const password_hash = hashPassword(adminPass)
		const [res] = await conn.execute(`INSERT INTO users (username, email, password_hash, full_name) VALUES (?, ?, ?, ?)`,[adminUser, adminEmail, password_hash, 'Administrator'])
		adminId = res.insertId
	} else {
		adminId = urows[0].id
	}

	const [adminRoleRow] = await conn.execute(`SELECT id FROM roles WHERE name = 'Admin' LIMIT 1`)
	if (adminRoleRow.length) {
		const adminRoleId = adminRoleRow[0].id
		await conn.execute(`INSERT IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)`, [adminId, adminRoleId])
	}

	console.log('Seeding complete.')
	await conn.end()
}

seed().catch(err => {
	console.error('Seed error:', err)
	process.exit(1)
})

