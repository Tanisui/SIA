import React from 'react'
import EntityPage from '../components/EntityPage.js'

const ACTION_LABELS = {
  INVENTORY_SHRINKAGE_OUT: 'Inventory Shrinkage Out',
  INVENTORY_DAMAGE_OUT: 'Inventory Damage Out',
  INVENTORY_RECORD_REVERSED: 'Inventory Record Reversed'
}

const MOVEMENT_TYPE_LABELS = {
  SHRINKAGE: 'Shrinkage',
  DAMAGE: 'Damage',
  RESTOCK: 'Restock'
}

function humanizeCode(value) {
  return String(value || '')
    .trim()
    .replace(/[_-]+/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (ch) => ch.toUpperCase())
}

function parseDetails(details) {
  if (details === null || details === undefined || details === '') return null
  if (typeof details === 'object' && !Array.isArray(details)) return details
  try {
    const parsed = JSON.parse(String(details))
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed
  } catch (e) {
    return null
  }
  return null
}

function summarizeDetailObject(obj) {
  const movementType = obj.movement_type ? (MOVEMENT_TYPE_LABELS[String(obj.movement_type).toUpperCase()] || humanizeCode(obj.movement_type)) : ''
  const reason = obj.reason ? String(obj.reason).trim() : ''

  const parts = []
  if (movementType) parts.push(`Type: ${movementType}`)
  if (obj.quantity_removed !== undefined && obj.quantity_removed !== null) parts.push(`Qty removed: ${obj.quantity_removed}`)
  if (obj.quantity_restored !== undefined && obj.quantity_restored !== null) parts.push(`Qty restored: ${obj.quantity_restored}`)
  if (obj.new_quantity !== undefined && obj.new_quantity !== null) parts.push(`New qty: ${obj.new_quantity}`)
  if (reason) parts.push(`Reason: ${reason}`)
  if (obj.record_type) parts.push(`Record: ${humanizeCode(obj.record_type)}`)
  if (obj.product_id !== undefined && obj.product_id !== null) parts.push(`Product ID: ${obj.product_id}`)
  if (obj.record_id !== undefined && obj.record_id !== null) parts.push(`Record ID: ${obj.record_id}`)

  if (parts.length > 0) return parts.join(' • ')

  return Object.entries(obj)
    .map(([key, val]) => `${humanizeCode(key)}: ${val === null || val === undefined ? '—' : String(val)}`)
    .join(' • ')
}

function formatAuditDetails(value) {
  const parsed = parseDetails(value)
  if (parsed) return summarizeDetailObject(parsed)
  const text = String(value || '').trim()
  return text || '—'
}

const schema = [
  { name: 'id', label: 'ID', hidden: true },
  { name: 'username', label: 'User', hideInForm: true },
  {
    name: 'action',
    label: 'Action',
    renderList: (value) => ACTION_LABELS[String(value || '').toUpperCase()] || humanizeCode(value) || '—'
  },
  {
    name: 'resource_type',
    label: 'Resource Type',
    renderList: (value) => humanizeCode(value) || '—'
  },
  { name: 'resource_id', label: 'Resource ID' },
  {
    name: 'details',
    label: 'Details',
    renderList: (value) => React.createElement('div', {
      style: {
        maxWidth: 640,
        whiteSpace: 'normal',
        wordBreak: 'break-word',
        lineHeight: 1.35
      }
    }, formatAuditDetails(value))
  },
  { name: 'created_at', label: 'Timestamp' }
]

export default function Audit(){
  return React.createElement(EntityPage, { title: 'Audit / Reports', apiPath: '/audit', schema })
}
