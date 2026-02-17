import React from 'react'
import Header from './Header.js'
import Sidebar from './Sidebar.js'
import { Outlet } from 'react-router-dom'

export default function Layout() {
  return React.createElement('div', { className: 'layout' },
    React.createElement(Sidebar, null),
    React.createElement('div', { className: 'main-content' },
      React.createElement(Header, null),
      React.createElement('main', { className: 'page' },
        React.createElement(Outlet, null)
      )
    )
  )
}