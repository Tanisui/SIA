import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import JsBarcode from 'jsbarcode'
import QRCode from 'qrcode'
import { jsPDF } from 'jspdf'
import { useLocation, useNavigate } from 'react-router-dom'
import api from '../api/api.js'
import { PRODUCT_SIZE_OPTIONS } from '../constants/productSizes.js'

// ─── Helpers ───
const fmt = (n) => Number(n || 0).toLocaleString('en-PH', { style: 'currency', currency: 'PHP' })
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''
const safeDecodeScannedValue = (value) => {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}
const extractScannedCodeToken = (value) => {
  const raw = String(value || '').trim()
  if (!raw) return ''

  const compact = raw.replace(/[\r\n]+/g, '').trim()
  if (!compact) return ''

  const queryParamMatch = compact.match(/[?&](?:scan|code|barcode|sku)=([^&#\s]+)/i)
  if (queryParamMatch?.[1]) {
    return safeDecodeScannedValue(queryParamMatch[1])
  }

  const keyValueMatch = compact.match(/\b(?:scan|code|barcode|sku)\s*[:=]\s*([A-Za-z0-9._-]{1,128})\b/i)
  if (keyValueMatch?.[1]) {
    return keyValueMatch[1]
  }

  if (compact.startsWith('{') && compact.endsWith('}')) {
    try {
      const parsed = JSON.parse(compact)
      if (parsed && typeof parsed === 'object') {
        for (const key of ['scan', 'code', 'barcode', 'sku']) {
          if (parsed[key] !== undefined && parsed[key] !== null && String(parsed[key]).trim()) {
            return String(parsed[key])
          }
        }
      }
    } catch {
      // Fall through and treat the raw value as the product code.
    }
  }

  return compact
}
const normalizeScanCode = (v) => extractScannedCodeToken(v).trim().toUpperCase()

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
  DAMAGE: 'Damage',
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
    price: '',
    stock_quantity: '1',
    low_stock_threshold: '10',
    size: '',
    barcode: '',
    product_source: 'manual',
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

function parseStockOutReason(value) {
  const match = String(value || '').trim().match(/^STOCK_OUT:([A-Z_]+)(?:\s*\|\s*(.*))?$/i)
  if (!match) return null
  return { type: String(match[1] || '').toUpperCase(), detail: String(match[2] || '').trim() }
}

function formatStockOutReason(type, detail) {
  const label = getStockOutTypeLabel(type)
  if (!label) return String(detail || '').trim()

  const normalizedDetail = String(detail || '').trim()
  if (!normalizedDetail) return label
  if (normalizedDetail.toLowerCase() === label.toLowerCase()) return label
  if (normalizedDetail.toLowerCase().startsWith(`${label.toLowerCase()} - `)) return normalizedDetail
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
    return `Sale return${meta.receipt ? ` • Receipt ${meta.receipt}` : ''}${meta.disposition ? ` • ${meta.disposition}` : ''}${meta.acct_ref ? ` • Acct Ref ${meta.acct_ref}` : ''}`
  }
  if (tag === 'STOCK_OUT') {
    return `Stock out${meta.disposition ? ` • ${meta.disposition}` : ''}${meta.receipt ? ` • Receipt ${meta.receipt}` : ''}${meta.acct_ref ? ` • Acct Ref ${meta.acct_ref}` : ''}`
  }
  if (tag === 'BALE_BREAKDOWN') {
    return `Bale breakdown${meta.grade ? ` • ${toTitleCaseWords(meta.grade)}` : ''}${meta.breakdown_id ? ` • Breakdown #${meta.breakdown_id}` : ''}${meta.bale_purchase_id ? ` • Bale #${meta.bale_purchase_id}` : ''}${meta.disposition ? ` • ${toTitleCaseWords(meta.disposition)}` : ''}`
  }
  if (tag === 'BALE_PRODUCT_CREATE') {
    return `Bale product created${meta.grade ? ` • ${toTitleCaseWords(meta.grade)}` : ''}${meta.breakdown_id ? ` • Breakdown #${meta.breakdown_id}` : ''}${meta.bale_purchase_id ? ` • Bale #${meta.bale_purchase_id}` : ''}`
  }
  if (tag === 'DAMAGE_REPAIR') {
    const sourceType = String(meta.source_type || '').trim().toLowerCase()
    const sourceLabel = DAMAGE_SOURCE_LABELS[sourceType] || toTitleCaseWords(sourceType)
    const sourceId = Number(meta.source_id)
    const sourceSuffix = Number.isInteger(sourceId) && sourceId > 0 ? ` #${sourceId}` : ''
    if (sourceLabel) return `Repaired item from ${sourceLabel}${sourceSuffix}`
    return 'Repaired item intake'
  }
  return value
}

function getInventoryTransactionTypeMeta(transactionType) {
  const normalized = String(transactionType || '').trim().toUpperCase()
  if (normalized === 'IN') return { label: 'Stock In', badgeClass: 'badge-success' }
  if (normalized === 'OUT') return { label: 'Stock Out', badgeClass: 'badge-danger' }
  if (normalized === 'RETURN') return { label: 'Return', badgeClass: 'badge-warning' }
  if (normalized === 'ADJUST') return { label: 'Adjustment', badgeClass: 'badge-info' }
  return { label: normalized || 'N/A', badgeClass: 'badge-neutral' }
}

function formatTransactionReason(reason, reference = '') {
  const rawReason = String(reason || '').trim()
  if (!rawReason) return '—'
  if (/^SALE_LINK[:|]/.test(rawReason)) return 'POS sale deduction'

  const parsedRef = parseReferenceMeta(reference)
  if (parsedRef?.tag === 'SALE_LINK' && rawReason === 'POS sale deduction') return rawReason

  const parsedReason = parseStockOutReason(rawReason)
  if (parsedReason) return formatStockOutReason(parsedReason.type, parsedReason.detail)

  if (parsedRef?.tag === 'STOCK_OUT' && parsedRef.meta?.disposition) {
    if (/^stock\s*out\b/i.test(rawReason)) return rawReason
    return formatStockOutReason(parsedRef.meta.disposition, rawReason)
  }

  return rawReason
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
  // ── state ──
  const [products, setProducts] = useState([])
  const [employees, setEmployees] = useState([])
  const [categories, setCategories] = useState([])
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
  const [stockInForm, setStockInForm] = useState({ product_id: '', quantity: '', reference: '', date: '' })
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
  const [damagedSourceFilter, setDamagedSourceFilter] = useState('')
  const [damagedFrom, setDamagedFrom] = useState('')
  const [damagedTo, setDamagedTo] = useState('')
  const [repairForm, setRepairForm] = useState(createEmptyRepairForm())
  const [repairDrafts, setRepairDrafts] = useState({})
  const [selectedDamagedRecordKey, setSelectedDamagedRecordKey] = useState('')
  const [categorySearch, setCategorySearch] = useState('')
  const [categoryDropdownOpen, setCategoryDropdownOpen] = useState(false)
  const [repairCategorySearch, setRepairCategorySearch] = useState('')
  const [repairCategoryDropdownOpen, setRepairCategoryDropdownOpen] = useState(false)
  const [labelProductId, setLabelProductId] = useState('')
  const [labelScanValue, setLabelScanValue] = useState('')
  const [labelCopies, setLabelCopies] = useState('1')
  const [labelQueue, setLabelQueue] = useState([])
  const labelScanInputRef = useRef(null)
  const qrPreviewScanInputRef = useRef(null)
  const qrPreviewScanTimerRef = useRef(null)
  const posSendStateRef = useRef({ code: '', at: 0, pending: false })
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
      const [prodRes, catRes, empRes] = await Promise.allSettled([
        api.get('/products'),
        api.get('/categories'),
        api.get('/employees')
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
    if (tab === 'overview') { fetchSummary(); fetchLowStock() }
  }, [tab, fetchStockInRecords, fetchBaleStockOptions, fetchTransactions, fetchDamaged, fetchLowStock, fetchShrinkage, fetchSummary])

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

  const sendProductToPos = useCallback(async (product) => {
    const normalizedCode = normalizeScanCode(product?.barcode)
    if (!normalizedCode) {
      setError('Selected product has no barcode/QR code yet')
      return false
    }
    if (!productAvailableForPos(product)) return false

    const now = Date.now()
    const lastSend = posSendStateRef.current
    if (lastSend.pending && lastSend.code === normalizedCode) {
      return true
    }
    if (lastSend.code === normalizedCode && (now - lastSend.at) < 250) {
      return true
    }

    posSendStateRef.current = { code: normalizedCode, at: now, pending: true }
    clearMessages()
    posSendStateRef.current = { code: normalizedCode, at: Date.now(), pending: false }
    closeQrPreview()
    navigate(`/sales?tab=pos&scan=${encodeURIComponent(normalizedCode)}`, { preventScrollReset: true })
    return true
  }, [closeQrPreview, navigate, productAvailableForPos])

  const submitQrPreviewScan = useCallback(async (rawValue) => {
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
    const sent = await sendProductToPos(qrPreviewProduct)
    if (!sent) {
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
      'aria-label': 'QR preview scanner capture',
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
      return await sendProductToPos(product)
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
        reference: stockInForm.reference,
        date: stockInForm.date || undefined
      })
      setStockInForm({ product_id: '', quantity: '', reference: '', date: '' })
      showMsg('Stock in recorded successfully')
      fetchAll()
      fetchStockInRecords()
    } catch (err) { setError(err?.response?.data?.error || 'Could not record manual stock in') }
  }

  const openCreateProductModal = (overrides = {}) => {
    setEditingProduct(null)
    const nextForm = createEmptyProductForm(overrides)
    setProductForm(nextForm)

    const selectedCategory = categories.find((category) => String(category.id) === String(nextForm.category_id || ''))
    setCategorySearch(selectedCategory?.name || '')
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

      payload.name = String(payload.name || '').trim()
      payload.sku = String(payload.sku || '').trim()
      payload.barcode = String(payload.barcode || '').trim()
      payload.brand = String(payload.brand || '').trim()
      payload.description = String(payload.description || '').trim()

      payload.price = Number(payload.price)
      payload.stock_quantity = payload.stock_quantity === '' || payload.stock_quantity === undefined
        ? 1
        : Number(payload.stock_quantity)
      payload.low_stock_threshold = payload.low_stock_threshold === '' || payload.low_stock_threshold === undefined
        ? 10
        : Number(payload.low_stock_threshold)
      payload.category_id = payload.category_id ? Number(payload.category_id) : null

      if (!payload.name) return setError('Product name is required')
      if (!Number.isFinite(payload.price) || payload.price <= 0) return setError('Selling price must be greater than 0')
      if (!Number.isFinite(payload.stock_quantity) || payload.stock_quantity < 0) return setError('Stock quantity must be 0 or greater')
      payload.stock_quantity = Math.floor(payload.stock_quantity)
      payload.low_stock_threshold = Number.isFinite(payload.low_stock_threshold) ? Math.max(0, payload.low_stock_threshold) : 10

      if (!isEditing && normalizedSource === 'bale_breakdown') {
        const balePurchaseId = Number(payload.bale_purchase_id)
        if (!Number.isInteger(balePurchaseId) || balePurchaseId <= 0) {
          return setError('Choose a bale record before creating this product')
        }

        const conditionGrade = String(payload.condition_grade || '').trim().toLowerCase()
        if (!['premium', 'standard'].includes(conditionGrade)) {
          return setError('Choose Product Type: Premium or Standard')
        }

        const baleOption = baleStockOptions.find((row) => String(row.bale_purchase_id) === String(balePurchaseId))
        const availableForGrade = conditionGrade === 'premium'
          ? Number(baleOption?.pending_premium ?? 0)
          : Number(baleOption?.pending_standard ?? 0)
        const gradeLabel = conditionGrade === 'premium' ? 'Premium' : 'Standard'

        if (availableForGrade <= 0) {
          return setError(`No more ${gradeLabel} quantity available for this bale record.`)
        }

        payload.product_source = 'bale_breakdown'
        payload.bale_purchase_id = balePurchaseId
        payload.condition_grade = conditionGrade
      } else if (!isEditing) {
        payload.product_source = 'manual'
        delete payload.bale_purchase_id
        delete payload.condition_grade
      }

      delete payload.source_breakdown_id
      delete payload.allocated_cost
      delete payload.status
      delete payload.date_encoded

      if (isEditing) {
        delete payload.product_source
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
              date: new Date().toISOString().slice(0, 10)
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
        await api.post('/products', payload)
        const gradeLabel = payload.condition_grade === 'premium'
          ? 'Premium'
          : payload.condition_grade === 'standard'
            ? 'Standard'
            : null

        showMsg(gradeLabel ? `${gradeLabel} product created successfully.` : 'Product created')
        await Promise.all([
          fetchAll(),
          fetchBaleStockOptions(),
          fetchStockInRecords()
        ])
      }

      setProductForm(createEmptyProductForm())
      setCategorySearch('')
      setEditingProduct(null)
      setShowProductModal(false)
    } catch (err) { setError(err?.response?.data?.error || 'Save product failed') }
  }

  const startEditProduct = (p) => {
    setEditingProduct(p.id)
    setProductForm({
      sku: p.sku || '', name: p.name || '', brand: p.brand || '', description: p.description || '',
      category_id: p.category_id || '', price: p.price || '',
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
  const selectedBaleStockOption = useMemo(() => (
    baleStockOptions.find((row) => String(row.bale_purchase_id) === String(selectedBaleStockOptionId)) || null
  ), [baleStockOptions, selectedBaleStockOptionId])
  const selectedBaleListedProducts = useMemo(() => (
    !selectedBaleStockOption
      ? []
      : listedProducts.filter((product) => String(product?.bale_purchase_id || '') === String(selectedBaleStockOptionId))
  ), [listedProducts, selectedBaleStockOption, selectedBaleStockOptionId])
  const selectedBaleReadyProducts = useMemo(() => (
    selectedBaleListedProducts.filter((product) => Number(product?.stock_quantity || 0) > 0)
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
    ? selectedBaleReadyProducts.length
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
  const isSystemManagedProductQuantity = isCreateBaleSource || isEditingBaleProduct || isEditingRepairedProduct
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
    'stock-in': { title: 'Stock In', subtitle: 'Review bale availability, then create each item one by one in Product Management with complete product details.' },
    'stock-out': { title: 'Stock Out', subtitle: 'Record adjustments, shrinkage, and damage.' },
    'products': { title: 'Product Management', subtitle: 'Create, edit, and manage sellable products, including received repaired items.' },
    'barcode-labels': { title: 'Barcode Labels', subtitle: 'Print barcodes and QR labels for products.' },
    'transactions': { title: 'Inventory Transactions', subtitle: 'View all inventory transactions and adjustments.' },
    'damaged': { title: 'Damaged Items', subtitle: 'Track damage recorded from manual stock-out, sales returns, and bale breakdown data, then receive repaired items back into Product Management.' },
    'low-stock': { title: 'Low Stock Alerts', subtitle: 'Monitor products below threshold quantity.' },
    'shrinkage': { title: 'Shrinkage Report', subtitle: 'Losses from theft, errors, or unexplained causes.' },
    'reports': { title: 'Inventory Reports', subtitle: 'Analytics and detailed inventory reports.' }
  }
  const currentLabel = tabLabels[tab] || tabLabels['overview']
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
      lowStock.length > 0 && React.createElement('div', { className: 'card', style: { marginTop: 20 } },
        React.createElement('h3', { style: { marginBottom: 12 } }, 'Low Stock Alerts'),
        React.createElement('div', { className: 'table-wrap' },
          React.createElement('table', null,
            React.createElement('thead', null,
              React.createElement('tr', null,
                React.createElement('th', null, 'SKU'),
                React.createElement('th', null, 'Product'),
                React.createElement('th', null, 'Stock'),
                React.createElement('th', null, 'Threshold')
              )
            ),
            React.createElement('tbody', null,
              lowStock.map(p => React.createElement('tr', { key: p.id },
                React.createElement('td', null, p.sku || '—'),
                React.createElement('td', null, p.name),
                React.createElement('td', { style: { color: 'var(--error)', fontWeight: 600 } }, p.stock_quantity),
                React.createElement('td', null, p.low_stock_threshold)
              ))
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
              React.createElement('div', { className: 'form-group', style: { maxWidth: 560, marginBottom: 14 } },
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
                    ? `Selected batch ${selectedBaleStockOption.bale_batch_no || '-'}: Left ${selectedBaleLeftToStockIn}, Ready ${selectedBaleReadyForProductManagement}, Breakdown date ${fmtDate(selectedBaleStockOption.breakdown_date || selectedBaleStockOption.purchase_date)}.`
                    : 'Choose a bale record from the list to start stock in.'
                ),
                React.createElement('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap' } },
                  React.createElement('button', {
                    type: 'button',
                    className: 'btn btn-primary',
                    disabled: !selectedBaleStockOptionId || selectedBaleLeftToStockIn <= 0,
                    onClick: startBaleIndividualCreate
                  }, selectedBaleLeftToStockIn <= 0 ? 'No Quantity Left' : 'Create Individual Product'),
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
              }, 'Automatic bale stock-in is disabled. Use Product Management to create one item at a time with full details.'),
              React.createElement('div', {
                style: {
                  marginTop: 12,
                  fontSize: 12,
                  color: 'var(--text-light)'
                }
              }, `All records: ${baleStockSummary.breakdownRecords} | Left to stock in: ${baleStockSummary.leftToStockIn} | Ready for Product Management: ${baleStockSummary.readyForProductManagement}`)
            )
          : React.createElement('form', { onSubmit: handleStockIn },
              React.createElement('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 } },
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
    tab === 'stock-out' && React.createElement('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 } },
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
      React.createElement('div', { className: 'inventory-products-toolbar', style: { marginBottom: 16 } },
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
                      setProductForm((form) => ({
                        ...form,
                        product_source: nextSource,
                        bale_purchase_id: nextSource === 'bale_breakdown'
                          ? (form.bale_purchase_id || String(selectedBaleStockOptionId || ''))
                          : '',
                        condition_grade: nextSource === 'bale_breakdown'
                          ? (String(form.condition_grade || '').trim().toLowerCase() === 'standard' ? 'standard' : 'premium')
                          : 'premium'
                      }))
                    }
                  },
                    React.createElement('option', { value: 'manual' }, 'Manual'),
                    React.createElement('option', { value: 'bale_breakdown' }, 'From Bale Record')
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
                      setProductForm((form) => ({ ...form, bale_purchase_id: nextBalePurchaseId }))
                      setSelectedBaleStockOptionId(nextBalePurchaseId)
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
              React.createElement('label', { className: 'form-label' }, 'Product Type *'),
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
              React.createElement('label', { className: 'form-label' }, 'Name *'),
              React.createElement('input', { className: 'form-input', value: productForm.name, onChange: e => setProductForm(f => ({ ...f, name: e.target.value })), required: true })
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
                onChange: e => { setCategorySearch(e.target.value); setCategoryDropdownOpen(true); if (!e.target.value) setProductForm(f => ({ ...f, category_id: '' })) },
                onFocus: () => setCategoryDropdownOpen(true),
                placeholder: '— Search or select category —',
                autoComplete: 'off'
              }),
              categoryDropdownOpen && React.createElement('div', {
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
                        onMouseDown: (e) => { e.preventDefault(); setProductForm(f => ({ ...f, category_id: c.id })); setCategorySearch(c.name); setCategoryDropdownOpen(false) },
                        onMouseEnter: (e) => { e.currentTarget.style.background = 'var(--gold-light, #fef3c7)' },
                        onMouseLeave: (e) => { e.currentTarget.style.background = String(productForm.category_id) === String(c.id) ? 'var(--gold-light, #fef3c7)' : 'transparent' }
                      }, c.name))
              ),
              categoryDropdownOpen && React.createElement('div', {
                style: { position: 'fixed', inset: 0, zIndex: 49 },
                onClick: () => setCategoryDropdownOpen(false)
              })
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
                min: 0,
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
            (isCreateBaleSource || isEditingBaleProduct) && React.createElement('div', { style: { marginTop: 4 } },
              isEditingBaleProduct
                ? 'Product Type (Premium or Standard) is locked for bale-linked products and cannot be changed during edit.'
                : `Available for ${productFormSelectedGrade === 'premium' ? 'Premium' : 'Standard'}: ${productFormAvailableForSelectedGrade}.`
            ),
            isSystemManagedProductQuantity && React.createElement('div', { style: { marginTop: 4 } },
              isEditingRepairedProduct
                ? 'Quantity for received repaired products is created from the Damaged tab and cannot be edited here.'
                : 'Quantity for bale-linked products is created from the bale record flow and cannot be edited here.'
            )
          ),
          React.createElement('div', { className: 'inventory-product-form-actions', style: { display: 'flex', gap: 8 } },
            React.createElement('button', { type: 'submit', className: 'btn btn-primary' }, editingProduct ? 'Update Product' : 'Create Product'),
            React.createElement('button', { type: 'button', className: 'btn btn-secondary', onClick: () => { setShowProductModal(false); setCategorySearch('') } }, 'Cancel')
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
          ? `All active products listed: ${listedProducts.length}. Products linked to selected bale ${selectedBaleStockOption.bale_batch_no || '-'}: ${selectedBaleListedProducts.length}. In-stock products for this selected bale: ${selectedBaleReadyForProductManagement}.`
          : `All active products listed: ${listedProducts.length}. Repaired items received from Damaged appear here as individual products ready to sell.`
      ),
      React.createElement('div', { className: 'table-wrap responsive inventory-products-table' },
        React.createElement('table', { className: 'inventory-products-grid-table' },
          React.createElement('thead', null,
            React.createElement('tr', null,
              React.createElement('th', null, 'Product'),
              React.createElement('th', null, 'Source'),
              React.createElement('th', null, 'Price'),
              React.createElement('th', null, 'Stock'),
              React.createElement('th', null, 'Actions')
            )
          ),
          React.createElement('tbody', null,
            listedProducts.length === 0
              ? React.createElement('tr', null, React.createElement('td', { colSpan: 5, style: { textAlign: 'center', color: 'var(--text-light)', padding: 24 } }, 'No products found.'))
              : listedProducts.map((p) => {
                const linkedBaleOption = Number(p?.bale_purchase_id || 0) > 0
                  ? baleOptionByPurchaseId.get(String(p.bale_purchase_id))
                  : null

                return React.createElement('tr', { key: p.id },
              React.createElement('td', { className: 'inventory-product-cell-main' },
                React.createElement('div', { className: 'inventory-product-primary' }, p.name || 'Unnamed product'),
                React.createElement('div', { className: 'inventory-product-meta' }, `${p.sku || 'No SKU'} • ${p.barcode || 'No barcode'}`),
                React.createElement('div', { className: 'inventory-product-meta' }, `${p.brand || 'No brand'} • ${p.category || 'Uncategorized'}`)
              ),
              React.createElement('td', { className: 'inventory-product-cell-source' },
                React.createElement('div', { className: 'inventory-product-chips' },
                  React.createElement('span', { className: 'inventory-chip' }, productSourceLabel(p)),
                  p.condition_grade
                    ? React.createElement('span', { className: 'inventory-chip inventory-chip--subtle' }, toTitleCaseWords(p.condition_grade))
                    : (productSourceKey(p) === 'repaired_damage'
                        ? React.createElement('span', { className: 'inventory-chip inventory-chip--subtle' }, 'Ready to Sell')
                        : null),
                  linkedBaleOption?.bale_batch_no && React.createElement('span', { className: 'inventory-chip inventory-chip--subtle' }, linkedBaleOption.bale_batch_no)
                )
              ),
              React.createElement('td', { className: 'inventory-product-cell-price', style: { fontWeight: 600 } }, fmt(p.price)),
              React.createElement('td', { className: 'inventory-product-cell-stock' },
                React.createElement('div', {
                  className: 'inventory-stock-pill',
                  style: { color: p.stock_quantity <= (p.low_stock_threshold || 10) ? 'var(--error)' : 'var(--success)' }
                }, p.stock_quantity),
                React.createElement('div', { className: 'inventory-product-meta' }, `Alert at ${p.low_stock_threshold || 10}`)
              ),
              React.createElement('td', { className: 'inventory-product-cell-actions' },
                React.createElement('div', { className: 'product-table-actions inventory-product-actions' },
                  React.createElement('button', {
                    type: 'button',
                    className: 'product-action-icon',
                    title: 'View QR',
                    'aria-label': `View QR for ${p.name}`,
                    onClick: () => openQrPreview(p)
                  }, qrActionIcon()),
                  React.createElement('button', {
                    type: 'button',
                    className: 'product-action-icon',
                    title: 'Edit product',
                    'aria-label': `Edit ${p.name}`,
                    onClick: () => startEditProduct(p)
                  }, editActionIcon()),
                  React.createElement('button', {
                    type: 'button',
                    className: 'product-action-icon product-action-icon--danger',
                    title: 'Delete product',
                    'aria-label': `Delete ${p.name}`,
                    onClick: () => deleteProduct(p.id),
                    style: undefined
                  }, deleteActionIcon())
                )
              )
            )})
          )
        )
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
        React.createElement('div', { style: { display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 140px auto', gap: 12, alignItems: 'end' } },
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

    tab === 'transactions' && React.createElement('div', { className: 'card' },
      React.createElement('div', { style: { marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12 } },
        React.createElement('h3', { style: { flex: 1, margin: 0 } }, 'Inventory Transactions'),
        React.createElement('select', { className: 'form-input', style: { width: 200 }, value: filterType, onChange: e => setFilterType(e.target.value) },
          React.createElement('option', { value: '' }, 'All types'),
          React.createElement('option', { value: 'IN' }, 'Stock In'),
          React.createElement('option', { value: 'OUT' }, 'Stock Out'),
          React.createElement('option', { value: 'ADJUST' }, 'Adjustments'),
          React.createElement('option', { value: 'RETURN' }, 'Returns')
        )
      ),
      React.createElement('div', { className: 'table-wrap' },
        React.createElement('table', null,
          React.createElement('thead', null,
            React.createElement('tr', null,
              React.createElement('th', null, 'Type'),
              React.createElement('th', null, 'Reference'),
              React.createElement('th', null, 'Date'),
              React.createElement('th', null, 'Quantity'),
              React.createElement('th', null, 'Details'),
              React.createElement('th', null, 'User')
            )
          ),
          React.createElement('tbody', null,
            transactions.length === 0
              ? React.createElement('tr', null,
                  React.createElement('td', { colSpan: 6, style: { textAlign: 'center', color: 'var(--text-light)', padding: 24 } }, 'No transactions found.')
                )
              : transactions.map((t) => {
              const legacySaleLinkInReason = !String(t.reference || '').trim() && /^SALE_LINK[:|]/.test(String(t.reason || '').trim())
              const resolvedReference = legacySaleLinkInReason ? t.reason : t.reference
              const resolvedReason = formatTransactionReason(t.reason, resolvedReference)
              const typeMeta = getInventoryTransactionTypeMeta(t.transaction_type)
              const qtyColor = t.quantity > 0 ? 'var(--success)' : 'var(--error)'
              const qtyLabel = t.quantity > 0 ? `+${t.quantity}` : t.quantity

              return React.createElement('tr', { key: t.id },
                React.createElement('td', null,
                  React.createElement('span', { className: `badge ${typeMeta.badgeClass}` }, typeMeta.label)
                ),
                React.createElement('td', null,
                  React.createElement('div', { style: { fontWeight: 600, lineHeight: 1.35, wordBreak: 'break-word' } }, formatTransactionReference(resolvedReference)),
                  React.createElement('div', { style: { fontSize: 11, color: 'var(--text-light)' } }, `${t.sku ? t.sku + ' — ' : ''}${t.product_name || ''}`)
                ),
                React.createElement('td', null, fmtDate(t.created_at)),
                React.createElement('td', { style: { fontWeight: 600, color: qtyColor } }, qtyLabel),
                React.createElement('td', null,
                  React.createElement('div', { style: { lineHeight: 1.35, wordBreak: 'break-word' } }, resolvedReason),
                  React.createElement('div', { style: { fontSize: 11, color: 'var(--text-light)' } }, `Balance after: ${t.balance_after}`)
                ),
                React.createElement('td', null, t.user_name || '—')
              )
            })
          )
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
      React.createElement('div', { className: 'table-wrap responsive inventory-damaged-table-wrap' },
        React.createElement('table', { className: 'inventory-damaged-table' },
          React.createElement('thead', null,
            React.createElement('tr', null,
              React.createElement('th', { style: { minWidth: 150 } }, 'Date'),
              React.createElement('th', { style: { minWidth: 290 } }, 'Record'),
              React.createElement('th', { style: { minWidth: 215 } }, 'Status'),
              React.createElement('th', { style: { minWidth: 240 } }, 'Notes'),
              React.createElement('th', { style: { minWidth: 160, textAlign: 'center' } }, 'Action')
            )
          ),
          React.createElement('tbody', null,
            damaged.length === 0
              ? React.createElement('tr', null,
                  React.createElement('td', { colSpan: 5, style: { textAlign: 'center', color: 'var(--text-light)', padding: 24 } }, 'No damaged records found for this filter.')
                )
              : damaged.map((d) => {
                const rowKey = String(d.record_key || `${d.damage_source_type || 'damage'}-${d.damage_source_id || d.id || ''}`)
                const originalQty = Number(d.original_quantity ?? d.quantity ?? 0)
                const repairedQty = Number(d.repaired_quantity || 0)
                const remainingQty = Number(d.remaining_quantity ?? d.quantity ?? 0)
                const rowSelected = rowKey === selectedDamagedRecordKey

                return React.createElement('tr', {
                  key: rowKey,
                  style: rowSelected ? { background: 'rgba(184, 134, 11, 0.08)' } : undefined
                },
                React.createElement('td', null,
                  React.createElement('div', { className: 'inventory-product-primary', style: { fontSize: 14 } }, fmtDate(d.created_at)),
                  React.createElement('div', { className: 'inventory-product-meta' }, d.reported_by_name ? `Reported by ${d.reported_by_name}` : 'Reporter not set')
                ),
                React.createElement('td', null,
                  React.createElement('div', { className: 'inventory-product-primary' }, d.product_name || 'Damaged item'),
                  React.createElement('div', { className: 'inventory-product-meta' }, d.sku ? `SKU ${d.sku}` : `Source ID #${d.damage_source_id || '-'}`),
                  React.createElement('div', { className: 'inventory-product-chips', style: { marginTop: 8 } },
                    React.createElement('span', { className: 'inventory-chip' }, d.source_label || 'Inventory'),
                    rowSelected ? React.createElement('span', { className: 'inventory-chip inventory-chip--subtle' }, 'Selected') : null
                  )
                ),
                React.createElement('td', null,
                  React.createElement('div', { className: 'inventory-damaged-status' },
                    React.createElement('span', { className: 'inventory-chip inventory-chip--danger' }, `Original ${originalQty}`),
                    React.createElement('span', { className: 'inventory-chip inventory-chip--warning' }, `Received ${repairedQty}`),
                    React.createElement('span', { className: `inventory-chip ${remainingQty > 0 ? 'inventory-chip--success' : 'inventory-chip--subtle'}` }, `Left ${remainingQty}`)
                  )
                ),
                React.createElement('td', null,
                  React.createElement('div', { className: 'inventory-damaged-reason' }, formatTransactionReason(d.reason, d.reference))
                ),
                React.createElement('td', { style: { textAlign: 'center' } },
                  React.createElement('button', {
                    type: 'button',
                    className: `btn ${remainingQty <= 0 ? 'btn-secondary' : 'btn-primary'} btn-sm inventory-damaged-repair-btn`,
                    onClick: () => startRepairDamagedItem(d),
                    disabled: remainingQty <= 0
                  }, remainingQty <= 0 ? 'Complete' : 'Receive Repaired')
                ))
              })
          )
        )
      )
    ),

    // ═══════════════ LOW STOCK ═══════════════
    tab === 'low-stock' && React.createElement('div', null,
      React.createElement('div', { className: 'table-wrap' },
        React.createElement('table', null,
          React.createElement('thead', null,
            React.createElement('tr', null,
              React.createElement('th', null, 'SKU'),
              React.createElement('th', null, 'Product'),
              React.createElement('th', null, 'Category'),
              React.createElement('th', null, 'Current Stock'),
              React.createElement('th', null, 'Threshold')
            )
          ),
          React.createElement('tbody', null,
            lowStock.length === 0
              ? React.createElement('tr', null, React.createElement('td', { colSpan: 5, style: { textAlign: 'center', color: 'var(--text-light)', padding: 24 } }, 'No low stock items — all good!'))
              : lowStock.map(p => React.createElement('tr', { key: p.id },
                  React.createElement('td', null, p.sku || '—'),
                  React.createElement('td', null, p.name),
                  React.createElement('td', null, p.category || '—'),
                  React.createElement('td', { style: { fontWeight: 600, color: 'var(--error)' } }, p.stock_quantity),
                  React.createElement('td', null, p.low_stock_threshold)
                ))
          )
        )
      )
    ),

    // ═══════════════ SHRINKAGE ═══════════════
    tab === 'shrinkage' && React.createElement('div', null,
      React.createElement('h3', { style: { marginBottom: 12 } }, 'Shrinkage Report (Losses from Theft or Errors)'),
      React.createElement('div', { className: 'table-wrap' },
        React.createElement('table', null,
          React.createElement('thead', null,
            React.createElement('tr', null,
              React.createElement('th', null, 'SKU'),
              React.createElement('th', null, 'Product'),
              React.createElement('th', null, 'Total Shrinkage'),
              React.createElement('th', null, 'Incidents'),
              React.createElement('th', null, 'Reason')
            )
          ),
          React.createElement('tbody', null,
            shrinkage.length === 0
              ? React.createElement('tr', null, React.createElement('td', { colSpan: 5, style: { textAlign: 'center', color: 'var(--text-light)', padding: 24 } }, 'No shrinkage recorded'))
              : shrinkage.map(s => React.createElement('tr', { key: s.product_id },
                  React.createElement('td', null, s.sku || '—'),
                  React.createElement('td', null, s.product_name),
                  React.createElement('td', { style: { fontWeight: 600, color: 'var(--error)' } }, s.total_shrinkage),
                  React.createElement('td', null, s.incidents),
                  React.createElement('td', null, formatGroupedTransactionReasons(s.reasons))
                ))
          )
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
          React.createElement('div', { className: 'card-title' }, 'Low Stock Count'),
          React.createElement('div', { className: 'card-value', style: { color: summary.lowStockCount > 0 ? 'var(--error)' : 'var(--success)' } }, summary.lowStockCount)
        )
      ),
      React.createElement('div', { className: 'table-wrap', style: { marginTop: 20 } },
        React.createElement('table', null,
          React.createElement('thead', null,
            React.createElement('tr', null,
              React.createElement('th', null, 'SKU'),
              React.createElement('th', null, 'Product'),
              React.createElement('th', null, 'Category'),
              React.createElement('th', null, 'Stock'),
              React.createElement('th', null, 'Price'),
              React.createElement('th', null, 'Stock Value')
            )
          ),
          React.createElement('tbody', null,
            (summary.products || []).map(p => React.createElement('tr', { key: p.id },
              React.createElement('td', null, p.sku || '—'),
              React.createElement('td', null, p.name),
              React.createElement('td', null, p.category || '—'),
              React.createElement('td', { style: { fontWeight: 600, color: p.stock_quantity <= p.low_stock_threshold ? 'var(--error)' : 'var(--text-dark)' } }, p.stock_quantity),
              React.createElement('td', null, fmt(p.price)),
              React.createElement('td', { style: { fontWeight: 500 } }, fmt(p.stock_value))
            ))
          )
        )
      )
    ),

    renderRepairModal(),
    renderQrPreviewModal()
  )
}
