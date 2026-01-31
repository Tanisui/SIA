import React, { useEffect, useState } from 'react'
import EntityPage from '../components/EntityPage.js'
import api from '../api/api.js'

export default function Roles(){
  const [permOptions, setPermOptions] = useState([])

  useEffect(()=>{
    let mounted = true
    api.get('/rbac/permissions').then(res => {
      if (!mounted) return
      const list = res.data && res.data.permissions ? res.data.permissions : []
      const opts = (list || []).map(p => ({ value: p.name, label: p.name }))
      setPermOptions(opts)
    }).catch(()=>{})
    return ()=>{ mounted = false }
  }, [])

  const schema = [
    { name: 'id', label: 'ID', hidden: true },
    { name: 'name', label: 'Role name' },
    { name: 'description', label: 'Description' },
    { name: 'permissions', label: 'Permissions', type: 'checkboxes', options: permOptions, hideInList: true }
  ]

  return React.createElement(EntityPage, { title: 'Roles & Permissions', apiPath: '/roles', schema })
}
