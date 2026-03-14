import React from 'react'

export function Table({ headers = [], rows = [], loading = false, empty = null, striped = false, hover = true }) {
  if (loading) {
    return React.createElement('div', { className: 'loading', style: { padding: '40px' } },
      React.createElement('div', { className: 'spinner' }),
      React.createElement('span', null, 'Loading...')
    )
  }

  if (!rows || rows.length === 0) {
    return empty || React.createElement('div', { style: { padding: '40px', textAlign: 'center', color: 'var(--text-light)' } }, 'No data available')
  }

  return React.createElement('div', { className: 'table-wrap' },
    React.createElement('table', null,
      React.createElement('thead', null,
        React.createElement('tr', null,
          headers.map(header =>
            React.createElement('th', {
              key: header.key || header,
              className: header.align ? `text-${header.align}` : '',
              style: { width: header.width }
            },
              header.label || header
            )
          )
        )
      ),
      React.createElement('tbody', null,
        rows.map((row, idx) =>
          React.createElement('tr', { key: row.id || idx },
            headers.map(header => {
              const key = header.key || header
              const value = row[key]
              return React.createElement('td', {
                key: key,
                className: header.align ? `text-${header.align}` : ''
              },
                header.render ? header.render(value, row) : value
              )
            })
          )
        )
      )
    )
  )
}

export function TableActions({ onEdit, onDelete, onView }) {
  return React.createElement('div', { className: 'table-actions' },
    onView && React.createElement('button', {
      className: 'btn btn-sm btn-outline',
      onClick: onView,
      title: 'View'
    }, '👁'),
    onEdit && React.createElement('button', {
      className: 'btn btn-sm btn-secondary',
      onClick: onEdit,
      title: 'Edit'
    }, '✎'),
    onDelete && React.createElement('button', {
      className: 'btn btn-sm btn-danger',
      onClick: onDelete,
      title: 'Delete'
    }, '🗑')
  )
}
