import React from 'react'
import EntityPage from '../components/EntityPage.js'

const schema = [
  { name: 'id', label: 'ID', hidden: true },
  { name: 'sku', label: 'SKU' },
  { name: 'name', label: 'Name' },
  { name: 'category_id', label: 'Category ID' },
  { name: 'category', label: 'Category' },
  { name: 'description', label: 'Description', type: 'textarea' },
  { name: 'unit_price', label: 'Unit price', type: 'number' },
  { name: 'cost_price', label: 'Cost price', type: 'number' },
  { name: 'stock_quantity', label: 'Stock qty', type: 'number' },
  { name: 'size', label: 'Size' },
  { name: 'color', label: 'Color' },
  { name: 'barcode', label: 'Barcode' },
  { name: 'images', label: 'Images' },
  { name: 'taxable', label: 'Taxable' },
  { name: 'reorder_level', label: 'Reorder level', type: 'number' }
]

export default function Products(){
  return React.createElement(EntityPage, { title: 'Products', apiPath: '/products', schema })
}
