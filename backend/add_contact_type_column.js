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

async function addContactTypeColumn() {
	const conn = await mysql.createConnection({
		host: DB_HOST,
		port: Number(DB_PORT),
		user: DB_USERNAME,
		password: DB_PASSWORD,
		database: DB_DATABASE
	})

	try {
		console.log('Checking if contact_type column exists...')
		const [columns] = await conn.execute(`
			SELECT COLUMN_NAME 
			FROM INFORMATION_SCHEMA.COLUMNS 
			WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'employees' AND COLUMN_NAME = 'contact_type'
		`, [DB_DATABASE])

		if (columns.length > 0) {
			console.log('contact_type column already exists.')
		} else {
			console.log('Adding contact_type column to employees table...')
			await conn.execute(`
				ALTER TABLE employees 
				ADD COLUMN contact_type VARCHAR(50) AFTER role
			`)
			console.log('contact_type column added successfully!')
		}
	} catch (err) {
		console.error('Error:', err.message)
		throw err
	}

	await conn.end()
}

addContactTypeColumn().catch(err => {
	console.error('Migration error:', err)
	process.exit(1)
})
