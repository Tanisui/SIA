import React, { useState } from 'react'
import Header from './Header.js'
import Sidebar from './Sidebar.js'
import { Outlet } from 'react-router-dom'

export default function Layout() {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)

  const closeSidebar = () => setMobileSidebarOpen(false)
  const toggleSidebar = () => setMobileSidebarOpen((prev) => !prev)

  return React.createElement('div', { className: `layout ${mobileSidebarOpen ? 'sidebar-open' : ''}` },
    React.createElement(Sidebar, { mobileOpen: mobileSidebarOpen, onNavigate: closeSidebar }),
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
