import React from 'react'
import EntityPage from '../components/EntityPage.js'

const schema = [
  { name: 'id', label: 'ID', hidden: true },
  { name: 'po_number', label: 'PO #' },
  { name: 'supplier_id', label: 'Supplier ID', type: 'number' },
  { name: 'status', label: 'Status', type: 'select', options: [
    { value: 'OPEN', label: 'Open' },
    { value: 'RECEIVED', label: 'Received' },
    { value: 'CANCELLED', label: 'Cancelled' }
  ] },
  { name: 'expected_date', label: 'Expected Date', type: 'date', required: true },
  { name: 'total', label: 'Total', type: 'number' }
]

export default function Purchasing(){
  return React.createElement(EntityPage, { title: 'Purchasing / Purchase Orders', apiPath: '/purchase-orders', schema })
}
