import React, { useEffect, useMemo, useState } from 'react'
import api from '../api/api.js'

const CONFIG_KEYS = {
  currency: 'sales.currency',
  taxRate: 'sales.tax_rate',
  scannerDebounceMs: 'scanner.debounce_ms',
  invoiceDisplayName: 'invoice.display_name',
  invoiceRegisteredName: 'invoice.registered_name',
  invoiceRegistrationType: 'invoice.registration_type',
  invoiceSellerTin: 'invoice.seller_tin',
  invoiceBranchCode: 'invoice.branch_code',
  invoiceRegisteredBusinessAddress: 'invoice.registered_business_address',
  invoiceBirPermitNumber: 'invoice.bir_permit_number',
  invoiceBirPermitDateIssued: 'invoice.bir_permit_date_issued',
  invoiceAtpNumber: 'invoice.atp_number',
  invoiceAtpDateIssued: 'invoice.atp_date_issued',
  invoiceApprovedSeries: 'invoice.approved_series'
}

const DEFAULT_FORM = {
  currency: 'PHP',
  taxRate: '0.12',
  scannerDebounceMs: '250',
  invoiceDisplayName: "Cecille's N'Style",
  invoiceRegisteredName: '',
  invoiceRegistrationType: 'VAT',
  invoiceSellerTin: '',
  invoiceBranchCode: '',
  invoiceRegisteredBusinessAddress: '',
  invoiceBirPermitNumber: '',
  invoiceBirPermitDateIssued: '',
  invoiceAtpNumber: '',
  invoiceAtpDateIssued: '',
  invoiceApprovedSeries: ''
}

function text(value) {
  return String(value ?? '').trim()
}

function buildFormFromRows(rows) {
  const byKey = new Map((Array.isArray(rows) ? rows : []).map((row) => [row.config_key, row.config_value]))

  return {
    currency: text(byKey.get(CONFIG_KEYS.currency)) || DEFAULT_FORM.currency,
    taxRate: text(byKey.get(CONFIG_KEYS.taxRate)) || DEFAULT_FORM.taxRate,
    scannerDebounceMs: text(byKey.get(CONFIG_KEYS.scannerDebounceMs)) || DEFAULT_FORM.scannerDebounceMs,
    invoiceDisplayName: text(byKey.get(CONFIG_KEYS.invoiceDisplayName)) || DEFAULT_FORM.invoiceDisplayName,
    invoiceRegisteredName: text(byKey.get(CONFIG_KEYS.invoiceRegisteredName)),
    invoiceRegistrationType: text(byKey.get(CONFIG_KEYS.invoiceRegistrationType)).toUpperCase() === 'NON_VAT' ? 'NON_VAT' : 'VAT',
    invoiceSellerTin: text(byKey.get(CONFIG_KEYS.invoiceSellerTin)),
    invoiceBranchCode: text(byKey.get(CONFIG_KEYS.invoiceBranchCode)),
    invoiceRegisteredBusinessAddress: text(byKey.get(CONFIG_KEYS.invoiceRegisteredBusinessAddress)),
    invoiceBirPermitNumber: text(byKey.get(CONFIG_KEYS.invoiceBirPermitNumber)),
    invoiceBirPermitDateIssued: text(byKey.get(CONFIG_KEYS.invoiceBirPermitDateIssued)),
    invoiceAtpNumber: text(byKey.get(CONFIG_KEYS.invoiceAtpNumber)),
    invoiceAtpDateIssued: text(byKey.get(CONFIG_KEYS.invoiceAtpDateIssued)),
    invoiceApprovedSeries: text(byKey.get(CONFIG_KEYS.invoiceApprovedSeries))
  }
}

function buildMissingFields(form) {
  const missing = []
  if (!text(form.invoiceRegisteredName)) missing.push('Registered Name')
  if (!text(form.invoiceSellerTin)) missing.push('Seller TIN')
  if (!text(form.invoiceBranchCode)) missing.push('Branch Code')
  if (!text(form.invoiceRegisteredBusinessAddress)) missing.push('Registered Business Address')
  if (!text(form.invoiceBirPermitNumber)) missing.push('BIR Permit No.')
  if (!text(form.invoiceBirPermitDateIssued)) missing.push('BIR Permit Date Issued')
  if (!text(form.invoiceAtpNumber)) missing.push('Authority to Print No.')
  if (!text(form.invoiceAtpDateIssued)) missing.push('Authority to Print Date Issued')
  if (!text(form.invoiceApprovedSeries)) missing.push('Approved Serial Range')
  return missing
}

