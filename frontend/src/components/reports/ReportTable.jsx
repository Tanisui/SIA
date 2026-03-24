import React from 'react'
import EmptyState from '../EmptyState.js'

function cellClassName(align) {
  if (align === 'right') return 'text-right'
  if (align === 'center') return 'text-center'
  return ''
}

export default function ReportTable({
  columns = [],
  rows = [],
  loading = false,
  emptyTitle = 'No records found',
  emptyDescription = 'Try selecting a different date range.',
  footer = null
}) {
  if (loading) {
    return (
      <div className="card reports-table-loading">
        <div className="loading">
          <div className="spinner" />
          <span>Loading section...</span>
        </div>
      </div>
    )
  }

  if (!rows.length) {
    return (
      <div className="card">
        <EmptyState title={emptyTitle} description={emptyDescription} icon="--" />
      </div>
    )
  }

  return (
    <div className="table-wrap responsive reports-table-wrap">
      <table>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key} className={cellClassName(column.align)}>
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={row.id || row.key || rowIndex}>
              {columns.map((column) => (
                <td key={column.key} className={cellClassName(column.align)}>
                  {column.render ? column.render(row[column.key], row) : row[column.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {footer ? (
          <tfoot>
            <tr>
              {columns.map((column) => (
                <td key={column.key} className={cellClassName(column.align)}>
                  {footer[column.key] || ''}
                </td>
              ))}
            </tr>
          </tfoot>
        ) : null}
      </table>
    </div>
  )
}
