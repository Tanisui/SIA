import React, { useState, useRef, useEffect } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { logout } from '../store/authSlice.js'

export default function Header() {
  const dispatch = useDispatch()
  const user = useSelector(s => s.auth.user)
  const [open, setOpen] = useState(false)
  const popRef = useRef()

  useEffect(() => {
    function onDoc(e) {
      if (!popRef.current) return
      if (!popRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('click', onDoc)
    return () => document.removeEventListener('click', onDoc)
  }, [])

  return React.createElement('header', { className: 'header' },
    React.createElement('div', { className: 'header-brand' }, "Cecille's N'Style"),
    React.createElement('div', { className: 'header-right' },
      user && React.createElement('span', { className: 'header-user' },
        `Hi, ${user.full_name || user.username}`
      ),
      user && React.createElement('div', { style: { position: 'relative' } },
        React.createElement('button', {
          className: 'btn-notif',
          onClick: (e) => { e.stopPropagation(); setOpen(v => !v) },
          title: 'Notifications'
        }, '🔔'),
        open && React.createElement('div', { ref: popRef, className: 'notif-popover' },
          React.createElement('div', { className: 'notif-header' }, 'Notifications'),
          React.createElement('div', { className: 'notif-item text-muted' }, 'No new notifications'),
          React.createElement('div', { className: 'notif-item text-muted' }, 'System is running normally')
        )
      ),
      React.createElement('button', {
        className: 'btn-signout',
        onClick: () => dispatch(logout())
      }, 'Sign out')
    )
  )
}