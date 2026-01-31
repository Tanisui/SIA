import React, { useEffect, useState } from 'react'
import EntityPage from '../components/EntityPage.js'
import api from '../api/api.js'

export default function Users(){
  const [rolesOptions, setRolesOptions] = useState([])

  useEffect(()=>{
    let mounted = true
    api.get('/roles').then(res => {
      if (!mounted) return
      const opts = (res.data || []).map(r => ({ value: r.id, label: r.name }))
      setRolesOptions(opts)
    }).catch(()=>{})
    return ()=>{ mounted = false }
  }, [])

  const schema = [
    { name: 'id', label: 'ID', hidden: true },
    { name: 'username', label: 'Username' },
    { name: 'email', label: 'Email' },
    { name: 'password', label: 'Password', type: 'password', hideInList: true },
    { name: 'full_name', label: 'Full name' },
    { name: 'roles', label: 'Roles', type: 'multiselect', options: rolesOptions },
    { name: 'is_active', label: 'Active', type: 'select', options: [{ value:'1', label:'Yes' }, { value:'0', label:'No' }] },
    { name: 'created_at', label: 'Created at', hidden: true },
    { name: 'updated_at', label: 'Updated at', hidden: true }
  ]

  return React.createElement(EntityPage, { title: 'Users', apiPath: '/users', schema })
}
