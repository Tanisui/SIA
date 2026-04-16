const express = require('express')
const router = express.Router()
const db = require('../database')
const { verifyToken, authorize } = require('../middleware/authMiddleware')
const { logAuditEventSafe } = require('../utils/auditLog')

async function getRolePermissions(conn, roleId) {
  const [rows] = await conn.query(
    `SELECT p.id, p.name
     FROM permissions p
     JOIN role_permissions rp ON rp.permission_id = p.id
     WHERE rp.role_id = ?
     ORDER BY p.name`,
    [roleId]
  )
  return rows.map((row) => row.name)
}

async function resolvePermissionNames(conn, permissions) {
  const resolved = []
  if (!Array.isArray(permissions)) return resolved

  for (const permission of permissions) {
    if (Number(permission)) {
      const [rows] = await conn.query('SELECT name FROM permissions WHERE id = ? LIMIT 1', [Number(permission)])
      if (rows.length) resolved.push(rows[0].name)
      continue
    }

    const [rows] = await conn.query('SELECT id, name FROM permissions WHERE name = ? LIMIT 1', [permission])
    if (rows.length) resolved.push(rows[0].name)
  }

  return Array.from(new Set(resolved))
}

async function attachPermissions(conn, roleId, permissions) {
  const resolved = await resolvePermissionNames(conn, permissions)
  for (const permissionName of resolved) {
    const [rows] = await conn.query('SELECT id FROM permissions WHERE name = ? LIMIT 1', [permissionName])
    if (rows.length) {
      await conn.query('INSERT IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)', [roleId, rows[0].id])
    }
  }
  return resolved
}

router.get('/', verifyToken, authorize('roles.view'), async (req, res) => {
  try {
    const [roles] = await db.pool.query('SELECT id, name, description, created_at FROM roles ORDER BY name')
    const result = []
    for (const role of roles) {
      result.push({ ...role, permissions: await getRolePermissions(db.pool, role.id) })
    }
    res.json(result)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'failed to fetch roles' })
  }
})

router.post('/', express.json(), verifyToken, authorize('roles.create'), async (req, res) => {
  const conn = await db.pool.getConnection()
  try {
    const { name, description, permissions } = req.body || {}
    if (!name) return res.status(400).json({ error: 'name required' })

    await conn.beginTransaction()
    const [result] = await conn.query('INSERT INTO roles (name, description) VALUES (?, ?)', [name, description || null])
    const roleId = result.insertId
    const resolvedPermissions = await attachPermissions(conn, roleId, permissions)
    await conn.commit()

    await logAuditEventSafe(db.pool, {
      userId: req.auth.id,
      action: 'ROLE_CREATED',
      resourceType: 'Role',
      resourceId: roleId,
      details: {
        module: 'access',
        severity: 'high',
        target_label: name,
        summary: `Created role "${name}"`,
        after: { name, description: description || null, permissions: resolvedPermissions },
        metrics: { permission_count: resolvedPermissions.length }
      }
    })

    res.json({ id: roleId })
  } catch (err) {
    await conn.rollback().catch(() => {})
    console.error(err)
    res.status(500).json({ error: 'failed to create role' })
  } finally {
    conn.release()
  }
})

router.put('/:id', express.json(), verifyToken, authorize('roles.update'), async (req, res) => {
  const conn = await db.pool.getConnection()
  try {
    const id = Number(req.params.id)
    const { name, description, permissions } = req.body || {}

    await conn.beginTransaction()
    const [beforeRows] = await conn.query('SELECT id, name, description FROM roles WHERE id = ? LIMIT 1', [id])
    if (!beforeRows.length) {
      await conn.rollback()
      return res.status(404).json({ error: 'role not found' })
    }

    const before = beforeRows[0]
    const beforePermissions = await getRolePermissions(conn, id)

    if (name) {
      await conn.query('UPDATE roles SET name = ?, description = ? WHERE id = ?', [name, description || null, id])
    }

    let afterPermissions = beforePermissions
    if (Array.isArray(permissions)) {
      await conn.query('DELETE FROM role_permissions WHERE role_id = ?', [id])
      afterPermissions = await attachPermissions(conn, id, permissions)
    }

    const [afterRows] = await conn.query('SELECT id, name, description FROM roles WHERE id = ? LIMIT 1', [id])
    await conn.commit()

    await logAuditEventSafe(db.pool, {
      userId: req.auth.id,
      action: 'ROLE_UPDATED',
      resourceType: 'Role',
      resourceId: id,
      details: {
        module: 'access',
        severity: 'high',
        target_label: afterRows[0].name,
        summary: `Updated role "${afterRows[0].name}"`,
        before: { name: before.name, description: before.description, permissions: beforePermissions },
        after: { name: afterRows[0].name, description: afterRows[0].description, permissions: afterPermissions },
        metrics: { permission_count: afterPermissions.length }
      }
    })

    res.json({ ok: true })
  } catch (err) {
    await conn.rollback().catch(() => {})
    console.error(err)
    res.status(500).json({ error: 'failed to update role' })
  } finally {
    conn.release()
  }
})

router.delete('/:id', verifyToken, authorize('roles.delete'), async (req, res) => {
  const conn = await db.pool.getConnection()
  try {
    const id = Number(req.params.id)
    await conn.beginTransaction()

    const [beforeRows] = await conn.query('SELECT id, name, description FROM roles WHERE id = ? LIMIT 1', [id])
    if (!beforeRows.length) {
      await conn.rollback()
      return res.status(404).json({ error: 'role not found' })
    }

    const beforePermissions = await getRolePermissions(conn, id)
    await conn.query('DELETE FROM roles WHERE id = ?', [id])
    await conn.commit()

    await logAuditEventSafe(db.pool, {
      userId: req.auth.id,
      action: 'ROLE_DELETED',
      resourceType: 'Role',
      resourceId: id,
      details: {
        module: 'access',
        severity: 'high',
        target_label: beforeRows[0].name,
        summary: `Deleted role "${beforeRows[0].name}"`,
        before: {
          name: beforeRows[0].name,
          description: beforeRows[0].description,
          permissions: beforePermissions
        },
        metrics: { permission_count: beforePermissions.length }
      }
    })

    res.json({ ok: true })
  } catch (err) {
    await conn.rollback().catch(() => {})
    console.error(err)
    res.status(500).json({ error: 'failed to delete role' })
  } finally {
    conn.release()
  }
})

module.exports = router
