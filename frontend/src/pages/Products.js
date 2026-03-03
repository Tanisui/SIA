import React from 'react'
import EntityPage from '../components/EntityPage.js'

const schema = [
  { name: 'id', label: 'ID', hidden: true },
  { name: 'sku', label: 'SKU' },
  { name: 'name', label: 'Name' },
  { name: 'brand', label: 'Brand' },
  { name: 'category_id', label: 'Category ID', hidden: true },
  { name: 'category', label: 'Category', hideInForm: true },
  { name: 'description', label: 'Description', type: 'textarea' },
  { name: 'price', label: 'Price', type: 'number' },
  { name: 'cost', label: 'Cost', type: 'number' },
  { name: 'stock_quantity', label: 'Stock Qty', type: 'number' },
  { name: 'low_stock_threshold', label: 'Low Stock Threshold', type: 'number' },
  { name: 'size', label: 'Size' },
  { name: 'color', label: 'Color' },
  { name: 'barcode', label: 'Barcode' },
  { name: 'is_active', label: 'Active', type: 'select', options: [{ value: '1', label: 'Yes' }, { value: '0', label: 'No' }] }
]

export default function Products(){
  return React.createElement(EntityPage, { title: 'Products', apiPath: '/products', schema })
}
