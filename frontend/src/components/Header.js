import React, { useEffect, useRef, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { logoutUser } from '../store/authSlice.js'

export default function Header({ onMenuToggle }) {
  const dispatch = useDispatch()
  const user = useSelector((state) => state.auth.user)
  const [open, setOpen] = useState(false)
  const popRef = useRef()

  useEffect(() => {
    function onDocumentClick(event) {
      if (!popRef.current) return
      if (!popRef.current.contains(event.target)) setOpen(false)
    }
    document.addEventListener('click', onDocumentClick)
    return () => document.removeEventListener('click', onDocumentClick)
  }, [])

  return React.createElement('header', { className: 'header topbar' },
    React.createElement('div', { className: 'topbar-left' },
      React.createElement('button', {
        type: 'button',
        className: 'topbar-toggle',
        'aria-label': 'Toggle sidebar',
        onClick: onMenuToggle
      }, 'Menu')
    ),
    React.createElement('div', { className: 'header-right topbar-right' },
      user && React.createElement('span', { className: 'header-user topbar-user' },
        user.full_name || user.username
      ),
      user && React.createElement('div', { className: 'notif-wrap' },
        React.createElement('button', {
          type: 'button',
          className: 'btn-notif',
          onClick: (event) => {
            event.stopPropagation()
            setOpen((value) => !value)
          },
          title: 'Notifications',
          'aria-label': 'Notifications'
        }, 'Alerts'),
        open && React.createElement('div', { ref: popRef, className: 'notif-popover' },
          React.createElement('div', { className: 'notif-header' }, 'Notifications'),
          React.createElement('div', { className: 'notif-item text-muted' }, 'No new notifications'),
          React.createElement('div', { className: 'notif-item text-muted' }, 'System is running normally')
        )
      ),
      React.createElement('button', {
        type: 'button',
        className: 'btn-signout',
        onClick: () => dispatch(logoutUser())
      }, 'Sign out')
    )
  )
}
