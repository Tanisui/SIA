import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import JsBarcode from 'jsbarcode'
import QRCode from 'qrcode'
import { jsPDF } from 'jspdf'
import { useLocation, useNavigate } from 'react-router-dom'
import api from '../api/api.js'

// ─── Helpers ───
const fmt = (n) => Number(n || 0).toLocaleString('en-PH', { style: 'currency', currency: 'PHP' })
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''
const normalizeScanCode = (v) => String(v || '').trim().toUpperCase()

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
  'returns',
  'purchase-orders',
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
  return value
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
  const [suppliers, setSuppliers] = useState([])
  const [employees, setEmployees] = useState([])
  const [categories, setCategories] = useState([])
  const [transactions, setTransactions] = useState([])
  const [damaged, setDamaged] = useState([])
  const [lowStock, setLowStock] = useState([])
  const [shrinkage, setShrinkage] = useState([])
  const [purchaseOrders, setPurchaseOrders] = useState([])
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)
  const location = useLocation()
  const navigate = useNavigate()

  // forms
  const [stockInForm, setStockInForm] = useState({ product_id: '', quantity: '', reference: '', date: '' })
  const [adjustForm, setAdjustForm] = useState({ product_id: '', quantity: '', reason: '', employee_id: '' })
  const [damageForm, setDamageForm] = useState({ product_id: '', quantity: '', reason: '', employee_id: '' })
  const [returnForm, setReturnForm] = useState({ product_id: '', quantity: '', return_type: 'supplier', reason: '' })
  const [stockInBarcode, setStockInBarcode] = useState('')
  const [adjustBarcode, setAdjustBarcode] = useState('')
  const [damageBarcode, setDamageBarcode] = useState('')
  const [returnBarcode, setReturnBarcode] = useState('')
  const [poForm, setPoForm] = useState({ supplier_id: '', expected_date: '', items: [{ product_id: '', quantity: '', unit_cost: '' }] })
  const [productForm, setProductForm] = useState({ sku: '', name: '', brand: '', description: '', category_id: '', price: '', cost: '', stock_quantity: '', low_stock_threshold: '10', size: '', color: '', barcode: '' })
  const [editingProduct, setEditingProduct] = useState(null)
  const [showProductModal, setShowProductModal] = useState(false)
  const [qrPreviewProduct, setQrPreviewProduct] = useState(null)
  const [qrPreviewSrc, setQrPreviewSrc] = useState('')
  const [qrPreviewLoading, setQrPreviewLoading] = useState(false)
  const [qrPreviewScanValue, setQrPreviewScanValue] = useState('')
  const [filterType, setFilterType] = useState('')
  const [categorySearch, setCategorySearch] = useState('')
  const [categoryDropdownOpen, setCategoryDropdownOpen] = useState(false)
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
      const [prodRes, catRes, empRes] = await Promise.all([
        api.get('/products'),
        api.get('/categories'),
        api.get('/employees')
      ])
      setProducts(prodRes.data || [])
      setCategories(catRes.data || [])
      setEmployees(empRes.data || [])

      try {
        const supRes = await api.get('/suppliers')
        setSuppliers(supRes.data || [])
      } catch (e) { /* ignore suppliers fetch error */ }
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

  const fetchLowStock = useCallback(async () => {
    try { const res = await api.get('/inventory/alerts/low-stock'); setLowStock(res.data || []) } catch (e) { /* ignore */ }
  }, [])

  const fetchDamaged = useCallback(async () => {
    try { const res = await api.get('/inventory/damaged'); setDamaged(res.data || []) } catch (e) { /* ignore */ }
  }, [])

  const fetchShrinkage = useCallback(async () => {
    try { const res = await api.get('/inventory/reports/shrinkage'); setShrinkage(res.data || []) } catch (e) { /* ignore */ }
  }, [])

  const fetchSummary = useCallback(async () => {
    try { const res = await api.get('/inventory/reports/summary'); setSummary(res.data) } catch (e) { /* ignore */ }
  }, [])

  const fetchPOs = useCallback(async () => {
    try { const res = await api.get('/purchase-orders'); setPurchaseOrders(res.data || []) } catch (e) { /* ignore */ }
  }, [])

  const fetchSuppliers = useCallback(async () => {
    try {
      const supRes = await api.get('/suppliers')
      setSuppliers(supRes.data || [])
    } catch (e) { /* ignore */ }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])
  useEffect(() => {
    if (tab === 'transactions') fetchTransactions()
    if (tab === 'damaged') fetchDamaged()
    if (tab === 'low-stock') fetchLowStock()
    if (tab === 'shrinkage') fetchShrinkage()
    if (tab === 'reports') fetchSummary()
    if (tab === 'purchase-orders') { fetchPOs(); fetchSuppliers() }
    if (tab === 'overview') { fetchSummary(); fetchLowStock() }
  }, [tab, fetchTransactions, fetchDamaged, fetchLowStock, fetchShrinkage, fetchSummary, fetchPOs, fetchSuppliers])

  useEffect(() => {
    if (location.pathname !== '/inventory') return
    const params = new URLSearchParams(location.search)
    const currentTab = String(params.get('tab') || '').trim()
    if (currentTab === tab && !location.hash) return
    params.set('tab', tab)
    navigate(`/inventory?${params.toString()}`, { replace: true, preventScrollReset: true })
  }, [location.pathname, location.search, location.hash, tab, navigate])

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
    
    // Validate against threshold
    const selectedProduct = products.find(p => p.id === Number(stockInForm.product_id))
    if (selectedProduct) {
      const newTotal = selectedProduct.stock_quantity + Number(stockInForm.quantity)
      const threshold = selectedProduct.low_stock_threshold || 10
      if (selectedProduct.stock_quantity > threshold) {
        setError(`Cannot add stock: ${selectedProduct.name} is already above low stock threshold (Current: ${selectedProduct.stock_quantity}, Threshold: ${threshold})`)
        return
      }
      if (newTotal > threshold * 10) {
        setError(`Warning: Adding ${stockInForm.quantity} items would bring total to ${newTotal}, which is ${Math.floor(newTotal/threshold)}x the threshold. Please verify this is correct.`)
        return
      }
    }
    
    try {
      await api.post('/inventory/stock-in', {
        product_id: Number(stockInForm.product_id),
        quantity: Number(stockInForm.quantity),
        reference: stockInForm.reference,
        date: stockInForm.date || undefined
      })
      setStockInForm({ product_id: '', quantity: '', reference: '', date: '' })
      setStockInBarcode('')
      showMsg('Stock in recorded successfully')
      fetchAll()
    } catch (err) { setError(err?.response?.data?.error || 'Stock in failed') }
  }

  // ── Receive PO ──
  const handleReceivePO = async (poId) => {
    clearMessages()
    if (!confirm('Receive this purchase order and add items to inventory?')) return
    try {
      await api.post('/inventory/stock-in/receive-po', { purchase_order_id: poId })
      showMsg('Purchase order received — stock updated')
      fetchPOs(); fetchAll()
    } catch (err) { setError(err?.response?.data?.error || 'Receive PO failed') }
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
    } catch (err) { setError(err?.response?.data?.error || 'Damage record failed') }
  }

  // ── Return ──
  const handleReturn = async (e) => {
    e.preventDefault(); clearMessages()
    try {
      await api.post('/inventory/returns', {
        product_id: Number(returnForm.product_id),
        quantity: Number(returnForm.quantity),
        return_type: 'supplier',
        reason: returnForm.reason
      })
      setReturnForm({ product_id: '', quantity: '', return_type: 'supplier', reason: '' })
      setReturnBarcode('')
      showMsg('Return processed')
      fetchAll()
    } catch (err) { setError(err?.response?.data?.error || 'Return failed') }
  }

  // ── Create PO ──
  const handleCreatePO = async (e) => {
    e.preventDefault(); clearMessages()
    try {
      const items = poForm.items.filter(i => i.product_id && i.quantity).map(i => ({
        product_id: Number(i.product_id), quantity: Number(i.quantity), unit_cost: Number(i.unit_cost) || 0
      }))
      await api.post('/purchase-orders', {
        supplier_id: Number(poForm.supplier_id),
        expected_date: poForm.expected_date || undefined,
        items
      })
      setPoForm({ supplier_id: '', expected_date: '', items: [{ product_id: '', quantity: '', unit_cost: '' }] })
      showMsg('Purchase order created')
      fetchPOs()
    } catch (err) { setError(err?.response?.data?.error || 'Create PO failed') }
  }

  const addPoItem = () => {
    setPoForm(prev => ({ ...prev, items: [...prev.items, { product_id: '', quantity: '', unit_cost: '' }] }))
  }

 const updatePoItem = (idx, field, val) => {
  setPoForm(prev => {
    const items = [...prev.items]
    items[idx] = { ...items[idx], [field]: val }
    
    // Auto-fill unit cost when product is selected
    if (field === 'product_id' && val) {
      const selectedProduct = products.find(p => p.id === Number(val))
      if (selectedProduct && selectedProduct.cost) {
        items[idx].unit_cost = selectedProduct.cost
      }
    }
    
    return { ...prev, items }
  })
}

  const removePoItem = (idx) => {
    setPoForm(prev => ({ ...prev, items: prev.items.filter((_, i) => i !== idx) }))
  }

  // ── Cancel PO ──
  const handleCancelPO = async (id) => {
    clearMessages()
    if (!confirm('Cancel this purchase order?')) return
    try {
      await api.post(`/purchase-orders/${id}/cancel`)
      showMsg('Purchase order cancelled')
      fetchPOs()
    } catch (err) { setError(err?.response?.data?.error || 'Cancel PO failed') }
  }

  // ── Product CRUD ──
  const handleSaveProduct = async (e) => {
    e.preventDefault(); clearMessages()
    try {
      const payload = { ...productForm }
      payload.sku = String(payload.sku || '').trim()
      payload.barcode = String(payload.barcode || '').trim()
      if (payload.price) payload.price = Number(payload.price)
      if (payload.cost) payload.cost = Number(payload.cost)
      if (payload.stock_quantity) payload.stock_quantity = Number(payload.stock_quantity)
      if (payload.low_stock_threshold) payload.low_stock_threshold = Number(payload.low_stock_threshold)
      if (payload.category_id) payload.category_id = Number(payload.category_id)
      if (!payload.sku) delete payload.sku
      if (!payload.barcode && !editingProduct) delete payload.barcode

      if (editingProduct) {
        await api.put(`/products/${editingProduct}`, payload)
        showMsg('Product updated')
      } else {
        await api.post('/products', payload)
        showMsg('Product created')
      }
      setProductForm({ sku: '', name: '', brand: '', description: '', category_id: '', price: '', cost: '', stock_quantity: '', low_stock_threshold: '10', size: '', color: '', barcode: '' })
      setCategorySearch('')
      setEditingProduct(null)
      setShowProductModal(false)
      fetchAll()
    } catch (err) { setError(err?.response?.data?.error || 'Save product failed') }
  }

  const startEditProduct = (p) => {
    setEditingProduct(p.id)
    setProductForm({
      sku: p.sku || '', name: p.name || '', brand: p.brand || '', description: p.description || '',
      category_id: p.category_id || '', price: p.price || '', cost: p.cost || '',
      stock_quantity: p.stock_quantity || '', low_stock_threshold: p.low_stock_threshold || '10',
      size: p.size || '', color: p.color || '', barcode: p.barcode || ''
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
  const barcodeReadyProducts = products.filter((p) => normalizeScanCode(p.barcode))
  const productOptions = products.map(p =>
    React.createElement('option', { key: p.id, value: p.id }, `${p.sku ? p.sku + ' — ' : ''}${p.name} (Stock: ${p.stock_quantity})`)
  )
  const barcodeProductOptions = barcodeReadyProducts.map((p) =>
    React.createElement('option', { key: `barcode-${p.id}`, value: p.id }, `${p.sku ? `${p.sku} - ` : ''}${p.name} (${normalizeScanCode(p.barcode)})`)
  )
  const supplierOptions = suppliers.map(s =>
    React.createElement('option', { key: s.id, value: s.id }, s.name)
  )
  const employeeOptions = employees.map(e =>
    React.createElement('option', { key: e.id, value: e.id }, e.name)
  )

  // ── Tabs ──
  const resolvedLabelRows = buildLabelRows()
  const totalLabelCopies = resolvedLabelRows.reduce((sum, row) => sum + (Number(row.copies) || 0), 0)
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

  return React.createElement('div', { className: 'page' },
    React.createElement('div', { className: 'page-header' },
      React.createElement('div', null,
        React.createElement('h1', { className: 'page-title' }, 'Inventory Management'),
        React.createElement('p', { className: 'page-subtitle' }, 'Track stock-in, stock-out, supplier returns, damages, and purchase orders. Use Purchase Orders for replenishment.')
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
      )
    ),

    // ═══════════════ STOCK IN ═══════════════
    tab === 'stock-in' && React.createElement('div', null,
      React.createElement('div', { className: 'card' },
        React.createElement('h3', { style: { marginBottom: 16 } }, 'Direct Purchase — Stock In'),
        React.createElement('form', { onSubmit: handleStockIn },
          React.createElement('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 } },
            React.createElement('div', { className: 'form-group' },
              React.createElement('label', { className: 'form-label' }, 'Scan Barcode'),
              React.createElement('input', {
                className: 'form-input',
                value: stockInBarcode,
                onChange: (e) => setStockInBarcode(e.target.value),
                onKeyDown: (e) => {
                  if (e.key !== 'Enter') return
                  e.preventDefault()
                  handleFormBarcodeScan(e.currentTarget.value, setStockInBarcode, setStockInForm)
                },
                placeholder: 'Scan barcode then press Enter'
              })
            ),
            React.createElement('div', { className: 'form-group' },
              React.createElement('label', { className: 'form-label' }, 'Product *'),
              React.createElement('select', {
                className: 'form-input',
                value: stockInForm.product_id,
                onChange: (e) => {
                  const nextProductId = e.target.value
                  setStockInForm((f) => ({ ...f, product_id: nextProductId }))
                  const selected = products.find((p) => String(p.id) === String(nextProductId))
                  setStockInBarcode(selected?.barcode || '')
                },
                required: true
              },
                React.createElement('option', { value: '' }, '— Select product —'),
                ...productOptions
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
          React.createElement('p', { style: { marginTop: 6, fontSize: 12, color: 'var(--text-light)' } },
            'Direct Stock-In is an emergency/manual fallback. For normal replenishment, use Purchase Orders so supplier, expected date, and unit cost are tracked before receiving.'
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

    // ═══════════════ RETURNS ═══════════════
    tab === 'returns' && React.createElement('div', null,
      React.createElement('div', { className: 'card' },
        React.createElement('h3', { style: { marginBottom: 16 } }, 'Supplier Return (Inventory Out Only)'),
        React.createElement('form', { onSubmit: handleReturn },
          React.createElement('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 } },
            React.createElement('div', { className: 'form-group' },
              React.createElement('label', { className: 'form-label' }, 'Scan Barcode'),
              React.createElement('input', {
                className: 'form-input',
                value: returnBarcode,
                onChange: (e) => setReturnBarcode(e.target.value),
                onKeyDown: (e) => {
                  if (e.key !== 'Enter') return
                  e.preventDefault()
                  handleFormBarcodeScan(e.currentTarget.value, setReturnBarcode, setReturnForm)
                },
                placeholder: 'Scan barcode then press Enter'
              })
            ),
            React.createElement('div', { className: 'form-group' },
              React.createElement('label', { className: 'form-label' }, 'Product *'),
              React.createElement('select', {
                className: 'form-input',
                value: returnForm.product_id,
                onChange: (e) => {
                  const nextProductId = e.target.value
                  setReturnForm((f) => ({ ...f, product_id: nextProductId }))
                  const selected = products.find((p) => String(p.id) === String(nextProductId))
                  setReturnBarcode(selected?.barcode || '')
                },
                required: true
              },
                React.createElement('option', { value: '' }, '— Select product —'),
                ...productOptions
              )
            ),
            React.createElement('div', { className: 'form-group' },
              React.createElement('label', { className: 'form-label' }, 'Quantity *'),
              React.createElement('input', { className: 'form-input', type: 'number', min: 1, value: returnForm.quantity, onChange: e => setReturnForm(f => ({ ...f, quantity: e.target.value })), required: true })
            ),
            React.createElement('div', { className: 'form-group' },
              React.createElement('label', { className: 'form-label' }, 'Reason'),
              React.createElement('input', { className: 'form-input', value: returnForm.reason, onChange: e => setReturnForm(f => ({ ...f, reason: e.target.value })), placeholder: 'Reason for return...' })
            )
          ),
          React.createElement('p', { style: { marginTop: 6, marginBottom: 10, fontSize: 12, color: 'var(--text-light)' } },
            'This tab is for supplier returns only and will reduce stock. Customer returns must be processed in Sales > Returns using receipt lookup and return handling.'
          ),
          React.createElement('button', { type: 'submit', className: 'btn btn-primary', style: { marginTop: 12 } }, 'Process Return')
        )
      )
    ),

    // ═══════════════ PURCHASE ORDERS ═══════════════
    tab === 'purchase-orders' && React.createElement('div', null,
      React.createElement('div', { className: 'card', style: { marginBottom: 20 } },
        React.createElement('h3', { style: { marginBottom: 16 } }, 'Create New Purchase Order'),
        React.createElement('p', { style: { marginTop: -4, marginBottom: 12, fontSize: 12, color: 'var(--text-light)' } },
          'Recommended for replenishment: creating a PO does not increase stock yet. Stock is added only after clicking Receive on an OPEN PO.'
        ),
        React.createElement('button', { type: 'button', className: 'btn btn-secondary', style: { marginBottom: 12 }, onClick: fetchSuppliers }, 'Refresh Supplier List'),
        React.createElement('form', { onSubmit: handleCreatePO },
          React.createElement('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 } },
            React.createElement('div', { className: 'form-group' },
              React.createElement('label', { className: 'form-label' }, 'Supplier *'),
              React.createElement('select', { className: 'form-input', value: poForm.supplier_id, onChange: e => setPoForm(f => ({ ...f, supplier_id: e.target.value })), required: true },
                React.createElement('option', { value: '' }, '— Select supplier —'),
                ...supplierOptions
              )
            ),
            React.createElement('div', { className: 'form-group' },
              React.createElement('label', { className: 'form-label' }, 'Expected Delivery Date'),
React.createElement('input', { className: 'form-input', type: 'date', value: poForm.expected_date, onChange: e => setPoForm(f => ({ ...f, expected_date: e.target.value })), required: true })            )
          ),
          React.createElement('h4', { style: { marginTop: 12, marginBottom: 8, fontSize: 14 } }, 'Items'),
          poForm.items.map((item, idx) =>
            React.createElement('div', { key: idx, style: { display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: 8, marginBottom: 8 } },
              React.createElement('select', { className: 'form-input', value: item.product_id, onChange: e => updatePoItem(idx, 'product_id', e.target.value) },
                React.createElement('option', { value: '' }, '— Product —'),
                ...productOptions
              ),
              React.createElement('input', { className: 'form-input', type: 'number', min: 1, placeholder: 'Qty', value: item.quantity, onChange: e => updatePoItem(idx, 'quantity', e.target.value) }),
              React.createElement('input', { className: 'form-input', type: 'number', step: '0.01', placeholder: 'Unit cost', value: item.unit_cost, onChange: e => updatePoItem(idx, 'unit_cost', e.target.value) }),
              React.createElement('button', { type: 'button', className: 'btn btn-danger', onClick: () => removePoItem(idx), style: { padding: '8px 12px' } }, '✕')
            )
          ),
          React.createElement('button', { type: 'button', className: 'btn btn-secondary', onClick: addPoItem, style: { marginBottom: 12 } }, '+ Add Item'),
          React.createElement('br'),
          React.createElement('button', { type: 'submit', className: 'btn btn-primary' }, 'Create Purchase Order')
        )
      ),
      React.createElement('div', { className: 'card' },
        React.createElement('h3', { style: { marginBottom: 12 } }, 'Purchase Orders'),
        React.createElement('div', { className: 'table-wrap' },
          React.createElement('table', null,
            React.createElement('thead', null,
              React.createElement('tr', null,
                React.createElement('th', null, 'PO #'),
                React.createElement('th', null, 'Supplier'),
                React.createElement('th', null, 'Status'),
                React.createElement('th', null, 'Expected'),
                React.createElement('th', null, 'Total'),
                React.createElement('th', null, 'Items'),
                React.createElement('th', null, 'Actions')
              )
            ),
            React.createElement('tbody', null,
              purchaseOrders.map(po => React.createElement('tr', { key: po.id },
                React.createElement('td', { style: { fontWeight: 500 } }, po.po_number),
                React.createElement('td', null, po.supplier_name || '—'),
                React.createElement('td', null,
                  React.createElement('span', { className: `badge ${po.status === 'RECEIVED' ? 'badge-success' : po.status === 'CANCELLED' ? 'badge-danger' : 'badge-warning'}` }, po.status)
                ),
                React.createElement('td', null, po.expected_date ? new Date(po.expected_date).toLocaleDateString() : '—'),
                React.createElement('td', null, fmt(po.total)),
                React.createElement('td', null, po.items?.map(i => `${i.product_name || 'Product'} x${i.quantity}`).join(', ')),
                React.createElement('td', null,
                  po.status === 'OPEN' && React.createElement(React.Fragment, null,
                    React.createElement('button', { className: 'btn btn-primary', style: { marginRight: 6, padding: '4px 10px', fontSize: 12 }, onClick: () => handleReceivePO(po.id) }, 'Receive'),
                    React.createElement('button', { className: 'btn btn-danger', style: { padding: '4px 10px', fontSize: 12 }, onClick: () => handleCancelPO(po.id) }, 'Cancel')
                  )
                )
              ))
            )
          )
        )
      )
    ),

    // ═══════════════ PRODUCTS ═══════════════
    tab === 'products' && React.createElement('div', null,
      React.createElement('div', { style: { marginBottom: 16 } },
        React.createElement('button', { className: 'btn btn-primary', onClick: () => { setEditingProduct(null); setProductForm({ sku: '', name: '', brand: '', description: '', category_id: '', price: '', cost: '', stock_quantity: '', low_stock_threshold: '10', size: '', color: '', barcode: '' }); setCategorySearch(''); setShowProductModal(true) } }, '+ Create Product')
      ),

      showProductModal && React.createElement('div', { className: 'card', style: { marginBottom: 20 } },
        React.createElement('h3', { style: { marginBottom: 12 } }, editingProduct ? 'Edit Product' : 'Create Product'),
        React.createElement('form', { onSubmit: handleSaveProduct },
          React.createElement('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 } },
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
            React.createElement('div', { className: 'form-group', style: { position: 'relative' } },
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
              React.createElement('label', { className: 'form-label' }, 'Cost Price'),
              React.createElement('input', { className: 'form-input', type: 'number', step: '0.01', value: productForm.cost, onChange: e => setProductForm(f => ({ ...f, cost: e.target.value })) })
            ),
            React.createElement('div', { className: 'form-group' },
              React.createElement('label', { className: 'form-label' }, 'Quantity'),
              React.createElement('input', { className: 'form-input', type: 'number', value: productForm.stock_quantity, onChange: e => setProductForm(f => ({ ...f, stock_quantity: e.target.value })) })
            ),
            React.createElement('div', { className: 'form-group' },
              React.createElement('label', { className: 'form-label' }, 'Low Stock Threshold'),
              React.createElement('input', { className: 'form-input', type: 'number', value: productForm.low_stock_threshold, onChange: e => setProductForm(f => ({ ...f, low_stock_threshold: e.target.value })) })
            ),
            React.createElement('div', { className: 'form-group' },
              React.createElement('label', { className: 'form-label' }, 'Size'),
              React.createElement('select', { className: 'form-input', value: productForm.size, onChange: e => setProductForm(f => ({ ...f, size: e.target.value })) },
                React.createElement('option', { value: '' }, '— Select size —'),
                React.createElement('option', { value: 'XXS' }, 'XXS'),
                React.createElement('option', { value: 'XS' }, 'XS'),
                React.createElement('option', { value: 'S' }, 'Small (S)'),
                React.createElement('option', { value: 'M' }, 'Medium (M)'),
                React.createElement('option', { value: 'L' }, 'Large (L)'),
                React.createElement('option', { value: 'XL' }, 'XL'),
                React.createElement('option', { value: 'XXL' }, 'XXL'),
                React.createElement('option', { value: '3XL' }, '3XL'),
                React.createElement('option', { value: 'Free Size' }, 'Free Size'),
                React.createElement('option', { value: '6' }, '6'),
                React.createElement('option', { value: '8' }, '8'),
                React.createElement('option', { value: '10' }, '10'),
                React.createElement('option', { value: '12' }, '12'),
                React.createElement('option', { value: '14' }, '14'),
                React.createElement('option', { value: '16' }, '16')
              )
            ),
            React.createElement('div', { className: 'form-group' },
              React.createElement('label', { className: 'form-label' }, 'Color'),
              React.createElement('input', { className: 'form-input', value: productForm.color, onChange: e => setProductForm(f => ({ ...f, color: e.target.value })) })
            )
          ),
          React.createElement('div', { className: 'form-group' },
            React.createElement('label', { className: 'form-label' }, 'Description'),
            React.createElement('textarea', { className: 'form-input', value: productForm.description, onChange: e => setProductForm(f => ({ ...f, description: e.target.value })), rows: 2 })
          ),
          React.createElement('div', { style: { display: 'flex', gap: 8 } },
            React.createElement('button', { type: 'submit', className: 'btn btn-primary' }, editingProduct ? 'Update Product' : 'Create Product'),
            React.createElement('button', { type: 'button', className: 'btn btn-secondary', onClick: () => { setShowProductModal(false); setCategorySearch('') } }, 'Cancel')
          )
        )
      ),

      React.createElement('div', { className: 'table-wrap' },
        React.createElement('table', null,
          React.createElement('thead', null,
            React.createElement('tr', null,
              React.createElement('th', null, 'SKU'),
              React.createElement('th', null, 'Barcode'),
              React.createElement('th', null, 'Name'),
              React.createElement('th', null, 'Brand'),
              React.createElement('th', null, 'Category'),
              React.createElement('th', null, 'Price'),
              React.createElement('th', null, 'Cost'),
              React.createElement('th', null, 'Stock'),
              React.createElement('th', null, 'Threshold'),
              React.createElement('th', null, 'Actions')
            )
          ),
          React.createElement('tbody', null,
            products.map(p => React.createElement('tr', { key: p.id },
              React.createElement('td', null, p.sku || '—'),
              React.createElement('td', null, p.barcode || '—'),
              React.createElement('td', { style: { fontWeight: 500 } }, p.name),
              React.createElement('td', null, p.brand || '—'),
              React.createElement('td', null, p.category || '—'),
              React.createElement('td', null, fmt(p.price)),
              React.createElement('td', null, fmt(p.cost)),
              React.createElement('td', { style: { fontWeight: 600, color: p.stock_quantity <= (p.low_stock_threshold || 10) ? 'var(--error)' : 'var(--success)' } }, p.stock_quantity),
              React.createElement('td', null, p.low_stock_threshold || 10),
              React.createElement('td', null,
                React.createElement('div', { className: 'product-table-actions' },
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
                    onClick: () => deleteProduct(p.id)
                  }, deleteActionIcon())
                )
              )
            ))
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
              const qtyColor = t.quantity > 0 ? 'var(--success)' : 'var(--error)'
              const qtyLabel = t.quantity > 0 ? `+${t.quantity}` : t.quantity

              return React.createElement('tr', { key: t.id },
                React.createElement('td', null,
                  React.createElement('span', { className: `badge ${t.transaction_type === 'IN' ? 'badge-success' : t.transaction_type === 'RETURN' ? 'badge-warning' : 'badge-danger'}` }, t.transaction_type)
                ),
                React.createElement('td', null,
                  React.createElement('div', { style: { fontWeight: 600 } }, formatTransactionReference(resolvedReference)),
                  React.createElement('div', { style: { fontSize: 11, color: 'var(--text-light)' } }, `${t.sku ? t.sku + ' — ' : ''}${t.product_name || ''}`)
                ),
                React.createElement('td', null, fmtDate(t.created_at)),
                React.createElement('td', { style: { fontWeight: 600, color: qtyColor } }, qtyLabel),
                React.createElement('td', null,
                  React.createElement('div', null, resolvedReason),
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
      React.createElement('div', { className: 'table-wrap' },
        React.createElement('table', null,
          React.createElement('thead', null,
            React.createElement('tr', null,
              React.createElement('th', null, 'Date'),
              React.createElement('th', null, 'Product'),
              React.createElement('th', null, 'Qty'),
              React.createElement('th', null, 'Reason'),
              React.createElement('th', null, 'Reported By')
            )
          ),
          React.createElement('tbody', null,
            damaged.map(d => React.createElement('tr', { key: d.id },
              React.createElement('td', null, fmtDate(d.created_at)),
              React.createElement('td', null, `${d.sku ? d.sku + ' — ' : ''}${d.product_name || ''}`),
              React.createElement('td', { style: { fontWeight: 600, color: 'var(--error)' } }, d.quantity),
              React.createElement('td', null, formatTransactionReason(d.reason, d.reference)),
              React.createElement('td', null, d.reported_by_name || '—')
            ))
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
              React.createElement('th', null, 'Cost'),
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
              React.createElement('td', null, fmt(p.cost)),
              React.createElement('td', null, fmt(p.price)),
              React.createElement('td', { style: { fontWeight: 500 } }, fmt(p.stock_value))
            ))
          )
        )
      )
    ),

    renderQrPreviewModal()
  )
}
