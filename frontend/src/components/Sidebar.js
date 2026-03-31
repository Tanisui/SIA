import React from 'react'
import { NavLink } from 'react-router-dom'
import { useSelector } from 'react-redux'

const NAV_ITEMS = [
  { section: 'Main' },
  { to: '/', label: 'Dashboard', end: true, icon: '\u229e', perm: null },
  { section: 'Store' },
  { to: '/categories', label: 'Categories', icon: '\ud83c\udff7', perm: 'products.view' },
  { to: '/inventory', label: 'Inventory', icon: '\ud83d\udce6', perm: 'inventory.view' },
  { to: '/sales', label: 'Sales', icon: '\ud83e\uddfe', perm: ['sales.view', 'sales.create'] },
  { to: '/purchasing', label: 'Bales', icon: '\ud83d\uded2', perm: ['inventory.view', 'inventory.receive', 'reports.view', 'finance.reports.view'] },
  { section: 'Finance' },
  { to: '/reports', label: 'Reports', icon: '\ud83d\udcc8', perm: ['reports.view', 'finance.reports.view'] },
  { section: 'System' },
  { to: '/users', label: 'Users', icon: '\ud83d\udd11', perm: 'users.view' },
  { to: '/roles', label: 'Roles', icon: '\ud83d\udee1', perm: 'roles.view' },
  { to: '/audit', label: 'Audit', icon: '\ud83d\udccb', perm: 'system.audit.view' },
  { section: 'Account' },
  { to: '/change-password', label: 'Change Password', icon: '\ud83d\udd12', perm: null }
]

export default function Sidebar() {
  const permissions = useSelector((state) =>
    state.auth && state.auth.permissions
      ? state.auth.permissions
      : JSON.parse(localStorage.getItem('permissions') || '[]')
  )

  const can = (perm) => {
    if (!perm) return true
    if (!permissions) return false
    if (Array.isArray(perm)) return perm.some((entry) => can(entry))
    if (permissions.includes('admin.*')) return true
    return permissions.includes(perm)
  }

  return React.createElement('aside', { className: 'sidebar' },
    React.createElement('div', { className: 'sidebar-logo' },
      React.createElement('span', null, "Cecille's N'Style"),
      React.createElement('small', null, 'POS System')
    ),
    React.createElement('nav', null,
      React.createElement('ul', null,
        NAV_ITEMS.map((item, index) => {
          if (item.section) {
            return React.createElement('li', { key: `section-${index}` },
              React.createElement('div', { className: 'sidebar-section' }, item.section)
            )
          }
          if (!can(item.perm)) return null
          return React.createElement('li', { key: item.to },
            React.createElement(NavLink, {
              to: item.to,
              end: item.end || false,
              className: ({ isActive }) => isActive ? 'active' : ''
            },
            React.createElement('span', {
              style: {
                fontSize: 15,
                width: 20,
                textAlign: 'center',
                display: 'inline-flex',
                justifyContent: 'center',
                flexShrink: 0
              }
            }, item.icon),
            item.label)
          )
        })
      )
    )
  )
}
