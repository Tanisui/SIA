const express = require('express')
const router = express.Router()
const db = require('../database')
const crypto = require('crypto')
const jwt = require('jsonwebtoken')
const bcrypt = require('bcrypt')
const { getJwtSecret } = require('../config/security')
const { logAuditEventSafe } = require('../utils/auditLog')
const { ensurePurchasingPermissions } = require('../services/purchasingPermissionService')

let hasUsersRoleIdColumnCache = null

async function hasUsersRoleIdColumn() {
  if (hasUsersRoleIdColumnCache !== null) return hasUsersRoleIdColumnCache
  const [rows] = await db.pool.query(
    `SELECT 1 AS found
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'users'
       AND COLUMN_NAME = 'role_id'
     LIMIT 1`
  )
  hasUsersRoleIdColumnCache = rows.length > 0
  return hasUsersRoleIdColumnCache
}

async function verifyPassword(storedHash, password) {
  if (!storedHash) return false

  if (storedHash.startsWith('pbkdf2_sha512$')) {
    const parts = storedHash.split('$')
    if (parts.length !== 4) return false
    const iterations = Number(parts[1])
    const salt = parts[2]
    const derived = parts[3]
    const derivedCheck = crypto.pbkdf2Sync(password, salt, iterations, 64, 'sha512').toString('hex')
    return crypto.timingSafeEqual(Buffer.from(derivedCheck, 'hex'), Buffer.from(derived, 'hex'))
  }

  return bcrypt.compare(password, storedHash)
}

async function getUserPermissions(userId) {
  await ensurePurchasingPermissions()
  const includeDirectRole = await hasUsersRoleIdColumn()
  const roleSql = includeDirectRole
    ? `SELECT id, name FROM roles
       WHERE id IN (SELECT role_id FROM user_roles WHERE user_id = ?)
          OR id = (SELECT role_id FROM users WHERE id = ?)`
    : `SELECT id, name FROM roles
       WHERE id IN (SELECT role_id FROM user_roles WHERE user_id = ?)`

  const roleParams = includeDirectRole ? [userId, userId] : [userId]
  const [roleRows] = await db.pool.query(roleSql, roleParams)

  const perms = new Set()
  for (const role of roleRows) {
    const [permissionRows] = await db.pool.query(
      `SELECT p.name FROM permissions p
       JOIN role_permissions rp ON rp.permission_id = p.id
       WHERE rp.role_id = ?`,
      [role.id]
    )
    for (const permission of permissionRows) perms.add(permission.name)
  }

  const [userPermissionRows] = await db.pool.query(
    `SELECT p.name FROM permissions p
     JOIN user_permissions up ON up.permission_id = p.id
     WHERE up.user_id = ?`,
    [userId]
  )
  for (const permission of userPermissionRows) perms.add(permission.name)

  return {
    roles: roleRows.map((row) => row.name),
    permissions: Array.from(perms)
  }
}

