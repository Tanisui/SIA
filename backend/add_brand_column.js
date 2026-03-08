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

async function addBrandColumn() {
	const conn = await mysql.createConnection({
		host: DB_HOST,
		port: Number(DB_PORT),
		user: DB_USERNAME,
		password: DB_PASSWORD,
		database: DB_DATABASE
	})

	try {
		console.log('Checking if brand column exists...')
		const [columns] = await conn.execute(`
			SELECT COLUMN_NAME 
			FROM INFORMATION_SCHEMA.COLUMNS 
			WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'products' AND COLUMN_NAME = 'brand'
		`, [DB_DATABASE])

		if (columns.length > 0) {
			console.log('Brand column already exists.')
		} else {
			console.log('Adding brand column to products table...')
			await conn.execute(`
				ALTER TABLE products 
				ADD COLUMN brand VARCHAR(255) AFTER name
			`)
			console.log('Brand column added successfully!')
		}
	} catch (err) {
		console.error('Error:', err.message)
		throw err
	}

	await conn.end()
}

addBrandColumn().catch(err => {
	console.error('Migration error:', err)
	process.exit(1)
})
