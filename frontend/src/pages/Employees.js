import React from 'react'
import EntityPage from '../components/EntityPage.js'

const schema = [
  { name: 'id', label: 'ID' },
  { name: 'employee_id', label: 'Employee ID' },
  { name: 'first_name', label: 'First name' },
  { name: 'last_name', label: 'Last name' },
  { name: 'email', label: 'Email' },
  { name: 'phone', label: 'Phone' },
  { name: 'role', label: 'Role' },
  { name: 'department', label: 'Department' },
  { name: 'hire_date', label: 'Hire date' },
  { name: 'pay_rate', label: 'Pay rate', type: 'number' },
  { name: 'employment_status', label: 'Status' },
  { name: 'bank_details', label: 'Bank details' }
]

export default function Employees(){
  return React.createElement(EntityPage, { title: 'Employees', apiPath: '/employees', schema })
}
