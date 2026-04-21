import React from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import Login from './pages/Login.js'
import ForgotPassword from './pages/ForgotPassword.js'
import ForgotEmail from './pages/ForgotEmail.js'
import Dashboard from './pages/Dashboard.js'
import Users from './pages/Users.jsx'
import UserFormPage from './pages/UserFormPage.jsx'
import Roles from './pages/Roles.jsx'
import Categories from './pages/Categories.js'
import Suppliers from './pages/Suppliers.js'
import Inventory from './pages/Inventory.js'
import Sales from './pages/Sales.jsx'
import Customers from './pages/Customers.jsx'
import CustomerFormPage from './pages/CustomerFormPage.jsx'
import Purchasing from './pages/Purchasing.jsx'
import Expenses from './pages/Expenses.js'
import Audit from './pages/Audit.jsx'
import Files from './pages/Files.js'
import Settings from './pages/Settings.jsx'
import Notifications from './pages/Notifications.js'
import Reports from './pages/Reports.jsx'
import PayrollProfiles from './pages/payroll/PayrollProfiles.jsx'
import PayrollPeriods from './pages/payroll/PayrollPeriods.jsx'
import PayrollInputSheet from './pages/payroll/PayrollInputSheet.jsx'
import PayrollPreview from './pages/payroll/PayrollPreview.jsx'
import PayrollPayslip from './pages/payroll/PayrollPayslip.jsx'
import PayrollReports from './pages/payroll/PayrollReports.jsx'
import Layout from './components/Layout.js'
import ProtectedRoute from './components/ProtectedRoute.js'
import ChangePassword from './pages/ChangePassword';

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
          React.createElement(Route, { path: 'users/new', element: React.createElement(UserFormPage, { mode: 'create' }) }),
          React.createElement(Route, { path: 'users/:id/edit', element: React.createElement(UserFormPage, { mode: 'edit' }) }),
          React.createElement(Route, { path: 'employees', element: React.createElement(Navigate, { to: '/users', replace: true }) }),
          React.createElement(Route, { path: 'employees/new', element: React.createElement(UserFormPage, { mode: 'create' }) }),
          React.createElement(Route, { path: 'employees/:id/edit', element: React.createElement(UserFormPage, { mode: 'edit' }) }),
          React.createElement(Route, { path: 'roles', element: React.createElement(Roles, null) }),
          React.createElement(Route, { path: 'categories', element: React.createElement(Categories, null) }),
          React.createElement(Route, { path: 'suppliers', element: React.createElement(Suppliers, null) }),
          React.createElement(Route, { path: 'inventory', element: React.createElement(Inventory, null) }),
          React.createElement(Route, { path: 'sales', element: React.createElement(Sales, null) }),
          React.createElement(Route, { path: 'customers', element: React.createElement(Customers, null) }),
          React.createElement(Route, { path: 'customers/new', element: React.createElement(CustomerFormPage, { mode: 'create' }) }),
          React.createElement(Route, { path: 'customers/:id/edit', element: React.createElement(CustomerFormPage, { mode: 'edit' }) }),
          React.createElement(Route, { path: 'purchasing', element: React.createElement(Purchasing, null) }),
          React.createElement(Route, { path: 'expenses', element: React.createElement(Expenses, null) }),
          React.createElement(Route, { path: 'audit', element: React.createElement(Audit, null) }),
          React.createElement(Route, { path: 'files', element: React.createElement(Files, null) }),
          React.createElement(Route, { path: 'settings', element: React.createElement(Settings, null) }),
          React.createElement(Route, { path: 'notifications', element: React.createElement(Notifications, null) }),
          React.createElement(Route, { path: 'reports', element: React.createElement(Reports, null) }),
          React.createElement(Route, { path: 'payroll/profiles', element: React.createElement(PayrollProfiles, null) }),
          React.createElement(Route, { path: 'payroll/periods', element: React.createElement(PayrollPeriods, null) }),
          React.createElement(Route, { path: 'payroll/periods/:periodId/inputs', element: React.createElement(PayrollInputSheet, null) }),
          React.createElement(Route, { path: 'payroll/periods/:periodId/preview', element: React.createElement(PayrollPreview, null) }),
          React.createElement(Route, { path: 'payroll/runs/:runId/items/:itemId/payslip', element: React.createElement(PayrollPayslip, null) }),
          React.createElement(Route, { path: 'payroll/reports', element: React.createElement(PayrollReports, null) }),
          React.createElement(Route, { path: 'change-password', element: React.createElement(ChangePassword, null) })
        )
      }),
      React.createElement(Route, { path: '*', element: React.createElement(Navigate, { to: '/' }) })
    )
  )
}
