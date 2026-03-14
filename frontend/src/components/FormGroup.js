import React from 'react'

export function FormGroup({ label, required = false, children, error, help, className = '' }) {
  return React.createElement('div', { className: `form-group ${className}` },
    label && React.createElement('label', {
      className: `form-label ${required ? 'required' : ''}`
    }, label),
    children,
    error && React.createElement('div', { className: 'form-error' }, error),
    help && !error && React.createElement('div', { className: 'form-help' }, help)
  )
}

export function FormInput({ label, required = false, error, help, ...props }) {
  return React.createElement(FormGroup, {
    label,
    required,
    error,
    help
  },
    React.createElement('input', {
      className: `form-input ${error ? 'error' : props.disabled ? 'disabled' : ''}`,
      ...props
    })
  )
}

export function FormSelect({ label, required = false, error, help, options = [], ...props }) {
  return React.createElement(FormGroup, {
    label,
    required,
    error,
    help
  },
    React.createElement('select', {
      className: `form-select ${error ? 'error' : ''}`,
      ...props
    },
      React.createElement('option', { value: '' }, 'Select...'),
      options.map(opt =>
        React.createElement('option', {
          key: typeof opt === 'object' ? opt.value : opt,
          value: typeof opt === 'object' ? opt.value : opt
        },
          typeof opt === 'object' ? opt.label : opt
        )
      )
    )
  )
}

export function FormTextarea({ label, required = false, error, help, ...props }) {
  return React.createElement(FormGroup, {
    label,
    required,
    error,
    help
  },
    React.createElement('textarea', {
      className: `form-textarea ${error ? 'error' : ''}`,
      ...props
    })
  )
}

export function FormRow({ children, gap = 3 }) {
  return React.createElement('div', {
    className: 'form-row',
    style: { gap: `${gap * 6}px` }
  }, children)
}

export function FormCol({ children }) {
  return React.createElement('div', { className: 'form-col' }, children)
}
