import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import Pagination, { PaginationInfo } from '../components/Pagination.js'
import JsBarcode from 'jsbarcode'
import QRCode from 'qrcode'
import { jsPDF } from 'jspdf'
import { useLocation, useNavigate } from 'react-router-dom'
import { useSelector } from 'react-redux'
import api from '../api/api.js'
import { PRODUCT_SIZE_OPTIONS } from '../constants/productSizes.js'

// ─── Helpers ───
const fmt = (n) => Number(n || 0).toLocaleString('en-PH', { style: 'currency', currency: 'PHP' })
const normalizeScanCode = (v) => String(v || '').trim().toUpperCase()

function parseInventoryDateTime(value) {
  if (!value) return null
  if (value instanceof Date) return value

  const normalized = String(value || '').trim()
  const localDateTimeMatch = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/.exec(normalized)
  if (localDateTimeMatch && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(normalized)) {
    return new Date(
      Number(localDateTimeMatch[1]),
      Number(localDateTimeMatch[2]) - 1,
      Number(localDateTimeMatch[3]),
      Number(localDateTimeMatch[4]),
      Number(localDateTimeMatch[5]),
      Number(localDateTimeMatch[6] || 0)
    )
  }

  const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(normalized)
  if (dateOnlyMatch) {
    return new Date(
      Number(dateOnlyMatch[1]),
      Number(dateOnlyMatch[2]) - 1,
      Number(dateOnlyMatch[3])
    )
  }

  return new Date(normalized)
}

function hasExplicitTime(value) {
  if (value instanceof Date) return true
  return /\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}|T\d{2}:\d{2}/.test(String(value || '').trim())
}

const fmtDate = (d) => {
  const parsedDate = parseInventoryDateTime(d)
  if (!parsedDate || Number.isNaN(parsedDate.getTime())) return ''

  const options = { year: 'numeric', month: 'short', day: 'numeric' }
  if (hasExplicitTime(d)) {
    options.hour = '2-digit'
    options.minute = '2-digit'
  }

  return parsedDate.toLocaleDateString('en-PH', options)
}

function padDateTimePart(value) {
  return String(value).padStart(2, '0')
}

function buildStockInTimestamp(dateOnly) {
  const normalized = String(dateOnly || '').trim()
  if (!normalized) return undefined
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return normalized

  const now = new Date()
  return `${normalized} ${padDateTimePart(now.getHours())}:${padDateTimePart(now.getMinutes())}:${padDateTimePart(now.getSeconds())}`
}

function formatDateStackParts(value) {
  const parsedValue = parseInventoryDateTime(value)
  if (!parsedValue || Number.isNaN(parsedValue.getTime())) return { date: '—', time: '' }

  return {
    date: parsedValue.toLocaleDateString('en-PH', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    }),
    time: hasExplicitTime(value)
      ? parsedValue.toLocaleTimeString('en-PH', {
        hour: 'numeric',
        minute: '2-digit'
      })
      : ''
  }
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function createCode128SvgMarkup(value) {
  const normalizedValue = normalizeScanCode(value)
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  JsBarcode(svg, normalizedValue, {
    format: 'CODE128',
    displayValue: false,
    margin: 0,
    height: 36,
    width: 1.25
  })
  return svg.outerHTML
}

async function createQrDataUrl(value) {
  const normalizedValue = normalizeScanCode(value)
  return QRCode.toDataURL(normalizedValue, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 112
  })
}

