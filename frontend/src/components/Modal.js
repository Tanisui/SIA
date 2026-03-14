import React, { useEffect } from 'react'

export default function Modal({ open = false, onClose, title, children, footer, size = 'md' }) {
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [open])

  if (!open) return null

  return React.createElement('div', { className: 'modal-backdrop', onClick: onClose },
    React.createElement('div', {
      className: 'modal',
      onClick: (e) => e.stopPropagation(),
      style: { maxWidth: size === 'sm' ? '400px' : size === 'lg' ? '700px' : '500px' }
    },
      React.createElement('div', { className: 'modal-header' },
        React.createElement('h2', null, title),
        React.createElement('button', {
          className: 'modal-close',
          onClick: onClose,
          title: 'Close'
        }, '✕')
      ),
      React.createElement('div', { className: 'modal-body' }, children),
      footer && React.createElement('div', { className: 'modal-footer' }, footer)
    )
  )
}

export function ConfirmModal({ open = false, onClose, title, message, onConfirm, loading = false, danger = false }) {
  return React.createElement(Modal, {
    open,
    onClose,
    title: title || 'Confirm',
    footer: React.createElement(React.Fragment, null,
      React.createElement('button', {
        className: 'btn btn-secondary',
        onClick: onClose,
        disabled: loading
      }, 'Cancel'),
      React.createElement('button', {
        className: `btn ${danger ? 'btn-danger' : 'btn-primary'}`,
        onClick: onConfirm,
        disabled: loading
      },
        loading ? '...' : 'Confirm'
      )
    )
  },
    React.createElement('p', { style: { marginBottom: 0, color: 'var(--text-mid)' } }, message)
  )
}
