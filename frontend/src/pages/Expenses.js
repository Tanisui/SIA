import React from 'react'
import EntityPage from '../components/EntityPage.js'

const schema = [
  { name: 'id', label: 'ID', hidden: true },
  { name: 'expense_date', label: 'Date' },
  { name: 'category', label: 'Category' },
  { name: 'description', label: 'Description', type: 'textarea' },
  { name: 'amount', label: 'Amount', type: 'number' },
  { name: 'vendor', label: 'Vendor' },
  { name: 'employee_id', label: 'Employee ID', type: 'number' },
  { name: 'employee_name', label: 'Employee', hideInForm: true },
  { name: 'status', label: 'Status', type: 'select', options: [
    { value: 'PENDING', label: 'Pending' },
    { value: 'APPROVED', label: 'Approved' },
    { value: 'REJECTED', label: 'Rejected' },
    { value: 'PAID', label: 'Paid' }
  ] }
]

export default function Expenses(){
  return React.createElement(EntityPage, { title: 'Expenses & Reimbursements', apiPath: '/expenses', schema })
}
