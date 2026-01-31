require('dotenv').config()
const cors = require('cors')
const express = require('express')
const app = express()
const database = require('./src/database')
const rbacRoutes = require('./src/routes/rbac')
const authRoutes = require('./src/routes/auth')
const usersRoutes = require('./src/routes/users')
const rolesRoutes = require('./src/routes/roles')

const PORT = process.env.PORT || 3000

app.use(cors())
app.use('/rbac', rbacRoutes)
app.use('/auth', express.json(), authRoutes)
app.use('/users', usersRoutes)
app.use('/roles', rolesRoutes)

app.use((req, res, next) => {
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; connect-src 'self' http://localhost:3000 ws://localhost:3000; img-src 'self' data:; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline';"
  )
  next()
})

app.get('/', async (req, res) => {
  try {
    await database.testConnection()
    res.json({ status: 'success' })
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message })
  }
})

app.get('/health', async (req, res) => {
  try {
    await database.testConnection()
    res.json({ status: 'sucess', database: 'success' })
  } catch (err) {
    res.status(500).json({ status: 'error', database: 'error', message: err.message })
  }
})


const server = app.listen(PORT, () => {
  console.log(`\nBackend initialized successfully!`)
})

server.on('error', (err) => {
  if (err && err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Kill the process using that port or set a different PORT in .env.`)
    process.exit(1)
  }
  throw err
})

app.get('/health/database', async (req, res) => {
  try {
    await database.testConnection()
    res.json({ database: 'success' })
  } catch (err) {
    res.status(500).json({ database: 'error', message: err.message })
  }
})
