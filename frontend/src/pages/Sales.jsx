import React, { useEffect, useRef, useState } from 'react'
import { useSelector } from 'react-redux'
import { useLocation, useNavigate } from 'react-router-dom'
import api from '../api/api.js'

const formatMoney = (currency, value) => {
  const normalizedCurrency = String(currency || 'PHP').trim() || 'PHP'
  try {
    return Number(value || 0).toLocaleString('en-PH', { style: 'currency', currency: normalizedCurrency })
  } catch {
    return Number(value || 0).toLocaleString('en-PH', { style: 'currency', currency: 'PHP' })
  }
}
const fmtDate = (d) => d ? new Date(d).toLocaleString('en-PH', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'
const round = (n) => Math.round((Number(n) || 0) * 100) / 100
const num = (v, fallback = 0) => Number.isFinite(Number(v)) ? Number(v) : fallback
const pct = (v) => Math.min(Math.max(num(v), 0), 100)
const text = (value) => String(value || '').trim()
const normalizeText = (value) => text(value).toLowerCase()
const safeDecodeScannedValue = (value) => {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}
const extractScannedCodeToken = (value) => {
  const raw = text(value)
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
      // Fall through and treat the raw value as the code.
    }
  }

  return compact
}
const normalizeScannedCode = (value) => extractScannedCodeToken(value).replace(/[\r\n]+/g, '').trim().toUpperCase()
const productLabel = (p) => `${p?.sku ? `${p.sku} - ` : ''}${p?.name || 'Unnamed product'}`
const findProductByExactScanCode = (products, rawValue) => {
  const normalizedCode = normalizeScannedCode(rawValue)
  if (!normalizedCode) return null

  return (Array.isArray(products) ? products : []).find((product) => (
    normalizeScannedCode(product?.barcode) === normalizedCode
    || normalizeScannedCode(product?.sku) === normalizedCode
  )) || null
}
const extractScannedReceiptId = (rawValue) => {
  const raw = String(rawValue || '').trim()
  if (!raw) return ''
  const compact = raw.replace(/\r?\n/g, ' ').trim()
  const tokenMatch = compact.match(/\b(?:RCT|REC|RECEIPT)[-_: ]?[A-Z0-9-]{6,}\b/i)
  if (tokenMatch?.[0]) {
    return tokenMatch[0]
      .replace(/^RECEIPT[-_: ]?/i, 'RCT-')
      .replace(/^REC[-_: ]?/i, 'RCT-')
      .replace(/^RCT[-_: ]?/i, 'RCT-')
      .replace(/\s+/g, '')
      .toUpperCase()
  }
  const plainReceipt = compact.match(/\bRCT-[A-Z0-9-]+\b/i)
  if (plainReceipt?.[0]) return plainReceipt[0].toUpperCase()
  return compact
}
const normalizeDateOnly = (value) => {
  if (!value) return ''
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ''
  return parsed.toISOString().slice(0, 10)
}
const isDateWithinInclusive = (dateValue, fromValue, toValue) => {
  const normalizedDate = normalizeDateOnly(dateValue)
  if (!normalizedDate) return false
  if (fromValue && normalizedDate < fromValue) return false
  if (toValue && normalizedDate > toValue) return false
  return true
}
const DEFAULT_SALES_CONFIG = {
  currency: 'PHP',
  tax_rate: 0.12,
  configured_tax_rate: 0.12,
  tax_rate_percentage: 12,
  scanner_debounce_ms: 250,
  payment_methods: ['cash'],
  allow_discount: false,
  allow_price_override: false,
  invoice: {
    displayName: "Cecille's N'Style",
    registeredName: '',
    registrationType: 'VAT',
    sellerTin: '',
    branchCode: '',
    registeredBusinessAddress: '',
    birPermitNumber: '',
    birPermitDateIssued: '',
    atpNumber: '',
    atpDateIssued: '',
    approvedSeries: '',
    missingFields: [],
    requirementsComplete: false
  }
}
const NON_VAT_INPUT_TAX_NOTICE = 'THIS DOCUMENT IS NOT VALID FOR CLAIM OF INPUT TAX.'
const POS_DRAFT_ID_STORAGE_KEY = 'pos_draft_sale_id'
const POS_DRAFT_SNAPSHOT_STORAGE_KEY = 'pos_draft_sale_snapshot'

function sanitizeStoredCartItem(item) {
  const productId = Number(item?.product_id)
  const quantity = Math.max(1, Math.floor(num(item?.quantity, 1)))
  const unitPrice = round(item?.unit_price)

  if (!Number.isFinite(productId) || productId <= 0) return null

  return {
    id: item?.id ?? null,
    product_id: productId,
    name: text(item?.name) || 'Item',
    sku: text(item?.sku) || null,
    barcode: text(item?.barcode) || null,
    unit_price: unitPrice,
    catalog_unit_price: round(item?.catalog_unit_price ?? unitPrice),
    quantity,
    line_total: round(item?.line_total ?? (unitPrice * quantity))
  }
}

function readStoredPosDraftSnapshot() {
  try {
    const rawValue = localStorage.getItem(POS_DRAFT_SNAPSHOT_STORAGE_KEY)
    if (!rawValue) return null

    const parsed = JSON.parse(rawValue)
    const draftSaleId = Number(parsed?.draftSaleId)
    const selectedCustomer = buildCustomerSummary(parsed?.selectedCustomer)
    const cart = Array.isArray(parsed?.cart)
      ? parsed.cart.map((item) => sanitizeStoredCartItem(item)).filter(Boolean)
      : []

    return {
      draftSaleId: Number.isFinite(draftSaleId) && draftSaleId > 0 ? draftSaleId : null,
      selectedCustomer,
      cart
    }
  } catch {
    return null
  }
}

function clearStoredPosDraftSnapshot() {
  localStorage.removeItem(POS_DRAFT_ID_STORAGE_KEY)
  localStorage.removeItem(POS_DRAFT_SNAPSHOT_STORAGE_KEY)
}

function persistPosDraftSnapshot({ draftSaleId, selectedCustomer, cart }) {
  const normalizedDraftSaleId = Number(draftSaleId)
  const normalizedCart = Array.isArray(cart)
    ? cart.map((item) => sanitizeStoredCartItem(item)).filter(Boolean)
    : []
  const hasDraft = Number.isFinite(normalizedDraftSaleId) && normalizedDraftSaleId > 0

  if (!hasDraft && normalizedCart.length === 0) {
    clearStoredPosDraftSnapshot()
    return
  }

  if (hasDraft) {
    localStorage.setItem(POS_DRAFT_ID_STORAGE_KEY, String(normalizedDraftSaleId))
  } else {
    localStorage.removeItem(POS_DRAFT_ID_STORAGE_KEY)
  }

  localStorage.setItem(POS_DRAFT_SNAPSHOT_STORAGE_KEY, JSON.stringify({
    draftSaleId: hasDraft ? normalizedDraftSaleId : null,
    selectedCustomer: selectedCustomer ? {
      id: selectedCustomer.id || null,
      customer_code: selectedCustomer.customer_code || null,
      full_name: selectedCustomer.full_name || null,
      phone: selectedCustomer.phone || null,
      email: selectedCustomer.email || null
    } : null,
    cart: normalizedCart
  }))
}

function normalizeTaxRateValue(value, fallback = 0) {
  const parsed = num(value, fallback)
  if (parsed <= 0) return 0
  return parsed > 1 ? parsed / 100 : parsed
}

function formatPercentLabel(value) {
  const normalized = round(value)
  if (!normalized) return '0%'
  return `${String(normalized.toFixed(2)).replace(/\.?0+$/, '')}%`
}

function buildPhilippineTaxSummary({ totalAmount, taxRate, taxAmount, vatableSales }) {
  const total = round(totalAmount)
  const explicitVatAmount = round(num(taxAmount, NaN))
  const explicitVatableSales = round(num(vatableSales, NaN))
  const normalizedTaxRate = normalizeTaxRateValue(taxRate, 0)

  if (Number.isFinite(explicitVatAmount) && explicitVatAmount > 0) {
    const resolvedVatableSales = explicitVatableSales > 0
      ? explicitVatableSales
      : round(Math.max(total - explicitVatAmount, 0))
    const resolvedTaxRatePercentage = resolvedVatableSales > 0
      ? round((explicitVatAmount / resolvedVatableSales) * 100)
      : round(normalizedTaxRate * 100)

    return {
      total,
      vatableSales: resolvedVatableSales,
      vatAmount: explicitVatAmount,
      nonVatSales: 0,
      taxRate: normalizeTaxRateValue(resolvedTaxRatePercentage, normalizedTaxRate),
      taxRatePercentage: resolvedTaxRatePercentage,
      invoiceType: 'VAT Invoice'
    }
  }

  if (normalizedTaxRate > 0 && total > 0) {
    const computedVatableSales = round(total / (1 + normalizedTaxRate))
    const computedVatAmount = round(total - computedVatableSales)
    return {
      total,
      vatableSales: computedVatableSales,
      vatAmount: computedVatAmount,
      nonVatSales: 0,
      taxRate: normalizedTaxRate,
      taxRatePercentage: round(normalizedTaxRate * 100),
      invoiceType: 'VAT Invoice'
    }
  }

  return {
    total,
    vatableSales: 0,
    vatAmount: 0,
    nonVatSales: total,
    taxRate: 0,
    taxRatePercentage: 0,
    invoiceType: 'Non-VAT Invoice'
  }
}

function TaxBreakdownSummary({
  summary,
  fmt,
  subtotal = 0,
  discountAmount = 0,
  totalLabel = 'Total',
  compact = false
}) {
  const resolvedSummary = summary || buildPhilippineTaxSummary({ totalAmount: 0, taxRate: 0 })
  const detailStyle = {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: compact ? 12 : 13,
    color: compact ? 'var(--text-light)' : 'inherit',
    marginTop: compact ? 4 : 0
  }

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: compact ? 12 : 13 }}>
        <span>Subtotal</span>
        <span>{fmt(subtotal)}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: compact ? 12 : 13 }}>
        <span>Discount</span>
        <span>-{fmt(discountAmount)}</span>
      </div>
      <div style={detailStyle}>
        <span>{resolvedSummary.taxRatePercentage > 0 ? `VATable Sales (${formatPercentLabel(resolvedSummary.taxRatePercentage)})` : 'VATable Sales'}</span>
        <span>{fmt(resolvedSummary.vatableSales)}</span>
      </div>
      <div style={{ ...detailStyle, marginTop: 0 }}>
        <span>{resolvedSummary.taxRatePercentage > 0 ? `VAT Amount (${formatPercentLabel(resolvedSummary.taxRatePercentage)})` : 'VAT Amount'}</span>
        <span>{fmt(resolvedSummary.vatAmount)}</span>
      </div>
      <div style={{ ...detailStyle, marginTop: 0 }}>
        <span>Non-VAT Sales</span>
        <span>{fmt(resolvedSummary.nonVatSales)}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: compact ? 16 : 20, marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
        <span>{totalLabel}</span>
        <span>{fmt(resolvedSummary.total)}</span>
      </div>
    </>
  )
}

function buildSaleTaxSummary(record, fallbackTaxRate = 0) {
  return buildPhilippineTaxSummary({
    totalAmount: record?.total,
    taxRate: record?.tax_rate ?? record?.tax_rate_percentage ?? fallbackTaxRate,
    taxAmount: record?.vat_amount ?? record?.tax,
    vatableSales: record?.vatable_sales
  })
}

function formatInvoiceDateOnly(value) {
  if (!value) return '-'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return '-'
  return parsed.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: '2-digit' })
}

function formatTinWithBranch(invoiceConfig) {
  const tin = text(invoiceConfig?.sellerTin)
  const branchCode = text(invoiceConfig?.branchCode)
  if (!tin && !branchCode) return ''
  if (!branchCode) return tin
  return `${tin}-${branchCode}`
}

function invoiceRegistrationLabel(invoiceConfig) {
  return String(invoiceConfig?.registrationType || '').toUpperCase() === 'NON_VAT' ? 'Non-VAT Reg TIN' : 'VAT Reg TIN'
}

function buildInvoiceMissingFields(invoiceConfig) {
  const missing = []
  if (!text(invoiceConfig?.registeredName)) missing.push('Registered Name')
  if (!text(invoiceConfig?.sellerTin)) missing.push('Seller TIN')
  if (!text(invoiceConfig?.branchCode)) missing.push('Branch Code')
  if (!text(invoiceConfig?.registeredBusinessAddress)) missing.push('Registered Business Address')
  if (!text(invoiceConfig?.birPermitNumber)) missing.push('BIR Permit No.')
  if (!text(invoiceConfig?.birPermitDateIssued)) missing.push('BIR Permit Date Issued')
  if (!text(invoiceConfig?.atpNumber)) missing.push('Authority to Print No.')
  if (!text(invoiceConfig?.atpDateIssued)) missing.push('Authority to Print Date Issued')
  if (!text(invoiceConfig?.approvedSeries)) missing.push('Approved Serial Range')
  return missing
}

function can(perms, required) {
  if (!required) return true
  if (!Array.isArray(perms)) return false
  if (perms.includes('admin.*')) return true
  const list = Array.isArray(required) ? required : [required]
  return list.some((item) => perms.includes(item))
}

function StatCard({ label, value, style }) {
  return (
    <div className="card">
      <div className="card-title">{label}</div>
      <div className="card-value-sm" style={style}>{value}</div>
    </div>
  )
}

function getCatalogUnitPrice(products, productId, fallbackValue = 0) {
  const product = (Array.isArray(products) ? products : []).find((item) => String(item.id) === String(productId))
  return round(product?.price ?? fallbackValue)
}

function mapSaleToCartItems(sale, products) {
  const saleItems = Array.isArray(sale?.items) ? sale.items : []
  return saleItems.map((item) => ({
    id: item.id,
    product_id: item.product_id,
    name: item.product_name || item.productName || 'Item',
    sku: item.sku || null,
    barcode: item.barcode || null,
    unit_price: round(item.unit_price),
    catalog_unit_price: getCatalogUnitPrice(products, item.product_id, item.unit_price),
    quantity: num(item.qty ?? item.quantity, 1),
    line_total: round(item.line_total)
  }))
}

function buildCustomerSummary(record) {
  const rawId = Number(record?.customer_id ?? record?.id)
  const fullName = text(record?.full_name || record?.customer_name || record?.name)
  const phone = text(record?.phone || record?.customer_phone)
  const email = text(record?.email || record?.customer_email)
  const customerCode = text(record?.customer_code)
  const id = Number.isFinite(rawId) && rawId > 0 ? rawId : null

  if (!id && !customerCode && !fullName && !phone && !email) return null
  if (!id && normalizeText(fullName) === 'walk-in customer') return null

  return {
    id,
    customer_code: customerCode || null,
    full_name: fullName || 'Walk-in Customer',
    phone: phone || null,
    email: email || null
  }
}

