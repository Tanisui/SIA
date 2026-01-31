import React from 'react'
import EntityPage from '../components/EntityPage.js'

const schema = [
  { name: 'id', label: 'ID', hidden: true },
  { name: 'po_number', label: 'PO #' },
  { name: 'supplier_id', label: 'Supplier' },
  { name: 'status', label: 'Status' },
  { name: 'expected_delivery', label: 'Expected delivery' },
  { name: 'total', label: 'Total', type: 'number' }
]

export default function Purchasing(){
  return React.createElement(EntityPage, { title: 'Purchasing / Purchase Orders', apiPath: '/purchase-orders', schema })
}
