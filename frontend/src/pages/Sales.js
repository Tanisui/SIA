import React from 'react'
import EntityPage from '../components/EntityPage.js'

const schema = [
  { name: 'id', label: 'ID', hidden: true },
  { name: 'sale_id', label: 'Sale ID' },
  { name: 'order_number', label: 'Order #' },
  { name: 'date', label: 'Date' },
  { name: 'clerk_id', label: 'Clerk' },
  { name: 'customer_id', label: 'Customer' },
  { name: 'items', label: 'Items' },
  { name: 'subtotal', label: 'Subtotal', type: 'number' },
  { name: 'tax', label: 'Tax', type: 'number' },
  { name: 'discount', label: 'Discount', type: 'number' },
  { name: 'total', label: 'Total', type: 'number' },
  { name: 'payment_method', label: 'Payment method' },
  { name: 'status', label: 'Status' },
  { name: 'receipt_no', label: 'Receipt #' }
]

export default function Sales(){
  return React.createElement(EntityPage, { title: 'Sales / Orders', apiPath: '/orders', schema })
}