function customerSummariesEqual(left, right) {
  if (!left && !right) return true
  if (!left || !right) return false

  return (
    String(left.id || '') === String(right.id || '')
    && String(left.customer_code || '') === String(right.customer_code || '')
    && String(left.full_name || '') === String(right.full_name || '')
    && String(left.phone || '') === String(right.phone || '')
    && String(left.email || '') === String(right.email || '')
  )
}

function customerDisplayName(customer) {
  return customer?.full_name || 'Walk-in Customer'
}

function customerDisplayMeta(customer) {
  return [customer?.customer_code, customer?.phone, customer?.email].filter(Boolean).join(' | ') || 'No contact details saved'
}

function paymentMethodLabel(method) {
  const normalized = String(method || '').trim().toLowerCase()
  if (!normalized) return '-'
  if (normalized === 'cash') return 'Cash'

  return normalized
    .split('_')
    .filter(Boolean)
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join(' ')
}

function getSalesHistoryReturnStatusMeta(status) {
  const normalized = String(status || 'NONE').trim().toUpperCase()
  if (normalized === 'FULL' || normalized === 'REFUNDED') {
    return { label: 'Fully Returned', className: 'is-full' }
  }
  if (normalized === 'PARTIAL') {
    return { label: 'Partially Returned', className: 'is-partial' }
  }
  return { label: 'Return Available', className: 'is-none' }
}

function getReturnStatusMeta(status) {
  const normalized = String(status || 'NONE').trim().toUpperCase()
  if (normalized === 'FULL' || normalized === 'REFUNDED') {
    return { label: 'Fully Returned', className: 'is-full' }
  }
  if (normalized === 'PARTIAL') {
    return { label: 'Partially Returned', className: 'is-partial' }
  }
  return { label: 'Return Available', className: 'is-none' }
}

function getReturnDispositionLabel(value) {
  const normalized = String(value || '').trim().toUpperCase()
  if (normalized === 'DAMAGE') return 'Damaged Item'
  if (normalized === 'SHRINKAGE') return 'Shrinkage'
  return 'Restock'
}

function getReturnItemUnitPrice(item) {
  const explicitUnitPrice = num(item?.unit_price, NaN)
  if (Number.isFinite(explicitUnitPrice)) return round(explicitUnitPrice)

  const soldQty = Math.max(num(item?.qty, 0), 1)
  return round(num(item?.line_total) / soldQty)
}

function normalizeReceiptKey(value) {
  return String(value || '').trim().toUpperCase()
}

function isSameLoadedReceipt(currentSale, nextSale) {
  const currentReceipt = normalizeReceiptKey(currentSale?.receipt_no)
  const nextReceipt = normalizeReceiptKey(nextSale?.receipt_no)
  if (!currentReceipt || !nextReceipt || currentReceipt !== nextReceipt) return false

  const currentId = Number(currentSale?.id)
  const nextId = Number(nextSale?.id)
  if (Number.isFinite(currentId) && Number.isFinite(nextId)) return currentId === nextId
  return true
}

function buildReturnQuantityState(items, previousQuantities = {}, preserveSelection = false) {
  const sourceItems = Array.isArray(items) ? items : []
  return Object.fromEntries(sourceItems.map((item) => {
    const availableQty = Math.max(num(item?.available_to_return), 0)
    if (!preserveSelection) return [item.id, '']

    const previousValue = previousQuantities?.[item.id]
    if (previousValue === undefined || previousValue === null || String(previousValue).trim() === '') {
      return [item.id, '']
    }

    const clampedValue = Math.min(Math.max(Math.floor(num(previousValue, 0)), 0), availableQty)
    return [item.id, clampedValue > 0 ? String(clampedValue) : '']
  }))
}

function isScannerCaptureTab(value) {
  return value === 'pos' || value === 'payment'
}

function buildPendingOrderSnapshot({
  cart,
  draftSaleId,
  customer,
  paymentMethod,
  discountPercentage,
  subtotal,
  discountAmount,
  nonVatSales,
  taxAmount,
  vatableSales,
  taxRate,
  taxRatePercentage,
  total,
  invoiceType
}) {
  const items = Array.isArray(cart) ? cart : []
  if (!draftSaleId || !items.length) return null

  return {
    items: items.map((item) => ({ ...item })),
    draft_sale_id: draftSaleId,
    customer: customer ? { ...customer } : null,
    payment_method: paymentMethod,
    discount_percentage: discountPercentage,
    subtotal,
    discount_amount: discountAmount,
    non_vat_sales: nonVatSales,
    tax_amount: taxAmount,
    vatable_sales: vatableSales,
    tax_rate: taxRate,
    tax_rate_percentage: taxRatePercentage,
    total,
    invoice_type: invoiceType
  }
}

function pendingOrderItemsMatch(leftItems, rightItems) {
  const currentItems = Array.isArray(leftItems) ? leftItems : []
  const nextItems = Array.isArray(rightItems) ? rightItems : []
  if (currentItems.length !== nextItems.length) return false

  return currentItems.every((item, index) => {
    const other = nextItems[index]
    if (!other) return false
    return (
      String(item.id || '') === String(other.id || '')
      && String(item.product_id || '') === String(other.product_id || '')
      && String(item.name || '') === String(other.name || '')
      && String(item.sku || '') === String(other.sku || '')
      && String(item.barcode || '') === String(other.barcode || '')
      && round(item.unit_price) === round(other.unit_price)
      && round(item.catalog_unit_price) === round(other.catalog_unit_price)
      && num(item.quantity) === num(other.quantity)
      && round(item.line_total) === round(other.line_total)
    )
  })
}

function pendingOrdersEqual(currentOrder, nextOrder) {
  if (!currentOrder && !nextOrder) return true
  if (!currentOrder || !nextOrder) return false

  return (
    String(currentOrder.draft_sale_id || '') === String(nextOrder.draft_sale_id || '')
    && customerSummariesEqual(currentOrder.customer, nextOrder.customer)
    && String(currentOrder.payment_method || '') === String(nextOrder.payment_method || '')
    && round(currentOrder.discount_percentage) === round(nextOrder.discount_percentage)
    && round(currentOrder.subtotal) === round(nextOrder.subtotal)
    && round(currentOrder.discount_amount) === round(nextOrder.discount_amount)
    && round(currentOrder.non_vat_sales) === round(nextOrder.non_vat_sales)
    && round(currentOrder.tax_amount) === round(nextOrder.tax_amount)
    && round(currentOrder.vatable_sales) === round(nextOrder.vatable_sales)
    && round(currentOrder.tax_rate) === round(nextOrder.tax_rate)
    && round(currentOrder.tax_rate_percentage) === round(nextOrder.tax_rate_percentage)
    && round(currentOrder.total) === round(nextOrder.total)
    && String(currentOrder.invoice_type || '') === String(nextOrder.invoice_type || '')
    && pendingOrderItemsMatch(currentOrder.items, nextOrder.items)
  )
}

function shouldResetPaymentAmount(currentValue, previousTotal, nextTotal) {
  const rawValue = String(currentValue || '').trim()
  if (!rawValue) return true

  const normalizedAmount = Number(rawValue)
  if (!Number.isFinite(normalizedAmount)) return true

  return (
    round(normalizedAmount) === 0
    || round(normalizedAmount) === round(previousTotal)
    || round(normalizedAmount) === round(nextTotal)
  )
}

