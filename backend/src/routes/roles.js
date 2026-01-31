const express = require('express')
const router = express.Router()
const db = require('../database')
const { verifyToken, authorize } = require('../middleware/authMiddleware')

router.get('/', verifyToken, authorize('roles.view'), async (req, res) => {
  try {
    const [roles] = await db.pool.query('SELECT id, name, description, created_at FROM roles ORDER BY name')
    const result = []
    for (const role of roles) {
      const [perms] = await db.pool.query(
        `SELECT p.id, p.name FROM permissions p JOIN role_permissions rp ON rp.permission_id = p.id WHERE rp.role_id = ? ORDER BY p.name`,
        [role.id]
      )
      result.push({ ...role, permissions: perms.map(p => p.name) })
    }
    res.json(result)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'failed to fetch roles' })
  }
})

router.post('/', express.json(), verifyToken, authorize('roles.create'), async (req, res) => {
  try {
    const { name, description, permissions } = req.body || {}
    if (!name) return res.status(400).json({ error: 'name required' })
    const [r] = await db.pool.query('INSERT INTO roles (name, description) VALUES (?, ?)', [name, description || null])
    const roleId = r.insertId
    if (Array.isArray(permissions)) {
      for (const p of permissions) {
        if (Number(p)) {
          await db.pool.query('INSERT IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)', [roleId, Number(p)])
        } else {
          const [rows] = await db.pool.query('SELECT id FROM permissions WHERE name = ? LIMIT 1', [p])
          if (rows.length) await db.pool.query('INSERT IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)', [roleId, rows[0].id])
        }
      }
    }
    res.json({ id: roleId })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'failed to create role' })
  }
})

router.put('/:id', express.json(), verifyToken, authorize('roles.update'), async (req, res) => {
  try {
    const id = Number(req.params.id)
    const { name, description, permissions } = req.body || {}
    if (name) await db.pool.query('UPDATE roles SET name = ?, description = ? WHERE id = ?', [name, description || null, id])
    if (Array.isArray(permissions)) {
      await db.pool.query('DELETE FROM role_permissions WHERE role_id = ?', [id])
      for (const p of permissions) {
        if (Number(p)) {
          await db.pool.query('INSERT IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)', [id, Number(p)])
        } else {
          const [rows] = await db.pool.query('SELECT id FROM permissions WHERE name = ? LIMIT 1', [p])
          if (rows.length) await db.pool.query('INSERT IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)', [id, rows[0].id])
        }
      }
    }
    res.json({ ok: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'failed to update role' })
  }
})

router.delete('/:id', verifyToken, authorize('roles.delete'), async (req, res) => {
  try {
    const id = Number(req.params.id)
    await db.pool.query('DELETE FROM roles WHERE id = ?', [id])
    res.json({ ok: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'failed to delete role' })
  }
})

module.exports = router
