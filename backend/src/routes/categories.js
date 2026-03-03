const express = require('express')
const router = express.Router()
const db = require('../database')
const { verifyToken, authorize } = require('../middleware/authMiddleware')

// List all categories
router.get('/', verifyToken, authorize('products.view'), async (req, res) => {
  try {
    const [rows] = await db.pool.query('SELECT * FROM categories ORDER BY name')
    res.json(rows)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'failed to fetch categories' })
  }
})

// Get single category
router.get('/:id', verifyToken, authorize('products.view'), async (req, res) => {
  try {
    const [rows] = await db.pool.query('SELECT * FROM categories WHERE id = ? LIMIT 1', [req.params.id])
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
    const { name, description } = req.body
    if (!name) return res.status(400).json({ error: 'name is required' })
    const [result] = await db.pool.query(
      'INSERT INTO categories (name, description) VALUES (?, ?)',
      [name, description || null]
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