export default function Sales() {
  const permissions = useSelector((state) => state.auth?.permissions || JSON.parse(localStorage.getItem('permissions') || '[]'))
  const receiptRef = useRef(null)
  const scanInputRef = useRef(null)
  const scanSubmitTimerRef = useRef(null)
  const globalScanTimerRef = useRef(null)
  const globalScanBufferRef = useRef('')
  const globalScanLastKeyAtRef = useRef(0)
  const lastScanRef = useRef({ code: '', at: 0 })
  const routeScanRef = useRef('')
  const routeReceiptRef = useRef('')
  const draftSaleIdRef = useRef(null)
  const hasInitializedDraftPersistenceRef = useRef(false)
  const cartMutationQueueRef = useRef(Promise.resolve())
  const handleScanSubmitRef = useRef(null)
  const location = useLocation()
  const navigate = useNavigate()

  const [tab, setTab] = useState('pos')
  const [products, setProducts] = useState([])
  const [sales, setSales] = useState([])
  const [transactions, setTransactions] = useState([])
  const [report, setReport] = useState(null)
  const [config, setConfig] = useState(DEFAULT_SALES_CONFIG)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)
  const [loading, setLoading] = useState(false)
  const [cartItems, setCartItems] = useState([])
  const [draftSaleId, setDraftSaleId] = useState(null)
  const [scanValue, setScanValue] = useState('')
  const [, setScannerDebug] = useState({
    raw: '',
    normalized: '',
    source: 'Waiting for scan',
    status: 'No scanner input captured yet',
    updatedAt: null
  })
  const [search, setSearch] = useState('')
  const [selectedProduct, setSelectedProduct] = useState('')
  const [isProductPickerOpen, setIsProductPickerOpen] = useState(false)
  const [price, setPrice] = useState('')
  const [qty, setQty] = useState('1')
  const [selectedCustomer, setSelectedCustomer] = useState(null)
  const [customerSearch, setCustomerSearch] = useState('')
  const [customerOptions, setCustomerOptions] = useState([])
  const [customerLookupLoading, setCustomerLookupLoading] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [discountPercentage, setDiscountPercentage] = useState('')
  const [pendingOrder, setPendingOrder] = useState(null)
  const [paymentAmount, setPaymentAmount] = useState('0.00')
  const [lastReceipt, setLastReceipt] = useState(null)
  const [viewSale, setViewSale] = useState(null)
  const [openSaleMenuId, setOpenSaleMenuId] = useState(null)
  const [transactionType, setTransactionType] = useState('')
  const [transactionReceipt, setTransactionReceipt] = useState('')
  const [transactionRecordedDate, setTransactionRecordedDate] = useState('')
  const [transactionFrom, setTransactionFrom] = useState('')
  const [transactionTo, setTransactionTo] = useState('')
  const [showTransactionRange, setShowTransactionRange] = useState(false)
  const [reportFrom, setReportFrom] = useState('')
  const [reportTo, setReportTo] = useState('')
  const [returnReceiptNo, setReturnReceiptNo] = useState('')
  const [returnLookup, setReturnLookup] = useState(null)
  const [returnReason, setReturnReason] = useState('')
  const [returnDisposition, setReturnDisposition] = useState('RESTOCK')
  const [returnQuantities, setReturnQuantities] = useState({})
  const [showReturnReceiptPreview, setShowReturnReceiptPreview] = useState(false)
  const [availableReceipts, setAvailableReceipts] = useState([])
  const [filteredReceipts, setFilteredReceipts] = useState([])
  const [showReceiptDropdown, setShowReceiptDropdown] = useState(false)
  const [receiptSearchTimeout, setReceiptSearchTimeout] = useState(null)

  const cart = cartItems
  const setCart = setCartItems

  const tabs = [
    ['pos', 'POS', 'sales.create'],
    ['payment', 'Accept Payment', 'sales.create'],
    ['history', 'Sales', 'sales.view'],
    ['transactions', 'Transactions', 'sales.view'],
    ['returns', 'Returns', 'sales.refund'],
    ['report', 'Sales Report', 'sales.view']
  ].filter(([, , perm]) => can(permissions, perm))

  const allowDiscount = Boolean(config.allow_discount)
  const allowPriceOverride = Boolean(config.allow_price_override)
  const currency = String(config.currency || 'PHP').trim() || 'PHP'
  const invoiceConfig = config.invoice || DEFAULT_SALES_CONFIG.invoice
  const taxRate = normalizeTaxRateValue(config.tax_rate, DEFAULT_SALES_CONFIG.tax_rate)
  const fmt = (value) => formatMoney(currency, value)
  const filteredProducts = products.filter((product) => {
    const needle = normalizeText(search)
    if (!needle) return true
    return [
      productLabel(product),
      product?.name,
      product?.sku,
      product?.barcode
    ].some((value) => normalizeText(value).includes(needle))
  })
  const selectedProductData = products.find((item) => String(item.id) === String(selectedProduct)) || null
  const subtotal = round(cart.reduce((sum, item) => sum + num(item.unit_price) * num(item.quantity), 0))
  const discountPct = allowDiscount ? pct(discountPercentage) : 0
  const discountAmount = round(subtotal * (discountPct / 100))
  const subtotalAfterDiscount = Math.max(subtotal - discountAmount, 0)
  const liveTaxSummary = buildPhilippineTaxSummary({ totalAmount: subtotalAfterDiscount, taxRate })

  const vatableSales = liveTaxSummary.vatableSales
  const taxAmount = liveTaxSummary.vatAmount
  const nonVatSales = liveTaxSummary.nonVatSales
  const taxRatePercentage = liveTaxSummary.taxRatePercentage
  const total = liveTaxSummary.total
  
  const tendered = num(paymentAmount)
  const isAmountValid = pendingOrder ? tendered >= num(pendingOrder.total) : false
  const canConfirmPayment = Boolean(pendingOrder) && isAmountValid && !loading
  const cartHasLockedPriceOverride = !allowPriceOverride && cart.some((item) => round(item.unit_price) !== round(item.catalog_unit_price ?? item.unit_price))
  const pendingOrderTaxSummary = pendingOrder ? buildSaleTaxSummary(pendingOrder, taxRate) : null
  const lastReceiptTaxSummary = lastReceipt ? buildSaleTaxSummary(lastReceipt, taxRate) : null
  const viewSaleTaxSummary = viewSale ? buildSaleTaxSummary(viewSale, taxRate) : null
  const viewSaleCustomer = viewSale ? buildCustomerSummary(viewSale) : null
  const viewSaleReturnMeta = getSalesHistoryReturnStatusMeta(viewSale?.return_status)
  const returnLookupTaxSummary = returnLookup ? buildSaleTaxSummary(returnLookup, taxRate) : null
  const returnLookupCustomer = returnLookup ? buildCustomerSummary(returnLookup) : null
  const returnStatusMeta = getReturnStatusMeta(returnLookup?.return_status)
  const returnDocumentType = invoiceConfig.registrationType === 'NON_VAT' ? 'Non-VAT Invoice' : 'VAT Invoice'
  const returnItems = Array.isArray(returnLookup?.items) ? returnLookup.items : []
  const returnableItems = returnItems.filter((item) => num(item?.available_to_return) > 0)
  const fullyReturnedItems = returnItems.filter((item) => num(item?.available_to_return) <= 0)
  const hasReturnableItems = returnableItems.length > 0
  const activeDraftSaleId = pendingOrder?.draft_sale_id || draftSaleId || null
  const paymentCustomerOptions = (() => {
    const uniqueCustomers = new Map()
    if (selectedCustomer?.id) {
      uniqueCustomers.set(String(selectedCustomer.id), selectedCustomer)
    }

    for (const customer of Array.isArray(customerOptions) ? customerOptions : []) {
      if (!customer?.id) continue
      const key = String(customer.id)
      if (uniqueCustomers.has(key)) continue
      uniqueCustomers.set(key, customer)
    }

    return Array.from(uniqueCustomers.values())
  })()
  const returnSelectionSummary = returnItems.reduce((summary, item) => {
    const soldQty = num(item?.qty)
    const returnedQty = num(item?.returned_qty)
    const availableQty = num(item?.available_to_return)
    const selectedQty = Math.min(Math.max(Math.floor(num(returnQuantities[item.id], 0)), 0), Math.max(availableQty, 0))
    const unitPrice = getReturnItemUnitPrice(item)

    summary.totalBoughtQty += soldQty
    summary.totalReturnedQty += returnedQty
    summary.totalAvailableQty += availableQty
    summary.selectedQty += selectedQty
    summary.selectedAmount += round(unitPrice * selectedQty)
    if (selectedQty > 0) summary.selectedLines += 1

    return summary
  }, {
    totalBoughtQty: 0,
    totalReturnedQty: 0,
    totalAvailableQty: 0,
    selectedQty: 0,
    selectedAmount: 0,
    selectedLines: 0
  })
  const canProcessReturn = Boolean(returnLookup) && hasReturnableItems && returnSelectionSummary.selectedQty > 0 && !loading
  const invoiceMissingFields = Array.isArray(invoiceConfig?.missingFields)
    ? invoiceConfig.missingFields.filter((item) => text(item))
    : buildInvoiceMissingFields(invoiceConfig)
  const invoiceRequirementsComplete = invoiceMissingFields.length === 0
  const invoiceMissingFieldsText = invoiceMissingFields.join(', ')

  useEffect(() => {
    if (draftSaleId) localStorage.setItem(POS_DRAFT_ID_STORAGE_KEY, String(draftSaleId))
    else localStorage.removeItem(POS_DRAFT_ID_STORAGE_KEY)
  }, [draftSaleId])

  useEffect(() => {
    const storedSnapshot = readStoredPosDraftSnapshot()
    if (storedSnapshot) {
      if (storedSnapshot.draftSaleId) {
        draftSaleIdRef.current = storedSnapshot.draftSaleId
        setDraftSaleId(storedSnapshot.draftSaleId)
      }
      if (storedSnapshot.cart.length) {
        setCart(storedSnapshot.cart)
      }
      if (storedSnapshot.selectedCustomer) {
        setSelectedCustomer(storedSnapshot.selectedCustomer)
      }
    }

    let active = true
    const savedDraft = localStorage.getItem(POS_DRAFT_ID_STORAGE_KEY)
    if (!savedDraft) return () => { active = false }

    ;(async () => {
      try {
        const draftRes = await api.post('/sales/drafts', { sale_id: Number(savedDraft) || savedDraft })
        if (!active) return
        const restoredDraftId = Number(draftRes?.data?.id)
        const currentDraftId = Number(draftSaleIdRef.current)
        if (
          Number.isFinite(currentDraftId)
          && currentDraftId > 0
          && Number.isFinite(restoredDraftId)
          && restoredDraftId > 0
          && currentDraftId !== restoredDraftId
        ) {
          return
        }
        syncCartFromSale(draftRes.data)
      } catch (draftErr) {
        if (!active) return
        if (draftErr?.response?.status === 404 || String(draftErr?.response?.data?.error || '').trim() === 'draft sale not found') {
          draftSaleIdRef.current = null
          clearStoredPosDraftSnapshot()
          setDraftSaleId(null)
          setCart([])
          setSelectedCustomer(null)
          return
        }
        setError(draftErr?.response?.data?.error || 'Saved draft could not be restored.')
      }
    })()

    return () => { active = false }
  }, [])

  useEffect(() => {
    const normalizedDraftSaleId = Number(draftSaleId)
    draftSaleIdRef.current = Number.isFinite(normalizedDraftSaleId) && normalizedDraftSaleId > 0
      ? normalizedDraftSaleId
      : null
  }, [draftSaleId])

  useEffect(() => {
    if (!hasInitializedDraftPersistenceRef.current) {
      hasInitializedDraftPersistenceRef.current = true
      return
    }

    persistPosDraftSnapshot({
      draftSaleId,
      selectedCustomer,
      cart
    })
  }, [draftSaleId, selectedCustomer, cart])

  useEffect(() => {
    if (!tabs.some(([key]) => key === tab) && tabs[0]) setTab(tabs[0][0])
  }, [tab, tabs])

  useEffect(() => {
    if (tab !== 'pos') return
    const timeoutId = window.setTimeout(() => scanInputRef.current?.focus(), 0)
    return () => window.clearTimeout(timeoutId)
  }, [tab, draftSaleId, cart.length])

  useEffect(() => {
    if (tab !== 'pos') return undefined

    const refocusScanInput = () => {
      window.setTimeout(() => scanInputRef.current?.focus(), 0)
    }

    window.addEventListener('focus', refocusScanInput)
    return () => window.removeEventListener('focus', refocusScanInput)
  }, [tab])

  useEffect(() => {
    if (tab !== 'pos') return undefined

    let active = true
    const refreshCatalog = async () => {
      try {
        const latestProducts = await loadPosProducts()
        if (!active) return
        setProducts(Array.isArray(latestProducts) ? latestProducts : [])
      } catch {
        // Keep current list on silent refresh failures.
      }
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return
      refreshCatalog()
    }

    refreshCatalog()
    window.addEventListener('focus', refreshCatalog)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      active = false
      window.removeEventListener('focus', refreshCatalog)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [tab])

  useEffect(() => () => {
    if (scanSubmitTimerRef.current) {
      window.clearTimeout(scanSubmitTimerRef.current)
      scanSubmitTimerRef.current = null
    }
    if (globalScanTimerRef.current) {
      window.clearTimeout(globalScanTimerRef.current)
      globalScanTimerRef.current = null
    }
  }, [])

  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        setLoading(true)
        const [configRes, productsRes] = await Promise.allSettled([
          api.get('/sales/config'),
          loadPosProducts()
        ])
        if (!active) return
        const issues = []
        if (configRes.status === 'fulfilled') setConfig({ ...DEFAULT_SALES_CONFIG, ...(configRes.value?.data || {}) })
        else issues.push('Sales settings could not be loaded.')
        if (productsRes.status === 'fulfilled') setProducts(Array.isArray(productsRes.value) ? productsRes.value : [])
        else issues.push('Products could not be loaded for POS.')
        if (issues.length) setError(issues.join(' '))
      } catch (err) {
        if (active) setError(err?.response?.data?.error || 'Failed to load sales data')
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (tab === 'history') fetchSales()
    if (tab === 'transactions') fetchTransactions()
    if (tab === 'report') fetchReport()
  }, [tab])

  useEffect(() => {
    if (tab !== 'payment') return undefined

    let active = true
    const timer = window.setTimeout(async () => {
      try {
        setCustomerLookupLoading(true)
        const params = new URLSearchParams()
        const searchTerm = customerSearch.trim()
        if (searchTerm) params.set('q', searchTerm)
        params.set('limit', '25')
        const response = await api.get(`/customers/search?${params.toString()}`)
        if (!active) return
        const list = Array.isArray(response?.data) ? response.data : []
        setCustomerOptions(list.map((row) => buildCustomerSummary(row)).filter(Boolean))
      } catch {
        if (!active) return
        setCustomerOptions([])
      } finally {
        if (active) setCustomerLookupLoading(false)
      }
    }, 240)

    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [tab, customerSearch])

  useEffect(() => {
    setOpenSaleMenuId(null)
  }, [tab])

  useEffect(() => {
    draftSaleIdRef.current = draftSaleId || null
  }, [draftSaleId])

  useEffect(() => {
    if (config.allow_discount) return
    if (String(discountPercentage).trim()) setDiscountPercentage('')
  }, [config.allow_discount, discountPercentage])

  useEffect(() => {
    setCart((prev) => prev.map((item) => ({
      ...item,
      catalog_unit_price: getCatalogUnitPrice(products, item.product_id, item.catalog_unit_price)
    })))
  }, [products])

  useEffect(() => {
    const nextPendingOrder = buildPendingOrderSnapshot({
      cart,
      draftSaleId,
      customer: selectedCustomer,
      paymentMethod,
      discountPercentage: discountPct,
      subtotal,
      discountAmount,
      nonVatSales,
      taxAmount,
      vatableSales,
      taxRate: liveTaxSummary.taxRate,
      taxRatePercentage,
      total,
      invoiceType: liveTaxSummary.invoiceType
    })

    setPendingOrder((currentOrder) => {
      if (!nextPendingOrder) return currentOrder ? null : currentOrder
      return pendingOrdersEqual(currentOrder, nextPendingOrder) ? currentOrder : nextPendingOrder
    })

    if (!nextPendingOrder) {
      setPaymentAmount('0.00')
      return
    }

    setPaymentAmount((currentValue) => (
      shouldResetPaymentAmount(currentValue, pendingOrder?.total, nextPendingOrder.total)
        ? '0.00'
        : currentValue
    ))
  }, [
    cart,
    draftSaleId,
    selectedCustomer,
    paymentMethod,
    discountPct,
    subtotal,
    discountAmount,
    nonVatSales,
    taxAmount,
    vatableSales,
    liveTaxSummary.taxRate,
    taxRatePercentage,
    total,
    liveTaxSummary.invoiceType,
    pendingOrder?.total
  ])

  useEffect(() => {
    if (location.pathname !== '/sales') return

    const params = new URLSearchParams(location.search)
    const requestedCode = normalizeScannedCode(params.get('scan'))
    if (!requestedCode) {
      routeScanRef.current = ''
      return
    }
    if (routeScanRef.current === requestedCode) return

    routeScanRef.current = requestedCode
    setTab('pos')

    let active = true
    ;(async () => {
      clearMsg()
      try {
        const response = await addToCart({ code: requestedCode }, 1, { clearMessages: false, source: 'scan' })
        if (!active) return

        lastScanRef.current = { code: requestedCode, at: Date.now() }
        setScanValue('')
        if (response?.duplicate_scan || response?.ignored) {
          flash('Duplicate scan ignored.')
        } else {
          flash('Product added to cart from Inventory QR.')
        }
      } catch (err) {
        if (!active) return
        setError(salesErrorMessage(err, 'Failed to add product from Inventory QR'))
        setScanValue('')
      } finally {
        if (!active) return
        clearRouteScanParam()
        focusScanInput()
      }
    })()

    return () => { active = false }
  }, [location.pathname, location.search])

  useEffect(() => {
    if (location.pathname !== '/sales') return

    const params = new URLSearchParams(location.search)
    const requestedTab = String(params.get('tab') || '').trim()
    if (!requestedTab) return
    if (!tabs.some(([key]) => key === requestedTab)) return
    if (requestedTab === tab) return
    setTab(requestedTab)
  }, [location.pathname, location.search, tab, tabs])

  useEffect(() => {
    if (location.pathname !== '/sales') return

    const params = new URLSearchParams(location.search)
    const receipt = extractScannedReceiptId(params.get('receipt'))
    if (!receipt) {
      routeReceiptRef.current = ''
      return
    }
    if (routeReceiptRef.current === receipt) return

    routeReceiptRef.current = receipt
    setTab('returns')
    setReturnReceiptNo(receipt)
    setTimeout(() => lookupReceipt(receipt), 0)
  }, [location.pathname, location.search])

  function clearMsg() { setError(null); setSuccess(null) }
  function flash(message) { setSuccess(message); setTimeout(() => setSuccess(null), 4000) }
  function queueCartMutation(task) {
    const nextTask = cartMutationQueueRef.current
      .catch(() => {})
      .then(task)

    cartMutationQueueRef.current = nextTask.catch(() => {})
    return nextTask
  }
  function stock(productId) { return num(products.find((item) => String(item.id) === String(productId))?.stock_quantity) }
  function cartQty(productId, skip = -1) { return cart.reduce((sum, item, index) => index === skip ? sum : (String(item.product_id) === String(productId) ? sum + num(item.quantity) : sum), 0) }
  function transactionTypeLabel(type) {
    if (String(type) === 'SALE_PAYMENT') return 'Payment'
    if (String(type) === 'SALE_RETURN') return 'Return'
    return type || '-'
  }
  function clearTransactionFilters() {
    setTransactionType('')
    setTransactionReceipt('')
    setTransactionRecordedDate('')
    setTransactionFrom('')
    setTransactionTo('')
    setShowTransactionRange(false)
  }
  function updateScannerDebug(rawValue, source, status) {
    const raw = String(rawValue || '')
    setScannerDebug({
      raw,
      normalized: normalizeScannedCode(raw),
      source: String(source || 'Scanner'),
      status: String(status || ''),
      updatedAt: Date.now()
    })
  }

  useEffect(() => {
    handleScanSubmitRef.current = handleScanSubmit
  }, [handleScanSubmit])

  function syncCartFromSale(sale, options = {}) {
    if (!sale || typeof sale !== 'object') return false

    const allowDraftSwitch = options.allowDraftSwitch !== false
    const nextDraftSaleId = Number(sale.id)
    const normalizedNextDraftSaleId = Number.isFinite(nextDraftSaleId) && nextDraftSaleId > 0 ? nextDraftSaleId : null
    const currentDraftSaleId = Number(draftSaleIdRef.current)

    if (
      !allowDraftSwitch
      && Number.isFinite(currentDraftSaleId)
      && currentDraftSaleId > 0
      && Number.isFinite(normalizedNextDraftSaleId)
      && normalizedNextDraftSaleId > 0
      && currentDraftSaleId !== normalizedNextDraftSaleId
    ) {
      return false
    }

    const nextCart = mapSaleToCartItems(sale, products)
    const nextSelectedCustomer = buildCustomerSummary(sale)
    draftSaleIdRef.current = normalizedNextDraftSaleId
    setDraftSaleId(draftSaleIdRef.current)
    if (draftSaleIdRef.current) {
      localStorage.setItem(POS_DRAFT_ID_STORAGE_KEY, String(draftSaleIdRef.current))
    } else {
      localStorage.removeItem(POS_DRAFT_ID_STORAGE_KEY)
    }
    setCart(nextCart)
    setSelectedCustomer(nextSelectedCustomer)
    persistPosDraftSnapshot({
      draftSaleId: draftSaleIdRef.current,
      selectedCustomer: nextSelectedCustomer,
      cart: nextCart
    })
    return true
  }

  function selectProductOption(product) {
    if (!product?.id) return
    setSelectedProduct(String(product.id))
    setSearch(productLabel(product))
    setPrice(String(product.price ?? ''))
    setIsProductPickerOpen(false)
  }

  function handleProductSearchChange(value) {
    setSearch(value)
    setIsProductPickerOpen(true)
    if (!selectedProductData) return
    if (normalizeText(value) === normalizeText(productLabel(selectedProductData))) return
    setSelectedProduct('')
    setPrice('')
  }

  function qtyError(nextQty, productId = selectedProduct, skip = -1) {
    const amount = num(nextQty)
    if (!productId) return 'Select a product first'
    if (amount <= 0) return 'Quantity must be greater than 0'
    const available = stock(productId)
    const already = cartQty(productId, skip)
    return already + amount > available ? `Insufficient stock. Only ${Math.max(available - already, 0)} left.` : ''
  }

  async function loadPosProducts() {
    try {
      const res = await api.get('/sales/products')
      return Array.isArray(res.data) ? res.data : []
    } catch {
      const res = await api.get('/products')
      return Array.isArray(res.data) ? res.data : []
    }
  }

  async function refreshProducts() { setProducts(await loadPosProducts()) }
  async function fetchSales() { try { setLoading(true); setSales((await api.get('/sales')).data || []) } catch (err) { setError(err?.response?.data?.error || 'Failed to load sales') } finally { setLoading(false) } }

  function focusScanInput() {
    if (tab !== 'pos') return
    window.setTimeout(() => scanInputRef.current?.focus(), 0)
  }

  function clearBufferedScanSubmit() {
    if (!scanSubmitTimerRef.current) return
    window.clearTimeout(scanSubmitTimerRef.current)
    scanSubmitTimerRef.current = null
  }

  function scheduleBufferedScanSubmit(rawValue) {
    clearBufferedScanSubmit()
    const normalizedCode = normalizeScannedCode(rawValue)
    if (!normalizedCode) return

    const submitDelay = Math.max(0, num(config.scanner_debounce_ms, DEFAULT_SALES_CONFIG.scanner_debounce_ms))
    scanSubmitTimerRef.current = window.setTimeout(() => {
      handleScanSubmit(rawValue)
    }, submitDelay)
  }

  function clearGlobalScanBuffer() {
    if (globalScanTimerRef.current) {
      window.clearTimeout(globalScanTimerRef.current)
      globalScanTimerRef.current = null
    }
    globalScanBufferRef.current = ''
    globalScanLastKeyAtRef.current = 0
  }

  function scheduleGlobalScanSubmit() {
    if (!isScannerCaptureTab(tab)) return
    if (globalScanTimerRef.current) {
      window.clearTimeout(globalScanTimerRef.current)
      globalScanTimerRef.current = null
    }

    const bufferedValue = globalScanBufferRef.current
    if (!normalizeScannedCode(bufferedValue)) return

    const submitDelay = Math.max(0, num(config.scanner_debounce_ms, DEFAULT_SALES_CONFIG.scanner_debounce_ms))
    globalScanTimerRef.current = window.setTimeout(() => {
      const scannedValue = globalScanBufferRef.current
      clearGlobalScanBuffer()
      if (!normalizeScannedCode(scannedValue)) return
      setScanValue(scannedValue)
      handleScanSubmitRef.current?.(scannedValue, 'Global page capture')
    }, submitDelay)
  }

  function isEditableEventTarget(target) {
    if (!(target instanceof Element)) return false
    return Boolean(target.closest('input, textarea, select, [contenteditable="true"]'))
  }

  useEffect(() => {
    if (!isScannerCaptureTab(tab)) {
      clearGlobalScanBuffer()
      return undefined
    }

    const handleGlobalScannerKeyDown = (event) => {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return
      if (isEditableEventTarget(event.target)) return

      const key = String(event.key || '')
      if (!key) return

      if (key === 'Enter' || key === 'Tab') {
        const bufferedValue = globalScanBufferRef.current
        if (!normalizeScannedCode(bufferedValue)) return
        event.preventDefault()
        clearGlobalScanBuffer()
        setScanValue(bufferedValue)
        handleScanSubmitRef.current?.(bufferedValue, 'Global page capture')
        return
      }

      if (key.length !== 1) return

      const now = Date.now()
      const resetWindowMs = Math.max(0, num(config.scanner_debounce_ms, DEFAULT_SALES_CONFIG.scanner_debounce_ms))
      if (!globalScanLastKeyAtRef.current || (now - globalScanLastKeyAtRef.current) > resetWindowMs) {
        globalScanBufferRef.current = ''
      }

      globalScanLastKeyAtRef.current = now
      globalScanBufferRef.current += key
      setScanValue(globalScanBufferRef.current)
      updateScannerDebug(globalScanBufferRef.current, 'Global page capture', 'Receiving scanner input')
      scheduleGlobalScanSubmit()
    }

    window.addEventListener('keydown', handleGlobalScannerKeyDown)
    return () => {
      window.removeEventListener('keydown', handleGlobalScannerKeyDown)
      clearGlobalScanBuffer()
    }
  }, [tab, config.scanner_debounce_ms])

  function replaceSalesQuery(nextParams) {
    const nextSearch = nextParams.toString()
    navigate(nextSearch ? `${location.pathname}?${nextSearch}` : location.pathname, {
      replace: true,
      preventScrollReset: true
    })
  }

  function clearSalesQueryParams(keys) {
    if (location.pathname !== '/sales') return
    const params = new URLSearchParams(location.search)
    let changed = false
    for (const key of keys) {
      if (!params.has(key)) continue
      params.delete(key)
      changed = true
    }
    if (!changed) return
    replaceSalesQuery(params)
  }

  function clearRouteScanParam() {
    if (location.pathname !== '/sales') return
    clearSalesQueryParams(['scan'])
  }

  function setActiveTab(nextTab) {
    setTab(nextTab)
    if (location.pathname !== '/sales') return

    const params = new URLSearchParams(location.search)
    params.set('tab', nextTab)
    if (nextTab !== 'returns') params.delete('receipt')
    replaceSalesQuery(params)
  }

  function salesErrorMessage(err, fallbackMessage) {
    const apiMessage = String(err?.response?.data?.error || '').trim()
    if (apiMessage === 'unknown product') return 'Code not registered'
    if (apiMessage === 'invalid code') return 'Invalid scan code'
    if (apiMessage === 'draft stock limit reached') return 'Item is already in the current POS draft at the stock limit.'
    if (apiMessage === 'out of stock') return 'Cannot add more. Stock limit reached.'
    return apiMessage || fallbackMessage
  }

  async function ensureDraftSaleReady(forceNew = false) {
    const activeDraftSaleId = forceNew ? null : Number(draftSaleIdRef.current)
    if (Number.isFinite(activeDraftSaleId) && activeDraftSaleId > 0) {
      if (cart.length > 0) return activeDraftSaleId

      try {
        const restored = await api.post('/sales/drafts', { sale_id: activeDraftSaleId })
        syncCartFromSale(restored.data)
        return Number(restored?.data?.id) || activeDraftSaleId
      } catch (restoreErr) {
        const apiMessage = String(restoreErr?.response?.data?.error || '').trim()
        const draftMissing = restoreErr?.response?.status === 404 || apiMessage === 'draft sale not found'
        if (!draftMissing) throw restoreErr
        draftSaleIdRef.current = null
        setDraftSaleId(null)
        clearStoredPosDraftSnapshot()
      }
    }

    if (!forceNew) {
      const savedDraftRaw = localStorage.getItem(POS_DRAFT_ID_STORAGE_KEY)
      const savedDraftId = Number(savedDraftRaw)
      if (Number.isFinite(savedDraftId) && savedDraftId > 0) {
        try {
          const restored = await api.post('/sales/drafts', { sale_id: savedDraftId })
          syncCartFromSale(restored.data)
          return Number(restored?.data?.id) || savedDraftId
        } catch (restoreErr) {
          const apiMessage = String(restoreErr?.response?.data?.error || '').trim()
          const draftMissing = restoreErr?.response?.status === 404 || apiMessage === 'draft sale not found'
          if (!draftMissing) throw restoreErr
          draftSaleIdRef.current = null
          clearStoredPosDraftSnapshot()
        }
      }
    }

    // If no active or saved draft was restored, always start a fresh draft.
    // This prevents reusing stale server-side drafts that can reserve stock invisibly.
    const res = await api.post('/sales/drafts', { force_new: true })
    syncCartFromSale(res.data)
    return res.data?.id
  }

  async function postDraftItem(payload) {
    try {
      const saleId = await ensureDraftSaleReady()
      const res = await api.post(`/sales/${saleId}/items`, payload)
      syncCartFromSale(res.data?.sale)
      return res.data
    } catch (err) {
      if (String(err?.response?.data?.error || '').trim() !== 'draft sale not found') throw err
      draftSaleIdRef.current = null
      setDraftSaleId(null)
      const saleId = await ensureDraftSaleReady(true)
      const res = await api.post(`/sales/${saleId}/items`, payload)
      syncCartFromSale(res.data?.sale)
      return res.data
    }
  }

  function buildFallbackTransactions(rows, filters = {}) {
    const typeFilter = String(filters.type || '').trim()
    const receiptFilter = String(filters.receipt_no || '').trim().toLowerCase()
    const exactRecordedDate = String(filters.recorded_date || '').trim()
    const fromFilter = exactRecordedDate || String(filters.from || '').trim()
    const toFilter = exactRecordedDate || String(filters.to || '').trim()

    return (Array.isArray(rows) ? rows : []).flatMap((sale) => {
      const customer = buildCustomerSummary(sale)
      const payment = {
        transaction_id: `PAY-SALE-${sale.id}`,
        type: 'SALE_PAYMENT',
        created_at: sale.payment_received_at || sale.date,
        sale_id: sale.id,
        sale_number: sale.sale_number,
        receipt_no: sale.receipt_no,
        payment_method: sale.payment_method,
        amount: round(sale.total),
        amount_received: round(sale.amount_received || sale.total),
        change_amount: round(sale.change_amount),
        user_name: sale.clerk_name || '-',
        customer_code: customer?.customer_code || null,
        customer_name: customerDisplayName(customer),
        customer_phone: customer?.phone || null,
        customer_email: customer?.email || null
      }
      const returnedQty = num(sale.returned_qty)
      if (!returnedQty) return [payment]
      return [payment, {
        transaction_id: `RET-SALE-${sale.id}`,
        type: 'SALE_RETURN',
        created_at: sale.date,
        sale_id: sale.id,
        sale_number: sale.sale_number,
        receipt_no: sale.receipt_no,
        payment_method: sale.payment_method,
        amount: round(sale.returned_amount),
        quantity: returnedQty,
        product_name: sale.return_status === 'FULL' ? 'Full sale return' : 'Returned items',
        user_name: sale.clerk_name || '-',
        customer_code: customer?.customer_code || null,
        customer_name: customerDisplayName(customer),
        customer_phone: customer?.phone || null,
        customer_email: customer?.email || null
      }]
    })
      .filter((row) => !typeFilter || row.type === typeFilter)
      .filter((row) => !receiptFilter || String(row.receipt_no || '').toLowerCase().includes(receiptFilter))
      .filter((row) => {
        if (!fromFilter && !toFilter) return true
        return isDateWithinInclusive(row.created_at, fromFilter, toFilter)
      })
      .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
  }

  async function fetchTransactions() {
    try {
      setError(null); setLoading(true)
      const q = []
      const hasRecordedDate = Boolean(transactionRecordedDate)
      const useRange = showTransactionRange && !hasRecordedDate
      if (transactionType) q.push(`type=${encodeURIComponent(transactionType)}`)
      if (transactionReceipt.trim()) q.push(`receipt_no=${encodeURIComponent(transactionReceipt.trim())}`)
      if (hasRecordedDate) {
        q.push(`from=${encodeURIComponent(transactionRecordedDate)}`)
        q.push(`to=${encodeURIComponent(transactionRecordedDate)}`)
      } else if (useRange) {
        if (transactionFrom) q.push(`from=${encodeURIComponent(transactionFrom)}`)
        if (transactionTo) q.push(`to=${encodeURIComponent(transactionTo)}`)
      }
      setTransactions((await api.get(q.length ? `/sales/transactions?${q.join('&')}` : '/sales/transactions')).data || [])
    } catch (err) {
      const message = err?.response?.data?.error || 'Failed to load transactions'
      if (err?.response?.status === 404 && message === 'sale not found') {
        try {
          const saleRows = (await api.get('/sales')).data || []
          setSales(saleRows)
          setTransactions(buildFallbackTransactions(saleRows, {
            type: transactionType,
            receipt_no: transactionReceipt,
            recorded_date: transactionRecordedDate,
            from: useRange ? transactionFrom : '',
            to: useRange ? transactionTo : ''
          }))
          return
        } catch (fallbackErr) {
          setError(fallbackErr?.response?.data?.error || 'Failed to load transactions')
          return
        }
      }
      setError(message)
    } finally { setLoading(false) }
  }

  async function fetchReport() {
    try {
      setLoading(true)
      const q = []
      if (reportFrom) q.push(`from=${encodeURIComponent(reportFrom)}`)
      if (reportTo) q.push(`to=${encodeURIComponent(reportTo)}`)
      setReport((await api.get(q.length ? `/sales/reports/summary?${q.join('&')}` : '/sales/reports/summary')).data || null)
    } catch (err) {
      setError(err?.response?.data?.error || 'Failed to load report')
    } finally { setLoading(false) }
  }

  function resetDraft() {
    draftSaleIdRef.current = null
    setDraftSaleId(null)
    setPendingOrder(null)
    setCart([])
    setScanValue('')
    setSearch('')
    setSelectedProduct('')
    setIsProductPickerOpen(false)
    setPrice('')
    setQty('1')
    setSelectedCustomer(null)
    setCustomerSearch('')
    setCustomerOptions([])
    setPaymentMethod('cash')
    setDiscountPercentage('')
    setPaymentAmount('0.00')
    clearBufferedScanSubmit()
    clearGlobalScanBuffer()
    lastScanRef.current = { code: '', at: 0 }
    clearStoredPosDraftSnapshot()
  }

  async function clearAllCart() {
    if (!window.confirm('Clear entire cart? This action cannot be undone.')) return
    clearMsg()
    if (draftSaleId) {
      try {
        setLoading(true)
        await api.delete(`/sales/${draftSaleId}`)
      } catch (err) {
        console.warn('Could not delete draft on server:', err)
      }
    }
    resetDraft()
    flash('Cart cleared.')
  }

  async function handleScanSubmit(rawValue = scanValue, source = 'Scan input field') {
    clearBufferedScanSubmit()
    clearMsg()
    const normalizedCode = normalizeScannedCode(rawValue)
    if (!normalizedCode) {
      updateScannerDebug(rawValue, source, 'Ignored empty scan')
      focusScanInput()
      return
    }

    updateScannerDebug(rawValue, source, 'Submitting scanned code')

    const now = Date.now()
    const clientDuplicateWindowMs = Math.min(Math.max(0, num(config.scanner_debounce_ms, 250)), 80)
    if (lastScanRef.current.code === normalizedCode && (now - lastScanRef.current.at) < clientDuplicateWindowMs) {
      setScanValue('')
      updateScannerDebug(rawValue, source, 'Duplicate scan ignored on client debounce')
      flash('Duplicate scan ignored.')
      focusScanInput()
      return
    }

    // Clear the field before awaiting the API so consecutive scanner reads do not concatenate.
    setScanValue('')

    try {
      const response = await addToCart({ code: normalizedCode }, 1, { clearMessages: false, source: 'scan' })
      lastScanRef.current = { code: normalizedCode, at: Date.now() }
      if (response?.duplicate_scan || response?.ignored) {
        updateScannerDebug(rawValue, source, 'Duplicate scan ignored by server')
        flash('Duplicate scan ignored.')
      } else {
        updateScannerDebug(rawValue, source, 'Product added to cart')
        flash('Product scanned and saved to current sale.')
      }
    } catch (err) {
      updateScannerDebug(rawValue, source, salesErrorMessage(err, 'Failed to scan product'))
      setError(salesErrorMessage(err, 'Failed to scan product'))
    } finally {
      focusScanInput()
    }
  }

  async function addToCart(product, quantity = 1, options = {}) {
    const clearMessages = options.clearMessages !== false
    const normalizedQuantity = Math.max(1, Math.floor(num(quantity, 1)))
    const payload = { quantity: normalizedQuantity }

    const normalizedCode = normalizeScannedCode(
      product?.scanCode || product?.code || (options.source === 'scan' ? (product?.barcode || product?.sku || product) : '')
    )

    if (normalizedCode) {
      payload.code = normalizedCode
    } else {
      const resolvedProductId = Number(product?.id ?? product?.product_id)
      if (!Number.isFinite(resolvedProductId) || resolvedProductId <= 0) {
        throw new Error('A valid product is required to add to cart')
      }
      payload.product_id = resolvedProductId

      if (options.unitPrice !== undefined) {
        payload.unit_price = options.unitPrice
      } else if (product?.unit_price !== undefined) {
        payload.unit_price = product.unit_price
      }
    }

    return queueCartMutation(async () => {
      if (clearMessages) clearMsg()
      setLoading(true)
      try {
        return await postDraftItem(payload)
      } finally {
        setLoading(false)
      }
    })
  }

  async function handleManualAddToCart() {
    clearMsg()
    const product = products.find((item) => String(item.id) === String(selectedProduct))
    if (!product) return setError('Select a product')
    const requestedPrice = allowPriceOverride ? (price === '' ? product.price : price) : undefined
    const err = qtyError(qty, product.id)
    if (err) return setError(err)

    try {
      await addToCart(product, Math.max(1, num(qty, 1)), {
        clearMessages: false,
        unitPrice: requestedPrice
      })
      setSelectedProduct('')
      setSearch('')
      setIsProductPickerOpen(false)
      setPrice('')
      setQty('1')
    } catch (err) {
      setError(salesErrorMessage(err, 'Failed to add product to cart'))
    } finally {
      focusScanInput()
    }
  }

  async function updateCartQty(itemId, nextQty) {
    const itemIndex = cart.findIndex((entry) => String(entry.id) === String(itemId))
    const item = itemIndex >= 0 ? cart[itemIndex] : null
    if (!item || !draftSaleId) return

    const err = qtyError(nextQty, item.product_id, itemIndex)
    if (err) return setError(err)

    try {
      clearMsg()
      setLoading(true)
      const res = await api.put(`/sales/${draftSaleId}/items/${item.id}`, {
        quantity: Math.max(1, num(nextQty, 1))
      })
      syncCartFromSale(res.data?.sale)
    } catch (err) {
      setError(salesErrorMessage(err, 'Failed to update cart quantity'))
    } finally {
      setLoading(false)
      focusScanInput()
    }
  }

  async function updateCartPrice(itemId, nextPrice) {
    if (!allowPriceOverride) return
    const value = num(nextPrice, NaN)
    if (!Number.isFinite(value) || value < 0) return setError('Price must be zero or greater')

    const item = cart.find((entry) => String(entry.id) === String(itemId))
    if (!item || !draftSaleId) return

    try {
      clearMsg()
      setLoading(true)
      const res = await api.put(`/sales/${draftSaleId}/items/${item.id}`, {
        quantity: item.quantity,
        unit_price: round(value)
      })
      syncCartFromSale(res.data?.sale)
    } catch (err) {
      setError(salesErrorMessage(err, 'Failed to update item price'))
    } finally {
      setLoading(false)
      focusScanInput()
    }
  }

  async function removeCartItem(itemId) {
    const item = cart.find((entry) => String(entry.id) === String(itemId))
    if (!item || !draftSaleId) return

    try {
      clearMsg()
      setLoading(true)
      const res = await api.delete(`/sales/${draftSaleId}/items/${item.id}`)
      syncCartFromSale(res.data?.sale)
    } catch (err) {
      setError(salesErrorMessage(err, 'Failed to remove cart item'))
    } finally {
      setLoading(false)
      focusScanInput()
    }
  }

  async function assignDraftCustomer(customerIdValue) {
    clearMsg()
    const saleId = Number(activeDraftSaleId)
    if (!Number.isFinite(saleId) || saleId <= 0) {
      return setError('Add an item to cart first so a draft sale can be created.')
    }

    const normalizedCustomerId = customerIdValue ? Number(customerIdValue) : null
    if (normalizedCustomerId !== null && (!Number.isFinite(normalizedCustomerId) || normalizedCustomerId <= 0)) {
      return setError('Invalid customer selection.')
    }

    try {
      setLoading(true)
      const sale = (await api.patch(`/sales/drafts/${saleId}/customer`, { customer_id: normalizedCustomerId })).data
      syncCartFromSale(sale)
      flash(normalizedCustomerId ? 'Buying customer saved for this sale.' : 'Buying customer set to walk-in.')
    } catch (err) {
      setError(err?.response?.data?.error || 'Failed to update buying customer')
    } finally {
      setLoading(false)
    }
  }

  function startPayment() {
    clearMsg()
    if (!cart.length) return setError('Add items to cart first')
    if (cart.some((item, index) => !!qtyError(item.quantity, item.product_id, index))) return setError('Resolve cart stock issues first')
    if (cartHasLockedPriceOverride) return setError('This draft contains price overrides that require manager permission before checkout')
    if (!draftSaleId) return setError('Draft sale was not prepared. Add an item again.')
    if (total <= 0) return setError('Total must be greater than 0')
    const nextPendingOrder = buildPendingOrderSnapshot({
      cart,
      draftSaleId,
      customer: selectedCustomer,
      paymentMethod,
      discountPercentage: discountPct,
      subtotal,
      discountAmount,
      nonVatSales,
      taxAmount,
      vatableSales,
      taxRate: liveTaxSummary.taxRate,
      taxRatePercentage,
      total,
      invoiceType: liveTaxSummary.invoiceType
    })
    if (!nextPendingOrder) return setError('Add items to cart first')

    setPendingOrder(nextPendingOrder)
    setPaymentAmount((currentValue) => (
      shouldResetPaymentAmount(currentValue, pendingOrder?.total, nextPendingOrder.total)
        ? '0.00'
        : currentValue
    ))
    setActiveTab('payment')
  }

  async function completeSale() {
    clearMsg()
    if (!pendingOrder) return setError('No pending order')
    if (!isAmountValid) return setError('Payment must be greater than or equal to the total amount')
    try {
      setLoading(true)
      const res = await api.post('/sales', {
        draft_sale_id: pendingOrder.draft_sale_id,
        items: pendingOrder.items.map((item) => ({ product_id: item.product_id, quantity: item.quantity, unit_price: item.unit_price })),
        payment_method: pendingOrder.payment_method,
        payment_amount: round(tendered),
        discount_percentage: pendingOrder.discount_percentage
      })
      setLastReceipt(res.data)
      resetDraft()
      await refreshProducts()
      flash(`Sale ${res.data.sale_number} completed. Invoice ${res.data.receipt_no} generated.`)
    } catch (err) {
      setError(err?.response?.data?.error || 'Failed to complete sale')
    } finally { setLoading(false) }
  }

  async function showSale(id) {
    setOpenSaleMenuId(null)
    try { setLoading(true); setViewSale((await api.get(`/sales/${id}`)).data) }
    catch (err) { setError(err?.response?.data?.error || 'Failed to load sale details') }
    finally { setLoading(false) }
  }

  async function refundSale(id) {
    if (!window.confirm('Process a full refund for this sale?')) return
    clearMsg()
    setOpenSaleMenuId(null)
    try {
      setLoading(true)
      await api.post(`/sales/${id}/refund`, {})
      await Promise.all([fetchSales(), fetchTransactions(), fetchReport()])
      await refreshProducts()
      flash('Full refund processed successfully')
    } catch (err) {
      setError(err?.response?.data?.error || 'Refund failed')
    } finally { setLoading(false) }
  }

  async function loadReceiptFromHistory(receiptId) {
    try {
      const history = (await api.get(`/sales?receipt_no=${encodeURIComponent(receiptId)}`)).data
      const matchedSale = Array.isArray(history) ? history.find((sale) => String(sale?.receipt_no || '').toUpperCase() === receiptId.toUpperCase()) : null
      if (!matchedSale) return null
      return matchedSale
    } catch {
      return null
    }
  }

  async function loadAvailableReceipts() {
    try {
      const result = (await api.get('/sales')).data
      const receipts = (Array.isArray(result) ? result : []).map((row) => ({
        id: row.id,
        receipt_no: row.receipt_no || '',
        sale_number: row.sale_number || '',
        date: row.date || '',
        total: row.total || 0
      }))
      setAvailableReceipts(receipts)
    } catch (err) {
      console.error('Failed to load receipts:', err)
    }
  }

  function handleReceiptSearch(value) {
    setReturnReceiptNo(value)
    setShowReceiptDropdown(true)

    if (receiptSearchTimeout) clearTimeout(receiptSearchTimeout)

    const timeoutId = setTimeout(() => {
      if (!value.trim()) {
        setFilteredReceipts(availableReceipts.slice(0, 10))
      } else {
        const needle = value.toLowerCase().trim()
        const results = availableReceipts.filter((receipt) =>
          receipt.receipt_no.toLowerCase().includes(needle)
        ).slice(0, 15)
        setFilteredReceipts(results)
      }
    }, 300)

    setReceiptSearchTimeout(timeoutId)
  }

  function selectReceiptFromDropdown(receiptNo) {
    setReturnReceiptNo(receiptNo)
    setShowReceiptDropdown(false)
    setTimeout(() => lookupReceipt(receiptNo), 0)
  }

  function setReturnQuantity(itemId, rawValue, availableQty) {
    const raw = String(rawValue || '')
    if (!raw.trim()) {
      setReturnQuantities((prev) => ({ ...prev, [itemId]: '' }))
      return
    }

    const normalizedQty = Math.floor(num(raw, 0))
    const clampedQty = Math.min(Math.max(normalizedQty, 0), Math.max(num(availableQty), 0))
    setReturnQuantities((prev) => ({ ...prev, [itemId]: clampedQty > 0 ? String(clampedQty) : '' }))
  }

  function resetReturnLookup() {
    setReturnLookup(null)
    setReturnReason('')
    setReturnDisposition('RESTOCK')
    setReturnQuantities({})
    setReturnReceiptNo('')
    setShowReturnReceiptPreview(false)
    setShowReceiptDropdown(false)
  }

  async function lookupReceipt(receiptValue = returnReceiptNo, options = {}) {
    clearMsg()
    const receiptId = extractScannedReceiptId(receiptValue)
    if (!receiptId) return setError('Enter a Receipt No. to continue.')

    const forceReload = Boolean(options?.forceReload)
    const alreadyLoaded = normalizeReceiptKey(returnLookup?.receipt_no) === normalizeReceiptKey(receiptId)
    if (alreadyLoaded && !forceReload) {
      setReturnReceiptNo(receiptId)
      setShowReceiptDropdown(false)
      flash(`Receipt No. ${receiptId} is already loaded.`)
      return
    }

    try {
      setLoading(true)
      const sale = (await api.get(`/sales/receipt/${encodeURIComponent(receiptId)}`)).data
      const preserveSelection = isSameLoadedReceipt(returnLookup, sale)
      setReturnReceiptNo(receiptId)
      setReturnLookup(sale)
      setReturnQuantities(buildReturnQuantityState(sale.items, returnQuantities, preserveSelection))
      if (!preserveSelection) setShowReturnReceiptPreview(false)
    } catch (err) {
      const fallbackSale = await loadReceiptFromHistory(receiptId)
      if (fallbackSale) {
        const preserveSelection = isSameLoadedReceipt(returnLookup, fallbackSale)
        setReturnReceiptNo(receiptId)
        setReturnLookup(fallbackSale)
        setReturnQuantities(buildReturnQuantityState(fallbackSale.items, returnQuantities, preserveSelection))
        if (!preserveSelection) setShowReturnReceiptPreview(false)
        flash(`Receipt No. ${receiptId} loaded from sales history.`)
      } else {
        setReturnLookup(null)
        setReturnQuantities({})
        setError(err?.response?.data?.error || 'Receipt No. not found. Check the receipt and try again.')
      }
    } finally { setLoading(false) }
  }

  async function submitReturn() {
    clearMsg()
    if (!returnLookup) return setError('Load a Receipt No. first.')
    if (!hasReturnableItems) return setError('All items in this receipt are already fully returned.')
    const items = (returnLookup.items || [])
      .map((item) => {
        const availableQty = Math.max(num(item.available_to_return), 0)
        const requestedQty = Math.min(Math.max(Math.floor(num(returnQuantities[item.id], 0)), 0), availableQty)
        return { sale_item_id: item.id, quantity: requestedQty }
      })
      .filter((item) => item.quantity > 0)
    if (!items.length) return setError('Enter Qty to Return for at least one item.')
    try {
      setLoading(true)
      const res = await api.post('/sales/returns', { receipt_no: returnLookup.receipt_no, items, reason: returnReason || undefined, return_disposition: returnDisposition })
      setReturnLookup(res.data.sale)
      setReturnReason('')
      setReturnDisposition('RESTOCK')
      setReturnQuantities(buildReturnQuantityState(res.data.sale?.items || []))
      await refreshProducts()
      await Promise.all([fetchSales(), fetchTransactions(), fetchReport()])
      flash(`Return completed for Receipt No. ${res.data.sale.receipt_no}`)
    } catch (err) {
      setError(err?.response?.data?.error || 'Return failed')
    } finally { setLoading(false) }
  }

  function printReceipt() {
    if (!receiptRef.current) return
    const popup = window.open('', '_blank', 'width=400,height=650')
    if (!popup) return
    popup.document.write(`<html><head><title>Sales Receipt</title></head><body style="font-family:Courier New,monospace;padding:20px">${receiptRef.current.innerHTML}<script>window.print();window.close();</script></body></html>`)
    popup.document.close()
  }

  function useSaleReceipt(receiptNo) {
    setOpenSaleMenuId(null)
    setActiveTab('returns')
    setReturnReceiptNo(receiptNo)
    setTimeout(() => lookupReceipt(receiptNo), 0)
  }

  function toggleSaleMenu(saleId) {
    setOpenSaleMenuId((current) => current === saleId ? null : saleId)
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Sales Management</h1>
          <p className="page-subtitle">POS, accept payment, return by receipt, and automated sales tracking</p>
        </div>
      </div>

      {error && <div className="error-msg" style={{ marginBottom: 16 }}>{error}</div>}
      {success && <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#15803d', padding: '10px 14px', borderRadius: 6, marginBottom: 16 }}>{success}</div>}

      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '2px solid var(--border)', flexWrap: 'wrap' }}>
        {tabs.map(([key, label]) => (
          <button key={key} onClick={() => { clearMsg(); setActiveTab(key) }} style={{ padding: '10px 18px', border: 'none', borderBottom: tab === key ? '2px solid var(--gold)' : '2px solid transparent', background: 'transparent', color: tab === key ? 'var(--gold-dark)' : 'var(--text-mid)', fontWeight: tab === key ? 600 : 400, cursor: 'pointer', marginBottom: -2 }}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'pos' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 340px', gap: 20 }}>
          <div>
            <div className="card" style={{ marginBottom: 16 }}>
              <h3 style={{ marginBottom: 12 }}>Build Order</h3>
              <div className="form-group">
                <label className="form-label">Scan Barcode / QR</label>
                <input
                  ref={scanInputRef}
                  className="form-input"
                  value={scanValue}
                  onChange={(e) => {
                    const nextValue = e.target.value
                    setScanValue(nextValue)
                    updateScannerDebug(nextValue, 'Scan input field', 'Receiving scanner input')
                    scheduleBufferedScanSubmit(nextValue)
                  }}
                  onKeyDown={(e) => {
                    if (e.key !== 'Enter' && e.key !== 'Tab') return
                    e.preventDefault()
                    e.stopPropagation()
                    handleScanSubmit(e.currentTarget.value, 'Scan input field')
                  }}
                  placeholder="Scan barcode or QR, then press Enter"
                />
                <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text-light)' }}>
                  Every successful scan is saved to the current sale draft automatically.
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.6fr) 140px 100px', gap: 12, alignItems: 'end' }}>
                <div className="form-group" style={{ marginBottom: 0, position: 'relative' }}>
                  <label className="form-label">Product Search</label>
                  <input
                    className="form-input sales-return-lookup-input"
                    value={search}
                    onChange={(e) => handleProductSearchChange(e.target.value)}
                    onFocus={() => setIsProductPickerOpen(true)}
                    onBlur={() => window.setTimeout(() => setIsProductPickerOpen(false), 120)}
                    onKeyDown={(e) => {
                      if (e.key !== 'Enter' && e.key !== 'Tab') return
                      e.preventDefault()
                      clearMsg()
                      const exactScanMatch = findProductByExactScanCode(products, e.currentTarget.value)
                      if (exactScanMatch) {
                        setSearch('')
                        setSelectedProduct('')
                        setPrice('')
                        setIsProductPickerOpen(false)
                        handleScanSubmit(e.currentTarget.value, 'Product search field')
                        return
                      }
                      if (!selectedProduct && filteredProducts.length === 1) {
                        selectProductOption(filteredProducts[0])
                      }
                    }}
                    placeholder="Search products, or scan exact barcode / SKU"
                  />
                  {isProductPickerOpen && (
                    <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, zIndex: 30, background: '#fff', border: '1px solid var(--border)', borderRadius: 10, boxShadow: '0 12px 30px rgba(15, 23, 42, 0.08)', maxHeight: 260, overflowY: 'auto' }}>
                      {filteredProducts.length === 0 ? (
                        <div style={{ padding: '12px 14px', color: 'var(--text-light)', fontSize: 13 }}>No matching products found.</div>
                      ) : filteredProducts.slice(0, 8).map((product) => (
                        <button
                          type="button"
                          key={product.id}
                          onMouseDown={(e) => {
                            e.preventDefault()
                            selectProductOption(product)
                          }}
                          style={{ width: '100%', padding: '12px 14px', border: 'none', borderBottom: '1px solid rgba(148, 163, 184, 0.16)', background: String(product.id) === String(selectedProduct) ? '#fff7ed' : '#fff', textAlign: 'left', cursor: 'pointer' }}
                        >
                          <div style={{ fontWeight: 600, color: 'var(--text-dark)' }}>{productLabel(product)}</div>
                          <div style={{ marginTop: 4, fontSize: 12, color: 'var(--text-light)' }}>
                            Barcode: {product.barcode || '-'} | Stock: {num(product.stock_quantity)} | {fmt(product.price)}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">Price</label><input className="form-input" type="number" min="0" step="0.01" value={price} disabled={!allowPriceOverride} onChange={(e) => setPrice(e.target.value)} /></div>
                <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">Qty</label><input className="form-input" type="number" min="1" value={qty} onChange={(e) => setQty(e.target.value)} /></div>
              </div>
              {selectedProductData && <div style={{ fontSize: 12, color: 'var(--text-light)', marginTop: 8 }}>Stock: {num(selectedProductData.stock_quantity)} | Barcode: {selectedProductData.barcode || '-'} | Price: {fmt(selectedProductData.price)}</div>}
              <button className="btn btn-primary" onClick={handleManualAddToCart} disabled={!selectedProduct || !!qtyError(qty, selectedProduct) || loading} style={{ marginTop: 12 }}>Add To Cart</button>
            </div>

            <div className="card">
              <h3 style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Cart</span>
                {cart.length > 0 && <button className="btn btn-danger" onClick={clearAllCart} disabled={loading} style={{ padding: '4px 10px', fontSize: 12 }}>Clear All</button>}
              </h3>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Product</th><th>Price</th><th>Qty</th><th>Subtotal</th><th /></tr></thead>
                  <tbody>
                    {cart.length === 0 ? <tr><td colSpan="5" style={{ textAlign: 'center', color: 'var(--text-light)', padding: 24 }}>No items in cart yet.</td></tr> : cart.map((item, index) => (
                      <tr key={item.id || `${item.product_id}-${index}`}>
                        <td><div style={{ fontWeight: 600 }}>{item.name}</div>{item.sku && <div style={{ fontSize: 11, color: 'var(--text-light)' }}>{item.sku}</div>}</td>
                        <td>{allowPriceOverride ? <input type="number" min="0" step="0.01" value={item.unit_price} onChange={(e) => updateCartPrice(item.id, e.target.value)} style={{ width: 90 }} /> : fmt(item.unit_price)}</td>
                        <td><input type="number" min="1" value={item.quantity} onChange={(e) => updateCartQty(item.id, e.target.value)} style={{ width: 70 }} /></td>
                        <td style={{ fontWeight: 600 }}>{fmt(num(item.unit_price) * num(item.quantity))}</td>
                        <td><button className="btn btn-danger" onClick={() => removeCartItem(item.id)} style={{ padding: '4px 8px', fontSize: 12 }}>X</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="card" style={{ position: 'sticky', top: 80, height: 'fit-content' }}>
            <h3 style={{ marginBottom: 12 }}>POS Summary</h3>
            <div className="form-group">
              <label className="form-label">Payment Method</label>
              <div className="form-input" style={{ display: 'flex', alignItems: 'center' }}>Cash</div>
            </div>
            <div className="form-group"><label className="form-label">Discount (%)</label><input className="form-input" type="number" min="0" max="100" step="0.01" value={allowDiscount ? discountPercentage : '0'} disabled={!allowDiscount} onChange={(e) => setDiscountPercentage(e.target.value)} /></div>
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
              <TaxBreakdownSummary summary={liveTaxSummary} fmt={fmt} subtotal={subtotal} discountAmount={discountAmount} totalLabel="Total" />
            </div>
            {!invoiceRequirementsComplete && (
              <div style={{ marginTop: 12, padding: '10px 12px', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 8, color: '#9a3412', fontSize: 12 }}>
                BIR invoice seller details are incomplete. Fill in Settings before using printed invoices for compliance.
                {invoiceMissingFieldsText ? ` Missing: ${invoiceMissingFieldsText}.` : ''}
              </div>
            )}
            {cartHasLockedPriceOverride && <div style={{ marginTop: 12, padding: '10px 12px', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 8, color: '#9a3412', fontSize: 12 }}>This cart includes manager-set price overrides. A cashier without price override permission cannot complete it.</div>}
            <button className="btn btn-primary" onClick={startPayment} disabled={!cart.length || loading} style={{ width: '100%', marginTop: 16 }}>Proceed To Accept Payment</button>
          </div>
        </div>
      )}

      {tab === 'payment' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 340px', gap: 20 }}>
          <div>
            <div className="card" style={{ marginBottom: 16 }}>
              <h3 style={{ marginBottom: 12 }}>Accept Payment</h3>
              {!pendingOrder ? <p style={{ color: 'var(--text-light)' }}>No pending order. Build one in POS first.</p> : <>
                <div className="form-group" style={{ marginBottom: 12 }}>
                  <label className="form-label">Buying Customer</label>
                  <input
                    className="form-input"
                    value={customerSearch}
                    onChange={(e) => setCustomerSearch(e.target.value)}
                    placeholder="Search by customer name, code, phone, or email"
                    disabled={loading}
                    style={{ marginBottom: 8 }}
                  />
                  <select
                    className="form-input"
                    value={selectedCustomer?.id || ''}
                    onChange={(e) => assignDraftCustomer(e.target.value)}
                    disabled={loading}
                  >
                    <option value="">{config.walk_in_customer_label || 'Walk-in Customer'}</option>
                    {paymentCustomerOptions.map((customer) => (
                      <option key={customer.id} value={customer.id}>
                        {customer.full_name}{customer.customer_code ? ` (${customer.customer_code})` : ''}
                      </option>
                    ))}
                  </select>
                  <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text-light)' }}>
                    {customerLookupLoading ? 'Loading customer options...' : `${paymentCustomerOptions.length} customer option(s) available.`}
                  </div>
                </div>
                <div style={{ marginBottom: 12, padding: '10px 12px', borderRadius: 8, background: '#f8fafc', color: 'var(--text-mid)' }}>
                  <div style={{ fontWeight: 700, color: 'var(--text-dark)' }}>{customerDisplayName(pendingOrder.customer)}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-light)', marginTop: 4 }}>
                    {pendingOrder.customer ? customerDisplayMeta(pendingOrder.customer) : 'Walk-in sale'}
                  </div>
                </div>
                <div className="table-wrap" style={{ marginBottom: 16 }}><table><thead><tr><th>Item</th><th>Qty</th><th>Unit</th><th>Subtotal</th></tr></thead><tbody>{pendingOrder.items.map((item, index) => <tr key={item.id || `${item.product_id}-${index}`}><td>{item.name}</td><td>{item.quantity}</td><td>{fmt(item.unit_price)}</td><td style={{ fontWeight: 600 }}>{fmt(item.unit_price * item.quantity)}</td></tr>)}</tbody></table></div>
                <div style={{ marginBottom: 16, padding: '10px 12px', borderRadius: 8, background: '#f8fafc', color: 'var(--text-mid)' }}>
                  <TaxBreakdownSummary summary={pendingOrderTaxSummary} fmt={fmt} subtotal={pendingOrder.subtotal} discountAmount={pendingOrder.discount_amount} totalLabel="Total Due" compact />
                </div>
                <div className="form-group"><label className="form-label">Amount Received</label><input className="form-input" type="number" min="0" step="0.01" value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} /></div>
                <div style={{ display: 'flex', gap: 8 }}><button className="btn btn-secondary" onClick={() => setActiveTab('pos')}>Back To POS</button><button className="btn btn-primary" onClick={completeSale} disabled={!canConfirmPayment} style={{ flex: 1 }}>{loading ? 'Processing...' : 'Confirm Payment & Complete Sale'}</button></div>
              </>}
            </div>

            {lastReceipt && <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}><h3>Latest Receipt</h3><button className="btn btn-secondary" onClick={printReceipt}>Print Receipt</button></div>
              {!invoiceRequirementsComplete && (
                <div style={{ marginBottom: 12, padding: '10px 12px', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 8, color: '#9a3412', fontSize: 12 }}>
                  Printed receipt details are incomplete for BIR use. Missing: {invoiceMissingFieldsText || 'seller configuration'}.
                </div>
              )}
              <div ref={receiptRef}>
                <div style={{ textAlign: 'center', marginBottom: 8 }}>
                  <h2 style={{ margin: 0, fontSize: 15 }}>{invoiceConfig.displayName || "Cecille's N'Style"}</h2>
                  {invoiceConfig.registeredName ? <div>{invoiceConfig.registeredName}</div> : null}
                  <div>{invoiceRegistrationLabel(invoiceConfig)} {formatTinWithBranch(invoiceConfig) || '-'}</div>
                  <div>{invoiceConfig.registeredBusinessAddress || '-'}</div>
                  <div style={{ fontWeight: 700, marginTop: 4 }}>{invoiceConfig.registrationType === 'NON_VAT' ? 'Non-VAT Invoice' : 'VAT Invoice'}</div>
                </div>
                <div>Receipt No: {lastReceipt.receipt_no}</div><div>Transaction ID: {lastReceipt.sale_number}</div><div>Date: {fmtDate(lastReceipt.date || new Date())}</div>
                <div>Customer: {customerDisplayName(buildCustomerSummary(lastReceipt))}</div>
                <div>Customer Contact: {buildCustomerSummary(lastReceipt) ? customerDisplayMeta(buildCustomerSummary(lastReceipt)) : 'Walk-in sale'}</div>
                <div>Payment: {paymentMethodLabel(lastReceipt.payment_method)}</div>
                <div style={{ marginTop: 8, fontWeight: 700 }}>Items</div>
                {(lastReceipt.items || []).map((item, index) => <div key={`${item.id || index}`}>{item.product_name || item.productName || 'Item'} x{item.quantity || item.qty} - {fmt(item.line_total || item.lineTotal)}</div>)}
                <div style={{ marginTop: 8 }}>Subtotal: {fmt(lastReceipt.subtotal)}</div><div>Discount: {fmt(lastReceipt.discount)}</div>
                <div>{lastReceiptTaxSummary?.taxRatePercentage > 0 ? `VATable Sales (${formatPercentLabel(lastReceiptTaxSummary.taxRatePercentage)})` : 'VATable Sales'}: {fmt(lastReceiptTaxSummary?.vatableSales)}</div>
                <div>{lastReceiptTaxSummary?.taxRatePercentage > 0 ? `VAT Amount (${formatPercentLabel(lastReceiptTaxSummary.taxRatePercentage)})` : 'VAT Amount'}: {fmt(lastReceiptTaxSummary?.vatAmount)}</div>
                <div>Non-VAT Sales: {fmt(lastReceiptTaxSummary?.nonVatSales)}</div>
                <div>Received: {fmt(lastReceipt.amount_received)}</div><div>Change: {fmt(lastReceipt.change_amount)}</div>
                <div style={{ marginTop: 8, fontWeight: 700 }}>TOTAL AMOUNT DUE: {fmt(lastReceipt.total)}</div>
                {invoiceConfig.registrationType === 'NON_VAT' ? <div style={{ marginTop: 8, fontWeight: 700 }}>{NON_VAT_INPUT_TAX_NOTICE}</div> : null}
                <div style={{ marginTop: 10 }}>BIR Permit No.: {invoiceConfig.birPermitNumber || '-'}</div>
                <div>BIR Permit Date Issued: {formatInvoiceDateOnly(invoiceConfig.birPermitDateIssued)}</div>
                <div>Authority to Print No.: {invoiceConfig.atpNumber || '-'}</div>
                <div>Authority to Print Date Issued: {formatInvoiceDateOnly(invoiceConfig.atpDateIssued)}</div>
                <div>Approved Serial Range: {invoiceConfig.approvedSeries || '-'}</div>
              </div>
            </div>}
          </div>

          <div className="card" style={{ position: 'sticky', top: 80, height: 'fit-content' }}>
            <h3 style={{ marginBottom: 12 }}>Payment Validation</h3>
            {!pendingOrder ? <p style={{ color: 'var(--text-light)' }}>Payment summary appears here after you proceed from POS.</p> : <>
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 12, color: 'var(--text-light)' }}>Customer</div>
                <div style={{ fontWeight: 700 }}>{customerDisplayName(pendingOrder.customer)}</div>
                <div style={{ fontSize: 12, color: 'var(--text-light)' }}>
                  {pendingOrder.customer ? customerDisplayMeta(pendingOrder.customer) : 'Walk-in sale'}
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-light)' }}><span>VATable Sales</span><strong>{fmt(pendingOrderTaxSummary?.vatableSales)}</strong></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-light)' }}><span>VAT Amount</span><strong>{fmt(pendingOrderTaxSummary?.vatAmount)}</strong></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-light)' }}><span>Non-VAT Sales</span><strong>{fmt(pendingOrderTaxSummary?.nonVatSales)}</strong></div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Total Due</span><strong>{fmt(pendingOrder.total)}</strong></div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Amount Received</span><strong>{fmt(tendered)}</strong></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: isAmountValid ? '#15803d' : '#b42318', marginBottom: 8 }}><span>Change</span><strong>{fmt(Math.max(tendered - num(pendingOrder.total), 0))}</strong></div>
              <p style={{ fontSize: 12, color: canConfirmPayment ? '#15803d' : '#b42318' }}>{canConfirmPayment ? 'Payment is valid. Completing the sale will generate the receipt and sales record.' : 'Complete all required payment fields and ensure amount covers total due.'}</p>
            </>}
          </div>
        </div>
      )}

      {tab === 'history' && (
        <div>
          {viewSale && <div className="card sales-history-detail-card">
            <div className="sales-history-detail-header">
              <h3>Transaction Details - {viewSale.sale_number}</h3>
              <button className="btn btn-secondary" onClick={() => setViewSale(null)}>Close</button>
            </div>

            <div className="sales-history-detail-customer-card">
              <div className="sales-history-detail-customer-label">Customer</div>
              <div className="sales-history-detail-customer-name">{customerDisplayName(viewSaleCustomer)}</div>
              <div className="sales-history-detail-customer-meta">
                {viewSaleCustomer ? customerDisplayMeta(viewSaleCustomer) : 'Walk-in sale'}
              </div>
            </div>

            <div className="sales-history-detail-grid">
              <div className="sales-history-detail-item">
                <span>Receipt No.</span>
                <strong>{viewSale.receipt_no || '-'}</strong>
              </div>
              <div className="sales-history-detail-item">
                <span>Date</span>
                <strong>{fmtDate(viewSale.date)}</strong>
              </div>
              <div className="sales-history-detail-item">
                <span>Cashier</span>
                <strong>{viewSale.clerk_name || '-'}</strong>
              </div>
              <div className="sales-history-detail-item">
                <span>Payment Method</span>
                <strong>{paymentMethodLabel(viewSale.payment_method)}</strong>
              </div>
              <div className="sales-history-detail-item">
                <span>Return Status</span>
                <strong>
                  <span className={`sales-history-status-pill ${viewSaleReturnMeta.className}`}>{viewSaleReturnMeta.label}</span>
                </strong>
              </div>
            </div>

            <div className="sales-history-summary-grid">
              <div className="sales-history-summary-item"><span>Subtotal</span><strong>{fmt(viewSale.subtotal)}</strong></div>
              <div className="sales-history-summary-item"><span>Discount</span><strong>{fmt(viewSale.discount)}</strong></div>
              <div className="sales-history-summary-item is-emphasis"><span>Total Due</span><strong>{fmt(viewSale.total)}</strong></div>
              <div className="sales-history-summary-item"><span>VATable Sales</span><strong>{fmt(viewSaleTaxSummary?.vatableSales)}</strong></div>
              <div className="sales-history-summary-item"><span>VAT Amount</span><strong>{fmt(viewSaleTaxSummary?.vatAmount)}</strong></div>
              <div className="sales-history-summary-item"><span>Non-VAT Sales</span><strong>{fmt(viewSaleTaxSummary?.nonVatSales)}</strong></div>
              <div className="sales-history-summary-item"><span>Received</span><strong>{fmt(viewSale.amount_received)}</strong></div>
              <div className="sales-history-summary-item"><span>Change</span><strong>{fmt(viewSale.change_amount)}</strong></div>
            </div>

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Qty</th>
                    <th>Returned</th>
                    <th>Available</th>
                    <th>Line Total</th>
                  </tr>
                </thead>
                <tbody>
                  {(viewSale.items || []).map((item) => (
                    <tr key={item.id}>
                      <td>{item.product_name || '-'}</td>
                      <td>{item.qty}</td>
                      <td>{item.returned_qty || 0}</td>
                      <td>{item.available_to_return || 0}</td>
                      <td>{fmt(item.line_total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>}
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Transaction ID</th>
                  <th>Receipt No.</th>
                  <th>Customer</th>
                  <th>Date</th>
                  <th>Total</th>
                  <th>Payment Method</th>
                  <th>Return Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {sales.length === 0 ? (
                  <tr>
                    <td colSpan="8" style={{ textAlign: 'center', color: 'var(--text-light)', padding: 24 }}>No sales found.</td>
                  </tr>
                ) : sales.map((sale) => {
                  const canRefundSale = can(permissions, 'sales.refund')
                  const saleReturnMeta = getSalesHistoryReturnStatusMeta(sale.return_status)

                  return (
                    <tr key={sale.id} className="sales-history-row">
                      <td>
                        <span className="sales-history-id-label">{sale.sale_number}</span>
                      </td>
                      <td>{sale.receipt_no}</td>
                      <td>
                        <div style={{ fontWeight: 600 }}>{customerDisplayName(buildCustomerSummary(sale))}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-light)' }}>
                          {buildCustomerSummary(sale) ? customerDisplayMeta(buildCustomerSummary(sale)) : 'Walk-in sale'}
                        </div>
                      </td>
                      <td>{fmtDate(sale.date)}</td>
                      <td>{fmt(sale.total)}</td>
                      <td>{paymentMethodLabel(sale.payment_method)}</td>
                      <td>
                        <span className={`sales-history-status-pill ${saleReturnMeta.className}`}>{saleReturnMeta.label}</span>
                      </td>
                      <td className="sales-history-actions-cell">
                        <div className="sales-history-actions">
                          <button className="btn btn-secondary sales-history-primary-action" onClick={() => showSale(sale.id)}>
                            View
                          </button>
                          {canRefundSale && (
                            <div className="sales-history-menu-wrap">
                              <button
                                className={`btn btn-secondary sales-history-menu-toggle${openSaleMenuId === sale.id ? ' is-open' : ''}`}
                                onClick={() => toggleSaleMenu(sale.id)}
                                aria-expanded={openSaleMenuId === sale.id}
                              >
                                More
                              </button>
                              {openSaleMenuId === sale.id && (
                                <div className="sales-history-action-popover">
                                  <button className="btn btn-secondary sales-history-actions-item" onClick={() => useSaleReceipt(sale.receipt_no)}>
                                    Start Return
                                  </button>
                                  {sale.return_status !== 'FULL' && (
                                    <button className="btn btn-danger sales-history-actions-item" onClick={() => refundSale(sale.id)}>
                                      Full Refund
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'transactions' && (
        <div>
          <div className="card sales-transactions-filter-card">
            <div className="sales-transactions-filter-grid">
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Receipt</label>
                <input
                  className="form-input"
                  value={transactionReceipt}
                  onChange={(e) => setTransactionReceipt(e.target.value)}
                  placeholder="Search receipt number"
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Type</label>
                <select className="form-input" value={transactionType} onChange={(e) => setTransactionType(e.target.value)}>
                  <option value="">All transactions</option>
                  <option value="SALE_PAYMENT">Payments</option>
                  <option value="SALE_RETURN">Returns</option>
                </select>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Date</label>
                <input
                  className="form-input"
                  type="date"
                  value={transactionRecordedDate}
                  onChange={(e) => {
                    const nextValue = e.target.value
                    setTransactionRecordedDate(nextValue)
                    if (nextValue) {
                      setTransactionFrom('')
                      setTransactionTo('')
                      setShowTransactionRange(false)
                    }
                  }}
                />
              </div>
              <button type="button" className="btn btn-primary" onClick={fetchTransactions}>Refresh</button>
              <button type="button" className="btn btn-secondary" onClick={clearTransactionFilters}>Clear</button>
            </div>
            <div className="sales-transactions-filter-helper">
              <button
                type="button"
                className="btn btn-secondary sales-transactions-range-toggle"
                onClick={() => {
                  setShowTransactionRange((current) => {
                    const next = !current
                    if (next) setTransactionRecordedDate('')
                    if (!next) {
                      setTransactionFrom('')
                      setTransactionTo('')
                    }
                    return next
                  })
                }}
              >
                {showTransactionRange ? 'Hide date range' : 'Use date range'}
              </button>
              <span>Choose one day with Date, or use a range for broader search.</span>
            </div>
            {showTransactionRange && (
              <div className="sales-transactions-range-grid">
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">From</label>
                  <input
                    className="form-input"
                    type="date"
                    value={transactionFrom}
                    onChange={(e) => setTransactionFrom(e.target.value)}
                    max={transactionTo || undefined}
                  />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">To</label>
                  <input
                    className="form-input"
                    type="date"
                    value={transactionTo}
                    onChange={(e) => setTransactionTo(e.target.value)}
                    min={transactionFrom || undefined}
                  />
                </div>
              </div>
            )}
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Receipt</th>
                  <th>Customer</th>
                  <th>Date</th>
                  <th>Amount</th>
                  <th>Details</th>
                  <th>User</th>
                </tr>
              </thead>
              <tbody>
                {transactions.length === 0 ? (
                  <tr>
                    <td colSpan="7" style={{ textAlign: 'center', color: 'var(--text-light)', padding: 24 }}>
                      No transactions found.
                    </td>
                  </tr>
                ) : transactions.map((txn) => (
                  <tr key={txn.transaction_id}>
                    <td>
                      <span className={`sales-transaction-type-chip ${txn.type === 'SALE_RETURN' ? 'is-return' : 'is-payment'}`}>
                        {transactionTypeLabel(txn.type)}
                      </span>
                    </td>
                    <td>{txn.receipt_no || '-'}</td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{txn.customer_name || 'Walk-in Customer'}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-light)' }}>
                        {[txn.customer_code, txn.customer_phone, txn.customer_email].filter(Boolean).join(' | ') || 'Walk-in sale'}
                      </div>
                    </td>
                    <td>{fmtDate(txn.created_at)}</td>
                    <td>{fmt(txn.amount)}</td>
                    <td>
                      {txn.type === 'SALE_PAYMENT'
                        ? `${paymentMethodLabel(txn.payment_method)} | Received ${fmt(txn.amount_received)} | Change ${fmt(txn.change_amount)}`
                        : `${txn.product_name || 'Returned item'} | Qty ${txn.quantity}${txn.return_disposition ? ` | ${txn.return_disposition}` : ''}`}
                    </td>
                    <td>{txn.user_name || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'returns' && (
        <div className="sales-returns-layout">
          <div className="sales-returns-main">
            <div className="card sales-return-lookup-card">
              <div className="sales-return-lookup-top">
                <div>
                  <div className="sales-return-kicker">Start Return</div>
                  <h3>Scan or Enter Receipt Number</h3>
                  <p>Scan or enter the customer's receipt number to load the original sale and continue the return.</p>
                </div>
                <div className="sales-return-lookup-stamp">Return by Receipt</div>
              </div>
              <div className="sales-return-lookup-grid">
                {returnLookup ? (
                  <>
                    <div className="sales-return-fixed-receipt-block">
                      <label className="form-label">Loaded Receipt</label>
                      <div className="sales-return-fixed-receipt-display" title={returnLookup.receipt_no || '-'}>
                        {returnLookup.receipt_no || '-'}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button type="button" className="btn btn-secondary sales-return-lookup-button" onClick={() => lookupReceipt(returnLookup.receipt_no, { forceReload: true })}>
                        Reload Receipt
                      </button>
                      <button type="button" className="btn btn-secondary sales-return-lookup-button" onClick={resetReturnLookup}>
                        Clear Receipt
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="form-group sales-return-lookup-input-group">
                      <label className="form-label">Receipt Number</label>
                      <input
                        className="form-input sales-return-lookup-input"
                        value={returnReceiptNo}
                        onChange={(e) => handleReceiptSearch(e.target.value)}
                        onFocus={() => {
                          setShowReceiptDropdown(true)
                          if (!availableReceipts.length) loadAvailableReceipts()
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            lookupReceipt(returnReceiptNo)
                            setShowReceiptDropdown(false)
                          } else if (e.key === 'Escape') {
                            setShowReceiptDropdown(false)
                          }
                        }}
                        placeholder="Scan or type receipt no."
                      />
                      {showReceiptDropdown && filteredReceipts.length > 0 && (
                        <div className="sales-return-lookup-dropdown">
                          {filteredReceipts.map((receipt, idx) => (
                            <button
                              key={idx}
                              type="button"
                              className="sales-return-lookup-option"
                              onMouseDown={(event) => event.preventDefault()}
                              onClick={() => selectReceiptFromDropdown(receipt.receipt_no)}
                            >
                              <div className="sales-return-lookup-option-primary">{receipt.receipt_no}</div>
                              <div style={{ fontSize: 12, color: 'var(--text-light)' }}>{fmtDate(receipt.date)} | {fmt(receipt.total)}</div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <button type="button" className="btn btn-primary sales-return-lookup-button" onClick={() => { lookupReceipt(returnReceiptNo); setShowReceiptDropdown(false) }}>
                      Load Receipt
                    </button>
                  </>
                )}
              </div>
              <div className="sales-return-lookup-caption">
                Scanner input works here. Suggestions are based on recorded sales history.
              </div>
            </div>
            {returnLookup ? (
              <div className="card sales-return-receipt-card">
                <div className="sales-return-receipt-shell">
                  <div className="sales-return-receipt-paper">
                    <div className="sales-return-paper-topbar">
                      <div>
                        <div className="sales-return-kicker">Loaded Receipt</div>
                        <h3>{returnLookup.receipt_no}</h3>
                        <div className="sales-return-paper-subline">
                          Transaction ID: {returnLookup.sale_number || returnLookup.id || '-'} | Date and Time: {fmtDate(returnLookup.date)}
                        </div>
                      </div>
                      <span className={`sales-return-status-badge ${returnStatusMeta.className}`}>
                        {returnStatusMeta.label}
                      </span>
                    </div>

                    <div className="sales-return-paper-meta-grid">
                      <div className="sales-return-paper-meta-card">
                        <span>Receipt No.</span>
                        <strong>{returnLookup.receipt_no || '-'}</strong>
                      </div>
                      <div className="sales-return-paper-meta-card">
                        <span>Customer</span>
                        <strong>{customerDisplayName(returnLookupCustomer)}</strong>
                      </div>
                      <div className="sales-return-paper-meta-card">
                        <span>Date and Time</span>
                        <strong>{fmtDate(returnLookup.date)}</strong>
                      </div>
                      <div className="sales-return-paper-meta-card">
                        <span>Status</span>
                        <strong>{returnStatusMeta.label}</strong>
                      </div>
                      <div className="sales-return-paper-meta-card">
                        <span>Transaction ID</span>
                        <strong>{returnLookup.sale_number || returnLookup.id || '-'}</strong>
                      </div>
                      <div className="sales-return-paper-meta-card">
                        <span>Payment Method</span>
                        <strong>{paymentMethodLabel(returnLookup.payment_method)}</strong>
                      </div>
                      <div className="sales-return-paper-meta-card">
                        <span>Document Type</span>
                        <strong>{returnDocumentType}</strong>
                      </div>
                      <div className="sales-return-paper-meta-card">
                        <span>Return Method</span>
                        <strong>{getReturnDispositionLabel(returnDisposition)}</strong>
                      </div>
                    </div>

                    <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                      <div style={{ fontSize: 13, color: 'var(--text-light)' }}>
                        Show full printed-receipt details only when needed.
                      </div>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ padding: '6px 12px', fontSize: 12 }}
                        onClick={() => setShowReturnReceiptPreview((current) => !current)}
                      >
                        {showReturnReceiptPreview ? 'Hide Full Receipt Preview' : 'Show Full Receipt Preview'}
                      </button>
                    </div>

                    {showReturnReceiptPreview && (
                      <>
                        <div className="sales-return-paper-brand">
                          <div className="sales-return-paper-brand-name">{invoiceConfig.displayName || "Cecille's N'Style"}</div>
                          {invoiceConfig.registeredName ? <div>{invoiceConfig.registeredName}</div> : null}
                          <div>{invoiceRegistrationLabel(invoiceConfig)} {formatTinWithBranch(invoiceConfig) || '-'}</div>
                          <div>{invoiceConfig.registeredBusinessAddress || '-'}</div>
                          <div className="sales-return-paper-brand-type">
                            {returnDocumentType}
                          </div>
                        </div>

                        <div className="sales-return-paper-totals">
                          <div><span>Subtotal</span><strong>{fmt(returnLookup.subtotal)}</strong></div>
                          <div><span>Discount</span><strong>{fmt(returnLookup.discount)}</strong></div>
                          <div><span>{returnLookupTaxSummary?.taxRatePercentage > 0 ? `VATable Sales (${formatPercentLabel(returnLookupTaxSummary.taxRatePercentage)})` : 'VATable Sales'}</span><strong>{fmt(returnLookupTaxSummary?.vatableSales)}</strong></div>
                          <div><span>{returnLookupTaxSummary?.taxRatePercentage > 0 ? `VAT Amount (${formatPercentLabel(returnLookupTaxSummary.taxRatePercentage)})` : 'VAT Amount'}</span><strong>{fmt(returnLookupTaxSummary?.vatAmount)}</strong></div>
                          <div><span>Non-VAT Sales</span><strong>{fmt(returnLookupTaxSummary?.nonVatSales)}</strong></div>
                          <div className="sales-return-paper-total-row"><span>Total Due</span><strong>{fmt(returnLookup.total)}</strong></div>
                        </div>
                      </>
                    )}

                    <div className="sales-return-paper-customer">
                      <div className="sales-return-paper-section-label">Customer</div>
                      <div className="sales-return-paper-customer-name">{customerDisplayName(returnLookupCustomer)}</div>
                      <div className="sales-return-paper-customer-meta">
                        {returnLookupCustomer ? customerDisplayMeta(returnLookupCustomer) : 'Walk-in sale'}
                      </div>
                    </div>

                    <div className="sales-return-paper-items">
                      <div className="sales-return-paper-items-header">
                        <span>Item</span>
                        <span>Bought</span>
                        <span>Already Returned</span>
                        <span>Returnable Qty</span>
                        <span>Qty to Return</span>
                        <span>Refund Amount</span>
                      </div>

                      {returnItems.map((item) => {
                        const availableQty = num(item.available_to_return)
                        const selectedQty = returnQuantities[item.id] || ''
                        const selectedQtyValue = Math.min(Math.max(Math.floor(num(selectedQty, 0)), 0), Math.max(availableQty, 0))
                        const unitPrice = getReturnItemUnitPrice(item)
                        const lineRefund = round(unitPrice * selectedQtyValue)

                        return (
                          <div key={item.id} className={`sales-return-paper-item${availableQty <= 0 ? ' is-disabled' : ''}`}>
                            <div className="sales-return-paper-item-main">
                              <div className="sales-return-paper-item-name">{item.product_name || '-'}</div>
                              <div className="sales-return-paper-item-meta">
                                {[item.sku, item.barcode, item.brand, item.size, item.color].filter(Boolean).join(' | ') || 'No extra item details'}
                              </div>
                            </div>
                            <div className="sales-return-paper-item-stat">
                              <span>Bought</span>
                              <strong>{num(item.qty)}</strong>
                            </div>
                            <div className="sales-return-paper-item-stat">
                              <span>Already Returned</span>
                              <strong>{num(item.returned_qty)}</strong>
                            </div>
                            <div className="sales-return-paper-item-stat">
                              <span>Returnable Qty</span>
                              <strong>{availableQty}</strong>
                            </div>
                            <div className="sales-return-paper-item-input">
                              <label>Qty to Return</label>
                              <input
                                className="form-input sales-return-qty-input"
                                type="number"
                                min="0"
                                max={availableQty || 0}
                                value={selectedQty}
                                disabled={availableQty <= 0}
                                onChange={(e) => setReturnQuantity(item.id, e.target.value, availableQty)}
                                onBlur={(e) => setReturnQuantity(item.id, e.target.value, availableQty)}
                              />
                              <span>{availableQty > 0 ? `${fmt(unitPrice)} each` : 'Fully Returned - No quantity left to return'}</span>
                            </div>
                            <div className="sales-return-paper-item-stat">
                              <span>Refund Amount</span>
                              <strong>{fmt(lineRefund)}</strong>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>

                <div className="sales-return-process-panel">
                  {!hasReturnableItems && (
                    <div style={{ marginBottom: 12, padding: '10px 12px', borderRadius: 8, border: '1px solid #fed7aa', background: '#fff7ed', color: '#9a3412', fontSize: 13 }}>
                      This receipt is fully returned. No quantity is left to return.
                    </div>
                  )}

                  {fullyReturnedItems.length > 0 && (
                    <div style={{ marginBottom: 12, padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border-light)', background: '#f8fafc', color: 'var(--text-mid)', fontSize: 13 }}>
                      {fullyReturnedItems.length} item(s) are fully returned and cannot be returned again.
                    </div>
                  )}

                  <div className="sales-return-process-grid">
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">Return Notes</label>
                      <textarea className="form-input" rows="4" value={returnReason} onChange={(e) => setReturnReason(e.target.value)} placeholder="Optional return notes or customer explanation" />
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">Return Method *</label>
                      <select className="form-input" value={returnDisposition} onChange={(e) => setReturnDisposition(e.target.value)}>
                        <option value="RESTOCK">Restock (saleable item)</option>
                        <option value="DAMAGE">Damage (record in damaged stock)</option>
                        <option value="SHRINKAGE">Shrinkage (record in shrinkage)</option>
                      </select>
                    </div>
                  </div>

                  <div className="sales-return-process-footer">
                    <div className="sales-return-process-summary">
                      <div className="sales-return-process-summary-label">Selected Return</div>
                      <div className="sales-return-process-summary-value">
                        {returnSelectionSummary.selectedLines} line(s) | Qty to Return: {returnSelectionSummary.selectedQty} | Estimated Refund: {fmt(returnSelectionSummary.selectedAmount)}
                      </div>
                    </div>
                    <button className="btn btn-primary" onClick={submitReturn} disabled={!canProcessReturn}>
                      {loading ? 'Processing...' : 'Confirm Return'}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="card sales-return-empty-card">
                <div className="sales-return-empty-paper">
                  <div className="sales-return-kicker">Start Return</div>
                  <h3>No receipt loaded</h3>
                  <p>Scan or enter a Receipt No. to load the original sale, view returnable quantities, and start the return.</p>
                </div>
              </div>
            )}
          </div>
          <div className="card sales-return-side-panel">
            <h3 style={{ marginBottom: 12 }}>Return Summary</h3>

            <div className="sales-return-summary-grid">
              <div className="sales-return-summary-tile">
                <span>Receipt No.</span>
                <strong className="sales-return-fixed-receipt">{returnLookup?.receipt_no || 'Not loaded'}</strong>
              </div>
              <div className="sales-return-summary-tile">
                <span>Returnable Qty</span>
                <strong>{returnSelectionSummary.totalAvailableQty}</strong>
              </div>
              <div className="sales-return-summary-tile">
                <span>Qty to Return</span>
                <strong>{returnSelectionSummary.selectedQty}</strong>
              </div>
              <div className="sales-return-summary-tile">
                <span>Estimated Refund</span>
                <strong>{fmt(returnSelectionSummary.selectedAmount)}</strong>
              </div>
            </div>

            {returnLookup ? (
              <div className="sales-return-side-section">
                <div className="sales-return-side-heading">Loaded Sale Summary</div>
                <div className="sales-return-side-detail"><span>Receipt No.</span><strong>{returnLookup.receipt_no || '-'}</strong></div>
                <div className="sales-return-side-detail"><span>Customer</span><strong>{customerDisplayName(returnLookupCustomer)}</strong></div>
                <div className="sales-return-side-detail"><span>Date and Time</span><strong>{fmtDate(returnLookup.date)}</strong></div>
                <div className="sales-return-side-detail"><span>Status</span><strong>{returnStatusMeta.label}</strong></div>
                <div className="sales-return-side-detail"><span>Transaction ID</span><strong>{returnLookup.sale_number || returnLookup.id || '-'}</strong></div>
                <div className="sales-return-side-detail"><span>Payment Method</span><strong>{paymentMethodLabel(returnLookup.payment_method)}</strong></div>
                <div className="sales-return-side-detail"><span>Document Type</span><strong>{returnDocumentType}</strong></div>
                <div className="sales-return-side-detail"><span>Total Bought</span><strong>{returnSelectionSummary.totalBoughtQty}</strong></div>
                <div className="sales-return-side-detail"><span>Total Returned</span><strong>{returnSelectionSummary.totalReturnedQty}</strong></div>
              </div>
            ) : (
              <div className="sales-return-side-section">
                <div className="sales-return-side-heading">How It Works</div>
                <p className="sales-return-side-copy">Scan or enter the customer's Receipt No. to load the original sale, then enter Qty to Return per item.</p>
              </div>
            )}

            <div className="sales-return-side-section">
              <div className="sales-return-side-heading">Return Rules</div>
              <ul className="sales-return-rule-list">
                <li>Returns require a valid Receipt No.</li>
                <li>Product details load automatically from the original sale.</li>
                <li>You cannot return more than the remaining returnable quantity.</li>
                <li>Fully returned items cannot be returned again.</li>
                <li>Successful returns update inventory and sales records automatically.</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {tab === 'report' && report && (
        <div>
          <div className="card" style={{ marginBottom: 16, display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 12, alignItems: 'end' }}>
            <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">From</label><input className="form-input" type="date" value={reportFrom} onChange={(e) => setReportFrom(e.target.value)} /></div>
            <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">To</label><input className="form-input" type="date" value={reportTo} onChange={(e) => setReportTo(e.target.value)} /></div>
            <button className="btn btn-primary" onClick={fetchReport}>Refresh Report</button>
          </div>
          <div className="dashboard-grid">
            <StatCard label="Completed Sales" value={report.total_sales || 0} />
            <StatCard label="Gross Revenue" value={fmt(report.total_revenue)} />
            <StatCard label="Returns" value={fmt(report.total_returns)} style={{ color: 'var(--error)' }} />
            <StatCard label="Net Revenue" value={fmt(report.net_revenue)} />
          </div>
          <h3 style={{ marginTop: 20, marginBottom: 12 }}>By Payment Method</h3>
          <div className="table-wrap"><table><thead><tr><th>Method</th><th>Transactions</th><th>Sales Total</th><th>Received</th><th>Change Given</th></tr></thead><tbody>{(report.by_payment_method || []).map((item) => <tr key={item.payment_method || 'unknown'}><td>{item.payment_method || '-'}</td><td>{item.count}</td><td>{fmt(item.total)}</td><td>{fmt(item.amount_received)}</td><td>{fmt(item.change_given)}</td></tr>)}</tbody></table></div>
          <h3 style={{ marginTop: 20, marginBottom: 12 }}>Top Products</h3>
          <div className="table-wrap"><table><thead><tr><th>Product</th><th>Net Qty</th><th>Returned Qty</th><th>Net Sales</th></tr></thead><tbody>{(report.top_products || []).map((item) => <tr key={`${item.sku || item.name}`}><td>{item.name || '-'}</td><td>{item.net_qty}</td><td>{item.returned_qty}</td><td>{fmt(item.net_sales)}</td></tr>)}</tbody></table></div>
        </div>
      )}

      {tab === 'report' && !report && <div className="card">No report data yet.</div>}
      {loading && <div style={{ marginTop: 16, color: 'var(--text-light)' }}>Loading...</div>}
    </div>
  )
}

