import React from 'react'

export default function Badge({ children, variant = 'neutral', size = 'md' }) {
  const sizeClass = size === 'sm' ? 'text-sm' : size === 'lg' ? 'text-lg' : ''
  return React.createElement('span', {
    className: `badge badge-${variant} ${sizeClass}`
  }, children)
}

export function StatusBadge({ status }) {
  const statusMap = {
    'active': { variant: 'success', label: 'Active' },
    'inactive': { variant: 'neutral', label: 'Inactive' },
    'pending': { variant: 'warning', label: 'Pending' },
    'completed': { variant: 'success', label: 'Completed' },
    'failed': { variant: 'danger', label: 'Failed' },
    'approved': { variant: 'success', label: 'Approved' },
    'rejected': { variant: 'danger', label: 'Rejected' },
    'draft': { variant: 'neutral', label: 'Draft' },
    'published': { variant: 'success', label: 'Published' },
    'archived': { variant: 'neutral', label: 'Archived' }
  }

  const config = statusMap[status?.toLowerCase?.()] || { variant: 'neutral', label: status }

  return React.createElement(Badge, { variant: config.variant }, config.label)
}

export function PaymentBadge({ method }) {
  const methodMap = {
    'cash': { variant: 'success', label: 'Cash' },
    'card': { variant: 'primary', label: 'Card' },
    'check': { variant: 'info', label: 'Check' },
    'transfer': { variant: 'info', label: 'Bank Transfer' },
    'other': { variant: 'neutral', label: 'Other' }
  }

  const config = methodMap[method?.toLowerCase?.()] || { variant: 'neutral', label: method }

  return React.createElement(Badge, { variant: config.variant }, config.label)
}
