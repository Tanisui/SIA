import React from 'react'
import EntityPage from '../components/EntityPage.js'

const schema = [
  { name: 'company_name', label: 'Company name' },
  { name: 'address', label: 'Address', type: 'textarea' },
  { name: 'currency', label: 'Currency' },
  { name: 'default_tax', label: 'Default tax' }
]

export default function Settings(){
  return React.createElement(EntityPage, { title: 'Settings / Configuration', apiPath: '/settings', schema })
}
