import React from 'react'
import { useNavigate } from 'react-router-dom'
import Icon from '../components/Icons'

export default function Unauthorized() {
  const navigate = useNavigate()

  return React.createElement('div', { className: 'unauthorized-page' },
    React.createElement('div', { className: 'unauthorized-container' },
      React.createElement('div', { className: 'unauthorized-icon' },
        React.createElement(Icon, { name: 'account', size: 64 })
      ),
      React.createElement('h1', null, 'Access Denied'),
      React.createElement('p', { className: 'unauthorized-message' },
        "You don't have permission to access this resource."
      ),
      React.createElement('p', { className: 'unauthorized-subtext' },
        'Contact your administrator if you believe this is an error.'
      ),
      React.createElement('button', {
        className: 'btn btn-primary',
        onClick: () => navigate('/')
      }, 'Go to Dashboard')
    ),
    React.createElement('style', null, `
      .unauthorized-page {
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 100vh;
        background: linear-gradient(135deg, var(--bg-secondary) 0%, var(--bg-primary) 100%);
        padding: 1rem;
      }
      .unauthorized-container {
        text-align: center;
        background: white;
        border-radius: 12px;
        padding: 3rem 2rem;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
        max-width: 400px;
      }
      .unauthorized-icon {
        margin-bottom: 1.5rem;
        color: var(--danger);
      }
      .unauthorized-page h1 {
        font-size: 1.75rem;
        font-weight: 700;
        color: var(--text-primary);
        margin-bottom: 0.5rem;
      }
      .unauthorized-message {
        color: var(--text-secondary);
        margin-bottom: 1rem;
        line-height: 1.5;
      }
      .unauthorized-subtext {
        font-size: 0.875rem;
        color: var(--text-tertiary);
        margin-bottom: 2rem;
      }
      .btn {
        display: inline-block;
        padding: 0.75rem 1.5rem;
        border-radius: 6px;
        border: none;
        cursor: pointer;
        font-weight: 600;
        transition: all 0.2s ease;
      }
      .btn-primary {
        background: var(--primary);
        color: white;
      }
      .btn-primary:hover {
        opacity: 0.9;
        transform: translateY(-2px);
      }
    `)
  )
}
