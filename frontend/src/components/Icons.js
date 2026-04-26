import React from 'react'

const SVG_DEFAULTS = {
  width: 18,
  height: 18,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': 'true',
  focusable: 'false'
}

function svg(paths, props = {}) {
  return React.createElement('svg', { ...SVG_DEFAULTS, ...props }, ...paths)
}
const p = (d, extra = {}) => React.createElement('path', { d, ...extra })
const c = (cx, cy, r, extra = {}) => React.createElement('circle', { cx, cy, r, ...extra })
const r = (props) => React.createElement('rect', props)
const l = (x1, y1, x2, y2, extra = {}) => React.createElement('line', { x1, y1, x2, y2, ...extra })

export const ICONS = {
  dashboard: (props) => svg([
    r({ x: 3,  y: 3,  width: 7, height: 9, rx: 1.4 }),
    r({ x: 14, y: 3,  width: 7, height: 5, rx: 1.4 }),
    r({ x: 14, y: 10, width: 7, height: 11, rx: 1.4 }),
    r({ x: 3,  y: 14, width: 7, height: 7, rx: 1.4 })
  ], props),

  categories: (props) => svg([
    p('M4 5h11l3 3v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z'),
    p('M15 5v3h3'),
    l(7, 13, 14, 13),
    l(7, 17, 12, 17)
  ], props),

  suppliers: (props) => svg([
    p('M3 7h11v9H3z'),
    p('M14 10h4l3 3v3h-7z'),
    c(7, 18, 1.6),
    c(17, 18, 1.6)
  ], props),

  inventory: (props) => svg([
    p('M3 7l9-4 9 4-9 4-9-4z'),
    p('M3 12l9 4 9-4'),
    p('M3 17l9 4 9-4')
  ], props),

  sales: (props) => svg([
    p('M3 6h2l2.5 11h11l2-7H7'),
    c(9, 20, 1.4),
    c(17, 20, 1.4)
  ], props),

  customers: (props) => svg([
    c(9, 8, 3.5),
    p('M3 20c0-3 3-5 6-5s6 2 6 5'),
    p('M16 11.5a3 3 0 0 0 0-6'),
    p('M21 19c0-2.2-1.8-4-4-4')
  ], props),

  attendance: (props) => svg([
    c(12, 12, 9),
    p('M12 7v5l3.2 2')
  ], props),

  purchasing: (props) => svg([
    p('M3 5h2l1.5 9h11l2-7H6.5'),
    p('M9 5l3-3 3 3'),
    c(9, 19, 1.4),
    c(17, 19, 1.4)
  ], props),

  reports: (props) => svg([
    p('M5 4h10l4 4v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z'),
    p('M14 4v5h5'),
    l(8, 14, 8, 18),
    l(12, 11, 12, 18),
    l(16, 13, 16, 18)
  ], props),

  payroll: (props) => svg([
    r({ x: 3, y: 6, width: 18, height: 12, rx: 1.6 }),
    c(12, 12, 2.6),
    l(7, 12, 7.01, 12),
    l(17, 12, 17.01, 12)
  ], props),

  users: (props) => svg([
    c(9, 8, 3.5),
    p('M3 20c0-3 3-5 6-5s6 2 6 5'),
    c(17, 9, 2.5),
    p('M21 19c0-2.2-1.5-4-4-4')
  ], props),

  roles: (props) => svg([
    p('M12 3l8 3v5c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6l8-3z'),
    p('M9 12l2 2 4-4')
  ], props),

  settings: (props) => svg([
    c(12, 12, 3),
    p('M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 4.5 15a1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.6 9 1.7 1.7 0 0 0 4.3 7.1l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 9 4.6 1.7 1.7 0 0 0 10 3V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z')
  ], props),

  audit: (props) => svg([
    p('M5 4h10l4 4v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z'),
    p('M14 4v5h5'),
    l(8, 13, 16, 13),
    l(8, 17, 13, 17)
  ], props),

  account: (props) => svg([
    c(12, 8, 4),
    p('M4 21c0-4 4-7 8-7s8 3 8 7')
  ], props),

  // Topbar
  menu: (props) => svg([
    l(4, 7, 20, 7),
    l(4, 12, 20, 12),
    l(4, 17, 20, 17)
  ], props),

  bell: (props) => svg([
    p('M6 8a6 6 0 0 1 12 0c0 4.5 1.5 6 2 7H4c.5-1 2-2.5 2-7z'),
    p('M10 19a2 2 0 0 0 4 0')
  ], props),

  signOut: (props) => svg([
    p('M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4'),
    p('M16 17l5-5-5-5'),
    l(21, 12, 9, 12)
  ], props),

  chevron: (props) => svg([
    p('M9 6l6 6-6 6')
  ], props),

  fallback: (props) => svg([c(12, 12, 8)], props)
}

export default function Icon({ name, size, ...rest }) {
  const renderer = ICONS[name] || ICONS.fallback
  const sized = size ? { width: size, height: size } : {}
  return renderer({ ...sized, ...rest })
}
