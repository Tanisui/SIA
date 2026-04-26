import React, { useMemo } from 'react'
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, RadialLinearScale, TimeScale, LogarithmicScale,
  PointElement, LineElement, BarElement, ArcElement,
  Title, Tooltip, Legend, Filler, SubTitle
} from 'chart.js'
import { Chart as ChartRoot } from 'react-chartjs-2'

ChartJS.register(
  CategoryScale, LinearScale, RadialLinearScale, TimeScale, LogarithmicScale,
  PointElement, LineElement, BarElement, ArcElement,
  Title, Tooltip, Legend, Filler, SubTitle
)

// Brand palette — keeps every chart on the same gold + cream system.
export const BRAND_COLORS = {
  gold:        '#9C7A2A',
  goldDark:    '#7A5C12',
  goldHover:   '#5E4509',
  goldLight:   '#F0E6D0',
  tan:         '#D4B483',
  cream:       '#FAF7F2',
  text:        '#1A140E',
  textMid:     '#4A3820',
  textLight:   '#8A6E4C',
  hairline:    '#E7DFD0',
  success:     '#1A7A40',
  successSoft: '#E8F5EE',
  warning:     '#B8650A',
  warningSoft: '#FEF3E2',
  error:       '#C0392B',
  errorSoft:   '#FDEDEB',
  info:        '#1A5CA8',
  infoSoft:    '#E8F0FA'
}

// Categorical palette for multi-series charts. Stays inside the cream/gold story.
export const SERIES_PALETTE = [
  '#9C7A2A', // gold
  '#D4B483', // tan
  '#5E4509', // gold hover
  '#1A5CA8', // info blue
  '#1A7A40', // success green
  '#B8650A', // warning amber
  '#7A5C12', // gold dark
  '#475569'  // slate
]

const PESO_FORMATTER = new Intl.NumberFormat('en-PH', {
  style: 'currency', currency: 'PHP', minimumFractionDigits: 0, maximumFractionDigits: 2
})

const NUMBER_FORMATTER = new Intl.NumberFormat('en-PH')

export function formatCurrency(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return '₱0'
  return PESO_FORMATTER.format(n)
}

export function formatNumber(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return '0'
  return NUMBER_FORMATTER.format(n)
}

const DEFAULT_FONT = "'Nunito', 'Jost', sans-serif"

