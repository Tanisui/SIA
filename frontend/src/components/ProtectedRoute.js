import React from 'react'
import { useSelector } from 'react-redux'
import { Navigate, Outlet } from 'react-router-dom'

export default function ProtectedRoute({ children }) {
  const token = useSelector(state => state.auth.token)
  if (!token) return React.createElement(Navigate, { to: '/login' })
  if (children) return children
  return React.createElement(Outlet, null)
}
