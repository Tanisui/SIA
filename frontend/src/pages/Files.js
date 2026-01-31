import React from 'react'
import EntityPage from '../components/EntityPage.js'

const schema = [
  { name: 'id', label: 'ID', hidden: true },
  { name: 'filename', label: 'Filename' },
  { name: 'file_type', label: 'Type' },
  { name: 'linked_entity', label: 'Linked to' },
  { name: 'uploaded_by', label: 'Uploaded by' },
  { name: 'uploaded_at', label: 'Uploaded at' }
]

export default function Files(){
  return React.createElement(EntityPage, { title: 'Files & Documents', apiPath: '/files', schema })
}