function withAlpha(hex, alpha) {
  const cleaned = hex.replace('#', '')
  const r = parseInt(cleaned.slice(0, 2), 16)
  const g = parseInt(cleaned.slice(2, 4), 16)
  const b = parseInt(cleaned.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function buildBaseOptions({ valueType = 'number', stacked = false, hideLegend = false, indexAxis = 'x', subtitle = null, smallTicks = false }) {
  const valueFormat = valueType === 'currency' ? formatCurrency : formatNumber
  return {
    responsive: true,
    maintainAspectRatio: false,
    indexAxis,
    interaction: { mode: 'nearest', intersect: false },
    layout: { padding: { top: 4, right: 8, bottom: 0, left: 0 } },
    plugins: {
      legend: hideLegend ? { display: false } : {
        display: true,
        position: 'bottom',
        align: 'start',
        labels: {
          font: { family: DEFAULT_FONT, size: 11, weight: '700' },
          color: BRAND_COLORS.textMid,
          boxWidth: 12,
          boxHeight: 12,
          padding: 14,
          usePointStyle: true
        }
      },
      title: { display: false },
      subtitle: subtitle ? { display: true, text: subtitle, color: BRAND_COLORS.textLight, font: { family: DEFAULT_FONT, size: 11 }, padding: { bottom: 6 } } : { display: false },
      tooltip: {
        backgroundColor: BRAND_COLORS.text,
        titleColor: '#FFF7E4',
        bodyColor: '#FFF7E4',
        borderColor: BRAND_COLORS.gold,
        borderWidth: 1,
        padding: 10,
        cornerRadius: 8,
        titleFont: { family: DEFAULT_FONT, size: 12, weight: '700' },
        bodyFont: { family: DEFAULT_FONT, size: 12 },
        usePointStyle: true,
        callbacks: {
          label: (ctx) => {
            const label = ctx.dataset?.label ? `${ctx.dataset.label}: ` : ''
            const value = ctx.parsed?.y ?? ctx.parsed?.x ?? ctx.parsed
            return `${label}${valueFormat(value)}`
          }
        }
      }
    },
    scales: {
      x: {
        stacked,
        grid: { color: 'transparent', borderColor: BRAND_COLORS.hairline },
        ticks: { font: { family: DEFAULT_FONT, size: smallTicks ? 10 : 11, weight: '600' }, color: BRAND_COLORS.textLight, maxRotation: 0, autoSkip: true }
      },
      y: {
        stacked,
        grid: { color: '#EFE7D9', borderColor: BRAND_COLORS.hairline, borderDash: [4, 4] },
        ticks: {
          font: { family: DEFAULT_FONT, size: smallTicks ? 10 : 11, weight: '600' },
          color: BRAND_COLORS.textLight,
          callback: (v) => valueType === 'currency' ? `₱${NUMBER_FORMATTER.format(v)}` : NUMBER_FORMATTER.format(v)
        },
        beginAtZero: true
      }
    }
  }
}

function radialOptions({ valueType = 'number' }) {
  const valueFormat = valueType === 'currency' ? formatCurrency : formatNumber
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'bottom', labels: { font: { family: DEFAULT_FONT, size: 11, weight: '700' }, color: BRAND_COLORS.textMid, boxWidth: 12, padding: 14, usePointStyle: true } },
      tooltip: {
        backgroundColor: BRAND_COLORS.text,
        titleColor: '#FFF7E4', bodyColor: '#FFF7E4',
        borderColor: BRAND_COLORS.gold, borderWidth: 1,
        padding: 10, cornerRadius: 8,
        callbacks: { label: (ctx) => `${ctx.label}: ${valueFormat(ctx.parsed)}` }
      }
    },
    scales: {
      r: {
        angleLines: { color: '#EFE7D9' },
        grid:       { color: '#EFE7D9' },
        pointLabels: { font: { family: DEFAULT_FONT, size: 11, weight: '700' }, color: BRAND_COLORS.textMid },
        ticks:       { display: false, beginAtZero: true }
      }
    }
  }
}

function buildDataset(type, label, data, opts = {}) {
  const { color = BRAND_COLORS.gold, fill = false, area = false, dashed = false, yAxisID, order } = opts
  const base = { label, data, order, ...(yAxisID ? { yAxisID } : {}) }
  if (type === 'line') {
    return {
      ...base,
      type: 'line',
      borderColor: color,
      backgroundColor: area ? withAlpha(color, 0.18) : color,
      borderWidth: 2.5,
      tension: 0.35,
      pointRadius: 3,
      pointHoverRadius: 5,
      pointBackgroundColor: color,
      pointBorderColor: '#FFF',
      pointBorderWidth: 1.5,
      borderDash: dashed ? [6, 4] : [],
      fill: area || fill || false
    }
  }
  if (type === 'bar') {
    return {
      ...base,
      type: 'bar',
      backgroundColor: color,
      borderRadius: 6,
      borderSkipped: false,
      maxBarThickness: 32
    }
  }
  if (type === 'scatter' || type === 'bubble') {
    return {
      ...base,
      type,
      backgroundColor: withAlpha(color, 0.7),
      borderColor: color,
      borderWidth: 1.5
    }
  }
  return { ...base, backgroundColor: color }
}

function pieDataset(label, data, palette = SERIES_PALETTE) {
  return {
    label,
    data,
    backgroundColor: data.map((_, i) => palette[i % palette.length]),
    borderColor: '#FFFFFF',
    borderWidth: 2,
    hoverOffset: 6
  }
}

