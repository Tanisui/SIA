import React, { useEffect, useState } from 'react'
import Header from './Header.js'
import Sidebar from './Sidebar.js'
import { Outlet } from 'react-router-dom'

const COLLAPSE_KEY = 'sidebarCollapsed'
const MOBILE_QUERY = '(max-width: 991.98px)'

function readInitialCollapsed() {
  try { return JSON.parse(localStorage.getItem(COLLAPSE_KEY) || 'false') } catch { return false }
}

function readIsMobileViewport() {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia(MOBILE_QUERY).matches
}

export default function Layout() {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(readInitialCollapsed)
  const [isMobileViewport, setIsMobileViewport] = useState(readIsMobileViewport)

  const closeSidebar = () => setMobileSidebarOpen(false)
  const toggleSidebar = () => setMobileSidebarOpen((prev) => !prev)
  const toggleCollapsed = () => setCollapsed((prev) => !prev)
  const effectiveCollapsed = !isMobileViewport && collapsed

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined
    const media = window.matchMedia(MOBILE_QUERY)
    const handleChange = () => setIsMobileViewport(media.matches)

    handleChange()
    if (media.addEventListener) {
      media.addEventListener('change', handleChange)
      return () => media.removeEventListener('change', handleChange)
    }

    media.addListener(handleChange)
    return () => media.removeListener(handleChange)
  }, [])

  useEffect(() => {
    try { localStorage.setItem(COLLAPSE_KEY, JSON.stringify(collapsed)) } catch { /* ignore */ }
  }, [collapsed])

  useEffect(() => {
    document.documentElement.classList.toggle('sidebar-collapsed', !!effectiveCollapsed)
  }, [effectiveCollapsed])

  useEffect(() => {
    if (!isMobileViewport) setMobileSidebarOpen(false)
  }, [isMobileViewport])

  const layoutClass = [
    'layout',
    mobileSidebarOpen ? 'sidebar-open' : '',
    effectiveCollapsed ? 'sidebar-is-collapsed' : ''
  ].filter(Boolean).join(' ')

  return React.createElement('div', { className: layoutClass },
    React.createElement(Sidebar, {
      mobileOpen: mobileSidebarOpen,
      onNavigate: closeSidebar,
      collapsed: effectiveCollapsed,
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
