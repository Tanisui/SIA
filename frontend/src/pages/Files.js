import React from 'react'
import EntityPage from '../components/EntityPage.js'

const schema = [
  { name: 'id', label: 'ID', hidden: true },
  { name: 'original_name', label: 'Filename' },
  { name: 'path', label: 'Path' },
  { name: 'type', label: 'Type' },
  { name: 'size', label: 'Size', type: 'number' },
  { name: 'uploader_name', label: 'Uploaded By', hideInForm: true },
  { name: 'uploaded_at', label: 'Uploaded At', hideInForm: true }
]

export default function Files(){
  return React.createElement(EntityPage, { title: 'Files & Documents', apiPath: '/files', schema })
}
