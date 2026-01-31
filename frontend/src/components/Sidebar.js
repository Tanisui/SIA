import React from 'react'
import { NavLink } from 'react-router-dom'
import { useSelector } from 'react-redux'

export default function Sidebar() {
  const permissions = useSelector(s => s.auth && s.auth.permissions ? s.auth.permissions : JSON.parse(localStorage.getItem('permissions') || '[]'))

  const can = (perm) => {
    if (!permissions) return false
    if (permissions.includes('admin.*')) return true
    return permissions.includes(perm)
  }

  return (
    React.createElement('aside', { style: { width: 220, borderRight: '1px solid #eee', padding: 12 } },
      React.createElement('nav', null,
        React.createElement('ul', { style: { listStyle: 'none', padding: 0 } },
          React.createElement('li', null, React.createElement(NavLink, { to: '/', end: true }, 'Dashboard')),
          can('users.view') && React.createElement('li', null, React.createElement(NavLink, { to: '/users' }, 'Users')),
          can('roles.view') && React.createElement('li', null, React.createElement(NavLink, { to: '/roles' }, 'Roles')),
          can('products.view') && React.createElement('li', null, React.createElement(NavLink, { to: '/products' }, 'Products')),
          can('inventory.view') && React.createElement('li', null, React.createElement(NavLink, { to: '/inventory' }, 'Inventory')),
          can('sales.view') && React.createElement('li', null, React.createElement(NavLink, { to: '/sales' }, 'Sales')),
          can('customers.view') && React.createElement('li', null, React.createElement(NavLink, { to: '/customers' }, 'Customers')),
          can('purchase.view') && React.createElement('li', null, React.createElement(NavLink, { to: '/purchasing' }, 'Purchasing')),
          can('employees.view') && React.createElement('li', null, React.createElement(NavLink, { to: '/employees' }, 'Employees')),
          can('payroll.view') && React.createElement('li', null, React.createElement(NavLink, { to: '/payroll' }, 'Payroll')),
          can('finance.reports.view') && React.createElement('li', null, React.createElement(NavLink, { to: '/accounting' }, 'Accounting')),
          can('reports.view') && React.createElement('li', null, React.createElement(NavLink, { to: '/reports' }, 'Reports')),
          can('system.audit.view') && React.createElement('li', null, React.createElement(NavLink, { to: '/audit' }, 'Audit')),
          can('attendance.view') && React.createElement('li', null, React.createElement(NavLink, { to: '/attendance' }, 'Attendance'))
        )
      )
    )
  )
}
