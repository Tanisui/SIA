const express = require('express')
const router = express.Router()
const db = require('../database')
const { verifyToken } = require('../middleware/authMiddleware')

// List files
router.get('/', verifyToken, async (req, res) => {
  try {
    const [rows] = await db.pool.query(
      `SELECT f.*, u.username AS uploader_name
       FROM files f
       LEFT JOIN users u ON u.id = f.uploaded_by
       ORDER BY f.uploaded_at DESC`
    )
    res.json(rows)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'failed to fetch files' })
  }
})

// Get single file record
router.get('/:id', verifyToken, async (req, res) => {
  try {
    const [rows] = await db.pool.query(
      `SELECT f.*, u.username AS uploader_name
       FROM files f
       LEFT JOIN users u ON u.id = f.uploaded_by
       WHERE f.id = ? LIMIT 1`, [req.params.id])
    if (!rows.length) return res.status(404).json({ error: 'file not found' })
    res.json(rows[0])
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'failed to fetch file' })
  }
})

// Create file record (metadata only — actual upload is handled separately or via multipart)
router.post('/', express.json(), verifyToken, async (req, res) => {
  try {
    const { path: filePath, original_name, type, size } = req.body
    if (!filePath) return res.status(400).json({ error: 'path is required' })
    const uploaded_by = req.auth.id
    const [result] = await db.pool.query(
      `INSERT INTO files (path, original_name, type, size, uploaded_by) VALUES (?, ?, ?, ?, ?)`,
      [filePath, original_name || null, type || null, size || null, uploaded_by]
    )
    res.json({ id: result.insertId })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'failed to create file record' })
  }
})

// Update file record
router.put('/:id', express.json(), verifyToken, async (req, res) => {
  try {
    const { path: filePath, original_name, type, size } = req.body
    const updates = []
    const params = []
    if (filePath !== undefined) { updates.push('path = ?'); params.push(filePath) }
    if (original_name !== undefined) { updates.push('original_name = ?'); params.push(original_name) }
    if (type !== undefined) { updates.push('type = ?'); params.push(type) }
    if (size !== undefined) { updates.push('size = ?'); params.push(size) }
    if (!updates.length) return res.status(400).json({ error: 'nothing to update' })
    params.push(req.params.id)
    await db.pool.query(`UPDATE files SET ${updates.join(', ')} WHERE id = ?`, params)
    res.json({ success: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'failed to update file record' })
  }
})

// Delete file record
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    await db.pool.query('DELETE FROM files WHERE id = ?', [req.params.id])
    res.json({ success: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'failed to delete file' })
  }
})

module.exports = router
