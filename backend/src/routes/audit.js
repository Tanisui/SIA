const express = require('express')
const router = express.Router()
const db = require('../database')
const { verifyToken, authorize } = require('../middleware/authMiddleware')
const { enrichAuditRow, ensureAuditSchema } = require('../utils/auditLog')

function parsePositiveInt(value, fallback, maxValue = 100) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback
  return Math.min(Math.floor(parsed), maxValue)
}

function buildModuleSql(alias = 'a') {
  return `
    COALESCE(
      NULLIF(LOWER(JSON_UNQUOTE(JSON_EXTRACT(${alias}.details, '$.module'))), 'null'),
      CASE
        WHEN UPPER(${alias}.action) LIKE 'INVENTORY_%' THEN 'inventory'
        WHEN UPPER(${alias}.action) LIKE 'SALE_%' THEN 'sales'
        WHEN UPPER(${alias}.action) LIKE 'AUTH_%'
          OR UPPER(${alias}.action) LIKE 'USER_%'
          OR UPPER(${alias}.action) LIKE 'ROLE_%' THEN 'access'
        WHEN UPPER(${alias}.action) LIKE 'SUPPLIER_%'
          OR UPPER(${alias}.action) LIKE 'PURCHASE_ORDER_%'
          OR UPPER(${alias}.action) LIKE 'BALE_%' THEN 'purchasing'
        WHEN UPPER(${alias}.action) LIKE 'CONFIG_%'
          OR UPPER(${alias}.action) LIKE 'SYSTEM_%' THEN 'system'
        WHEN LOWER(COALESCE(${alias}.resource_type, '')) LIKE '%product%'
          OR LOWER(COALESCE(${alias}.resource_type, '')) LIKE '%inventory%' THEN 'inventory'
        WHEN LOWER(COALESCE(${alias}.resource_type, '')) LIKE '%sale%' THEN 'sales'
        WHEN LOWER(COALESCE(${alias}.resource_type, '')) LIKE '%supplier%'
          OR LOWER(COALESCE(${alias}.resource_type, '')) LIKE '%purchase%' THEN 'purchasing'
        WHEN LOWER(COALESCE(${alias}.resource_type, '')) LIKE '%config%'
          OR LOWER(COALESCE(${alias}.resource_type, '')) LIKE '%system%' THEN 'system'
        WHEN LOWER(COALESCE(${alias}.resource_type, '')) LIKE '%role%'
          OR LOWER(COALESCE(${alias}.resource_type, '')) LIKE '%user%'
          OR LOWER(COALESCE(${alias}.resource_type, '')) LIKE '%auth%' THEN 'access'
        ELSE 'other'
      END
    )
  `
}

function buildSeveritySql(alias = 'a') {
  return `
    COALESCE(
      NULLIF(LOWER(JSON_UNQUOTE(JSON_EXTRACT(${alias}.details, '$.severity'))), 'null'),
      CASE
        WHEN UPPER(${alias}.action) REGEXP 'FAILED|BLOCKED|DELETE|PASSWORD|REFUND|PRICE_OVERRIDE|CONFIG|ROLE_|PERMISSION|REVERS' THEN 'high'
        WHEN UPPER(${alias}.action) REGEXP 'DISCOUNT|CREATE|UPDATE|RECEIVE|DAMAGE|SHRINKAGE|RETURN' THEN 'medium'
        ELSE 'low'
      END
    )
  `
}

