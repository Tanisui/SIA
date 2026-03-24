import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import api from '../api/api.js'

const CONTACT_METHOD_OPTIONS = ['SMS', 'Call', 'Email', 'Facebook/Messenger', 'Viber']

const DEFAULT_FORM = {
  customer_code: '',
  first_name: '',
  last_name: '',
  phone: '',
  email: '',
  preferred_contact_method: '',
  address_line: '',
  region_code: '',
  region_name: '',
  province_code: '',
  province_name: '',
  city_code: '',
  city_name: '',
  barangay_code: '',
  barangay_name: '',
  postal_code: '',
  notes: ''
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i
const POSTAL_PATTERN = /^\d{4}$/
const PH_MOBILE_PATTERN = /^\+639\d{9}$/
const LOCATION_SUGGESTION_LIMIT = 25

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

function parseLocationOptions(payload) {
  const options = Array.isArray(payload?.options) ? payload.options : []
  return options
    .map((option, index) => ({
      code: cleanText(option?.code) || `option-${index}-${cleanText(option?.name)}`,
      name: cleanSingleLine(option?.name),
      label: cleanSingleLine(option?.label || option?.name),
      type: cleanSingleLine(option?.type),
      region_code: cleanText(option?.region_code),
      region_name: cleanSingleLine(option?.region_name),
      province_code: cleanText(option?.province_code),
      province_name: cleanSingleLine(option?.province_name),
      city_code: cleanText(option?.city_code),
      city_name: cleanSingleLine(option?.city_name)
    }))
    .filter((option) => option.name)
}

function sourceMessageFromResponse(data) {
  const source = cleanText(data?.source).toLowerCase()
  if (source === 'seed') return 'Using built-in Philippine location suggestions.'
  if (source === 'local') return 'Using saved customer addresses for location suggestions.'
  if (source === 'psgc') return 'Using live Philippine Standard Geographic Code suggestions.'
  return ''
}

function findExactOptionByName(options, value) {
  const needle = cleanSingleLine(value).toLowerCase()
  if (!needle) return null
  return (
    (options || []).find((option) => cleanSingleLine(option?.name).toLowerCase() === needle) || null
  )
}

function toFormModel(record) {
  const fullName = cleanSingleLine(record?.full_name || record?.name)
  const split = splitName(fullName)

  return {
    customer_code: cleanText(record?.customer_code),
    first_name: split.firstName,
    last_name: split.lastName,
    phone: cleanText(record?.phone),
    email: cleanText(record?.email),
    preferred_contact_method: cleanText(record?.preferred_contact_method),
    address_line: cleanText(record?.address_line || record?.address),
    region_code: cleanText(record?.region_code),
    region_name: cleanSingleLine(record?.region_name || record?.region),
    province_code: cleanText(record?.province_code),
    province_name: cleanSingleLine(record?.province_name || record?.province),
    city_code: cleanText(record?.city_code),
    city_name: cleanSingleLine(record?.city_name || record?.city),
    barangay_code: cleanText(record?.barangay_code),
    barangay_name: cleanSingleLine(record?.barangay_name || record?.barangay),
    postal_code: cleanText(record?.postal_code),
    notes: cleanText(record?.notes)
  }
}

function buildCustomerPayload(form) {
  const normalizedPhone = cleanText(form.phone) ? normalizePhilippineMobile(form.phone) : ''
  const fullName = composeFullName(form.first_name, form.last_name)

  return {
    customer_code: cleanText(form.customer_code) || null,
    full_name: fullName,
    phone: normalizedPhone || null,
    email: cleanEmail(form.email) || null,
    preferred_contact_method: cleanText(form.preferred_contact_method) || null,
    address_line: cleanSingleLine(form.address_line) || null,
    region_code: cleanText(form.region_code) || null,
    region_name: cleanSingleLine(form.region_name) || null,
    province_code: cleanText(form.province_code) || null,
    province_name: cleanSingleLine(form.province_name) || null,
    city_code: cleanText(form.city_code) || null,
    city_name: cleanSingleLine(form.city_name) || null,
    barangay_code: cleanText(form.barangay_code) || null,
    barangay_name: cleanSingleLine(form.barangay_name) || null,
    postal_code: cleanText(form.postal_code) || null,
    notes: cleanText(form.notes) || null
  }
}

function validateCustomerForm(form, rules = {}) {
  const errors = {}
  const firstName = cleanSingleLine(form.first_name)
  const lastName = cleanSingleLine(form.last_name)
  const phoneRaw = cleanText(form.phone)
  const normalizedPhone = phoneRaw ? normalizePhilippineMobile(phoneRaw) : ''
  const email = cleanEmail(form.email)
  const postalCode = cleanText(form.postal_code)
  const preferredContactMethod = cleanText(form.preferred_contact_method)
  const provinceRequired = rules?.provinceRequired !== false

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
  if (postalCode && !POSTAL_PATTERN.test(postalCode)) {
    errors.postal_code = 'Postal code must be exactly 4 digits.'
  }

  if (preferredContactMethod === 'Email' && !email) {
    errors.preferred_contact_method = 'Email is selected, but email address is empty.'
  }
  if ((preferredContactMethod === 'SMS' || preferredContactMethod === 'Call' || preferredContactMethod === 'Viber') && !normalizedPhone) {
    errors.preferred_contact_method = 'Selected contact method needs a valid mobile number.'
  }

  if (!cleanText(form.region_code)) {
    errors.region_name = 'Region is required.'
  }

  if (form.province_name && !form.region_code) {
    errors.province_name = 'Select a region first.'
  } else if (form.province_name && !form.province_code) {
    errors.province_name = 'Select a valid province from the suggestions.'
  }

  if (cleanText(form.region_code) && provinceRequired && !cleanText(form.province_code)) {
    errors.province_name = 'Province is required for the selected region.'
  }

  const cityBlockedByRegion = !cleanText(form.region_code)
  const cityBlockedByProvince = provinceRequired && !cleanText(form.province_code)
  if (form.city_name && cityBlockedByRegion) {
    errors.city_name = 'Select a region first.'
  } else if (form.city_name && cityBlockedByProvince) {
    errors.city_name = 'Select a province first.'
  } else if (form.city_name && !form.city_code) {
    errors.city_name = 'Select a valid city / municipality from the suggestions.'
  }
  if (!cleanText(form.city_code)) {
    errors.city_name = cityBlockedByRegion
      ? 'Select a region first.'
      : cityBlockedByProvince
        ? 'Select a province first.'
        : 'City / Municipality is required.'
  }

  if (form.barangay_name && !form.city_code) {
    errors.barangay_name = 'Select a city / municipality first.'
  } else if (form.barangay_name && !form.barangay_code) {
    errors.barangay_name = 'Select a valid barangay from the suggestions.'
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

function LocationField({
  label,
  required = false,
  value,
  placeholder,
  disabled,
  error,
  helper,
  isOpen,
  loading,
  options,
  noResults,
  onOpen,
  onClose,
  onChange,
  onPick,
  renderOption
}) {
  return (
    <div className="form-col">
      <label className={`form-label${required ? ' required' : ''}`}>{label}</label>
      <div className="customer-suggest-wrap">
        <input
          className={`form-input ${error ? 'error' : ''}`}
          value={value}
          placeholder={placeholder}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          onFocus={() => {
            if (!disabled) onOpen()
          }}
          onBlur={onClose}
        />
        {isOpen && !disabled ? (
          <div className="customer-suggest-dropdown">
            {loading ? (
              <div className="customer-suggest-status">Searching...</div>
            ) : options.length ? (
              options.map((option) => (
                <button
                  key={`${label}-${option.code}`}
                  type="button"
                  className="customer-suggest-item"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => onPick(option)}
                >
                  {renderOption ? renderOption(option) : <span>{option.name}</span>}
                </button>
              ))
            ) : (
              <div className="customer-suggest-status">{noResults}</div>
            )}
          </div>
        ) : null}
      </div>
      {error ? <span className="form-error">{error}</span> : <span className="form-help">{helper}</span>}
    </div>
  )
}

export default function CustomerFormPage({ mode = 'create' }) {
  const navigate = useNavigate()
  const { id } = useParams()
  const isEdit = mode === 'edit'

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
  const [locationOptions, setLocationOptions] = useState({
    regions: [],
    provinces: [],
    cities: [],
    barangays: []
  })
  const [locationLoading, setLocationLoading] = useState({
    regions: false,
    provinces: false,
    cities: false,
    barangays: false
  })
  const [provinceRequired, setProvinceRequired] = useState(true)
  const [activeLocationDropdown, setActiveLocationDropdown] = useState('')
  const [locationMessage, setLocationMessage] = useState('')

  const validationErrors = useMemo(
    () => validateCustomerForm(form, { provinceRequired }),
    [form, provinceRequired]
  )
  const hasDuplicate = duplicateState.matches.length > 0
  const duplicateMessage = hasDuplicate ? duplicateState.message || buildDuplicateMessage(duplicateState.matches) : ''

  const isProvinceDisabled = !cleanText(form.region_code)
  const isCityDisabled = !cleanText(form.region_code) || (provinceRequired && !cleanText(form.province_code))
  const isBarangayDisabled = !cleanText(form.city_code)
  const isSaveDisabled = saving || loading || duplicateState.loading || hasDuplicate || Object.keys(validationErrors).length > 0

  function shouldShowError(fieldName) {
    return Boolean(attemptedSubmit || touched[fieldName])
  }

  function getFieldError(fieldName) {
    return shouldShowError(fieldName) ? validationErrors[fieldName] : ''
  }

  function setLocationLoadingState(key, value) {
    setLocationLoading((prev) => (prev[key] === value ? prev : { ...prev, [key]: value }))
  }

  function markTouched(fieldName) {
    setTouched((prev) => ({ ...prev, [fieldName]: true }))
  }

  function closeDropdownSoon(fieldName) {
    setTimeout(() => {
      setActiveLocationDropdown((current) => (current === fieldName ? '' : current))
    }, 120)
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
      return
    }

    if (fieldName === 'postal_code') {
      setForm((prev) => ({ ...prev, postal_code: cleanText(prev.postal_code) }))
      return
    }

    if (fieldName === 'address_line') {
      setForm((prev) => ({ ...prev, address_line: cleanSingleLine(prev.address_line) }))
    }
  }

  function onRegionInput(value) {
    setForm((prev) => ({
      ...prev,
      region_name: value,
      region_code: '',
      province_name: '',
      province_code: '',
      city_name: '',
      city_code: '',
      barangay_name: '',
      barangay_code: ''
    }))
    setProvinceRequired(true)
    setLocationOptions((prev) => ({ ...prev, provinces: [], cities: [], barangays: [] }))
    setError(null)
    setSuccess(null)
  }

  function onProvinceInput(value) {
    setForm((prev) => ({
      ...prev,
      province_name: value,
      province_code: '',
      city_name: '',
      city_code: '',
      barangay_name: '',
      barangay_code: ''
    }))
    setLocationOptions((prev) => ({ ...prev, cities: [], barangays: [] }))
    setError(null)
    setSuccess(null)
  }

  function onCityInput(value) {
    setForm((prev) => ({
      ...prev,
      city_name: value,
      city_code: '',
      barangay_name: '',
      barangay_code: ''
    }))
    setLocationOptions((prev) => ({ ...prev, barangays: [] }))
    setError(null)
    setSuccess(null)
  }

  function onBarangayInput(value) {
    setForm((prev) => ({ ...prev, barangay_name: value, barangay_code: '' }))
    setError(null)
    setSuccess(null)
  }

  function applyRegion(option) {
    if (!option) return
    setForm((prev) => ({
      ...prev,
      region_name: option.name,
      region_code: cleanText(option.code),
      province_name: '',
      province_code: '',
      city_name: '',
      city_code: '',
      barangay_name: '',
      barangay_code: ''
    }))
    setProvinceRequired(true)
    setLocationOptions((prev) => ({ ...prev, provinces: [], cities: [], barangays: [] }))
    setActiveLocationDropdown('')
  }

  function applyProvince(option) {
    if (!option) return
    setForm((prev) => ({
      ...prev,
      province_name: option.name,
      province_code: cleanText(option.code),
      city_name: '',
      city_code: '',
      barangay_name: '',
      barangay_code: ''
    }))
    setLocationOptions((prev) => ({ ...prev, cities: [], barangays: [] }))
    setActiveLocationDropdown('')
  }

  function applyCity(option) {
    if (!option) return
    setForm((prev) => ({
      ...prev,
      city_name: option.name,
      city_code: cleanText(option.code),
      barangay_name: '',
      barangay_code: ''
    }))
    setLocationOptions((prev) => ({ ...prev, barangays: [] }))
    setActiveLocationDropdown('')
  }

  function applyBarangay(option) {
    if (!option) return
    setForm((prev) => ({
      ...prev,
      barangay_name: option.name,
      barangay_code: cleanText(option.code)
    }))
    setActiveLocationDropdown('')
  }

  function resolveTypedRegion() {
    if (!cleanText(form.region_name) || cleanText(form.region_code)) return
    const match = findExactOptionByName(locationOptions.regions, form.region_name)
    if (match) {
      setForm((prev) => ({ ...prev, region_name: match.name, region_code: cleanText(match.code) }))
    }
  }

  function resolveTypedProvince() {
    if (!cleanText(form.province_name) || cleanText(form.province_code)) return
    const match = findExactOptionByName(locationOptions.provinces, form.province_name)
    if (match) {
      setForm((prev) => ({ ...prev, province_name: match.name, province_code: cleanText(match.code) }))
    }
  }

  function resolveTypedCity() {
    if (!cleanText(form.city_name) || cleanText(form.city_code)) return
    const match = findExactOptionByName(locationOptions.cities, form.city_name)
    if (match) {
      setForm((prev) => ({ ...prev, city_name: match.name, city_code: cleanText(match.code) }))
    }
  }

  function resolveTypedBarangay() {
    if (!cleanText(form.barangay_name) || cleanText(form.barangay_code)) return
    const match = findExactOptionByName(locationOptions.barangays, form.barangay_name)
    if (match) {
      setForm((prev) => ({ ...prev, barangay_name: match.name, barangay_code: cleanText(match.code) }))
    }
  }

  async function submitForm(addAnother = false) {
    setAttemptedSubmit(true)
    setError(null)
    setSuccess(null)

    const errors = validateCustomerForm(form, { provinceRequired })
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
        navigate('/customers')
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

      navigate('/customers')
    } catch (err) {
      const status = Number(err?.response?.status || 0)
      if (status === 409) {
        const duplicates = Array.isArray(err?.response?.data?.duplicates) ? err.response.data.duplicates : []
        setDuplicateState({
          loading: false,
          matches: duplicates,
          message: buildDuplicateMessage(duplicates)
        })
      }
      const message = err?.response?.data?.error || err?.message || 'Failed to save customer profile.'
      setError(String(message))
    } finally {
      setSaving(false)
    }
  }

  useEffect(() => {
    if (!isEdit || !id) return
    let mounted = true

    async function loadCustomer() {
      try {
        setLoading(true)
        setError(null)
        const res = await api.get(`/customers/${id}`)
        if (!mounted) return
        setForm(toFormModel(res.data || {}))
      } catch (err) {
        if (!mounted) return
        const message = err?.response?.data?.error || err?.message || 'Failed to load customer profile.'
        setError(String(message))
      } finally {
        if (mounted) setLoading(false)
      }
    }

    loadCustomer()
    return () => {
      mounted = false
    }
  }, [isEdit, id])

  useEffect(() => {
    let active = true
    const q = cleanSingleLine(form.region_name)

    const timer = setTimeout(async () => {
      try {
        setLocationLoadingState('regions', true)
        const params = new URLSearchParams()
        params.set('limit', String(LOCATION_SUGGESTION_LIMIT))
        if (q) params.set('q', q)
        const res = await api.get(`/customers/locations/regions?${params.toString()}`)
        if (!active) return
        setLocationOptions((prev) => ({ ...prev, regions: parseLocationOptions(res?.data) }))
        setLocationMessage(sourceMessageFromResponse(res?.data))
      } catch (err) {
        if (!active) return
        setLocationOptions((prev) => ({ ...prev, regions: [] }))
        setLocationMessage('Location suggestions are currently unavailable. Please retry in a moment.')
      } finally {
        if (active) setLocationLoadingState('regions', false)
      }
    }, 180)

    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [form.region_name])

  useEffect(() => {
    if (!form.region_code) {
      setProvinceRequired(true)
      setLocationOptions((prev) => ({ ...prev, provinces: [], cities: [], barangays: [] }))
      return
    }

    let active = true
    const q = cleanSingleLine(form.province_name)

    const timer = setTimeout(async () => {
      try {
        setLocationLoadingState('provinces', true)
        const params = new URLSearchParams()
        params.set('limit', String(LOCATION_SUGGESTION_LIMIT))
        params.set('region_code', form.region_code)
        params.set('region', form.region_name)
        if (q) params.set('q', q)
        const res = await api.get(`/customers/locations/provinces?${params.toString()}`)
        if (!active) return
        const provinces = parseLocationOptions(res?.data)
        setLocationOptions((prev) => ({ ...prev, provinces }))
        if (!q) {
          setProvinceRequired(provinces.length > 0)
        }
      } catch (err) {
        if (!active) return
        setLocationOptions((prev) => ({ ...prev, provinces: [] }))
        if (!q) setProvinceRequired(true)
      } finally {
        if (active) setLocationLoadingState('provinces', false)
      }
    }, 180)

    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [form.region_code, form.region_name, form.province_name])

  useEffect(() => {
    if (!form.region_code || (provinceRequired && !form.province_code)) {
      setLocationOptions((prev) => ({ ...prev, cities: [], barangays: [] }))
      return
    }

    let active = true
    const q = cleanSingleLine(form.city_name)

    const timer = setTimeout(async () => {
      try {
        setLocationLoadingState('cities', true)
        const params = new URLSearchParams()
        params.set('limit', String(LOCATION_SUGGESTION_LIMIT))
        params.set('region_code', form.region_code)
        if (form.province_code) params.set('province_code', form.province_code)
        if (form.province_name) params.set('province', form.province_name)
        if (q) params.set('q', q)
        const res = await api.get(`/customers/locations/cities-municipalities?${params.toString()}`)
        if (!active) return
        setLocationOptions((prev) => ({ ...prev, cities: parseLocationOptions(res?.data) }))
      } catch (err) {
        if (!active) return
        setLocationOptions((prev) => ({ ...prev, cities: [] }))
      } finally {
        if (active) setLocationLoadingState('cities', false)
      }
    }, 180)

    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [form.region_code, form.province_code, form.province_name, form.city_name, provinceRequired])

  useEffect(() => {
    if (!form.city_code) {
      setLocationOptions((prev) => ({ ...prev, barangays: [] }))
      return
    }

    let active = true
    const q = cleanSingleLine(form.barangay_name)

    const timer = setTimeout(async () => {
      try {
        setLocationLoadingState('barangays', true)
        const params = new URLSearchParams()
        params.set('limit', String(LOCATION_SUGGESTION_LIMIT))
        params.set('region_code', form.region_code)
        params.set('province_code', form.province_code)
        params.set('city_municipality_code', form.city_code)
        params.set('city', form.city_name)
        if (q) params.set('q', q)
        const res = await api.get(`/customers/locations/barangays?${params.toString()}`)
        if (!active) return
        setLocationOptions((prev) => ({ ...prev, barangays: parseLocationOptions(res?.data) }))
      } catch (err) {
        if (!active) return
        setLocationOptions((prev) => ({ ...prev, barangays: [] }))
      } finally {
        if (active) setLocationLoadingState('barangays', false)
      }
    }, 180)

    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [form.region_code, form.province_code, form.city_code, form.city_name, form.barangay_name])

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
      } catch (err) {
        if (!active) return
        setDuplicateState({ loading: false, matches: [], message: '' })
      }
    }, 260)

    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [form.phone, form.email, isEdit, id])

  const fieldError = {
    first_name: getFieldError('first_name'),
    last_name: getFieldError('last_name'),
    phone: getFieldError('phone'),
    email: getFieldError('email'),
    preferred_contact_method: getFieldError('preferred_contact_method'),
    region_name: getFieldError('region_name'),
    province_name: getFieldError('province_name'),
    city_name: getFieldError('city_name'),
    barangay_name: getFieldError('barangay_name'),
    postal_code: getFieldError('postal_code')
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
            Store basic customer details and at least one contact method for follow-up and service.
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

            <div className="form-row customer-form-row-two">
              <div className="form-col">
                <label className="form-label">Preferred Contact Method</label>
                <select
                  className={`form-select ${fieldError.preferred_contact_method ? 'error' : ''}`}
                  value={form.preferred_contact_method}
                  onChange={(event) => onFieldChange('preferred_contact_method', event.target.value)}
                  onBlur={() => onStandardBlur('preferred_contact_method')}
                  disabled={saving}
                >
                  <option value="">Select preferred contact</option>
                  {CONTACT_METHOD_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
                {fieldError.preferred_contact_method ? (
                  <span className="form-error">{fieldError.preferred_contact_method}</span>
                ) : null}
              </div>

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

            <div className="form-row customer-form-row-single">
              <div className="form-col">
                <label className="form-label">House / Unit / Street</label>
                <input
                  className="form-input"
                  value={form.address_line}
                  placeholder="House/Unit, Street"
                  onChange={(event) => onFieldChange('address_line', event.target.value)}
                  onBlur={() => onStandardBlur('address_line')}
                  disabled={saving}
                />
              </div>
            </div>

            <div className="form-row customer-form-row-two">
              <LocationField
                label="Region"
                required
                value={form.region_name}
                placeholder="Select region"
                disabled={saving}
                error={fieldError.region_name}
                helper="Select region first."
                isOpen={activeLocationDropdown === 'region'}
                loading={locationLoading.regions}
                options={locationOptions.regions}
                noResults="No regions found"
                onOpen={() => setActiveLocationDropdown('region')}
                onClose={() => {
                  markTouched('region_name')
                  resolveTypedRegion()
                  closeDropdownSoon('region')
                }}
                onChange={onRegionInput}
                onPick={applyRegion}
              />

              <LocationField
                label="Province"
                required={provinceRequired}
                value={form.province_name}
                placeholder="Select province"
                disabled={saving || isProvinceDisabled}
                error={fieldError.province_name}
                helper={
                  isProvinceDisabled
                    ? 'Select a region first.'
                    : provinceRequired
                      ? 'Type to search provinces.'
                      : 'No province required for this region. You may proceed to city / municipality.'
                }
                isOpen={activeLocationDropdown === 'province'}
                loading={locationLoading.provinces}
                options={locationOptions.provinces}
                noResults="No provinces found"
                onOpen={() => setActiveLocationDropdown('province')}
                onClose={() => {
                  markTouched('province_name')
                  resolveTypedProvince()
                  closeDropdownSoon('province')
                }}
                onChange={onProvinceInput}
                onPick={applyProvince}
                renderOption={(option) => (
                  <>
                    <span>{option.name}</span>
                    {option.region_name ? <small>{option.region_name}</small> : null}
                  </>
                )}
              />
            </div>

            <div className="form-row customer-form-row-two">
              <LocationField
                label="City / Municipality"
                required
                value={form.city_name}
                placeholder="Select city / municipality"
                disabled={saving || isCityDisabled}
                error={fieldError.city_name}
                helper={
                  isCityDisabled
                    ? (!cleanText(form.region_code) ? 'Select a region first.' : 'Select a province first.')
                    : 'Type to search cities and municipalities.'
                }
                isOpen={activeLocationDropdown === 'city'}
                loading={locationLoading.cities}
                options={locationOptions.cities}
                noResults="No cities found"
                onOpen={() => setActiveLocationDropdown('city')}
                onClose={() => {
                  markTouched('city_name')
                  resolveTypedCity()
                  closeDropdownSoon('city')
                }}
                onChange={onCityInput}
                onPick={applyCity}
                renderOption={(option) => (
                  <>
                    <span>{option.name}</span>
                    <small>{[option.type, option.province_name].filter(Boolean).join(' • ')}</small>
                  </>
                )}
              />

              <LocationField
                label="Barangay"
                value={form.barangay_name}
                placeholder="Select barangay"
                disabled={saving || isBarangayDisabled}
                error={fieldError.barangay_name}
                helper={isBarangayDisabled ? 'Select a city / municipality first.' : 'Type to search barangays in the selected city.'}
                isOpen={activeLocationDropdown === 'barangay'}
                loading={locationLoading.barangays}
                options={locationOptions.barangays}
                noResults="No barangays found"
                onOpen={() => setActiveLocationDropdown('barangay')}
                onClose={() => {
                  markTouched('barangay_name')
                  resolveTypedBarangay()
                  closeDropdownSoon('barangay')
                }}
                onChange={onBarangayInput}
                onPick={applyBarangay}
                renderOption={(option) => (
                  <>
                    <span>{option.name}</span>
                    <small>{[option.city_name, option.province_name].filter(Boolean).join(', ')}</small>
                  </>
                )}
              />
            </div>

            <div className="form-row customer-form-row-two">
              <div className="form-col">
                <label className="form-label">Postal Code</label>
                <input
                  className={`form-input ${fieldError.postal_code ? 'error' : ''}`}
                  value={form.postal_code}
                  placeholder="Postal Code"
                  onChange={(event) => onFieldChange('postal_code', event.target.value)}
                  onBlur={() => onStandardBlur('postal_code')}
                  disabled={saving}
                />
                {fieldError.postal_code ? <span className="form-error">{fieldError.postal_code}</span> : null}
              </div>
            </div>

            {locationMessage ? <div className="form-help" style={{ marginTop: 6 }}>{locationMessage}</div> : null}

            <div className="form-row customer-form-row-single">
              <div className="form-col">
                <label className="form-label">Notes</label>
                <textarea
                  className="form-textarea"
                  rows={4}
                  value={form.notes}
                  placeholder="Important reminders or customer-related remarks"
                  onChange={(event) => onFieldChange('notes', event.target.value)}
                  onBlur={() => onStandardBlur('notes')}
                  disabled={saving}
                />
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
                onClick={() => navigate('/customers')}
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

