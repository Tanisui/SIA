import React, { useEffect, useMemo, useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useSelector } from 'react-redux'
import cecilleLogo from '../assets/cecille-logo.png'

const NAV_ITEMS = [
  { section: 'Main' },
  { to: '/', label: 'Dashboard', end: true, icon: 'DB', perm: null },
  { section: 'Store' },
  { to: '/categories', label: 'Categories', icon: 'CT', perm: 'products.view' },
  { to: '/suppliers', label: 'Suppliers', icon: 'SP', perm: 'suppliers.view' },
  {
    to: '/inventory',
    label: 'Inventory',
    icon: 'IV',
    perm: 'inventory.view',
    children: [
      { to: '/inventory', tab: 'overview', label: 'Overview' },
      { to: '/inventory', tab: 'stock-in', label: 'Stock In' },
      { to: '/inventory', tab: 'stock-out', label: 'Stock Out' },
      { to: '/inventory', tab: 'products', label: 'Products' },
      { to: '/inventory', tab: 'barcode-labels', label: 'Barcode Labels' },
      { to: '/inventory', tab: 'transactions', label: 'Transactions' },
      { to: '/inventory', tab: 'damaged', label: 'Damaged' },
      { to: '/inventory', tab: 'low-stock', label: 'Low Stock Alerts' },
      { to: '/inventory', tab: 'shrinkage', label: 'Shrinkage' },
      { to: '/inventory', tab: 'reports', label: 'Reports' }
    ]
  },
  { to: '/sales', label: 'Sales', icon: 'SL', perm: ['sales.view', 'sales.create'] },
  {
    to: '/purchasing',
    label: 'Purchasing',
    icon: 'BL',
    perm: ['inventory.view', 'inventory.receive', 'reports.view', 'finance.reports.view'],
    children: [
      { to: '/purchasing', tab: 'bale-purchases', label: 'Bale Purchases' },
      { to: '/purchasing', tab: 'bale-breakdowns', label: 'Bale Breakdown' }
    ]
  },
  { section: 'Finance' },
  {
    to: '/reports',
    label: 'Reports',
    icon: 'RP',
    perm: ['reports.view', 'finance.reports.view'],
    children: [
      { to: '/reports', tab: 'balePurchases', label: 'Bale Purchases' },
      { to: '/reports', tab: 'baleBreakdowns', label: 'Bale Breakdown' },
      { to: '/reports', tab: 'salesByBale', label: 'Sales by Bale' },
      { to: '/reports', tab: 'baleProfitability', label: 'Bale Profitability' },
      { to: '/reports', tab: 'supplierPerformance', label: 'Supplier Performance' },
      { to: '/reports', tab: 'inventoryMovement', label: 'Inventory Movement' }
    ]
  },
  { section: 'System' },
  { to: '/users', label: 'Users', icon: 'US', perm: 'users.view' },
  { to: '/roles', label: 'Roles', icon: 'RL', perm: 'roles.view' },
  { to: '/audit', label: 'Audit', icon: 'AD', perm: 'system.audit.view' },
  { section: 'Account' },
  { to: '/change-password', label: 'Change Password', icon: 'PW', perm: null }
]

export default function Sidebar({ mobileOpen = false, onNavigate }) {
  const location = useLocation()
  const navigate = useNavigate()
  const [openMenus, setOpenMenus] = useState({})
  const reduxPermissions = useSelector((state) => state.auth?.permissions)
  const storedPermissions = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem('permissions') || '[]')
    } catch (error) {
      return []
    }
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

  useEffect(() => {
    const activeParent = visibleItems.find((item) =>
      !item.section &&
      item.children &&
      item.to === location.pathname
    )
    if (!activeParent) return
    setOpenMenus((prev) => {
      if (prev[activeParent.to]) return prev
      return { ...prev, [activeParent.to]: true }
    })
  }, [location.pathname, visibleItems])

  const toggleMenu = (menuKey) => {
    setOpenMenus((prev) => ({ ...prev, [menuKey]: !prev[menuKey] }))
  }

  const buildChildTarget = (child) => {
    if (!child?.tab) return child.to
    return `${child.to}?tab=${encodeURIComponent(child.tab)}`
  }

  const currentTab = useMemo(() => {
    const params = new URLSearchParams(location.search)
    const searchTab = String(params.get('tab') || '').trim()
    if (searchTab) return searchTab
    return String(location.hash || '').replace(/^#/, '')
  }, [location.hash, location.search])

  const isChildActive = (child) => {
    if (location.pathname !== child.to) return false
    if (!child.tab) return true
    return currentTab === child.tab
  }

  return React.createElement('aside', { className: `sidebar ${mobileOpen ? 'is-open' : ''}`.trim() },
    React.createElement('div', { className: 'sidebar-logo' },
      React.createElement('img', {
        src: cecilleLogo,
        alt: "Cecille N'Style Logo",
        className: 'sidebar-brand-image'
      }),
      React.createElement('div', { className: 'sidebar-brand-text' },
        React.createElement('span', null, "Cecille's N'Style"),
        React.createElement('small', null, 'POS SYSTEM')
      )
    ),
    React.createElement('nav', null,
      React.createElement('ul', { className: 'sidebar-nav' },
        visibleItems.map((item, index) => {
          if (item.section) {
            return React.createElement('li', { key: `section-${index}` },
              React.createElement('div', { className: 'sidebar-section' }, item.section)
            )
          }

          if (item.children) {
            const menuOpen = Boolean(openMenus[item.to])
            const parentActive = location.pathname === item.to
            const submenuId = `sidebar-submenu-${item.to.replace(/[^a-z0-9]/gi, '-').replace(/^-+|-+$/g, '')}`
            const parentClasses = `sidebar-link sidebar-link-parent ${parentActive ? 'active' : ''} ${menuOpen ? 'is-open' : ''}`.trim()

            return React.createElement('li', { key: item.to, className: 'sidebar-has-children' },
              React.createElement('div', { className: parentClasses },
                React.createElement('button', {
                  type: 'button',
                  className: 'sidebar-parent-main',
                  onClick: () => {
                    const target = item.children.length ? buildChildTarget(item.children[0]) : item.to
                    navigate(target)
                    if (onNavigate) onNavigate()
                  }
                },
                React.createElement('span', { className: 'sidebar-link-icon', 'aria-hidden': 'true' }, item.icon),
                React.createElement('span', { className: 'sidebar-link-text' }, item.label)
                ),
                React.createElement('button', {
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
              menuOpen && React.createElement('div', { className: 'sidebar-submenu', id: submenuId },
                React.createElement('div', { className: 'sidebar-submenu-title' }, `${item.label} Sections`),
                item.children.map((child) =>
                  React.createElement(NavLink, {
                    key: `${child.to}-${child.tab || child.label}`,
                    to: buildChildTarget(child),
                    className: isChildActive(child) ? 'sidebar-submenu-link active' : 'sidebar-submenu-link',
                    onClick: () => {
                      if (onNavigate) onNavigate()
                    }
                  }, child.label)
                )
              )
            )
          }

          return React.createElement('li', { key: item.to },
            React.createElement(NavLink, {
              to: item.to,
              end: item.end || false,
              className: ({ isActive }) => isActive ? 'sidebar-link active' : 'sidebar-link',
              onClick: () => {
                if (onNavigate) onNavigate()
              }
            },
            React.createElement('span', { className: 'sidebar-link-icon', 'aria-hidden': 'true' }, item.icon),
            React.createElement('span', { className: 'sidebar-link-text' }, item.label)
            )
          )
        })
      )
    )
  )
}
