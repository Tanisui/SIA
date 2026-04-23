import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useSelector } from 'react-redux'
import { useLocation, useNavigate } from 'react-router-dom'
import api from '../api/api.js'
import cecilleLogo from '../assets/cecille-logo.png'

const TAB_KEYS = new Set(['orders', 'returns'])
const PO_STATUSES = ['PENDING', 'ORDERED', 'RECEIVED', 'COMPLETED', 'CANCELLED']
const DEFAULT_COMPANY_INFO = {
  displayName: "Cecille's N'Style",
  registeredName: '',
  tinWithBranch: '',
  address: '',
  email: 'purchasing@cecilles-nstyle.local'
}
const AUTO_PO_PREFIX = 'BALE-PO'

function todayDateInput() {
  const now = new Date()
  const localDate = new Date(now.getTime() - (now.getTimezoneOffset() * 60000))
  return localDate.toISOString().slice(0, 10)
}

function createDefaultOrderItem(overrides = {}) {
  return {
    item_code: '',
    product_name: 'Bale Lot Purchase',
    bale_category: '',
    quantity_ordered: '',
    bale_cost: '',
    ...overrides
  }
}

function createDefaultOrderForm() {
  const firstItem = createDefaultOrderItem()
  return {
    bale_batch_no: '',
    supplier_id: '',
    supplier_name: '',
    purchase_date: todayDateInput(),
    expected_delivery_date: '',
    po_status: 'ORDERED',
    notes: '',
    items: [firstItem],
    bale_category: firstItem.bale_category,
    bale_cost: firstItem.bale_cost,
    quantity_ordered: firstItem.quantity_ordered
  }
}

function createDefaultReturnForm() {
  return {
    supplier_id: '',
    supplier_name: '',
    bale_purchase_id: '',
    return_date: todayDateInput(),
    notes: '',
    items: [{ quantity: '', reason: '' }]
  }
}

function toDateInput(value) {
  if (!value) return ''
  const normalizedValue = String(value).trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalizedValue)) return normalizedValue
  const normalized = new Date(normalizedValue)
  if (Number.isNaN(normalized.getTime())) return ''
  return normalized.toISOString().slice(0, 10)
}

function fmtDate(value) {
  if (!value) return '-'
  const normalized = new Date(value)
  if (Number.isNaN(normalized.getTime())) return String(value)
  return normalized.toLocaleDateString('en-PH', { month: 'short', day: '2-digit', year: 'numeric' })
}

function fmtCurrency(value) {
  return Number(value || 0).toLocaleString('en-PH', { style: 'currency', currency: 'PHP' })
}

function fmtNumber(value) {
  return Number(value || 0).toLocaleString('en-PH')
}

function toMoney(value) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) return 0
  return Math.round(parsed * 100) / 100
}

function toWholeNumber(value) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) return 0
  return Math.floor(parsed)
}

function text(value) {
  return String(value ?? '').trim()
}

function formatGeneratedPurchaseOrderNumber(sequence) {
  return `${AUTO_PO_PREFIX}-${String(sequence).padStart(4, '0')}`
}

function getGeneratedPurchaseOrderSequence(value) {
  const match = text(value).match(/^BALE-PO-(\d+)(?:-\d+)?$/i)
  if (!match) return 0
  const parsed = Number(match[1])
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 0
}

function generateNextPurchaseOrderNumberFromOrders(orders) {
  const maxSequence = (Array.isArray(orders) ? orders : []).reduce((max, order) => (
    Math.max(max, getGeneratedPurchaseOrderSequence(order?.bale_batch_no))
  ), 0)
  return formatGeneratedPurchaseOrderNumber(maxSequence + 1)
}

function formatTinWithBranch(invoiceConfig) {
  const sellerTin = text(invoiceConfig?.sellerTin)
  const branchCode = text(invoiceConfig?.branchCode)
  return sellerTin && branchCode ? `${sellerTin}-${branchCode}` : sellerTin
}

function buildCompanyInfoFromConfig(config) {
  const invoice = config?.invoice || {}
  return {
    displayName: text(invoice.displayName) || DEFAULT_COMPANY_INFO.displayName,
    registeredName: text(invoice.registeredName),
    tinWithBranch: formatTinWithBranch(invoice),
    address: text(invoice.registeredBusinessAddress),
    email: DEFAULT_COMPANY_INFO.email
  }
}

function buildPurchaseOrderNumber(orderForm, editingOrderId) {
  const reference = text(orderForm.bale_batch_no)
  if (reference) return reference
  if (editingOrderId) return `BPO-${String(editingOrderId).padStart(6, '0')}`
  return 'Draft'
}

function getOrderLineItems(orderForm) {
  const items = Array.isArray(orderForm?.items) ? orderForm.items : []
  if (items.length) return items
  return [createDefaultOrderItem({
    bale_category: orderForm?.bale_category || '',
    quantity_ordered: orderForm?.quantity_ordered || '',
    bale_cost: orderForm?.bale_cost || ''
  })]
}

function getOrderLineReference(orderForm, item, index, totalItems, editingOrderId) {
  const explicitCode = text(item?.item_code)
  if (explicitCode) return explicitCode

  const baseReference = buildPurchaseOrderNumber(orderForm, editingOrderId)
  if (totalItems <= 1) return baseReference
  return `${baseReference}-${String(index + 1).padStart(2, '0')}`
}

function getOrderReturnableQuantity(order) {
  const explicit = Number(order?.returnable_quantity)
  if (Number.isFinite(explicit)) return Math.max(explicit, 0)
  return Math.max(Number(order?.quantity_received || 0) - Number(order?.returned_quantity || 0), 0)
}

function getSupplierNameFromOrder(order) {
  return String(order?.supplier_name || '').trim()
}

function getApiErrorMessage(err, fallback) {
  const data = err?.response?.data
  if (data && typeof data === 'object') {
    return data.error || data.message || fallback
  }
  if (typeof data === 'string' && data.trim() && data.length < 220) {
    return data.trim()
  }
  return err?.message || fallback
}

