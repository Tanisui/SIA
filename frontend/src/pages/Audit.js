import React from 'react'
import EntityPage from '../components/EntityPage.js'

const schema = [
  { name: 'id', label: 'ID', hidden: true },
  { name: 'user_id', label: 'User' },
  { name: 'action', label: 'Action' },
  { name: 'entity', label: 'Entity' },
  { name: 'entity_id', label: 'Entity ID' },
  { name: 'timestamp', label: 'Timestamp' }
]

export default function Audit(){
  return React.createElement(EntityPage, { title: 'Audit / Reports', apiPath: '/audit', schema })
}
