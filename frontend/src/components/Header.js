import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { logoutUser } from '../store/authSlice.js'
import api from '../api/api.js'
import Icon from './Icons.js'

function getInitials(text) {
  const trimmed = String(text || '').trim()
  if (!trimmed) return '·'
  const parts = trimmed.split(/\s+/).filter(Boolean)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function formatTimeAgo(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const diff = Date.now() - date.getTime()
  if (diff < 60_000) return 'Just now'
  const m = Math.floor(diff / 60_000)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d}d ago`
  return date.toLocaleDateString('en-PH', { month: 'short', day: '2-digit' })
}

function notifTitle(n) {
  if (n.title) return n.title
  if (n.type === 'payroll.released') return 'Payslip available'
  if (n.type === 'low_stock') return 'Low stock alert'
  if (n.type === 'sales_return') return 'Sales return processed'
  return 'Notification'
}

function notifBody(n) {
  if (n.body) return n.body
  if (n.payload && typeof n.payload === 'object') {
    return Object.entries(n.payload)
      .filter(([k]) => !['_meta'].includes(k))
      .map(([k, v]) => `${k}: ${v}`)
      .join(' · ')
  }
  return ''
}

export default function Header({ onMenuToggle }) {
  const dispatch = useDispatch()
  const user = useSelector((state) => state.auth.user)
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState([])
  const [unread, setUnread] = useState(0)
  const [loading, setLoading] = useState(false)
  const popRef = useRef()

  const roles = Array.isArray(user?.roles) ? user.roles : []
  const roleLabel = roles.length > 0 ? roles[0] : null
  const displayName = user?.full_name || user?.username || ''
  const initials = useMemo(() => getInitials(displayName), [displayName])

  const fetchUnreadCount = useCallback(async () => {
    if (!user) return
    try {
      const res = await api.get('/notifications/unread-count')
      setUnread(Number(res.data?.unread || 0))
    } catch {
      /* silent */
    }
  }, [user])

  const fetchItems = useCallback(async () => {
    if (!user) return
    try {
      setLoading(true)
      const res = await api.get('/notifications?limit=15')
      setItems(Array.isArray(res.data) ? res.data : [])
    } catch {
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [user])

  // Poll unread count every 60s when signed in.
  useEffect(() => {
    if (!user) {
      setUnread(0); setItems([])
      return
    }
    fetchUnreadCount()
    const id = window.setInterval(fetchUnreadCount, 60_000)
    const onFocus = () => fetchUnreadCount()
    window.addEventListener('focus', onFocus)
    return () => {
      window.clearInterval(id)
      window.removeEventListener('focus', onFocus)
    }
  }, [user, fetchUnreadCount])

  // Click-away
  useEffect(() => {
    function onDocumentClick(event) {
      if (!popRef.current) return
      if (!popRef.current.contains(event.target)) setOpen(false)
    }
    document.addEventListener('click', onDocumentClick)
    return () => document.removeEventListener('click', onDocumentClick)
  }, [])

  const onToggleBell = useCallback((event) => {
    event.stopPropagation()
    setOpen((value) => {
      const next = !value
      if (next) fetchItems()
      return next
    })
  }, [fetchItems])

  const handleItemClick = useCallback(async (item) => {
    if (!item || item.read_at) return
    try {
      await api.post(`/notifications/${item.id}/read`)
      setItems((prev) => prev.map((n) => (n.id === item.id ? { ...n, read_at: new Date().toISOString() } : n)))
      setUnread((prev) => Math.max(0, prev - 1))
    } catch { /* ignore */ }
  }, [])

  const handleMarkAllRead = useCallback(async () => {
    try {
      await api.post('/notifications/read-all')
      setItems((prev) => prev.map((n) => ({ ...n, read_at: n.read_at || new Date().toISOString() })))
      setUnread(0)
    } catch { /* ignore */ }
  }, [])

  return React.createElement('header', { className: 'header topbar' },
    React.createElement('div', { className: 'topbar-left' },
      React.createElement('button', {
        type: 'button',
        className: 'topbar-toggle',
        'aria-label': 'Toggle sidebar',
        onClick: onMenuToggle
      }, React.createElement(Icon, { name: 'menu', size: 20 }))
    ),
    React.createElement('div', { className: 'header-right topbar-right' },
      user && React.createElement('div', { className: 'header-user-pill' },
        React.createElement('div', { className: 'header-user-avatar', 'aria-hidden': 'true' }, initials),
        React.createElement('div', { className: 'header-user-meta' },
          React.createElement('span', { className: 'header-user-name' }, displayName || 'User'),
          roleLabel && React.createElement('span', { className: 'header-user-role' }, roleLabel)
        )
      ),
      user && React.createElement('div', { className: 'notif-wrap', ref: popRef },
        React.createElement('button', {
          type: 'button',
          className: 'btn-notif',
          onClick: onToggleBell,
          title: 'Notifications',
          'aria-label': `Notifications${unread > 0 ? ` (${unread} unread)` : ''}`
        },
          React.createElement(Icon, { name: 'bell', size: 18 }),
          unread > 0 && React.createElement('span', { className: 'notif-badge' }, unread > 99 ? '99+' : unread)
        ),
        open && React.createElement('div', { className: 'notif-popover' },
          React.createElement('div', { className: 'notif-pop-header' },
            React.createElement('span', { className: 'notif-pop-title' }, 'Notifications'),
            unread > 0 && React.createElement('button', {
              type: 'button',
              className: 'notif-pop-action',
              onClick: handleMarkAllRead
            }, 'Mark all read')
          ),
          React.createElement('div', { className: 'notif-pop-list' },
            loading && items.length === 0 ?
              React.createElement('div', { className: 'notif-pop-empty' }, 'Loading…') :
            items.length === 0 ?
              React.createElement('div', { className: 'notif-pop-empty' },
                React.createElement('div', { className: 'notif-pop-empty-icon' },
                  React.createElement(Icon, { name: 'bell', size: 22 })
                ),
                React.createElement('div', null, 'You\'re all caught up.'),
                React.createElement('div', { className: 'notif-pop-empty-sub' }, 'No notifications yet.')
              ) :
              items.map((n) => React.createElement('button', {
                key: n.id,
                type: 'button',
                className: `notif-pop-item ${!n.read_at ? 'is-unread' : ''}`,
                onClick: () => handleItemClick(n)
              },
                React.createElement('span', { className: 'notif-pop-dot', 'aria-hidden': 'true' }),
                React.createElement('span', { className: 'notif-pop-content' },
                  React.createElement('span', { className: 'notif-pop-row-title' }, notifTitle(n)),
                  notifBody(n) && React.createElement('span', { className: 'notif-pop-row-body' }, notifBody(n)),
                  React.createElement('span', { className: 'notif-pop-row-meta' }, formatTimeAgo(n.created_at || n.sent_at))
                )
              ))
          )
        )
      ),
      React.createElement('button', {
        type: 'button',
        className: 'btn-signout',
        onClick: () => dispatch(logoutUser()),
        title: 'Sign out'
      },
        React.createElement(Icon, { name: 'signOut', size: 16 }),
        React.createElement('span', { className: 'btn-signout-label' }, 'Sign Out')
      )
    )
  )
}