function radarDataset(label, data, color = BRAND_COLORS.gold) {
  return {
    label,
    data,
    borderColor: color,
    backgroundColor: withAlpha(color, 0.22),
    pointBackgroundColor: color,
    pointBorderColor: '#FFF',
    pointBorderWidth: 1.5,
    pointRadius: 3,
    borderWidth: 2
  }
}

function polarDataset(label, data, palette = SERIES_PALETTE) {
  return {
    label,
    data,
    backgroundColor: data.map((_, i) => withAlpha(palette[i % palette.length], 0.7)),
    borderColor: data.map((_, i) => palette[i % palette.length]),
    borderWidth: 1.5
  }
}

/**
 * Branded chart component. Pass a `kind` plus `data` shaped to that kind:
 *
 *   <BrandedChart kind="line" labels={[…]} datasets={[{ label, data, color, area }]} valueType="currency" />
 *   <BrandedChart kind="bar"  labels={[…]} datasets={[{ label, data, color }]} stacked />
 *   <BrandedChart kind="combo" labels={[…]} datasets={[{ type:'bar',  label, data, color }, { type:'line', label, data, color }]} />
 *   <BrandedChart kind="doughnut" labels={[…]} values={[…]} />
 *   <BrandedChart kind="pie"      labels={[…]} values={[…]} />
 *   <BrandedChart kind="radar"    labels={[…]} datasets={[{ label, data, color }]} />
 *   <BrandedChart kind="polarArea" labels={[…]} values={[…]} />
 *   <BrandedChart kind="scatter"  datasets={[{ label, data:[{x,y},…], color }]} />
 *   <BrandedChart kind="bubble"   datasets={[{ label, data:[{x,y,r},…], color }]} />
 */
