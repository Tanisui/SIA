import React, { useEffect, useMemo, useState } from 'react'

function normalizeRowId(value) {
  if (value === null || value === undefined || value === '') return null
  return String(value)
}

function isInteractiveTarget(target) {
  return Boolean(target?.closest?.('button, a, input, select, textarea, label, summary, [role="button"], [contenteditable="true"]'))
}

export function useSingleRowSelection(rows = [], getRowId = (row) => row?.id) {
  const [selectedRowId, setSelectedRowId] = useState(null)

  const rowLookup = useMemo(() => {
    const next = new Map()
    const list = Array.isArray(rows) ? rows : []

    list.forEach((row, index) => {
      const rowId = normalizeRowId(getRowId(row, index))
      if (rowId !== null && !next.has(rowId)) next.set(rowId, row)
    })

    return next
  }, [getRowId, rows])

  const selectedRow = selectedRowId !== null ? rowLookup.get(selectedRowId) || null : null

  useEffect(() => {
    if (selectedRowId === null) return
    if (!rowLookup.has(selectedRowId)) setSelectedRowId(null)
  }, [rowLookup, selectedRowId])

  const selectRow = (row, index) => {
    const rowId = typeof row === 'object'
      ? normalizeRowId(getRowId(row, index))
      : normalizeRowId(row)
    setSelectedRowId(rowId)
  }

  const clearSelection = () => setSelectedRowId(null)
  const isSelected = (row, index) => normalizeRowId(getRowId(row, index)) === selectedRowId

  return {
    selectedRowId,
    selectedRow,
    selectRow,
    clearSelection,
    isSelected,
    setSelectedRowId
  }
}

export function getSelectableRowProps({
  row,
  rowId,
  isSelected = false,
  onSelect,
  className = '',
  onClick,
  onKeyDown,
  disabled = false,
  style
}) {
  const nextClassName = ['table-row-selectable', isSelected ? 'is-selected' : '', disabled ? 'is-disabled' : '', className]
    .filter(Boolean)
    .join(' ')

  return {
    className: nextClassName,
    tabIndex: disabled ? -1 : 0,
    'aria-selected': isSelected ? 'true' : 'false',
    style,
    onClick: (event) => {
      if (!disabled && !event.defaultPrevented && !isInteractiveTarget(event.target)) {
        onSelect?.(row, rowId, event)
      }
      onClick?.(event)
    },
    onKeyDown: (event) => {
      if (!disabled && (event.key === 'Enter' || event.key === ' ')) {
        event.preventDefault()
        onSelect?.(row, rowId, event)
      }
      onKeyDown?.(event)
    }
  }
}

export function SelectionActionBar({
  buttonLabel,
  onAction,
  disabled = true,
  helperText = 'Select a row to enable the action button. Use Tab and Enter, or click a row.',
  selectedText = 'No row selected.',
  buttonClassName = 'btn btn-primary',
  children = null
}) {
  return React.createElement('div', { className: 'table-action-bar' },
    React.createElement('div', { className: 'table-action-bar-copy' },
      React.createElement('div', { className: 'table-action-bar-status' }, selectedText),
      helperText ? React.createElement('div', { className: 'table-action-bar-note' }, helperText) : null
    ),
    React.createElement('div', { className: 'table-action-bar-controls' },
      children,
      React.createElement('button', {
        type: 'button',
        className: buttonClassName,
        disabled,
        onClick: onAction
      }, buttonLabel)
    )
  )
}
