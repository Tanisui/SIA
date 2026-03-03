import React from 'react'
import EntityPage from '../components/EntityPage.js'

const schema = [
  { name: 'id', label: 'ID', hidden: true },
  { name: 'username', label: 'User', hideInForm: true },
  { name: 'action', label: 'Action' },
  { name: 'resource_type', label: 'Resource Type' },
  { name: 'resource_id', label: 'Resource ID' },
  { name: 'details', label: 'Details' },
  { name: 'created_at', label: 'Timestamp' }
]

export default function Audit(){
  return React.createElement(EntityPage, { title: 'Audit / Reports', apiPath: '/audit', schema })
}
