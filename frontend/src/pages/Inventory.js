import React from 'react'
import EntityPage from '../components/EntityPage.js'

const schema = [
  { name: 'id', label: 'ID', hidden: true },
  { name: 'product_id', label: 'Product ID' },
  { name: 'location_id', label: 'Location ID' },
  { name: 'quantity', label: 'Quantity', type: 'number' },
  { name: 'movement_type', label: 'Type' },
  { name: 'batch_no', label: 'Batch' },
  { name: 'expiry_date', label: 'Expiry' },
  { name: 'reference', label: 'Reference' },
  { name: 'user_id', label: 'User' },
  { name: 'timestamp', label: 'Timestamp' },
  { name: 'balance_after', label: 'Balance after' }
]

export default function Inventory(){
  return React.createElement(EntityPage, { title: 'Inventory', apiPath: '/inventory', schema })
}
