import React, { useEffect, useMemo, useState } from 'react'
import EntityPage from '../components/EntityPage.js'
import api from '../api/api.js'
import { PRODUCT_SIZE_OPTIONS } from '../constants/productSizes.js'

const toNumber = (v) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

const categoryPrefix = (name) => {
  const clean = String(name || '').replace(/[^a-zA-Z0-9\s]/g, ' ').trim()
  if (!clean) return 'PRD'

  const initials = clean.split(/\s+/).map((w) => w[0]).join('').toUpperCase()
  if (initials.length >= 3) return initials.slice(0, 3)

  const compact = clean.replace(/[^a-zA-Z0-9]/g, '').toUpperCase()
  if (compact.length >= 3) return compact.slice(0, 3)
  if (compact.length > 0) return compact.padEnd(3, 'X')
  return 'PRD'
}

const skuPreviewFromForm = (form, categoryOptions) => {
  const rawSku = String(form?.sku || '').trim()
  if (rawSku) {
    if (/^\d+$/.test(rawSku)) return rawSku.padStart(8, '0')
    return rawSku.toUpperCase()
  }

  const selectedCategory = categoryOptions.find((c) => String(c.value) === String(form?.category_id || ''))
  const prefix = categoryPrefix(selectedCategory?.label)
  return `${prefix}-0001`
}

export default function Products() {
  const [categoryOptions, setCategoryOptions] = useState([])

  useEffect(() => {
    const loadCategories = async () => {
      try {
        const res = await api.get('/categories')
        const opts = (res.data || []).map((c) => ({ value: String(c.id), label: c.name }))
        setCategoryOptions(opts)
      } catch (e) {
        setCategoryOptions([])
      }
    }
    loadCategories()
  }, [])

  const schema = useMemo(() => ([
    { name: 'id', label: 'Product ID', hidden: true },
    {
      name: 'sku',
      label: 'SKU',
      labelBubble: 'Auto-generated unless changed',
      placeholder: 'Auto-generated if left blank',
      helpText: (form) => `Store tracking code. Leave blank to auto-generate. Preview: ${skuPreviewFromForm(form, categoryOptions)}`,
      inputProps: { maxLength: 40 }
    },
    {
      name: 'name',
      label: 'Product Name',
      required: true,
      requiredMessage: 'Product name is required',
      placeholder: 'e.g. Oversized Cotton T-Shirt'
    },
    {
      name: 'barcode',
      label: 'Barcode (Optional)',
      labelBubble: 'Auto-generated unless changed',
      placeholder: 'Scan, enter, or leave blank to auto-generate',
      helpText: 'Optional scanning code. If left blank, it will be auto-generated when you save.'
    },
    {
      name: 'category_id',
      label: 'Category',
      type: 'select',
      options: categoryOptions,
      placeholder: 'Search or choose a category'
    },
    {
      name: 'brand',
      label: 'Brand',
      placeholder: 'e.g. Nike, Zara, Penshoppe'
    },
    {
      name: 'price',
      label: 'Selling Price (₱)',
      type: 'number',
      placeholder: '₱0.00',
      required: true,
      validate: (value) => (toNumber(value) > 0 ? '' : 'Selling price must be greater than 0'),
      inputProps: { min: 0, step: '0.01' }
    },
    {
      name: 'stock_quantity',
      label: 'Stock Quantity',
      type: 'number',
      placeholder: '0',
      hideInForm: true,
      validate: (value) => (toNumber(value) >= 0 ? '' : 'Quantity cannot be negative'),
      inputProps: { min: 0, step: '1' },
      renderList: (value) => String(Math.max(0, toNumber(value)))
    },
    {
      name: 'low_stock_threshold',
      label: 'Low Stock Alert',
      type: 'number',
      defaultValue: 10,
      placeholder: 'Alert me when stock reaches this number',
      inputProps: { min: 0, step: '1' }
    },
    {
      name: 'size',
      label: 'Size',
      type: 'select',
      placeholder: 'Select size',
      options: [...PRODUCT_SIZE_OPTIONS, { value: 'N/A', label: 'N/A' }]
    },
    {
      name: 'description',
      label: 'Description',
      type: 'textarea',
      placeholder: 'Write a short product description, material, features, or usage'
    },
    {
      name: 'category',
      label: 'Category',
      hideInForm: true
    },
    {
      name: 'product_source',
      label: 'Source',
      hideInForm: true,
      renderList: (value) => {
        const source = String(value || '').toLowerCase()
        if (source === 'bale_breakdown') return 'Bale Breakdown'
        if (source === 'repaired_damage') return 'Repaired Damage'
        return 'Manual'
      }
    },
    {
      name: 'is_active',
      label: 'Active',
      type: 'select',
      options: [
        { value: '1', label: 'Yes' },
        { value: '0', label: 'No' }
      ]
    }
  ]), [categoryOptions])

  const onBeforeSubmit = async (payload, mode) => {
    const next = { ...payload }

    next.name = String(next.name || '').trim()
    next.sku = String(next.sku || '').trim()
    next.barcode = String(next.barcode || '').trim()
    next.brand = String(next.brand || '').trim()
    next.description = String(next.description || '').trim()

    next.category_id = next.category_id ? Number(next.category_id) : null
    next.price = toNumber(next.price)
    next.low_stock_threshold = next.low_stock_threshold === '' || next.low_stock_threshold === undefined
      ? 10
      : Math.max(0, toNumber(next.low_stock_threshold))

    delete next.stock_quantity
    delete next.product_source
    delete next.source_breakdown_id
    delete next.bale_purchase_id
    delete next.condition_grade
    delete next.allocated_cost
    delete next.status
    delete next.date_encoded
    delete next.category

    if (!next.sku) delete next.sku
    if (!next.barcode && mode === 'create') delete next.barcode
    if (!next.brand) delete next.brand
    if (!next.description) delete next.description

    return next
  }

  return React.createElement(EntityPage, {
    title: 'Products',
    subtitle: 'Manage product details and selling prices. Repaired items received from Damaged appear here ready to sell.',
    apiPath: '/products',
    schema,
    createButtonLabel: '+ Add Product',
    createTitle: 'Create Product',
    editTitle: 'Edit Product',
    formIntro: 'Fill in the product details below to add a new item to inventory. Product ID is internal and auto-generated. SKU is your tracking code. Barcode is optional for scanning/manual entry. Stock quantity is not edited here: use Inventory Stock In for manual products, Bale Breakdown for bale items, and Damaged > Receive Repaired for repaired items.',
    submitLabelCreate: 'Save Product',
    submitLabelEdit: 'Save Product',
    cancelLabel: 'Cancel',
    onBeforeSubmit
  })
}
