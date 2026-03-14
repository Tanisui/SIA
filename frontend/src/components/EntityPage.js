import React, { useEffect, useMemo, useState } from 'react'
import api from '../api/api.js'

function PasswordInput({ value, onChange, name, placeholder, inputProps }) {
  const [show, setShow] = useState(false)
  return React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
    React.createElement('input', {
      value: value || '',
      onChange: (e) => onChange(name, e.target.value),
      type: show ? 'text' : 'password',
      placeholder: placeholder || '',
      style: { flex: 1, width: '100%', padding: 8 },
      ...inputProps
    }),
    React.createElement('button', {
      type: 'button',
      onClick: () => setShow((s) => !s),
      title: show ? 'Hide password' : 'Show password',
      style: {
        padding: '6px 8px',
        cursor: 'pointer',
        border: '1px solid #ddd',
        borderRadius: 4,
        background: '#fff'
      }
    }, show ? 'Hide' : 'Show')
  )
}

function FieldInput({ field, value, onChange }) {
  const { name, type, options, placeholder, inputProps } = field
  const baseStyle = { width: '100%', padding: 8 }

  if (type === 'textarea') {
    return React.createElement('textarea', {
      value: value || '',
      onChange: (e) => onChange(name, e.target.value),
      placeholder: placeholder || '',
      style: { ...baseStyle, minHeight: 90 },
      ...inputProps
    })
  }

  if (type === 'password') {
    return React.createElement(PasswordInput, { value, onChange, name, placeholder, inputProps })
  }

  if (type === 'select') {
    return React.createElement('select', {
      value: value || '',
      onChange: (e) => onChange(name, e.target.value),
      style: baseStyle,
      ...inputProps
    },
    React.createElement('option', { value: '' }, placeholder || '-- select --'),
    options && options.map((o) => React.createElement('option', { key: o.value || o, value: o.value || o }, o.label || o)))
  }

  if (type === 'multiselect') {
    return React.createElement('select', {
      multiple: true,
      value: value || [],
      onChange: (e) => {
        const selected = Array.from(e.target.selectedOptions).map((o) => o.value)
        onChange(name, selected)
      },
      style: { ...baseStyle, minHeight: 90 },
      ...inputProps
    },
    options && options.map((o) => React.createElement('option', { key: o.value || o, value: o.value || o }, o.label || o)))
  }

  if (type === 'checkboxes') {
    return React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 6 } },
      options && options.map((o) => {
        const val = o.value || o
        const checked = Array.isArray(value) ? value.map(String).includes(String(val)) : false
        return React.createElement('label', { key: val, style: { display: 'flex', alignItems: 'center', gap: 8 } },
          React.createElement('input', {
            type: 'checkbox',
            checked,
            onChange: (e) => {
              const cur = Array.isArray(value) ? [...value.map(String)] : []
              if (e.target.checked) {
                cur.push(String(val))
              } else {
                const idx = cur.indexOf(String(val))
                if (idx !== -1) cur.splice(idx, 1)
              }
              onChange(name, cur)
            }
          }),
          React.createElement('span', null, o.label || String(val))
        )
      })
    )
  }

  if (type === 'date') {
    let dateValue = value || ''
    if (dateValue && typeof dateValue === 'string') {
      try {
        const d = new Date(dateValue)
        if (!isNaN(d.getTime())) {
          dateValue = d.toISOString().split('T')[0]
        }
      } catch (e) {
        dateValue = value || ''
      }
    }

    return React.createElement('input', {
      value: dateValue,
      onChange: (e) => onChange(name, e.target.value),
      type: 'date',
      style: baseStyle,
      ...inputProps
    })
  }

  if (type === 'phone') {
    const maxLen = field.maxLength || 11
    return React.createElement('div', null,
      React.createElement('input', {
        value: value || '',
        onChange: (e) => {
          const onlyDigits = e.target.value.replace(/\D/g, '')
          onChange(name, onlyDigits.slice(0, maxLen))
        },
        type: 'text',
        placeholder: placeholder || 'e.g., 09163550310',
        maxLength: maxLen,
        style: baseStyle,
        ...inputProps
      }),
      React.createElement('small', { style: { color: '#666', fontSize: 12 } }, `Must be ${maxLen} digits`)
    )
  }

  return React.createElement('input', {
    value: value || '',
    onChange: (e) => onChange(name, e.target.value),
    type: type === 'number' ? 'number' : 'text',
    placeholder: placeholder || '',
    style: baseStyle,
    ...inputProps
  })
}

