import React, { useState, useEffect } from 'react'
import EntityPage from '../components/EntityPage.js'
import api from '../api/api.js'

export default function Employees() {
  const [roles, setRoles] = useState([])
  
  useEffect(() => {
    const fetchRoles = async () => {
      try {
        const res = await api.get('/roles')
        setRoles(res.data || [])
      } catch (err) {
        console.error('Failed to fetch roles:', err)
      }
    }
    fetchRoles()
  }, [])

  const schema = [
    { name: 'id', label: 'ID', hidden: true },
    { name: 'name', label: 'Name' },
    // ADDED: Email field right after the name so we can auto-generate the user account
    { name: 'email', label: 'Email', type: 'email' },
    { name: 'role', label: 'Role', type: 'select', options: roles.map(r => ({ value: r.name, label: r.name })) },
    { name: 'contact_type', label: 'Contact Type', type: 'select', options: [
      { value: 'Mobile', label: 'Mobile Number' },
      { value: 'Telephone', label: 'Telephone Number' }
    ] },
    { name: 'contact', label: 'Contact', type: 'phone', maxLength: 11 },
    { name: 'hire_date', label: 'Hire Date', type: 'date' },
    { name: 'pay_rate', label: 'Pay Rate', type: 'number' },
    { name: 'employment_status', label: 'Status', type: 'select', options: [
      { value: 'ACTIVE', label: 'Active' },
      { value: 'INACTIVE', label: 'Inactive' },
      { value: 'TERMINATED', label: 'Terminated' }
    ] }
  ]

  return React.createElement(EntityPage, { title: 'Employees', apiPath: '/employees', schema })
}