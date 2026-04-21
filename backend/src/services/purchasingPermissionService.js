const db = require('../database')

const PURCHASE_PERMISSION_DEFINITIONS = [
  ['purchase.view', 'View purchase records and delivery status'],
  ['purchase.create', 'Create new purchase records'],
  ['purchase.update', 'Update existing purchase records'],
  ['purchase.delete', 'Delete purchase records'],
  ['purchase.receive', 'Receive delivered purchases into stock']
]

const PURCHASE_PERMISSION_NAMES = PURCHASE_PERMISSION_DEFINITIONS.map(([name]) => name)
const LEGACY_PERMISSION_GRANTS = [
  { source: 'admin.*', targets: PURCHASE_PERMISSION_NAMES },
  { source: 'inventory.view', targets: ['purchase.view'] },
  { source: 'inventory.receive', targets: PURCHASE_PERMISSION_NAMES }
]

let ensurePurchasingPermissionsPromise = null

async function grantMappedPermissions(tableName, principalColumn, sourcePermissionId, targetPermissionIds) {
  if (!sourcePermissionId || !targetPermissionIds.length) return

  for (const targetPermissionId of targetPermissionIds) {
    await db.pool.query(
      `INSERT IGNORE INTO ${tableName} (${principalColumn}, permission_id)
       SELECT legacy.${principalColumn}, ?
       FROM ${tableName} legacy
       WHERE legacy.permission_id = ?`,
      [targetPermissionId, sourcePermissionId]
    )
  }
}

async function ensurePurchasingPermissions() {
  if (ensurePurchasingPermissionsPromise) return ensurePurchasingPermissionsPromise

  ensurePurchasingPermissionsPromise = (async () => {
    for (const [name, description] of PURCHASE_PERMISSION_DEFINITIONS) {
      await db.pool.query(
        'INSERT IGNORE INTO permissions (name, description) VALUES (?, ?)',
        [name, description]
      )
    }

    const permissionNames = Array.from(
      new Set([
        ...PURCHASE_PERMISSION_NAMES,
        ...LEGACY_PERMISSION_GRANTS.map((mapping) => mapping.source)
      ])
    )

    const [permissionRows] = await db.pool.query(
      'SELECT id, name FROM permissions WHERE name IN (?)',
      [permissionNames]
    )
    const permissionIds = new Map(permissionRows.map((row) => [row.name, row.id]))

    for (const mapping of LEGACY_PERMISSION_GRANTS) {
      const sourcePermissionId = permissionIds.get(mapping.source)
      const targetPermissionIds = mapping.targets
        .map((permissionName) => permissionIds.get(permissionName))
        .filter(Boolean)

      await grantMappedPermissions('role_permissions', 'role_id', sourcePermissionId, targetPermissionIds)
      await grantMappedPermissions('user_permissions', 'user_id', sourcePermissionId, targetPermissionIds)
    }
  })().catch((error) => {
    ensurePurchasingPermissionsPromise = null
    throw error
  })

  return ensurePurchasingPermissionsPromise
}

module.exports = {
  PURCHASE_PERMISSION_NAMES,
  ensurePurchasingPermissions
}
