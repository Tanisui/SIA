import React, { useState } from 'react'

export default function Tooltip({ children, text = '', position = 'top' }) {
  const [visible, setVisible] = useState(false)

  const positionStyles = {
    top: { bottom: '100%', left: '50%', transform: 'translateX(-50%)', marginBottom: '8px' },
    bottom: { top: '100%', left: '50%', transform: 'translateX(-50%)', marginTop: '8px' },
    left: { right: '100%', top: '50%', transform: 'translateY(-50%)', marginRight: '8px' },
    right: { left: '100%', top: '50%', transform: 'translateY(-50%)', marginLeft: '8px' }
  }

  const arrowStyles = {
    top: { top: '100%', left: '50%', transform: 'translateX(-50%)', borderTop: '6px solid var(--text-dark)' },
    bottom: { bottom: '100%', left: '50%', transform: 'translateX(-50%)', borderBottom: '6px solid var(--text-dark)' },
    left: { left: '100%', top: '50%', transform: 'translateY(-50%)', borderLeft: '6px solid var(--text-dark)' },
    right: { right: '100%', top: '50%', transform: 'translateY(-50%)', borderRight: '6px solid var(--text-dark)' }
  }

  return React.createElement('div', {
    style: { position: 'relative', display: 'inline-block' },
    onMouseEnter: () => setVisible(true),
    onMouseLeave: () => setVisible(false)
  },
    children,
    visible && React.createElement('div', {
      style: {
        position: 'absolute',
        ...positionStyles[position],
        background: 'var(--text-dark)',
        color: 'var(--white)',
        padding: '8px 12px',
        borderRadius: '6px',
        fontSize: '12px',
        whiteSpace: 'nowrap',
        zIndex: 1000,
        pointerEvents: 'none',
        boxShadow: 'var(--shadow-lg)'
      }
    },
      text,
      React.createElement('div', {
        style: {
          position: 'absolute',
          width: '0',
          height: '0',
          ...arrowStyles[position],
          borderLeft: '6px solid transparent',
          borderRight: '6px solid transparent',
          borderTop: '6px solid transparent',
          borderBottom: '6px solid transparent'
        }
      })
    )
  )
}

export function HelpIcon({ text = '' }) {
  return React.createElement(Tooltip, { text, position: 'top' },
    React.createElement('button', {
      style: {
        background: 'transparent',
        border: 'none',
        borderRadius: '50%',
        width: '20px',
        height: '20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'help',
        color: 'var(--text-light)',
        fontSize: '14px',
        fontWeight: 'bold'
      }
    }, '?')
  )
}
