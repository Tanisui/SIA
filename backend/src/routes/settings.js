const express = require('express')
const router = express.Router()
const db = require('../database')
const { verifyToken, authorize } = require('../middleware/authMiddleware')
const { logAuditEventSafe } = require('../utils/auditLog')
const { ensureRuntimeConfig } = require('../services/runtimeConfigService')

async function getConfigRow(conn, key) {
  const [rows] = await conn.query('SELECT * FROM configs WHERE config_key = ? LIMIT 1', [key])
  return rows[0] || null
}

router.get('/', verifyToken, authorize('system.config.update'), async (req, res) => {
  try {
    await ensureRuntimeConfig()
    const [rows] = await db.pool.query('SELECT * FROM configs ORDER BY config_key')
    res.json(rows)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'failed to fetch settings' })
  }
})

router.get('/:key', verifyToken, authorize('system.config.update'), async (req, res) => {
  try {
    await ensureRuntimeConfig()
    const [rows] = await db.pool.query('SELECT * FROM configs WHERE config_key = ? LIMIT 1', [req.params.key])
    if (!rows.length) return res.status(404).json({ error: 'config key not found' })
    res.json(rows[0])
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'failed to fetch config' })
  }
})

router.post('/', express.json(), verifyToken, authorize('system.config.update'), async (req, res) => {
  try {
    const { config_key, config_value } = req.body || {}
    if (!config_key) return res.status(400).json({ error: 'config_key is required' })

    const before = await getConfigRow(db.pool, config_key)
    await db.pool.query(
      `INSERT INTO configs (config_key, config_value) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE config_value = VALUES(config_value)`,
      [config_key, config_value || '']
    )

    await logAuditEventSafe(db.pool, {
      userId: req.auth.id,
      action: before ? 'CONFIG_UPDATED' : 'CONFIG_CREATED',
      resourceType: 'Config',
      resourceId: config_key,
      details: {
        module: 'system',
        severity: 'high',
        target_label: config_key,
        summary: before ? `Updated setting "${config_key}"` : `Created setting "${config_key}"`,
        before: before ? { config_value: before.config_value } : undefined,
        after: { config_value: config_value || '' }
      }
    })

    res.json({ success: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'failed to save config' })
  }
})

router.put('/:key', express.json(), verifyToken, authorize('system.config.update'), async (req, res) => {
  try {
    const { config_value } = req.body || {}
    const before = await getConfigRow(db.pool, req.params.key)
    await db.pool.query(
      `UPDATE configs SET config_value = ? WHERE config_key = ?`,
      [config_value || '', req.params.key]
    )

    await logAuditEventSafe(db.pool, {
      userId: req.auth.id,
      action: 'CONFIG_UPDATED',
      resourceType: 'Config',
      resourceId: req.params.key,
      details: {
        module: 'system',
        severity: 'high',
        target_label: req.params.key,
        summary: `Updated setting "${req.params.key}"`,
        before: before ? { config_value: before.config_value } : undefined,
        after: { config_value: config_value || '' }
      }
    })

    res.json({ success: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'failed to update config' })
  }
})

router.delete('/:key', verifyToken, authorize('system.config.update'), async (req, res) => {
  try {
    const before = await getConfigRow(db.pool, req.params.key)
    await db.pool.query('DELETE FROM configs WHERE config_key = ?', [req.params.key])

    await logAuditEventSafe(db.pool, {
      userId: req.auth.id,
      action: 'CONFIG_DELETED',
      resourceType: 'Config',
      resourceId: req.params.key,
      details: {
        module: 'system',
        severity: 'high',
        target_label: req.params.key,
        summary: `Deleted setting "${req.params.key}"`,
        before: before ? { config_value: before.config_value } : undefined
      }
    })

    res.json({ success: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'failed to delete config' })
  }
})

router.post('/bulk', express.json(), verifyToken, authorize('system.config.update'), async (req, res) => {
  try {
    const { settings } = req.body || {}
    if (!settings || !Array.isArray(settings)) return res.status(400).json({ error: 'settings array is required' })

    const conn = await db.pool.getConnection()
    try {
      await conn.beginTransaction()

      const before = {}
      const after = {}

      for (const setting of settings) {
        const key = setting?.config_key
        if (!key) continue
        const existing = await getConfigRow(conn, key)
        before[key] = existing ? existing.config_value : null
        after[key] = setting?.config_value || ''

        await conn.query(
          `INSERT INTO configs (config_key, config_value) VALUES (?, ?)
           ON DUPLICATE KEY UPDATE config_value = VALUES(config_value)`,
          [key, setting?.config_value || '']
        )
      }

      await conn.commit()

      await logAuditEventSafe(db.pool, {
        userId: req.auth.id,
        action: 'CONFIG_BULK_UPDATED',
        resourceType: 'Config',
        resourceId: 'bulk',
        details: {
          module: 'system',
          severity: 'high',
          target_label: 'Bulk settings update',
          summary: `Updated ${Object.keys(after).length} setting(s) in bulk`,
          before,
          after,
          metrics: { updated_count: Object.keys(after).length }
        }
      })

      res.json({ success: true })
    } catch (err) {
      await conn.rollback()
      throw err
    } finally {
      conn.release()
    }
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'failed to bulk update settings' })
  }
})

module.exports = router
