import React from 'react'
import { createRoot } from 'react-dom/client'
import { Provider } from 'react-redux'
import { BrowserRouter } from 'react-router-dom'
import App from './App.js'
import store from './store/store.js'

const root = createRoot(document.getElementById('root'))
root.render(
  React.createElement(
    React.StrictMode,
    null,
    React.createElement(Provider, { store }, React.createElement(BrowserRouter, null, React.createElement(App, null)))
  )
)
