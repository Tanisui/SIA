import React from 'react'
import EntityPage from '../components/EntityPage.js'

const schema = [
  { name: 'id', label: 'ID', hidden: true },
  { name: 'type', label: 'Type' },
  { name: 'recipient_user_id', label: 'Recipient ID', type: 'number' },
  { name: 'recipient_username', label: 'Recipient', hideInForm: true },
  { name: 'payload', label: 'Payload', type: 'textarea' },
  { name: 'status', label: 'Status', type: 'select', options: [
    { value: 'PENDING', label: 'Pending' },
    { value: 'SENT', label: 'Sent' },
    { value: 'FAILED', label: 'Failed' }
  ] },
  { name: 'sent_at', label: 'Sent At', hideInForm: true }
]

export default function Notifications(){
  return React.createElement(EntityPage, { title: 'Notifications / Email', apiPath: '/notifications', schema })
}
