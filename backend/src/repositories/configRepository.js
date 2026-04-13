async function ensureConfigsTable(conn) {
  await conn.query(`
    CREATE TABLE IF NOT EXISTS configs (
      config_key VARCHAR(255) PRIMARY KEY,
      config_value TEXT,
      last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)
}

async function upsertConfigValues(conn, entries) {
  for (const [configKey, configValue] of Object.entries(entries || {})) {
    await conn.query(
      `INSERT INTO configs (config_key, config_value) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE config_value = COALESCE(configs.config_value, VALUES(config_value))`,
      [configKey, String(configValue ?? '')]
    )
  }
}

async function getConfigMap(conn, keys) {
  if (!Array.isArray(keys) || !keys.length) return {}
  const placeholders = keys.map(() => '?').join(', ')
  const [rows] = await conn.query(
    `SELECT config_key, config_value
     FROM configs
     WHERE config_key IN (${placeholders})`,
    keys
  )

  return rows.reduce((acc, row) => {
    acc[row.config_key] = row.config_value
    return acc
  }, {})
}

module.exports = {
  ensureConfigsTable,
  upsertConfigValues,
  getConfigMap
}
