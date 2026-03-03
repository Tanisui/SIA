import React from 'react'
import EntityPage from '../components/EntityPage.js'

const schema = [
  { name: 'id', label: 'ID', hidden: true },
  { name: 'name', label: 'Name' },
  { name: 'role', label: 'Role', type: 'select', options: [
    { value: 'Admin', label: 'Admin' },
    { value: 'Manager', label: 'Manager' },
    { value: 'Sales Clerk', label: 'Sales Clerk' }
  ] },
  { name: 'contact', label: 'Contact' },
  { name: 'hire_date', label: 'Hire Date' },
  { name: 'pay_rate', label: 'Pay Rate', type: 'number' },
  { name: 'employment_status', label: 'Status', type: 'select', options: [
    { value: 'ACTIVE', label: 'Active' },
    { value: 'INACTIVE', label: 'Inactive' },
    { value: 'TERMINATED', label: 'Terminated' }
  ] }
]

export default function Employees(){
  return React.createElement(EntityPage, { title: 'Employees', apiPath: '/employees', schema })
}
