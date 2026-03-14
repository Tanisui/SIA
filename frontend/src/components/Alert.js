import React, { useState, useEffect } from 'react'

export default function Alert({ type = 'info', message, onClose, autoClose = true, duration = 5000 }) {
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    if (!autoClose || !visible) return
    const timer = setTimeout(() => {
      setVisible(false)
      onClose?.()
    }, duration)
    return () => clearTimeout(timer)
  }, [autoClose, duration, visible, onClose])

  if (!visible) return null

  const icons = {
    success: '✓',
    error: '✕',
    warning: '⚠',
    info: 'ℹ'
  }

  return React.createElement('div', {
    className: `${type}-msg`,
    style: { animation: 'slideInLeft 0.3s ease-out' }
  },
    React.createElement('span', null, icons[type]),
    React.createElement('span', null, message),
    onClose && React.createElement('button', {
      onClick: () => {
        setVisible(false)
        onClose()
      },
      style: {
        background: 'transparent',
        border: 'none',
        color: 'inherit',
        cursor: 'pointer',
        marginLeft: 'auto',
        fontSize: '18px',
        padding: '0 6px'
      }
    }, '✕')
  )
}

export function AlertContainer({ alerts, onRemove }) {
  return React.createElement('div', {
    style: {
      position: 'fixed',
      top: '80px',
      right: '20px',
      zIndex: 2000,
      maxWidth: '400px',
      display: 'flex',
      flexDirection: 'column',
      gap: '12px'
    }
  },
    alerts.map((alert, i) =>
      React.createElement(Alert, {
        key: i,
        type: alert.type,
        message: alert.message,
        autoClose: alert.autoClose !== false,
        duration: alert.duration || 5000,
        onClose: () => onRemove(i)
      })
    )
  )
}
