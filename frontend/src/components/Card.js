import React from 'react'

export function Card({ children, className = '', ...props }) {
  return React.createElement('div', {
    className: `card ${className}`,
    ...props
  }, children)
}

export function CardHeader({ children, className = '' }) {
  return React.createElement('div', {
    className: `card-header ${className}`
  }, children)
}

export function CardBody({ children, className = '' }) {
  return React.createElement('div', {
    className: `card-body ${className}`,
    style: { padding: '24px' }
  }, children)
}

export function CardFooter({ children, className = '' }) {
  return React.createElement('div', {
    className: `card-footer ${className}`,
    style: {
      padding: '16px 24px',
      borderTop: '1px solid var(--border-light)',
      background: 'var(--cream-white)',
      display: 'flex',
      gap: '12px',
      justifyContent: 'flex-end'
    }
  }, children)
}

export function StatCard({ title, value, subtitle = '', icon = '', variant = 'default', loading = false }) {
  const variantStyles = {
    default: { color: 'var(--gold-dark)' },
    success: { color: 'var(--success)' },
    danger: { color: 'var(--error)' },
    warning: { color: 'var(--warning)' },
    info: { color: 'var(--info)' }
  }

  return React.createElement(Card, { className: 'stat-card' },
    React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' } },
      React.createElement('div', null,
        React.createElement('div', { className: 'card-title' }, title),
        React.createElement('div', {
          className: 'card-value',
          style: { color: variantStyles[variant].color }
        }, loading ? '...' : value),
        subtitle && React.createElement('div', { className: 'card-subtitle' }, subtitle)
      ),
      icon && React.createElement('span', { style: { fontSize: '32px', opacity: 0.5 } }, icon)
    )
  )
}

export function InfoCard({ title, message = '', icon = 'ℹ', type = 'info' }) {
  const typeStyles = {
    info: { bg: 'var(--info-light)', color: 'var(--info)', icon: 'ℹ' },
    success: { bg: 'var(--success-light)', color: 'var(--success)', icon: '✓' },
    warning: { bg: 'var(--warning-light)', color: 'var(--warning)', icon: '⚠' },
    error: { bg: 'var(--error-light)', color: 'var(--error)', icon: '✕' }
  }

  const style = typeStyles[type]

  return React.createElement(Card, {
    style: {
      background: style.bg,
      border: `1px solid ${style.color}50`,
      padding: '16px'
    }
  },
    React.createElement('div', { style: { display: 'flex', gap: '12px' } },
      React.createElement('span', { style: { fontSize: '20px', color: style.color, flexShrink: 0 } }, icon),
      React.createElement('div', null,
        React.createElement('div', { style: { fontWeight: '600', color: style.color } }, title),
        message && React.createElement('div', { style: { fontSize: '13px', marginTop: '6px', color: style.color } }, message)
      )
    )
  )
}
