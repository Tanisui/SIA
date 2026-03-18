import React, { useState } from 'react';
import api from '../api/api.js';

function PasswordInput({ value, onChange, placeholder }) {
  const [show, setShow] = useState(false);
  return React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
    React.createElement('input', {
      value: value || '',
      onChange: (e) => onChange(e.target.value),
      type: show ? 'text' : 'password',
      placeholder: placeholder || '',
      style: { flex: 1, width: '100%', padding: 8, border: '1px solid #ddd', borderRadius: 4 }
    }),
    React.createElement('button', {
      type: 'button',
      onClick: () => setShow((s) => !s),
      style: { padding: '6px 8px', cursor: 'pointer', border: '1px solid #ddd', borderRadius: 4, background: '#fff', fontSize: '12px' }
    }, show ? 'Hide' : 'Show')
  );
}

export default function ChangePassword() {
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const labelStyle = { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, fontSize: '13.5px', fontWeight: 600 };

  const handleSubmit = async (e) => {
    if (e) e.preventDefault(); // Stop page refresh
    setMessage('');
    setError('');

    if (newPassword !== confirmPassword) {
      setError('New passwords do not match!');
      return;
    }

    try {
      const res = await api.post('/auth/change-password', { oldPassword, newPassword });
      setMessage(res.data.message || 'Password changed successfully!');
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      // Capture the error message from the backend (e.g., "Incorrect current password")
      const errorMsg = err.response?.data?.error || err.response?.data?.message || 'Failed to change password.';
      setError(errorMsg);
      
      // We explicitly DO NOT redirect here so the user stays on the page
    }
  };

  return React.createElement('div', { className: 'page' },
    React.createElement('div', { className: 'card', style: { marginTop: 20 } },
      React.createElement('h3', { style: { marginBottom: 6 } }, 'Create'),
      React.createElement('p', { style: { marginBottom: 14, color: '#666', fontSize: '13.5px' } }, 'Account Security Update'),

      // Alerts that will now show properly without redirecting
      message && React.createElement('div', { style: { color: '#155724', backgroundColor: '#d4edda', padding: '10px', borderRadius: '4px', marginBottom: '15px', fontSize: '13px' } }, message),
      error && React.createElement('div', { style: { color: '#721c24', backgroundColor: '#f8d7da', padding: '10px', borderRadius: '4px', marginBottom: '15px', fontSize: '13px' } }, error),

      React.createElement('form', { onSubmit: handleSubmit },
        React.createElement('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(220px, 1fr))', gap: 12 } },
          React.createElement('div', { style: { marginBottom: 2 } },
            React.createElement('label', { style: labelStyle }, 'Current Password'),
            React.createElement(PasswordInput, { value: oldPassword, onChange: setOldPassword, placeholder: 'Current Password' })
          ),
          React.createElement('div', { style: { marginBottom: 2 } },
            React.createElement('label', { style: labelStyle }, 'New Password'),
            React.createElement(PasswordInput, { value: newPassword, onChange: setNewPassword, placeholder: 'New Password' })
          ),
          React.createElement('div', { style: { marginBottom: 2 } },
            React.createElement('label', { style: labelStyle }, 'Confirm New Password'),
            React.createElement(PasswordInput, { value: confirmPassword, onChange: setConfirmPassword, placeholder: 'Confirm New Password' })
          )
        ),

        React.createElement('div', { style: { marginTop: 14 } },
          React.createElement('button', { type: 'submit', className: 'btn btn-primary', style: { marginRight: 8 } }, 'Save'),
          React.createElement('button', { type: 'button', className: 'btn btn-secondary', onClick: () => window.history.back() }, 'Cancel')
        )
      )
    )
  );
}