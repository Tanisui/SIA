import React from 'react'
import EntityPage from '../components/EntityPage.js'

const schema = [
  { name: 'config_key', label: 'Setting Key' },
  { name: 'config_value', label: 'Value' },
  { name: 'last_updated', label: 'Last Updated', hideInForm: true }
]

export default function Settings(){
  return React.createElement(EntityPage, { title: 'Settings / Configuration', apiPath: '/settings', schema, idField: 'config_key' })
}
