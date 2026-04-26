import React, { useEffect, useMemo, useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useSelector } from 'react-redux'
import cecilleLogo from '../assets/cecille-logo.png'
import Icon from './Icons.js'

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', end: true, icon: 'dashboard', perm: null },
  { section: 'Operations' },
  { to: '/categories', label: 'Categories', icon: 'categories', perm: 'products.view' },
  { to: '/suppliers',  label: 'Suppliers',  icon: 'suppliers',  perm: 'suppliers.view' },
  {
    to: '/inventory',
    label: 'Inventory',
    icon: 'inventory',
    perm: 'inventory.view',
    children: [
      { to: '/inventory', tab: 'overview',       label: 'Overview' },
      { to: '/inventory', tab: 'stock-in',       label: 'Stock In' },
      { to: '/inventory', tab: 'stock-out',      label: 'Stock Out' },
      { to: '/inventory', tab: 'products',       label: 'Products' },
      { to: '/inventory', tab: 'barcode-labels', label: 'Barcode Labels' },
      { to: '/inventory', tab: 'transactions',   label: 'Transactions' },
      { to: '/inventory', tab: 'damaged',        label: 'Damaged' },
      { to: '/inventory', tab: 'low-stock',      label: 'Low Stock Alerts' },
      { to: '/inventory', tab: 'shrinkage',      label: 'Shrinkage' },
      { to: '/inventory', tab: 'reports',        label: 'Reports' }
    ]
  },
  { to: '/sales',      label: 'Sales',      icon: 'sales',      perm: ['sales.view', 'sales.create'] },
  { to: '/customers',  label: 'Customers',  icon: 'customers',  perm: 'customers.view' },
  { to: '/attendance', label: 'Attendance', icon: 'attendance', perm: null },
  {
    to: '/purchasing',
    label: 'Purchasing',
    icon: 'purchasing',
    perm: ['inventory.view', 'inventory.receive', 'reports.view', 'finance.reports.view'],
    children: [
      { to: '/bale-purchase-order', label: 'Purchase Orders' },
      { to: '/purchasing', tab: 'bale-breakdowns', label: 'Bale Breakdown' }
    ]
  },
  { section: 'Insights' },
  {
    to: '/reports',
    label: 'Reports',
    icon: 'reports',
    perm: ['reports.view', 'finance.reports.view'],
    children: [
      { to: '/reports', tab: 'directPurchases',     label: 'Direct Purchases' },
      { to: '/reports', tab: 'balePurchases',       label: 'Bale Purchases' },
      { to: '/reports', tab: 'baleBreakdowns',      label: 'Bale Breakdown' },
      { to: '/reports', tab: 'salesByBale',         label: 'Sales by Bale' },
      { to: '/reports', tab: 'baleProfitability',   label: 'Bale Profitability' },
      { to: '/reports', tab: 'supplierPerformance', label: 'Supplier Performance' },
      { to: '/reports', tab: 'inventoryMovement',   label: 'Inventory Movement' }
    ]
  },
  {
    to: '/payroll',
    label: 'Payroll',
    icon: 'payroll',
    perm: [
      'payroll.view', 'payroll.profile.view', 'payroll.period.view',
      'payroll.period.compute', 'payroll.report.view', 'payroll.payslip.view_own'
    ],
    children: [
      { to: '/payroll/my-payslips', label: 'My Payslips',        perm: null },
      { to: '/payroll/dtr',         label: 'Daily Time Record',  perm: null },
      // Admin-only operational pages — non-admin only sees their own statuses.
      { to: '/payroll/periods',     label: 'Periods',  perm: 'admin.*' },
      { to: '/payroll/profiles',    label: 'Profiles', perm: 'admin.*' },
      { to: '/payroll/reports',     label: 'Reports',  perm: 'admin.*' }
    ]
  },
  { section: 'Admin' },
  { to: '/users',            label: 'Users',            icon: 'users',    perm: 'users.view' },
  { to: '/roles',            label: 'Roles',            icon: 'roles',    perm: 'roles.view' },
  { to: '/settings',         label: 'Settings',         icon: 'settings', perm: 'system.config.update' },
  { to: '/audit',            label: 'Audit',            icon: 'audit',    perm: 'system.audit.view' },
  { to: '/account-security', label: 'Account Security', icon: 'account',  perm: null }
]

function buildChildTarget(child) {
  if (!child?.tab) return child.to
  return `${child.to}?tab=${encodeURIComponent(child.tab)}`
}