async function buildAuthSession(user) {
  const permInfo = await getUserPermissions(user.id)
  const token = jwt.sign({ id: user.id, username: user.username }, getJwtSecret(), { expiresIn: '8h' })

  return {
    token,
    user: {
      id: user.id,
      username: user.username,
      full_name: user.full_name,
      email: user.email,
      roles: permInfo.roles,
      permissions: permInfo.permissions
    }
  }
}

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body || {}
    if (!username || !password) {
      return res.status(400).json({ error: 'username and password required' })
    }

    const [rows] = await db.pool.query(
      'SELECT id, username, email, password_hash, full_name, is_active FROM users WHERE username = ? LIMIT 1',
      [username]
    )

    if (!rows.length) {
      await logAuditEventSafe(db.pool, {
        action: 'AUTH_LOGIN_FAILED',
        resourceType: 'Auth',
        resourceId: username || null,
        details: {
          module: 'access',
          severity: 'high',
          target_label: username || 'Unknown user',
          summary: 'Failed login attempt',
          metadata: { username: username || null, failure_reason: 'user_not_found' }
        }
      })
      return res.status(401).json({ error: 'invalid credentials' })
    }

    const user = rows[0]
    const activeFlag = Number(user.is_active)
    if (activeFlag !== 1) {
      await logAuditEventSafe(db.pool, {
        userId: user.id,
        action: 'AUTH_LOGIN_BLOCKED',
        resourceType: 'Auth',
        resourceId: user.id,
        details: {
          module: 'access',
          severity: 'high',
          target_label: user.username,
          summary: 'Blocked login attempt for inactive account',
          metadata: { username: user.username, failure_reason: 'inactive_account' }
        }
      })
      return res.status(403).json({ error: 'Account inactive - contact the administrator to activate your account' })
    }

    if (!(await verifyPassword(user.password_hash, password))) {
      await logAuditEventSafe(db.pool, {
        userId: user.id,
        action: 'AUTH_LOGIN_FAILED',
        resourceType: 'Auth',
        resourceId: user.id,
        details: {
          module: 'access',
          severity: 'high',
          target_label: user.username,
          summary: 'Failed login attempt',
          metadata: { username: user.username, failure_reason: 'invalid_password' }
        }
      })
      return res.status(401).json({ error: 'invalid credentials' })
    }

    const session = await buildAuthSession(user)

    await logAuditEventSafe(db.pool, {
      userId: user.id,
      action: 'AUTH_LOGIN',
      resourceType: 'Auth',
      resourceId: user.id,
      details: {
        module: 'access',
        severity: 'low',
        target_label: user.username,
        summary: 'User logged in successfully',
        metadata: { username: user.username, roles: session.user.roles }
      }
    })

    res.json(session)
  } catch (err) {
    console.error('Login error:', err)
    res.status(500).json({ error: 'login failed' })
  }
})

router.get('/me', async (req, res) => {
  try {
    const auth = req.headers.authorization || ''
    const parts = auth.split(' ')
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      return res.status(401).json({ error: 'missing token' })
    }

    const token = parts[1]
    let payload
    try {
      payload = jwt.verify(token, getJwtSecret())
    } catch (err) {
      return res.status(401).json({ error: 'invalid token' })
    }

    const info = await getUserPermissions(payload.id)
    return res.json({
      id: payload.id,
      username: payload.username,
      roles: info.roles,
      permissions: info.permissions
    })
  } catch (err) {
    console.error('me route error', err)
    res.status(500).json({ error: 'failed' })
  }
})

router.post('/logout', async (req, res) => {
  try {
    const auth = req.headers.authorization || ''
    const parts = auth.split(' ')
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      return res.status(401).json({ error: 'missing token' })
    }

    let payload
    try {
      payload = jwt.verify(parts[1], getJwtSecret())
    } catch (err) {
      return res.status(401).json({ error: 'invalid token' })
    }

    await logAuditEventSafe(db.pool, {
      userId: payload.id,
      action: 'AUTH_LOGOUT',
      resourceType: 'Auth',
      resourceId: payload.id,
      details: {
        module: 'access',
        severity: 'low',
        result: 'success',
        target_label: payload.username,
        summary: 'User logged out successfully',
        metadata: { username: payload.username }
      }
    })

    return res.json({ success: true })
  } catch (err) {
    console.error('logout route error', err)
    return res.status(500).json({ error: 'failed to logout' })
  }
})

