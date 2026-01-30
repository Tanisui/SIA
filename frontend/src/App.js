import React from 'react'

export default function App() {
  return React.createElement(
    'div',
    { style: { fontFamily: 'system-ui, sans-serif', padding: 24 } },
    React.createElement(
      'p',
      null,
      'hello world ',
      React.createElement('code', null, 'src/App.js'),
      ' to get started.'
    )
  )
}
