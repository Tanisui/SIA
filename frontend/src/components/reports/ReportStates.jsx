import React from 'react'
import EmptyState from '../EmptyState.js'

export function ReportsLoadingState() {
  return (
    <div className="card reports-state-card">
      <div className="loading">
        <div className="spinner spinner-lg" />
        <span>Generating bale-aware reports from live data...</span>
      </div>
    </div>
  )
}

export function ReportsErrorState({ message, onRetry }) {
  return (
    <div className="card reports-state-card">
      <div className="error-msg" style={{ marginBottom: 12 }}>
        {message}
      </div>
      <div style={{ color: 'var(--text-light)', fontSize: 14, marginBottom: 12 }}>
        We could not complete the report request. Please try again, or adjust the date range.
      </div>
      <button className="btn btn-primary" onClick={onRetry}>
        Retry Report
      </button>
    </div>
  )
}

export function ReportsEmptyState({ onResetRange }) {
  return (
    <div className="card reports-state-card">
      <EmptyState
        icon="--"
        title="No bale-linked report data for this period"
        description="No bale purchases or bale-linked sales were found. Try selecting a different date range."
        action={onResetRange}
        actionLabel="Use Last 30 Days"
      />
    </div>
  )
}
