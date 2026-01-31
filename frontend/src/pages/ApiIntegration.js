import React from 'react'
import EntityPage from '../components/EntityPage.js'

const schema = [
  { name: 'id', label: 'ID' },
  { name: 'name', label: 'Name' },
  { name: 'key', label: 'Key' },
  { name: 'permissions', label: 'Permissions' },
  { name: 'created_at', label: 'Created at' }
]

export default function ApiIntegration(){
  return React.createElement(EntityPage, { title: 'API Keys & Webhooks', apiPath: '/api-keys', schema })
}
