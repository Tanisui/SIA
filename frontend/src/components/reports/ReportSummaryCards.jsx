import React from 'react'

export default function ReportSummaryCards({ cards = [], loading = false }) {
  return (
    <div className="reports-summary-grid">
      {cards.map((card) => (
        <div key={card.key} className="card reports-summary-card">
          <div className="card-title">{card.label}</div>
          <div className={`card-value-sm reports-summary-value reports-summary-value-${card.tone || 'default'}`}>
            {loading ? '...' : card.value}
          </div>
        </div>
      ))}
    </div>
  )
}
