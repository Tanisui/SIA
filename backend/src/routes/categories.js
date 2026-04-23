const express = require('express')
const router = express.Router()
const db = require('../database')
const { verifyToken, authorize } = require('../middleware/authMiddleware')
const { ensureAutomatedReportsSchema } = require('../utils/automatedReports')
const {
  deriveCategoryAndTypeFromBaleCategory,
  isCategoryTableTypeForCategory,
  mergeCategoryTypeOptions,
  normalizeCategoryLabel
} = require('../utils/categoryClassification')

function normalizeCategoryName(value) {
  return normalizeCategoryLabel(value)
}

async function findCategoryByName(name) {
  const normalizedName = normalizeCategoryName(name)
  if (!normalizedName) return null

  const [rows] = await db.pool.query(`
    SELECT id, name, description
    FROM categories
    WHERE LOWER(TRIM(name)) = LOWER(TRIM(?))
    ORDER BY id ASC
    LIMIT 1
  `, [normalizedName])

  return rows[0] || null
}

// List all categories
router.get('/', verifyToken, authorize(['products.view', 'products.create', 'products.edit', 'inventory.view', 'inventory.adjust']), async (req, res) => {
  try {
    await ensureAutomatedReportsSchema()
    const [rows] = await db.pool.query('SELECT id, name, description FROM categories ORDER BY name')
    res.json(rows)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'failed to fetch categories' })
  }
})

// Resolve a category by name, creating it when bale purchase categories do not exist yet.
router.post('/resolve', express.json(), verifyToken, authorize(['products.create', 'products.edit']), async (req, res) => {
  try {
    await ensureAutomatedReportsSchema()

    const [categoryRows] = await db.pool.query('SELECT id, name, description FROM categories ORDER BY name')
    const resolvedInput = deriveCategoryAndTypeFromBaleCategory(req.body?.name, categoryRows)
    const name = normalizeCategoryName(resolvedInput.categoryName)
    if (!name) return res.status(400).json({ error: 'name is required' })

    const existingCategory = await findCategoryByName(name)
    if (existingCategory) {
      return res.json({ ...existingCategory, created: false, type_name: resolvedInput.typeName || null })
    }

    try {
      const [result] = await db.pool.query(
        'INSERT INTO categories (name, description) VALUES (?, ?)',
        [name, req.body?.description || null]
      )
      return res.status(201).json({
        id: result.insertId,
        name,
        description: req.body?.description || null,
        created: true,
        type_name: resolvedInput.typeName || null
      })
    } catch (insertErr) {
      if (insertErr.code !== 'ER_DUP_ENTRY') throw insertErr

      const category = await findCategoryByName(name)
      if (category) return res.json({ ...category, created: false, type_name: resolvedInput.typeName || null })
      throw insertErr
    }
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'failed to resolve category' })
  }
})

// List category-specific product types
router.get('/:id/types', verifyToken, authorize(['products.view', 'products.create', 'products.edit', 'inventory.view', 'inventory.adjust']), async (req, res) => {
  try {
    await ensureAutomatedReportsSchema()
    const categoryId = Number(req.params.id)
    if (!Number.isInteger(categoryId) || categoryId <= 0) {
      return res.status(400).json({ error: 'valid category id is required' })
    }

    const [[category]] = await db.pool.query(
      'SELECT id, name, description FROM categories WHERE id = ? LIMIT 1',
      [categoryId]
    )
    if (!category) return res.status(404).json({ error: 'category not found' })

    const [configuredTypeRows] = await db.pool.query(`
      SELECT id, category_id, name, description, 'category_types' AS source
      FROM category_types
      WHERE category_id = ?
        AND COALESCE(is_active, 1) = 1
    `, [categoryId])

    const [savedProductTypeRows] = await db.pool.query(`
      SELECT
        NULL AS id,
        category_id,
        TRIM(subcategory) AS name,
        NULL AS description,
        'products' AS source
      FROM products
      WHERE category_id = ?
        AND subcategory IS NOT NULL
        AND TRIM(subcategory) <> ''
    `, [categoryId])

    const [categoryRows] = await db.pool.query('SELECT id, name, description FROM categories ORDER BY name')
    const categoryTableTypeRows = categoryRows
      .filter((row) => isCategoryTableTypeForCategory(row.name, category.name))
      .map((row) => ({
        id: row.id,
        category_id: categoryId,
        name: row.name,
        description: row.description,
        source: 'categories'
      }))

    res.json(mergeCategoryTypeOptions(category, [
      ...configuredTypeRows,
      ...savedProductTypeRows,
      ...categoryTableTypeRows
    ]))
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'failed to fetch category types' })
  }
})

// Get single category
router.get('/:id', verifyToken, authorize(['products.view', 'products.create', 'products.edit', 'inventory.view', 'inventory.adjust']), async (req, res) => {
  try {
    await ensureAutomatedReportsSchema()
    const [rows] = await db.pool.query('SELECT id, name, description FROM categories WHERE id = ? LIMIT 1', [req.params.id])
    if (!rows.length) return res.status(404).json({ error: 'category not found' })
    res.json(rows[0])
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'failed to fetch category' })
  }
})

// Create category
router.post('/', express.json(), verifyToken, authorize('products.create'), async (req, res) => {
  try {
    await ensureAutomatedReportsSchema()
    const { name, description } = req.body
    const normalizedName = normalizeCategoryName(name)
    if (!normalizedName) return res.status(400).json({ error: 'name is required' })
    const [result] = await db.pool.query(
      'INSERT INTO categories (name, description) VALUES (?, ?)',
      [normalizedName, description || null]
    )
    res.json({ id: result.insertId })
  } catch (err) {
    console.error(err)
    if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ error: 'category name already exists' })
    res.status(500).json({ error: 'failed to create category' })
  }
})

// Update category
router.put('/:id', express.json(), verifyToken, authorize('products.update'), async (req, res) => {
  try {
    const { name, description } = req.body
    const updates = []
    const params = []
    if (name !== undefined) { updates.push('name = ?'); params.push(name) }
    if (description !== undefined) { updates.push('description = ?'); params.push(description) }
    if (!updates.length) return res.status(400).json({ error: 'nothing to update' })
    params.push(req.params.id)
    await db.pool.query(`UPDATE categories SET ${updates.join(', ')} WHERE id = ?`, params)
    res.json({ success: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'failed to update category' })
  }
})

// Delete category
router.delete('/:id', verifyToken, authorize('products.delete'), async (req, res) => {
  try {
    await db.pool.query('DELETE FROM categories WHERE id = ?', [req.params.id])
    res.json({ success: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'failed to delete category' })
  }
})

module.exports = router