export default function Settings() {
  const [form, setForm] = useState(DEFAULT_FORM)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const missingFields = useMemo(() => buildMissingFields(form), [form])

  useEffect(() => {
    let active = true

    ;(async () => {
      try {
        setLoading(true)
        setError('')
        const rows = (await api.get('/settings')).data
        if (!active) return
        setForm(buildFormFromRows(rows))
      } catch (err) {
        if (!active) return
        setError(err?.response?.data?.error || 'Failed to load settings')
      } finally {
        if (active) setLoading(false)
      }
    })()

    return () => {
      active = false
    }
  }, [])

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  function validateForm() {
    const currency = text(form.currency).toUpperCase()
    const taxRate = Number(form.taxRate)
    const scannerDebounceMs = Number(form.scannerDebounceMs)

    if (!currency) return 'Currency is required'
    if (!Number.isFinite(taxRate) || taxRate < 0) return 'Tax rate must be zero or greater'
    if (!Number.isFinite(scannerDebounceMs) || scannerDebounceMs < 0) return 'Scanner debounce must be zero or greater'
    if (!['VAT', 'NON_VAT'].includes(form.invoiceRegistrationType)) return 'Registration type must be VAT or Non-VAT'
    return ''
  }

  async function saveSettings(event) {
    event.preventDefault()
    const validationMessage = validateForm()
    if (validationMessage) {
      setError(validationMessage)
      setSuccess('')
      return
    }

    try {
      setSaving(true)
      setError('')
      setSuccess('')

      const settings = [
        { config_key: CONFIG_KEYS.currency, config_value: text(form.currency).toUpperCase() || 'PHP' },
        { config_key: CONFIG_KEYS.taxRate, config_value: text(form.taxRate) || '0' },
        { config_key: CONFIG_KEYS.scannerDebounceMs, config_value: text(form.scannerDebounceMs) || '250' },
        { config_key: CONFIG_KEYS.invoiceDisplayName, config_value: text(form.invoiceDisplayName) || DEFAULT_FORM.invoiceDisplayName },
        { config_key: CONFIG_KEYS.invoiceRegisteredName, config_value: text(form.invoiceRegisteredName) },
        { config_key: CONFIG_KEYS.invoiceRegistrationType, config_value: form.invoiceRegistrationType },
        { config_key: CONFIG_KEYS.invoiceSellerTin, config_value: text(form.invoiceSellerTin) },
        { config_key: CONFIG_KEYS.invoiceBranchCode, config_value: text(form.invoiceBranchCode) },
        { config_key: CONFIG_KEYS.invoiceRegisteredBusinessAddress, config_value: text(form.invoiceRegisteredBusinessAddress) },
        { config_key: CONFIG_KEYS.invoiceBirPermitNumber, config_value: text(form.invoiceBirPermitNumber) },
        { config_key: CONFIG_KEYS.invoiceBirPermitDateIssued, config_value: text(form.invoiceBirPermitDateIssued) },
        { config_key: CONFIG_KEYS.invoiceAtpNumber, config_value: text(form.invoiceAtpNumber) },
        { config_key: CONFIG_KEYS.invoiceAtpDateIssued, config_value: text(form.invoiceAtpDateIssued) },
        { config_key: CONFIG_KEYS.invoiceApprovedSeries, config_value: text(form.invoiceApprovedSeries) }
      ]

      await api.post('/settings/bulk', { settings })
      setSuccess('Settings saved.')
    } catch (err) {
      setError(err?.response?.data?.error || 'Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="card">Loading settings...</div>
  }

  return (
    <div>
      <div className="page-header" style={{ marginBottom: 16 }}>
        <div>
          <h1 className="page-title">Settings</h1>
          <p className="page-subtitle">Manage sales runtime settings and the BIR invoice fields printed by POS.</p>
        </div>
      </div>

      {error ? <div className="card" style={{ marginBottom: 16, border: '1px solid #fca5a5', background: '#fef2f2', color: '#991b1b' }}>{error}</div> : null}
      {success ? <div className="card" style={{ marginBottom: 16, border: '1px solid #86efac', background: '#f0fdf4', color: '#166534' }}>{success}</div> : null}

      <form onSubmit={saveSettings}>
        <div className="card" style={{ marginBottom: 16 }}>
          <h3 style={{ marginBottom: 12 }}>Sales Runtime</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Currency</label>
              <input className="form-input" value={form.currency} onChange={(event) => updateField('currency', event.target.value)} placeholder="PHP" />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Tax Rate</label>
              <input className="form-input" type="number" min="0" step="0.01" value={form.taxRate} onChange={(event) => updateField('taxRate', event.target.value)} />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Scanner Debounce (ms)</label>
              <input className="form-input" type="number" min="0" step="1" value={form.scannerDebounceMs} onChange={(event) => updateField('scannerDebounceMs', event.target.value)} />
            </div>
          </div>
          <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text-light)' }}>
            When registration type is <strong>Non-VAT</strong>, POS invoice math automatically uses 0 VAT even if a tax rate is still stored here.
          </div>
        </div>

        <div className="card" style={{ marginBottom: 16 }}>
          <h3 style={{ marginBottom: 12 }}>Seller / Invoice Identity</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Display / Trade Name</label>
              <input className="form-input" value={form.invoiceDisplayName} onChange={(event) => updateField('invoiceDisplayName', event.target.value)} />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Registered Name</label>
              <input className="form-input" value={form.invoiceRegisteredName} onChange={(event) => updateField('invoiceRegisteredName', event.target.value)} />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Registration Type</label>
              <select className="form-input" value={form.invoiceRegistrationType} onChange={(event) => updateField('invoiceRegistrationType', event.target.value)}>
                <option value="VAT">VAT</option>
                <option value="NON_VAT">Non-VAT</option>
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Seller TIN</label>
              <input className="form-input" value={form.invoiceSellerTin} onChange={(event) => updateField('invoiceSellerTin', event.target.value)} placeholder="123-456-789" />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Branch Code</label>
              <input className="form-input" value={form.invoiceBranchCode} onChange={(event) => updateField('invoiceBranchCode', event.target.value)} placeholder="00000" />
            </div>
          </div>
          <div className="form-group" style={{ marginTop: 16, marginBottom: 0 }}>
            <label className="form-label">Registered Business Address</label>
            <textarea className="form-input" rows="3" value={form.invoiceRegisteredBusinessAddress} onChange={(event) => updateField('invoiceRegisteredBusinessAddress', event.target.value)} />
          </div>
        </div>

        <div className="card" style={{ marginBottom: 16 }}>
          <h3 style={{ marginBottom: 12 }}>Permit Details</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">BIR Permit No.</label>
              <input className="form-input" value={form.invoiceBirPermitNumber} onChange={(event) => updateField('invoiceBirPermitNumber', event.target.value)} />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">BIR Permit Date Issued</label>
              <input className="form-input" type="date" value={form.invoiceBirPermitDateIssued} onChange={(event) => updateField('invoiceBirPermitDateIssued', event.target.value)} />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Authority To Print No.</label>
              <input className="form-input" value={form.invoiceAtpNumber} onChange={(event) => updateField('invoiceAtpNumber', event.target.value)} />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Authority To Print Date Issued</label>
              <input className="form-input" type="date" value={form.invoiceAtpDateIssued} onChange={(event) => updateField('invoiceAtpDateIssued', event.target.value)} />
            </div>
          </div>
          <div className="form-group" style={{ marginTop: 16, marginBottom: 0 }}>
            <label className="form-label">Approved Serial Range</label>
            <input className="form-input" value={form.invoiceApprovedSeries} onChange={(event) => updateField('invoiceApprovedSeries', event.target.value)} placeholder="5000001 - 5000500" />
          </div>
        </div>

        <div className="card" style={{ marginBottom: 16 }}>
          <h3 style={{ marginBottom: 12 }}>Invoice Compliance Status</h3>
          {missingFields.length === 0 ? (
            <div style={{ color: '#166534' }}>The seller information required by the current invoice template is complete.</div>
          ) : (
            <div style={{ color: '#9a3412' }}>
              Missing fields: {missingFields.join(', ')}.
            </div>
          )}
          {form.invoiceRegistrationType === 'NON_VAT' ? (
            <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text-light)' }}>
              Non-VAT invoices will print the phrase <strong>THIS DOCUMENT IS NOT VALID FOR CLAIM OF INPUT TAX.</strong>
            </div>
          ) : null}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn btn-primary" type="submit" disabled={saving}>
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </form>
    </div>
  )
}