export default function BalePurchaseOrder() {
  const location = useLocation()
  const navigate = useNavigate()

  const permissions = useSelector((state) =>
    state.auth && state.auth.permissions
      ? state.auth.permissions
      : JSON.parse(localStorage.getItem('permissions') || '[]')
  )

  const canManageOrders = Array.isArray(permissions)
    ? permissions.includes('admin.*') || permissions.includes('inventory.receive')
    : false

  const canViewOrders = Array.isArray(permissions)
    ? permissions.includes('admin.*')
      || permissions.includes('inventory.view')
      || permissions.includes('inventory.receive')
      || permissions.includes('products.view')
      || permissions.includes('reports.view')
      || permissions.includes('finance.reports.view')
    : false

  const [orders, setOrders] = useState([])
  const [returns, setReturns] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [companyInfo, setCompanyInfo] = useState(DEFAULT_COMPANY_INFO)
  const [orderForm, setOrderForm] = useState(createDefaultOrderForm)
  const [returnForm, setReturnForm] = useState(createDefaultReturnForm)
  const [receiveQuantities, setReceiveQuantities] = useState({})
  const [editingOrderId, setEditingOrderId] = useState(null)
  const [poNumberLoading, setPoNumberLoading] = useState(false)
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)

  const activeTab = useMemo(() => {
    const params = new URLSearchParams(location.search)
    const requested = String(params.get('tab') || '').trim()
    return TAB_KEYS.has(requested) ? requested : 'orders'
  }, [location.search])

  const selectedReturnOrder = useMemo(
    () => orders.find((order) => String(order.id) === String(returnForm.bale_purchase_id)),
    [orders, returnForm.bale_purchase_id]
  )

  const selectedOrderSupplier = useMemo(
    () => suppliers.find((supplier) => String(supplier.id) === String(orderForm.supplier_id)),
    [orderForm.supplier_id, suppliers]
  )

  const returnableOrders = useMemo(() => {
    return orders.filter((order) => {
      const supplierMatches = !returnForm.supplier_id || String(order.supplier_id || '') === String(returnForm.supplier_id)
      return supplierMatches && getOrderReturnableQuantity(order) > 0
    })
  }, [orders, returnForm.supplier_id])

  const orderTotals = useMemo(() => {
    return orders.reduce((acc, order) => {
      acc.ordered += Number(order.quantity_ordered || 0)
      acc.received += Number(order.quantity_received || 0)
      acc.returned += Number(order.returned_quantity || 0)
      acc.returnable += getOrderReturnableQuantity(order)
      acc.cost += Number(order.total_purchase_cost || order.bale_cost || 0)
      return acc
    }, { ordered: 0, received: 0, returned: 0, returnable: 0, cost: 0 })
  }, [orders])

  const returnItemsTotal = useMemo(() => {
    return returnForm.items.reduce((sum, item) => sum + toWholeNumber(item.quantity), 0)
  }, [returnForm.items])

  const selectedOrderReturnable = getOrderReturnableQuantity(selectedReturnOrder)
  const orderLineItems = useMemo(() => getOrderLineItems(orderForm), [orderForm])
  const orderQuantity = orderLineItems.reduce((sum, item) => sum + toWholeNumber(item.quantity_ordered), 0)
  const orderSubtotal = orderLineItems.reduce((sum, item) => sum + toMoney(item.bale_cost), 0)
  const orderTax = 0
  const orderGrandTotal = orderSubtotal + orderTax
  const purchaseOrderNumber = buildPurchaseOrderNumber(orderForm, editingOrderId)
  const currentUserName = useMemo(() => {
    try {
      const stored = JSON.parse(localStorage.getItem('user') || '{}')
      return text(stored.full_name || stored.username || stored.email) || 'Purchasing Staff'
    } catch (err) {
      return 'Purchasing Staff'
    }
  }, [])

  const clearMessages = useCallback(() => {
    setError(null)
    setSuccess(null)
  }, [])

  const showMsg = useCallback((message) => {
    setSuccess(message)
    setTimeout(() => setSuccess(null), 4200)
  }, [])

  const fetchNextPoNumber = useCallback(async () => {
    try {
      const response = await api.get('/bale-purchases/next-po-number')
      const generated = text(response?.data?.po_number || response?.data?.bale_batch_no)
      return generated || generateNextPurchaseOrderNumberFromOrders(orders)
    } catch (err) {
      console.warn('Failed to load generated PO number:', err)
      return generateNextPurchaseOrderNumberFromOrders(orders)
    }
  }, [orders])

  const goToTab = useCallback((nextTab) => {
    if (!TAB_KEYS.has(nextTab)) return
    const params = new URLSearchParams(location.search)
    params.set('tab', nextTab)
    navigate(`/bale-purchase-order?${params.toString()}`, { preventScrollReset: true })
  }, [location.search, navigate])

  const fetchOrders = useCallback(async () => {
    if (!canViewOrders && !canManageOrders) {
      setOrders([])
      return
    }
    const response = await api.get('/bale-purchases')
    setOrders(Array.isArray(response?.data) ? response.data : [])
  }, [canManageOrders, canViewOrders])

  const fetchReturns = useCallback(async () => {
    if (!canViewOrders && !canManageOrders) {
      setReturns([])
      return
    }
    const response = await api.get('/bale-purchases/returns')
    setReturns(Array.isArray(response?.data) ? response.data : [])
  }, [canManageOrders, canViewOrders])

  const fetchSuppliers = useCallback(async () => {
    try {
      const response = await api.get('/suppliers')
      setSuppliers(Array.isArray(response?.data) ? response.data : [])
    } catch (err) {
      console.warn('Failed to load suppliers:', err)
      setSuppliers([])
    }
  }, [])

  const fetchCompanyInfo = useCallback(async () => {
    try {
      const response = await api.get('/bale-purchases/config')
      setCompanyInfo(buildCompanyInfoFromConfig(response?.data))
    } catch (err) {
      setCompanyInfo(DEFAULT_COMPANY_INFO)
    }
  }, [])

  const refreshAll = useCallback(async () => {
    clearMessages()
    try {
      setLoading(true)
      await Promise.all([fetchOrders(), fetchReturns(), fetchSuppliers(), fetchCompanyInfo()])
    } catch (err) {
      setError(err?.response?.data?.error || 'Failed to load bale purchase order data.')
    } finally {
      setLoading(false)
    }
  }, [clearMessages, fetchCompanyInfo, fetchOrders, fetchReturns, fetchSuppliers])

  useEffect(() => {
    refreshAll()
  }, [refreshAll])

  useEffect(() => {
    if (!TAB_KEYS.has(activeTab)) goToTab('orders')
  }, [activeTab, goToTab])

  useEffect(() => {
    if (!canManageOrders || editingOrderId || text(orderForm.bale_batch_no)) return

    let cancelled = false
    setPoNumberLoading(true)
    fetchNextPoNumber()
      .then((nextPoNumber) => {
        if (cancelled || !nextPoNumber) return
        setOrderForm((prev) => (
          text(prev.bale_batch_no) || editingOrderId
            ? prev
            : { ...prev, bale_batch_no: nextPoNumber }
        ))
      })
      .finally(() => {
        if (!cancelled) setPoNumberLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [canManageOrders, editingOrderId, fetchNextPoNumber, orderForm.bale_batch_no])

  function resetOrderForm() {
    setOrderForm(createDefaultOrderForm())
    setEditingOrderId(null)
  }

  async function regeneratePoNumber() {
    if (editingOrderId) return
    clearMessages()
    try {
      setPoNumberLoading(true)
      const nextPoNumber = await fetchNextPoNumber()
      setOrderForm((prev) => ({ ...prev, bale_batch_no: nextPoNumber }))
    } finally {
      setPoNumberLoading(false)
    }
  }

  function resetReturnForm() {
    setReturnForm(createDefaultReturnForm())
  }

  function printPurchaseOrder() {
    window.print()
  }

  function updateOrderSupplier(supplierId) {
    const supplier = suppliers.find((row) => String(row.id) === String(supplierId))
    setOrderForm((prev) => ({
      ...prev,
      supplier_id: supplierId,
      supplier_name: supplier ? (supplier.name || '') : prev.supplier_name
    }))
  }

  function updateReturnSupplier(supplierId) {
    const supplier = suppliers.find((row) => String(row.id) === String(supplierId))
    setReturnForm((prev) => ({
      ...prev,
      supplier_id: supplierId,
      supplier_name: supplier ? (supplier.name || '') : '',
      bale_purchase_id: prev.bale_purchase_id && supplierId
        ? (
            orders.some((order) => (
              String(order.id) === String(prev.bale_purchase_id)
              && String(order.supplier_id || '') === String(supplierId)
            ))
              ? prev.bale_purchase_id
              : ''
          )
        : prev.bale_purchase_id
    }))
  }

  function updateReturnItem(index, field, value) {
    setReturnForm((prev) => ({
      ...prev,
      items: prev.items.map((item, itemIndex) => (
        itemIndex === index ? { ...item, [field]: value } : item
      ))
    }))
  }

  function updateOrderItem(index, field, value) {
    setOrderForm((prev) => {
      const nextItems = getOrderLineItems(prev).map((item, itemIndex) => (
        itemIndex === index ? { ...item, [field]: value } : item
      ))
      return {
        ...prev,
        items: nextItems,
        bale_category: nextItems[0]?.bale_category || '',
        quantity_ordered: nextItems[0]?.quantity_ordered || '',
        bale_cost: nextItems[0]?.bale_cost || ''
      }
    })
  }

  function addOrderItem() {
    if (editingOrderId) return
    setOrderForm((prev) => ({
      ...prev,
      items: [...getOrderLineItems(prev), createDefaultOrderItem()]
    }))
  }

  function removeOrderItem(index) {
    if (editingOrderId) return
    setOrderForm((prev) => {
      const currentItems = getOrderLineItems(prev)
      const nextItems = currentItems.length > 1
        ? currentItems.filter((_, itemIndex) => itemIndex !== index)
        : currentItems
      return {
        ...prev,
        items: nextItems,
        bale_category: nextItems[0]?.bale_category || '',
        quantity_ordered: nextItems[0]?.quantity_ordered || '',
        bale_cost: nextItems[0]?.bale_cost || ''
      }
    })
  }

  function addReturnItem() {
    setReturnForm((prev) => ({
      ...prev,
      items: [...prev.items, { quantity: '', reason: '' }]
    }))
  }

  function removeReturnItem(index) {
    setReturnForm((prev) => ({
      ...prev,
      items: prev.items.length > 1
        ? prev.items.filter((_, itemIndex) => itemIndex !== index)
        : prev.items
    }))
  }

  function startEditOrder(order) {
    setEditingOrderId(order.id)
    setOrderForm({
      bale_batch_no: order.bale_batch_no || '',
      supplier_id: order.supplier_id ? String(order.supplier_id) : '',
      supplier_name: order.supplier_name || '',
      purchase_date: toDateInput(order.purchase_date),
      expected_delivery_date: toDateInput(order.expected_delivery_date),
      po_status: order.po_status || 'ORDERED',
      notes: order.notes || '',
      items: [createDefaultOrderItem({
        item_code: '',
        bale_category: order.bale_category || '',
        quantity_ordered: String(order.quantity_ordered ?? ''),
        bale_cost: String(order.total_purchase_cost ?? order.bale_cost ?? '')
      })],
      bale_category: order.bale_category || '',
      bale_cost: String(order.total_purchase_cost ?? order.bale_cost ?? ''),
      quantity_ordered: String(order.quantity_ordered ?? '')
    })
    goToTab('orders')
    clearMessages()
  }

  async function saveOrder(event) {
    event.preventDefault()
    clearMessages()

    const selectedSupplier = suppliers.find((supplier) => String(supplier.id) === String(orderForm.supplier_id))
    const supplierName = String(selectedSupplier?.name || orderForm.supplier_name || '').trim()
    let basePoNumber = text(orderForm.bale_batch_no)
    if (!basePoNumber && !editingOrderId) {
      setPoNumberLoading(true)
      try {
        basePoNumber = await fetchNextPoNumber()
        if (basePoNumber) {
          setOrderForm((prev) => ({ ...prev, bale_batch_no: basePoNumber }))
        }
      } finally {
        setPoNumberLoading(false)
      }
    }
    if (!basePoNumber) {
      setError('PO No. is not ready yet. Please refresh and try again.')
      return
    }
    const formForSave = { ...orderForm, bale_batch_no: basePoNumber }

    if (!formForSave.purchase_date) {
      setError('Order date is required.')
      return
    }
    if (!formForSave.supplier_id && !supplierName) {
      setError('Supplier is required. Select a supplier or provide supplier name.')
      return
    }

    const formLineItems = getOrderLineItems(formForSave)
    const lines = formLineItems
      .map((item, index) => {
        const quantity = toWholeNumber(item.quantity_ordered)
        const lineTotal = toMoney(item.bale_cost)
        return {
          ...item,
          bale_batch_no: getOrderLineReference(formForSave, item, index, formLineItems.length, editingOrderId),
          bale_category: String(item.bale_category || '').trim(),
          quantity_ordered: quantity,
          bale_cost: lineTotal,
          total_purchase_cost: lineTotal
        }
      })
      .filter((item) => item.quantity_ordered > 0 || item.bale_cost > 0 || item.bale_category || item.item_code)

    if (!lines.length) {
      setError('Add at least one order line.')
      return
    }

    const duplicateReference = lines.find((line, index) => (
      lines.findIndex((candidate) => candidate.bale_batch_no.toLowerCase() === line.bale_batch_no.toLowerCase()) !== index
    ))
    if (duplicateReference) {
      setError(`Duplicate item code / PO reference: ${duplicateReference.bale_batch_no}`)
      return
    }

    const invalidLineIndex = lines.findIndex((line) => line.quantity_ordered <= 0)
    if (invalidLineIndex >= 0) {
      setError(`Quantity is required for order line ${invalidLineIndex + 1}.`)
      return
    }

    const sharedPayload = {
      supplier_id: formForSave.supplier_id ? Number(formForSave.supplier_id) : null,
      supplier_name: supplierName || null,
      purchase_date: formForSave.purchase_date,
      expected_delivery_date: formForSave.expected_delivery_date || null,
      po_status: formForSave.po_status || 'ORDERED',
      notes: formForSave.notes || null
    }

    try {
      setSubmitting(true)
      if (editingOrderId) {
        const line = lines[0]
        const payload = {
          ...sharedPayload,
          bale_batch_no: line.bale_batch_no,
          bale_category: line.bale_category || null,
          bale_cost: line.bale_cost,
          total_purchase_cost: line.total_purchase_cost,
          quantity_ordered: line.quantity_ordered
        }
        await api.put(`/bale-purchases/${editingOrderId}`, payload)
      } else if (lines.length > 1) {
        const bulkPayload = {
          ...sharedPayload,
          items: lines.map((line) => ({
            bale_batch_no: line.bale_batch_no,
            bale_category: line.bale_category || null,
            bale_cost: line.bale_cost,
            total_purchase_cost: line.total_purchase_cost,
            quantity_ordered: line.quantity_ordered
          }))
        }

        try {
          await api.post('/bale-purchases/bulk', bulkPayload)
        } catch (bulkErr) {
          const status = Number(bulkErr?.response?.status) || 0
          if (![404, 405].includes(status)) throw bulkErr

          // Backward-compatible fallback for running backends that have not
          // loaded the bulk endpoint yet.
          for (const line of lines) {
            await api.post('/bale-purchases', {
              ...sharedPayload,
              bale_batch_no: line.bale_batch_no,
              bale_category: line.bale_category || null,
              bale_cost: line.bale_cost,
              total_purchase_cost: line.total_purchase_cost,
              quantity_ordered: line.quantity_ordered
            })
          }
        }
      } else {
        const line = lines[0]
        const payload = {
          ...sharedPayload,
          bale_batch_no: line.bale_batch_no,
          bale_category: line.bale_category || null,
          bale_cost: line.bale_cost,
          total_purchase_cost: line.total_purchase_cost,
          quantity_ordered: line.quantity_ordered
        }
        await api.post('/bale-purchases', payload)
      }
      await Promise.all([fetchOrders(), fetchReturns()])
      resetOrderForm()
      showMsg(editingOrderId ? 'Bale purchase order updated.' : `${fmtNumber(lines.length)} bale purchase order line(s) created.`)
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to save bale purchase order.'))
    } finally {
      setSubmitting(false)
    }
  }

  async function deleteOrder(order) {
    clearMessages()
    const confirmed = window.confirm(`Delete purchase order ${order?.bale_batch_no || ''}? This also removes its bale breakdown and supplier-return history.`)
    if (!confirmed) return

    try {
      setSubmitting(true)
      await api.delete(`/bale-purchases/${order.id}`)
      await Promise.all([fetchOrders(), fetchReturns()])
      if (String(editingOrderId) === String(order.id)) resetOrderForm()
      showMsg('Bale purchase order deleted.')
    } catch (err) {
      setError(err?.response?.data?.error || 'Failed to delete bale purchase order.')
    } finally {
      setSubmitting(false)
    }
  }

  async function receiveOrder(order) {
    clearMessages()
    const quantity = toWholeNumber(receiveQuantities[order.id])
    if (quantity <= 0) {
      setError('Enter a positive received quantity.')
      return
    }

    try {
      setSubmitting(true)
      const response = await api.post(`/bale-purchases/${order.id}/receive`, { quantity_received: quantity })
      await fetchOrders()
      setReceiveQuantities((prev) => ({ ...prev, [order.id]: '' }))
      showMsg(response?.data?.message || 'Purchase order received.')
    } catch (err) {
      setError(err?.response?.data?.error || 'Failed to receive purchase order.')
    } finally {
      setSubmitting(false)
    }
  }

  async function saveSupplierReturn(event) {
    event.preventDefault()
    clearMessages()

    if (!returnForm.bale_purchase_id) {
      setError('Select a PO reference before saving the return.')
      return
    }
    if (!returnForm.return_date) {
      setError('Return date is required.')
      return
    }
    if (returnItemsTotal <= 0) {
      setError('Return quantity must be greater than 0.')
      return
    }
    if (returnItemsTotal > selectedOrderReturnable) {
      setError(`Return quantity cannot exceed available received bales (${selectedOrderReturnable}).`)
      return
    }

    const invalidReason = returnForm.items.some((item) => toWholeNumber(item.quantity) > 0 && !String(item.reason || '').trim())
    if (invalidReason) {
      setError('A reason is required for every return item.')
      return
    }

    const selectedSupplier = suppliers.find((supplier) => String(supplier.id) === String(returnForm.supplier_id))
    const orderSupplierName = getSupplierNameFromOrder(selectedReturnOrder)
    const supplierName = String(selectedSupplier?.name || returnForm.supplier_name || orderSupplierName || '').trim()
    const payload = {
      supplier_id: returnForm.supplier_id ? Number(returnForm.supplier_id) : (selectedReturnOrder?.supplier_id || null),
      supplier_name: supplierName || null,
      bale_purchase_id: Number(returnForm.bale_purchase_id),
      return_date: returnForm.return_date,
      notes: returnForm.notes || null,
      items: returnForm.items
        .map((item) => ({
          quantity: toWholeNumber(item.quantity),
          reason: String(item.reason || '').trim()
        }))
        .filter((item) => item.quantity > 0)
    }

    try {
      setSubmitting(true)
      await api.post('/bale-purchases/returns', payload)
      await Promise.all([fetchOrders(), fetchReturns()])
      resetReturnForm()
      showMsg('Bales returned to supplier.')
    } catch (err) {
      setError(err?.response?.data?.error || 'Failed to record supplier return.')
    } finally {
      setSubmitting(false)
    }
  }

  if (!canViewOrders && !canManageOrders) {
    return (
      <div className="page">
        <div className="page-header">
          <div>
            <h1 className="page-title">Bale Purchase Orders</h1>
            <p className="page-subtitle">Your account does not have permission to view purchase orders.</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Bale Purchase Orders</h1>
          <p className="page-subtitle">
            Create bale POs, receive ordered bales, and return received bales to suppliers with inventory adjustments.
          </p>
        </div>
        <button className="btn btn-secondary" type="button" onClick={() => navigate('/purchasing')}>
          Back to Bale Workflow
        </button>
      </div>

      {error ? <div className="error-msg" style={{ marginBottom: 16 }}>{error}</div> : null}
      {success ? <div className="success-msg" style={{ marginBottom: 16 }}>{success}</div> : null}

      <div className="purchase-tabs">
        <button
          className={`purchase-tab ${activeTab === 'orders' ? 'purchase-tab-active' : ''}`}
          onClick={() => goToTab('orders')}
          type="button"
        >
          Purchase Orders
        </button>
        <button
          className={`purchase-tab ${activeTab === 'returns' ? 'purchase-tab-active' : ''}`}
          onClick={() => goToTab('returns')}
          type="button"
        >
          Return Bales to Supplier
        </button>
      </div>

      {activeTab === 'orders' ? (
        <>
          {canManageOrders ? (
            <div className="po-editor-card" style={{ marginBottom: 16 }}>
              <form className="po-document" onSubmit={saveOrder}>
                <div className="po-toolbar no-print">
                  <div>
                    <h3>{editingOrderId ? 'Edit Business Purchase Order' : 'Create Business Purchase Order'}</h3>
                    <p>Use this document format for supplier-facing bale orders.</p>
                  </div>
                  <div className="po-toolbar-actions">
                    {editingOrderId ? (
                      <button className="btn btn-secondary btn-sm" type="button" onClick={resetOrderForm} disabled={submitting}>
                        Cancel Edit
                      </button>
                    ) : null}
                    <button className="btn btn-secondary btn-sm" type="button" onClick={refreshAll} disabled={loading}>
                      {loading ? 'Refreshing...' : 'Refresh'}
                    </button>
                    <button className="btn btn-outline btn-sm" type="button" onClick={printPurchaseOrder}>
                      Print PO
                    </button>
                  </div>
                </div>

                <div className="po-paper">
                  <div className="po-header">
                    <div className="po-company">
                      <img src={cecilleLogo} alt="Company logo" />
                      <div>
                        <strong>{companyInfo.displayName}</strong>
                        {companyInfo.registeredName ? <span>{companyInfo.registeredName}</span> : null}
                        <span>{companyInfo.address || 'Store receiving address not configured'}</span>
                        {companyInfo.tinWithBranch ? <span>TIN: {companyInfo.tinWithBranch}</span> : null}
                      </div>
                    </div>
                    <div className="po-title-block">
                      <h2>PURCHASE ORDER</h2>
                      <div className="po-meta-row">
                        <span>PO No.</span>
                        <input
                          className="po-inline-input"
                          required
                          readOnly
                          value={orderForm.bale_batch_no}
                          placeholder="PO number"
                        />
                      </div>
                      <div className="po-meta-row">
                        <span>PO Date</span>
                        <input
                          className="po-inline-input"
                          type="date"
                          required
                          value={orderForm.purchase_date}
                          onChange={(event) => setOrderForm((prev) => ({ ...prev, purchase_date: event.target.value }))}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="po-party-grid">
                    <section className="po-panel">
                      <h4>Vendor</h4>
                      <label>Supplier</label>
                      <select
                        className="po-field"
                        value={orderForm.supplier_id}
                        onChange={(event) => updateOrderSupplier(event.target.value)}
                      >
                        <option value="">-- Select Supplier --</option>
                        {suppliers.map((supplier) => (
                          <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
                        ))}
                      </select>
                      <label>Supplier Name</label>
                      <input
                        className="po-field"
                        value={orderForm.supplier_name}
                        onChange={(event) => setOrderForm((prev) => ({ ...prev, supplier_name: event.target.value }))}
                        placeholder="Supplier snapshot"
                      />
                      <div className="po-detail-line"><strong>Address:</strong> {selectedOrderSupplier?.address || '-'}</div>
                      <div className="po-detail-line"><strong>Contact:</strong> {selectedOrderSupplier?.contact_person || '-'}</div>
                      <div className="po-detail-line"><strong>Phone:</strong> {selectedOrderSupplier?.phone || '-'}</div>
                      <div className="po-detail-line"><strong>Email:</strong> {selectedOrderSupplier?.email || '-'}</div>
                    </section>

                    <section className="po-panel">
                      <h4>Ship To</h4>
                      <div className="po-detail-line"><strong>{companyInfo.displayName}</strong></div>
                      {companyInfo.registeredName ? <div className="po-detail-line">{companyInfo.registeredName}</div> : null}
                      <div className="po-detail-line">{companyInfo.address || 'Store receiving address not configured'}</div>
                      <div className="po-detail-line"><strong>Expected Delivery:</strong></div>
                      <input
                        className="po-field"
                        type="date"
                        value={orderForm.expected_delivery_date}
                        onChange={(event) => setOrderForm((prev) => ({ ...prev, expected_delivery_date: event.target.value }))}
                      />
                      <div className="po-detail-line"><strong>Email:</strong> {companyInfo.email}</div>
                    </section>
                  </div>

                  <div className="po-routing-grid">
                    <div>
                      <strong>Requisitioner</strong>
                      <span>{currentUserName}</span>
                    </div>
                    <div>
                      <strong>Ship Via</strong>
                      <span>Supplier Delivery</span>
                    </div>
                    <div>
                      <strong>F.O.B</strong>
                      <span>Destination</span>
                    </div>
                    <div>
                      <strong>Shipping Terms</strong>
                      <span>As agreed with supplier</span>
                    </div>
                    <div>
                      <strong>Status</strong>
                      <select
                        className="po-routing-select"
                        value={orderForm.po_status}
                        onChange={(event) => setOrderForm((prev) => ({ ...prev, po_status: event.target.value }))}
                      >
                        {PO_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
                      </select>
                    </div>
                  </div>

                  <div className="po-table-wrap">
                    <table className="po-table">
                      <thead>
                        <tr>
                          <th>S.No</th>
                          <th>Item Code</th>
                          <th>Product Name</th>
                          <th>Category</th>
                          <th>Quantity</th>
                          <th>Units</th>
                          <th>Rate</th>
                          <th>Tax</th>
                          <th>Amount</th>
                          {!editingOrderId ? <th className="no-print">Action</th> : null}
                        </tr>
                      </thead>
                      <tbody>
                        {orderLineItems.map((item, index) => {
                          const lineQuantity = toWholeNumber(item.quantity_ordered)
                          const lineAmount = toMoney(item.bale_cost)
                          const lineRate = lineQuantity > 0 ? lineAmount / lineQuantity : lineAmount
                          const lineReference = getOrderLineReference(orderForm, item, index, orderLineItems.length, editingOrderId)

                          return (
                            <tr key={`po-line-${index}`}>
                              <td>{index + 1}</td>
                              <td>
                                <input
                                  className="po-table-input"
                                  value={item.item_code || lineReference}
                                  onChange={(event) => updateOrderItem(index, 'item_code', event.target.value)}
                                  required
                                />
                              </td>
                              <td>{item.product_name || 'Bale Lot Purchase'}</td>
                              <td>
                                <input
                                  className="po-table-input"
                                  value={item.bale_category}
                                  onChange={(event) => updateOrderItem(index, 'bale_category', event.target.value)}
                                  placeholder="Mixed apparel bale"
                                />
                              </td>
                              <td>
                                <input
                                  className="po-table-input po-number-input"
                                  type="number"
                                  min={1}
                                  value={item.quantity_ordered}
                                  onChange={(event) => updateOrderItem(index, 'quantity_ordered', event.target.value)}
                                  required
                                />
                              </td>
                              <td>bales</td>
                              <td>{fmtCurrency(lineRate)}</td>
                              <td>0%</td>
                              <td>
                                <input
                                  className="po-table-input po-money-input"
                                  type="number"
                                  step="0.01"
                                  min={0}
                                  value={item.bale_cost}
                                  onChange={(event) => updateOrderItem(index, 'bale_cost', event.target.value)}
                                />
                              </td>
                              {!editingOrderId ? (
                                <td className="no-print">
                                  {orderLineItems.length > 1 ? (
                                    <button
                                      className="btn btn-danger btn-sm"
                                      type="button"
                                      onClick={() => removeOrderItem(index)}
                                      disabled={submitting}
                                    >
                                      Remove
                                    </button>
                                  ) : null}
                                </td>
                              ) : null}
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>

                  {!editingOrderId ? (
                    <div className="po-line-actions no-print">
                      <button className="btn btn-secondary btn-sm" type="button" onClick={addOrderItem} disabled={submitting}>
                        + Add Order Line
                      </button>
                      <span>Each line will be saved as its own bale purchase order using the item code as the PO reference.</span>
                    </div>
                  ) : null}

                  <div className="po-lower-grid">
                    <section className="po-terms">
                      <h4>Terms and Conditions</h4>
                      <ol>
                        <li>Please confirm bale availability before dispatch.</li>
                        <li>Deliver only approved bale category and quantity.</li>
                        <li>Returned bales are subject to supplier validation and replacement terms.</li>
                        <li>Attach delivery receipt or supplier invoice upon delivery.</li>
                      </ol>
                      <label>Additional Notes</label>
                      <textarea
                        className="po-notes"
                        rows={3}
                        value={orderForm.notes}
                        onChange={(event) => setOrderForm((prev) => ({ ...prev, notes: event.target.value }))}
                        placeholder="Special terms, quality instructions, or supplier reminders"
                      />
                    </section>

                    <section className="po-total-box">
                      <div><span>Total</span><strong>{fmtCurrency(orderSubtotal)}</strong></div>
                      <div><span>Discounts</span><strong>{fmtCurrency(0)}</strong></div>
                      <div><span>Tax</span><strong>{fmtCurrency(orderTax)}</strong></div>
                      <div className="po-grand-total"><span>Grand Total</span><strong>{fmtCurrency(orderGrandTotal)}</strong></div>
                      <div className="po-for-company">For {companyInfo.displayName}</div>
                    </section>
                  </div>

                  <div className="po-signature-row">
                    <div>
                      <span>Prepared by</span>
                      <strong>{currentUserName}</strong>
                    </div>
                    <div>
                      <span>Authorized Signatory</span>
                      <strong>&nbsp;</strong>
                    </div>
                  </div>
                </div>

                <div className="po-save-bar no-print">
                  <div>
                    <strong>{purchaseOrderNumber}</strong>
                    <span>{fmtNumber(orderQuantity)} bale(s), {fmtCurrency(orderGrandTotal)}</span>
                  </div>
                  <button className="btn btn-primary" type="submit" disabled={submitting}>
                    {submitting ? 'Saving...' : editingOrderId ? 'Update Purchase Order' : 'Save Purchase Order'}
                  </button>
                </div>
              </form>
            </div>
          ) : (
            <div className="card" style={{ marginBottom: 16, color: 'var(--text-light)' }}>
              Your account can view bale purchase orders but cannot create, receive, or return them.
            </div>
          )}

          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-header">
              <h3>Purchase Order Summary</h3>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
              <div><div style={{ color: 'var(--text-light)', fontSize: 12 }}>Ordered</div><strong>{fmtNumber(orderTotals.ordered)}</strong></div>
              <div><div style={{ color: 'var(--text-light)', fontSize: 12 }}>Received</div><strong>{fmtNumber(orderTotals.received)}</strong></div>
              <div><div style={{ color: 'var(--text-light)', fontSize: 12 }}>Returned</div><strong>{fmtNumber(orderTotals.returned)}</strong></div>
              <div><div style={{ color: 'var(--text-light)', fontSize: 12 }}>Returnable</div><strong>{fmtNumber(orderTotals.returnable)}</strong></div>
              <div><div style={{ color: 'var(--text-light)', fontSize: 12 }}>Total Cost</div><strong>{fmtCurrency(orderTotals.cost)}</strong></div>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <h3>Bale Purchase Orders ({fmtNumber(orders.length)})</h3>
              <button className="btn btn-secondary btn-sm" type="button" onClick={refreshAll} disabled={loading}>
                Refresh
              </button>
            </div>
            <div className="table-wrap responsive">
              <table>
                <thead>
                  <tr>
                    <th>PO Reference</th>
                    <th>Supplier</th>
                    <th>Category</th>
                    <th>Order Date</th>
                    <th>Status</th>
                    <th>Ordered</th>
                    <th>Received</th>
                    <th>Returned</th>
                    <th>Available Return</th>
                    <th>Total Cost</th>
                    <th>Receive</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.length === 0 ? (
                    <tr>
                      <td colSpan={12} style={{ textAlign: 'center', color: 'var(--text-light)' }}>
                        {loading ? 'Loading purchase orders...' : 'No bale purchase orders found.'}
                      </td>
                    </tr>
                  ) : orders.map((order) => (
                    <tr key={order.id}>
                      <td style={{ fontWeight: 700 }}>{order.bale_batch_no}</td>
                      <td>{getSupplierNameFromOrder(order) || '-'}</td>
                      <td>{order.bale_category || '-'}</td>
                      <td>{fmtDate(order.purchase_date)}</td>
                      <td>{order.po_status || 'PENDING'}</td>
                      <td>{fmtNumber(order.quantity_ordered)}</td>
                      <td>{fmtNumber(order.quantity_received)}</td>
                      <td>{fmtNumber(order.returned_quantity)}</td>
                      <td>{fmtNumber(getOrderReturnableQuantity(order))}</td>
                      <td>{fmtCurrency(order.total_purchase_cost || order.bale_cost)}</td>
                      <td>
                        {canManageOrders ? (
                          <div style={{ display: 'flex', gap: 6, minWidth: 150 }}>
                            <input
                              className="form-input"
                              type="number"
                              min={1}
                              value={receiveQuantities[order.id] || ''}
                              onChange={(event) => setReceiveQuantities((prev) => ({ ...prev, [order.id]: event.target.value }))}
                              placeholder="Qty"
                            />
                            <button className="btn btn-primary btn-sm" type="button" onClick={() => receiveOrder(order)} disabled={submitting}>
                              Receive
                            </button>
                          </div>
                        ) : '-'}
                      </td>
                      <td>
                        <div className="table-actions">
                          <button
                            className="btn btn-outline btn-sm"
                            type="button"
                            onClick={() => {
                              setReturnForm((prev) => ({
                                ...prev,
                                supplier_id: order.supplier_id ? String(order.supplier_id) : '',
                                supplier_name: getSupplierNameFromOrder(order),
                                bale_purchase_id: String(order.id)
                              }))
                              goToTab('returns')
                              clearMessages()
                            }}
                            disabled={getOrderReturnableQuantity(order) <= 0}
                          >
                            Return
                          </button>
                          {canManageOrders ? (
                            <button className="btn btn-outline btn-sm" type="button" onClick={() => startEditOrder(order)}>
                              Edit
                            </button>
                          ) : null}
                          {canManageOrders ? (
                            <button className="btn btn-danger btn-sm" type="button" onClick={() => deleteOrder(order)}>
                              Delete
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : null}

      {activeTab === 'returns' ? (
        <>
          {canManageOrders ? (
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="card-header">
                <h3>Return Bales to Supplier</h3>
                <button className="btn btn-secondary btn-sm" type="button" onClick={resetReturnForm} disabled={submitting}>
                  Clear Form
                </button>
              </div>
              <form onSubmit={saveSupplierReturn}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Supplier *</label>
                    <select
                      className="form-input"
                      value={returnForm.supplier_id}
                      onChange={(event) => updateReturnSupplier(event.target.value)}
                    >
                      <option value="">-- Select Supplier --</option>
                      {suppliers.map((supplier) => (
                        <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">PO Reference *</label>
                    <select
                      className="form-input"
                      required
                      value={returnForm.bale_purchase_id}
                      onChange={(event) => {
                        const order = orders.find((row) => String(row.id) === String(event.target.value))
                        setReturnForm((prev) => ({
                          ...prev,
                          bale_purchase_id: event.target.value,
                          supplier_id: order?.supplier_id ? String(order.supplier_id) : prev.supplier_id,
                          supplier_name: order ? getSupplierNameFromOrder(order) : prev.supplier_name
                        }))
                      }}
                    >
                      <option value="">Choose purchase order</option>
                      {returnableOrders.map((order) => (
                        <option key={order.id} value={order.id}>
                          {`${order.bale_batch_no} - ${getSupplierNameFromOrder(order) || 'Unknown Supplier'} (${getOrderReturnableQuantity(order)} available)`}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Return Date *</label>
                    <input
                      className="form-input"
                      type="date"
                      required
                      value={returnForm.return_date}
                      onChange={(event) => setReturnForm((prev) => ({ ...prev, return_date: event.target.value }))}
                    />
                  </div>
                  <div className="form-group" style={{ gridColumn: '1 / -1', marginBottom: 0 }}>
                    <label className="form-label">Notes</label>
                    <textarea
                      className="form-input"
                      rows={2}
                      value={returnForm.notes}
                      onChange={(event) => setReturnForm((prev) => ({ ...prev, notes: event.target.value }))}
                    />
                  </div>
                </div>

                <div className="card" style={{ marginTop: 14, padding: 12, background: 'var(--cream-white)', border: '1px solid var(--border-light)' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
                    <div><div style={{ color: 'var(--text-light)', fontSize: 12 }}>Selected PO</div><strong>{selectedReturnOrder?.bale_batch_no || '-'}</strong></div>
                    <div><div style={{ color: 'var(--text-light)', fontSize: 12 }}>Received</div><strong>{fmtNumber(selectedReturnOrder?.quantity_received)}</strong></div>
                    <div><div style={{ color: 'var(--text-light)', fontSize: 12 }}>Already Returned</div><strong>{fmtNumber(selectedReturnOrder?.returned_quantity)}</strong></div>
                    <div><div style={{ color: 'var(--text-light)', fontSize: 12 }}>Available to Return</div><strong>{fmtNumber(selectedOrderReturnable)}</strong></div>
                    <div><div style={{ color: 'var(--text-light)', fontSize: 12 }}>Form Total</div><strong>{fmtNumber(returnItemsTotal)}</strong></div>
                  </div>
                </div>

                <div style={{ marginTop: 16 }}>
                  <div className="card-header" style={{ padding: 0, marginBottom: 8 }}>
                    <h3>Return Items</h3>
                    <button className="btn btn-secondary btn-sm" type="button" onClick={addReturnItem}>
                      Add Item
                    </button>
                  </div>
                  <div className="table-wrap responsive">
                    <table>
                      <thead>
                        <tr>
                          <th>Quantity</th>
                          <th>Reason</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {returnForm.items.map((item, index) => (
                          <tr key={`return-item-${index}`}>
                            <td style={{ width: 160 }}>
                              <input
                                className="form-input"
                                type="number"
                                min={1}
                                value={item.quantity}
                                onChange={(event) => updateReturnItem(index, 'quantity', event.target.value)}
                                required
                              />
                            </td>
                            <td>
                              <input
                                className="form-input"
                                value={item.reason}
                                onChange={(event) => updateReturnItem(index, 'reason', event.target.value)}
                                placeholder="Damaged bale, wrong bale type, supplier issue..."
                                required
                              />
                            </td>
                            <td style={{ width: 120 }}>
                              {returnForm.items.length > 1 ? (
                                <button className="btn btn-danger btn-sm" type="button" onClick={() => removeReturnItem(index)}>
                                  Remove
                                </button>
                              ) : null}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
                  <button className="btn btn-primary" type="submit" disabled={submitting || !selectedReturnOrder || selectedOrderReturnable <= 0}>
                    {submitting ? 'Saving...' : 'Save Supplier Return'}
                  </button>
                </div>
              </form>
            </div>
          ) : null}

          <div className="card">
            <div className="card-header">
              <h3>Supplier Return History ({fmtNumber(returns.length)})</h3>
              <button className="btn btn-secondary btn-sm" type="button" onClick={fetchReturns} disabled={loading}>
                Refresh
              </button>
            </div>
            <div className="table-wrap responsive">
              <table>
                <thead>
                  <tr>
                    <th>Return Date</th>
                    <th>Supplier</th>
                    <th>PO Reference</th>
                    <th>Quantity</th>
                    <th>Reasons</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {returns.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-light)' }}>
                        {loading ? 'Loading supplier returns...' : 'No supplier returns recorded.'}
                      </td>
                    </tr>
                  ) : returns.map((row) => (
                    <tr key={row.id}>
                      <td>{fmtDate(row.return_date)}</td>
                      <td>{row.supplier_name || '-'}</td>
                      <td style={{ fontWeight: 700 }}>{row.bale_batch_no || `PO #${row.bale_purchase_id}`}</td>
                      <td>{fmtNumber(row.total_returned_quantity)}</td>
                      <td>
                        {(row.items || []).map((item) => `${fmtNumber(item.quantity)} - ${item.reason}`).join('; ') || '-'}
                      </td>
                      <td>{row.notes || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : null}
    </div>
  )
}
