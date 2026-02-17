import React, { useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { login } from '../store/authSlice.js'
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

  return React.createElement('div', { className: 'login-page' },
    // Left panel — branding
    React.createElement('div', { className: 'login-left' },
      React.createElement('div', { className: 'login-brand' }, "Cecille's", React.createElement('br'), "N'Style"),
      React.createElement('div', { className: 'login-divider' }),
      React.createElement('div', { className: 'login-brand-sub' }, 'Point of Sale System'),
      React.createElement('p', { className: 'login-tagline' },
        'Manage your boutique with elegance — inventory, sales, and staff, all in one place.'
      )
    ),
    // Right panel — form
    React.createElement('div', { className: 'login-right' },
      React.createElement('div', { className: 'login-form-wrap' },
        React.createElement('h1', { className: 'login-title' }, 'Welcome back'),
        React.createElement('p', { className: 'login-subtitle' }, 'Sign in to your account to continue'),

        // Error messages
        (isInactive || (auth.error && !isInactive)) && React.createElement('div', { className: 'error-msg' },
          isInactive ? String(rawError) : (auth.error.error || auth.error.message || 'Invalid credentials')
        ),

        // Form
        React.createElement('form', { onSubmit: handleSubmit },
          // Username
          React.createElement('div', { className: 'form-group' },
            React.createElement('label', { className: 'form-label' }, 'Username'),
            React.createElement('input', {
              className: 'form-input',
              value: username,
              onChange: e => setUsername(e.target.value),
              required: true,
              placeholder: 'Enter your username',
              autoFocus: true
            })
          ),
          // Password
          React.createElement('div', { className: 'form-group' },
            React.createElement('label', { className: 'form-label' }, 'Password'),
            React.createElement('div', { className: 'login-form-input-wrap' },
              React.createElement('input', {
                className: 'form-input',
                type: showPassword ? 'text' : 'password',
                value: password,
                onChange: e => setPassword(e.target.value),
                required: true,
                placeholder: 'Enter your password'
              }),
              React.createElement('button', {
                type: 'button',
                className: 'login-pw-toggle',
                onClick: () => setShowPassword(s => !s),
                title: showPassword ? 'Hide password' : 'Show password'
              }, showPassword ? '🙈' : '👁')
            )
          ),
          // Submit
          React.createElement('button', {
            type: 'submit',
            className: 'login-submit',
            disabled: auth.status === 'loading'
          }, auth.status === 'loading' ? 'Signing in...' : 'Sign In')
        ),

        // Links
        React.createElement('div', { className: 'login-links' },
          React.createElement('a', { href: '/forgot-password' }, 'Forgot password?'),
          React.createElement('a', { href: '/forgot-email' }, 'Forgot email?')
        )
      )
    )
  )
}