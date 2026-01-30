require('dotenv').config()
const cors = require('cors')
const express = require('express')
const app = express()
const PORT = process.env.PORT || 3000
app.use(cors())
const db = require('./src/database')

app.get('/', (req, res) => {
  res.json({ status: 'ok' })
})

app.listen(PORT, () => {
  console.log(`\nBackend initialized successfully!`)
})

app.get('/health/db', async (req, res) => {
  try {
    await db.testConnection()
    res.json({ db: 'ok' })
  } catch (err) {
    res.status(500).json({ db: 'error', message: err.message })
  }
})