function buildAuditWhereClause(query = {}) {
  const params = []
  const clauses = ['1=1']
  const moduleSql = buildModuleSql('a')
  const severitySql = buildSeveritySql('a')

  if (query.user_id) {
    clauses.push('a.user_id = ?')
    params.push(query.user_id)
  }

  if (query.user) {
    const needle = `%${String(query.user).trim()}%`
    clauses.push('(u.username LIKE ? OR u.full_name LIKE ?)')
    params.push(needle, needle)
  }

  if (query.action) {
    clauses.push('a.action LIKE ?')
    params.push(`%${String(query.action).trim()}%`)
  }

  if (query.resource_type) {
    clauses.push('a.resource_type LIKE ?')
    params.push(`%${String(query.resource_type).trim()}%`)
  }

  if (query.module) {
    clauses.push(`${moduleSql} = ?`)
    params.push(String(query.module).trim().toLowerCase())
  }

  if (query.severity) {
    const severityFilter = String(query.severity).trim().toLowerCase()
    if (severityFilter === 'critical') {
      clauses.push(`${severitySql} IN ('high', 'critical')`)
    } else if (severityFilter === 'warning') {
      clauses.push(`${severitySql} = 'medium'`)
    } else if (severityFilter === 'info') {
      clauses.push(`${severitySql} IN ('low')`)
    } else {
      clauses.push(`${severitySql} = ?`)
      params.push(severityFilter)
    }
  }

  if (query.start_date) {
    clauses.push('a.created_at >= ?')
    params.push(query.start_date)
  }

  if (query.end_date) {
    clauses.push('a.created_at <= ?')
    params.push(`${query.end_date} 23:59:59`)
  }

  if (query.q) {
    const needle = `%${String(query.q).trim()}%`
    clauses.push(`(
      a.action LIKE ?
      OR a.resource_id LIKE ?
      OR COALESCE(u.username, '') LIKE ?
      OR COALESCE(u.full_name, '') LIKE ?
      OR CAST(a.details AS CHAR) LIKE ?
      OR ${moduleSql} LIKE ?
    )`)
    params.push(needle, needle, needle, needle, needle, needle)
  }

  return { whereSql: clauses.join(' AND '), params }
}

router.get('/', verifyToken, authorize('system.audit.view'), async (req, res) => {
  try {
    await ensureAuditSchema()

    const page = parsePositiveInt(req.query.page, 1, 100000)
    const limit = parsePositiveInt(req.query.limit, 50, 200)
    const offset = (page - 1) * limit
    const { whereSql, params } = buildAuditWhereClause(req.query)
    const moduleSql = buildModuleSql('a')
    const severitySql = buildSeveritySql('a')

    const [countRows] = await db.pool.query(
      `SELECT COUNT(*) AS total
       FROM audit_logs a
       LEFT JOIN users u ON u.id = a.user_id
       WHERE ${whereSql}`,
      params
    )

    const [summaryRows] = await db.pool.query(
      `SELECT
         SUM(CASE WHEN a.created_at >= CURRENT_DATE() THEN 1 ELSE 0 END) AS events_today,
         SUM(CASE WHEN ${moduleSql} = 'inventory' THEN 1 ELSE 0 END) AS inventory_adjustments,
         SUM(CASE WHEN UPPER(a.action) REGEXP 'REFUND|REVERS|RETURN' THEN 1 ELSE 0 END) AS reversals_refunds,
         SUM(CASE WHEN ${severitySql} IN ('high', 'critical') THEN 1 ELSE 0 END) AS sensitive_actions
       FROM audit_logs a
       LEFT JOIN users u ON u.id = a.user_id
       WHERE ${whereSql}`,
      params
    )

    const [rows] = await db.pool.query(
      `SELECT
         a.*,
         u.username,
         u.full_name
       FROM audit_logs a
       LEFT JOIN users u ON u.id = a.user_id
       WHERE ${whereSql}
       ORDER BY a.created_at DESC, a.id DESC
       LIMIT ?
       OFFSET ?`,
      [...params, limit, offset]
    )

    const items = rows.map(enrichAuditRow)
    const total = Number(countRows[0]?.total) || 0
    const totalPages = total > 0 ? Math.ceil(total / limit) : 1
    const summaryRow = summaryRows[0] || {}

    res.json({
      items,
      total,
      page,
      limit,
      total_pages: totalPages,
      summary: {
        events_today: Number(summaryRow.events_today) || 0,
        inventory_adjustments: Number(summaryRow.inventory_adjustments) || 0,
        reversals_refunds: Number(summaryRow.reversals_refunds) || 0,
        sensitive_actions: Number(summaryRow.sensitive_actions) || 0
      }
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'failed to fetch audit logs' })
  }
})

router.get('/:id', verifyToken, authorize('system.audit.view'), async (req, res) => {
  try {
    await ensureAuditSchema()
    const [rows] = await db.pool.query(
      `SELECT a.*, u.username, u.full_name
       FROM audit_logs a
       LEFT JOIN users u ON u.id = a.user_id
       WHERE a.id = ?
       LIMIT 1`,
      [req.params.id]
    )

    if (!rows.length) return res.status(404).json({ error: 'audit log not found' })
    res.json(enrichAuditRow(rows[0]))
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'failed to fetch audit log' })
  }
})

module.exports = router
