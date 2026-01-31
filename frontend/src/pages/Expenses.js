import React from 'react'
import EntityPage from '../components/EntityPage.js'

const schema = [
  { name: 'id', label: 'ID', hidden: true },
  { name: 'expense_date', label: 'Date' },
  { name: 'category', label: 'Category' },
  { name: 'amount', label: 'Amount', type: 'number' },
  { name: 'vendor', label: 'Vendor' },
  { name: 'employee_id', label: 'Employee' },
  { name: 'status', label: 'Status' }
]

export default function Expenses(){
  return React.createElement(EntityPage, { title: 'Expenses & Reimbursements', apiPath: '/expenses', schema })
}
