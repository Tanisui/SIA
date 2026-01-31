import React from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import Login from './pages/Login.js'
import ForgotPassword from './pages/ForgotPassword.js'
import ForgotEmail from './pages/ForgotEmail.js'
import Dashboard from './pages/Dashboard.js'
import Users from './pages/Users.js'
import Roles from './pages/Roles.js'
import Products from './pages/Products.js'
import Inventory from './pages/Inventory.js'
import Sales from './pages/Sales.js'
import Customers from './pages/Customers.js'
import Purchasing from './pages/Purchasing.js'
import Payroll from './pages/Payroll.js'
import Accounting from './pages/Accounting.js'
import Expenses from './pages/Expenses.js'
import Audit from './pages/Audit.js'
import Files from './pages/Files.js'
import Settings from './pages/Settings.js'
import Employees from './pages/Employees.js'
import Attendance from './pages/Attendance.js'
import Notifications from './pages/Notifications.js'
import Reports from './pages/Reports.js'
import Layout from './components/Layout.js'
import ProtectedRoute from './components/ProtectedRoute.js'

export default function App() {
  return (
    React.createElement(Routes, null,
      React.createElement(Route, { path: '/login', element: React.createElement(Login, null) }),
      React.createElement(Route, { path: '/forgot-password', element: React.createElement(ForgotPassword, null) }),
      React.createElement(Route, { path: '/forgot-email', element: React.createElement(ForgotEmail, null) }),
      React.createElement(Route, { path: '/', element: React.createElement(ProtectedRoute, null, React.createElement(Layout, null)), children:
        React.createElement(React.Fragment, null,
          React.createElement(Route, { index: true, element: React.createElement(Dashboard, null) }),
          React.createElement(Route, { path: 'users', element: React.createElement(Users, null) }),
          React.createElement(Route, { path: 'roles', element: React.createElement(Roles, null) }),
          React.createElement(Route, { path: 'employees', element: React.createElement(Employees, null) }),
          React.createElement(Route, { path: 'products', element: React.createElement(Products, null) }),
          React.createElement(Route, { path: 'inventory', element: React.createElement(Inventory, null) }),
          React.createElement(Route, { path: 'sales', element: React.createElement(Sales, null) }),
          React.createElement(Route, { path: 'customers', element: React.createElement(Customers, null) }),
          React.createElement(Route, { path: 'purchasing', element: React.createElement(Purchasing, null) }),
          React.createElement(Route, { path: 'payroll', element: React.createElement(Payroll, null) }),
          React.createElement(Route, { path: 'accounting', element: React.createElement(Accounting, null) }),
          React.createElement(Route, { path: 'expenses', element: React.createElement(Expenses, null) }),
          React.createElement(Route, { path: 'audit', element: React.createElement(Audit, null) }),
          React.createElement(Route, { path: 'files', element: React.createElement(Files, null) }),
          React.createElement(Route, { path: 'settings', element: React.createElement(Settings, null) }),
          React.createElement(Route, { path: 'attendance', element: React.createElement(Attendance, null) }),
          React.createElement(Route, { path: 'notifications', element: React.createElement(Notifications, null) }),
          React.createElement(Route, { path: 'reports', element: React.createElement(Reports, null) })
        )
      }),
      React.createElement(Route, { path: '*', element: React.createElement(Navigate, { to: '/' }) })
    )
  )
}
