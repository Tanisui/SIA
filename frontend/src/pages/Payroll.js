import React from 'react'
import EntityPage from '../components/EntityPage.js'

const schema = [
  { name: 'id', label: 'ID', hidden: true },
  { name: 'pay_period', label: 'Pay period' },
  { name: 'employee_id', label: 'Employee' },
  { name: 'gross_pay', label: 'Gross pay', type: 'number' },
  { name: 'net_pay', label: 'Net pay', type: 'number' },
  { name: 'payment_date', label: 'Payment date' }
]

export default function Payroll(){
  return React.createElement(EntityPage, { title: 'Payroll', apiPath: '/payroll', schema })
}
