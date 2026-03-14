import React from 'react'

export default function Pagination({ current = 1, total = 1, onPageChange, loading = false }) {
  const pages = []
  const maxVisible = 7
  const halfVisible = Math.floor(maxVisible / 2)

  let start = Math.max(1, current - halfVisible)
  let end = Math.min(total, start + maxVisible - 1)
  
  if (end - start + 1 < maxVisible) {
    start = Math.max(1, end - maxVisible + 1)
  }

  if (start > 1) pages.push(1)
  if (start > 2) pages.push('...')
  
  for (let i = start; i <= end; i++) {
    pages.push(i)
  }
  
  if (end < total - 1) pages.push('...')
  if (end < total) pages.push(total)

  return React.createElement('div', {
    style: {
      display: 'flex',
      alignItems: 'center',
      justify: 'center',
      gap: '6px',
      marginTop: '24px',
      flexWrap: 'wrap'
    }
  },
    React.createElement('button', {
      className: 'btn btn-sm btn-secondary',
      onClick: () => onPageChange?.(current - 1),
      disabled: current === 1 || loading
    }, '← Prev'),
    React.createElement('div', { style: { display: 'flex', gap: '4px', flexWrap: 'wrap' } },
      pages.map((p, i) => {
        if (p === '...') {
          return React.createElement('span', {
            key: i,
            style: { padding: '6px 8px', color: 'var(--text-light)' }
          }, '...')
        }
        return React.createElement('button', {
          key: p,
          className: p === current ? 'btn btn-sm btn-primary' : 'btn btn-sm btn-secondary',
          onClick: () => onPageChange?.(p),
          disabled: loading,
          style: { minWidth: '32px' }
        }, p)
      })
    ),
    React.createElement('button', {
      className: 'btn btn-sm btn-secondary',
      onClick: () => onPageChange?.(current + 1),
      disabled: current === total || loading
    }, 'Next →')
  )
}

export function PaginationInfo({ current = 1, pageSize = 10, total = 0 }) {
  const start = (current - 1) * pageSize + 1
  const end = Math.min(current * pageSize, total)
  
  return React.createElement('div', {
    style: { fontSize: '12px', color: 'var(--text-light)', textAlign: 'center' }
  },
    `Showing ${start}-${end} of ${total} items`
  )
}