async function handleAccountSecurityUpdate(req, res) {
  try {
    const auth = req.headers.authorization || ''
    const parts = auth.split(' ')
    if (parts.length !== 2 || parts[0] !== 'Bearer') return res.status(401).json({ error: 'missing token' })

    const token = parts[1]
    let payload
    try {
      payload = jwt.verify(token, getJwtSecret())
    } catch (err) {
      return res.status(401).json({ error: 'Session expired. Please log in again.' })
    }

    const body = req.body || {}
    const currentPassword = typeof body.currentPassword === 'string'
      ? body.currentPassword
      : (typeof body.oldPassword === 'string' ? body.oldPassword : '')
    const nextPassword = typeof body.newPassword === 'string' ? body.newPassword : ''
    const wantsPasswordChange = Boolean(nextPassword)
    const wantsUsernameChange = Object.prototype.hasOwnProperty.call(body, 'username')
    const nextUsername = wantsUsernameChange ? String(body.username || '').trim().toLowerCase() : null

    const userId = payload.id
    const [rows] = await db.pool.query(
      'SELECT id, username, email, full_name, password_hash FROM users WHERE id = ? LIMIT 1',
      [userId]
    )
    if (!rows.length) return res.status(404).json({ error: 'User not found' })

    const user = rows[0]
    const usernameChanged = Boolean(wantsUsernameChange && nextUsername && nextUsername !== String(user.username || '').trim().toLowerCase())

    if (!usernameChanged && !wantsPasswordChange) {
      return res.status(400).json({ error: 'No account changes were submitted' })
    }

    if (wantsUsernameChange && !nextUsername) {
      return res.status(400).json({ error: 'Username is required' })
    }

    if (!currentPassword) {
      return res.status(400).json({ error: 'Current password is required' })
    }

    const isValid = await verifyPassword(user.password_hash, currentPassword)
    if (!isValid) return res.status(401).json({ error: 'Incorrect current password' })

    if (usernameChanged) {
      const [existingRows] = await db.pool.query(
        'SELECT id FROM users WHERE username = ? AND id <> ? LIMIT 1',
        [nextUsername, userId]
      )
      if (existingRows.length) {
        return res.status(400).json({ error: 'Username already exists' })
      }
    }

    const updates = []
    const params = []

    if (usernameChanged) {
      updates.push('username = ?')
      params.push(nextUsername)
    }

    if (wantsPasswordChange) {
      const hashedNew = await bcrypt.hash(nextPassword, 10)
      updates.push('password_hash = ?')
      params.push(hashedNew)
    }

    if (updates.length) {
      params.push(userId)
      await db.pool.query(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params)
    }

    const [updatedRows] = await db.pool.query(
      'SELECT id, username, email, full_name FROM users WHERE id = ? LIMIT 1',
      [userId]
    )
    const updatedUser = updatedRows[0] || {
      id: userId,
      username: usernameChanged ? nextUsername : user.username,
      email: user.email,
      full_name: user.full_name
    }
    const session = await buildAuthSession(updatedUser)

    const action = usernameChanged && wantsPasswordChange
      ? 'AUTH_ACCOUNT_UPDATED'
      : usernameChanged
        ? 'AUTH_USERNAME_CHANGED'
        : 'AUTH_PASSWORD_CHANGED'
    const summary = usernameChanged && wantsPasswordChange
      ? 'User changed their username and password'
      : usernameChanged
        ? 'User changed their username'
        : 'User changed their password'

    await logAuditEventSafe(db.pool, {
      userId,
      action,
      resourceType: 'User',
      resourceId: userId,
      details: {
        module: 'access',
        severity: 'high',
        target_label: updatedUser.username,
        summary,
        metadata: {
          previous_username: user.username,
          next_username: updatedUser.username,
          username_changed: usernameChanged,
          password_changed: wantsPasswordChange
        }
      }
    })

    res.json({
      message: usernameChanged && wantsPasswordChange
        ? 'Username and password updated successfully'
        : usernameChanged
          ? 'Username updated successfully'
          : 'Password updated successfully',
      ...session
    })
  } catch (err) {
    console.error(err)
    if (err?.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: 'Username already exists' })
    }
    res.status(500).json({ error: 'Failed to update account security' })
  }
}

router.post('/account-security', handleAccountSecurityUpdate)
router.post('/change-password', handleAccountSecurityUpdate)

router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body || {}
    if (!email) return res.status(400).json({ error: 'email required' })
    return res.json({ message: 'If the email exists, a reset link was sent' })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'failed' })
  }
})

router.post('/forgot-email', async (req, res) => {
  try {
    const { username } = req.body || {}
    if (!username) return res.status(400).json({ error: 'username required' })
    const [rows] = await db.pool.query('SELECT email FROM users WHERE username = ? LIMIT 1', [username])
    if (!rows.length) return res.status(404).json({ error: 'user not found' })

    const email = rows[0].email || ''
    const masked = email.replace(/(.{2}).+(@.+)/, '$1***$2')
    return res.json({ message: 'Email found', email: masked })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'failed' })
  }
})

module.exports = router
