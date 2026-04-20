import React, { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import api from '../api/api.js'

const DEFAULT_FORM = {
  customer_code: '',
  first_name: '',
  last_name: '',
  phone: '',
  email: ''
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i
const PH_MOBILE_PATTERN = /^\+639\d{9}$/

function cleanText(value) {
  return String(value || '').trim()
}

function cleanSingleLine(value) {
  return cleanText(value).replace(/\s+/g, ' ')
}

function cleanEmail(value) {
  return cleanText(value).toLowerCase()
}

function composeFullName(firstName, lastName) {
  return [cleanSingleLine(firstName), cleanSingleLine(lastName)].filter(Boolean).join(' ')
}

function splitName(fullName) {
  const parts = cleanSingleLine(fullName).split(/\s+/).filter(Boolean)
  if (!parts.length) return { firstName: '', lastName: '' }
  if (parts.length === 1) return { firstName: parts[0], lastName: '' }
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(' ')
  }
}

function normalizePhilippineMobile(value) {
  const raw = cleanText(value)
  if (!raw) return ''

  let normalized = raw.replace(/[^\d+]/g, '')
  if (normalized.startsWith('00')) normalized = `+${normalized.slice(2)}`
  if (normalized.startsWith('+')) normalized = `+${normalized.slice(1).replace(/\D/g, '')}`
  else normalized = normalized.replace(/\D/g, '')

  if (normalized.startsWith('09') && normalized.length === 11) normalized = `+63${normalized.slice(1)}`
  else if (normalized.startsWith('9') && normalized.length === 10) normalized = `+63${normalized}`
  else if (normalized.startsWith('63') && normalized.length === 12) normalized = `+${normalized}`

  return PH_MOBILE_PATTERN.test(normalized) ? normalized : null
}

function toFormModel(record) {
  const split = splitName(record?.full_name || record?.name)

  return {
    customer_code: cleanText(record?.customer_code),
    first_name: split.firstName,
    last_name: split.lastName,
    phone: cleanText(record?.phone),
    email: cleanText(record?.email)
  }
}

function buildCustomerPayload(form) {
  const normalizedPhone = cleanText(form.phone) ? normalizePhilippineMobile(form.phone) : ''

  return {
    customer_code: cleanText(form.customer_code) || null,
    full_name: composeFullName(form.first_name, form.last_name),
    phone: normalizedPhone || null,
    email: cleanEmail(form.email) || null
  }
}

function validateCustomerForm(form) {
  const errors = {}
  const firstName = cleanSingleLine(form.first_name)
  const lastName = cleanSingleLine(form.last_name)
  const phoneRaw = cleanText(form.phone)
  const normalizedPhone = phoneRaw ? normalizePhilippineMobile(phoneRaw) : ''
  const email = cleanEmail(form.email)

  if (!firstName) errors.first_name = 'First name is required.'
  if (!lastName) errors.last_name = 'Surname is required.'

  if (phoneRaw && !normalizedPhone) {
    errors.phone = 'Use a valid PH mobile number (example: +639171234567 or 09171234567).'
  }
  if (email && !EMAIL_PATTERN.test(email)) {
    errors.email = 'Enter a valid email address.'
  }
  if (!normalizedPhone && !email) {
    errors.phone = 'Provide at least one contact method: mobile number or email.'
    errors.email = 'Provide at least one contact method: mobile number or email.'
  }

  return errors
}

function buildDuplicateMessage(matches) {
  if (!Array.isArray(matches) || !matches.length) return ''

  const labels = matches.map((match) => {
    const fullName = cleanSingleLine(match?.full_name || match?.name) || `Customer #${match?.id || ''}`
    const code = cleanSingleLine(match?.customer_code)
    return code ? `${fullName} (${code})` : fullName
  })

  return `Possible duplicate customer found: ${labels.join(', ')}.`
}

function normalizeReturnTo(value) {
  const normalized = cleanText(value)
  if (!normalized.startsWith('/') || normalized.startsWith('//')) return ''
  return normalized
}

export default function CustomerFormPage({ mode = 'create' }) {
  const location = useLocation()
  const navigate = useNavigate()
  const { id } = useParams()
  const isEdit = mode === 'edit'
  const returnTo = useMemo(() => {
    const params = new URLSearchParams(location.search)
    return normalizeReturnTo(params.get('return_to'))
  }, [location.search])

  const [form, setForm] = useState(DEFAULT_FORM)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)
  const [touched, setTouched] = useState({})
  const [attemptedSubmit, setAttemptedSubmit] = useState(false)
  const [duplicateState, setDuplicateState] = useState({
    loading: false,
    matches: [],
    message: ''
  })

  const validationErrors = useMemo(() => validateCustomerForm(form), [form])
  const hasDuplicate = duplicateState.matches.length > 0
  const duplicateMessage = hasDuplicate ? duplicateState.message || buildDuplicateMessage(duplicateState.matches) : ''
  const isSaveDisabled = saving || loading || duplicateState.loading || hasDuplicate || Object.keys(validationErrors).length > 0

  function shouldShowError(fieldName) {
    return Boolean(attemptedSubmit || touched[fieldName])
  }

  function getFieldError(fieldName) {
    return shouldShowError(fieldName) ? validationErrors[fieldName] : ''
  }

  function markTouched(fieldName) {
    setTouched((prev) => ({ ...prev, [fieldName]: true }))
  }

  function getReturnTarget() {
    if (!returnTo) return '/customers'
    return returnTo
  }

  function onFieldChange(fieldName, value) {
    setForm((prev) => ({ ...prev, [fieldName]: value }))
    setError(null)
    setSuccess(null)
    if (fieldName === 'phone' || fieldName === 'email') {
      setDuplicateState((prev) => ({ ...prev, matches: [], message: '' }))
    }
  }

  function onStandardBlur(fieldName) {
    markTouched(fieldName)

    if (fieldName === 'email') {
      setForm((prev) => ({ ...prev, email: cleanEmail(prev.email) }))
      return
    }

    if (fieldName === 'phone') {
      setForm((prev) => {
        const raw = cleanText(prev.phone)
        if (!raw) return { ...prev, phone: '' }
        const normalized = normalizePhilippineMobile(raw)
        return { ...prev, phone: normalized || raw }
      })
    }
  }

  async function submitForm(addAnother = false) {
    setAttemptedSubmit(true)
    setError(null)
    setSuccess(null)

    const errors = validateCustomerForm(form)
    if (Object.keys(errors).length > 0) {
      setError('Please fix the highlighted fields before saving.')
      return
    }
    if (hasDuplicate) {
      setError('Possible duplicate customer detected. Please review before saving.')
      return
    }

    try {
      setSaving(true)
      const payload = buildCustomerPayload(form)

      if (isEdit) {
        await api.put(`/customers/${id}`, payload)
        navigate(getReturnTarget())
        return
      }

      const res = await api.post('/customers', payload)
      if (addAnother) {
        const nextCode = cleanText(res?.data?.next_customer_code)
        setForm({
          ...DEFAULT_FORM,
          customer_code: nextCode
        })
        setTouched({})
        setAttemptedSubmit(false)
        setDuplicateState({ loading: false, matches: [], message: '' })
        setSuccess('Customer saved. You can add another profile.')
        return
      }

      navigate(getReturnTarget())
    } catch (err) {
      const apiMessage = cleanText(err?.response?.data?.error)
      const duplicates = Array.isArray(err?.response?.data?.duplicates) ? err.response.data.duplicates : []
      if (duplicates.length) {
        setDuplicateState({
          loading: false,
          matches: duplicates,
          message: buildDuplicateMessage(duplicates)
        })
      }
      setError(apiMessage || 'Failed to save customer')
    } finally {
      setSaving(false)
    }
  }

  useEffect(() => {
    if (!isEdit || !id) {
      setForm(DEFAULT_FORM)
      return
    }

    let active = true
    ;(async () => {
      try {
        setLoading(true)
        setError(null)
        const res = await api.get(`/customers/${id}`)
        if (!active) return
        setForm(toFormModel(res?.data || {}))
      } catch (err) {
        if (!active) return
        setError(err?.response?.data?.error || 'Failed to load customer profile')
      } finally {
        if (active) setLoading(false)
      }
    })()

    return () => { active = false }
  }, [id, isEdit])

  useEffect(() => {
    const rawPhone = cleanText(form.phone)
    const phone = rawPhone ? normalizePhilippineMobile(rawPhone) : ''
    const email = cleanEmail(form.email)

    if ((rawPhone && !phone) || (email && !EMAIL_PATTERN.test(email)) || (!phone && !email)) {
      setDuplicateState({ loading: false, matches: [], message: '' })
      return
    }

    let active = true
    const timer = setTimeout(async () => {
      try {
        setDuplicateState((prev) => ({ ...prev, loading: true }))
        const params = new URLSearchParams()
        if (phone) params.set('phone', phone)
        if (email) params.set('email', email)
        if (isEdit && id) params.set('exclude_id', String(id))
        const res = await api.get(`/customers/duplicate-check?${params.toString()}`)
        if (!active) return
        const matches = Array.isArray(res?.data?.matches) ? res.data.matches : []
        setDuplicateState({
          loading: false,
          matches,
          message: buildDuplicateMessage(matches)
        })
      } catch {
        if (!active) return
        setDuplicateState({ loading: false, matches: [], message: '' })
      }
    }, 260)

    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [form.phone, form.email, id, isEdit])

  const fieldError = {
    first_name: getFieldError('first_name'),
    last_name: getFieldError('last_name'),
    phone: getFieldError('phone'),
    email: getFieldError('email')
  }

  function onSubmit(event) {
    event.preventDefault()
    submitForm(false)
  }

  return (
    <div className="page">
      <div className="page-header customer-form-shell">
        <div>
          <h1 className="page-title">{isEdit ? 'Edit Customer' : 'Create Customer'}</h1>
          <p className="page-subtitle">
            Store the customer name and at least one contact method for service and purchase tracking.
          </p>
        </div>
      </div>

      <div className="card customer-form-card">
        {error ? <div className="error-msg">{error}</div> : null}
        {success ? <div className="success-msg">{success}</div> : null}
        {duplicateMessage ? <div className="warning-msg">{duplicateMessage}</div> : null}

        {loading ? (
          <div className="loading" style={{ padding: '20px 0' }}>
            <span className="spinner spinner-sm" />
            Loading customer profile...
          </div>
        ) : (
          <form onSubmit={onSubmit}>
            <h2 style={{ fontSize: 40, marginBottom: 4 }}>Customer Information</h2>
            <p className="form-help" style={{ marginBottom: 16 }}>
              Customer code is generated automatically after saving.
            </p>

            <div className="form-row customer-form-row-two">
              <div className="form-col">
                <label className="form-label required">First Name</label>
                <input
                  className={`form-input ${fieldError.first_name ? 'error' : ''}`}
                  value={form.first_name}
                  placeholder="Enter first name"
                  onChange={(event) => onFieldChange('first_name', event.target.value)}
                  onBlur={() => onStandardBlur('first_name')}
                  disabled={saving}
                />
                {fieldError.first_name ? <span className="form-error">{fieldError.first_name}</span> : null}
              </div>

              <div className="form-col">
                <label className="form-label required">Surname</label>
                <input
                  className={`form-input ${fieldError.last_name ? 'error' : ''}`}
                  value={form.last_name}
                  placeholder="Enter surname"
                  onChange={(event) => onFieldChange('last_name', event.target.value)}
                  onBlur={() => onStandardBlur('last_name')}
                  disabled={saving}
                />
                {fieldError.last_name ? <span className="form-error">{fieldError.last_name}</span> : null}
              </div>
            </div>

            <div className="form-row customer-form-row-two">
              <div className="form-col">
                <label className="form-label">Mobile Number</label>
                <input
                  className={`form-input ${fieldError.phone ? 'error' : ''}`}
                  value={form.phone}
                  placeholder="+639171234567"
                  onChange={(event) => onFieldChange('phone', event.target.value)}
                  onBlur={() => onStandardBlur('phone')}
                  disabled={saving}
                />
                {fieldError.phone ? (
                  <span className="form-error">{fieldError.phone}</span>
                ) : (
                  <span className="form-help">Accepts +639171234567 or 09171234567 format.</span>
                )}
              </div>

              <div className="form-col">
                <label className="form-label">Email Address</label>
                <input
                  className={`form-input ${fieldError.email ? 'error' : ''}`}
                  value={form.email}
                  placeholder="name@example.com"
                  onChange={(event) => onFieldChange('email', event.target.value)}
                  onBlur={() => onStandardBlur('email')}
                  disabled={saving}
                />
                {fieldError.email ? <span className="form-error">{fieldError.email}</span> : null}
              </div>
            </div>

            <div className="form-row customer-form-row-single">
              <div className="form-col">
                <label className="form-label">Customer Code</label>
                <input
                  className="form-input"
                  value={form.customer_code || 'Auto-generated on save'}
                  readOnly
                  disabled
                />
                <span className="form-help">Assigned after first save.</span>
              </div>
            </div>

            <div className="customer-form-actions">
              <button type="submit" className="btn btn-primary" disabled={isSaveDisabled}>
                {saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Save Customer'}
              </button>
              {!isEdit ? (
                <button
                  type="button"
                  className="btn btn-outline"
                  disabled={isSaveDisabled}
                  onClick={() => submitForm(true)}
                >
                  {saving ? 'Saving...' : 'Save and Add Another'}
                </button>
              ) : null}
              <button
                type="button"
                className="btn btn-secondary"
                disabled={saving}
                onClick={() => navigate(getReturnTarget())}
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
