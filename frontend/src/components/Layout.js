import React from 'react'
import Header from './Header.js'
import Sidebar from './Sidebar.js'
import { Outlet } from 'react-router-dom'

export default function Layout() {
  return (
    React.createElement('div', { style: { display: 'flex', minHeight: '100vh' } },
      React.createElement(Sidebar, null),
      React.createElement('div', { style: { flex: 1 } },
        React.createElement(Header, null),
        React.createElement('main', null, React.createElement(Outlet, null))
      )
    )
  )
}
