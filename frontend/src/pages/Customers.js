import React from 'react'
import EntityPage from '../components/EntityPage.js'

const schema = [
  { name: 'id', label: 'ID', hidden: true },
  { name: 'name', label: 'Name' },
  { name: 'type', label: 'Type' },
  { name: 'contact_person', label: 'Contact' },
  { name: 'email', label: 'Email' },
  { name: 'phone', label: 'Phone' },
  { name: 'address', label: 'Address' },
  { name: 'notes', label: 'Notes' },
  { name: 'loyalty_points', label: 'Loyalty points', type: 'number' }
]

export default function Customers(){
  return React.createElement(EntityPage, { title: 'Customers / Suppliers', apiPath: '/contacts', schema })
}
