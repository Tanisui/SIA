import React from 'react'

export default function EmptyState({ icon = '📭', title = 'No data', description = 'Nothing to display here', action, actionLabel = 'Create New' }) {
  return React.createElement('div', { className: 'empty-state' },
    React.createElement('div', { className: 'empty-state-icon' }, icon),
    React.createElement('div', { className: 'empty-state-title' }, title),
    React.createElement('div', { className: 'empty-state-description' }, description),
    action && React.createElement('button', {
      className: 'btn btn-primary',
      onClick: action
    }, actionLabel)
  )
}

export function EmptySearchResults() {
  return React.createElement(EmptyState, {
    icon: '🔍',
    title: 'No results found',
    description: 'Try adjusting your search query'
  })
}

export function EmptyTableState({ itemName = 'items' }) {
  return React.createElement(EmptyState, {
    icon: '📋',
    title: `No ${itemName} yet`,
    description: `You haven't created any ${itemName} yet`
  })
}
