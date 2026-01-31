import React, { useEffect, useState } from 'react'
import api from '../api/api.js'

function FieldInput({ field, value, onChange }){
  const { name, label, type, options } = field
  if (type === 'textarea') return React.createElement('textarea', { value: value||'', onChange: e => onChange(name, e.target.value), style:{ width:'100%', minHeight:80 } })
  if (type === 'password') {
    const [show, setShow] = useState(false)
    return React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
      React.createElement('input', { value: value||'', onChange: e => onChange(name, e.target.value), type: show ? 'text' : 'password', style:{ flex: 1, padding:8 } }),
      React.createElement('button', { type: 'button', onClick: () => setShow(s => !s), title: show ? 'Hide password' : 'Show password', style: { padding: '6px 8px', cursor: 'pointer', border: '1px solid #ddd', borderRadius: 4, background: '#fff' } }, show ? '🙈' : '👁')
    )
  }
  if (type === 'select') return React.createElement('select', { value: value||'', onChange: e => onChange(name, e.target.value) },
    React.createElement('option', { value: '' }, '-- select --'),
    options && options.map(o => React.createElement('option', { key: o.value||o, value: o.value||o }, o.label||o))
  )
  if (type === 'multiselect') return React.createElement('select', { multiple: true, value: value || [], onChange: e => {
    const sel = Array.from(e.target.selectedOptions).map(o => o.value)
    onChange(name, sel)
  }, style:{ width:'100%', padding:8, minHeight:80 } },
    options && options.map(o => React.createElement('option', { key: o.value||o, value: o.value||o }, o.label||o))
  )
  if (type === 'checkboxes') return React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 6 } },
    options && options.map(o => {
      const val = o.value || o
      const checked = Array.isArray(value) ? value.map(String).includes(String(val)) : false
      return React.createElement('label', { key: val, style: { display: 'flex', alignItems: 'center', gap: 8 } },
        React.createElement('input', { type: 'checkbox', checked, onChange: e => {
          const cur = Array.isArray(value) ? [...value.map(String)] : []
          if (e.target.checked) {
            cur.push(String(val))
          } else {
            const idx = cur.indexOf(String(val))
            if (idx !== -1) cur.splice(idx, 1)
          }
          onChange(name, cur)
        } }),
        React.createElement('span', null, o.label || String(val))
      )
    })
  )
  return React.createElement('input', { value: value||'', onChange: e => onChange(name, e.target.value), type: type === 'number' ? 'number' : 'text', style:{ width:'100%', padding:8 } })
}

