const express = require('express')
const router = express.Router()
const db = require('../database')
const { verifyToken, authorize } = require('../middleware/authMiddleware')

// Get all settings
router.get('/', verifyToken, authorize('system.config.update'), async (req, res) => {
  try {
    const [rows] = await db.pool.query('SELECT * FROM configs ORDER BY config_key')
    // Return as array for EntityPage, but also support object form
    res.json(rows)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'failed to fetch settings' })
  }
})

// Get a single config value
router.get('/:key', verifyToken, authorize('system.config.update'), async (req, res) => {
  try {
    const [rows] = await db.pool.query('SELECT * FROM configs WHERE config_key = ? LIMIT 1', [req.params.key])
    if (!rows.length) return res.status(404).json({ error: 'config key not found' })
    res.json(rows[0])
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'failed to fetch config' })
  }
})

// Create or update a config (upsert)
router.post('/', express.json(), verifyToken, authorize('system.config.update'), async (req, res) => {
  try {
    const { config_key, config_value } = req.body
    if (!config_key) return res.status(400).json({ error: 'config_key is required' })
    await db.pool.query(
      `INSERT INTO configs (config_key, config_value) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE config_value = VALUES(config_value)`,
      [config_key, config_value || '']
    )
    res.json({ success: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'failed to save config' })
  }
})

// Update a config by key
router.put('/:key', express.json(), verifyToken, authorize('system.config.update'), async (req, res) => {
  try {
    const { config_value } = req.body
    await db.pool.query(
      `UPDATE configs SET config_value = ? WHERE config_key = ?`,
      [config_value || '', req.params.key]
    )
    res.json({ success: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'failed to update config' })
  }
})

// Delete a config
router.delete('/:key', verifyToken, authorize('system.config.update'), async (req, res) => {
  try {
    await db.pool.query('DELETE FROM configs WHERE config_key = ?', [req.params.key])
    res.json({ success: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'failed to delete config' })
  }
})

// Bulk update settings
router.post('/bulk', express.json(), verifyToken, authorize('system.config.update'), async (req, res) => {
  try {
    const { settings } = req.body
    if (!settings || !Array.isArray(settings)) return res.status(400).json({ error: 'settings array is required' })
    const conn = await db.pool.getConnection()
    try {
      await conn.beginTransaction()
      for (const s of settings) {
        await conn.query(
          `INSERT INTO configs (config_key, config_value) VALUES (?, ?)
           ON DUPLICATE KEY UPDATE config_value = VALUES(config_value)`,
          [s.config_key, s.config_value || '']
        )
      }
      await conn.commit()
      res.json({ success: true })
    } catch (e) {
      await conn.rollback()
      throw e
    } finally {
      conn.release()
    }
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'failed to bulk update settings' })
  }
})

module.exports = router