export default function Sidebar({ mobileOpen = false, onNavigate, collapsed = false, onToggleCollapse }) {
  const location = useLocation()
  const navigate = useNavigate()
  const [openMenus, setOpenMenus] = useState({})

  const reduxPermissions = useSelector((state) => state.auth?.permissions)
  const storedPermissions = useMemo(() => {
    try { return JSON.parse(localStorage.getItem('permissions') || '[]') } catch { return [] }
  }, [])
  const permissions = Array.isArray(reduxPermissions) ? reduxPermissions : storedPermissions

  const can = (perm) => {
    if (!perm) return true
    if (!permissions) return false
    if (Array.isArray(perm)) return perm.some((entry) => can(entry))
    if (permissions.includes('admin.*')) return true
    return permissions.includes(perm)
  }

  const visibleItems = useMemo(
    () => NAV_ITEMS.filter((item) => item.section || can(item.perm)),
    [permissions]
  )

  const currentTab = useMemo(() => {
    const params = new URLSearchParams(location.search)
    const searchTab = String(params.get('tab') || '').trim()
    if (searchTab) return searchTab
    return String(location.hash || '').replace(/^#/, '')
  }, [location.hash, location.search])

  const isParentRouteActive = (item) => {
    if (!item.children) return false
    if (location.pathname === item.to) return true
    return item.children.some((child) => child.to === location.pathname)
  }

  // Auto-open the parent of the current route so users land in context.
  useEffect(() => {
    const activeParent = visibleItems.find((item) => !item.section && isParentRouteActive(item))
    if (!activeParent) return
    setOpenMenus((prev) => prev[activeParent.to] ? prev : { ...prev, [activeParent.to]: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, visibleItems])

  const toggleMenu = (menuKey) => {
    setOpenMenus((prev) => ({ ...prev, [menuKey]: !prev[menuKey] }))
  }

  const isChildActive = (child) => {
    if (location.pathname !== child.to) return false
    if (!child.tab) return true
    return currentTab === child.tab
  }

  const sidebarClass = [
    'sidebar',
    mobileOpen ? 'is-open' : '',
    collapsed ? 'is-collapsed' : ''
  ].filter(Boolean).join(' ')

  return React.createElement('aside', { className: sidebarClass },
    React.createElement('div', { className: 'sidebar-logo' },
      React.createElement('img', {
        src: cecilleLogo,
        alt: "Cecille N'Style Logo",
        className: 'sidebar-brand-image'
      }),
      !collapsed && React.createElement('div', { className: 'sidebar-brand-text' },
        React.createElement('span', null, "Cecille's N'Style"),
        React.createElement('small', null, 'POS SYSTEM')
      )
    ),
    React.createElement('nav', { className: 'sidebar-nav-wrap' },
      React.createElement('ul', { className: 'sidebar-nav' },
        visibleItems.map((item, index) => {
          if (item.section) {
            if (collapsed) {
              return React.createElement('li', { key: `section-${index}`, className: 'sidebar-section-divider', 'aria-hidden': 'true' })
            }
            return React.createElement('li', { key: `section-${index}` },
              React.createElement('div', { className: 'sidebar-section' }, item.section)
            )
          }

          if (item.children) {
            const visibleChildren = item.children.filter((child) => can(child.perm))
            if (!visibleChildren.length) {
              // Parent has children but the user can't see any of them — render as a plain link.
              return React.createElement('li', { key: item.to },
                React.createElement(NavLink, {
                  to: item.to,
                  title: collapsed ? item.label : undefined,
                  className: ({ isActive }) => isActive ? 'sidebar-link active' : 'sidebar-link',
                  onClick: () => { if (onNavigate) onNavigate() }
                },
                  React.createElement('span', { className: 'sidebar-link-icon', 'aria-hidden': 'true' },
                    React.createElement(Icon, { name: item.icon, size: 18 })
                  ),
                  React.createElement('span', { className: 'sidebar-link-text' }, item.label)
                )
              )
            }
            const menuOpen   = Boolean(openMenus[item.to])
            const parentActive = isParentRouteActive(item)
            const submenuId  = `sidebar-submenu-${item.to.replace(/[^a-z0-9]/gi, '-').replace(/^-+|-+$/g, '')}`
            const parentClasses = [
              'sidebar-link',
              'sidebar-link-parent',
              parentActive ? 'active' : '',
              menuOpen ? 'is-open' : ''
            ].filter(Boolean).join(' ')

            return React.createElement('li', { key: item.to, className: 'sidebar-has-children' },
              React.createElement('div', { className: parentClasses },
                React.createElement('button', {
                  type: 'button',
                  className: 'sidebar-parent-main',
                  title: collapsed ? item.label : undefined,
                  onClick: () => {
                    if (collapsed) {
                      // In icon-only mode, clicking the icon just navigates.
                      const target = visibleChildren.length ? buildChildTarget(visibleChildren[0]) : item.to
                      navigate(target)
                      if (onNavigate) onNavigate()
                      return
                    }
                    // Full mode: clicking the row navigates AND ensures the menu is open.
                    const target = visibleChildren.length ? buildChildTarget(visibleChildren[0]) : item.to
                    navigate(target)
                    setOpenMenus((prev) => ({ ...prev, [item.to]: true }))
                    if (onNavigate) onNavigate()
                  }
                },
                  React.createElement('span', { className: 'sidebar-link-icon', 'aria-hidden': 'true' },
                    React.createElement(Icon, { name: item.icon, size: 18 })
                  ),
                  React.createElement('span', { className: 'sidebar-link-text' }, item.label)
                ),
                !collapsed && React.createElement('button', {
                  type: 'button',
                  className: `sidebar-parent-toggle ${menuOpen ? 'is-open' : ''}`,
                  onClick: () => toggleMenu(item.to),
                  'aria-label': `${menuOpen ? 'Collapse' : 'Expand'} ${item.label}`,
                  'aria-expanded': menuOpen,
                  'aria-controls': submenuId
                },
                  React.createElement('span', {
                    className: `sidebar-chevron ${menuOpen ? 'is-open' : ''}`,
                    'aria-hidden': 'true'
                  })
                )
              ),
              // Inline submenu (only when sidebar is expanded)
              !collapsed && menuOpen && React.createElement('div', { className: 'sidebar-submenu', id: submenuId },
                React.createElement('div', { className: 'sidebar-submenu-title' }, `${item.label} sections`),
                visibleChildren.map((child) =>
                  React.createElement(NavLink, {
                    key: `${child.to}-${child.tab || child.label}`,
                    to: buildChildTarget(child),
                    className: isChildActive(child) ? 'sidebar-submenu-link active' : 'sidebar-submenu-link',
                    onClick: () => { if (onNavigate) onNavigate() }
                  }, child.label)
                )
              ),
              // Hover flyout (only when sidebar is icon-only)
              collapsed && React.createElement('div', { className: 'sidebar-flyout', role: 'menu', 'aria-label': item.label },
                React.createElement('div', { className: 'sidebar-flyout-title' }, item.label),
                visibleChildren.map((child) =>
                  React.createElement(NavLink, {
                    key: `flyout-${child.to}-${child.tab || child.label}`,
                    to: buildChildTarget(child),
                    className: isChildActive(child) ? 'sidebar-flyout-link active' : 'sidebar-flyout-link',
                    onClick: () => { if (onNavigate) onNavigate() }
                  }, child.label)
                )
              )
            )
          }

          return React.createElement('li', { key: item.to },
            React.createElement(NavLink, {
              to: item.to,
              end: item.end || false,
              title: collapsed ? item.label : undefined,
              className: ({ isActive }) => isActive ? 'sidebar-link active' : 'sidebar-link',
              onClick: () => { if (onNavigate) onNavigate() }
            },
              React.createElement('span', { className: 'sidebar-link-icon', 'aria-hidden': 'true' },
                React.createElement(Icon, { name: item.icon, size: 18 })
              ),
              React.createElement('span', { className: 'sidebar-link-text' }, item.label)
            )
          )
        })
      )
    ),
    React.createElement('button', {
      type: 'button',
      className: 'sidebar-collapse-btn',
      onClick: onToggleCollapse,
      title: collapsed ? 'Expand sidebar' : 'Collapse sidebar',
      'aria-label': collapsed ? 'Expand sidebar' : 'Collapse sidebar',
      'aria-expanded': !collapsed
    },
      React.createElement('span', { className: 'sidebar-collapse-icon', 'aria-hidden': 'true' },
        React.createElement(Icon, { name: 'chevron', size: 14 })
      ),
      !collapsed && React.createElement('span', { className: 'sidebar-collapse-label' }, 'Collapse')
    )
  )
}