export default function EntityPage({ title, apiPath, schema }){
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({})
  const [error, setError] = useState(null)
  const [showInactive, setShowInactive] = useState(false)

  const fetchAll = async () =>{
    setLoading(true)
    try{
      const res = await api.get(apiPath)
      const data = res.data || []
      const filtered = data.filter(it => {
        if (it.is_active === undefined || it.is_active === null) return true
        const isActive = (String(it.is_active) === '1' || it.is_active === 1 || it.is_active === true)
        return showInactive ? !isActive : isActive
      })
      setItems(filtered)
    }catch(err){
      setError('Failed to load')
    }finally{ setLoading(false) }
  }

  useEffect(()=>{ fetchAll() },[apiPath, showInactive])

  const onChange = (name, value) => setForm(prev => ({ ...prev, [name]: value }))

  const startCreate = ()=>{ setEditing('create'); setForm({}) }
  const startEdit = (it)=>{ setEditing('edit'); setForm(it) }
  const cancel = ()=>{ setEditing(null); setForm({}); setError(null) }

  const submit = async (e)=>{
    e && e.preventDefault()
    setError(null)
    try{
      const payload = { ...form }
      for (const f of schema){
        if (f.name === 'is_active' && payload.hasOwnProperty('is_active')){
          const v = payload.is_active
          payload.is_active = (String(v) === '1' || v === 1 || v === true || String(v).toLowerCase() === 'yes') ? 1 : 0
        }
        if ((f.type === 'multiselect' || f.type === 'checkboxes') && payload[f.name]){
          payload[f.name] = Array.isArray(payload[f.name]) ? payload[f.name].map(x => (String(x).match(/^\d+$/) ? Number(x) : x)) : payload[f.name]
        }
      }

      if (editing === 'create'){
        await api.post(apiPath, payload)
      }else{
        await api.put(`${apiPath}/${form.id}`, payload)
      }
      await fetchAll(); cancel()
    }catch(err){
      console.error(err)
      const msg = err?.response?.data?.error || err?.message || 'Save failed'
      setError(String(msg))
    }
  }

  const remove = async (id)=>{
    if (!confirm(`Confirm to delete this`)) return
    try{
      const res = await api.delete(`${apiPath}/${id}`)
      if (res && res.data && res.data.error) setError(res.data.error)
      await fetchAll()
      setError(null)
    }catch(e){
      console.error(e)
      const msg = e?.response?.data?.error || e.message || 'Delete failed'
      setError(String(msg))
    }
  }

  const visibleSchema = schema.filter(f => !f.hidden && !f.hideInList)

  return (
    React.createElement('div', { style:{ padding:20 } },
      React.createElement('h2', null, title),
      React.createElement('div', { style:{ marginBottom:12, display: 'flex', alignItems: 'center', gap: 12 } },
        React.createElement('button', { onClick: startCreate }, 'Create new'),
          React.createElement('label', { style: { fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 } },
            React.createElement('input', { type: 'checkbox', checked: showInactive, onChange: e => setShowInactive(e.target.checked) }),
            'Show inactive'
          )
      ),
      error && React.createElement('div', { style:{ color:'red', marginBottom:8 } }, error),
      loading ? React.createElement('div', null, 'Loading...') : (
        React.createElement('table', { style:{ width:'100%', borderCollapse:'collapse' } },
          React.createElement('thead', null,
            React.createElement('tr', null,
              visibleSchema.map(f => React.createElement('th', { key: f.name, style:{ textAlign:'left', borderBottom:'1px solid #ddd', padding:8 } }, f.label || f.name)),
              React.createElement('th', { style:{ borderBottom:'1px solid #ddd', padding:8 } }, 'Actions')
            )
          ),
          React.createElement('tbody', null,
            items.map(it => React.createElement('tr', { key: it.id || JSON.stringify(it) },
              visibleSchema.map(f => React.createElement('td', { key: f.name, style:{ padding:8, borderBottom:'1px solid #f6f6f6' } },
                (()=>{
                  const val = it[f.name]
                  if (Array.isArray(val)) return val.join(', ')
                  if (f.name === 'is_active'){
                    return (val === 1 || val === '1' || val === true) ? 'Yes' : 'No'
                  }
                  if ((f.type === 'select' || f.type === 'multiselect') && f.options){
                    if (Array.isArray(val)){
                      return val.map(v => {
                        const opt = f.options.find(o => String(o.value) === String(v))
                        return opt ? (opt.label || String(opt.value)) : String(v)
                      }).join(', ')
                    }
                    const opt = f.options.find(o => String(o.value) === String(val))
                    if (opt) return opt.label || String(opt.value)
                  }
                  return (val === null || val === undefined) ? '' : String(val)
                })()
              )),
              React.createElement('td', { style:{ padding:8 } },
                React.createElement('button', { onClick: ()=>startEdit(it), style:{ marginRight:8 } }, 'Edit'),
                React.createElement('button', { onClick: ()=>remove(it.id) }, 'Delete')
              )
            ))
          )
        )
      ),
      editing && React.createElement('div', { style:{ marginTop:20, padding:12, border:'1px solid #eee', borderRadius:6 } },
        React.createElement('h3', null, editing === 'create' ? 'Create' : 'Edit'),
        React.createElement('form', { onSubmit: submit },
          schema.filter(f => !f.hidden).map(f => React.createElement('div', { key: f.name, style:{ marginBottom:10 } },
            React.createElement('label', null, f.label || f.name),
            React.createElement(FieldInput, { field: f, value: form[f.name], onChange })
          )),
          React.createElement('div', null,
            React.createElement('button', { type:'submit', style:{ marginRight:8 } }, 'Save'),
            React.createElement('button', { type:'button', onClick: cancel }, 'Cancel')
          )
        )
      )
    )
  )
}
