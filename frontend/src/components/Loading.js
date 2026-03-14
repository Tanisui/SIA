import React from 'react'

export default function Loading({ size = 'md', text = 'Loading...' }) {
  const sizeClass = size === 'sm' ? 'spinner-sm' : size === 'lg' ? 'spinner-lg' : ''
  
  return React.createElement('div', { className: 'loading' },
    React.createElement('div', { className: `spinner ${sizeClass}` }),
    text && React.createElement('span', null, text)
  )
}

export function LoadingPage() {
  return React.createElement('div', { style: { display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' } },
    React.createElement(Loading, { size: 'lg', text: 'Loading page...' })
  )
}

export function LoadingOverlay({ visible = true }) {
  if (!visible) return null
  return React.createElement('div', {
    style: {
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(255,255,255,0.8)',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 9999,
      backdropFilter: 'blur(2px)'
    }
  },
    React.createElement(Loading, { size: 'lg' })
  )
}
