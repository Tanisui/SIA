import React, { useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { login, clearError } from '../store/authSlice.js'
import { Navigate } from 'react-router-dom'

export default function Login() {
  const dispatch = useDispatch()
  const auth = useSelector(s => s.auth)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  if (auth.token) return React.createElement(Navigate, { to: '/' })

  const rawError = auth.error && (auth.error.error || auth.error.message || auth.error)
  const isInactive = rawError && String(rawError).toLowerCase().includes('inactive')

  const handleSubmit = async (e) => {
    e.preventDefault()
    await dispatch(login({ username, password }))
  }

  return (
    React.createElement('div', { style: { display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center' } },
      React.createElement('form', { onSubmit: handleSubmit, style: { width: 360, padding: 24, border: '1px solid #eee', borderRadius: 8 } },
        React.createElement('h2', null, 'Sign in'),
        isInactive && React.createElement('div', { style: { color: 'red', marginTop: 8, marginBottom: 8, fontWeight: 600 } }, String(rawError)),
        React.createElement('div', null,
          React.createElement('label', null, 'Username'),
          React.createElement('input', { value: username, onChange: e => setUsername(e.target.value), required: true, style: { width: '100%', padding: 8, marginTop: 4 } })
        ),
        React.createElement('div', { style: { marginTop: 12 } },
          React.createElement('label', null, 'Password'),
          React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 } },
            React.createElement('input', { type: showPassword ? 'text' : 'password', value: password, onChange: e => setPassword(e.target.value), required: true, style: { flex: 1, padding: 8 } }),
            React.createElement('button', { type: 'button', onClick: () => setShowPassword(s => !s), title: showPassword ? 'Hide password' : 'Show password', style: { padding: '6px 8px', cursor: 'pointer', border: '1px solid #ddd', borderRadius: 4, background: '#fff' } }, showPassword ? '🙈' : '👁')
          )
        ),
        auth.error && !isInactive && React.createElement('div', { style: { color: 'red', marginTop: 8 } }, auth.error.error || auth.error.message || 'Login failed'),
        React.createElement('button', { type: 'submit', style: { marginTop: 16, padding: '8px 12px' } }, auth.status === 'loading' ? 'Signing in...' : 'Sign in'),
        React.createElement('div', { style: { marginTop: 12, display: 'flex', justifyContent: 'space-between' } },
          React.createElement('a', { href: '/forgot-password' }, 'Forgot password?'),
          React.createElement('a', { href: '/forgot-email' }, 'Forgot email?')
        )
      )
    )
  )
}

