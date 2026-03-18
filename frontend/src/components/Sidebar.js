import React from 'react'
import { NavLink } from 'react-router-dom'
import { useSelector } from 'react-redux'

const NAV_ITEMS = [
  { section: 'Main' },
  { to: '/',             label: 'Dashboard',  end: true,  icon: '⊞',  perm: null },
  { section: 'Store' },
  { to: '/categories',   label: 'Categories', icon: '🏷',  perm: 'products.view' },
  { to: '/inventory',    label: 'Inventory',  icon: '📦',  perm: 'inventory.view' },
  { to: '/sales',        label: 'Sales',      icon: '🧾',  perm: 'sales.view' },
  { to: '/customers',    label: 'Customers',  icon: '👤',  perm: 'customers.view' },
  { to: '/purchasing',   label: 'Purchasing', icon: '🛒',  perm: 'purchasing.view' },
  { section: 'People' },
  { to: '/payroll',      label: 'Payroll',    icon: '💰',  perm: 'payroll.view' },
  { to: '/attendance',   label: 'Attendance', icon: '🕐',  perm: 'attendance.view' },
  { section: 'Finance' },
  { to: '/reports',      label: 'Reports',    icon: '📈',  perm: 'reports.view' },
  { section: 'System' },
  { to: '/users',        label: 'Users & Employees',      icon: '🔑',  perm: 'users.view' },
  { to: '/roles',        label: 'Roles',      icon: '🛡',  perm: 'roles.view' },
  { to: '/audit',        label: 'Audit',      icon: '📋',  perm: 'system.audit.view' },
  // Added Account section for user settings
  { section: 'Account' },
  { to: '/change-password', label: 'Change Password', icon: '🔒', perm: null },
]

export default function Sidebar() {
  const permissions = useSelector(s =>
    s.auth && s.auth.permissions
      ? s.auth.permissions
      : JSON.parse(localStorage.getItem('permissions') || '[]')
  )

  const can = (perm) => {
    if (!perm) return true
    if (!permissions) return false
    if (permissions.includes('admin.*')) return true
    return permissions.includes(perm)
  }

  return React.createElement('aside', { className: 'sidebar' },
    // Logo
    React.createElement('div', { className: 'sidebar-logo' },
      React.createElement('span', null, "Cecille's N'Style"),
      React.createElement('small', null, 'POS System')
    ),
    // Nav
    React.createElement('nav', null,
      React.createElement('ul', null,
        NAV_ITEMS.map((item, i) => {
          if (item.section) {
            return React.createElement('li', { key: `section-${i}` },
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
              React.createElement('span', { style: { fontSize: 15, width: 20, textAlign: 'center' } }, item.icon),
              item.label
            )
          )
        })
      )
    )
  )
}