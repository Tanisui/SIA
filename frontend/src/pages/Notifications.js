import React from 'react'
import EntityPage from '../components/EntityPage.js'

const schema = [
  { name: 'id', label: 'ID' },
  { name: 'type', label: 'Type' },
  { name: 'recipient_user_id', label: 'Recipient' },
  { name: 'payload', label: 'Payload' },
  { name: 'status', label: 'Status' },
  { name: 'sent_at', label: 'Sent at' }
]

export default function Notifications(){
  return React.createElement(EntityPage, { title: 'Notifications / Email', apiPath: '/notifications', schema })
}