export default function BrandedChart({
  kind = 'line',
  labels = [],
  values = [],
  datasets = [],
  valueType = 'number',
  stacked = false,
  hideLegend = false,
  indexAxis = 'x',
  subtitle = null,
  smallTicks = false,
  height = 240
}) {
  const { type, data, options } = useMemo(() => {
    if (kind === 'pie' || kind === 'doughnut') {
      const ds = pieDataset(datasets[0]?.label || 'Total', values)
      return {
        type: kind,
        data: { labels, datasets: [ds] },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: kind === 'doughnut' ? '62%' : 0,
          plugins: {
            legend: hideLegend ? { display: false } : {
              position: 'right',
              align: 'center',
              labels: {
                font: { family: DEFAULT_FONT, size: 11, weight: '700' },
                color: BRAND_COLORS.textMid,
                boxWidth: 12, boxHeight: 12, padding: 14, usePointStyle: true
              }
            },
            tooltip: {
              backgroundColor: BRAND_COLORS.text,
              titleColor: '#FFF7E4', bodyColor: '#FFF7E4',
              borderColor: BRAND_COLORS.gold, borderWidth: 1,
              padding: 10, cornerRadius: 8,
              callbacks: {
                label: (ctx) => {
                  const total = ctx.dataset.data.reduce((s, v) => s + (Number(v) || 0), 0)
                  const v = Number(ctx.parsed) || 0
                  const pct = total ? Math.round((v / total) * 100) : 0
                  const f = valueType === 'currency' ? formatCurrency : formatNumber
                  return `${ctx.label}: ${f(v)} (${pct}%)`
                }
              }
            }
          }
        }
      }
    }
    if (kind === 'radar') {
      const ds = datasets.map((d, i) => radarDataset(d.label || `Series ${i + 1}`, d.data, d.color || SERIES_PALETTE[i % SERIES_PALETTE.length]))
      return { type: 'radar', data: { labels, datasets: ds }, options: radialOptions({ valueType }) }
    }
    if (kind === 'polarArea') {
      const ds = polarDataset(datasets[0]?.label || 'Total', values)
      return { type: 'polarArea', data: { labels, datasets: [ds] }, options: radialOptions({ valueType }) }
    }
    if (kind === 'scatter' || kind === 'bubble') {
      const ds = datasets.map((d, i) => buildDataset(kind, d.label || `Series ${i + 1}`, d.data, { color: d.color || SERIES_PALETTE[i % SERIES_PALETTE.length] }))
      return {
        type: kind,
        data: { datasets: ds },
        options: {
          ...buildBaseOptions({ valueType, stacked, hideLegend, subtitle, smallTicks }),
          scales: {
            x: { type: 'linear', position: 'bottom', grid: { color: '#EFE7D9', borderDash: [4, 4] }, ticks: { color: BRAND_COLORS.textLight, font: { family: DEFAULT_FONT, size: 11, weight: '600' } } },
            y: { grid: { color: '#EFE7D9', borderDash: [4, 4] }, ticks: { color: BRAND_COLORS.textLight, font: { family: DEFAULT_FONT, size: 11, weight: '600' } } }
          }
        }
      }
    }
    if (kind === 'combo') {
      const ds = datasets.map((d, i) => buildDataset(d.type || 'line', d.label || `Series ${i + 1}`, d.data, {
        color: d.color || SERIES_PALETTE[i % SERIES_PALETTE.length],
        area: d.area, fill: d.fill, dashed: d.dashed, yAxisID: d.yAxisID, order: d.order
      }))
      return {
        type: 'bar',
        data: { labels, datasets: ds },
        options: {
          ...buildBaseOptions({ valueType, stacked, hideLegend, subtitle, smallTicks }),
          scales: {
            ...buildBaseOptions({ valueType, stacked, hideLegend, subtitle, smallTicks }).scales,
            ...(datasets.some((d) => d.yAxisID === 'y2') ? {
              y2: {
                position: 'right',
                grid: { display: false, drawOnChartArea: false, borderColor: BRAND_COLORS.hairline },
                ticks: { color: BRAND_COLORS.textLight, font: { family: DEFAULT_FONT, size: 11, weight: '600' }, callback: (v) => formatNumber(v) },
                beginAtZero: true
              }
            } : {})
          }
        }
      }
    }
    // line / bar
    const ds = datasets.map((d, i) => buildDataset(kind, d.label || `Series ${i + 1}`, d.data, {
      color: d.color || SERIES_PALETTE[i % SERIES_PALETTE.length],
      area: d.area, fill: d.fill, dashed: d.dashed
    }))
    return {
      type: kind,
      data: { labels, datasets: ds },
      options: buildBaseOptions({ valueType, stacked, hideLegend, indexAxis, subtitle, smallTicks })
    }
  }, [kind, labels, values, datasets, valueType, stacked, hideLegend, indexAxis, subtitle, smallTicks])

  return React.createElement('div', { className: 'branded-chart', style: { height: typeof height === 'number' ? `${height}px` : height } },
    React.createElement(ChartRoot, { type, data, options })
  )
}

/**
 * ChartCard — shell for a chart with title, subtitle, optional KPI line.
 */
export function ChartCard({ title, subtitle, kpi, children, footer, height = 260 }) {
  return React.createElement('div', { className: 'card chart-card' },
    React.createElement('div', { className: 'chart-card-head' },
      React.createElement('div', null,
        React.createElement('div', { className: 'chart-card-title' }, title),
        subtitle && React.createElement('div', { className: 'chart-card-subtitle' }, subtitle)
      ),
      kpi && React.createElement('div', { className: 'chart-card-kpi' },
        React.createElement('span', { className: 'chart-card-kpi-label' }, kpi.label),
        React.createElement('span', { className: 'chart-card-kpi-value', style: kpi.tone ? { color: kpi.tone } : null }, kpi.value)
      )
    ),
    React.createElement('div', { className: 'chart-card-body', style: { height: typeof height === 'number' ? `${height}px` : height } },
      children
    ),
    footer && React.createElement('div', { className: 'chart-card-footer' }, footer)
  )
}
