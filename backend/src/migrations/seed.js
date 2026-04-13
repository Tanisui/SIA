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

		'sales.view','sales.create','sales.refund','sales.print_receipt','sales.export','sales.discount','sales.price_override',

		'customers.view','customers.create','customers.update','customers.delete',

		'suppliers.view','suppliers.create','suppliers.update','suppliers.delete',

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
			'sales.view','sales.create','sales.refund','sales.discount','sales.price_override',
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
			'suppliers.view'
		],
		'Accountant': [
			'payroll.view','payroll.process','payroll.export','finance.reports.view','reports.view'
		],
		'HR': [
			'employees.view','employees.create','employees.update','attendance.record','attendance.view'
		],
		'Auditor': ['reports.view','reports.export','system.audit.view'],
		'Supplier': ['suppliers.view']
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

	await conn.execute(`
		CREATE TABLE IF NOT EXISTS configs (
			config_key VARCHAR(255) PRIMARY KEY,
			config_value TEXT,
			last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
		) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
	`)

	const runtimeConfigs = [
		['scanner.debounce_ms', '250'],
		['sales.currency', 'PHP'],
		['sales.tax_rate', '0']
	]

	for (const [configKey, configValue] of runtimeConfigs) {
		await conn.execute(
			`INSERT IGNORE INTO configs (config_key, config_value) VALUES (?, ?)`,
			[configKey, configValue]
		)
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

	// ── Seed Categories ──
	const categories = [
		// Dress Types
		{ name: 'A-Line Dress', description: 'Fitted at the hips and gradually widens towards the hem' },
		{ name: 'Maxi Dress', description: 'Full-length dress reaching the ankles or floor' },
		{ name: 'Mini Dress', description: 'Short dress ending above the knee' },
		{ name: 'Midi Dress', description: 'Mid-length dress ending between the knee and ankle' },
		{ name: 'Wrap Dress', description: 'Dress with a front closure formed by wrapping one side over the other' },
		{ name: 'Bodycon Dress', description: 'Figure-hugging tight-fitted dress' },
		{ name: 'Shift Dress', description: 'Straight-cut dress that hangs from the shoulders' },
		{ name: 'Sheath Dress', description: 'Fitted dress that follows the body contour' },
		{ name: 'Ball Gown', description: 'Formal full-skirted evening gown' },
		{ name: 'Cocktail Dress', description: 'Semi-formal dress for cocktail parties and events' },
		{ name: 'Sun Dress', description: 'Casual, lightweight dress for warm weather' },
		{ name: 'Shirt Dress', description: 'Dress styled like an elongated button-down shirt' },
		{ name: 'Halter Dress', description: 'Dress with straps that wrap around the back of the neck' },
		{ name: 'Off-Shoulder Dress', description: 'Dress with sleeves or neckline sitting below the shoulders' },
		{ name: 'Tube Dress', description: 'Strapless, straight-cut fitted dress' },
		{ name: 'Peplum Dress', description: 'Dress with a short flared strip of fabric at the waist' },
		{ name: 'Empire Dress', description: 'Dress with a high waistline just below the bust' },
		{ name: 'Fit & Flare Dress', description: 'Fitted bodice with a flared-out skirt' },
		{ name: 'Asymmetrical Dress', description: 'Dress with an uneven hemline' },
		{ name: 'Tiered Dress', description: 'Dress with layered horizontal sections' },
		{ name: 'Slip Dress', description: 'Lightweight, sleeveless dress resembling an undergarment slip' },
		{ name: 'Blazer Dress', description: 'Dress styled like an oversized blazer' },
		// Clothing Types
		{ name: 'Tops & Blouses', description: 'Upper body garments including blouses, shirts, and tops' },
		{ name: 'T-Shirts', description: 'Casual short-sleeved tops' },
		{ name: 'Skirts', description: 'Lower body garments from waist down' },
		{ name: 'Pants & Trousers', description: 'Full-length lower body garments' },
		{ name: 'Shorts', description: 'Short-length lower body garments' },
		{ name: 'Jeans', description: 'Denim pants' },
		{ name: 'Jumpsuits & Rompers', description: 'One-piece garments combining top and bottom' },
		{ name: 'Jackets & Coats', description: 'Outerwear for layering' },
		{ name: 'Sweaters & Cardigans', description: 'Knitted upper body garments' },
		{ name: 'Activewear', description: 'Athletic and sports clothing' },
		{ name: 'Sleepwear & Loungewear', description: 'Comfortable clothing for home and sleep' },
		{ name: 'Swimwear', description: 'Clothing for swimming and beach' },
		{ name: 'Formal Wear', description: 'Elegant clothing for formal occasions' },
		// Accessories
		{ name: 'Bags & Purses', description: 'Handbags, clutches, tote bags' },
		{ name: 'Shoes & Footwear', description: 'Sandals, heels, flats, boots' },
		{ name: 'Jewelry', description: 'Necklaces, earrings, bracelets, rings' },
		{ name: 'Scarves & Wraps', description: 'Neck and body accessories' },
		{ name: 'Belts', description: 'Waist accessories' },
		{ name: 'Hats & Hair Accessories', description: 'Head and hair accessories' },
		{ name: 'Sunglasses', description: 'Eyewear accessories' },
	]

	for (const cat of categories) {
		await conn.execute(
			`INSERT IGNORE INTO categories (name, description) VALUES (?, ?)`,
			[cat.name, cat.description]
		)
	}

	console.log('Seeding complete.')
	await conn.end()
}

seed().catch(err => {
	console.error('Seed error:', err)
	process.exit(1)
})