function LabelHoverTip({ text }) {
  const [open, setOpen] = useState(false)
  return React.createElement('span', {
    style: { position: 'relative', display: 'inline-flex', alignItems: 'center' },
    onMouseEnter: () => setOpen(true),
    onMouseLeave: () => setOpen(false)
  },
  React.createElement('span', {
    title: text,
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: 18,
      height: 18,
      borderRadius: 999,
      border: '1px solid #cbd5e1',
      background: '#f8fafc',
      color: '#334155',
      fontSize: 11,
      fontWeight: 700,
      lineHeight: 1,
      cursor: 'help',
      userSelect: 'none'
    }
  }, 'i'),
  open && React.createElement('span', {
    style: {
      position: 'absolute',
      left: '50%',
      bottom: 'calc(100% + 8px)',
      transform: 'translateX(-50%)',
      zIndex: 40,
      whiteSpace: 'nowrap',
      padding: '6px 10px',
      borderRadius: 10,
      border: '1px solid #cbd5e1',
      background: '#f8fafc',
      color: '#334155',
      fontSize: 11,
      fontWeight: 500,
      boxShadow: '0 4px 14px rgba(0,0,0,0.12)'
    }
  }, text)
  )
}

export default function EntityPage({
  title,
  apiPath,
  schema,
  idField,
  subtitle,
  createButtonLabel,
  formIntro,
  createTitle,
  editTitle,
  submitLabelCreate,
  submitLabelEdit,
  cancelLabel,
  onBeforeSubmit
}) {
  const pk = idField || 'id'
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({})
  const [error, setError] = useState(null)
  const [fieldErrors, setFieldErrors] = useState({})
  const [showActive, setShowActive] = useState(false)
  const [showInactive, setShowInactive] = useState(false)
  const [showTerminated, setShowTerminated] = useState(false)

  const fetchAll = async () => {
    setLoading(true)
    try {
      const res = await api.get(apiPath)
      const data = res.data || []
      const filtered = data.filter((it) => {
        if (it.employment_status !== undefined && it.employment_status !== null) {
          const status = String(it.employment_status).toUpperCase()
          if (!showActive && !showInactive && !showTerminated) return true
          if (showActive && status === 'ACTIVE') return true
          if (showInactive && status === 'INACTIVE') return true
          if (showTerminated && status === 'TERMINATED') return true
          return false
        }

        if (it.is_active === undefined || it.is_active === null) return true
        const isActive = String(it.is_active) === '1' || it.is_active === 1 || it.is_active === true
        return showInactive ? !isActive : isActive
      })
      setItems(filtered)
    } catch (err) {
      setError('Failed to load')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchAll()
  }, [apiPath, showActive, showInactive, showTerminated])

  const visibleSchema = useMemo(() => schema.filter((f) => !f.hidden && !f.hideInList), [schema])
  const formSchema = useMemo(() => schema.filter((f) => !f.hidden && !f.hideInForm), [schema])

  const onChange = (name, value) => {
    setForm((prev) => ({ ...prev, [name]: value }))
    setFieldErrors((prev) => {
      if (!prev[name]) return prev
      const next = { ...prev }
      delete next[name]
      return next
    })
  }

  const buildDefaultForm = () => {
    const defaults = {}
    for (const f of schema) {
      if (f.defaultValue !== undefined) {
        defaults[f.name] = typeof f.defaultValue === 'function' ? f.defaultValue() : f.defaultValue
      }
    }
    return defaults
  }

  const startCreate = () => {
    setEditing('create')
    setForm(buildDefaultForm())
    setError(null)
    setFieldErrors({})
  }

  const startEdit = (it) => {
    setEditing('edit')
    setForm(it)
    setError(null)
    setFieldErrors({})
  }

  const cancel = () => {
    setEditing(null)
    setForm({})
    setError(null)
    setFieldErrors({})
  }

  const runValidation = (payload) => {
    const errors = {}
    for (const f of formSchema) {
      const value = payload[f.name]
      const isEmpty = value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0)

      if (f.required && isEmpty) {
        errors[f.name] = f.requiredMessage || `${f.label || f.name} is required`
        continue
      }

      if (typeof f.validate === 'function') {
        const msg = f.validate(value, payload)
        if (msg) errors[f.name] = msg
      }
    }
    return errors
  }

  const submit = async (e) => {
    if (e) e.preventDefault()
    setError(null)
    try {
      let payload = { ...form }

      for (const f of schema) {
        if (f.name === 'is_active' && payload.hasOwnProperty('is_active')) {
          const v = payload.is_active
          payload.is_active = (String(v) === '1' || v === 1 || v === true || String(v).toLowerCase() === 'yes') ? 1 : 0
        }

        if ((f.type === 'multiselect' || f.type === 'checkboxes') && payload[f.name]) {
          payload[f.name] = Array.isArray(payload[f.name])
            ? payload[f.name].map((x) => (String(x).match(/^\d+$/) ? Number(x) : x))
            : payload[f.name]
        }
      }

      if (typeof onBeforeSubmit === 'function') {
        payload = await onBeforeSubmit(payload, editing)
      }

      const validationErrors = runValidation(payload)
      if (Object.keys(validationErrors).length > 0) {
        setFieldErrors(validationErrors)
        setError('Please fix the highlighted fields.')
        return
      }

      if (editing === 'create') {
        await api.post(apiPath, payload)
      } else {
        await api.put(`${apiPath}/${form[pk]}`, payload)
      }

      await fetchAll()
      cancel()
    } catch (err) {
      console.error(err)
      const msg = err?.response?.data?.error || err?.message || 'Save failed'
      setError(String(msg))
    }
  }

  const remove = async (id) => {
    if (!confirm('Confirm to delete this')) return
    try {
      const res = await api.delete(`${apiPath}/${id}`)
      if (res && res.data && res.data.error) setError(res.data.error)
      await fetchAll()
      setError(null)
    } catch (e) {
      console.error(e)
      const msg = e?.response?.data?.error || e.message || 'Delete failed'
      setError(String(msg))
    }
  }

  return React.createElement('div', { className: 'page' },
    React.createElement('div', { className: 'page-header' },
      React.createElement('div', null,
        React.createElement('h1', { className: 'page-title' }, title),
        React.createElement('p', { className: 'page-subtitle' }, subtitle || 'Manage and organize your team members')
      )
    ),

    React.createElement('div', { className: 'card', style: { marginBottom: 16 } },
      React.createElement('div', { style: { marginBottom: 12, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' } },
        React.createElement('button', { className: 'btn btn-primary', onClick: startCreate }, createButtonLabel || '+ Create new'),
        schema.some((f) => f.name === 'employment_status') && React.createElement('label', { style: { fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 } },
          React.createElement('input', { type: 'checkbox', checked: showActive, onChange: (e) => setShowActive(e.target.checked) }),
          'Active'
        ),
        schema.some((f) => f.name === 'employment_status') && React.createElement('label', { style: { fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 } },
          React.createElement('input', { type: 'checkbox', checked: showInactive, onChange: (e) => setShowInactive(e.target.checked) }),
          'Inactive'
        ),
        schema.some((f) => f.name === 'employment_status') && React.createElement('label', { style: { fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 } },
          React.createElement('input', { type: 'checkbox', checked: showTerminated, onChange: (e) => setShowTerminated(e.target.checked) }),
          'Terminated'
        ),
        schema.some((f) => f.name === 'is_active') && !schema.some((f) => f.name === 'employment_status') && React.createElement('label', { style: { fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 } },
          React.createElement('input', { type: 'checkbox', checked: showInactive, onChange: (e) => setShowInactive(e.target.checked) }),
          'Show inactive'
        )
      ),

      error && React.createElement('div', { className: 'error-msg', style: { marginBottom: 12 } }, error),

      loading
        ? React.createElement('div', { style: { padding: 40, textAlign: 'center', color: 'var(--text-light)' } }, 'Loading...')
        : React.createElement('div', { className: 'table-wrap' },
            React.createElement('table', null,
              React.createElement('thead', null,
                React.createElement('tr', null,
                  visibleSchema.map((f) => React.createElement('th', { key: f.name }, f.label || f.name)),
                  React.createElement('th', { style: { textAlign: 'right' } }, 'Actions')
                )
              ),
              React.createElement('tbody', null,
                items.map((it) => React.createElement('tr', { key: it[pk] || JSON.stringify(it) },
                  visibleSchema.map((f) => React.createElement('td', { key: f.name }, (() => {
                    const val = it[f.name]
                    if (Array.isArray(val)) return val.join(', ')
                    if (f.name === 'is_active') return (val === 1 || val === '1' || val === true) ? 'Yes' : 'No'

                    if (f.type === 'date' && val) {
                      try {
                        const d = new Date(val)
                        if (!isNaN(d.getTime())) {
                          return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
                        }
                      } catch (e) {
                        return String(val)
                      }
                    }

                    if ((f.type === 'select' || f.type === 'multiselect') && f.options) {
                      if (Array.isArray(val)) {
                        return val.map((v) => {
                          const opt = f.options.find((o) => String(o.value) === String(v))
                          return opt ? (opt.label || String(opt.value)) : String(v)
                        }).join(', ')
                      }
                      const opt = f.options.find((o) => String(o.value) === String(val))
                      if (opt) return opt.label || String(opt.value)
                    }

                    return (val === null || val === undefined) ? '' : String(val)
                  })())),
                  React.createElement('td', { style: { textAlign: 'right' } },
                    React.createElement('button', { className: 'btn btn-secondary', onClick: () => startEdit(it), style: { marginRight: 8, padding: '6px 12px', fontSize: 12 } }, 'Edit'),
                    React.createElement('button', { className: 'btn btn-danger', onClick: () => remove(it[pk]), style: { padding: '6px 12px', fontSize: 12 } }, 'Delete')
                  )
                ))
              )
            )
          )
    ),

    editing && React.createElement('div', { className: 'card', style: { marginTop: 20 } },
      React.createElement('h3', { style: { marginBottom: 6 } }, editing === 'create' ? (createTitle || 'Create') : (editTitle || 'Edit')),
      formIntro && React.createElement('p', { style: { marginBottom: 14, color: 'var(--text-mid)', fontSize: 13.5 } }, formIntro),
      React.createElement('form', { onSubmit: submit },
        React.createElement('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(220px, 1fr))', gap: 12 } },
          formSchema.map((f) => React.createElement('div', { key: f.name, style: { marginBottom: 2 } },
            (() => {
              const helperText = typeof f.helpText === 'function' ? f.helpText(form, editing) : f.helpText
              return React.createElement(React.Fragment, null,
            React.createElement('label', {
              style: {
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                marginBottom: 6,
                fontSize: 13.5,
                fontWeight: 600,
                flexWrap: 'wrap'
              }
            },
              React.createElement('span', null,
                f.label || f.name,
                f.required && React.createElement('span', { style: { color: 'var(--error)', marginLeft: 4 } }, '*')
              ),
              f.labelBubble && React.createElement(LabelHoverTip, { text: f.labelBubble })
            ),
            React.createElement(FieldInput, { field: f, value: form[f.name], onChange }),
            fieldErrors[f.name] && React.createElement('div', { style: { marginTop: 5, color: 'var(--error)', fontSize: 12.5 } }, fieldErrors[f.name]),
            helperText && React.createElement('div', { style: { marginTop: 5, color: 'var(--text-light)', fontSize: 12 } }, helperText)
              )
            })()
          ))
        ),
        React.createElement('div', { style: { marginTop: 14 } },
          React.createElement('button', { type: 'submit', className: 'btn btn-primary', style: { marginRight: 8 } }, editing === 'create' ? (submitLabelCreate || 'Save') : (submitLabelEdit || 'Save')),
          React.createElement('button', { type: 'button', className: 'btn btn-secondary', onClick: cancel }, cancelLabel || 'Cancel')
        )
      )
    )
  )
}
