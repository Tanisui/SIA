import React from 'react'
import EntityPage from '../components/EntityPage.js'

const schema = [
  { name: 'id', label: 'ID' },
  { name: 'name', label: 'Name' },
  { name: 'filters', label: 'Filters' },
  { name: 'owner', label: 'Owner' },
  { name: 'created_at', label: 'Created at' }
]

export default function Reports(){
  return React.createElement(EntityPage, { title: 'Reports & Analytics', apiPath: '/reports', schema })
}
