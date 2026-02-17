import React from 'react'
import { useSelector } from 'react-redux'

const STAT_CARDS = [
  { title: 'Total Sales',     value: '—',  sub: 'All time',       icon: '🧾' },
  { title: 'Products',        value: '—',  sub: 'In catalog',     icon: '👗' },
  { title: 'Low Stock',       value: '—',  sub: 'Need restocking',icon: '📦' },
  { title: 'Customers',       value: '—',  sub: 'Registered',     icon: '👤' },
  { title: 'Employees',       value: '—',  sub: 'Active staff',   icon: '👥' },
  { title: 'Pending Payroll', value: '—',  sub: 'This period',    icon: '💰' },
]

export default function Dashboard() {
  const user = useSelector(s => s.auth.user)
  const name = user ? (user.full_name || user.username) : 'Administrator'

  const now = new Date()
  const timeStr = now.toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })

  return React.createElement('div', null,
    // Page Header
    React.createElement('div', { className: 'page-header' },
      React.createElement('div', null,
        React.createElement('h1', { className: 'page-title' }, `Good day, ${name} 👋`),
        React.createElement('p', { className: 'page-subtitle' }, timeStr)
      )
    ),

    // Stat Cards
    React.createElement('div', { className: 'dashboard-grid' },
      STAT_CARDS.map(card =>
        React.createElement('div', { key: card.title, className: 'card' },
          React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' } },
            React.createElement('div', null,
              React.createElement('div', { className: 'card-title' }, card.title),
              React.createElement('div', { className: 'card-value' }, card.value),
              React.createElement('div', { className: 'text-muted mt-1', style: { fontSize: 12 } }, card.sub)
            ),
            React.createElement('span', { style: { fontSize: 28, opacity: 0.6 } }, card.icon)
          )
        )
      )
    ),

    // Info Banner
    React.createElement('div', { className: 'card', style: { background: 'linear-gradient(135deg, #2C2116 0%, #4A3520 100%)', border: 'none', color: '#EDE0C4' } },
      React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
        React.createElement('div', null,
          React.createElement('h3', { style: { color: '#D4B483', fontFamily: 'Cormorant Garamond, serif', fontSize: 22 } }, "Cecille's N'Style POS"),
          React.createElement('p', { style: { fontSize: 13.5, color: '#A89070', marginTop: 4 } },
            'Backend APIs are being set up. Dashboard stats will load automatically once connected.'
          )
        ),
        React.createElement('span', { style: { fontSize: 36 } }, '✨')
      )
    )
  )
}