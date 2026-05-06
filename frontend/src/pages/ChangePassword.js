import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDispatch, useSelector } from 'react-redux'
import api from '../api/api.js'
import { setUser } from '../store/authSlice.js'

function normalizeUsername(value) {
  return String(value || '').trim().toLowerCase()
}

function PasswordInput({ value, onChange, placeholder }) {
  const [show, setShow] = useState(false)

  return React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
    React.createElement('input', {
      value: value || '',
      onChange: (event) => onChange(event.target.value),
      type: show ? 'text' : 'password',
      placeholder: placeholder || '',
      style: { flex: 1, width: '100%', padding: 8, border: '1px solid #ddd', borderRadius: 4 }
    }),
    React.createElement('button', {
      type: 'button',
      onClick: () => setShow((current) => !current),
      style: { padding: '6px 8px', cursor: 'pointer', border: '1px solid #ddd', borderRadius: 4, background: '#fff', fontSize: '12px' }
    }, show ? 'Hide' : 'Show')
  )
}

export default function ChangePassword() {
  const navigate = useNavigate()
  const dispatch = useDispatch()
  const user = useSelector((state) => state.auth?.user)

  const [username, setUsername] = useState(user?.username || '')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    setUsername(user?.username || '')
  }, [user])

  const labelStyle = { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, fontSize: '13.5px', fontWeight: 600 }
  const currentUsername = normalizeUsername(user?.username)
  const nextUsername = normalizeUsername(username)
  const usernameChanged = Boolean(nextUsername && nextUsername !== currentUsername)
  const passwordChanged = Boolean(newPassword)

  const handleSubmit = async (event) => {
    if (event) event.preventDefault()

    setMessage('')
    setError('')

    if (!usernameChanged && !passwordChanged) {
      setError('No changes were made. Update the username or enter a new password before saving.')
      return
    }

    if (!nextUsername) {
      setError('Username is required.')
      return
    }

    if (!currentPassword) {
      setError('Current password is required.')
      return
    }

    if (passwordChanged && newPassword !== confirmPassword) {
      setError('New passwords do not match.')
      return
    }

    try {
      const payload = {
        currentPassword,
        oldPassword: currentPassword
      }
      if (usernameChanged) payload.username = nextUsername
      if (passwordChanged) payload.newPassword = newPassword

      const response = await api.post('/auth/account-security', payload)
      const nextUser = response.data?.user
      const nextToken = response.data?.token

      if (nextUser && nextToken) {
        dispatch(setUser({
          user: nextUser,
          token: nextToken,
          permissions: nextUser.permissions || []
        }))
      }

      setMessage(response.data?.message || 'Account security updated successfully.')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setUsername(nextUser?.username || nextUsername)
    } catch (err) {
      const statusCode = err.response?.status
      const rawErrorMessage = err.response?.data?.error || err.response?.data?.message || ''
      const errorMessage = rawErrorMessage === 'Both old and new passwords are required' || statusCode === 404
        ? 'Your account could not be updated. Please contact your system administrator.'
        : (rawErrorMessage || 'Failed to update account settings. Please try again.')
      setError(errorMessage)
    }
  }

  return React.createElement('div', { className: 'page' },
    React.createElement('div', { className: 'card', style: { marginTop: 20 } },
      React.createElement('h3', { style: { marginBottom: 6 } }, 'Account Security'),
      React.createElement('p', { style: { marginBottom: 14, color: '#666', fontSize: '13.5px' } }, 'Update the username and password used to sign in to this account.'),

      message && React.createElement('div', { style: { color: '#155724', backgroundColor: '#d4edda', padding: '10px', borderRadius: '4px', marginBottom: '15px', fontSize: '13px' } }, message),
      error && React.createElement('div', { style: { color: '#721c24', backgroundColor: '#f8d7da', padding: '10px', borderRadius: '4px', marginBottom: '15px', fontSize: '13px' } }, error),

      React.createElement('form', { onSubmit: handleSubmit },
        React.createElement('div', { className: 'account-security-grid', style: { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(220px, 1fr))', gap: 12 } },
          React.createElement('div', { style: { marginBottom: 2 } },
            React.createElement('label', { style: labelStyle }, 'Username'),
            React.createElement('input', {
              value: username || '',
              onChange: (event) => setUsername(event.target.value),
              type: 'text',
              placeholder: 'Username',
              autoComplete: 'username',
              style: { width: '100%', padding: 8, border: '1px solid #ddd', borderRadius: 4 }
            })
          ),
          React.createElement('div', { style: { marginBottom: 2 } },
            React.createElement('label', { style: labelStyle }, 'Current Password'),
            React.createElement(PasswordInput, { value: currentPassword, onChange: setCurrentPassword, placeholder: 'Current Password' })
          ),
          React.createElement('div', { style: { marginBottom: 2 } },
            React.createElement('label', { style: labelStyle }, 'New Password'),
            React.createElement(PasswordInput, { value: newPassword, onChange: setNewPassword, placeholder: 'Leave blank to keep current password' })
          ),
          React.createElement('div', { style: { marginBottom: 2 } },
            React.createElement('label', { style: labelStyle }, 'Confirm New Password'),
            React.createElement(PasswordInput, { value: confirmPassword, onChange: setConfirmPassword, placeholder: 'Confirm New Password' })
          ),
          React.createElement('div', { style: { gridColumn: '1 / -1', color: '#666', fontSize: '13px' } },
            'Your current password is required to save any changes. Leave the New Password field blank to update only the username.'
          )
        ),

        React.createElement('div', { className: 'account-security-actions', style: { marginTop: 14 } },
          React.createElement('button', { type: 'submit', className: 'btn btn-primary', style: { marginRight: 8 } }, 'Save'),
          React.createElement('button', { type: 'button', className: 'btn btn-secondary', onClick: () => navigate(-1) }, 'Cancel')
        )
      )
    )
  )
}
