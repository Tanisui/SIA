import React, { useEffect, useState } from 'react'
import Header from './Header.js'
import Sidebar from './Sidebar.js'
import { Outlet } from 'react-router-dom'

const COLLAPSE_KEY = 'sidebarCollapsed'

function readInitialCollapsed() {
  try { return JSON.parse(localStorage.getItem(COLLAPSE_KEY) || 'false') } catch { return false }
}

export default function Layout() {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(readInitialCollapsed)

  const closeSidebar = () => setMobileSidebarOpen(false)
  const toggleSidebar = () => setMobileSidebarOpen((prev) => !prev)
  const toggleCollapsed = () => setCollapsed((prev) => !prev)

  useEffect(() => {
    try { localStorage.setItem(COLLAPSE_KEY, JSON.stringify(collapsed)) } catch { /* ignore */ }
    document.documentElement.classList.toggle('sidebar-collapsed', !!collapsed)
  }, [collapsed])

  const layoutClass = [
    'layout',
    mobileSidebarOpen ? 'sidebar-open' : '',
    collapsed ? 'sidebar-is-collapsed' : ''
  ].filter(Boolean).join(' ')

  return React.createElement('div', { className: layoutClass },
    React.createElement(Sidebar, {
      mobileOpen: mobileSidebarOpen,
      onNavigate: closeSidebar,
      collapsed,
      onToggleCollapse: toggleCollapsed
    }),
    mobileSidebarOpen && React.createElement('button', {
      type: 'button',
      className: 'sidebar-overlay',
      'aria-label': 'Close sidebar',
      onClick: closeSidebar
    }),
    React.createElement('div', { className: 'main-content' },
      React.createElement(Header, { onMenuToggle: toggleSidebar }),
      React.createElement('main', { className: 'page' },
        React.createElement(Outlet, null)
      )
    )
  )
}
