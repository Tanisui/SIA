import React from 'react'
import EntityPage from '../components/EntityPage.js'

const schema = [
  { name: 'id', label: 'ID', hidden: true },
  { name: 'name', label: 'Name' },
  { name: 'filters', label: 'Filters', type: 'textarea' },
  { name: 'owner_name', label: 'Owner', hideInForm: true },
  { name: 'created_at', label: 'Created At', hideInForm: true }
]

export default function Reports(){
  return React.createElement(EntityPage, { title: 'Reports & Analytics', apiPath: '/reports', schema })
}
