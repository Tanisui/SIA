import React from 'react'
import EntityPage from '../components/EntityPage.js'

const schema = [
  { name: 'id', label: 'ID', hidden: true },
  { name: 'name', label: 'Name' },
  { name: 'phone', label: 'Phone' },
  { name: 'email', label: 'Email' },
  { name: 'address', label: 'Address', type: 'textarea' },
  { name: 'notes', label: 'Notes', type: 'textarea' },
  { name: 'loyalty_points', label: 'Loyalty Points', type: 'number' }
]

export default function Customers(){
  return React.createElement(EntityPage, { title: 'Customers', apiPath: '/customers', schema })
}
