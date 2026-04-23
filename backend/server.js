require('dotenv').config()
const cors = require('cors')
const express = require('express')
const path = require('path')
const app = express()
const database = require('./src/database')
const rbacRoutes = require('./src/routes/rbac')
const authRoutes = require('./src/routes/auth')
const usersRoutes = require('./src/routes/users')
const rolesRoutes = require('./src/routes/roles')
const productsRoutes = require('./src/routes/products')
const customersRoutes = require('./src/routes/customers')
const suppliersRoutes = require('./src/routes/suppliers')
const inventoryRoutes = require('./src/routes/inventory')
const balePurchasesRoutes = require('./src/routes/balePurchases')
const salesRoutes = require('./src/routes/sales')
const employeesRoutes = require('./src/routes/employees')
const auditRoutes = require('./src/routes/audit')
const settingsRoutes = require('./src/routes/settings')
const notificationsRoutes = require('./src/routes/notifications')
const reportsRoutes = require('./src/routes/reports')
const filesRoutes = require('./src/routes/files')
const categoriesRoutes = require('./src/routes/categories')
const expensesRoutes = require('./src/routes/expenses')
const dashboardRoutes = require('./src/routes/dashboard')
const ledgerRoutes = require('./src/routes/ledger')
const balePurchaseOrdersRoutes = require('./src/routes/balePurchaseOrders')
const payrollRoutes = require('./src/routes/payroll.routes')

const PORT = process.env.PORT || 3000

app.use(cors())
app.use(express.json())
app.use('/uploads', express.static(path.join(__dirname, 'uploads')))

app.use((req, res, next) => {
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; connect-src 'self' http://localhost:3000 http://localhost:5000 http://localhost:5173 http://localhost:5174 ws://localhost:3000 ws://localhost:5000; img-src 'self' data:; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;"
  )
  next()
})

app.use('/rbac', rbacRoutes)
app.use('/auth', express.json(), authRoutes)
app.use('/users', usersRoutes)
app.use('/roles', rolesRoutes)
app.use('/products', productsRoutes)
app.use('/api/products', productsRoutes)
app.use('/customers', customersRoutes)
app.use('/api/customers', customersRoutes)
app.use('/suppliers', suppliersRoutes)
app.use('/inventory', inventoryRoutes)
app.use('/bale-purchases', balePurchasesRoutes)
app.use('/bale-purchase-orders', balePurchaseOrdersRoutes)
app.use('/sales', salesRoutes)
app.use('/api/sales', salesRoutes)
app.use('/employees', employeesRoutes)
app.use('/audit', auditRoutes)
app.use('/settings', settingsRoutes)
app.use('/notifications', notificationsRoutes)
app.use('/reports', reportsRoutes)
app.use('/files', filesRoutes)
app.use('/categories', categoriesRoutes)
app.use('/expenses', expensesRoutes)
app.use('/dashboard', dashboardRoutes)
app.use('/ledger', ledgerRoutes)
app.use('/payroll', payrollRoutes)
app.use('/api/payroll', payrollRoutes)

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
    res.json({ status: 'success', database: 'success' })
  } catch (err) {
    res.status(500).json({ status: 'error', database: 'error', message: err.message })
  }
})


const server = app.listen(PORT, () => {
  console.log(`\nBackend initialized successfully!\n`)
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

module.exports = { app, server }
