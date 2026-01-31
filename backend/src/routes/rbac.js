const express = require('express')
const router = express.Router()
const db = require('../database')

router.get('/permissions', async (req, res) => {
  try {
    const [rows] = await db.pool.query('SELECT id, name, description FROM permissions ORDER BY name')
    res.json({ permissions: rows })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'failed to fetch permissions' })
  }
})

router.get('/roles', async (req, res) => {
  try {
    const [roles] = await db.pool.query('SELECT id, name, description FROM roles ORDER BY name')
    const result = []
    for (const role of roles) {
      const [perms] = await db.pool.query(
        `SELECT p.id, p.name FROM permissions p
         JOIN role_permissions rp ON rp.permission_id = p.id
         WHERE rp.role_id = ? ORDER BY p.name`,
        [role.id]
      )
      result.push({ ...role, permissions: perms.map(p => p.name) })
    }
    res.json({ roles: result })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'failed to fetch roles' })
  }
})

router.get('/users/:id/roles', async (req, res) => {
  try {
    const userId = Number(req.params.id)
    if (!userId) return res.status(400).json({ error: 'invalid user id' })

    const [rows] = await db.pool.query(
      `SELECT r.id, r.name FROM roles r
       JOIN user_roles ur ON ur.role_id = r.id
       WHERE ur.user_id = ?`,
      [userId]
    )

    const roles = []
    for (const r of rows) {
      const [perms] = await db.pool.query(
        `SELECT p.name FROM permissions p
         JOIN role_permissions rp ON rp.permission_id = p.id
         WHERE rp.role_id = ? ORDER BY p.name`,
        [r.id]
      )
      roles.push({ id: r.id, name: r.name, permissions: perms.map(p => p.name) })
    }

    res.json({ userId, roles })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'failed to fetch user roles' })
  }
})

module.exports = router
