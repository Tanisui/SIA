import React from 'react'
import { Link } from 'react-router-dom'

export default function Breadcrumb({ items = [] }) {
  return React.createElement('nav', { className: 'breadcrumb', 'aria-label': 'Breadcrumb' },
    items.map((item, idx) =>
      React.createElement(React.Fragment, { key: idx },
        idx > 0 && React.createElement('span', { className: 'separator' }, '/'),
        item.to ? React.createElement(Link, { to: item.to }, item.label) : React.createElement('span', { className: 'active' }, item.label)
      )
    )
  )
}

export function SimpleBreadcrumb({ current = '', path = '/' }) {
  return React.createElement(Breadcrumb, {
    items: [
      { label: 'Dashboard', to: '/' },
      { label: current }
    ]
  })
}
