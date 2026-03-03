import React from 'react'
import EntityPage from '../components/EntityPage.js'

const schema = [
  { name: 'id', label: 'ID', hidden: true },
  { name: 'employee_id', label: 'Employee ID', type: 'number' },
  { name: 'employee_name', label: 'Employee', hideInForm: true },
  { name: 'period_start', label: 'Period Start' },
  { name: 'period_end', label: 'Period End' },
  { name: 'gross_pay', label: 'Gross Pay', type: 'number' },
  { name: 'deductions', label: 'Deductions', type: 'number' },
  { name: 'advances', label: 'Advances', type: 'number' },
  { name: 'net_pay', label: 'Net Pay', type: 'number' },
  { name: 'status', label: 'Status', type: 'select', options: [
    { value: 'PENDING', label: 'Pending' },
    { value: 'PROCESSED', label: 'Processed' },
    { value: 'PAID', label: 'Paid' }
  ] }
]

export default function Payroll(){
  return React.createElement(EntityPage, { title: 'Payroll', apiPath: '/payroll', schema })
}
