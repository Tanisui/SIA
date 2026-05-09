import React from 'react'
import { useSelector } from 'react-redux'
import { Navigate, Outlet } from 'react-router-dom'

export default function ProtectedRoute({ children, perm }) {
  const token = useSelector(state => state.auth.token)
  const permissions = useSelector(state => state.auth.permissions) || []

  if (!token) return React.createElement(Navigate, { to: '/login' })

  // If perm is specified, check permissions
  if (perm) {
    const can = (p) => {
      if (!p) return true
      if (!permissions) return false
      if (Array.isArray(p)) return p.some((entry) => can(entry))
      if (permissions.includes('admin.*')) return true
      return permissions.includes(p)
    }

    if (!can(perm)) {
      return React.createElement(Navigate, { to: '/unauthorized' })
    }
  }

  if (children) return children
  return React.createElement(Outlet, null)
}