function resolveQrImageSrc(pathValue) {
  const rawValue = String(pathValue || '').trim()
  if (!rawValue) return ''
  if (/^https?:\/\//i.test(rawValue) || rawValue.startsWith('data:')) return rawValue
  const baseUrl = String(api.defaults?.baseURL || '').replace(/\/+$/, '')
  const normalizedPath = rawValue.startsWith('/') ? rawValue : `/${rawValue}`
  return `${baseUrl}${normalizedPath}`
}

function sanitizePdfToken(value) {
  return normalizeScanCode(value)
    .replace(/[^A-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()
}

const INVENTORY_TAB_KEYS = new Set([
  'overview',
  'stock-in',
  'stock-out',
  'products',
  'barcode-labels',
  'transactions',
  'damaged',
  'low-stock',
  'shrinkage',
  'reports'
])
const DEFAULT_INVENTORY_TAB = 'overview'

function parseReferenceMeta(rawValue) {
  const value = String(rawValue || '').trim()
  if (!value) return null
  const normalized = value.replace(/^([A-Z_]+):/, '$1|')
  const parts = normalized.split('|').filter(Boolean)
  if (!parts.length) return null
  const tag = parts[0]
  const meta = {}
  for (const part of parts.slice(1)) {
    const idx = part.indexOf('=')
    if (idx <= 0) continue
    const key = part.slice(0, idx)
    const val = part.slice(idx + 1)
    if (key) meta[key] = val
  }
  return { tag, meta }
}

const STOCK_OUT_REASON_LABELS = {
  DAMAGE: 'Damaged',
  SHRINKAGE: 'Shrinkage'
}

function productSourceKey(product) {
  return String(product?.product_source || 'manual').trim().toLowerCase() || 'manual'
}

function isBaleGeneratedProduct(product) {
  return productSourceKey(product) === 'bale_breakdown'
}

function productSourceLabel(product) {
  const sourceKey = productSourceKey(product)
  if (sourceKey === 'bale_breakdown') return 'Bale Breakdown'
  if (sourceKey === 'repaired_damage') return 'Repaired Damage'
  return 'Manual'
}

function createEmptyProductForm(overrides = {}) {
  return {
    sku: '',
    name: '',
    brand: '',
    description: '',
    category_id: '',
    subcategory: '',
    price: '',
    stock_quantity: '1',
    low_stock_threshold: '10',
    size: '',
    barcode: '',
    product_source: 'manual',
    supplier_id: '',
    bale_purchase_id: '',
    condition_grade: 'premium',
    ...overrides
  }
}

function createEmptyRepairForm(overrides = {}) {
  return {
    damage_source_type: '',
    damage_source_id: '',
    source_label: '',
    source_name: '',
    original_quantity: 0,
    repaired_quantity: 0,
    remaining_quantity: 0,
    quantity: '1',
    suggested_name: '',
    sku: '',
    name: '',
    brand: '',
    description: '',
    category_id: '',
    price: '',
    low_stock_threshold: '0',
    size: '',
    barcode: '',
    reported_by_name: '',
    created_at: '',
    ...overrides
  }
}

function createRepairDraft(form, categorySearch = '') {
  return {
    quantity: String(form?.quantity || '1'),
    sku: String(form?.sku || ''),
    name: String(form?.name || ''),
    brand: String(form?.brand || ''),
    description: String(form?.description || ''),
    category_id: String(form?.category_id || ''),
    price: String(form?.price || ''),
    low_stock_threshold: String(form?.low_stock_threshold ?? '0'),
    size: String(form?.size || ''),
    barcode: String(form?.barcode || ''),
    category_search: String(categorySearch || '')
  }
}

const DAMAGE_SOURCE_LABELS = {
  bale_breakdown: 'Bale Breakdown',
  manual_damage: 'Manual Damage',
  sales_return: 'Sales Return'
}

function inferDamagedSourceType(record) {
  const explicitType = String(record?.damage_source_type || record?.source_type || '').trim().toLowerCase()
  if (explicitType) return explicitType

  const sourceLabel = String(record?.source_label || '').trim().toLowerCase()
  if (sourceLabel.includes('bale')) return 'bale_breakdown'
  if (sourceLabel.includes('sales return')) return 'sales_return'
  if (sourceLabel.includes('manual damage')) return 'manual_damage'

  const parsedReference = parseReferenceMeta(record?.reference)
  if (parsedReference?.tag === 'BALE_BREAKDOWN') return 'bale_breakdown'
  if (parsedReference?.tag === 'STOCK_OUT') {
    const disposition = String(parsedReference.meta?.disposition || '').trim().toUpperCase()
    if (disposition === 'DAMAGE') {
      return parsedReference.meta?.receipt ? 'sales_return' : 'manual_damage'
    }
  }

  const parsedReason = parseStockOutReason(record?.reason)
  if (parsedReason?.type === 'DAMAGE') return 'manual_damage'
  return ''
}

function inferDamagedSourceId(record, sourceType) {
  const candidates = sourceType === 'bale_breakdown'
    ? [record?.damage_source_id, record?.source_breakdown_id, record?.id]
    : [record?.damage_source_id, record?.id, record?.source_breakdown_id]

  for (const value of candidates) {
    const normalized = Number(value)
    if (Number.isInteger(normalized) && normalized > 0) return normalized
  }
  return 0
}

function normalizeDamagedRecord(record) {
  const sourceType = inferDamagedSourceType(record)
  const sourceId = inferDamagedSourceId(record, sourceType)
  const originalQuantity = Math.max(0, Number(record?.original_quantity ?? record?.quantity ?? 0) || 0)
  const repairedQuantity = Math.max(0, Number(record?.repaired_quantity ?? 0) || 0)
  const remainingBase = record?.remaining_quantity ?? Math.max(originalQuantity - repairedQuantity, 0)
  const remainingQuantity = Math.max(0, Number(remainingBase) || 0)
  const sourceLabel = String(record?.source_label || DAMAGE_SOURCE_LABELS[sourceType] || 'Damage Record').trim()

  return {
    ...record,
    source_label: sourceLabel,
    source_name: String(record?.source_name || record?.product_name || '').trim(),
    damage_source_type: sourceType,
    damage_source_id: sourceId,
    original_quantity: originalQuantity,
    repaired_quantity: repairedQuantity,
    remaining_quantity: remainingQuantity,
    repair_allowed: remainingQuantity > 0 && Boolean(sourceType && sourceId > 0),
    record_key: String(record?.record_key || `${sourceType || 'damage'}-${sourceId || record?.id || 'row'}`)
  }
}

function toTitleCaseWords(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function getStockOutTypeLabel(value) {
  const normalized = String(value || '').trim().toUpperCase()
  if (!normalized) return ''
  return STOCK_OUT_REASON_LABELS[normalized] || toTitleCaseWords(normalized)
}

function normalizeProductSearchValue(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function compactProductSearchValue(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '')
}

function buildProductNameFromClassification(form, categories, categorySearch = '') {
  const typeName = String(form?.subcategory || '').trim()
  if (typeName) return typeName

  const categoryId = String(form?.category_id || '').trim()
  const matchedCategory = categories.find((category) => String(category?.id) === categoryId)
  const categoryName = String(matchedCategory?.name || (categoryId ? categorySearch : '') || '').trim()
  if (categoryName) return categoryName

  return String(form?.name || '').trim()
}

function productSearchMatches(product, linkedBaleOption, rawQuery) {
  const query = normalizeProductSearchValue(rawQuery)
  if (!query) return true

  const referenceParts = [
    product?.reference,
    product?.item_code,
    product?.sku,
    product?.barcode,
    product?.bale_purchase_id ? `bale ${product.bale_purchase_id}` : '',
    product?.source_breakdown_id ? `breakdown ${product.source_breakdown_id}` : '',
    product?.bale_batch_no,
    linkedBaleOption?.bale_batch_no,
    linkedBaleOption?.breakdown_id ? `breakdown ${linkedBaleOption.breakdown_id}` : ''
  ]

  const searchableText = [
    product?.name,
    product?.barcode,
    normalizeScanCode(product?.barcode),
    product?.category,
    product?.subcategory,
    product?.brand,
    productSourceLabel(product),
    product?.product_source,
    product?.condition_grade ? toTitleCaseWords(product.condition_grade) : '',
    product?.supplier_name,
    product?.bale_supplier_name,
    linkedBaleOption?.supplier_name,
    ...referenceParts
  ].filter(Boolean).join(' ')

  const normalizedText = normalizeProductSearchValue(searchableText)
  const compactText = compactProductSearchValue(searchableText)
  const compactQuery = compactProductSearchValue(rawQuery)
  const queryTokens = query.split(/\s+/).filter(Boolean)

  if (normalizedText.includes(query)) return true
  if (compactQuery && compactText.includes(compactQuery)) return true
  return queryTokens.every((token) => normalizedText.includes(token) || compactText.includes(compactProductSearchValue(token)))
}

function transactionSearchMatches(transaction, rawQuery) {
  const query = normalizeProductSearchValue(rawQuery)
  if (!query) return true

  const legacySaleLinkInReason = !String(transaction?.reference || '').trim() && /^SALE_LINK[:|]/.test(String(transaction?.reason || '').trim())
  const resolvedReference = legacySaleLinkInReason ? transaction.reason : transaction?.reference
  const resolvedReason = formatTransactionReason(transaction?.reason, resolvedReference)
  const displayReference = formatTransactionReference(resolvedReference)
  const compactReference = formatPosReference(resolvedReference)
  const transactionDisplay = getPosTransactionDisplay(transaction, resolvedReference)
  const dateParts = formatDateStackParts(transaction?.created_at)

  const searchableText = [
    transaction?.product_name,
    transaction?.sku,
    transaction?.barcode,
    normalizeScanCode(transaction?.barcode),
    transaction?.reference,
    resolvedReference,
    displayReference,
    compactReference,
    transaction?.reason,
    resolvedReason,
    transactionDisplay.label,
    transaction?.transaction_type,
    transaction?.supplier_name,
    transaction?.user_name,
    dateParts.date,
    dateParts.time
  ].filter(Boolean).join(' ')

  const normalizedText = normalizeProductSearchValue(searchableText)
  const compactText = compactProductSearchValue(searchableText)
  const compactQuery = compactProductSearchValue(rawQuery)
  const queryTokens = query.split(/\s+/).filter(Boolean)

  if (normalizedText.includes(query)) return true
  if (compactQuery && compactText.includes(compactQuery)) return true
  return queryTokens.every((token) => normalizedText.includes(token) || compactText.includes(compactProductSearchValue(token)))
}

function inventoryReportSearchMatches(product, rawQuery) {
  const query = normalizeProductSearchValue(rawQuery)
  if (!query) return true

  const stockQuantity = Number(product?.stock_quantity || 0)
  const lowStockThreshold = Number(product?.low_stock_threshold || 0)
  const stockStatus = stockQuantity <= lowStockThreshold ? 'low stock' : 'healthy stock'
  const sourceLabel = productSourceLabel(product)
  const gradeLabel = product?.condition_grade ? toTitleCaseWords(product.condition_grade) : ''
  const statusLabel = product?.status ? toTitleCaseWords(product.status) : (Number(product?.is_active ?? 1) === 1 ? 'Active' : 'Inactive')
  const dateValues = [
    product?.date_encoded,
    product?.bale_purchase_date,
    product?.breakdown_date,
    product?.last_transaction_at,
    product?.created_at,
    product?.updated_at
  ]

  const searchableText = [
    product?.sku,
    product?.item_code,
    product?.barcode,
    normalizeScanCode(product?.barcode),
    product?.name,
    product?.brand,
    product?.description,
    product?.category,
    product?.subcategory,
    product?.bale_category,
    sourceLabel,
    product?.product_source,
    gradeLabel,
    statusLabel,
    product?.bale_batch_no,
    product?.supplier_name,
    product?.source_breakdown_id ? `breakdown ${product.source_breakdown_id}` : '',
    stockStatus,
    `stock ${stockQuantity}`,
    `low threshold ${lowStockThreshold}`,
    `cost ${fmt(product?.cost)}`,
    `allocated ${fmt(product?.allocated_cost)}`,
    `price ${fmt(product?.price)}`,
    `cost value ${fmt(product?.stock_value)}`,
    `retail value ${fmt(product?.retail_value)}`,
    `in ${Number(product?.total_in_units || 0)}`,
    `out ${Number(product?.total_out_units || 0)}`,
    `adjust ${Number(product?.total_adjustment_units || 0)}`,
    `return ${Number(product?.total_return_units || 0)}`,
    ...dateValues.flatMap((value) => value ? [value, fmtDate(value)] : [])
  ].filter(Boolean).join(' ')

  const normalizedText = normalizeProductSearchValue(searchableText)
  const compactText = compactProductSearchValue(searchableText)
  const compactQuery = compactProductSearchValue(rawQuery)
  const queryTokens = query.split(/\s+/).filter(Boolean)

  if (normalizedText.includes(query)) return true
  if (compactQuery && compactText.includes(compactQuery)) return true
  return queryTokens.every((token) => normalizedText.includes(token) || compactText.includes(compactProductSearchValue(token)))
}

function parseStockOutReason(value) {
  const match = String(value || '').trim().match(/^STOCK_OUT:([A-Z_]+)(?:\s*\|\s*(.*))?$/i)
  if (!match) return null
  return { type: String(match[1] || '').toUpperCase(), detail: String(match[2] || '').trim() }
}

function humanizeReasonText(value) {
  const normalized = String(value || '').trim()
  if (!normalized) return ''
  if (/^pos sale deduction$/i.test(normalized)) return 'Sold at checkout'
  if (/^missing after audit$/i.test(normalized)) return 'Missing after audit'
  if (/^missing after stock check$/i.test(normalized)) return 'Missing after audit'
  const lostByMatch = normalized.match(/^lost\s*\((.+)\)$/i)
  if (lostByMatch) return `Lost (${lostByMatch[1]})`
  if (/^lost$/i.test(normalized)) return 'Lost'
  if (/^manual correction$/i.test(normalized)) return 'Manual correction'
  return normalized
}

function formatStockOutReason(type, detail) {
  const label = getStockOutTypeLabel(type)
  if (!label) return String(detail || '').trim()

  const normalizedDetail = humanizeReasonText(detail)
  if (!normalizedDetail) return label
  if (normalizedDetail.toLowerCase() === label.toLowerCase()) return label
  return `${label} - ${normalizedDetail}`
}

function formatTransactionReference(value) {
  const parsed = parseReferenceMeta(value)
  if (!parsed) return value || '—'
  const { tag, meta } = parsed
  if (tag === 'SALE_LINK') {
    const sale = meta.sale_no || meta.sale_id || 'sale'
    return `Sale ${sale}${meta.receipt ? ` • Receipt ${meta.receipt}` : ''}`
  }
  if (tag === 'SALE_RETURN') {
    return `Return${meta.receipt ? ` • Receipt ${meta.receipt}` : ''}${meta.disposition ? ` • ${getStockOutTypeLabel(meta.disposition)}` : ''}${meta.acct_ref ? ` • Ref ${meta.acct_ref}` : ''}`
  }
  if (tag === 'STOCK_OUT') {
    return `Manual change${meta.disposition ? ` • ${getStockOutTypeLabel(meta.disposition)}` : ''}${meta.receipt ? ` • Receipt ${meta.receipt}` : ''}${meta.acct_ref ? ` • Ref ${meta.acct_ref}` : ''}`
  }
  if (tag === 'BALE_BREAKDOWN') {
    return `Bale breakdown${meta.grade ? ` • ${toTitleCaseWords(meta.grade)}` : ''}${meta.breakdown_id ? ` • Breakdown #${meta.breakdown_id}` : ''}${meta.bale_purchase_id ? ` • Bale #${meta.bale_purchase_id}` : ''}${meta.disposition ? ` • ${toTitleCaseWords(meta.disposition)}` : ''}`
  }
  return value
}

function formatPosReference(value) {
  const label = String(formatTransactionReference(value) || '').trim()
  if (!label || label === '—') return ''

  return label
    .replace(/Sale\s+SAL-\d+-([A-Za-z0-9]+)/gi, 'Sale #$1')
    .replace(/Receipt\s+RCT-\d+-([A-Za-z0-9]+)/gi, 'Receipt #$1')
    .replace(/Acct Ref\s+([A-Za-z0-9-]+)/gi, 'Ref #$1')
}

function formatTransactionReason(reason, reference = '') {
  const rawReason = String(reason || '').trim()
  if (!rawReason) return '—'
  if (/^SALE_LINK[:|]/.test(rawReason)) return 'Sold at checkout'

  const parsedRef = parseReferenceMeta(reference)
  if (parsedRef?.tag === 'SALE_LINK' && rawReason === 'POS sale deduction') return 'Sold at checkout'

  const parsedReason = parseStockOutReason(rawReason)
  if (parsedReason) return formatStockOutReason(parsedReason.type, parsedReason.detail)

  if (parsedRef?.tag === 'STOCK_OUT' && parsedRef.meta?.disposition) {
    if (/^stock\s*out\b/i.test(rawReason)) return rawReason
    return formatStockOutReason(parsedRef.meta.disposition, rawReason)
  }

  return humanizeReasonText(rawReason)
}

function formatGroupedTransactionReasons(value) {
  const rawValue = String(value || '').trim()
  if (!rawValue) return '—'

  const grouped = rawValue
    .split(/\s+\|\s+(?=(?:STOCK_OUT:[A-Z_]+|SALE_LINK[:|]))/g)
    .map((part) => part.trim())
    .filter(Boolean)

  if (grouped.length <= 1) return formatTransactionReason(rawValue)
  return grouped.map((part) => formatTransactionReason(part)).join(' | ')
}

function formatGroupedTransactionReasonList(value) {
  const formatted = formatGroupedTransactionReasons(value)
  if (formatted === '—') return []

  return formatted
    .split(/\s+\|\s+/)
    .map((part) => part.trim())
    .filter(Boolean)
}

function getPosTransactionDisplay(transaction, reference = '') {
  const parsedRef = parseReferenceMeta(reference)
  const parsedReason = parseStockOutReason(transaction?.reason)
  const disposition = String(parsedRef?.meta?.disposition || parsedReason?.type || '').trim().toUpperCase()

  if (parsedRef?.tag === 'SALE_LINK' || /^SALE_LINK[:|]/.test(String(transaction?.reason || '').trim())) {
    return { label: 'Sale', badgeClass: 'badge-danger' }
  }
  if (parsedRef?.tag === 'SALE_RETURN' || String(transaction?.transaction_type || '').trim().toUpperCase() === 'RETURN') {
    return { label: 'Return', badgeClass: 'badge-warning' }
  }
  if (disposition === 'SHRINKAGE') {
    return { label: 'Shrinkage', badgeClass: 'badge-danger' }
  }
  if (disposition === 'DAMAGE') {
    return { label: 'Damage', badgeClass: 'badge-warning' }
  }
  if (String(transaction?.transaction_type || '').trim().toUpperCase() === 'IN') {
    return { label: 'Stock In', badgeClass: 'badge-success' }
  }
  if (String(transaction?.transaction_type || '').trim().toUpperCase() === 'ADJUST') {
    return { label: 'Adjustment', badgeClass: 'badge-info' }
  }
  if (String(transaction?.transaction_type || '').trim().toUpperCase() === 'OUT') {
    return { label: 'Stock Out', badgeClass: 'badge-danger' }
  }
  return { label: 'Transaction', badgeClass: 'badge-neutral' }
}

const infoTip = (text) => React.createElement('span', {
  title: text,
  style: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 16,
    height: 16,
    marginLeft: 6,
    borderRadius: 999,
    border: '1px solid #cbd5e1',
    background: '#f8fafc',
    color: '#334155',
    fontSize: 10,
    fontWeight: 700,
    lineHeight: 1,
    cursor: 'help',
    userSelect: 'none'
  }
}, 'i')

function qrActionIcon() {
  return React.createElement('svg', {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': 'true'
  },
  React.createElement('rect', { x: 3, y: 3, width: 7, height: 7, rx: 1 }),
  React.createElement('rect', { x: 14, y: 3, width: 7, height: 7, rx: 1 }),
  React.createElement('rect', { x: 3, y: 14, width: 7, height: 7, rx: 1 }),
  React.createElement('path', { d: 'M15 14h2v2h-2zM19 14h2v2h-2zM15 18h2v2h-2zM17 16h2v2h-2zM19 18h2v2h-2z' })
  )
}

function editActionIcon() {
  return React.createElement('svg', {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': 'true'
  },
  React.createElement('path', { d: 'M12 20h9' }),
  React.createElement('path', { d: 'M16.5 3.5a2.12 2.12 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z' })
  )
}

function deleteActionIcon() {
  return React.createElement('svg', {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': 'true'
  },
  React.createElement('path', { d: 'M3 6h18' }),
  React.createElement('path', { d: 'M8 6V4h8v2' }),
  React.createElement('path', { d: 'M19 6l-1 14H6L5 6' }),
  React.createElement('path', { d: 'M10 11v6M14 11v6' })
  )
}

export default function Inventory() {
  const currentUser = useSelector((s) => s.auth?.user) || null
  const currentUserDisplayName = String(
    currentUser?.full_name || currentUser?.username || ''
  ).trim() || 'Current User'
  // ── state ──
  const [products, setProducts] = useState([])
  const [employees, setEmployees] = useState([])
  const [categories, setCategories] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [transactions, setTransactions] = useState([])
  const [stockInRecords, setStockInRecords] = useState([])
  const [damaged, setDamaged] = useState([])
  const [lowStock, setLowStock] = useState([])
  const [shrinkage, setShrinkage] = useState([])
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)
  const location = useLocation()
  const navigate = useNavigate()

  // forms
  const [stockInForm, setStockInForm] = useState({ product_id: '', supplier_id: '', quantity: '', reference: '', date: '' })
  const [stockInMode, setStockInMode] = useState('bale')
  const [baleStockOptions, setBaleStockOptions] = useState([])
  const [baleStockLoading, setBaleStockLoading] = useState(false)
  const [selectedBaleStockOptionId, setSelectedBaleStockOptionId] = useState('')
  const [adjustForm, setAdjustForm] = useState({ product_id: '', quantity: '', reason: '', employee_id: '' })
  const [damageForm, setDamageForm] = useState({ product_id: '', quantity: '', reason: '', employee_id: '' })
  const [adjustBarcode, setAdjustBarcode] = useState('')
  const [damageBarcode, setDamageBarcode] = useState('')
  const [productForm, setProductForm] = useState(createEmptyProductForm())
  const [editingProduct, setEditingProduct] = useState(null)
  const [showProductModal, setShowProductModal] = useState(false)
  const [showRepairModal, setShowRepairModal] = useState(false)
  const [qrPreviewProduct, setQrPreviewProduct] = useState(null)
  const [qrPreviewSrc, setQrPreviewSrc] = useState('')
  const [qrPreviewLoading, setQrPreviewLoading] = useState(false)
  const [qrPreviewScanValue, setQrPreviewScanValue] = useState('')
  const [stockInSourceFilter, setStockInSourceFilter] = useState('')
  const [stockInFrom, setStockInFrom] = useState('')
  const [stockInTo, setStockInTo] = useState('')
  const [filterType, setFilterType] = useState('')
  const [transactionSearchQuery, setTransactionSearchQuery] = useState('')
  const [transactionsPage, setTransactionsPage] = useState(1)
  const [shrinkageSearchQuery, setShrinkageSearchQuery] = useState('')
  const [shrinkagePage, setShrinkagePage] = useState(1)
  const [inventoryReportSearchQuery, setInventoryReportSearchQuery] = useState('')
  const [inventoryReportActiveFilter, setInventoryReportActiveFilter] = useState('all')
  const [inventoryReportVisibleCols, setInventoryReportVisibleCols] = useState(() => {
    try {
      const saved = localStorage.getItem('inventoryReportVisibleCols')
      if (saved) return JSON.parse(saved)
    } catch {}
    return { codes: true, details: true, category: true, source: true, stock: true, pricing: true, movement: false, dates: false }
  })
  const [inventoryReportShowColMenu, setInventoryReportShowColMenu] = useState(false)
  const [inventoryReportExpandedRows, setInventoryReportExpandedRows] = useState(new Set())
  const [damagedSourceFilter, setDamagedSourceFilter] = useState('')
  const [damagedFrom, setDamagedFrom] = useState('')
  const [damagedTo, setDamagedTo] = useState('')
  const transactionSearchText = String(transactionSearchQuery || '').trim()
  const [repairForm, setRepairForm] = useState(createEmptyRepairForm())
  const [repairDrafts, setRepairDrafts] = useState({})
  const [selectedDamagedRecordKey, setSelectedDamagedRecordKey] = useState('')
  const [categorySearch, setCategorySearch] = useState('')
  const [categoryDropdownOpen, setCategoryDropdownOpen] = useState(false)
  const [categoryTypeOptions, setCategoryTypeOptions] = useState([])
  const [categoryTypeLoading, setCategoryTypeLoading] = useState(false)
  const [categoryTypeCategoryId, setCategoryTypeCategoryId] = useState('')
  const [productSearchQuery, setProductSearchQuery] = useState('')
  const [repairCategorySearch, setRepairCategorySearch] = useState('')
  const [repairCategoryDropdownOpen, setRepairCategoryDropdownOpen] = useState(false)
  const [labelProductId, setLabelProductId] = useState('')
  const [labelScanValue, setLabelScanValue] = useState('')
  const [labelCopies, setLabelCopies] = useState('1')
  const [labelQueue, setLabelQueue] = useState([])
  const labelScanInputRef = useRef(null)
  const qrPreviewScanInputRef = useRef(null)
  const qrPreviewScanTimerRef = useRef(null)
  const tab = useMemo(() => {
    const params = new URLSearchParams(location.search)
    const searchTab = String(params.get('tab') || '').trim()
    const hashTab = String(location.hash || '').replace(/^#/, '')
    if (INVENTORY_TAB_KEYS.has(searchTab)) return searchTab
    if (INVENTORY_TAB_KEYS.has(hashTab)) return hashTab
    return DEFAULT_INVENTORY_TAB
  }, [location.hash, location.search])

  // ── data fetchers ──
  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const [prodRes, catRes, empRes, supplierRes] = await Promise.allSettled([
        api.get('/products'),
        api.get('/categories'),
        api.get('/employees'),
        api.get('/suppliers')
      ])

      if (prodRes.status === 'fulfilled') {
        setProducts(Array.isArray(prodRes.value?.data) ? prodRes.value.data : [])
      }
      if (catRes.status === 'fulfilled') {
        setCategories(Array.isArray(catRes.value?.data) ? catRes.value.data : [])
      }
      if (empRes.status === 'fulfilled') {
        setEmployees(Array.isArray(empRes.value?.data) ? empRes.value.data : [])
      }
      if (supplierRes.status === 'fulfilled') {
        setSuppliers(Array.isArray(supplierRes.value?.data) ? supplierRes.value.data : [])
      } else {
        setSuppliers([])
      }
    } catch (e) { /* ignore */ }
    setLoading(false)
  }, [])

  const fetchTransactions = useCallback(async () => {
    try {
      let url = '/inventory/transactions'
      if (filterType) url += `?type=${filterType}`
      const res = await api.get(url)
      setTransactions(res.data || [])
    } catch (e) { /* ignore */ }
  }, [filterType])

  const fetchOverviewTransactions = useCallback(async () => {
    try {
      const res = await api.get('/inventory/transactions')
      setTransactions(Array.isArray(res.data) ? res.data : [])
    } catch (e) { /* ignore */ }
  }, [])

  const fetchStockInRecords = useCallback(async () => {
    try {
      const query = ['type=IN']
      if (stockInSourceFilter) query.push(`source=${encodeURIComponent(stockInSourceFilter)}`)
      if (stockInFrom) query.push(`from=${encodeURIComponent(stockInFrom)}`)
      if (stockInTo) query.push(`to=${encodeURIComponent(stockInTo)}`)
      const res = await api.get(`/inventory/transactions?${query.join('&')}`)
      setStockInRecords((res.data || []).filter((row) => Number(row.quantity) > 0))
    } catch (e) { /* ignore */ }
  }, [stockInFrom, stockInSourceFilter, stockInTo])

  const fetchBaleStockOptions = useCallback(async () => {
    try {
      setBaleStockLoading(true)
      const res = await api.get('/inventory/stock-in/bale-options?include_all=1')
      setBaleStockOptions(Array.isArray(res.data) ? res.data : [])
    } catch (e) {
      setBaleStockOptions([])
      const status = Number(e?.response?.status) || 0
      const serverMessage = e?.response?.data?.error || e?.response?.data?.message || ''

  /* const renderRepairModal = () => (
    showRepairModal && React.createElement('div', {
      className: 'modal-backdrop',
      onClick: closeRepairModal
    },
    React.createElement('div', {
      className: 'modal',
      style: { maxWidth: 860, width: '94%' },
      onClick: (e) => e.stopPropagation()
    },
    React.createElement('div', { className: 'modal-header' },
      React.createElement('h2', null, 'Receive Repaired Product'),
      React.createElement('button', {
        type: 'button',
        className: 'modal-close',
        onClick: closeRepairModal
      }, '×')
    ),
    React.createElement('form', { onSubmit: handleRepairDamagedItem },
      React.createElement('div', { className: 'modal-body inventory-damaged-modal-body' },
        React.createElement('div', {
          className: 'inventory-damaged-modal-grid',
          style: { marginBottom: 14 }
        },
          React.createElement('div', { className: 'form-group', style: { marginBottom: 0 } },
            React.createElement('label', { className: 'form-label' }, 'Damage Source'),
            React.createElement('input', {
              className: 'form-input',
              value: repairForm.source_label
                ? `${repairForm.source_label}${repairForm.damage_source_id ? ` #${repairForm.damage_source_id}` : ''}`
                : 'Select a damage record',
              readOnly: true,
              disabled: true
            })
          ),
          React.createElement('div', { className: 'form-group', style: { marginBottom: 0 } },
            React.createElement('label', { className: 'form-label' }, 'Original Qty'),
            React.createElement('input', {
              className: 'form-input',
              value: Number(repairForm.original_quantity || 0),
              readOnly: true,
              disabled: true
            })
          ),
          React.createElement('div', { className: 'form-group', style: { marginBottom: 0 } },
            React.createElement('label', { className: 'form-label' }, 'Already Received'),
            React.createElement('input', {
              className: 'form-input',
              value: Number(repairForm.repaired_quantity || 0),
              readOnly: true,
              disabled: true
            })
          ),
          React.createElement('div', { className: 'form-group', style: { marginBottom: 0 } },
            React.createElement('label', { className: 'form-label' }, 'Remaining Qty'),
            React.createElement('input', {
              className: 'form-input',
              value: repairFormRemainingQuantity,
              readOnly: true,
              disabled: true
            })
          )
        ),
        React.createElement('div', {
          className: 'inventory-damaged-modal-grid'
        },
          React.createElement('div', { className: 'form-group', style: { marginBottom: 0 } },
            React.createElement('label', { className: 'form-label' }, 'SKU'),
            React.createElement('input', {
              className: 'form-input',
              value: repairForm.sku,
              onChange: (e) => setRepairForm((form) => ({ ...form, sku: e.target.value })),
              placeholder: 'Auto-generated if blank'
            })
          ),
          React.createElement('div', { className: 'form-group', style: { marginBottom: 0 } },
            React.createElement('label', { className: 'form-label' }, 'Name *'),
            React.createElement('input', {
              className: 'form-input',
              value: repairForm.name,
              onChange: (e) => setRepairForm((form) => ({ ...form, name: e.target.value })),
              placeholder: 'Product name',
              required: true
            })
          ),
          React.createElement('div', { className: 'form-group', style: { marginBottom: 0 } },
            React.createElement('label', { className: 'form-label' }, 'Barcode'),
            React.createElement('input', {
              className: 'form-input',
              value: repairForm.barcode,
              onChange: (e) => setRepairForm((form) => ({ ...form, barcode: e.target.value })),
              placeholder: 'Auto-generated if blank'
            })
          ),
          React.createElement('div', { className: 'form-group', style: { marginBottom: 0, position: 'relative' } },
            React.createElement('label', { className: 'form-label' }, 'Category *'),
            React.createElement('input', {
              className: 'form-input',
              value: repairCategorySearch,
              onChange: (e) => {
                const nextValue = e.target.value
                const matchedCategory = categories.find((category) => String(category?.name || '').toLowerCase() === nextValue.trim().toLowerCase())
                setRepairCategorySearch(nextValue)
                setRepairCategoryDropdownOpen(true)
                setRepairForm((form) => ({ ...form, category_id: matchedCategory ? String(matchedCategory.id) : '' }))
              },
              onFocus: () => setRepairCategoryDropdownOpen(true),
              placeholder: '- Search or select category -',
              autoComplete: 'off',
              required: true
            }),
            repairCategoryDropdownOpen && React.createElement('div', {
              style: {
                position: 'absolute',
                top: '100%',
                left: 0,
                right: 0,
                zIndex: 50,
                background: 'var(--card-bg, #fff)',
                border: '1px solid var(--border, #ddd)',
                borderRadius: 6,
                maxHeight: 220,
                overflowY: 'auto',
                boxShadow: '0 4px 12px rgba(0,0,0,0.12)'
              }
            },
              filteredRepairCategories.length === 0
                ? React.createElement('div', {
                  style: { padding: '10px 14px', color: 'var(--text-light, #999)', fontSize: 13 }
                }, 'No categories found')
                : filteredRepairCategories.map((category) => React.createElement('div', {
                  key: `repair-category-${category.id}`,
                  style: {
                    padding: '8px 14px',
                    cursor: 'pointer',
                    fontSize: 13,
                    background: String(repairForm.category_id) === String(category.id) ? 'var(--gold-light, #fef3c7)' : 'transparent',
                    borderBottom: '1px solid var(--border-light, #f0f0f0)'
                  },
                  onMouseDown: (e) => {
                    e.preventDefault()
                    setRepairForm((form) => ({ ...form, category_id: String(category.id) }))
                    setRepairCategorySearch(category.name)
                    setRepairCategoryDropdownOpen(false)
                  },
                  onMouseEnter: (e) => { e.currentTarget.style.background = 'var(--gold-light, #fef3c7)' },
                  onMouseLeave: (e) => { e.currentTarget.style.background = String(repairForm.category_id) === String(category.id) ? 'var(--gold-light, #fef3c7)' : 'transparent' }
                }, category.name))
            ),
            repairCategoryDropdownOpen && React.createElement('div', {
              style: { position: 'fixed', inset: 0, zIndex: 49 },
              onClick: () => setRepairCategoryDropdownOpen(false)
            })
          ),
          React.createElement('div', { className: 'form-group', style: { marginBottom: 0 } },
            React.createElement('label', { className: 'form-label' }, 'Brand'),
            React.createElement('input', {
              className: 'form-input',
              value: repairForm.brand,
              onChange: (e) => setRepairForm((form) => ({ ...form, brand: e.target.value })),
              placeholder: 'Brand name'
            })
          ),
          React.createElement('div', { className: 'form-group', style: { marginBottom: 0 } },
            React.createElement('label', { className: 'form-label' }, 'Selling Price *'),
            React.createElement('input', {
              className: 'form-input',
              type: 'number',
              min: '0.01',
              step: '0.01',
              value: repairForm.price,
              onChange: (e) => setRepairForm((form) => ({ ...form, price: e.target.value })),
              required: true
            })
          ),
          React.createElement('div', { className: 'form-group', style: { marginBottom: 0 } },
            React.createElement('label', { className: 'form-label' }, 'Low Stock Threshold'),
            React.createElement('input', {
              className: 'form-input',
              type: 'number',
              min: 0,
              step: 1,
              value: repairForm.low_stock_threshold,
              onChange: (e) => setRepairForm((form) => ({ ...form, low_stock_threshold: e.target.value }))
            })
          ),
          React.createElement('div', { className: 'form-group', style: { marginBottom: 0 } },
            React.createElement('label', { className: 'form-label' }, 'Size'),
            React.createElement('select', {
              className: 'form-input',
              value: repairForm.size,
              onChange: (e) => setRepairForm((form) => ({ ...form, size: e.target.value }))
            },
              React.createElement('option', { value: '' }, '- Select size -'),
              ...PRODUCT_SIZE_OPTIONS.map((option) => React.createElement('option', {
                key: `repair-size-${option.value}`,
                value: option.value
              }, option.label))
            )
          )
        ),
        React.createElement('div', { className: 'form-group', style: { marginTop: 12, marginBottom: 0 } },
          React.createElement('label', { className: 'form-label' }, 'Description'),
          React.createElement('textarea', {
            className: 'form-input',
            rows: 2,
            value: repairForm.description,
            onChange: (e) => setRepairForm((form) => ({ ...form, description: e.target.value })),
            placeholder: 'Optional details about this received repaired product'
          })
        ),
        React.createElement('div', { className: 'inventory-damaged-modal-note' },
          repairFormRecordSelected
            ? `Selected: ${repairForm.source_name || 'Damaged item'}. Remaining units to repair: ${repairFormRemainingQuantity}. Saving this will create 1 sellable product entry in Product Management.`
            : 'Select a damaged record from the table first.'
        )
      ),
      React.createElement('div', { className: 'modal-footer' },
        React.createElement('button', {
          type: 'submit',
          className: 'btn btn-primary',
          disabled: !repairFormRecordSelected || repairFormRemainingQuantity <= 0
        }, repairFormRemainingQuantity <= 0 ? 'No Remaining Qty' : 'Encode Repaired Product'),
        React.createElement('button', { type: 'button', className: 'btn btn-secondary', onClick: clearRepairForm }, 'Clear'),
        React.createElement('button', { type: 'button', className: 'btn btn-secondary', onClick: closeRepairModal }, 'Cancel')
      )
    )))
  )
  */
      if (serverMessage) {
        setError(serverMessage)
      } else if (status > 0) {
        setError(`Could not load bale records for Stock In (server reply ${status}).`)
      } else {
        setError('Could not load bale records for Stock In. Check if the backend is running and reachable.')
      }
    } finally {
      setBaleStockLoading(false)
    }
  }, [])

  const fetchLowStock = useCallback(async () => {
    try { const res = await api.get('/inventory/alerts/low-stock'); setLowStock(res.data || []) } catch (e) { /* ignore */ }
  }, [])

  const fetchDamaged = useCallback(async () => {
    try {
      const query = []
      if (damagedSourceFilter) query.push(`source=${encodeURIComponent(damagedSourceFilter)}`)
      if (damagedFrom) query.push(`from=${encodeURIComponent(damagedFrom)}`)
      if (damagedTo) query.push(`to=${encodeURIComponent(damagedTo)}`)
      const url = query.length ? `/inventory/damaged?${query.join('&')}` : '/inventory/damaged'
      const res = await api.get(url)
      setDamaged((Array.isArray(res.data) ? res.data : []).map(normalizeDamagedRecord))
    } catch (e) { /* ignore */ }
  }, [damagedFrom, damagedSourceFilter, damagedTo])

  const handleClearDamagedFilters = useCallback(async () => {
    setDamagedSourceFilter('')
    setDamagedFrom('')
    setDamagedTo('')
    try {
      const res = await api.get('/inventory/damaged')
      setDamaged((Array.isArray(res.data) ? res.data : []).map(normalizeDamagedRecord))
    } catch (e) { /* ignore */ }
  }, [])

  const ensureRepairCategories = useCallback(async () => {
    if (Array.isArray(categories) && categories.length > 0) return categories
    try {
      const res = await api.get('/categories')
      const rows = Array.isArray(res.data) ? res.data : []
      setCategories(rows)
      return rows
    } catch (err) {
      return []
    }
  }, [categories])

  const findCategoryByName = useCallback((name) => {
    const normalizedName = String(name || '').trim().toLowerCase()
    if (!normalizedName) return null
    return categories.find((category) => String(category?.name || '').trim().toLowerCase() === normalizedName) || null
  }, [categories])

  const fetchCategoryTypes = useCallback(async (categoryId) => {
    const normalizedCategoryId = Number(categoryId)
    if (!Number.isInteger(normalizedCategoryId) || normalizedCategoryId <= 0) {
      setCategoryTypeOptions([])
      setCategoryTypeCategoryId('')
      return
    }

    try {
      setCategoryTypeLoading(true)
      setCategoryTypeCategoryId('')
      const res = await api.get(`/categories/${normalizedCategoryId}/types`)
      setCategoryTypeOptions(Array.isArray(res.data) ? res.data : [])
      setCategoryTypeCategoryId(String(normalizedCategoryId))
    } catch (err) {
      setCategoryTypeOptions([])
      setCategoryTypeCategoryId(String(normalizedCategoryId))
    } finally {
      setCategoryTypeLoading(false)
    }
  }, [])

  const resolveCategoryByName = useCallback(async (name) => {
    const normalizedName = String(name || '').trim().replace(/\s+/g, ' ')
    if (!normalizedName) return null

    const existingCategory = findCategoryByName(normalizedName)
    if (existingCategory) return existingCategory

    const res = await api.post('/categories/resolve', { name: normalizedName })
    const resolvedCategory = res?.data?.id
      ? {
          id: res.data.id,
          name: res.data.name || normalizedName,
          description: res.data.description || null,
          type_name: res.data.type_name || null
        }
      : null

    if (!resolvedCategory) return null

    setCategories((prev) => {
      const rows = Array.isArray(prev) ? prev : []
      const exists = rows.some((category) => String(category?.id) === String(resolvedCategory.id))
      const nextRows = exists
        ? rows.map((category) => String(category?.id) === String(resolvedCategory.id) ? { ...category, ...resolvedCategory } : category)
        : [...rows, resolvedCategory]
      return nextRows.sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || '')))
    })

    return resolvedCategory
  }, [findCategoryByName])

  const applyBaleCategoryToProductForm = useCallback(async (balePurchaseId) => {
    const normalizedBalePurchaseId = String(balePurchaseId || '').trim()
    if (!normalizedBalePurchaseId) return null

    const selectedBale = baleStockOptions.find((row) => String(row.bale_purchase_id) === normalizedBalePurchaseId)
    let baleCategory = String(selectedBale?.bale_category || '').trim()

    if (!baleCategory) {
      try {
        const res = await api.get(`/bale-purchases/${normalizedBalePurchaseId}`)
        baleCategory = String(res?.data?.bale_category || '').trim()
      } catch (err) {
        return null
      }
    }

    if (!baleCategory) return null

    const resolvedCategory = await resolveCategoryByName(baleCategory)
    if (!resolvedCategory?.id) return null
    setCategorySearch(resolvedCategory.name || baleCategory)

    setProductForm((form) => {
      if (String(form.bale_purchase_id || '') !== normalizedBalePurchaseId) return form
      if (String(form.product_source || '').trim().toLowerCase() !== 'bale_breakdown') return form

      const nextCategoryId = String(resolvedCategory.id)
      const nextSubcategory = String(resolvedCategory.type_name || '').trim()
      const categoryChanged = String(form.category_id || '') !== nextCategoryId
      const typeChanged = nextSubcategory && String(form.subcategory || '').trim() !== nextSubcategory
      if (!categoryChanged && !typeChanged) return form

      return {
        ...form,
        category_id: nextCategoryId,
        subcategory: categoryChanged ? nextSubcategory : (nextSubcategory || form.subcategory)
      }
    })

    return resolvedCategory
  }, [baleStockOptions, resolveCategoryByName])

  const fetchShrinkage = useCallback(async () => {
    try { const res = await api.get('/inventory/reports/shrinkage'); setShrinkage(res.data || []) } catch (e) { /* ignore */ }
  }, [])

  const fetchSummary = useCallback(async () => {
    try { const res = await api.get('/inventory/reports/summary'); setSummary(res.data) } catch (e) { /* ignore */ }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])
  useEffect(() => {
    if (tab === 'stock-in') {
      fetchStockInRecords()
    }
    if (tab === 'stock-in' || tab === 'products') {
      fetchBaleStockOptions()
    }
    if (tab === 'transactions') fetchTransactions()
    if (tab === 'damaged') fetchDamaged()
    if (tab === 'low-stock') fetchLowStock()
    if (tab === 'shrinkage') fetchShrinkage()
    if (tab === 'reports') fetchSummary()
    if (tab === 'overview') { fetchSummary(); fetchOverviewTransactions() }
  }, [tab, fetchStockInRecords, fetchBaleStockOptions, fetchTransactions, fetchOverviewTransactions, fetchDamaged, fetchLowStock, fetchShrinkage, fetchSummary])

  useEffect(() => { setTransactionsPage(1) }, [transactionSearchQuery, filterType])
  useEffect(() => { setShrinkagePage(1) }, [shrinkageSearchQuery])

  useEffect(() => {
    if (location.pathname !== '/inventory') return
    const params = new URLSearchParams(location.search)
    const currentTab = String(params.get('tab') || '').trim()
    if (currentTab === tab && !location.hash) return
    params.set('tab', tab)
    navigate(`/inventory?${params.toString()}`, { replace: true, preventScrollReset: true })
  }, [location.pathname, location.search, location.hash, tab, navigate])

  useEffect(() => {
    if (!Array.isArray(baleStockOptions) || baleStockOptions.length === 0) {
      if (selectedBaleStockOptionId) setSelectedBaleStockOptionId('')
      return
    }

    if (!selectedBaleStockOptionId) return
    const selectedStillExists = baleStockOptions.some((row) => String(row.bale_purchase_id) === String(selectedBaleStockOptionId))
    if (!selectedStillExists) {
      setSelectedBaleStockOptionId('')
    }
  }, [baleStockOptions, selectedBaleStockOptionId])

  useEffect(() => {
    if (!showProductModal || !productForm.category_id) {
      setCategoryTypeOptions([])
      setCategoryTypeLoading(false)
      setCategoryTypeCategoryId('')
      return
    }

    fetchCategoryTypes(productForm.category_id)
  }, [fetchCategoryTypes, productForm.category_id, showProductModal])

  useEffect(() => {
    if (!showProductModal || categoryTypeLoading || !productForm.subcategory) return
    if (String(categoryTypeCategoryId || '') !== String(productForm.category_id || '')) return
    const selectedTypeExists = categoryTypeOptions.some((option) => (
      String(option?.name || '').trim().toLowerCase() === String(productForm.subcategory || '').trim().toLowerCase()
    ))
    if (!selectedTypeExists) setProductForm((form) => ({ ...form, subcategory: '' }))
  }, [categoryTypeCategoryId, categoryTypeLoading, categoryTypeOptions, productForm.category_id, productForm.subcategory, showProductModal])

  useEffect(() => {
    if (!showProductModal) return
    if (String(productForm.product_source || '').trim().toLowerCase() !== 'bale_breakdown') return
    if (!productForm.bale_purchase_id) return

    const selectedBale = baleStockOptions.find((row) => String(row.bale_purchase_id) === String(productForm.bale_purchase_id))
    const baleCategory = String(selectedBale?.bale_category || '').trim()
    if (baleCategory && categorySearch === baleCategory) {
      const matchedCategory = findCategoryByName(baleCategory)
      if (matchedCategory && String(productForm.category_id || '') === String(matchedCategory.id)) return
    }

    applyBaleCategoryToProductForm(productForm.bale_purchase_id).catch(() => {})
  }, [
    applyBaleCategoryToProductForm,
    baleStockOptions,
    categorySearch,
    findCategoryByName,
    productForm.bale_purchase_id,
    productForm.category_id,
    productForm.product_source,
    showProductModal
  ])

  useEffect(() => {
    if (tab !== 'barcode-labels') return undefined

    const focusScanInput = () => {
      const input = labelScanInputRef.current
      if (input && document.activeElement !== input) input.focus()
    }

    const frameId = window.requestAnimationFrame(focusScanInput)
    window.addEventListener('focus', focusScanInput)

    return () => {
      window.cancelAnimationFrame(frameId)
      window.removeEventListener('focus', focusScanInput)
    }
  }, [tab])

  const clearMessages = () => { setError(null); setSuccess(null) }
  const showMsg = (msg) => { setSuccess(msg); setTimeout(() => setSuccess(null), 4000) }

  const focusQrPreviewScanInput = useCallback(() => {
    const input = qrPreviewScanInputRef.current
    if (input && document.activeElement !== input) input.focus()
  }, [])

  const clearQrPreviewScanTimer = useCallback(() => {
    if (!qrPreviewScanTimerRef.current) return
    window.clearTimeout(qrPreviewScanTimerRef.current)
    qrPreviewScanTimerRef.current = null
  }, [])

  const closeQrPreview = useCallback(() => {
    clearQrPreviewScanTimer()
    setQrPreviewProduct(null)
    setQrPreviewSrc('')
    setQrPreviewLoading(false)
    setQrPreviewScanValue('')
  }, [clearQrPreviewScanTimer])

  useEffect(() => {
    if (!qrPreviewProduct) return undefined

    const restoreScanFocus = () => focusQrPreviewScanInput()
    const frameId = window.requestAnimationFrame(restoreScanFocus)
    window.addEventListener('focus', restoreScanFocus)

    return () => {
      window.cancelAnimationFrame(frameId)
      window.removeEventListener('focus', restoreScanFocus)
      clearQrPreviewScanTimer()
      setQrPreviewScanValue('')
    }
  }, [qrPreviewProduct, focusQrPreviewScanInput, clearQrPreviewScanTimer])

  const openQrPreview = useCallback(async (product) => {
    if (!product?.barcode) {
      setError('Selected product has no barcode/QR code yet')
      return
    }

    clearMessages()
    setQrPreviewProduct(product)
    setQrPreviewSrc('')
    setQrPreviewLoading(true)
    setQrPreviewScanValue('')

    try {
      const previewSrc = resolveQrImageSrc(product.qr_image_path) || await createQrDataUrl(product.barcode)
      setQrPreviewSrc(previewSrc)
    } catch (err) {
      setQrPreviewProduct(null)
      setQrPreviewSrc('')
      setError('Failed to load digital QR preview')
    } finally {
      setQrPreviewLoading(false)
    }
  }, [])

  const exportQrPdf = useCallback(async (items, fileNamePrefix = 'qr-products') => {
    const normalizedItems = (Array.isArray(items) ? items : [])
      .filter((item) => normalizeScanCode(item?.barcode))
      .map((item) => ({
        name: item.name || 'Unnamed product',
        sku: item.sku || '',
        barcode: normalizeScanCode(item.barcode)
      }))

    if (!normalizedItems.length) {
      setError('No QR products available to export')
      return
    }

    clearMessages()

    try {
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

      for (let index = 0; index < normalizedItems.length; index += 1) {
        const item = normalizedItems[index]
        if (index > 0) pdf.addPage()

        const qrDataUrl = await createQrDataUrl(item.barcode)
        const titleLines = pdf.splitTextToSize(item.name, 160)
        const skuLine = item.sku ? `SKU: ${item.sku}` : 'SKU: -'

        pdf.setFillColor(249, 245, 237)
        pdf.rect(15, 15, 180, 267, 'F')

        pdf.setTextColor(15, 23, 42)
        pdf.setFont('helvetica', 'bold')
        pdf.setFontSize(20)
        pdf.text(titleLines, 105, 35, { align: 'center' })

        pdf.setFont('helvetica', 'normal')
        pdf.setFontSize(11)
        pdf.setTextColor(100, 116, 139)
        pdf.text(skuLine, 105, 48, { align: 'center' })

        pdf.setFillColor(255, 255, 255)
        pdf.roundedRect(47.5, 60, 115, 115, 8, 8, 'F')
        pdf.addImage(qrDataUrl, 'PNG', 57.5, 70, 95, 95)

        pdf.setFont('courier', 'bold')
        pdf.setFontSize(18)
        pdf.setTextColor(15, 23, 42)
        pdf.text(item.barcode, 105, 192, { align: 'center' })

        pdf.setFont('helvetica', 'normal')
        pdf.setFontSize(11)
        pdf.setTextColor(71, 85, 105)
        pdf.text('Scan this QR in Sales POS to add the product automatically.', 105, 208, { align: 'center' })
      }

      const suffix = normalizedItems.length === 1
        ? sanitizePdfToken(normalizedItems[0].barcode || normalizedItems[0].sku || normalizedItems[0].name)
        : new Date().toISOString().slice(0, 10)
      pdf.save(`${fileNamePrefix}-${suffix}.pdf`)
      showMsg(`QR PDF exported for ${normalizedItems.length} product${normalizedItems.length > 1 ? 's' : ''}`)
    } catch (err) {
      setError('Failed to export QR PDF')
    }
  }, [])

  const downloadPreviewQrPdf = useCallback(() => {
    if (!qrPreviewProduct) {
      setError('Open a QR preview first')
      return
    }
    exportQrPdf([qrPreviewProduct], 'product-qr')
  }, [qrPreviewProduct, exportQrPdf])

  const productAvailableForPos = useCallback((product) => {
    const availableStock = Number(product?.stock_quantity || 0)
    if (availableStock > 0) return true

    const productName = String(product?.name || product?.barcode || 'Selected product').trim()
    clearMessages()
    setError(`0 stock: ${productName} will not be sent to Sales`)
    return false
  }, [])

  const sendProductToPos = useCallback((product) => {
    const normalizedCode = normalizeScanCode(product?.barcode)
    if (!normalizedCode) {
      setError('Selected product has no barcode/QR code yet')
      return false
    }
    if (!productAvailableForPos(product)) return false

    closeQrPreview()
    navigate(`/sales?scan=${encodeURIComponent(normalizedCode)}`, { preventScrollReset: true })
    return true
  }, [closeQrPreview, navigate, productAvailableForPos])

  const submitQrPreviewScan = useCallback((rawValue) => {
    clearQrPreviewScanTimer()
    const normalizedCode = normalizeScanCode(rawValue)
    const previewCode = normalizeScanCode(qrPreviewProduct?.barcode)

    if (!normalizedCode) {
      setQrPreviewScanValue('')
      focusQrPreviewScanInput()
      return
    }

    if (!previewCode || normalizedCode !== previewCode) {
      setQrPreviewScanValue('')
      setError(`Scanned code ${normalizedCode} does not match the previewed product`)
      focusQrPreviewScanInput()
      return
    }

    setQrPreviewScanValue('')
    if (sendProductToPos(qrPreviewProduct)) {
      showMsg(`Scanned ${qrPreviewProduct?.name || 'product'} from the digital QR preview`)
    } else {
      focusQrPreviewScanInput()
    }
  }, [clearQrPreviewScanTimer, focusQrPreviewScanInput, qrPreviewProduct, sendProductToPos])

  const scheduleQrPreviewScanSubmit = useCallback((rawValue) => {
    clearQrPreviewScanTimer()
    if (!normalizeScanCode(rawValue)) return
    qrPreviewScanTimerRef.current = window.setTimeout(() => {
      submitQrPreviewScan(rawValue)
    }, 180)
  }, [clearQrPreviewScanTimer, submitQrPreviewScan])

  const renderQrPreviewModal = () => (
    qrPreviewProduct && React.createElement('div', {
      className: 'modal-backdrop',
      onClick: closeQrPreview
    },
    React.createElement('div', {
      className: 'modal',
      style: { maxWidth: 560, position: 'relative' },
      onClick: (e) => e.stopPropagation()
    },
    React.createElement('input', {
      ref: qrPreviewScanInputRef,
      type: 'text',
      value: qrPreviewScanValue,
      onChange: (e) => {
        const nextValue = e.target.value
        setQrPreviewScanValue(nextValue)
        scheduleQrPreviewScanSubmit(nextValue)
      },
      onKeyDown: (e) => {
        if (e.key !== 'Enter' && e.key !== 'Tab') return
        e.preventDefault()
        submitQrPreviewScan(e.currentTarget.value)
      },
      autoComplete: 'off',
      'aria-hidden': 'true',
      tabIndex: -1,
      style: {
        position: 'absolute',
        width: 1,
        height: 1,
        padding: 0,
        border: 0,
        opacity: 0,
        pointerEvents: 'none'
      }
    }),
    React.createElement('div', { className: 'modal-header' },
      React.createElement('h2', null, 'Digital QR Preview'),
      React.createElement('button', { type: 'button', className: 'modal-close', onClick: closeQrPreview }, '×')
    ),
    React.createElement('div', { className: 'modal-body' },
      React.createElement('div', { style: { display: 'grid', gap: 16, justifyItems: 'center', textAlign: 'center' } },
        React.createElement('div', null,
          React.createElement('div', { style: { fontSize: 22, fontWeight: 700, color: 'var(--text-dark)' } }, qrPreviewProduct.name || 'Unnamed product'),
          React.createElement('div', { style: { marginTop: 6, color: 'var(--text-light)', fontSize: 13 } }, qrPreviewProduct.sku ? `SKU: ${qrPreviewProduct.sku}` : 'No SKU'),
          React.createElement('div', { style: { color: 'var(--text-light)', fontSize: 13, fontFamily: 'monospace' } }, `Code: ${qrPreviewProduct.barcode}`)
        ),
        React.createElement('div', {
          style: {
            width: 280,
            minHeight: 280,
            padding: 20,
            borderRadius: 20,
            border: '1px solid var(--border)',
            background: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxSizing: 'border-box'
          }
        },
        qrPreviewLoading
          ? React.createElement('div', { style: { color: 'var(--text-light)' } }, 'Loading QR...')
          : qrPreviewSrc
            ? React.createElement('img', {
              src: qrPreviewSrc,
              alt: `QR for ${qrPreviewProduct.barcode}`,
              style: { width: '100%', height: 'auto', display: 'block' }
            })
            : React.createElement('div', { style: { color: 'var(--text-light)' } }, 'QR preview unavailable')
        ),
        React.createElement('div', {
          style: {
            width: '100%',
            padding: '12px 14px',
            borderRadius: 12,
            background: '#f8fafc',
            color: 'var(--text-mid)',
            fontSize: 13,
            lineHeight: 1.5
          }
        }, 'Use this digital QR on screen for scanning. It contains the same product code used by the POS barcode lookup, and scanning it here sends the product straight into the Sales draft cart.'),
        qrPreviewSrc && React.createElement('a', {
          className: 'btn btn-secondary',
          href: qrPreviewSrc,
          target: '_blank',
          rel: 'noreferrer',
          download: `${normalizeScanCode(qrPreviewProduct.barcode || qrPreviewProduct.sku || qrPreviewProduct.name || 'product')}-qr.png`
        }, 'Open QR Image')
      )
    ),
      React.createElement('div', { className: 'modal-footer' },
        React.createElement('button', { type: 'button', className: 'btn btn-primary', onClick: () => sendProductToPos(qrPreviewProduct) }, 'Send to POS'),
        React.createElement('button', { type: 'button', className: 'btn btn-secondary', onClick: downloadPreviewQrPdf }, 'Download QR PDF'),
        React.createElement('button', { type: 'button', className: 'btn btn-secondary', onClick: closeQrPreview }, 'Close')
      )))
  )

  const findProductByBarcode = useCallback((rawBarcode) => {
    const normalizedCode = normalizeScanCode(rawBarcode)
    if (!normalizedCode) return null
    return products.find((product) => normalizeScanCode(product?.barcode) === normalizedCode) || null
  }, [products])

  const handleLabelProductScan = useCallback(async (rawValue) => {
    clearMessages()
    const normalizedCode = normalizeScanCode(rawValue)
    if (!normalizedCode) {
      setError('Scan a barcode or QR first')
      return false
    }

    try {
      const response = await api.get(`/products/by-code/${encodeURIComponent(normalizedCode)}`)
      const product = response?.data || null

      if (!product?.barcode) {
        setLabelScanValue('')
        setError('Code not registered')
        return false
      }
      if (!productAvailableForPos(product)) {
        setLabelScanValue('')
        return false
      }

      setLabelProductId(String(product.id))
      setLabelCopies('1')
      setLabelScanValue('')
      sendProductToPos(product)
      return true
    } catch (err) {
      setLabelScanValue('')
      const apiError = String(err?.response?.data?.error || '').trim()
      if (apiError === 'unknown product' || apiError === 'invalid code') {
        setError('Code not registered')
      } else {
        setError('Failed to look up scanned product')
      }
      return false
    }
  }, [productAvailableForPos, sendProductToPos])

  const handleFormBarcodeScan = useCallback((barcodeValue, setBarcodeState, setFormState) => {
    clearMessages()
    const normalizedCode = normalizeScanCode(barcodeValue)
    if (!normalizedCode) {
      setError('Scan a barcode first')
      return false
    }

    const product = findProductByBarcode(normalizedCode)
    if (!product) {
      setError(`Barcode ${normalizedCode} was not found in products`)
      return false
    }

    setFormState((prev) => ({ ...prev, product_id: String(product.id) }))
    setBarcodeState(product.barcode || normalizedCode)
    showMsg(`Selected ${product.name} from barcode scan`)
    return true
  }, [findProductByBarcode])

  const buildLabelRows = useCallback(() => (
    labelQueue
      .map((entry) => {
        const product = products.find((item) => Number(item.id) === Number(entry.product_id))
        if (!product || !product.barcode) return null
        return {
          product_id: product.id,
          sku: product.sku || '',
          name: product.name || '',
          barcode: normalizeScanCode(product.barcode),
          price: Number(product.price || 0),
          stock_quantity: Number(product.stock_quantity || 0),
          copies: Math.max(1, Number(entry.copies) || 1)
        }
      })
      .filter(Boolean)
  ), [labelQueue, products])

  const addProductToLabelQueue = () => {
    clearMessages()
    const productId = Number(labelProductId)
    const copies = Math.max(1, Number(labelCopies) || 1)
    const product = products.find((item) => Number(item.id) === productId)

    if (!product) return setError('Select a product for labels')
    if (!product.barcode) return setError('Selected product has no barcode')

    setLabelQueue((prev) => {
      const existingIndex = prev.findIndex((entry) => Number(entry.product_id) === productId)
      if (existingIndex === -1) return [...prev, { product_id: productId, copies }]
      return prev.map((entry, idx) => (
        idx === existingIndex ? { ...entry, copies: Math.max(1, Number(entry.copies || 1) + copies) } : entry
      ))
    })
    setLabelProductId('')
    setLabelCopies('1')
  }

  const updateLabelQueueCopies = (productId, nextCopies) => {
    const copies = Math.max(1, Number(nextCopies) || 1)
    setLabelQueue((prev) => prev.map((entry) => (
      Number(entry.product_id) === Number(productId) ? { ...entry, copies } : entry
    )))
  }

  const removeFromLabelQueue = (productId) => {
    setLabelQueue((prev) => prev.filter((entry) => Number(entry.product_id) !== Number(productId)))
  }

  const downloadBarcodeCsv = () => {
    clearMessages()
    const rows = buildLabelRows()
    if (!rows.length) return setError('Add at least one product to export labels')

    const header = ['product_id', 'sku', 'name', 'barcode', 'price', 'stock_quantity', 'copies']
    const csvLines = [
      header.join(','),
      ...rows.map((row) => ([
        row.product_id,
        `"${String(row.sku).replace(/"/g, '""')}"`,
        `"${String(row.name).replace(/"/g, '""')}"`,
        `"${String(row.barcode).replace(/"/g, '""')}"`,
        row.price,
        row.stock_quantity,
        row.copies
      ].join(',')))
    ]
    const csvBlob = new Blob([csvLines.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const csvUrl = URL.createObjectURL(csvBlob)
    const link = document.createElement('a')
    link.href = csvUrl
    link.download = `barcode-labels-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(csvUrl)
  }

  const printBarcodeLabels = () => {
    clearMessages()
    const rows = buildLabelRows()
    if (!rows.length) return setError('Add at least one product to print labels')

    const expanded = rows.flatMap((row) => Array.from({ length: row.copies }, () => row))
    const labelsPerPage = 24
    const pages = []
    for (let idx = 0; idx < expanded.length; idx += labelsPerPage) {
      pages.push(expanded.slice(idx, idx + labelsPerPage))
    }

    const pageMarkup = pages.map((page) => {
      const filledCells = page.map((item) => `
        <div class="label-cell">
          <div class="label-name">${escapeHtml(item.name)}</div>
          <div class="label-sku">${escapeHtml(item.sku || '-')}</div>
          <div class="label-barcode">${createCode128SvgMarkup(item.barcode)}</div>
          <div class="label-code">${escapeHtml(item.barcode)}</div>
        </div>
      `).join('')
      const emptyCount = Math.max(labelsPerPage - page.length, 0)
      const emptyCells = Array.from({ length: emptyCount }, () => '<div class="label-cell"></div>').join('')
      return `<section class="sheet">${filledCells}${emptyCells}</section>`
    }).join('')

    const popup = window.open('', '_blank', 'width=1200,height=860')
    if (!popup) return setError('Allow pop-ups to print labels')

    popup.document.write(`
      <html>
        <head>
          <title>Barcode Labels</title>
          <style>
            @page { size: A4 portrait; margin: 10mm; }
            body { margin: 0; font-family: Arial, sans-serif; color: #0f172a; }
            .sheet {
              width: 100%;
              min-height: calc(297mm - 20mm);
              display: grid;
              grid-template-columns: repeat(3, 1fr);
              grid-template-rows: repeat(8, minmax(0, 1fr));
              gap: 4mm;
              page-break-after: always;
              box-sizing: border-box;
            }
            .sheet:last-child { page-break-after: auto; }
            .label-cell {
              border: 1px dashed #cbd5e1;
              border-radius: 4px;
              padding: 4mm 3mm;
              display: flex;
              flex-direction: column;
              justify-content: center;
              align-items: center;
              overflow: hidden;
              box-sizing: border-box;
            }
            .label-name {
              font-size: 10px;
              font-weight: 700;
              line-height: 1.2;
              text-align: center;
              margin-bottom: 2px;
              width: 100%;
              max-height: 24px;
              overflow: hidden;
            }
            .label-sku {
              font-size: 9px;
              color: #475569;
              margin-bottom: 3px;
              text-align: center;
            }
            .label-barcode svg { width: 100%; max-height: 36px; }
            .label-code {
              margin-top: 3px;
              font-size: 9px;
              letter-spacing: 0.5px;
              text-align: center;
            }
          </style>
        </head>
        <body>${pageMarkup}</body>
      </html>
    `)
    popup.document.close()
    popup.focus()
    popup.print()
  }

  const printQrLabels = async () => {
    clearMessages()
    const rows = buildLabelRows()
    if (!rows.length) return setError('Add at least one product to print labels')

    const expanded = rows.flatMap((row) => Array.from({ length: row.copies }, () => row))
    const labelsPerPage = 24

    const withQr = await Promise.all(
      expanded.map(async (item) => ({
        ...item,
        qrDataUrl: await createQrDataUrl(item.barcode)
      }))
    )

    const pages = []
    for (let idx = 0; idx < withQr.length; idx += labelsPerPage) {
      pages.push(withQr.slice(idx, idx + labelsPerPage))
    }

    const pageMarkup = pages.map((page) => {
      const filledCells = page.map((item) => `
        <div class="label-cell">
          <div class="label-name">${escapeHtml(item.name)}</div>
          <div class="label-sku">${escapeHtml(item.sku || '-')}</div>
          <div class="label-qr"><img src="${item.qrDataUrl}" alt="QR ${escapeHtml(item.barcode)}" /></div>
          <div class="label-code">${escapeHtml(item.barcode)}</div>
        </div>
      `).join('')
      const emptyCount = Math.max(labelsPerPage - page.length, 0)
      const emptyCells = Array.from({ length: emptyCount }, () => '<div class="label-cell"></div>').join('')
      return `<section class="sheet">${filledCells}${emptyCells}</section>`
    }).join('')

    const popup = window.open('', '_blank', 'width=1200,height=860')
    if (!popup) return setError('Allow pop-ups to print labels')

    popup.document.write(`
      <html>
        <head>
          <title>QR Labels</title>
          <style>
            @page { size: A4 portrait; margin: 10mm; }
            body { margin: 0; font-family: Arial, sans-serif; color: #0f172a; }
            .sheet {
              width: 100%;
              min-height: calc(297mm - 20mm);
              display: grid;
              grid-template-columns: repeat(3, 1fr);
              grid-template-rows: repeat(8, minmax(0, 1fr));
              gap: 4mm;
              page-break-after: always;
              box-sizing: border-box;
            }
            .sheet:last-child { page-break-after: auto; }
            .label-cell {
              border: 1px dashed #cbd5e1;
              border-radius: 4px;
              padding: 4mm 3mm;
              display: flex;
              flex-direction: column;
              justify-content: center;
              align-items: center;
              overflow: hidden;
              box-sizing: border-box;
            }
            .label-name {
              font-size: 10px;
              font-weight: 700;
              line-height: 1.2;
              text-align: center;
              margin-bottom: 2px;
              width: 100%;
              max-height: 24px;
              overflow: hidden;
            }
            .label-sku {
              font-size: 9px;
              color: #475569;
              margin-bottom: 3px;
              text-align: center;
            }
            .label-qr img {
              width: 82px;
              height: 82px;
              object-fit: contain;
              image-rendering: pixelated;
            }
            .label-code {
              margin-top: 4px;
              font-size: 9px;
              letter-spacing: 0.5px;
              text-align: center;
            }
          </style>
        </head>
        <body>${pageMarkup}</body>
      </html>
    `)
    popup.document.close()
    popup.focus()
    popup.print()
  }

  // ── Stock In ──
  const handleStockIn = async (e) => {
    e.preventDefault(); clearMessages()

    const productId = Number(stockInForm.product_id)
    const quantity = Number(stockInForm.quantity)
    const selectedProduct = products.find((p) => Number(p.id) === productId)

    if (!selectedProduct) return setError('Please select a valid product')
    if (productSourceKey(selectedProduct) !== 'manual') {
      return setError(`This item is managed through ${productSourceLabel(selectedProduct)}. Use its dedicated creation flow instead of manual Stock In.`)
    }
    if (!Number.isFinite(quantity) || quantity <= 0) return setError('Quantity must be greater than 0')

    try {
      await api.post('/inventory/stock-in', {
        product_id: productId,
        quantity,
        supplier_id: stockInForm.supplier_id ? Number(stockInForm.supplier_id) : null,
        reference: stockInForm.reference,
        date: buildStockInTimestamp(stockInForm.date)
      })
      setStockInForm({ product_id: '', supplier_id: '', quantity: '', reference: '', date: '' })
      showMsg('Stock in recorded successfully')
      fetchAll()
      fetchStockInRecords()
    } catch (err) { setError(err?.response?.data?.error || 'Could not record manual stock in') }
  }

  const openCreateProductModal = (overrides = {}) => {
    setEditingProduct(null)
    const nextForm = createEmptyProductForm(overrides)
    let nextCategorySearch = ''

    if (String(nextForm.product_source || '').trim().toLowerCase() === 'bale_breakdown' && nextForm.bale_purchase_id) {
      const selectedBale = baleStockOptions.find((row) => String(row.bale_purchase_id) === String(nextForm.bale_purchase_id))
      const baleCategory = String(selectedBale?.bale_category || '').trim()
      if (baleCategory) {
        nextForm.subcategory = ''
      }
    }

    if (!nextCategorySearch) {
      const selectedCategory = categories.find((category) => String(category.id) === String(nextForm.category_id || ''))
      nextCategorySearch = selectedCategory?.name || ''
    }

    setProductForm(nextForm)
    setCategorySearch(nextCategorySearch)
    setShowProductModal(true)
  }

  const startBaleIndividualCreate = () => {
    clearMessages()
    if (!selectedBaleStockOptionId) {
      return setError('Choose a bale record first, then create one product at a time in Product Management.')
    }

    const premiumAvailable = Number(selectedBaleStockOption?.pending_premium ?? 0)
    const standardAvailable = Number(selectedBaleStockOption?.pending_standard ?? 0)
    const defaultGrade = premiumAvailable > 0
      ? 'premium'
      : standardAvailable > 0
        ? 'standard'
        : 'premium'

    openCreateProductModal({
      product_source: 'bale_breakdown',
      bale_purchase_id: String(selectedBaleStockOptionId),
      condition_grade: defaultGrade
    })
    navigate('/inventory?tab=products')
  }

  // ── Adjustment ──
  const handleAdjust = async (e) => {
    e.preventDefault(); clearMessages()
    const productId = Number(adjustForm.product_id)
    const qtyToRemove = Number(adjustForm.quantity)
    const selectedProduct = products.find(p => Number(p.id) === productId)
    const availableStock = Number(selectedProduct?.stock_quantity) || 0

    if (!selectedProduct) return setError('Please select a valid product')
    if (!Number.isFinite(qtyToRemove) || qtyToRemove <= 0) return setError('Quantity must be greater than 0')
    if (availableStock <= 0) return setError(`No stock available for ${selectedProduct.name}`)
    if (qtyToRemove > availableStock) return setError(`Insufficient stock for ${selectedProduct.name}. Available: ${availableStock}`)

    try {
      await api.post('/inventory/stock-out/adjust', {
        product_id: productId,
        quantity: qtyToRemove,
        reason: adjustForm.reason,
        employee_id: adjustForm.employee_id ? Number(adjustForm.employee_id) : undefined
      })
      setAdjustForm({ product_id: '', quantity: '', reason: '', employee_id: '' })
      setAdjustBarcode('')
      showMsg('Adjustment recorded')
      fetchAll()
    } catch (err) { setError(err?.response?.data?.error || 'Adjustment failed') }
  }

  // ── Damage ──
  const handleDamage = async (e) => {
    e.preventDefault(); clearMessages()
    const productId = Number(damageForm.product_id)
    const qtyToRemove = Number(damageForm.quantity)
    const selectedProduct = products.find(p => Number(p.id) === productId)
    const availableStock = Number(selectedProduct?.stock_quantity) || 0

    if (!selectedProduct) return setError('Please select a valid product')
    if (!Number.isFinite(qtyToRemove) || qtyToRemove <= 0) return setError('Quantity must be greater than 0')
    if (availableStock <= 0) return setError(`No stock available for ${selectedProduct.name}`)
    if (qtyToRemove > availableStock) return setError(`Insufficient stock for ${selectedProduct.name}. Available: ${availableStock}`)

    try {
      await api.post('/inventory/stock-out/damage', {
        product_id: productId,
        quantity: qtyToRemove,
        reason: damageForm.reason,
        employee_id: damageForm.employee_id ? Number(damageForm.employee_id) : undefined
      })
      setDamageForm({ product_id: '', quantity: '', reason: '', employee_id: '' })
      setDamageBarcode('')
      showMsg('Damage recorded')
      fetchAll()
      fetchDamaged()
    } catch (err) { setError(err?.response?.data?.error || 'Damage record failed') }
  }

  // ── Product CRUD ──
  const resetRepairModalState = useCallback(() => {
    setRepairForm(createEmptyRepairForm())
    setSelectedDamagedRecordKey('')
    setRepairCategorySearch('')
    setRepairCategoryDropdownOpen(false)
  }, [])

  const saveRepairDraft = useCallback(() => {
    const currentSourceType = String(repairForm.damage_source_type || inferDamagedSourceType(repairForm)).trim().toLowerCase()
    const currentSourceId = Number(repairForm.damage_source_id || inferDamagedSourceId(repairForm, currentSourceType))
    const recordIsSelected = Boolean(currentSourceType) && Number.isInteger(currentSourceId) && currentSourceId > 0
    if (!selectedDamagedRecordKey || !recordIsSelected) return
    setRepairDrafts((drafts) => ({
      ...drafts,
      [selectedDamagedRecordKey]: createRepairDraft(repairForm, repairCategorySearch)
    }))
  }, [repairCategorySearch, repairForm, selectedDamagedRecordKey])

  const clearRepairForm = useCallback(() => {
    if (selectedDamagedRecordKey) {
      setRepairDrafts((drafts) => {
        if (!drafts[selectedDamagedRecordKey]) return drafts
        const nextDrafts = { ...drafts }
        delete nextDrafts[selectedDamagedRecordKey]
        return nextDrafts
      })
    }
    resetRepairModalState()
  }, [resetRepairModalState, selectedDamagedRecordKey])

  const closeRepairModal = useCallback(() => {
    saveRepairDraft()
    setShowRepairModal(false)
    resetRepairModalState()
  }, [resetRepairModalState, saveRepairDraft])

  const startRepairDamagedItem = useCallback(async (row) => {
    if (!row) return
    const normalizedRow = normalizeDamagedRecord(row)
    clearMessages()
    const availableCategories = await ensureRepairCategories()
    const recordKey = String(normalizedRow.record_key || `${normalizedRow.damage_source_type}-${normalizedRow.damage_source_id}`)
    const savedDraft = repairDrafts[recordKey] || null
    const preferredCategoryId = String(savedDraft?.category_id || normalizedRow.category_id || '')
    const matchedCategory = availableCategories.find((category) => String(category?.id) === preferredCategoryId)
    setSelectedDamagedRecordKey(recordKey)
    setRepairForm(createEmptyRepairForm({
      damage_source_type: normalizedRow.damage_source_type || '',
      damage_source_id: String(normalizedRow.damage_source_id || ''),
      source_label: normalizedRow.source_label || 'Damage Record',
      source_name: normalizedRow.source_name || normalizedRow.product_name || '',
      original_quantity: Number(normalizedRow.original_quantity || normalizedRow.quantity || 0),
      repaired_quantity: Number(normalizedRow.repaired_quantity || 0),
      remaining_quantity: Number(normalizedRow.remaining_quantity ?? normalizedRow.quantity ?? 0),
      quantity: savedDraft?.quantity || '1',
      suggested_name: normalizedRow.suggested_name || normalizedRow.product_name || '',
      sku: savedDraft?.sku || '',
      name: savedDraft?.name || '',
      brand: savedDraft?.brand ?? (normalizedRow.brand || ''),
      description: savedDraft?.description ?? (normalizedRow.description || ''),
      category_id: preferredCategoryId,
      price: savedDraft?.price ?? (normalizedRow.price ? String(normalizedRow.price) : ''),
      low_stock_threshold: savedDraft?.low_stock_threshold ?? String(normalizedRow.low_stock_threshold ?? 0),
      size: savedDraft?.size ?? (normalizedRow.size || ''),
      barcode: savedDraft?.barcode || '',
      reported_by_name: normalizedRow.reported_by_name || '',
      created_at: normalizedRow.created_at || ''
    }))
    setRepairCategorySearch(savedDraft?.category_search || matchedCategory?.name || '')
    setRepairCategoryDropdownOpen(false)
    if (!normalizedRow.category_id && availableCategories.length === 0) {
      setError('Categories could not be loaded. Check backend permissions or create at least one category first.')
    }
    setShowRepairModal(true)
  }, [ensureRepairCategories, repairDrafts])

  const handleRepairDamagedItem = async (e) => {
    e.preventDefault()
    clearMessages()

    const damageSourceType = repairFormSourceType
    const damageSourceId = repairFormSourceId
    const categoryId = Number(repairForm.category_id)
    const normalizedName = String(repairForm.name || '').trim()
    const normalizedPrice = Number(repairForm.price)
    const normalizedQuantity = Number(repairForm.quantity)
    const normalizedLowStockThreshold = repairForm.low_stock_threshold === '' || repairForm.low_stock_threshold === undefined
      ? 0
      : Number(repairForm.low_stock_threshold)

    if (!damageSourceType || !Number.isInteger(damageSourceId) || damageSourceId <= 0) {
      return setError('Choose a damaged record to receive first')
    }
    if (!normalizedName) return setError('Product name is required')
    if (!Number.isInteger(categoryId) || categoryId <= 0) return setError('Category is required')
    if (!Number.isFinite(normalizedPrice) || normalizedPrice <= 0) return setError('Selling price must be greater than 0')
    if (!Number.isInteger(normalizedQuantity) || normalizedQuantity <= 0) return setError('Quantity must be a positive whole number')
    if (normalizedQuantity > repairFormRemainingQuantity) return setError(`Quantity cannot exceed remaining units (${repairFormRemainingQuantity})`)
    if (!Number.isFinite(normalizedLowStockThreshold) || normalizedLowStockThreshold < 0) {
      return setError('Low stock threshold must be 0 or greater')
    }

    try {
      const payload = {
        damage_source_type: damageSourceType,
        damage_source_id: damageSourceId,
        quantity: normalizedQuantity,
        sku: String(repairForm.sku || '').trim() || undefined,
        name: normalizedName,
        brand: String(repairForm.brand || '').trim() || undefined,
        description: String(repairForm.description || '').trim() || undefined,
        category_id: categoryId,
        price: normalizedPrice,
        low_stock_threshold: Math.floor(normalizedLowStockThreshold),
        size: String(repairForm.size || '').trim() || undefined,
        barcode: String(repairForm.barcode || '').trim() || undefined
      }

      const res = await api.post('/inventory/damaged/repair', payload)
      const createdProduct = res?.data?.product || null
      const quantityReceived = Number(res?.data?.quantity_received || normalizedQuantity)
      showMsg(
        createdProduct?.sku
          ? `Received repaired product in Product Management: ${createdProduct.name} (${createdProduct.sku}) with stock ${quantityReceived}`
          : `Received repaired product in Product Management with stock ${quantityReceived}`
      )
      if (selectedDamagedRecordKey) {
        setRepairDrafts((drafts) => {
          if (!drafts[selectedDamagedRecordKey]) return drafts
          const nextDrafts = { ...drafts }
          delete nextDrafts[selectedDamagedRecordKey]
          return nextDrafts
        })
      }
      setShowRepairModal(false)
      resetRepairModalState()
      await Promise.all([
        fetchDamaged(),
        fetchAll()
      ])
    } catch (err) {
      if (Number(err?.response?.status) === 404) {
        setError('Receive repaired endpoint was not found. Restart the backend so the latest inventory route loads.')
      } else {
        setError(err?.response?.data?.error || 'Failed to receive repaired product')
      }
    }
  }

  const renderRepairModal = () => (
    showRepairModal && React.createElement('div', {
      className: 'modal-backdrop',
      onClick: closeRepairModal
    },
    React.createElement('div', {
      className: 'modal',
      style: { maxWidth: 860, width: '94%' },
      onClick: (e) => e.stopPropagation()
    },
    React.createElement('div', { className: 'modal-header' },
      React.createElement('h2', null, 'Receive Repaired Product'),
      React.createElement('button', {
        type: 'button',
        className: 'modal-close',
        onClick: closeRepairModal
      }, '×')
    ),
    React.createElement('form', { onSubmit: handleRepairDamagedItem },
      React.createElement('div', { className: 'modal-body inventory-damaged-modal-body' },
        React.createElement('div', {
          className: 'inventory-damaged-modal-grid',
          style: { marginBottom: 14 }
        },
          React.createElement('div', { className: 'form-group', style: { marginBottom: 0 } },
            React.createElement('label', { className: 'form-label' }, 'Damage Source'),
            React.createElement('input', {
              className: 'form-input',
              value: repairFormRecordSelected
                ? `${repairForm.source_label || 'Damage'} #${repairForm.damage_source_id || ''}`
                : 'Select a damage record',
              readOnly: true,
              disabled: true
            })
          ),
          React.createElement('div', { className: 'form-group', style: { marginBottom: 0 } },
            React.createElement('label', { className: 'form-label' }, 'Original Qty'),
            React.createElement('input', {
              className: 'form-input',
              value: Number(repairForm.original_quantity || 0),
              readOnly: true,
              disabled: true
            })
          ),
          React.createElement('div', { className: 'form-group', style: { marginBottom: 0 } },
            React.createElement('label', { className: 'form-label' }, 'Already Received'),
            React.createElement('input', {
              className: 'form-input',
              value: Number(repairForm.repaired_quantity || 0),
              readOnly: true,
              disabled: true
            })
          ),
          React.createElement('div', { className: 'form-group', style: { marginBottom: 0 } },
            React.createElement('label', { className: 'form-label' }, 'Remaining Qty'),
            React.createElement('input', {
              className: 'form-input',
              value: repairFormRemainingQuantity,
              readOnly: true,
              disabled: true
            })
          )
        ),
        React.createElement('div', {
          className: 'inventory-damaged-modal-grid'
        },
          React.createElement('div', { className: 'form-group', style: { marginBottom: 0 } },
            React.createElement('label', { className: 'form-label' }, 'Quantity *'),
            React.createElement('input', {
              className: 'form-input',
              type: 'number',
              min: 1,
              max: Math.max(1, repairFormRemainingQuantity || 1),
              step: 1,
              value: repairForm.quantity,
              onChange: (e) => setRepairForm((form) => ({ ...form, quantity: e.target.value })),
              required: true
            })
          ),
          React.createElement('div', { className: 'form-group', style: { marginBottom: 0 } },
            React.createElement('label', { className: 'form-label' }, 'SKU'),
            React.createElement('input', {
              className: 'form-input',
              value: repairForm.sku,
              onChange: (e) => setRepairForm((form) => ({ ...form, sku: e.target.value })),
              placeholder: 'Auto-generated if blank'
            })
          ),
          React.createElement('div', { className: 'form-group', style: { marginBottom: 0 } },
            React.createElement('label', { className: 'form-label' }, 'Name *'),
            React.createElement('input', {
              className: 'form-input',
              value: repairForm.name,
              onChange: (e) => setRepairForm((form) => ({ ...form, name: e.target.value })),
              required: true
            })
          ),
          React.createElement('div', { className: 'form-group', style: { marginBottom: 0 } },
            React.createElement('label', { className: 'form-label' }, 'Barcode'),
            React.createElement('input', {
              className: 'form-input',
              value: repairForm.barcode,
              onChange: (e) => setRepairForm((form) => ({ ...form, barcode: e.target.value })),
              placeholder: 'Auto-generated if blank'
            })
          ),
          React.createElement('div', { className: 'form-group', style: { marginBottom: 0, position: 'relative' } },
            React.createElement('label', { className: 'form-label' }, 'Category *'),
            React.createElement('input', {
              className: 'form-input',
              value: repairCategorySearch,
              onChange: (e) => {
                const nextValue = e.target.value
                const matchedCategory = categories.find((category) => String(category?.name || '').toLowerCase() === nextValue.trim().toLowerCase())
                setRepairCategorySearch(nextValue)
                setRepairCategoryDropdownOpen(true)
                setRepairForm((form) => ({ ...form, category_id: matchedCategory ? String(matchedCategory.id) : '' }))
              },
              onFocus: () => setRepairCategoryDropdownOpen(true),
              placeholder: '- Search or select category -',
              autoComplete: 'off',
              required: true
            }),
            repairCategoryDropdownOpen && React.createElement('div', {
              style: {
                position: 'absolute',
                top: '100%',
                left: 0,
                right: 0,
                zIndex: 50,
                background: 'var(--card-bg, #fff)',
                border: '1px solid var(--border, #ddd)',
                borderRadius: 6,
                maxHeight: 220,
                overflowY: 'auto',
                boxShadow: '0 4px 12px rgba(0,0,0,0.12)'
              }
            },
              filteredRepairCategories.length === 0
                ? React.createElement('div', {
                  style: { padding: '10px 14px', color: 'var(--text-light, #999)', fontSize: 13 }
                }, 'No categories found')
                : filteredRepairCategories.map((category) => React.createElement('div', {
                  key: `repair-category-active-${category.id}`,
                  style: {
                    padding: '8px 14px',
                    cursor: 'pointer',
                    fontSize: 13,
                    background: String(repairForm.category_id) === String(category.id) ? 'var(--gold-light, #fef3c7)' : 'transparent',
                    borderBottom: '1px solid var(--border-light, #f0f0f0)'
                  },
                  onMouseDown: (e) => {
                    e.preventDefault()
                    setRepairForm((form) => ({ ...form, category_id: String(category.id) }))
                    setRepairCategorySearch(category.name)
                    setRepairCategoryDropdownOpen(false)
                  },
                  onMouseEnter: (e) => { e.currentTarget.style.background = 'var(--gold-light, #fef3c7)' },
                  onMouseLeave: (e) => { e.currentTarget.style.background = String(repairForm.category_id) === String(category.id) ? 'var(--gold-light, #fef3c7)' : 'transparent' }
                }, category.name))
            ),
            repairCategoryDropdownOpen && React.createElement('div', {
              style: { position: 'fixed', inset: 0, zIndex: 49 },
              onClick: () => setRepairCategoryDropdownOpen(false)
            })
          ),
          React.createElement('div', { className: 'form-group', style: { marginBottom: 0 } },
            React.createElement('label', { className: 'form-label' }, 'Brand'),
            React.createElement('input', {
              className: 'form-input',
              value: repairForm.brand,
              onChange: (e) => setRepairForm((form) => ({ ...form, brand: e.target.value })),
              placeholder: 'Brand name'
            })
          ),
          React.createElement('div', { className: 'form-group', style: { marginBottom: 0 } },
            React.createElement('label', { className: 'form-label' }, 'Selling Price *'),
            React.createElement('input', {
              className: 'form-input',
              type: 'number',
              min: '0.01',
              step: '0.01',
              value: repairForm.price,
              onChange: (e) => setRepairForm((form) => ({ ...form, price: e.target.value })),
              required: true
            })
          ),
          React.createElement('div', { className: 'form-group', style: { marginBottom: 0 } },
            React.createElement('label', { className: 'form-label' }, 'Low Stock Threshold'),
            React.createElement('input', {
              className: 'form-input',
              type: 'number',
              min: 0,
              step: 1,
              value: repairForm.low_stock_threshold,
              onChange: (e) => setRepairForm((form) => ({ ...form, low_stock_threshold: e.target.value }))
            })
          ),
          React.createElement('div', { className: 'form-group', style: { marginBottom: 0 } },
            React.createElement('label', { className: 'form-label' }, 'Size'),
            React.createElement('select', {
              className: 'form-input',
              value: repairForm.size,
              onChange: (e) => setRepairForm((form) => ({ ...form, size: e.target.value }))
            },
              React.createElement('option', { value: '' }, '- Select size -'),
              ...PRODUCT_SIZE_OPTIONS.map((option) => React.createElement('option', {
                key: `repair-size-${option.value}`,
                value: option.value
              }, option.label))
            )
          )
        ),
        React.createElement('div', { className: 'form-group', style: { marginTop: 12, marginBottom: 0 } },
          React.createElement('label', { className: 'form-label' }, 'Description'),
          React.createElement('textarea', {
            className: 'form-input',
            rows: 2,
            value: repairForm.description,
            onChange: (e) => setRepairForm((form) => ({ ...form, description: e.target.value })),
            placeholder: 'Optional details about this received repaired product'
          })
        ),
      ),
      React.createElement('div', { className: 'modal-footer' },
        React.createElement('button', {
          type: 'submit',
          className: 'btn btn-primary',
          disabled: !repairFormRecordSelected || repairFormRemainingQuantity <= 0
        }, repairFormRemainingQuantity <= 0 ? 'No Units Left' : 'Receive Repaired Product'),
        React.createElement('button', { type: 'button', className: 'btn btn-secondary', onClick: clearRepairForm }, 'Clear'),
        React.createElement('button', { type: 'button', className: 'btn btn-secondary', onClick: closeRepairModal }, 'Cancel')
      )
    )))
  )

  const handleSaveProduct = async (e) => {
    e.preventDefault(); clearMessages()
    try {
      const payload = { ...productForm }
      const isEditing = Boolean(editingProduct)
      const sourceKey = String(payload.product_source || 'manual').trim().toLowerCase()
      const normalizedSource = sourceKey === 'bale_breakdown'
        ? 'bale_breakdown'
        : sourceKey === 'repaired_damage'
          ? 'repaired_damage'
          : 'manual'
      const isSystemManagedSource = normalizedSource === 'bale_breakdown' || normalizedSource === 'repaired_damage'

      payload.sku = String(payload.sku || '').trim()
      payload.barcode = String(payload.barcode || '').trim()
      payload.brand = String(payload.brand || '').trim()
      payload.description = String(payload.description || '').trim()
      payload.subcategory = String(payload.subcategory || '').trim()

      payload.price = Number(payload.price)
      payload.stock_quantity = payload.stock_quantity === '' || payload.stock_quantity === undefined
        ? 1
        : Number(payload.stock_quantity)
      payload.low_stock_threshold = payload.low_stock_threshold === '' || payload.low_stock_threshold === undefined
        ? 10
        : Number(payload.low_stock_threshold)
      payload.category_id = payload.category_id ? Number(payload.category_id) : null
      payload.name = buildProductNameFromClassification(payload, categories, categorySearch)

      if (!payload.name) return setError('Select a category or type before saving this product')
      if (!Number.isFinite(payload.price) || payload.price <= 0) return setError('Selling price must be greater than 0')
      if (!Number.isFinite(payload.stock_quantity) || payload.stock_quantity < 0) return setError('Stock quantity must be 0 or greater')
      payload.stock_quantity = Math.floor(payload.stock_quantity)
      payload.low_stock_threshold = Number.isFinite(payload.low_stock_threshold) ? Math.max(0, payload.low_stock_threshold) : 10

      const selectedCategoryTypeOptionsLoaded = String(categoryTypeCategoryId || '') === String(payload.category_id || '')
      if (payload.category_id && categoryTypeLoading) return setError('Wait for product types to finish loading')
      if (selectedCategoryTypeOptionsLoaded && categoryTypeOptions.length > 0 && !payload.subcategory) {
        return setError('Type is required for the selected category')
      }

      if (!isEditing && normalizedSource === 'bale_breakdown') {
        const balePurchaseId = Number(payload.bale_purchase_id)
        if (!Number.isInteger(balePurchaseId) || balePurchaseId <= 0) {
          return setError('Choose a bale record before creating this product')
        }

        const conditionGrade = String(payload.condition_grade || '').trim().toLowerCase()
        if (!['premium', 'standard'].includes(conditionGrade)) {
          return setError('Choose Bale Grade: Premium or Standard')
        }

        const baleOption = baleStockOptions.find((row) => String(row.bale_purchase_id) === String(balePurchaseId))
        const availableForGrade = conditionGrade === 'premium'
          ? Number(baleOption?.pending_premium ?? 0)
          : Number(baleOption?.pending_standard ?? 0)
        const requestedBaleQuantity = Math.floor(Number(payload.stock_quantity || 0))
        const gradeLabel = conditionGrade === 'premium' ? 'Premium' : 'Standard'

        if (availableForGrade <= 0) {
          return setError(`No more ${gradeLabel} quantity available for this bale record.`)
        }
        if (!Number.isFinite(requestedBaleQuantity) || requestedBaleQuantity <= 0) {
          return setError('Quantity must be a positive whole number for bale products')
        }
        if (requestedBaleQuantity > availableForGrade) {
          return setError(`Requested ${gradeLabel} quantity (${requestedBaleQuantity}) exceeds available (${availableForGrade}).`)
        }

        payload.product_source = 'bale_breakdown'
        payload.bale_purchase_id = balePurchaseId
        payload.condition_grade = conditionGrade
        payload.stock_quantity = requestedBaleQuantity
      } else if (!isEditing) {
        payload.product_source = 'manual'
        payload.supplier_id = payload.supplier_id ? Number(payload.supplier_id) : null
        if (payload.supplier_id !== null && (!Number.isInteger(payload.supplier_id) || payload.supplier_id <= 0)) {
          return setError('Please select a valid supplier')
        }
        if (payload.supplier_id === null) delete payload.supplier_id
        delete payload.bale_purchase_id
        delete payload.condition_grade
      }

      delete payload.source_breakdown_id
      delete payload.allocated_cost
      delete payload.status
      delete payload.date_encoded

      if (isEditing) {
        delete payload.product_source
        delete payload.supplier_id
        delete payload.bale_purchase_id
        delete payload.condition_grade
        if (isSystemManagedSource) delete payload.stock_quantity
      }

      if (!payload.sku) delete payload.sku
      if (!payload.barcode && !isEditing) delete payload.barcode
      if (!payload.brand) delete payload.brand
      if (!payload.description) delete payload.description

      if (isEditing) {
        try {
          await api.put(`/products/${editingProduct}`, payload)
        } catch (updateErr) {
          const backendMessage = String(updateErr?.response?.data?.error || '').toLowerCase()
          const isLegacyStockQuantityRule = backendMessage.includes('stock quantity is managed through stock in')

          if (!isLegacyStockQuantityRule) {
            throw updateErr
          }

          const editingProductId = Number(editingProduct)
          const previousStockQuantity = Number(
            products.find((row) => Number(row.id) === editingProductId)?.stock_quantity ?? 0
          )
          const nextStockQuantity = Number(payload.stock_quantity)
          const stockDelta = Math.floor(nextStockQuantity) - Math.floor(previousStockQuantity)

          const updatePayloadWithoutStock = { ...payload }
          delete updatePayloadWithoutStock.stock_quantity

          await api.put(`/products/${editingProduct}`, updatePayloadWithoutStock)

          if (stockDelta > 0) {
            await api.post('/inventory/stock-in', {
              product_id: editingProductId,
              quantity: stockDelta,
              reference: 'PRODUCT_EDIT_QUANTITY_COMPAT',
              date: buildStockInTimestamp(new Date().toISOString().slice(0, 10))
            })
          } else if (stockDelta < 0) {
            await api.post('/inventory/stock-out/adjust', {
              product_id: editingProductId,
              quantity: Math.abs(stockDelta),
              reason: 'Quantity adjusted from Product Management'
            })
          }
        }

        showMsg('Product updated')
        await fetchAll()
      } else {
        const createResponse = await api.post('/products', payload)
        const gradeLabel = payload.condition_grade === 'premium'
          ? 'Premium'
          : payload.condition_grade === 'standard'
            ? 'Standard'
            : null

        if (createResponse?.data?.merged) {
          const adjustedQuantity = Number(createResponse?.data?.adjusted_quantity || 0)
          const sourceLabel = gradeLabel ? `${gradeLabel} product` : 'Product'
          const quantitySuffix = adjustedQuantity > 0 ? ` (+${adjustedQuantity})` : ''
          showMsg(`${sourceLabel} quantity adjusted for similar existing product${quantitySuffix}.`)
        } else {
          showMsg(gradeLabel ? `${gradeLabel} product created successfully.` : 'Product created')
        }

        await Promise.all([
          fetchAll(),
          fetchBaleStockOptions(),
          fetchStockInRecords()
        ])
      }

      setProductForm(createEmptyProductForm())
      setCategorySearch('')
      setCategoryTypeOptions([])
      setCategoryTypeCategoryId('')
      setEditingProduct(null)
      setShowProductModal(false)
    } catch (err) { setError(err?.response?.data?.error || 'Save product failed') }
  }

  const startEditProduct = (p) => {
    setEditingProduct(p.id)
    setProductForm({
      sku: p.sku || '', name: p.name || '', brand: p.brand || '', description: p.description || '',
      category_id: p.category_id || '', price: p.price || '',
      subcategory: p.subcategory || '',
      stock_quantity: String(p.stock_quantity ?? 0), low_stock_threshold: p.low_stock_threshold || '10',
      size: p.size || '',
      barcode: p.barcode || '',
      product_source: p.product_source || (Number(p.bale_purchase_id || 0) > 0 ? 'bale_breakdown' : 'manual'),
      source_breakdown_id: p.source_breakdown_id || '',
      bale_purchase_id: p.bale_purchase_id ? String(p.bale_purchase_id) : '',
      condition_grade: String(p.condition_grade || '').trim().toLowerCase() || 'premium'
    })
    setCategorySearch(p.category || '')
    setShowProductModal(true)
  }

  const deleteProduct = async (id) => {
    if (!confirm('Delete this product?')) return
    clearMessages()
    try {
      await api.delete(`/products/${id}`)
      showMsg('Product deleted')
      fetchAll()
    } catch (err) { setError(err?.response?.data?.error || 'Delete failed') }
  }

  // ── Select helper ──
  const activeProducts = products.filter((p) => Number(p?.is_active ?? 1) !== 0)
  const listedProducts = activeProducts
  const manualStockInProducts = activeProducts.filter((p) => productSourceKey(p) === 'manual')
  const barcodeReadyProducts = activeProducts.filter((p) => normalizeScanCode(p.barcode))
  const productOptions = products.map(p =>
    React.createElement('option', { key: p.id, value: p.id }, `${p.sku ? p.sku + ' — ' : ''}${p.name} (Stock: ${p.stock_quantity})`)
  )
  const stockInProductOptions = manualStockInProducts.map(p =>
    React.createElement('option', { key: `stock-in-${p.id}`, value: p.id }, `${p.sku ? p.sku + ' — ' : ''}${p.name} (Stock: ${p.stock_quantity})`)
  )
  const barcodeProductOptions = barcodeReadyProducts.map((p) =>
    React.createElement('option', { key: `barcode-${p.id}`, value: p.id }, `${p.sku ? `${p.sku} - ` : ''}${p.name} (${normalizeScanCode(p.barcode)})`)
  )
  const employeeOptions = employees.map(e =>
    React.createElement('option', { key: e.id, value: e.id }, e.name)
  )

  // ── Tabs ──
  const resolvedLabelRows = buildLabelRows()
  const totalLabelCopies = resolvedLabelRows.reduce((sum, row) => sum + (Number(row.copies) || 0), 0)
  const baleOptionByPurchaseId = useMemo(() => {
    const nextMap = new Map()
    for (const row of baleStockOptions || []) {
      nextMap.set(String(row.bale_purchase_id), row)
    }
    return nextMap
  }, [baleStockOptions])
  const productSearchText = String(productSearchQuery || '').trim()
  const searchedProducts = useMemo(() => (
    listedProducts.filter((product) => {
      const linkedBaleOption = Number(product?.bale_purchase_id || 0) > 0
        ? baleOptionByPurchaseId.get(String(product.bale_purchase_id))
        : null
      return productSearchMatches(product, linkedBaleOption, productSearchText)
    })
  ), [baleOptionByPurchaseId, listedProducts, productSearchText])
  const selectedBaleStockOption = useMemo(() => (
    baleStockOptions.find((row) => String(row.bale_purchase_id) === String(selectedBaleStockOptionId)) || null
  ), [baleStockOptions, selectedBaleStockOptionId])
  const selectedBaleStockCategory = String(selectedBaleStockOption?.bale_category || '').trim()
  const selectedBaleListedProducts = useMemo(() => (
    !selectedBaleStockOption
      ? []
      : listedProducts.filter((product) => String(product?.bale_purchase_id || '') === String(selectedBaleStockOptionId))
  ), [listedProducts, selectedBaleStockOption, selectedBaleStockOptionId])
  const selectedBaleReadyUnits = useMemo(() => (
    selectedBaleListedProducts.reduce((total, product) => {
      const stockQuantity = Number(product?.stock_quantity || 0)
      if (!Number.isFinite(stockQuantity) || stockQuantity <= 0) return total
      return total + Math.floor(stockQuantity)
    }, 0)
  ), [selectedBaleListedProducts])
  const baleStockSummary = useMemo(() => {
    return (baleStockOptions || []).reduce((acc, row) => {
      acc.breakdownRecords += 1
      acc.leftToStockIn += Number(row.left_to_stock_in ?? row.pending_total ?? 0)
      acc.readyForProductManagement += Number(row.ready_for_product_management ?? row.stocked_total ?? 0)
      const saleableTotal = row.saleable_total ?? (Number(row.premium_total || 0) + Number(row.standard_total || 0))
      acc.saleableTotal += Number(saleableTotal || 0)
      return acc
    }, {
      breakdownRecords: 0,
      leftToStockIn: 0,
      readyForProductManagement: 0,
      saleableTotal: 0
    })
  }, [baleStockOptions])
  const selectedBalePremiumTotal = Number(selectedBaleStockOption?.premium_total ?? 0)
  const selectedBaleStandardTotal = Number(selectedBaleStockOption?.standard_total ?? 0)
  const selectedBaleTotalItems = Number(
    selectedBaleStockOption?.saleable_total
      ?? (selectedBalePremiumTotal + selectedBaleStandardTotal)
  )
  const selectedBaleLeftToStockIn = Number(selectedBaleStockOption?.left_to_stock_in ?? selectedBaleStockOption?.pending_total ?? 0)
  const selectedBaleReadyForProductManagement = selectedBaleStockOption
    ? selectedBaleReadyUnits
    : 0
  const selectedBalePendingPremium = Number(
    selectedBaleStockOption?.pending_premium
      ?? Math.max(Number(selectedBaleStockOption?.premium_total || 0) - Number(selectedBaleStockOption?.premium_stocked || 0), 0)
  )
  const selectedBalePendingStandard = Number(
    selectedBaleStockOption?.pending_standard
      ?? Math.max(Number(selectedBaleStockOption?.standard_total || 0) - Number(selectedBaleStockOption?.standard_stocked || 0), 0)
  )
  const selectedBalePendingTotal = selectedBalePendingPremium + selectedBalePendingStandard
  const selectedBaleDamagedItems = Number(selectedBaleStockOption?.damaged_items ?? 0)
  const currentProductsListedCount = listedProducts.length
  const currentProductsInStockCount = listedProducts.filter((product) => Number(product?.stock_quantity || 0) > 0).length
  const currentBaleLinkedProductsCount = listedProducts.filter((product) => productSourceKey(product) === 'bale_breakdown').length
  const currentIndividualProductsCount = listedProducts.filter((product) => productSourceKey(product) !== 'bale_breakdown').length
  const damagedRepairableRecordCount = damaged.filter((record) => Number(record?.remaining_quantity ?? record?.quantity ?? 0) > 0).length
  const damagedFullyRepairedCount = damaged.filter((record) => Number(record?.remaining_quantity ?? record?.quantity ?? 0) <= 0).length
  const damagedRemainingUnitCount = damaged.reduce((total, record) => total + Number(record?.remaining_quantity ?? record?.quantity ?? 0), 0)
  const repairFormSourceType = String(repairForm.damage_source_type || inferDamagedSourceType(repairForm)).trim().toLowerCase()
  const repairFormSourceId = Number(repairForm.damage_source_id || inferDamagedSourceId(repairForm, repairFormSourceType))
  const repairFormRecordSelected = Boolean(repairFormSourceType) && Number.isInteger(repairFormSourceId) && repairFormSourceId > 0
  const repairFormRemainingQuantity = Number(repairForm.remaining_quantity || 0)
  const filteredRepairCategories = useMemo(() => {
    const normalizedSearch = String(repairCategorySearch || '').trim().toLowerCase()
    return categories.filter((category) => !normalizedSearch || String(category?.name || '').toLowerCase().includes(normalizedSearch))
  }, [categories, repairCategorySearch])
  const isCreateBaleSource = !editingProduct && String(productForm.product_source || 'manual').toLowerCase() === 'bale_breakdown'
  const isEditingBaleProduct = Boolean(editingProduct) && String(productForm.product_source || 'manual').toLowerCase() === 'bale_breakdown'
  const isEditingRepairedProduct = Boolean(editingProduct) && String(productForm.product_source || 'manual').toLowerCase() === 'repaired_damage'
  const isSystemManagedProductQuantity = isEditingBaleProduct || isEditingRepairedProduct
  const productFormBaleOption = useMemo(() => (
    baleStockOptions.find((row) => String(row.bale_purchase_id) === String(productForm.bale_purchase_id || '')) || null
  ), [baleStockOptions, productForm.bale_purchase_id])
  const productFormPendingPremium = Number(productFormBaleOption?.pending_premium ?? 0)
  const productFormPendingStandard = Number(productFormBaleOption?.pending_standard ?? 0)
  const productFormSelectedGrade = String(productForm.condition_grade || '').trim().toLowerCase() === 'standard'
    ? 'standard'
    : 'premium'
  const productFormAvailableForSelectedGrade = productFormSelectedGrade === 'premium'
    ? productFormPendingPremium
    : productFormPendingStandard
  const categoryTypeOptionsMatchSelectedCategory = String(categoryTypeCategoryId || '') === String(productForm.category_id || '')
  const selectedProductCategoryHasTypes = categoryTypeOptionsMatchSelectedCategory && categoryTypeOptions.length > 0
  const isBaleCategorySyncedProduct = isCreateBaleSource || isEditingBaleProduct
  const previewQueuedQr = () => {
    const preferredProductId = Number(labelProductId) || Number(resolvedLabelRows[0]?.product_id)
    const product = products.find((item) => Number(item.id) === preferredProductId)
    if (!product) return setError('Select or queue a product first')
    openQrPreview(product)
  }
  const downloadQueuedQrPdf = () => {
    const rows = buildLabelRows()
    if (!rows.length) return setError('Add at least one product to export QR PDF')

    const expanded = rows.flatMap((row) => Array.from({ length: Math.max(Number(row.copies) || 0, 1) }, () => row))
    exportQrPdf(expanded, 'qr-labels')
  }
  const sendQueuedQrToPos = () => {
    const preferredProductId = Number(labelProductId) || Number(resolvedLabelRows[0]?.product_id)
    const product = products.find((item) => Number(item.id) === preferredProductId)
    if (!product) return setError('Select or queue a product first')
    sendProductToPos(product)
  }

  // Dynamic tab labels
  const tabLabels = {
    'overview': { title: 'Inventory Overview', subtitle: 'View summary, stock levels, and key metrics.' },
    'stock-in': { title: 'Stock In', subtitle: 'Review bale availability and stock in each item with full product details. Damaged items from a bale are auto-transferred to the Damaged tab.' },
    'stock-out': { title: 'Stock Out', subtitle: 'Record adjustments, shrinkage, and damage.' },
    'products': { title: 'Product Management', subtitle: 'Create, edit, and manage sellable products, including received repaired items.' },
    'barcode-labels': { title: 'Barcode Labels', subtitle: 'Print barcodes and QR labels for products.' },
    'transactions': { title: 'Inventory Transactions', subtitle: 'View sales, returns, stock in, stock out, and adjustments.' },
    'damaged': { title: 'Damaged Items', subtitle: 'Track damage recorded from manual stock-out, sales returns, and bale breakdown data, then receive repaired items back into Product Management.' },
    'low-stock': { title: 'Low Stock Alerts', subtitle: 'Monitor products below threshold quantity.' },
    'shrinkage': { title: 'Shrinkage Report', subtitle: 'Losses from theft, errors, or unexplained causes.' },
    'reports': { title: 'Inventory Reports', subtitle: 'Analytics and detailed inventory reports.' }
  }
  const currentLabel = tabLabels[tab] || tabLabels['overview']
  const inventoryReportProducts = Array.isArray(summary?.products) ? summary.products : []
  const overviewProducts = Array.isArray(summary?.products) ? summary.products : products
  const overviewStockHealth = useMemo(() => {
    return overviewProducts.reduce((acc, product) => {
      const stockQuantity = Number(product?.stock_quantity || 0)
      const lowStockThreshold = Number(product?.low_stock_threshold || 0)

      if (stockQuantity <= 0) {
        acc.outOfStock += 1
      } else if (stockQuantity <= lowStockThreshold) {
        acc.lowStock += 1
      } else {
        acc.healthy += 1
      }

      return acc
    }, {
      healthy: 0,
      lowStock: 0,
      outOfStock: 0
    })
  }, [overviewProducts])
  const overviewSourceSummary = useMemo(() => {
    return overviewProducts.reduce((acc, product) => {
      if (isBaleGeneratedProduct(product)) {
        acc.baleLinked += 1
      } else {
        acc.manual += 1
      }
      return acc
    }, {
      manual: 0,
      baleLinked: 0
    })
  }, [overviewProducts])
  const recentOverviewTransactions = useMemo(() => {
    const resolveTransactionTime = (transaction) => {
      const parsedDate = parseInventoryDateTime(transaction?.created_at)
      return parsedDate && !Number.isNaN(parsedDate.getTime()) ? parsedDate.getTime() : 0
    }

    return [...transactions]
      .sort((left, right) => resolveTransactionTime(right) - resolveTransactionTime(left))
      .slice(0, 5)
  }, [transactions])
  const inventoryReportSearchText = String(inventoryReportSearchQuery || '').trim()
  const filteredInventoryReportProducts = useMemo(() => {
    let filtered = inventoryReportProducts.filter((product) => inventoryReportSearchMatches(product, inventoryReportSearchText))
    if (inventoryReportActiveFilter === 'low-stock') {
      filtered = filtered.filter((p) => Number(p.stock_quantity || 0) <= Number(p.low_stock_threshold || 0))
    } else if (inventoryReportActiveFilter === 'bale') {
      filtered = filtered.filter((p) => productSourceKey(p) === 'bale_breakdown')
    } else if (inventoryReportActiveFilter === 'repaired') {
      filtered = filtered.filter((p) => productSourceKey(p) === 'repaired_damage')
    } else if (inventoryReportActiveFilter === 'direct') {
      filtered = filtered.filter((p) => productSourceKey(p) === 'manual')
    }
    return filtered
  }, [inventoryReportProducts, inventoryReportSearchText, inventoryReportActiveFilter])
  const searchedTransactions = useMemo(() => (
    transactions.filter((row) => transactionSearchMatches(row, transactionSearchText))
  ), [transactions, transactionSearchText])
  const transactionSummary = useMemo(() => {
    return searchedTransactions.reduce((acc, row) => {
      const quantity = Number(row?.quantity) || 0
      const legacySaleLinkInReason = !String(row?.reference || '').trim() && /^SALE_LINK[:|]/.test(String(row?.reason || '').trim())
      const resolvedReference = legacySaleLinkInReason ? row.reason : row.reference
      const parsedRef = parseReferenceMeta(resolvedReference)
      const parsedReason = parseStockOutReason(row?.reason)
      const disposition = String(parsedRef?.meta?.disposition || parsedReason?.type || '').trim().toUpperCase()

      acc.rows += 1
      if (quantity > 0) acc.unitsIn += quantity
      if (quantity < 0) acc.unitsOut += Math.abs(quantity)
      if (disposition === 'SHRINKAGE') acc.shrinkageRows += 1
      return acc
    }, {
      rows: 0,
      unitsIn: 0,
      unitsOut: 0,
      shrinkageRows: 0
    })
  }, [searchedTransactions])
  const shrinkageSummary = useMemo(() => {
    return shrinkage.reduce((acc, row) => {
      const totalShrinkage = Number(row?.total_shrinkage) || 0
      const incidents = Number(row?.incidents) || 0
      const label = String(row?.product_name || row?.sku || 'Unassigned item').trim() || 'Unassigned item'

      acc.products += 1
      acc.totalLoss += totalShrinkage
      acc.incidents += incidents

      if (!acc.largestItem || totalShrinkage > acc.largestItem.totalLoss) {
        acc.largestItem = {
          label,
          totalLoss: totalShrinkage
        }
      }

      return acc
    }, {
      products: 0,
      totalLoss: 0,
      incidents: 0,
      largestItem: null
    })
  }, [shrinkage])

  const TRANSACTIONS_PAGE_SIZE = 25
  const transactionsTotalPages = Math.max(1, Math.ceil(searchedTransactions.length / TRANSACTIONS_PAGE_SIZE))
  const pagedTransactions = useMemo(() =>
    searchedTransactions.slice((transactionsPage - 1) * TRANSACTIONS_PAGE_SIZE, transactionsPage * TRANSACTIONS_PAGE_SIZE)
  , [searchedTransactions, transactionsPage])

  const SHRINKAGE_PAGE_SIZE = 20
  const shrinkageSearchText = String(shrinkageSearchQuery || '').trim().toLowerCase()
  const filteredShrinkage = useMemo(() => {
    if (!shrinkageSearchText) return shrinkage
    return shrinkage.filter(s =>
      (s.product_name || '').toLowerCase().includes(shrinkageSearchText) ||
      (s.sku || '').toLowerCase().includes(shrinkageSearchText)
    )
  }, [shrinkage, shrinkageSearchText])
  const shrinkageTotalPages = Math.max(1, Math.ceil(filteredShrinkage.length / SHRINKAGE_PAGE_SIZE))
  const pagedShrinkage = useMemo(() =>
    filteredShrinkage.slice((shrinkagePage - 1) * SHRINKAGE_PAGE_SIZE, shrinkagePage * SHRINKAGE_PAGE_SIZE)
  , [filteredShrinkage, shrinkagePage])

  const editingProductRow = products.find((p) => Number(p.id) === Number(editingProduct)) || null
  const editingProductSourceText = editingProductRow
    ? productSourceLabel(editingProductRow)
    : productSourceLabel(productForm)

  return React.createElement('div', { className: 'page' },
    React.createElement('div', { className: 'page-header' },
      React.createElement('div', null,
        React.createElement('h1', { className: 'page-title' }, currentLabel.title),
        React.createElement('p', { className: 'page-subtitle' }, currentLabel.subtitle)
      )
    ),

    // Messages
    error && React.createElement('div', { className: 'error-msg', style: { marginBottom: 16 } }, error),
    success && React.createElement('div', { style: { background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#15803d', padding: '10px 14px', borderRadius: 6, marginBottom: 16, fontSize: '13.5px' } }, success),

    loading && React.createElement('div', null, 'Loading...'),

    // ═══════════════ OVERVIEW ═══════════════
    tab === 'overview' && React.createElement('div', null,
      summary && React.createElement('div', { className: 'dashboard-grid' },
        React.createElement('div', { className: 'card' },
          React.createElement('div', { className: 'card-title' }, 'Total Products'),
          React.createElement('div', { className: 'card-value' }, summary.products?.length || 0)
        ),
        React.createElement('div', { className: 'card' },
          React.createElement('div', { className: 'card-title' }, 'Total Items in Stock'),
          React.createElement('div', { className: 'card-value' }, (summary.totalItems || 0).toLocaleString())
        ),
        React.createElement('div', { className: 'card' },
          React.createElement('div', { className: 'card-title' }, 'Stock Value'),
          React.createElement('div', { className: 'card-value-sm' }, fmt(summary.totalValue))
        ),
        React.createElement('div', { className: 'card' },
          React.createElement('div', { className: 'card-title' }, 'Low Stock Items'),
          React.createElement('div', { className: 'card-value', style: { color: summary.lowStockCount > 0 ? 'var(--error)' : 'var(--success)' } }, summary.lowStockCount || 0)
        )
      ),
      React.createElement('div', {
        style: {
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          gap: 16,
          marginTop: 20
        }
      },
        React.createElement('div', { className: 'card', style: { margin: 0 } },
          React.createElement('h3', { style: { marginBottom: 14 } }, 'Stock Health'),
          React.createElement('div', { style: { display: 'grid', gap: 10 } },
            [
              { label: 'Healthy stock', value: overviewStockHealth.healthy, color: 'var(--success)' },
              { label: 'Low stock', value: overviewStockHealth.lowStock, color: 'var(--error)' },
              { label: 'Out of stock', value: overviewStockHealth.outOfStock, color: 'var(--text-light)' }
            ].map((row) => React.createElement('div', {
              key: `overview-health-${row.label}`,
              style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }
            },
              React.createElement('span', { style: { color: 'var(--text-light)' } }, row.label),
              React.createElement('strong', { style: { color: row.color, fontSize: 18 } }, row.value)
            ))
          )
        ),
        React.createElement('div', { className: 'card', style: { margin: 0 } },
          React.createElement('h3', { style: { marginBottom: 14 } }, 'Inventory Source'),
          React.createElement('div', { style: { display: 'grid', gap: 10 } },
            [
              { label: 'Manual products', value: overviewSourceSummary.manual },
              { label: 'Bale-linked products', value: overviewSourceSummary.baleLinked }
            ].map((row) => React.createElement('div', {
              key: `overview-source-${row.label}`,
              style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }
            },
              React.createElement('span', { style: { color: 'var(--text-light)' } }, row.label),
              React.createElement('strong', { style: { fontSize: 18 } }, row.value)
            ))
          )
        )
      ),
      React.createElement('div', {
        style: {
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 16,
          marginTop: 20
        }
      },
        React.createElement('div', { className: 'card', style: { margin: 0 } },
          React.createElement('h3', { style: { marginBottom: 12 } }, 'Recent Inventory Activity'),
          recentOverviewTransactions.length === 0
            ? React.createElement('p', { style: { color: 'var(--text-light)', margin: 0 } }, 'No recent inventory activity.')
            : React.createElement('div', { className: 'table-wrap' },
                React.createElement('table', null,
                  React.createElement('thead', null,
                    React.createElement('tr', null,
                      React.createElement('th', null, 'Type'),
                      React.createElement('th', null, 'Item'),
                      React.createElement('th', null, 'Qty'),
                      React.createElement('th', null, 'Date')
                    )
                  ),
                  React.createElement('tbody', null,
                    recentOverviewTransactions.map((transaction) => {
                      const legacySaleLinkInReason = !String(transaction.reference || '').trim() && /^SALE_LINK[:|]/.test(String(transaction.reason || '').trim())
                      const resolvedReference = legacySaleLinkInReason ? transaction.reason : transaction.reference
                      const transactionDisplay = getPosTransactionDisplay(transaction, resolvedReference)
                      const quantity = Number(transaction.quantity) || 0
                      const dateParts = formatDateStackParts(transaction.created_at)

                      return React.createElement('tr', { key: `overview-transaction-${transaction.id}` },
                        React.createElement('td', null,
                          React.createElement('span', { className: `badge ${transactionDisplay.badgeClass}` }, transactionDisplay.label)
                        ),
                        React.createElement('td', null,
                          React.createElement('div', { style: { fontWeight: 600 } }, transaction.product_name || 'Unassigned item'),
                          React.createElement('div', { style: { color: 'var(--text-light)', fontSize: 12 } }, transaction.sku || formatPosReference(resolvedReference) || 'No reference')
                        ),
                        React.createElement('td', {
                          style: {
                            fontWeight: 700,
                            color: quantity >= 0 ? 'var(--success)' : 'var(--error)'
                          }
                        }, quantity > 0 ? `+${quantity}` : String(quantity)),
                        React.createElement('td', null,
                          React.createElement('div', null, dateParts.date),
                          React.createElement('div', { style: { color: 'var(--text-light)', fontSize: 12 } }, dateParts.time || 'No time')
                        )
                      )
                    })
                  )
                )
              )
        )
      ),
      false && React.createElement('div', { className: 'card', style: { marginTop: 20 } },
        React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, gap: 12, flexWrap: 'wrap' } },
          React.createElement('h3', { style: { margin: 0 } }, `Stock In Records (${stockInRecords.length})`),
          React.createElement('button', { className: 'btn btn-secondary btn-sm', type: 'button', onClick: fetchStockInRecords }, 'Refresh')
        ),
        React.createElement('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 16 } },
          React.createElement('div', { className: 'form-group', style: { marginBottom: 0 } },
            React.createElement('label', { className: 'form-label' }, 'Source'),
            React.createElement('select', { className: 'form-input', value: stockInSourceFilter, onChange: (event) => setStockInSourceFilter(event.target.value) },
              React.createElement('option', { value: '' }, 'All stock-in records'),
              React.createElement('option', { value: 'manual_stock_in' }, 'Manual Stock In'),
              React.createElement('option', { value: 'bale_breakdown' }, 'Bale Breakdown')
            )
          ),
          React.createElement('div', { className: 'form-group', style: { marginBottom: 0 } },
            React.createElement('label', { className: 'form-label' }, 'From'),
            React.createElement('input', { className: 'form-input', type: 'date', value: stockInFrom, onChange: (event) => setStockInFrom(event.target.value), max: stockInTo || undefined })
          ),
          React.createElement('div', { className: 'form-group', style: { marginBottom: 0 } },
            React.createElement('label', { className: 'form-label' }, 'To'),
            React.createElement('input', { className: 'form-input', type: 'date', value: stockInTo, onChange: (event) => setStockInTo(event.target.value), min: stockInFrom || undefined })
          )
        ),
        React.createElement('div', { className: 'table-wrap' },
          React.createElement('table', null,
            React.createElement('thead', null,
              React.createElement('tr', null,
                React.createElement('th', null, 'Date'),
                React.createElement('th', null, 'Source'),
                React.createElement('th', null, 'Product'),
                React.createElement('th', null, 'Qty'),
                React.createElement('th', null, 'Reference'),
                React.createElement('th', null, 'User')
              )
            ),
            React.createElement('tbody', null,
              stockInRecords.length === 0
                ? React.createElement('tr', null, React.createElement('td', { colSpan: 6, style: { textAlign: 'center', color: 'var(--text-light)', padding: 24 } }, 'No stock-in records found for this filter.'))
                : stockInRecords.map((record) => React.createElement('tr', { key: `stock-in-record-${record.id}` },
                    React.createElement('td', null, fmtDate(record.created_at)),
                    React.createElement('td', null, record.source_label || 'Inventory'),
                    React.createElement('td', null, `${record.sku ? `${record.sku} â€” ` : ''}${record.product_name || ''}`),
                    React.createElement('td', { style: { fontWeight: 600, color: 'var(--success)' } }, `+${record.quantity}`),
                    React.createElement('td', null, formatTransactionReference(record.reference)),
                    React.createElement('td', null, record.user_name || 'â€”')
                  ))
            )
          )
        )
      )
    ),

    // ═══════════════ STOCK IN ═══════════════
    tab === 'stock-in' && React.createElement('div', null,
      React.createElement('div', { className: 'card' },
        React.createElement('h3', { style: { marginBottom: 16 } }, 'Stock In'),
        React.createElement('div', { className: 'form-group', style: { maxWidth: 280 } },
          React.createElement('label', { className: 'form-label' }, 'Stock In Mode'),
          React.createElement('select', {
            className: 'form-input',
            value: stockInMode,
            onChange: (e) => setStockInMode(e.target.value)
          },
            React.createElement('option', { value: 'bale' }, 'From Bale Record'),
            React.createElement('option', { value: 'manual' }, 'Manual Product Entry')
          )
        ),

        stockInMode === 'bale'
          ? React.createElement('div', null,
              React.createElement('div', {
                className: 'inventory-bale-selector-grid',
                style: {
                  display: 'grid',
                  gridTemplateColumns: 'minmax(260px, 560px) minmax(180px, 280px)',
                  gap: 12,
                  alignItems: 'end',
                  marginBottom: 14
                }
              },
                React.createElement('div', { className: 'form-group', style: { marginBottom: 0 } },
                  React.createElement('label', { className: 'form-label' }, 'Bale Record'),
                  React.createElement('select', {
                    className: 'form-input',
                    value: selectedBaleStockOptionId,
                    onChange: (e) => setSelectedBaleStockOptionId(e.target.value),
                    disabled: baleStockLoading,
                    required: true
                  },
                    React.createElement('option', { value: '' }, baleStockLoading ? 'Loading bale records...' : 'Choose a bale record'),
                    ...baleStockOptions.map((row) => {
                      return React.createElement('option', {
                        key: `bale-option-${row.breakdown_id}`,
                        value: row.bale_purchase_id
                      }, `${row.bale_batch_no || 'N/A'} - ${row.supplier_name || 'Unknown Supplier'}`)
                    })
                  )
                ),
                React.createElement('div', { className: 'form-group', style: { marginBottom: 0 } },
                  React.createElement('label', { className: 'form-label' }, 'Category'),
                  React.createElement('input', {
                    className: 'form-input',
                    readOnly: true,
                    value: selectedBaleStockCategory,
                    placeholder: 'Auto-filled from bale record'
                  })
                )
              ),
              React.createElement('div', {
                style: {
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                  gap: 12,
                  marginBottom: 16
                }
              },
                React.createElement('div', { className: 'form-group', style: { marginBottom: 0 } },
                  React.createElement('label', { className: 'form-label' }, 'Bale Breakdown'),
                  React.createElement('input', {
                    className: 'form-input',
                    readOnly: true,
                    value: selectedBaleStockOption
                      ? `Breakdown #${selectedBaleStockOption.breakdown_id || '-'} — ${fmtDate(selectedBaleStockOption.breakdown_date || selectedBaleStockOption.purchase_date)}`
                      : '',
                    placeholder: 'Choose a bale record to see its breakdown'
                  })
                ),
                React.createElement('div', { className: 'form-group', style: { marginBottom: 0 } },
                  React.createElement('label', { className: 'form-label' }, 'Supplier'),
                  React.createElement('input', {
                    className: 'form-input',
                    readOnly: true,
                    value: String(selectedBaleStockOption?.supplier_name || '').trim(),
                    placeholder: 'Auto-filled from bale record'
                  })
                ),
                React.createElement('div', { className: 'form-group', style: { marginBottom: 0 } },
                  React.createElement('label', { className: 'form-label' }, 'Stocked In By'),
                  React.createElement('input', {
                    className: 'form-input',
                    readOnly: true,
                    value: currentUserDisplayName,
                    title: 'The signed-in user who is performing this stock-in'
                  })
                )
              ),
              React.createElement('div', {
                style: {
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                  gap: 12,
                  marginBottom: 16
                }
              },
                React.createElement('div', { className: 'card', style: { margin: 0, padding: 14 } },
                  React.createElement('div', { className: 'card-title' }, 'Total Products Available for Stock In'),
                  React.createElement('div', { className: 'card-value' }, selectedBalePendingTotal)
                ),
                React.createElement('div', { className: 'card', style: { margin: 0, padding: 14 } },
                  React.createElement('div', { className: 'card-title' }, 'Premium Products Available for Stock In'),
                  React.createElement('div', { className: 'card-value' }, selectedBalePendingPremium)
                ),
                React.createElement('div', { className: 'card', style: { margin: 0, padding: 14 } },
                  React.createElement('div', { className: 'card-title' }, 'Standard Products Available for Stock In'),
                  React.createElement('div', { className: 'card-value' }, selectedBalePendingStandard)
                ),
                React.createElement('div', {
                  className: 'card',
                  style: {
                    margin: 0,
                    padding: 14,
                    borderLeft: '4px solid var(--error)'
                  }
                },
                  React.createElement('div', { className: 'card-title' }, 'Damaged Items (auto-transferred)'),
                  React.createElement('div', { className: 'card-value' }, selectedBaleDamagedItems),
                  React.createElement('div', {
                    style: { fontSize: 11, color: 'var(--text-light)', marginTop: 4 }
                  }, selectedBaleDamagedItems > 0
                    ? 'Already moved to the Damaged tab.'
                    : 'No damaged items recorded for this bale.')
                )
              ),
              React.createElement('div', {
                style: {
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 10,
                  flexWrap: 'wrap'
                }
              },
                React.createElement('div', { style: { color: 'var(--text-light)', fontSize: 12 } },
                  selectedBaleStockOption
                    ? `Selected batch ${selectedBaleStockOption.bale_batch_no || '-'}: Category ${selectedBaleStockCategory || '-'}, Left ${selectedBaleLeftToStockIn}, Ready ${selectedBaleReadyForProductManagement}, Breakdown date ${fmtDate(selectedBaleStockOption.breakdown_date || selectedBaleStockOption.purchase_date)}.`
                    : 'Choose a bale record from the list to start stock in.'
                ),
                React.createElement('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap' } },
                  React.createElement('button', {
                    type: 'button',
                    className: 'btn btn-primary',
                    disabled: !selectedBaleStockOptionId || selectedBaleLeftToStockIn <= 0,
                    onClick: startBaleIndividualCreate
                  }, selectedBaleLeftToStockIn <= 0 ? 'No Quantity Left' : 'Stock In Item'),
                  React.createElement('button', {
                    type: 'button',
                    className: 'btn btn-secondary',
                    onClick: fetchBaleStockOptions,
                    disabled: baleStockLoading
                  }, baleStockLoading ? 'Refreshing...' : 'Refresh List')
                )
              ),
              React.createElement('div', {
                style: {
                  marginTop: 8,
                  fontSize: 12,
                  color: 'var(--text-light)'
                }
              }, 'Stock In Item adds one bale unit to inventory with full product details. Damaged items from this bale are auto-transferred to the Damaged tab and never enter sellable stock.'),
              React.createElement('div', {
                style: {
                  marginTop: 12,
                  fontSize: 12,
                  color: 'var(--text-light)'
                }
              }, `All records: ${baleStockSummary.breakdownRecords} | Left to stock in: ${baleStockSummary.leftToStockIn} | Ready for Product Management: ${baleStockSummary.readyForProductManagement}`)
            )
          : React.createElement('form', { onSubmit: handleStockIn },
              React.createElement('div', { className: 'inventory-manual-stock-grid', style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 } },
                React.createElement('div', { className: 'form-group' },
                  React.createElement('label', { className: 'form-label' }, 'Product *'),
                  React.createElement('select', {
                    className: 'form-input',
                    value: stockInForm.product_id,
                    onChange: (e) => setStockInForm((f) => ({ ...f, product_id: e.target.value })),
                    required: true
                  },
                    React.createElement('option', { value: '' }, '— Select product —'),
                    ...stockInProductOptions
                  )
                ),
                React.createElement('div', { className: 'form-group' },
                  React.createElement('label', { className: 'form-label' }, 'Supplier'),
                  React.createElement('select', {
                    className: 'form-input',
                    value: stockInForm.supplier_id,
                    onChange: (e) => setStockInForm((f) => ({ ...f, supplier_id: e.target.value }))
                  },
                    React.createElement('option', { value: '' }, suppliers.length ? '-- Select supplier --' : 'No suppliers available'),
                    ...suppliers.map((supplier) => React.createElement('option', {
                      key: `stock-in-supplier-${supplier.id}`,
                      value: supplier.id
                    }, supplier.name))
                  )
                ),
                React.createElement('div', { className: 'form-group' },
                  React.createElement('label', { className: 'form-label' }, 'Quantity *'),
                  React.createElement('input', { className: 'form-input', type: 'number', min: 1, value: stockInForm.quantity, onChange: e => setStockInForm(f => ({ ...f, quantity: e.target.value })), required: true })
                ),
                React.createElement('div', { className: 'form-group' },
                  React.createElement('label', { className: 'form-label' }, 'Reference'),
                  React.createElement('input', { className: 'form-input', value: stockInForm.reference, onChange: e => setStockInForm(f => ({ ...f, reference: e.target.value })), placeholder: 'Optional note / receipt no.' })
                ),
                React.createElement('div', { className: 'form-group' },
                  React.createElement('label', { className: 'form-label' }, 'Date'),
                  React.createElement('input', { className: 'form-input', type: 'date', value: stockInForm.date, onChange: e => setStockInForm(f => ({ ...f, date: e.target.value })) })
                )
              ),
              React.createElement('button', { type: 'submit', className: 'btn btn-primary', style: { marginTop: 12 } }, 'Record Stock In')
            )
      )
    ),

    // ═══════════════ STOCK OUT ═══════════════
    tab === 'stock-out' && React.createElement('div', { className: 'inv-stockout-grid' },
      React.createElement('div', { className: 'card' },
        React.createElement('h3', { style: { marginBottom: 16 } }, 'Net Adjustment (Shrinkage/Lost)'),
        React.createElement('form', { onSubmit: handleAdjust },
          React.createElement('div', { className: 'form-group' },
            React.createElement('label', { className: 'form-label' }, 'Scan Barcode'),
            React.createElement('input', {
              className: 'form-input',
              value: adjustBarcode,
              onChange: (e) => setAdjustBarcode(e.target.value),
              onKeyDown: (e) => {
                if (e.key !== 'Enter') return
                e.preventDefault()
                handleFormBarcodeScan(e.currentTarget.value, setAdjustBarcode, setAdjustForm)
              },
              placeholder: 'Scan barcode then press Enter'
            })
          ),
          React.createElement('div', { className: 'form-group' },
            React.createElement('label', { className: 'form-label' }, 'Product *'),
            React.createElement('select', {
              className: 'form-input',
              value: adjustForm.product_id,
              onChange: (e) => {
                const nextProductId = e.target.value
                setAdjustForm((f) => ({ ...f, product_id: nextProductId }))
                const selected = products.find((p) => String(p.id) === String(nextProductId))
                setAdjustBarcode(selected?.barcode || '')
              },
              required: true
            },
              React.createElement('option', { value: '' }, '— Select product —'),
              ...productOptions
            )
          ),
          React.createElement('div', { className: 'form-group' },
            React.createElement('label', { className: 'form-label' }, 'Quantity to Remove *'),
            React.createElement('input', { className: 'form-input', type: 'number', min: 1, value: adjustForm.quantity, onChange: e => setAdjustForm(f => ({ ...f, quantity: e.target.value })), required: true })
          ),
          React.createElement('div', { className: 'form-group' },
            React.createElement('label', { className: 'form-label' }, 'Reason'),
            React.createElement('input', { className: 'form-input', value: adjustForm.reason, onChange: e => setAdjustForm(f => ({ ...f, reason: e.target.value })), placeholder: 'Lost, shrinkage, manual correction...' })
          ),
          React.createElement('div', { className: 'form-group' },
            React.createElement('label', { className: 'form-label' }, 'Employee Responsible'),
            React.createElement('select', { className: 'form-input', value: adjustForm.employee_id, onChange: e => setAdjustForm(f => ({ ...f, employee_id: e.target.value })) },
              React.createElement('option', { value: '' }, '— Select employee —'),
              ...employeeOptions
            )
          ),
          React.createElement('button', { type: 'submit', className: 'btn btn-primary' }, 'Record Adjustment')
        )
      ),
      React.createElement('div', { className: 'card' },
        React.createElement('h3', { style: { marginBottom: 16 } }, 'Record Damage'),
        React.createElement('form', { onSubmit: handleDamage },
          React.createElement('div', { className: 'form-group' },
            React.createElement('label', { className: 'form-label' }, 'Scan Barcode'),
            React.createElement('input', {
              className: 'form-input',
              value: damageBarcode,
              onChange: (e) => setDamageBarcode(e.target.value),
              onKeyDown: (e) => {
                if (e.key !== 'Enter') return
                e.preventDefault()
                handleFormBarcodeScan(e.currentTarget.value, setDamageBarcode, setDamageForm)
              },
              placeholder: 'Scan barcode then press Enter'
            })
          ),
          React.createElement('div', { className: 'form-group' },
            React.createElement('label', { className: 'form-label' }, 'Product *'),
            React.createElement('select', {
              className: 'form-input',
              value: damageForm.product_id,
              onChange: (e) => {
                const nextProductId = e.target.value
                setDamageForm((f) => ({ ...f, product_id: nextProductId }))
                const selected = products.find((p) => String(p.id) === String(nextProductId))
                setDamageBarcode(selected?.barcode || '')
              },
              required: true
            },
              React.createElement('option', { value: '' }, '— Select product —'),
              ...productOptions
            )
          ),
          React.createElement('div', { className: 'form-group' },
            React.createElement('label', { className: 'form-label' }, 'Quantity *'),
            React.createElement('input', { className: 'form-input', type: 'number', min: 1, value: damageForm.quantity, onChange: e => setDamageForm(f => ({ ...f, quantity: e.target.value })), required: true })
          ),
          React.createElement('div', { className: 'form-group' },
            React.createElement('label', { className: 'form-label' }, 'Reason'),
            React.createElement('input', { className: 'form-input', value: damageForm.reason, onChange: e => setDamageForm(f => ({ ...f, reason: e.target.value })), placeholder: 'Defective, broken, unsellable...' })
          ),
          React.createElement('div', { className: 'form-group' },
            React.createElement('label', { className: 'form-label' }, 'Employee Responsible'),
            React.createElement('select', { className: 'form-input', value: damageForm.employee_id, onChange: e => setDamageForm(f => ({ ...f, employee_id: e.target.value })) },
              React.createElement('option', { value: '' }, '— Select employee —'),
              ...employeeOptions
            )
          ),
          React.createElement('button', { type: 'submit', className: 'btn btn-danger' }, 'Record Damage')
        )
      )
    ),

    // ═══════════════ PRODUCTS ═══════════════
    tab === 'products' && React.createElement('div', { className: 'inventory-products-view' },
      React.createElement('div', {
        className: 'inventory-products-summary',
        style: {
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: 16,
          marginBottom: 18
        }
      },
        React.createElement('div', { className: 'card inventory-products-summary-card', style: { margin: 0, padding: 14 } },
          React.createElement('div', { className: 'card-title' }, selectedBaleStockOption ? 'All Total Items (Selected Bale)' : 'Current Products Listed'),
          React.createElement('div', { className: 'card-value' }, selectedBaleStockOption ? selectedBaleTotalItems : currentProductsListedCount)
        ),
        React.createElement('div', { className: 'card inventory-products-summary-card', style: { margin: 0, padding: 14 } },
          React.createElement('div', { className: 'card-title' }, selectedBaleStockOption ? 'Premium Items Remaining (Selected Bale)' : 'Products In Stock'),
          React.createElement('div', { className: 'card-value' }, selectedBaleStockOption ? selectedBalePendingPremium : currentProductsInStockCount)
        ),
        React.createElement('div', { className: 'card inventory-products-summary-card', style: { margin: 0, padding: 14 } },
          React.createElement('div', { className: 'card-title' }, selectedBaleStockOption ? 'Standard Items Remaining (Selected Bale)' : 'Bale-Linked Products'),
          React.createElement('div', { className: 'card-value' }, selectedBaleStockOption ? selectedBalePendingStandard : currentBaleLinkedProductsCount)
        ),
        React.createElement('div', { className: 'card inventory-products-summary-card', style: { margin: 0, padding: 14 } },
          React.createElement('div', { className: 'card-title' }, selectedBaleStockOption ? 'Current Products Available (Selected Bale)' : 'Individual Products'),
          React.createElement('div', { className: 'card-value' }, selectedBaleStockOption ? selectedBaleReadyForProductManagement : currentIndividualProductsCount)
        )
      ),
      React.createElement('div', {
        className: 'inventory-products-summary-note',
        style: {
          marginBottom: 18,
          color: 'var(--text-light)',
          fontSize: 12,
          lineHeight: 1.6
        }
      },
        selectedBaleStockOption
          ? `Selected bale ${selectedBaleStockOption.bale_batch_no || '-'}: Total items ${selectedBaleTotalItems}, Premium remaining ${selectedBalePendingPremium} of ${selectedBalePremiumTotal}, Standard remaining ${selectedBalePendingStandard} of ${selectedBaleStandardTotal}, Current products available ${selectedBaleReadyForProductManagement}. The table below shows all active products.`
          : `No bale selected. Current products listed: ${currentProductsListedCount}. In-stock products: ${currentProductsInStockCount}. Bale-linked products: ${currentBaleLinkedProductsCount}. Individual products: ${currentIndividualProductsCount}, including repaired items received from Damaged.`
      ),
      React.createElement('div', {
        className: 'inventory-products-toolbar',
        style: {
          display: 'flex',
          gap: 12,
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 16,
          flexWrap: 'wrap'
        }
      },
        React.createElement('div', {
          className: 'inventory-products-search',
          style: { flex: '1 1 360px', maxWidth: 620 }
        },
          React.createElement('label', { className: 'form-label', htmlFor: 'product-management-search' }, 'Search Products'),
          React.createElement('div', { style: { display: 'flex', gap: 8 } },
            React.createElement('input', {
              id: 'product-management-search',
              className: 'form-input',
              type: 'search',
              value: productSearchQuery,
              onChange: (event) => setProductSearchQuery(event.target.value),
              placeholder: 'Search reference, category, name, or barcode',
              autoComplete: 'off',
              style: { minWidth: 260 }
            }),
            productSearchText && React.createElement('button', {
              type: 'button',
              className: 'btn btn-secondary',
              onClick: () => setProductSearchQuery('')
            }, 'Clear')
          )
        ),
        React.createElement('button', { className: 'btn btn-primary inventory-create-product-btn', onClick: () => openCreateProductModal() }, '+ Create Product')
      ),

      showProductModal && React.createElement('div', { className: 'card inventory-product-editor', style: { marginBottom: 20 } },
        React.createElement('h3', { className: 'inventory-product-editor-title', style: { marginBottom: 12 } }, editingProduct ? 'Edit Product' : 'Create Product'),
        React.createElement('form', { className: 'inventory-product-form', onSubmit: handleSaveProduct },
          React.createElement('div', { className: 'inventory-product-form-grid', style: { display: 'grid', gap: 12 } },
            React.createElement('div', { className: 'form-group' },
              React.createElement('label', { className: 'form-label' }, 'Stock Source'),
              editingProduct
                ? React.createElement('input', {
                    className: 'form-input',
                    value: productSourceLabel(productForm),
                    disabled: true,
                    readOnly: true
                  })
                : React.createElement('select', {
                    className: 'form-input',
                    value: productForm.product_source,
                    onChange: (e) => {
                      const nextSource = e.target.value === 'bale_breakdown' ? 'bale_breakdown' : 'manual'
                      const nextBalePurchaseId = nextSource === 'bale_breakdown'
                        ? (productForm.bale_purchase_id || String(selectedBaleStockOptionId || ''))
                        : ''
                      const selectedBale = baleStockOptions.find((row) => String(row.bale_purchase_id) === String(nextBalePurchaseId))
                      const baleCategory = String(selectedBale?.bale_category || '').trim()
                      if (nextSource === 'bale_breakdown' && baleCategory) setCategorySearch('')
                      if (nextSource !== 'bale_breakdown') setCategoryDropdownOpen(false)
                      setProductForm((form) => ({
                        ...form,
                        product_source: nextSource,
                        supplier_id: nextSource === 'manual' ? form.supplier_id : '',
                        bale_purchase_id: nextBalePurchaseId,
                        category_id: nextSource === 'bale_breakdown' ? '' : form.category_id,
                        subcategory: nextSource === 'bale_breakdown' ? '' : form.subcategory,
                        condition_grade: nextSource === 'bale_breakdown'
                          ? (String(form.condition_grade || '').trim().toLowerCase() === 'standard' ? 'standard' : 'premium')
                          : 'premium'
                      }))
                      if (nextSource === 'bale_breakdown' && nextBalePurchaseId) applyBaleCategoryToProductForm(nextBalePurchaseId).catch(() => {})
                    }
                  },
                    React.createElement('option', { value: 'manual' }, 'Manual'),
                    React.createElement('option', { value: 'bale_breakdown' }, 'From Bale Record')
                  )
            ),
            !editingProduct && !isCreateBaleSource && React.createElement('div', { className: 'form-group' },
              React.createElement('label', { className: 'form-label' }, 'Supplier'),
              React.createElement('select', {
                className: 'form-input',
                value: productForm.supplier_id || '',
                onChange: (e) => setProductForm((form) => ({ ...form, supplier_id: e.target.value })),
                disabled: suppliers.length === 0
              },
                React.createElement('option', { value: '' }, suppliers.length ? '-- Select supplier --' : 'No suppliers available'),
                ...suppliers.map((supplier) => React.createElement('option', {
                  key: `product-manual-supplier-${supplier.id}`,
                  value: supplier.id
                }, supplier.name))
              )
            ),
            (isCreateBaleSource || isEditingBaleProduct) && React.createElement('div', { className: 'form-group' },
              React.createElement('label', { className: 'form-label' }, 'Bale Record *'),
              isEditingBaleProduct
                ? React.createElement('input', {
                    className: 'form-input',
                    value: productFormBaleOption
                      ? `${productFormBaleOption.bale_batch_no || 'N/A'} - ${productFormBaleOption.supplier_name || 'Unknown Supplier'}`
                      : `Bale #${productForm.bale_purchase_id || 'N/A'}`,
                    disabled: true,
                    readOnly: true
                  })
                : React.createElement('select', {
                    className: 'form-input',
                    value: productForm.bale_purchase_id,
                    onChange: (e) => {
                      const nextBalePurchaseId = String(e.target.value || '')
                      const selectedBale = baleStockOptions.find((row) => String(row.bale_purchase_id) === nextBalePurchaseId)
                      const baleCategory = String(selectedBale?.bale_category || '').trim()
                      if (baleCategory) setCategorySearch('')
                      if (!nextBalePurchaseId) setCategorySearch('')
                      setProductForm((form) => ({
                        ...form,
                        bale_purchase_id: nextBalePurchaseId,
                        category_id: '',
                        subcategory: ''
                      }))
                      setSelectedBaleStockOptionId(nextBalePurchaseId)
                      if (nextBalePurchaseId) applyBaleCategoryToProductForm(nextBalePurchaseId).catch(() => {})
                    },
                    required: true,
                    disabled: baleStockLoading
                  },
                    React.createElement('option', { value: '' }, baleStockLoading ? 'Loading bale records...' : 'Choose a bale record'),
                    ...baleStockOptions.map((row) => (
                      React.createElement('option', {
                        key: `modal-bale-option-${row.breakdown_id}`,
                        value: row.bale_purchase_id
                      }, `${row.bale_batch_no || 'N/A'} - ${row.supplier_name || 'Unknown Supplier'}`)
                    ))
                  )
            ),
            (isCreateBaleSource || isEditingBaleProduct) && React.createElement('div', { className: 'form-group' },
              React.createElement('label', { className: 'form-label' }, 'Bale Grade *'),
              isEditingBaleProduct
                ? React.createElement('input', {
                    className: 'form-input',
                    value: productFormSelectedGrade === 'premium' ? 'Premium' : 'Standard',
                    disabled: true,
                    readOnly: true
                  })
                : React.createElement('select', {
                    className: 'form-input',
                    value: productFormSelectedGrade,
                    onChange: (e) => setProductForm((form) => ({ ...form, condition_grade: e.target.value }))
                  },
                    React.createElement('option', { value: 'premium' }, 'Premium'),
                    React.createElement('option', { value: 'standard' }, 'Standard')
                  )
            ),
            React.createElement('div', { className: 'form-group' },
              React.createElement('label', { className: 'form-label' }, 'SKU', infoTip('Auto-generated unless you change it')),
              React.createElement('input', { className: 'form-input', value: productForm.sku, onChange: e => setProductForm(f => ({ ...f, sku: e.target.value })), placeholder: 'Auto-generated if left blank' })
            ),
            React.createElement('div', { className: 'form-group' },
              React.createElement('label', { className: 'form-label' }, 'Barcode', infoTip('Auto-generated unless you change it')),
              React.createElement('input', { className: 'form-input', value: productForm.barcode, onChange: e => setProductForm(f => ({ ...f, barcode: e.target.value })), placeholder: 'Scan, enter, or leave blank to auto-generate' })
            ),
            React.createElement('div', { className: 'form-group inventory-category-field', style: { position: 'relative' } },
              React.createElement('label', { className: 'form-label' }, 'Category'),
              React.createElement('input', {
                className: 'form-input',
                value: categorySearch,
                onChange: e => {
                  if (isBaleCategorySyncedProduct) return
                  const nextValue = e.target.value
                  const matchedCategory = findCategoryByName(nextValue)
                  setCategorySearch(nextValue)
                  setCategoryDropdownOpen(true)
                  setProductForm((form) => ({
                    ...form,
                    category_id: matchedCategory ? String(matchedCategory.id) : '',
                    subcategory: ''
                  }))
                },
                onFocus: () => { if (!isBaleCategorySyncedProduct) setCategoryDropdownOpen(true) },
                placeholder: '— Search or select category —',
                autoComplete: 'off',
                readOnly: isBaleCategorySyncedProduct
              }),
              categoryDropdownOpen && !isBaleCategorySyncedProduct && React.createElement('div', {
                style: {
                  position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
                  background: 'var(--card-bg, #fff)', border: '1px solid var(--border, #ddd)',
                  borderRadius: 6, maxHeight: 200, overflowY: 'auto', boxShadow: '0 4px 12px rgba(0,0,0,0.12)'
                }
              },
                categories
                  .filter(c => !categorySearch || c.name.toLowerCase().includes(categorySearch.toLowerCase()))
                  .length === 0
                  ? React.createElement('div', { style: { padding: '10px 14px', color: 'var(--text-light, #999)', fontSize: 13 } }, 'No categories found')
                  : categories
                      .filter(c => !categorySearch || c.name.toLowerCase().includes(categorySearch.toLowerCase()))
                      .map(c => React.createElement('div', {
                        key: c.id,
                        style: {
                          padding: '8px 14px', cursor: 'pointer', fontSize: 13,
                          background: String(productForm.category_id) === String(c.id) ? 'var(--gold-light, #fef3c7)' : 'transparent',
                          borderBottom: '1px solid var(--border-light, #f0f0f0)'
                        },
                        onMouseDown: (e) => { e.preventDefault(); setProductForm(f => ({ ...f, category_id: c.id, subcategory: '' })); setCategorySearch(c.name); setCategoryDropdownOpen(false) },
                        onMouseEnter: (e) => { e.currentTarget.style.background = 'var(--gold-light, #fef3c7)' },
                        onMouseLeave: (e) => { e.currentTarget.style.background = String(productForm.category_id) === String(c.id) ? 'var(--gold-light, #fef3c7)' : 'transparent' }
                      }, c.name))
              ),
              categoryDropdownOpen && !isBaleCategorySyncedProduct && React.createElement('div', {
                style: { position: 'fixed', inset: 0, zIndex: 49 },
                onClick: () => setCategoryDropdownOpen(false)
              })
            ),
            React.createElement('div', { className: 'form-group' },
              React.createElement('label', { className: 'form-label' }, selectedProductCategoryHasTypes ? 'Type *' : 'Type'),
              React.createElement('select', {
                className: 'form-input',
                value: productForm.subcategory || '',
                disabled: !productForm.category_id || categoryTypeLoading || !categoryTypeOptionsMatchSelectedCategory,
                onChange: (e) => setProductForm((form) => ({ ...form, subcategory: e.target.value }))
              },
                React.createElement('option', { value: '' },
                  !productForm.category_id
                    ? 'Select category first'
                    : categoryTypeLoading || !categoryTypeOptionsMatchSelectedCategory
                      ? 'Loading types...'
                      : categoryTypeOptions.length
                        ? '-- Select type --'
                        : 'No types for this category'
                ),
                ...(categoryTypeOptionsMatchSelectedCategory ? categoryTypeOptions : []).map((typeOption) => React.createElement('option', {
                  key: `category-type-${typeOption.id || typeOption.name}`,
                  value: typeOption.name
                }, typeOption.name))
              )
            ),
            React.createElement('div', { className: 'form-group' },
              React.createElement('label', { className: 'form-label' }, 'Brand'),
              React.createElement('input', { className: 'form-input', value: productForm.brand, onChange: e => setProductForm(f => ({ ...f, brand: e.target.value })), placeholder: 'e.g. Nike, Zara...' })
            ),
            React.createElement('div', { className: 'form-group' },
              React.createElement('label', { className: 'form-label' }, 'Selling Price'),
              React.createElement('input', { className: 'form-input', type: 'number', step: '0.01', value: productForm.price, onChange: e => setProductForm(f => ({ ...f, price: e.target.value })) })
            ),
            React.createElement('div', { className: 'form-group' },
              React.createElement('label', { className: 'form-label' }, 'Quantity'),
              React.createElement('input', {
                className: 'form-input',
                type: 'number',
                min: isCreateBaleSource ? 1 : 0,
                step: 1,
                value: productForm.stock_quantity,
                onChange: (e) => setProductForm((f) => ({ ...f, stock_quantity: e.target.value })),
                disabled: isSystemManagedProductQuantity,
                readOnly: isSystemManagedProductQuantity
              })
            ),
            React.createElement('div', { className: 'form-group' },
              React.createElement('label', { className: 'form-label' }, 'Low Stock Threshold'),
              React.createElement('input', { className: 'form-input', type: 'number', value: productForm.low_stock_threshold, onChange: e => setProductForm(f => ({ ...f, low_stock_threshold: e.target.value })) })
            ),
            React.createElement('div', { className: 'form-group' },
              React.createElement('label', { className: 'form-label' }, 'Size'),
              React.createElement('select', { className: 'form-input', value: productForm.size, onChange: e => setProductForm(f => ({ ...f, size: e.target.value })) },
                React.createElement('option', { value: '' }, '— Select size —'),
                ...PRODUCT_SIZE_OPTIONS.map((option) => React.createElement('option', { key: `product-size-${option.value}`, value: option.value }, option.label))
              )
            )
          ),
          React.createElement('div', { className: 'form-group inventory-product-description' },
            React.createElement('label', { className: 'form-label' }, 'Description'),
            React.createElement('textarea', { className: 'form-input', value: productForm.description, onChange: e => setProductForm(f => ({ ...f, description: e.target.value })), rows: 2 })
          ),
          React.createElement('div', { className: 'inventory-product-form-help', style: { marginBottom: 14, color: 'var(--text-light)', fontSize: 12 } },
            React.createElement('div', null, `Stock Source: ${editingProductSourceText}.`),
            React.createElement('div', { style: { marginTop: 4 } }, 'Product name is generated automatically from Type, or from Category when no Type is selected.'),
            (isCreateBaleSource || isEditingBaleProduct) && React.createElement('div', { style: { marginTop: 4 } },
              isEditingBaleProduct
                ? 'Bale Grade (Premium or Standard) is locked for bale-linked products and cannot be changed during edit.'
                : `Available for ${productFormSelectedGrade === 'premium' ? 'Premium' : 'Standard'}: ${productFormAvailableForSelectedGrade}.`
            ),
            isCreateBaleSource && React.createElement('div', { style: { marginTop: 4 } },
              'Set Quantity to add multiple units from this bale grade. If a similar product exists, the quantity is added to that existing product.'
            ),
            isSystemManagedProductQuantity && React.createElement('div', { style: { marginTop: 4 } },
              isEditingRepairedProduct
                ? 'Quantity for received repaired products is created from the Damaged tab and cannot be edited here.'
                : 'Quantity for bale-linked products is created from the bale record flow and cannot be edited here.'
            )
          ),
          React.createElement('div', { className: 'inventory-product-form-actions', style: { display: 'flex', gap: 8 } },
            React.createElement('button', { type: 'submit', className: 'btn btn-primary' }, editingProduct ? 'Update Product' : 'Create Product'),
            React.createElement('button', { type: 'button', className: 'btn btn-secondary', onClick: () => { setShowProductModal(false); setCategorySearch(''); setCategoryTypeOptions([]); setCategoryTypeCategoryId('') } }, 'Cancel')
          )
        )
      ),

      React.createElement('div', {
        className: 'inventory-products-table-note',
        style: {
          marginBottom: 10,
          color: 'var(--text-light)',
          fontSize: 12
        }
      },
        selectedBaleStockOption
          ? `Showing ${searchedProducts.length} of ${listedProducts.length} active products. Products linked to selected bale ${selectedBaleStockOption.bale_batch_no || '-'}: ${selectedBaleListedProducts.length}. In-stock products for this selected bale: ${selectedBaleReadyForProductManagement}.`
          : `Showing ${searchedProducts.length} of ${listedProducts.length} active products. Repaired items received from Damaged appear here as individual products ready to sell.`
      ),
      // ── Product tile grid ─────────────────────────────────────────
      searchedProducts.length === 0
        ? React.createElement('div', { className: 'card entity-empty' },
            React.createElement('div', { className: 'entity-empty-icon' },
              React.createElement('span', { style: { fontFamily: 'Nunito', fontWeight: 800, fontSize: 18 } }, 'P')
            ),
            React.createElement('div', { className: 'entity-empty-title' }, productSearchText ? 'No matching products' : 'No products yet'),
            React.createElement('div', { className: 'entity-empty-sub' }, productSearchText
              ? 'Try a different keyword, or clear the search.'
              : 'Use Stock In to bring in your first product.')
          )
        : React.createElement('div', { className: 'inventory-product-tile-grid' },
            searchedProducts.map((p) => {
              const linkedBaleOption = Number(p?.bale_purchase_id || 0) > 0
                ? baleOptionByPurchaseId.get(String(p.bale_purchase_id))
                : null
              const stock = Number(p.stock_quantity || 0)
              const threshold = Number(p.low_stock_threshold || 10)
              const stockTone = stock <= 0 ? 'out'
                : stock <= threshold ? 'low'
                : 'ok'
              const initial = String(p.name || 'P').trim().charAt(0).toUpperCase() || 'P'
              return React.createElement('div', {
                key: p.id,
                className: `inventory-product-tile stock-${stockTone}`,
                onClick: () => startEditProduct(p),
                role: 'button',
                tabIndex: 0,
                onKeyDown: (e) => { if (e.key === 'Enter') startEditProduct(p) }
              },
                React.createElement('div', { className: 'inventory-product-tile-head' },
                  React.createElement('div', { className: 'inventory-product-tile-thumb', 'aria-hidden': 'true' }, initial),
                  React.createElement('div', { className: 'inventory-product-tile-id' },
                    React.createElement('div', { className: 'inventory-product-tile-name' }, p.name || 'Unnamed product'),
                    React.createElement('div', { className: 'inventory-product-tile-sub' },
                      `${p.sku || 'No SKU'} · ${p.barcode || 'No barcode'}`)
                  ),
                  React.createElement('span', { className: `inventory-product-tile-stock-pill tone-${stockTone}` },
                    stock <= 0 ? 'OUT' : stock <= threshold ? 'LOW' : 'OK'
                  )
                ),
                React.createElement('div', { className: 'inventory-product-tile-price-row' },
                  React.createElement('span', { className: 'inventory-product-tile-price' }, fmt(p.price)),
                  React.createElement('span', { className: `inventory-product-tile-stock tone-${stockTone}` },
                    `${stock} in stock`)
                ),
                React.createElement('div', { className: 'inventory-product-tile-meta' },
                  `${p.brand || 'No brand'} · ${p.category || 'Uncategorized'}${p.subcategory ? ` · ${p.subcategory}` : ''}`),
                React.createElement('div', { className: 'inventory-product-tile-chips' },
                  React.createElement('span', { className: 'inventory-chip' }, productSourceLabel(p)),
                  p.condition_grade
                    ? React.createElement('span', { className: 'inventory-chip inventory-chip--subtle' }, toTitleCaseWords(p.condition_grade))
                    : (productSourceKey(p) === 'repaired_damage'
                        ? React.createElement('span', { className: 'inventory-chip inventory-chip--subtle' }, 'Ready to Sell')
                        : null),
                  linkedBaleOption?.bale_batch_no && React.createElement('span', { className: 'inventory-chip inventory-chip--subtle' }, linkedBaleOption.bale_batch_no)
                ),
                React.createElement('div', { className: 'inventory-product-tile-foot', onClick: (e) => e.stopPropagation() },
                  React.createElement('span', { className: 'inventory-product-tile-threshold' },
                    `Low stock alert at ${threshold}`),
                  React.createElement('div', { className: 'inventory-product-tile-actions' },
                    React.createElement('button', {
                      type: 'button',
                      className: 'btn btn-secondary btn-sm',
                      title: `View QR for ${p.name}`,
                      onClick: () => openQrPreview(p)
                    }, 'QR'),
                    React.createElement('button', {
                      type: 'button',
                      className: 'btn btn-outline btn-sm',
                      title: `Edit ${p.name}`,
                      onClick: () => startEditProduct(p)
                    }, 'Edit'),
                    React.createElement('button', {
                      type: 'button',
                      className: 'btn btn-danger btn-sm',
                      title: `Delete ${p.name}`,
                      onClick: () => deleteProduct(p.id)
                    }, 'Delete')
                  )
                )
              )
            })
          ),

      false && qrPreviewProduct && React.createElement('div', {
        className: 'modal-backdrop',
        onClick: closeQrPreview
      },
      React.createElement('div', {
        className: 'modal',
        style: { maxWidth: 560 },
        onClick: (e) => e.stopPropagation()
      },
      React.createElement('div', { className: 'modal-header' },
        React.createElement('h2', null, 'Digital QR Preview'),
        React.createElement('button', { type: 'button', className: 'modal-close', onClick: closeQrPreview }, '×')
      ),
      React.createElement('div', { className: 'modal-body' },
        React.createElement('div', { style: { display: 'grid', gap: 16, justifyItems: 'center', textAlign: 'center' } },
          React.createElement('div', null,
            React.createElement('div', { style: { fontSize: 22, fontWeight: 700, color: 'var(--text-dark)' } }, qrPreviewProduct.name || 'Unnamed product'),
            React.createElement('div', { style: { marginTop: 6, color: 'var(--text-light)', fontSize: 13 } }, qrPreviewProduct.sku ? `SKU: ${qrPreviewProduct.sku}` : 'No SKU'),
            React.createElement('div', { style: { color: 'var(--text-light)', fontSize: 13, fontFamily: 'monospace' } }, `Code: ${qrPreviewProduct.barcode}`)
          ),
          React.createElement('div', {
            style: {
              width: 280,
              minHeight: 280,
              padding: 20,
              borderRadius: 20,
              border: '1px solid var(--border)',
              background: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxSizing: 'border-box'
            }
          },
          qrPreviewLoading
            ? React.createElement('div', { style: { color: 'var(--text-light)' } }, 'Loading QR...')
            : qrPreviewSrc
              ? React.createElement('img', {
                src: qrPreviewSrc,
                alt: `QR for ${qrPreviewProduct.barcode}`,
                style: { width: '100%', height: 'auto', display: 'block' }
              })
              : React.createElement('div', { style: { color: 'var(--text-light)' } }, 'QR preview unavailable')
          ),
          React.createElement('div', {
            style: {
              width: '100%',
              padding: '12px 14px',
              borderRadius: 12,
              background: '#f8fafc',
              color: 'var(--text-mid)',
              fontSize: 13,
              lineHeight: 1.5
            }
          }, 'Use this digital QR on screen for scanning. It contains the same product code used by the POS barcode lookup.'),
          qrPreviewSrc && React.createElement('a', {
            className: 'btn btn-secondary',
            href: qrPreviewSrc,
            target: '_blank',
            rel: 'noreferrer',
            download: `${normalizeScanCode(qrPreviewProduct.barcode || qrPreviewProduct.sku || qrPreviewProduct.name || 'product')}-qr.png`
          }, 'Open QR Image')
        )
      ),
      React.createElement('div', { className: 'modal-footer' },
        React.createElement('button', { type: 'button', className: 'btn btn-primary', onClick: () => sendProductToPos(qrPreviewProduct) }, 'Send to POS'),
        React.createElement('button', { type: 'button', className: 'btn btn-secondary', onClick: closeQrPreview }, 'Close')
      )))
    ),

    // ═══════════════ BARCODE LABELS ═══════════════
    tab === 'barcode-labels' && React.createElement('div', null,
      React.createElement('div', { className: 'card', style: { marginBottom: 20 } },
        React.createElement('h3', { style: { marginBottom: 10 } }, 'Barcode Labels (Code 128)'),
        React.createElement('p', { style: { marginTop: 0, marginBottom: 14, color: 'var(--text-light)', fontSize: 12 } }, 'Scan a product here to send it straight to Sales POS automatically, or use the manual controls for label printing and exports.'),
        React.createElement('div', { className: 'form-group', style: { marginBottom: 14 } },
          React.createElement('label', { className: 'form-label' }, 'Scan Product To Send To POS'),
          React.createElement('input', {
            ref: labelScanInputRef,
            className: 'form-input',
            value: labelScanValue,
            placeholder: 'Scan barcode or QR, then press Enter',
            onChange: (e) => setLabelScanValue(e.target.value),
            onKeyDown: (e) => {
              if (e.key !== 'Enter') return
              e.preventDefault()
              handleLabelProductScan(e.currentTarget.value)
            }
          }),
          React.createElement('div', { style: { marginTop: 8, color: 'var(--text-light)', fontSize: 12 } }, 'When a registered code is scanned here, the product is looked up automatically and sent to Sales POS.')
        ),
        React.createElement('div', { className: 'inventory-label-controls-grid', style: { display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 140px auto', gap: 12, alignItems: 'end' } },
          React.createElement('div', { className: 'form-group', style: { marginBottom: 0 } },
            React.createElement('label', { className: 'form-label' }, 'Product'),
            React.createElement('select', { className: 'form-input', value: labelProductId, onChange: (e) => setLabelProductId(e.target.value) },
              React.createElement('option', { value: '' }, 'Select product with barcode'),
              ...barcodeProductOptions
            )
          ),
          React.createElement('div', { className: 'form-group', style: { marginBottom: 0 } },
            React.createElement('label', { className: 'form-label' }, 'Copies'),
            React.createElement('input', { className: 'form-input', type: 'number', min: 1, value: labelCopies, onChange: (e) => setLabelCopies(e.target.value) })
          ),
          React.createElement('button', { type: 'button', className: 'btn btn-primary', onClick: addProductToLabelQueue }, 'Add')
        ),
        React.createElement('div', { style: { display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' } },
          React.createElement('button', { type: 'button', className: 'btn btn-primary', onClick: printBarcodeLabels, disabled: !resolvedLabelRows.length }, 'Print A4 (3x8)'),
          React.createElement('button', { type: 'button', className: 'btn btn-primary', onClick: sendQueuedQrToPos, disabled: !(resolvedLabelRows.length || labelProductId) }, 'Send to POS'),
          React.createElement('button', { type: 'button', className: 'btn btn-secondary', onClick: previewQueuedQr, disabled: !(resolvedLabelRows.length || labelProductId) }, 'View Digital QR'),
          React.createElement('button', { type: 'button', className: 'btn btn-secondary', onClick: downloadQueuedQrPdf, disabled: !resolvedLabelRows.length }, 'Download QR PDF'),
          React.createElement('button', { type: 'button', className: 'btn btn-secondary', onClick: printQrLabels, disabled: !resolvedLabelRows.length }, 'Print QR A4 (3x8)'),
          React.createElement('button', { type: 'button', className: 'btn btn-secondary', onClick: downloadBarcodeCsv, disabled: !resolvedLabelRows.length }, 'Download CSV'),
          React.createElement('div', { style: { marginLeft: 'auto', color: 'var(--text-light)', fontSize: 12, alignSelf: 'center' } }, `Products queued: ${resolvedLabelRows.length} | Total labels: ${totalLabelCopies}`)
        )
      ),
      React.createElement('div', { className: 'card' },
        React.createElement('h3', { style: { marginBottom: 12 } }, 'Queued Label Items'),
        resolvedLabelRows.length === 0
          ? React.createElement('div', { style: { color: 'var(--text-light)', fontSize: 13 } }, 'No products queued yet.')
          : React.createElement('div', { className: 'table-wrap' },
              React.createElement('table', null,
                React.createElement('thead', null,
                  React.createElement('tr', null,
                    React.createElement('th', null, 'Product'),
                    React.createElement('th', null, 'SKU'),
                    React.createElement('th', null, 'Barcode'),
                    React.createElement('th', null, 'Copies'),
                    React.createElement('th', null, 'Actions')
                  )
                ),
                React.createElement('tbody', null,
                  resolvedLabelRows.map((row) => React.createElement('tr', { key: `label-${row.product_id}` },
                    React.createElement('td', null, row.name),
                    React.createElement('td', null, row.sku || 'â€”'),
                    React.createElement('td', { style: { fontFamily: 'monospace', fontWeight: 600 } }, row.barcode),
                    React.createElement('td', null,
                      React.createElement('input', { type: 'number', min: 1, value: row.copies, onChange: (e) => updateLabelQueueCopies(row.product_id, e.target.value), style: { width: 80 } })
                    ),
                    React.createElement('td', null,
                      React.createElement('button', { type: 'button', className: 'btn btn-danger', style: { padding: '4px 10px', fontSize: 12 }, onClick: () => removeFromLabelQueue(row.product_id) }, 'Remove')
                    )
                  ))
                )
              )
            )
      )
    ),

    tab === 'transactions' && React.createElement('div', { className: 'inventory-report-page' },
      React.createElement('div', { className: 'reports-summary-grid inventory-report-summary-grid' },
        React.createElement('div', { className: 'card reports-summary-card inventory-report-summary-card' },
          React.createElement('div', { className: 'card-title' }, 'Total Transactions'),
          React.createElement('div', { className: 'card-value reports-summary-value reports-summary-value-default' }, transactionSummary.rows)
        ),
        React.createElement('div', { className: 'card reports-summary-card inventory-report-summary-card' },
          React.createElement('div', { className: 'card-title' }, 'Units In'),
          React.createElement('div', { className: 'card-value reports-summary-value reports-summary-value-success' }, transactionSummary.unitsIn)
        ),
        React.createElement('div', { className: 'card reports-summary-card inventory-report-summary-card' },
          React.createElement('div', { className: 'card-title' }, 'Units Out'),
          React.createElement('div', { className: 'card-value reports-summary-value reports-summary-value-danger' }, transactionSummary.unitsOut)
        ),
        React.createElement('div', { className: 'card reports-summary-card inventory-report-summary-card' },
          React.createElement('div', { className: 'card-title' }, 'Shrinkage Reports'),
          React.createElement('div', { className: 'card-value reports-summary-value reports-summary-value-danger' }, transactionSummary.shrinkageRows)
        )
      ),
      React.createElement('div', { className: 'card reports-section-card inventory-report-panel' },
        React.createElement('div', { className: 'inventory-report-toolbar' },
          React.createElement('div', { className: 'inventory-report-title-group' },
            React.createElement('h3', null, 'Transaction History'),
            React.createElement('p', null,
              transactionSearchText
                ? `${searchedTransactions.length} of ${transactions.length} transactions`
                : `${transactionSummary.rows} ${transactionSummary.rows === 1 ? 'transaction' : 'transactions'} total`
            )
          ),
          React.createElement('div', {
            className: 'inventory-report-toolbar-actions inventory-report-filter-group',
            style: { display: 'flex', gap: 10, alignItems: 'end', flexWrap: 'wrap' }
          },
            React.createElement('div', { className: 'form-group', style: { marginBottom: 0, minWidth: 280 } },
              React.createElement('label', { className: 'form-label', htmlFor: 'inventory-transaction-search' }, 'Search Transactions'),
              React.createElement('div', { style: { display: 'flex', gap: 8 } },
                React.createElement('input', {
                  id: 'inventory-transaction-search',
                  className: 'form-input',
                  type: 'search',
                  value: transactionSearchQuery,
                  onChange: (event) => setTransactionSearchQuery(event.target.value),
                  placeholder: 'Search item, SKU, barcode, reference, reason',
                  autoComplete: 'off'
                }),
                transactionSearchText && React.createElement('button', {
                  type: 'button',
                  className: 'btn btn-secondary',
                  onClick: () => setTransactionSearchQuery('')
                }, 'Clear')
              )
            ),
            React.createElement('div', { className: 'form-group', style: { marginBottom: 0 } },
              React.createElement('label', { className: 'form-label' }, 'Show'),
              React.createElement('select', { className: 'form-input inventory-report-filter', value: filterType, onChange: e => setFilterType(e.target.value), 'aria-label': 'Filter inventory transactions by type' },
                React.createElement('option', { value: '' }, 'All types'),
                React.createElement('option', { value: 'IN' }, 'Stock In'),
                React.createElement('option', { value: 'OUT' }, 'Stock Out'),
                React.createElement('option', { value: 'ADJUST' }, 'Adjustments'),
                React.createElement('option', { value: 'RETURN' }, 'Returns')
              )
            )
          )
        ),
        React.createElement('div', { className: 'table-wrap responsive inventory-report-table-wrap', style: { marginBottom: 0 } },
          React.createElement('table', { className: 'inventory-report-table inventory-transaction-table' },
            React.createElement('thead', null,
              React.createElement('tr', null,
                React.createElement('th', null, 'Type'),
                React.createElement('th', null, 'Item'),
                React.createElement('th', null, 'Date'),
                React.createElement('th', { className: 'text-right' }, 'Qty'),
                React.createElement('th', null, 'Details')
              )
            ),
            React.createElement('tbody', null,
              searchedTransactions.length === 0
                ? React.createElement('tr', null,
                    React.createElement('td', { colSpan: 5, style: { textAlign: 'center', color: 'var(--text-light)', padding: 24 } }, transactionSearchText ? 'No transactions match your search.' : 'No transactions found.')
                  )
                : pagedTransactions.map((t) => {
                    const legacySaleLinkInReason = !String(t.reference || '').trim() && /^SALE_LINK[:|]/.test(String(t.reason || '').trim())
                    const resolvedReference = legacySaleLinkInReason ? t.reason : t.reference
                    const resolvedReason = formatTransactionReason(t.reason, resolvedReference)
                    const transactionDisplay = getPosTransactionDisplay(t, resolvedReference)
                    const quantity = Number(t.quantity) || 0
                    const qtyLabel = quantity > 0 ? `+${quantity}` : `${quantity}`
                    const dateParts = formatDateStackParts(t.created_at)
                    const itemMeta = []
                    if (t.sku) itemMeta.push(t.sku)
                    const compactReference = formatPosReference(resolvedReference)
                    if (compactReference) itemMeta.push(compactReference)

                    const detailMeta = [`Stock after: ${t.balance_after ?? '—'}`]
                    if (t.supplier_name) detailMeta.push(`Supplier: ${t.supplier_name}`)
                    if (t.user_name) detailMeta.push(`By ${t.user_name}`)

                    return React.createElement('tr', { key: t.id },
                      React.createElement('td', { className: 'inventory-transaction-type-cell' },
                        React.createElement('span', { className: `badge ${transactionDisplay.badgeClass}` }, transactionDisplay.label)
                      ),
                      React.createElement('td', { className: 'inventory-transaction-main-cell' },
                        React.createElement('div', { className: 'inventory-report-primary' }, t.product_name || 'Unassigned item'),
                        React.createElement('div', { className: 'inventory-report-secondary' }, itemMeta.join(' • '))
                      ),
                      React.createElement('td', { className: 'inventory-transaction-date-cell' },
                        React.createElement('div', { className: 'inventory-date-stack' },
                          React.createElement('strong', null, dateParts.date),
                          React.createElement('span', null, dateParts.time || '—')
                        )
                      ),
                      React.createElement('td', { className: 'text-right inventory-transaction-qty-cell' },
                        React.createElement('span', { className: `inventory-quantity ${quantity >= 0 ? 'inventory-quantity--positive' : 'inventory-quantity--negative'}` }, qtyLabel)
                      ),
                      React.createElement('td', { className: 'inventory-transaction-details-cell' },
                        React.createElement('div', { className: 'inventory-report-primary' }, resolvedReason),
                        React.createElement('div', { className: 'inventory-report-secondary' }, detailMeta.join(' • '))
                      )
                    )
                  })
            )
          )
        ),
        React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, paddingTop: 12 } },
          React.createElement(PaginationInfo, { current: transactionsPage, pageSize: TRANSACTIONS_PAGE_SIZE, total: searchedTransactions.length }),
          transactionsTotalPages > 1 && React.createElement(Pagination, { current: transactionsPage, total: transactionsTotalPages, onPageChange: setTransactionsPage })
        )
      )
    ),

    // ═══════════════ DAMAGED ═══════════════
    tab === 'damaged' && React.createElement('div', null,
      React.createElement('div', { className: 'card inventory-damaged-toolbar' },
        React.createElement('div', { className: 'inventory-damaged-toolbar-grid' },
          React.createElement('div', { className: 'form-group', style: { marginBottom: 0 } },
            React.createElement('label', { className: 'form-label' }, 'Source'),
            React.createElement('select', { className: 'form-input', value: damagedSourceFilter, onChange: (event) => setDamagedSourceFilter(event.target.value) },
              React.createElement('option', { value: '' }, 'All damage records'),
              React.createElement('option', { value: 'bale_breakdown' }, 'Bale Data (Breakdown)'),
              React.createElement('option', { value: 'sales_return' }, 'Sales Return'),
              React.createElement('option', { value: 'manual_damage' }, 'Manual Damage')
            )
          ),
          React.createElement('div', { className: 'form-group', style: { marginBottom: 0 } },
            React.createElement('label', { className: 'form-label' }, 'From'),
            React.createElement('input', { className: 'form-input', type: 'date', value: damagedFrom, onChange: (event) => setDamagedFrom(event.target.value), max: damagedTo || undefined })
          ),
          React.createElement('div', { className: 'form-group', style: { marginBottom: 0 } },
            React.createElement('label', { className: 'form-label' }, 'To'),
            React.createElement('input', { className: 'form-input', type: 'date', value: damagedTo, onChange: (event) => setDamagedTo(event.target.value), min: damagedFrom || undefined })
          ),
          React.createElement('div', { className: 'inventory-damaged-toolbar-actions' },
            React.createElement('button', { className: 'btn btn-primary btn-sm', type: 'button', onClick: fetchDamaged }, 'Refresh'),
            React.createElement('button', {
              className: 'btn btn-secondary btn-sm',
              type: 'button',
              onClick: handleClearDamagedFilters
            }, 'Clear')
          )
        ),
        React.createElement('div', { className: 'inventory-damaged-toolbar-summary' },
          React.createElement('span', { className: 'inventory-chip inventory-chip--subtle' }, `${damaged.length} Records`),
          React.createElement('span', { className: 'inventory-chip inventory-chip--success' }, `${damagedRepairableRecordCount} Ready to Receive`),
          React.createElement('span', { className: 'inventory-chip inventory-chip--warning' }, `${damagedRemainingUnitCount} Units Left`),
          React.createElement('span', { className: 'inventory-chip inventory-chip--subtle' }, `${damagedFullyRepairedCount} Complete`)
        ),
        React.createElement('div', { className: 'inventory-damaged-toolbar-note' }, 'Select Receive Repaired to turn one remaining damaged unit into a sellable individual product.')
      ),
      damaged.length === 0
        ? React.createElement('div', { className: 'card entity-empty' },
            React.createElement('div', { className: 'entity-empty-icon', style: { background: 'var(--success-light)', color: 'var(--success)' } },
              React.createElement('span', { style: { fontSize: 22, fontWeight: 800 } }, '✓')
            ),
            React.createElement('div', { className: 'entity-empty-title' }, 'No damaged records'),
            React.createElement('div', { className: 'entity-empty-sub' }, 'Either the filter is too narrow, or there\'s nothing damaged in this period — good news.')
          )
        : React.createElement('div', { className: 'damaged-card-grid' },
            damaged.map((d) => {
              const rowKey = String(d.record_key || `${d.damage_source_type || 'damage'}-${d.damage_source_id || d.id || ''}`)
              const originalQty  = Number(d.original_quantity ?? d.quantity ?? 0)
              const repairedQty  = Number(d.repaired_quantity || 0)
              const remainingQty = Number(d.remaining_quantity ?? d.quantity ?? 0)
              const isSelected = rowKey === selectedDamagedRecordKey
              const isComplete = remainingQty <= 0
              const repairProgress = originalQty > 0 ? Math.min(100, Math.round((repairedQty / originalQty) * 100)) : 0
              const tone = isComplete ? 'complete' : (repairedQty > 0 ? 'partial' : 'pending')
              return React.createElement('div', {
                key: rowKey,
                className: `damaged-card tone-${tone} ${isSelected ? 'is-selected' : ''}`
              },
                React.createElement('div', { className: 'damaged-card-head' },
                  React.createElement('div', { className: 'damaged-card-id' },
                    React.createElement('div', { className: 'damaged-card-name' }, d.product_name || 'Damaged item'),
                    React.createElement('div', { className: 'damaged-card-sub' },
                      d.sku ? `SKU ${d.sku}` : `Source ID #${d.damage_source_id || '-'}`)
                  ),
                  React.createElement('span', { className: `damaged-status-pill tone-${tone}` },
                    isComplete ? 'Complete' : (repairedQty > 0 ? 'Partial' : 'Pending'))
                ),
                React.createElement('div', { className: 'damaged-card-meta' },
                  React.createElement('div', { className: 'damaged-card-meta-row' },
                    React.createElement('span', { className: 'damaged-card-meta-label' }, 'Reported'),
                    React.createElement('span', { className: 'damaged-card-meta-value' }, fmtDate(d.created_at) || '—')
                  ),
                  React.createElement('div', { className: 'damaged-card-meta-row' },
                    React.createElement('span', { className: 'damaged-card-meta-label' }, 'Reporter'),
                    React.createElement('span', { className: 'damaged-card-meta-value' }, d.reported_by_name || 'Not set')
                  ),
                  React.createElement('div', { className: 'damaged-card-meta-row' },
                    React.createElement('span', { className: 'damaged-card-meta-label' }, 'Source'),
                    React.createElement('span', { className: 'damaged-card-meta-value' },
                      React.createElement('span', { className: 'inventory-chip' }, d.source_label || 'Inventory'))
                  )
                ),
                React.createElement('div', { className: 'damaged-card-progress' },
                  React.createElement('div', { className: 'damaged-card-progress-track' },
                    React.createElement('div', {
                      className: `damaged-card-progress-fill tone-${tone}`,
                      style: { width: `${repairProgress}%` }
                    })
                  ),
                  React.createElement('div', { className: 'damaged-card-progress-stats' },
                    React.createElement('span', null, React.createElement('strong', null, originalQty), ' damaged'),
                    React.createElement('span', null, React.createElement('strong', null, repairedQty), ' received'),
                    React.createElement('span', { className: remainingQty > 0 ? 'tone-amber' : 'tone-success' },
                      React.createElement('strong', null, remainingQty), ' left'
                    )
                  )
                ),
                (d.reason || d.reference) && React.createElement('div', { className: 'damaged-card-reason' },
                  formatTransactionReason(d.reason, d.reference)
                ),
                React.createElement('div', { className: 'damaged-card-foot' },
                  React.createElement('button', {
                    type: 'button',
                    className: `btn ${isComplete ? 'btn-secondary' : 'btn-primary'} btn-sm`,
                    onClick: () => startRepairDamagedItem(d),
                    disabled: isComplete
                  }, isComplete ? 'Complete' : 'Receive Repaired')
                )
              )
            })
          )
    ),

    // ═══════════════ LOW STOCK ═══════════════
    tab === 'low-stock' && React.createElement('div', null,
      lowStock.length === 0
        ? React.createElement('div', { className: 'card entity-empty' },
            React.createElement('div', { className: 'entity-empty-icon', style: { background: 'var(--success-light)', color: 'var(--success)' } },
              React.createElement('span', { style: { fontSize: 22, fontWeight: 800 } }, '✓')
            ),
            React.createElement('div', { className: 'entity-empty-title' }, 'All stock levels healthy'),
            React.createElement('div', { className: 'entity-empty-sub' }, 'Nothing below its threshold right now. Items will appear here once stock dips into low territory.')
          )
        : (() => {
            const outOfStock = lowStock.filter((p) => Number(p.stock_quantity || 0) <= 0)
            const critical   = lowStock.filter((p) => { const s = Number(p.stock_quantity || 0); const t = Number(p.low_stock_threshold || 10); return s > 0 && s <= Math.max(1, Math.floor(t / 2)) })
            const warnings   = lowStock.filter((p) => { const s = Number(p.stock_quantity || 0); const t = Number(p.low_stock_threshold || 10); return s > Math.max(1, Math.floor(t / 2)) && s <= t })
            return React.createElement('div', null,
              React.createElement('div', { className: 'lowstock-summary-row' },
                React.createElement('div', { className: 'lowstock-summary tone-error' },
                  React.createElement('div', { className: 'lowstock-summary-label' }, 'Out of Stock'),
                  React.createElement('div', { className: 'lowstock-summary-value' }, outOfStock.length)
                ),
                React.createElement('div', { className: 'lowstock-summary tone-warning' },
                  React.createElement('div', { className: 'lowstock-summary-label' }, 'Critical'),
                  React.createElement('div', { className: 'lowstock-summary-value' }, critical.length)
                ),
                React.createElement('div', { className: 'lowstock-summary tone-info' },
                  React.createElement('div', { className: 'lowstock-summary-label' }, 'Approaching Threshold'),
                  React.createElement('div', { className: 'lowstock-summary-value' }, warnings.length)
                ),
                React.createElement('div', { className: 'lowstock-summary tone-neutral' },
                  React.createElement('div', { className: 'lowstock-summary-label' }, 'Total Alerts'),
                  React.createElement('div', { className: 'lowstock-summary-value' }, lowStock.length)
                )
              ),
              React.createElement('div', { className: 'lowstock-card-grid' },
                lowStock.map((p) => {
                  const stock     = Number(p.stock_quantity || 0)
                  const threshold = Number(p.low_stock_threshold || 10)
                  const ratio     = threshold > 0 ? Math.min(100, Math.round((stock / threshold) * 100)) : 0
                  const tone = stock <= 0 ? 'out' : stock <= Math.max(1, Math.floor(threshold / 2)) ? 'critical' : 'warn'
                  const label = stock <= 0 ? 'OUT OF STOCK' : (tone === 'critical' ? 'CRITICAL' : 'LOW')
                  return React.createElement('div', { key: p.id, className: `lowstock-card tone-${tone}` },
                    React.createElement('div', { className: 'lowstock-card-head' },
                      React.createElement('div', { className: 'lowstock-card-id' },
                        React.createElement('div', { className: 'lowstock-card-name' }, p.name || 'Unnamed product'),
                        React.createElement('div', { className: 'lowstock-card-sub' },
                          (p.sku ? `SKU ${p.sku}` : 'No SKU') + (p.category ? ` · ${p.category}` : '')
                        )
                      ),
                      React.createElement('span', { className: `lowstock-status-pill tone-${tone}` }, label)
                    ),
                    React.createElement('div', { className: 'lowstock-card-stock' },
                      React.createElement('span', { className: 'lowstock-card-stock-current' }, stock),
                      React.createElement('span', { className: 'lowstock-card-stock-divider' }, '/'),
                      React.createElement('span', { className: 'lowstock-card-stock-threshold' }, threshold),
                      React.createElement('span', { className: 'lowstock-card-stock-label' }, 'in stock vs threshold')
                    ),
                    React.createElement('div', { className: 'lowstock-card-bar' },
                      React.createElement('div', {
                        className: `lowstock-card-bar-fill tone-${tone}`,
                        style: { width: `${ratio}%` }
                      })
                    ),
                    React.createElement('div', { className: 'lowstock-card-foot' },
                      React.createElement('span', { className: 'lowstock-card-foot-label' },
                        stock <= 0
                          ? 'Restock immediately — none on hand.'
                          : `Reorder soon. ${threshold - stock} unit${(threshold - stock) === 1 ? '' : 's'} below threshold.`
                      ),
                      React.createElement('button', {
                        type: 'button',
                        className: 'btn btn-outline btn-sm',
                        onClick: () => navigate('/inventory?tab=stock-in')
                      }, 'Stock In →')
                    )
                  )
                })
              )
            )
          })()
    ),

    // ═══════════════ SHRINKAGE ═══════════════
    tab === 'shrinkage' && React.createElement('div', { className: 'inventory-report-page' },
      React.createElement('div', { className: 'reports-summary-grid inventory-report-summary-grid' },
        React.createElement('div', { className: 'card reports-summary-card inventory-report-summary-card' },
          React.createElement('div', { className: 'card-title' }, 'Affected Products'),
          React.createElement('div', { className: 'card-value reports-summary-value reports-summary-value-default' }, shrinkageSummary.products)
        ),
        React.createElement('div', { className: 'card reports-summary-card inventory-report-summary-card' },
          React.createElement('div', { className: 'card-title' }, 'Total Shrinkage'),
          React.createElement('div', { className: 'card-value reports-summary-value reports-summary-value-danger' }, shrinkageSummary.totalLoss)
        ),
        React.createElement('div', { className: 'card reports-summary-card inventory-report-summary-card' },
          React.createElement('div', { className: 'card-title' }, 'Incidents'),
          React.createElement('div', { className: 'card-value reports-summary-value reports-summary-value-default' }, shrinkageSummary.incidents)
        ),
        React.createElement('div', { className: 'card reports-summary-card inventory-report-summary-card' },
          React.createElement('div', { className: 'card-title' }, 'Highest Shrinkage'),
          React.createElement('div', { className: 'card-value reports-summary-value reports-summary-value-danger' }, shrinkageSummary.largestItem?.totalLoss || 0),
          React.createElement('div', { className: 'card-subtitle' }, shrinkageSummary.largestItem?.label || 'Unassigned item')
        )
      ),
      React.createElement('div', { className: 'card reports-section-card inventory-report-panel' },
        React.createElement('div', { className: 'inventory-report-toolbar', style: { flexWrap: 'wrap', gap: 12 } },
          React.createElement('div', { className: 'inventory-report-title-group' },
            React.createElement('h3', null, 'Shrinkage Details'),
            React.createElement('p', null,
              shrinkageSearchText
                ? `${filteredShrinkage.length} of ${shrinkage.length} products`
                : `${shrinkageSummary.products} ${shrinkageSummary.products === 1 ? 'product affected' : 'products affected'}`
            )
          ),
          React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' } },
            React.createElement('div', { style: { display: 'flex', gap: 8 } },
              React.createElement('input', {
                className: 'form-input',
                type: 'search',
                value: shrinkageSearchQuery,
                onChange: (e) => setShrinkageSearchQuery(e.target.value),
                placeholder: 'Search product or SKU',
                autoComplete: 'off',
                style: { minWidth: 200 }
              }),
              shrinkageSearchText && React.createElement('button', {
                type: 'button', className: 'btn btn-secondary',
                onClick: () => setShrinkageSearchQuery('')
              }, 'Clear')
            ),
            React.createElement('span', { className: 'inventory-chip inventory-chip--danger' }, `${shrinkageSummary.totalLoss} units lost`)
          )
        ),
        React.createElement('div', { className: 'table-wrap responsive inventory-report-table-wrap', style: { marginBottom: 0 } },
          React.createElement('table', { className: 'inventory-report-table inventory-shrinkage-table' },
            React.createElement('thead', null,
              React.createElement('tr', null,
                React.createElement('th', { className: 'inventory-shrinkage-sku-cell' }, 'SKU'),
                React.createElement('th', null, 'Product'),
                React.createElement('th', { className: 'text-right' }, 'Total Shrinkage'),
                React.createElement('th', { className: 'text-right' }, 'Incidents'),
                React.createElement('th', null, 'Reason')
              )
            ),
            React.createElement('tbody', null,
              filteredShrinkage.length === 0
                ? React.createElement('tr', null, React.createElement('td', { colSpan: 5, style: { textAlign: 'center', color: 'var(--text-light)', padding: 24 } }, shrinkageSearchText ? 'No shrinkage records match your search.' : 'No shrinkage recorded.'))
                : pagedShrinkage.map((s, index) => {
                    const shrinkageReasons = formatGroupedTransactionReasonList(s.reasons)

                    return React.createElement('tr', { key: s.product_id || s.sku || `shrinkage-${index}` },
                      React.createElement('td', { className: 'inventory-shrinkage-sku-cell' }, s.sku || '—'),
                      React.createElement('td', { className: 'inventory-shrinkage-product-cell' },
                        React.createElement('div', { className: 'inventory-report-primary' }, s.product_name || 'Unassigned item')
                      ),
                      React.createElement('td', { className: 'text-right inventory-shrinkage-loss-cell' },
                        React.createElement('span', { className: 'inventory-quantity inventory-quantity--negative' }, Number(s.total_shrinkage) || 0)
                      ),
                      React.createElement('td', { className: 'text-right inventory-shrinkage-loss-cell' },
                        React.createElement('span', { className: 'inventory-report-count' }, Number(s.incidents) || 0)
                      ),
                      React.createElement('td', { className: 'inventory-shrinkage-reason-cell' },
                        shrinkageReasons.length === 0
                          ? React.createElement('div', { className: 'inventory-report-secondary' }, 'No reason listed')
                          : React.createElement('div', { className: 'inventory-reason-list' },
                              ...shrinkageReasons.map((reason, reasonIndex) => React.createElement('div', { key: `${s.product_id || s.sku || index}-${reasonIndex}`, className: 'inventory-reason-item' }, reason))
                            )
                      )
                    )
                  })
            )
          )
        ),
        React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, paddingTop: 12 } },
          React.createElement(PaginationInfo, { current: shrinkagePage, pageSize: SHRINKAGE_PAGE_SIZE, total: filteredShrinkage.length }),
          shrinkageTotalPages > 1 && React.createElement(Pagination, { current: shrinkagePage, total: shrinkageTotalPages, onPageChange: setShrinkagePage })
        )
      )
    ),

    // ═══════════════ REPORTS ═══════════════
    tab === 'reports' && summary && React.createElement('div', null,
      React.createElement('h3', { style: { marginBottom: 16 } }, 'Inventory Report & Analytics'),
      React.createElement('div', { className: 'dashboard-grid' },
        React.createElement('div', { className: 'card' },
          React.createElement('div', { className: 'card-title' }, 'Active Products'),
          React.createElement('div', { className: 'card-value' }, summary.products?.length || 0)
        ),
        React.createElement('div', { className: 'card' },
          React.createElement('div', { className: 'card-title' }, 'Total Items'),
          React.createElement('div', { className: 'card-value' }, (summary.totalItems || 0).toLocaleString())
        ),
        React.createElement('div', { className: 'card' },
          React.createElement('div', { className: 'card-title' }, 'Total Stock Value'),
          React.createElement('div', { className: 'card-value-sm' }, fmt(summary.totalValue))
        ),
        React.createElement('div', { className: 'card' },
          React.createElement('div', { className: 'card-title' }, 'Potential Retail Value'),
          React.createElement('div', { className: 'card-value-sm' }, fmt(summary.totalRetailValue))
        ),
        React.createElement('div', { className: 'card' },
          React.createElement('div', { className: 'card-title' }, 'Low Stock Count'),
          React.createElement('div', { className: 'card-value', style: { color: summary.lowStockCount > 0 ? 'var(--error)' : 'var(--success)' } }, summary.lowStockCount)
        )
      ),
      React.createElement('div', {
        style: { marginTop: 18, marginBottom: 10, color: 'var(--text-light)', fontSize: 12, lineHeight: 1.6 }
      }, `Showing ${filteredInventoryReportProducts.length} of ${inventoryReportProducts.length} records.`),
      React.createElement('div', {
        className: 'inventory-report-toolbar',
        style: { marginBottom: 8, display: 'flex', gap: 10, alignItems: 'end', flexWrap: 'wrap' }
      },
        React.createElement('div', { className: 'form-group', style: { marginBottom: 0, flex: '1 1 360px', maxWidth: 620 } },
          React.createElement('label', { className: 'form-label', htmlFor: 'inventory-report-search' }, 'Search Inventory Report'),
          React.createElement('div', { style: { display: 'flex', gap: 8 } },
            React.createElement('input', {
              id: 'inventory-report-search',
              className: 'form-input',
              type: 'search',
              value: inventoryReportSearchQuery,
              onChange: (event) => setInventoryReportSearchQuery(event.target.value),
              placeholder: 'Search SKU, barcode, product, category, bale, supplier',
              autoComplete: 'off'
            }),
            inventoryReportSearchText && React.createElement('button', {
              type: 'button',
              className: 'btn btn-secondary',
              onClick: () => setInventoryReportSearchQuery('')
            }, 'Clear')
          )
        ),
        React.createElement('div', { style: { position: 'relative', marginBottom: 0 } },
          React.createElement('button', {
            type: 'button',
            className: 'btn btn-secondary',
            onClick: () => setInventoryReportShowColMenu(v => !v),
            style: { whiteSpace: 'nowrap' }
          }, 'Columns ▾'),
          inventoryReportShowColMenu && React.createElement(React.Fragment, null,
            React.createElement('div', {
              style: { position: 'fixed', inset: 0, zIndex: 10 },
              onClick: () => setInventoryReportShowColMenu(false)
            }),
            React.createElement('div', {
              style: {
                position: 'absolute', top: '100%', right: 0, marginTop: 4,
                background: 'var(--bg)', border: '1px solid var(--border)',
                borderRadius: 6, padding: '6px 0', zIndex: 11,
                minWidth: 180, boxShadow: '0 4px 12px rgba(0,0,0,0.12)'
              }
            },
              [
                { key: 'codes', label: 'Codes' },
                { key: 'details', label: 'Product Details' },
                { key: 'category', label: 'Category / Type' },
                { key: 'source', label: 'Source / Bale' },
                { key: 'stock', label: 'Stock' },
                { key: 'pricing', label: 'Pricing' },
                { key: 'movement', label: 'Movement' },
                { key: 'dates', label: 'Last Active' },
              ].map(col =>
                React.createElement('label', {
                  key: col.key,
                  style: { display: 'flex', alignItems: 'center', gap: 8, padding: '5px 14px', cursor: 'pointer', fontSize: 13 }
                },
                  React.createElement('input', {
                    type: 'checkbox',
                    checked: !!inventoryReportVisibleCols[col.key],
                    onChange: () => setInventoryReportVisibleCols(prev => {
                      const next = { ...prev, [col.key]: !prev[col.key] }
                      try { localStorage.setItem('inventoryReportVisibleCols', JSON.stringify(next)) } catch {}
                      return next
                    })
                  }),
                  col.label
                )
              )
            )
          )
        )
      ),
      React.createElement('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 } },
        [
          { key: 'all', label: 'All' },
          { key: 'low-stock', label: 'Low Stock' },
          { key: 'bale', label: 'Bale Breakdown' },
          { key: 'repaired', label: 'Repaired' },
          { key: 'direct', label: 'Direct' },
        ].map(chip =>
          React.createElement('button', {
            key: chip.key,
            type: 'button',
            onClick: () => setInventoryReportActiveFilter(chip.key),
            style: {
              padding: '4px 12px',
              borderRadius: 20,
              border: inventoryReportActiveFilter === chip.key ? '1.5px solid var(--primary)' : '1.5px solid var(--border)',
              background: inventoryReportActiveFilter === chip.key ? 'var(--primary)' : 'transparent',
              color: inventoryReportActiveFilter === chip.key ? '#fff' : 'var(--text)',
              fontSize: 12,
              cursor: 'pointer',
              fontWeight: inventoryReportActiveFilter === chip.key ? 600 : 400
            }
          }, chip.label)
        )
      ),
      React.createElement('div', { className: 'table-wrap responsive', style: { marginTop: 8 } },
        React.createElement('table', { className: 'inventory-report-table' },
          React.createElement('thead', null,
            React.createElement('tr', null,
              inventoryReportVisibleCols.codes && React.createElement('th', null, 'Codes'),
              inventoryReportVisibleCols.details && React.createElement('th', null, 'Product Details'),
              inventoryReportVisibleCols.category && React.createElement('th', null, 'Category / Type'),
              inventoryReportVisibleCols.source && React.createElement('th', null, 'Source / Bale'),
              inventoryReportVisibleCols.stock && React.createElement('th', null, 'Stock'),
              inventoryReportVisibleCols.pricing && React.createElement('th', null, 'Pricing'),
              inventoryReportVisibleCols.movement && React.createElement('th', null, 'Movement'),
              inventoryReportVisibleCols.dates && React.createElement('th', null, 'Last Active'),
              React.createElement('th', { style: { width: 24 } })
            )
          ),
          React.createElement('tbody', null,
            filteredInventoryReportProducts.length === 0
              ? React.createElement('tr', null,
                  React.createElement('td', {
                    colSpan: Object.values(inventoryReportVisibleCols).filter(Boolean).length + 1,
                    style: { textAlign: 'center', color: 'var(--text-light)', padding: 24 }
                  }, inventoryReportSearchText || inventoryReportActiveFilter !== 'all' ? 'No inventory records match your filters.' : 'No active inventory products found.')
                )
              : filteredInventoryReportProducts.flatMap((p) => {
                  const stockQuantity = Number(p.stock_quantity || 0)
                  const lowStockThreshold = Number(p.low_stock_threshold || 0)
                  const isLowStockProduct = stockQuantity <= lowStockThreshold
                  const sourceLabel = productSourceLabel(p)
                  const statusLabel = p.status ? toTitleCaseWords(p.status) : (Number(p.is_active ?? 1) === 1 ? 'Active' : 'Inactive')
                  const gradeLabel = p.condition_grade ? toTitleCaseWords(p.condition_grade) : ''
                  const isExpanded = inventoryReportExpandedRows.has(p.id)
                  const toggleExpand = () => setInventoryReportExpandedRows(prev => {
                    const next = new Set(prev)
                    if (next.has(p.id)) next.delete(p.id); else next.add(p.id)
                    return next
                  })
                  const lastActivity = [p.last_transaction_at, p.updated_at, p.breakdown_date, p.bale_purchase_date, p.date_encoded, p.created_at]
                    .filter(Boolean).sort().pop()
                  const datesTitle = [
                    p.date_encoded ? `Encoded: ${fmtDate(p.date_encoded)}` : null,
                    p.bale_purchase_date ? `Bale purchase: ${fmtDate(p.bale_purchase_date)}` : null,
                    p.breakdown_date ? `Breakdown: ${fmtDate(p.breakdown_date)}` : null,
                    p.last_transaction_at ? `Last move: ${fmtDate(p.last_transaction_at)}` : null,
                    p.created_at ? `Created: ${fmtDate(p.created_at)}` : null,
                    p.updated_at ? `Updated: ${fmtDate(p.updated_at)}` : null,
                  ].filter(Boolean).join('\n')
                  const visibleColCount = Object.values(inventoryReportVisibleCols).filter(Boolean).length + 1

                  const mainRow = React.createElement('tr', {
                    key: `rpt-${p.id}`,
                    onClick: toggleExpand,
                    style: { cursor: 'pointer', background: isExpanded ? 'var(--bg-alt, #f4f5f7)' : undefined }
                  },
                    inventoryReportVisibleCols.codes && React.createElement('td', null,
                      React.createElement('div', { className: 'inventory-report-primary' }, p.sku || 'No SKU'),
                      React.createElement('div', { className: 'inventory-report-secondary' }, p.barcode || 'No barcode')
                    ),
                    inventoryReportVisibleCols.details && React.createElement('td', null,
                      React.createElement('div', { className: 'inventory-report-primary' }, p.name || 'Unnamed'),
                      React.createElement('div', { className: 'inventory-report-secondary' },
                        [p.brand, p.size ? `Sz ${p.size}` : null].filter(Boolean).join(' · ') || 'No brand'
                      )
                    ),
                    inventoryReportVisibleCols.category && React.createElement('td', null,
                      React.createElement('div', { className: 'inventory-report-primary' }, p.category || 'Uncategorized'),
                      p.subcategory && React.createElement('div', { className: 'inventory-report-secondary' }, p.subcategory)
                    ),
                    inventoryReportVisibleCols.source && React.createElement('td', null,
                      React.createElement('div', { className: 'inventory-product-chips' },
                        React.createElement('span', { className: 'inventory-chip' }, sourceLabel),
                        gradeLabel && React.createElement('span', { className: 'inventory-chip inventory-chip--subtle' }, gradeLabel),
                        React.createElement('span', { className: 'inventory-chip inventory-chip--subtle' }, statusLabel)
                      )
                    ),
                    inventoryReportVisibleCols.stock && React.createElement('td', null,
                      React.createElement('div', {
                        className: 'inventory-report-primary',
                        style: { fontWeight: 700, color: isLowStockProduct ? 'var(--error)' : 'var(--text-dark)' }
                      }, stockQuantity),
                      React.createElement('div', { className: 'inventory-report-secondary' }, isLowStockProduct ? 'Low stock' : 'Healthy')
                    ),
                    inventoryReportVisibleCols.pricing && React.createElement('td', null,
                      React.createElement('div', { className: 'inventory-report-primary' }, fmt(p.price || p.selling_price || 0)),
                      React.createElement('div', { className: 'inventory-report-secondary' }, `Cost ${fmt(p.cost)} · Val ${fmt(p.stock_value)}`)
                    ),
                    inventoryReportVisibleCols.movement && React.createElement('td', null,
                      React.createElement('div', { className: 'inventory-report-secondary' },
                        `↑${Number(p.total_in_units || 0)} ↓${Number(p.total_out_units || 0)} ~${Number(p.total_adjustment_units || 0)} ↩${Number(p.total_return_units || 0)}`
                      ),
                      React.createElement('div', { className: 'inventory-report-secondary' },
                        p.last_transaction_at ? fmtDate(p.last_transaction_at) : 'No movement'
                      )
                    ),
                    inventoryReportVisibleCols.dates && React.createElement('td', { title: datesTitle },
                      React.createElement('div', { className: 'inventory-report-primary' }, lastActivity ? fmtDate(lastActivity) : '—'),
                      React.createElement('div', { className: 'inventory-report-secondary', style: { fontSize: 10 } }, 'hover for dates')
                    ),
                    React.createElement('td', {
                      style: { textAlign: 'center', color: 'var(--text-light)', fontSize: 11, userSelect: 'none', padding: '0 6px' }
                    }, isExpanded ? '▾' : '▸')
                  )

                  const detailRow = isExpanded && React.createElement('tr', { key: `rpt-detail-${p.id}` },
                    React.createElement('td', {
                      colSpan: visibleColCount,
                      style: { background: 'var(--bg-alt, #f4f5f7)', padding: '14px 20px', borderTop: 'none' }
                    },
                      React.createElement('div', {
                        style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: '14px 24px' }
                      },
                        React.createElement('div', null,
                          React.createElement('div', { style: { fontSize: 10, fontWeight: 700, color: 'var(--text-light)', textTransform: 'uppercase', marginBottom: 4, letterSpacing: '0.04em' } }, 'Codes'),
                          React.createElement('div', { style: { fontSize: 12 } }, `SKU: ${p.sku || '—'}`),
                          React.createElement('div', { style: { fontSize: 12 } }, `Barcode: ${p.barcode || '—'}`),
                          p.item_code && React.createElement('div', { style: { fontSize: 12 } }, `Item code: ${p.item_code}`)
                        ),
                        React.createElement('div', null,
                          React.createElement('div', { style: { fontSize: 10, fontWeight: 700, color: 'var(--text-light)', textTransform: 'uppercase', marginBottom: 4, letterSpacing: '0.04em' } }, 'Product'),
                          (p.size || p.color) && React.createElement('div', { style: { fontSize: 12 } }, [p.size ? `Size: ${p.size}` : null, p.color ? `Color: ${p.color}` : null].filter(Boolean).join(' · ')),
                          p.bale_category && React.createElement('div', { style: { fontSize: 12 } }, `Bale cat: ${p.bale_category}`),
                          p.description && React.createElement('div', { style: { fontSize: 12, color: 'var(--text-light)', marginTop: 2 } }, p.description)
                        ),
                        (p.bale_batch_no || p.supplier_name || p.source_breakdown_id) && React.createElement('div', null,
                          React.createElement('div', { style: { fontSize: 10, fontWeight: 700, color: 'var(--text-light)', textTransform: 'uppercase', marginBottom: 4, letterSpacing: '0.04em' } }, 'Bale / Source'),
                          p.bale_batch_no && React.createElement('div', { style: { fontSize: 12 } }, `Batch: ${p.bale_batch_no}`),
                          p.supplier_name && React.createElement('div', { style: { fontSize: 12 } }, `Supplier: ${p.supplier_name}`),
                          p.source_breakdown_id && React.createElement('div', { style: { fontSize: 12 } }, `Breakdown #${p.source_breakdown_id}`)
                        ),
                        React.createElement('div', null,
                          React.createElement('div', { style: { fontSize: 10, fontWeight: 700, color: 'var(--text-light)', textTransform: 'uppercase', marginBottom: 4, letterSpacing: '0.04em' } }, 'Pricing Detail'),
                          React.createElement('div', { style: { fontSize: 12 } }, `Sell: ${fmt(p.price || p.selling_price || 0)}`),
                          React.createElement('div', { style: { fontSize: 12 } }, `Cost: ${fmt(p.cost)}`),
                          p.allocated_cost && React.createElement('div', { style: { fontSize: 12 } }, `Allocated: ${fmt(p.allocated_cost)}`),
                          React.createElement('div', { style: { fontSize: 12 } }, `Stock value: ${fmt(p.stock_value)}`),
                          React.createElement('div', { style: { fontSize: 12 } }, `Retail value: ${fmt(p.retail_value)}`),
                          React.createElement('div', { style: { fontSize: 12 } }, `Threshold: ${lowStockThreshold}`)
                        ),
                        React.createElement('div', null,
                          React.createElement('div', { style: { fontSize: 10, fontWeight: 700, color: 'var(--text-light)', textTransform: 'uppercase', marginBottom: 4, letterSpacing: '0.04em' } }, 'Movement'),
                          React.createElement('div', { style: { fontSize: 12 } }, `In: ${Number(p.total_in_units || 0)}`),
                          React.createElement('div', { style: { fontSize: 12 } }, `Out: ${Number(p.total_out_units || 0)}`),
                          React.createElement('div', { style: { fontSize: 12 } }, `Adjust: ${Number(p.total_adjustment_units || 0)}`),
                          React.createElement('div', { style: { fontSize: 12 } }, `Return: ${Number(p.total_return_units || 0)}`),
                          React.createElement('div', { style: { fontSize: 12 } }, `Last: ${p.last_transaction_at ? fmtDate(p.last_transaction_at) : '—'}`)
                        ),
                        React.createElement('div', null,
                          React.createElement('div', { style: { fontSize: 10, fontWeight: 700, color: 'var(--text-light)', textTransform: 'uppercase', marginBottom: 4, letterSpacing: '0.04em' } }, 'Dates'),
                          React.createElement('div', { style: { fontSize: 12 } }, `Encoded: ${p.date_encoded ? fmtDate(p.date_encoded) : '—'}`),
                          p.bale_purchase_date && React.createElement('div', { style: { fontSize: 12 } }, `Bale purchase: ${fmtDate(p.bale_purchase_date)}`),
                          p.breakdown_date && React.createElement('div', { style: { fontSize: 12 } }, `Breakdown: ${fmtDate(p.breakdown_date)}`),
                          React.createElement('div', { style: { fontSize: 12 } }, `Created: ${p.created_at ? fmtDate(p.created_at) : '—'}`),
                          React.createElement('div', { style: { fontSize: 12 } }, `Updated: ${p.updated_at ? fmtDate(p.updated_at) : '—'}`)
                        )
                      )
                    )
                  )

                  return [mainRow, detailRow].filter(Boolean)
                })
          )
        )
      )
    ),

    renderRepairModal(),
    renderQrPreviewModal()
  )
}
