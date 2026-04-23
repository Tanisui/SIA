const express = require('express')
const router = express.Router()
const db = require('../database')
const { verifyToken, authorize } = require('../middleware/authMiddleware')
const {
  PH_SEED_REGIONS,
  PH_SEED_PROVINCES,
  PH_SEED_CITIES,
  PH_SEED_BARANGAY_ROWS
} = require('../utils/phLocationSeed')
const { WALK_IN_CUSTOMER_LABEL, ensureWalkInCustomerProfiles } = require('../utils/salesSupport')

const SALE_STATUSES_FOR_CUSTOMER_METRICS = ['COMPLETED', 'REFUNDED']
const AUTO_WALK_IN_PROFILE_NOTE = 'Auto-created walk-in customer profile.'
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i
const PH_MOBILE_PATTERN = /^\+639\d{9}$/
const POSTAL_PATTERN = /^\d{4}$/

const NAME_MAX_LENGTH = 120
const NICKNAME_MAX_LENGTH = 80
const ADDRESS_LINE_MAX_LENGTH = 180
const REGION_MAX_LENGTH = 140
const BARANGAY_MAX_LENGTH = 120
const CITY_MAX_LENGTH = 120
const PROVINCE_MAX_LENGTH = 120
const POSTAL_CODE_MAX_LENGTH = 10
const NOTES_MAX_LENGTH = 600
const LOCATION_CODE_MAX_LENGTH = 80

const PREFERRED_CONTACT_METHODS = [
  'SMS',
  'Call',
  'Email',
  'Facebook/Messenger',
  'Viber'
]

const PH_LOCATIONS_BASE_URL = 'https://psgc.cloud/api/v1'
const PH_LOCATION_DEFAULT_LIMIT = 25
const PH_LOCATION_MAX_LIMIT = 50
const PH_LOCATION_CACHE_TTL_MS = 1000 * 60 * 30
const PH_LOCATION_FETCH_TIMEOUT_MS = 2500
const PH_LOCATION_CACHE = new Map()

const MATCH_SALE_TO_CUSTOMER_SQL = `
(
  s.customer_id = c.id
  OR (
    s.customer_id IS NULL
    AND LOWER(TRIM(COALESCE(s.customer_name_snapshot, ''))) = LOWER(TRIM(COALESCE(NULLIF(c.full_name, ''), COALESCE(c.name, ''))))
    AND (
      COALESCE(TRIM(c.phone), '') = ''
      OR COALESCE(TRIM(s.customer_phone_snapshot), '') = COALESCE(TRIM(c.phone), '')
    )
  )
)
`

let ensureCustomerSchemaPromise = null

function toMoney(value) {
  return Number(Number(value || 0).toFixed(2))
}

function hasOwn(payload, key) {
  return Object.prototype.hasOwnProperty.call(payload || {}, key)
}

function createValidationError(message) {
  const err = new Error(message)
  err.statusCode = 400
  return err
}

function createConflictError(message, duplicates = []) {
  const err = new Error(message)
  err.statusCode = 409
  err.duplicates = duplicates
  return err
}

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeSingleLine(value) {
  return normalizeText(value).replace(/\s+/g, ' ')
}

function normalizeSearchTerm(value, maxLength = 80) {
  return normalizeSingleLine(value).slice(0, maxLength)
}

function clampLocationLimit(value) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return PH_LOCATION_DEFAULT_LIMIT
  return Math.max(5, Math.min(PH_LOCATION_MAX_LIMIT, Math.floor(parsed)))
}

function clampCustomerSearchLimit(value) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return 10
  return Math.max(1, Math.min(25, Math.floor(parsed)))
}

function buildLocationCacheKey(path, params = {}) {
  const entries = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null && String(value).trim() !== '')
    .sort(([a], [b]) => a.localeCompare(b))

  const key = entries
    .map(([paramKey, value]) => `${paramKey}=${String(value)}`)
    .join('&')

  return `${path}?${key}`
}

function parseLocationApiRows(payload) {
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload?.data)) return payload.data
  if (Array.isArray(payload?.items)) return payload.items
  if (Array.isArray(payload?.results)) return payload.results
  return []
}

async function fetchJsonWithTimeout(url) {
  if (typeof fetch !== 'function') {
    throw new Error('Global fetch is unavailable for location provider')
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), PH_LOCATION_FETCH_TIMEOUT_MS)

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal
    })

    if (!response.ok) {
      throw new Error(`Location provider responded with HTTP ${response.status}`)
    }

    return response.json()
  } finally {
    clearTimeout(timeout)
  }
}

async function fetchPhLocationRows(path, params = {}) {
  const cacheKey = buildLocationCacheKey(path, params)
  const now = Date.now()
  const cached = PH_LOCATION_CACHE.get(cacheKey)

  if (cached && cached.expiresAt > now) {
    return cached.rows
  }

  const url = new URL(`${PH_LOCATIONS_BASE_URL}${path}`)
  for (const [paramKey, paramValue] of Object.entries(params)) {
    if (paramValue === undefined || paramValue === null || String(paramValue).trim() === '') continue
    url.searchParams.set(paramKey, String(paramValue))
  }

  const payload = await fetchJsonWithTimeout(url.toString())
  const rows = parseLocationApiRows(payload)

  PH_LOCATION_CACHE.set(cacheKey, {
    rows,
    expiresAt: now + PH_LOCATION_CACHE_TTL_MS
  })

  return rows
}

function normalizeOptionName(value) {
  return normalizeSingleLine(value)
}

function toSlug(value) {
  return normalizeSingleLine(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function mapRegionOption(row) {
  const code = normalizeText(row?.code || row?.region_code || row?.regionCode)
  const name = normalizeOptionName(row?.name || row?.region_name || row?.regionName || row?.region)
  if (!name) return null

  return {
    code: code || `region:${toSlug(name)}`,
    name,
    label: name
  }
}

function mapProvinceOption(row) {
  const code = normalizeText(row?.code || row?.province_code || row?.provinceCode)
  const name = normalizeOptionName(row?.name || row?.province_name || row?.provinceName)
  const regionName = normalizeOptionName(row?.region_name || row?.regionName || row?.region)
  const regionCode = normalizeText(row?.region_code || row?.regionCode)

  if (!name) return null

  return {
    code: code || `province:${name.toLowerCase()}`,
    name,
    region_code: regionCode || null,
    region_name: regionName || null,
    label: regionName ? `${name} (${regionName})` : name
  }
}

function mapCityMunicipalityOption(row) {
  const code = normalizeText(row?.code || row?.city_code || row?.cityCode || row?.municipality_code || row?.municipalityCode)
  const name = normalizeOptionName(row?.name || row?.city_name || row?.cityName || row?.municipality_name || row?.municipalityName)
  const provinceCode = normalizeText(row?.province_code || row?.provinceCode)
  const provinceName = normalizeOptionName(row?.province_name || row?.provinceName)
  const regionCode = normalizeText(row?.region_code || row?.regionCode)
  const regionName = normalizeOptionName(row?.region_name || row?.regionName)
  const type = normalizeOptionName(row?.type || row?.city_municipality_type || row?.cityMunicipalityType)

  if (!name) return null

  const suffix = [type, provinceName].filter(Boolean).join(' - ')
  const label = suffix ? `${name} (${suffix})` : name

  return {
    code: code || `city:${name.toLowerCase()}`,
    name,
    type: type || null,
    province_code: provinceCode || null,
    province_name: provinceName || null,
    region_code: regionCode || null,
    region_name: regionName || null,
    label
  }
}

function mapBarangayOption(row) {
  const code = normalizeText(row?.code || row?.barangay_code || row?.barangayCode)
  const name = normalizeOptionName(row?.name || row?.barangay_name || row?.barangayName)
  const cityCode = normalizeText(row?.city_code || row?.cityCode || row?.city_municipality_code || row?.cityMunicipalityCode)
  const cityName = normalizeOptionName(row?.city_name || row?.cityName || row?.city_municipality_name || row?.cityMunicipalityName)
  const provinceCode = normalizeText(row?.province_code || row?.provinceCode)
  const provinceName = normalizeOptionName(row?.province_name || row?.provinceName)
  const regionCode = normalizeText(row?.region_code || row?.regionCode)
  const regionName = normalizeOptionName(row?.region_name || row?.regionName)
  if (!name) return null

  return {
    code: code || `barangay:${name.toLowerCase()}`,
    name,
    city_code: cityCode || null,
    city_name: cityName || null,
    province_code: provinceCode || null,
    province_name: provinceName || null,
    region_code: regionCode || null,
    region_name: regionName || null,
    label: name
  }
}

function uniqueLocationOptions(options) {
  const map = new Map()
  for (const option of options) {
    if (!option || !option.name) continue
    const key = option.code || option.name.toLowerCase()
    if (map.has(key)) continue
    map.set(key, option)
  }
  return Array.from(map.values())
}

function mergeLocationOptionSets(...sets) {
  const merged = []
  const seen = new Set()

  for (const set of sets) {
    for (const option of set || []) {
      if (!option || !option.name) continue
      const key = normalizeSingleLine(option.name).toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      merged.push(option)
    }
  }

  return merged
}

function filterLocationOptions(options, query) {
  if (!query) return options
  const term = query.toLowerCase()
  return options.filter((option) => {
    const haystack = `${option?.name || ''} ${option?.label || ''}`.toLowerCase()
    return haystack.includes(term)
  })
}

function getSeedRegionOptions(query, limit) {
  return filterLocationOptions(
    uniqueLocationOptions(PH_SEED_REGIONS.map(mapRegionOption).filter(Boolean)),
    query
  ).slice(0, limit)
}

function getSeedProvinceOptions(query, { regionCode = '', regionName = '' } = {}, limit) {
  const normalizedRegionCode = normalizeText(regionCode)
  const normalizedRegionName = normalizeSingleLine(regionName).toLowerCase()

  let options = PH_SEED_PROVINCES.map(mapProvinceOption).filter(Boolean)
  if (normalizedRegionCode) {
    options = options.filter((option) => normalizeText(option?.region_code) === normalizedRegionCode)
  }
  if (normalizedRegionName) {
    options = options.filter((option) => normalizeSingleLine(option?.region_name).toLowerCase().includes(normalizedRegionName))
  }

  return filterLocationOptions(uniqueLocationOptions(options), query).slice(0, limit)
}

function getSeedCityMunicipalityOptions(query, { provinceCode = '', provinceName = '', regionCode = '', regionName = '' } = {}, limit) {
  const normalizedProvinceCode = normalizeText(provinceCode)
  const normalizedProvinceName = normalizeSingleLine(provinceName).toLowerCase()
  const normalizedRegionCode = normalizeText(regionCode)
  const normalizedRegionName = normalizeSingleLine(regionName).toLowerCase()

  let options = PH_SEED_CITIES.map(mapCityMunicipalityOption).filter(Boolean)

  if (normalizedProvinceCode) {
    options = options.filter((option) => normalizeText(option.province_code) === normalizedProvinceCode)
  }

  if (normalizedProvinceName) {
    options = options.filter((option) => {
      return normalizeSingleLine(option.province_name).toLowerCase().includes(normalizedProvinceName)
    })
  }

  if (normalizedRegionCode) {
    options = options.filter((option) => normalizeText(option.region_code) === normalizedRegionCode)
  }

  if (normalizedRegionName) {
    options = options.filter((option) => normalizeSingleLine(option.region_name).toLowerCase().includes(normalizedRegionName))
  }

  return filterLocationOptions(uniqueLocationOptions(options), query).slice(0, limit)
}

function getSeedBarangayOptions(query, { cityCode = '', cityName = '' } = {}, limit) {
  const normalizedCityCode = normalizeText(cityCode)
  const normalizedCityName = normalizeSingleLine(cityName).toLowerCase()

  let options = PH_SEED_BARANGAY_ROWS.map(mapBarangayOption).filter(Boolean)
  if (normalizedCityCode) {
    options = options.filter((option) => normalizeText(option.city_code) === normalizedCityCode)
  }
  if (normalizedCityName) {
    options = options.filter((option) => normalizeSingleLine(option.city_name).toLowerCase().includes(normalizedCityName))
  }

  return filterLocationOptions(uniqueLocationOptions(options), query).slice(0, limit)
}

async function getLocalRegionFallback(query, limit) {
  const likeValue = query ? `%${query}%` : '%'
  const [rows] = await db.pool.query(
    `SELECT DISTINCT
        COALESCE(NULLIF(TRIM(region_code), ''), CONCAT('local-region-', LOWER(REPLACE(TRIM(region_name), ' ', '-')))) AS code,
        region_name AS name
     FROM customers
     WHERE COALESCE(TRIM(region_name), '') <> ''
       AND region_name LIKE ?
     ORDER BY region_name ASC
     LIMIT ?`,
    [likeValue, limit]
  )

  return rows.map(mapRegionOption).filter(Boolean)
}

async function getLocalProvinceFallback(query, { regionCode = '', regionName = '' } = {}, limit) {
  const likeValue = query ? `%${query}%` : '%'
  const conditions = ["COALESCE(TRIM(COALESCE(province_name, province)), '') <> ''", 'COALESCE(province_name, province) LIKE ?']
  const params = [likeValue]

  if (regionCode) {
    conditions.push('LOWER(TRIM(region_code)) = LOWER(TRIM(?))')
    params.push(regionCode)
  }

  if (regionName) {
    conditions.push('LOWER(TRIM(region_name)) = LOWER(TRIM(?))')
    params.push(regionName)
  }

  params.push(limit)

  const [rows] = await db.pool.query(
    `SELECT DISTINCT
        COALESCE(NULLIF(TRIM(province_code), ''), CONCAT('local-province-', LOWER(REPLACE(TRIM(COALESCE(province_name, province)), ' ', '-')))) AS code,
        COALESCE(province_name, province) AS name,
        region_code,
        region_name
     FROM customers
     WHERE ${conditions.join(' AND ')}
     ORDER BY COALESCE(province_name, province) ASC
     LIMIT ?`,
    params
  )

  return rows.map(mapProvinceOption).filter(Boolean)
}

async function getLocalCityFallback(query, { provinceCode = '', provinceName = '', regionCode = '', regionName = '' } = {}, limit) {
  const conditions = ["COALESCE(TRIM(COALESCE(city_name, city)), '') <> ''", 'COALESCE(city_name, city) LIKE ?']
  const params = [query ? `%${query}%` : '%']

  if (provinceCode) {
    conditions.push('LOWER(TRIM(province_code)) = LOWER(TRIM(?))')
    params.push(provinceCode)
  }

  if (provinceName) {
    conditions.push('LOWER(TRIM(COALESCE(province_name, province))) = LOWER(TRIM(?))')
    params.push(provinceName)
  }

  if (regionCode) {
    conditions.push('LOWER(TRIM(region_code)) = LOWER(TRIM(?))')
    params.push(regionCode)
  }

  if (regionName) {
    conditions.push('LOWER(TRIM(region_name)) = LOWER(TRIM(?))')
    params.push(regionName)
  }

  params.push(limit)

  const [rows] = await db.pool.query(
    `SELECT DISTINCT
        COALESCE(NULLIF(TRIM(city_code), ''), CONCAT('local-city-', LOWER(REPLACE(TRIM(COALESCE(city_name, city)), ' ', '-')))) AS code,
        COALESCE(city_name, city) AS name,
        province_code,
        COALESCE(province_name, province) AS province_name,
        region_code,
        region_name
     FROM customers
     WHERE ${conditions.join(' AND ')}
     ORDER BY COALESCE(city_name, city) ASC
     LIMIT ?`,
    params
  )

  return rows.map(mapCityMunicipalityOption).filter(Boolean)
}

async function getLocalBarangayFallback(query, { cityCode = '', cityName = '', provinceCode = '', regionCode = '' } = {}, limit) {
  const conditions = ["COALESCE(TRIM(COALESCE(barangay_name, barangay)), '') <> ''", 'COALESCE(barangay_name, barangay) LIKE ?']
  const params = [query ? `%${query}%` : '%']

  if (cityCode) {
    conditions.push('LOWER(TRIM(city_code)) = LOWER(TRIM(?))')
    params.push(cityCode)
  }

  if (cityName) {
    conditions.push('LOWER(TRIM(COALESCE(city_name, city))) = LOWER(TRIM(?))')
    params.push(cityName)
  }

  if (provinceCode) {
    conditions.push('LOWER(TRIM(province_code)) = LOWER(TRIM(?))')
    params.push(provinceCode)
  }

  if (regionCode) {
    conditions.push('LOWER(TRIM(region_code)) = LOWER(TRIM(?))')
    params.push(regionCode)
  }

  params.push(limit)

  const [rows] = await db.pool.query(
    `SELECT DISTINCT
        COALESCE(NULLIF(TRIM(barangay_code), ''), CONCAT('local-barangay-', LOWER(REPLACE(TRIM(COALESCE(barangay_name, barangay)), ' ', '-')))) AS code,
        COALESCE(barangay_name, barangay) AS name,
        city_code,
        COALESCE(city_name, city) AS city_name,
        province_code,
        COALESCE(province_name, province) AS province_name,
        region_code,
        region_name
     FROM customers
     WHERE ${conditions.join(' AND ')}
     ORDER BY COALESCE(barangay_name, barangay) ASC
     LIMIT ?`,
    params
  )

  return rows.map(mapBarangayOption).filter(Boolean)
}

function normalizeOptionalSingleLine(value, fieldName, maxLength) {
  const normalized = normalizeSingleLine(value)
  if (!normalized) return null
  if (normalized.length > maxLength) {
    throw createValidationError(`${fieldName} must not exceed ${maxLength} characters`)
  }
  return normalized
}

function normalizeOptionalCode(value, fieldName) {
  const normalized = normalizeText(value)
  if (!normalized) return null
  if (normalized.length > LOCATION_CODE_MAX_LENGTH) {
    throw createValidationError(`${fieldName} must not exceed ${LOCATION_CODE_MAX_LENGTH} characters`)
  }
  return normalized
}

function normalizeName(value, { required = true } = {}) {
  const normalized = normalizeSingleLine(value)
  if (!normalized) {
    if (required) throw createValidationError('full_name is required')
    return null
  }
  if (normalized.length < 2) throw createValidationError('full_name must be at least 2 characters')
  if (normalized.length > NAME_MAX_LENGTH) {
    throw createValidationError(`full_name must not exceed ${NAME_MAX_LENGTH} characters`)
  }
  return normalized
}

function normalizePhone(value) {
  const raw = normalizeText(value)
  if (!raw) return null

  let cleaned = raw.replace(/[^\d+]/g, '')
  if (cleaned.startsWith('00')) cleaned = `+${cleaned.slice(2)}`

  if (cleaned.startsWith('+')) {
    cleaned = `+${cleaned.slice(1).replace(/\D/g, '')}`
  } else {
    cleaned = cleaned.replace(/\D/g, '')
  }

  if (cleaned.startsWith('09') && cleaned.length === 11) {
    cleaned = `+63${cleaned.slice(1)}`
  } else if (cleaned.startsWith('9') && cleaned.length === 10) {
    cleaned = `+63${cleaned}`
  } else if (cleaned.startsWith('63') && cleaned.length === 12) {
    cleaned = `+${cleaned}`
  }

  if (!PH_MOBILE_PATTERN.test(cleaned)) {
    throw createValidationError('phone must be a valid PH mobile number (example: +639171234567 or 09171234567)')
  }

  return cleaned
}

function normalizeEmail(value) {
  const normalized = normalizeText(value).toLowerCase()
  if (!normalized) return null
  if (normalized.length > 255) throw createValidationError('email must not exceed 255 characters')
  if (!EMAIL_PATTERN.test(normalized)) throw createValidationError('email must be a valid email address')
  return normalized
}

function normalizePostalCode(value) {
  const normalized = normalizeText(value)
  if (!normalized) return null
  if (normalized.length > POSTAL_CODE_MAX_LENGTH) {
    throw createValidationError(`postal_code must not exceed ${POSTAL_CODE_MAX_LENGTH} characters`)
  }
  if (!POSTAL_PATTERN.test(normalized)) throw createValidationError('postal_code must be a 4-digit PH postal code')
  return normalized
}

function normalizePreferredContactMethod(value) {
  const normalized = normalizeSingleLine(value)
  if (!normalized) return null

  const matched = PREFERRED_CONTACT_METHODS.find(
    (option) => option.toLowerCase() === normalized.toLowerCase()
  )
  if (!matched) throw createValidationError('preferred_contact_method is invalid')
  return matched
}

function normalizeNotes(value) {
  const normalized = normalizeText(value)
  if (!normalized) return null
  if (normalized.length > NOTES_MAX_LENGTH) {
    throw createValidationError(`notes must not exceed ${NOTES_MAX_LENGTH} characters`)
  }
  return normalized
}

function ensureContactExists(phone, email) {
  if (!phone && !email) {
    throw createValidationError('provide at least one contact detail: phone or email')
  }
}

function formatCustomerCode(customerId) {
  const idNumber = Number(customerId)
  if (!Number.isInteger(idNumber) || idNumber <= 0) return null
  return `CUST-${String(idNumber).padStart(6, '0')}`
}

function composeLegacyAddress(payload) {
  const segments = [
    payload.address_line,
    payload.barangay,
    payload.city,
    payload.province,
    payload.postal_code
  ].filter(Boolean)

  if (!segments.length) return null
  return segments.join(', ')
}

function mapIncomingCustomerBody(body = {}, existing = null) {
  const pick = (modernKey, legacyKey) => {
    if (hasOwn(body, modernKey)) return body[modernKey]
    if (legacyKey && hasOwn(body, legacyKey)) return body[legacyKey]
    if (!existing) return null
    if (existing[modernKey] !== undefined && existing[modernKey] !== null) return existing[modernKey]
    if (legacyKey && existing[legacyKey] !== undefined && existing[legacyKey] !== null) return existing[legacyKey]
    return null
  }

  const full_name = pick('full_name', 'name')
  const nickname = pick('nickname')
  const phone = pick('phone')
  const email = pick('email')
  const preferred_contact_method = pick('preferred_contact_method')
  const address_line = pick('address_line', 'address')
  const region_code = pick('region_code')
  const region_name = pick('region_name', 'region')
  const province_code = pick('province_code')
  const province_name = pick('province_name', 'province')
  const city_code = pick('city_code')
  const city_name = pick('city_name', 'city')
  const barangay_code = pick('barangay_code')
  const barangay_name = pick('barangay_name', 'barangay')
  const postal_code = pick('postal_code')
  const notes = pick('notes')

  const normalized = {
    full_name: normalizeName(full_name, { required: true }),
    nickname: normalizeOptionalSingleLine(nickname, 'nickname', NICKNAME_MAX_LENGTH),
    phone: normalizePhone(phone),
    email: normalizeEmail(email),
    preferred_contact_method: normalizePreferredContactMethod(preferred_contact_method),
    address_line: normalizeOptionalSingleLine(address_line, 'address_line', ADDRESS_LINE_MAX_LENGTH),
    region_code: normalizeOptionalCode(region_code, 'region_code'),
    region_name: normalizeOptionalSingleLine(region_name, 'region_name', REGION_MAX_LENGTH),
    province_code: normalizeOptionalCode(province_code, 'province_code'),
    province_name: normalizeOptionalSingleLine(province_name, 'province_name', PROVINCE_MAX_LENGTH),
    city_code: normalizeOptionalCode(city_code, 'city_code'),
    city_name: normalizeOptionalSingleLine(city_name, 'city_name', CITY_MAX_LENGTH),
    barangay_code: normalizeOptionalCode(barangay_code, 'barangay_code'),
    barangay_name: normalizeOptionalSingleLine(barangay_name, 'barangay_name', BARANGAY_MAX_LENGTH),
    postal_code: normalizePostalCode(postal_code),
    notes: normalizeNotes(notes)
  }

  normalized.region = normalized.region_name || normalized.region_code || null
  normalized.province = normalized.province_name || normalized.province_code || null
  normalized.city = normalized.city_name || normalized.city_code || null
  normalized.barangay = normalized.barangay_name || normalized.barangay_code || null

  ensureContactExists(normalized.phone, normalized.email)
  normalized.name = normalized.full_name
  normalized.address = composeLegacyAddress(normalized)

  return normalized
}

function toSafeCustomerProfile(row) {
  const fullName = normalizeSingleLine(row?.full_name || row?.name) || null
  const addressLine = normalizeSingleLine(row?.address_line || row?.address) || null
  const customerCode = normalizeSingleLine(row?.customer_code) || null
  const regionName = normalizeSingleLine(row?.region_name || row?.region) || null
  const provinceName = normalizeSingleLine(row?.province_name || row?.province) || null
  const cityName = normalizeSingleLine(row?.city_name || row?.city) || null
  const barangayName = normalizeSingleLine(row?.barangay_name || row?.barangay) || null

  return {
    ...row,
    customer_code: customerCode,
    full_name: fullName,
    name: fullName,
    address_line: addressLine,
    address: addressLine,
    region_name: regionName,
    province_name: provinceName,
    city_name: cityName,
    barangay_name: barangayName,
    region: regionName,
    province: provinceName,
    city: cityName,
    barangay: barangayName
  }
}

function normalizeCustomerMetrics(row) {
  const safeRow = toSafeCustomerProfile(row)
  const grossSpent = toMoney(safeRow?.gross_spent)
  const returnsValue = toMoney(safeRow?.returns_value)
  const isWalkInCustomer = isWalkInCustomerProfile(safeRow)
  const walkInReference = extractWalkInReference(safeRow)
  const fullName = normalizeSingleLine(safeRow?.full_name || safeRow?.name)
  const phone = normalizeText(safeRow?.phone)
  const email = normalizeText(safeRow?.email)

  return {
    ...safeRow,
    is_walk_in_customer: isWalkInCustomer,
    customer_type: isWalkInCustomer ? 'Walk-in' : 'Registered',
    display_name: isWalkInCustomer ? WALK_IN_CUSTOMER_LABEL : fullName,
    display_reference: walkInReference,
    display_contact: isWalkInCustomer
      ? 'No contact details captured'
      : [phone, email].filter(Boolean).join(' | '),
    total_orders: Number(safeRow?.total_orders || 0),
    gross_spent: grossSpent,
    returns_value: returnsValue,
    net_spent: toMoney(hasOwn(safeRow, 'net_spent') ? safeRow?.net_spent : grossSpent - returnsValue),
    recent_items_preview: String(safeRow?.recent_items_preview || '').trim()
  }
}

function isWalkInCustomerProfile(row) {
  const name = normalizeSingleLine(row?.full_name || row?.name) || ''
  const notes = normalizeSingleLine(row?.notes) || ''
  const normalizedName = name.toLowerCase()
  const normalizedNotes = notes.toLowerCase()

  return normalizedName === WALK_IN_CUSTOMER_LABEL.toLowerCase()
    || normalizedName.startsWith(`${WALK_IN_CUSTOMER_LABEL.toLowerCase()} -`)
    || normalizedNotes.startsWith(AUTO_WALK_IN_PROFILE_NOTE.toLowerCase())
}

function extractWalkInReference(row) {
  if (!isWalkInCustomerProfile(row)) return null

  const name = normalizeSingleLine(row?.full_name || row?.name) || ''
  const namePrefix = `${WALK_IN_CUSTOMER_LABEL} - `
  if (name.toLowerCase().startsWith(namePrefix.toLowerCase())) {
    return normalizeSingleLine(name.slice(namePrefix.length)) || null
  }

  const notes = normalizeSingleLine(row?.notes) || ''
  const receiptMatch = notes.match(/\bReceipt:\s*([A-Z0-9-]+)/i)
  if (receiptMatch?.[1]) return receiptMatch[1]

  const saleMatch = notes.match(/\bSale:\s*([A-Z0-9-]+)/i)
  if (saleMatch?.[1]) return saleMatch[1]

  return null
}

async function ensureCustomerSchema() {
  if (ensureCustomerSchemaPromise) return ensureCustomerSchemaPromise

  ensureCustomerSchemaPromise = (async () => {
    const [columns] = await db.pool.query(`
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'customers'
    `)

    const existing = new Set(
      columns.map((row) => String(row.COLUMN_NAME || '').toLowerCase())
    )
    const alterClauses = []

    if (!existing.has('customer_code')) alterClauses.push("ADD COLUMN customer_code VARCHAR(40) NULL AFTER id")
    if (!existing.has('full_name')) alterClauses.push("ADD COLUMN full_name VARCHAR(255) NULL AFTER customer_code")
    if (!existing.has('nickname')) alterClauses.push("ADD COLUMN nickname VARCHAR(120) NULL AFTER full_name")
    if (!existing.has('preferred_contact_method')) alterClauses.push("ADD COLUMN preferred_contact_method VARCHAR(50) NULL AFTER email")
    if (!existing.has('address_line')) alterClauses.push("ADD COLUMN address_line VARCHAR(255) NULL AFTER preferred_contact_method")
    if (!existing.has('region_code')) alterClauses.push("ADD COLUMN region_code VARCHAR(80) NULL AFTER address_line")
    if (!existing.has('region_name')) alterClauses.push("ADD COLUMN region_name VARCHAR(140) NULL AFTER region_code")
    if (!existing.has('province_code')) alterClauses.push("ADD COLUMN province_code VARCHAR(80) NULL AFTER region_name")
    if (!existing.has('province_name')) alterClauses.push("ADD COLUMN province_name VARCHAR(120) NULL AFTER province_code")
    if (!existing.has('city_code')) alterClauses.push("ADD COLUMN city_code VARCHAR(80) NULL AFTER province_name")
    if (!existing.has('city_name')) alterClauses.push("ADD COLUMN city_name VARCHAR(120) NULL AFTER city_code")
    if (!existing.has('barangay_code')) alterClauses.push("ADD COLUMN barangay_code VARCHAR(80) NULL AFTER city_name")
    if (!existing.has('barangay_name')) alterClauses.push("ADD COLUMN barangay_name VARCHAR(120) NULL AFTER barangay_code")
    if (!existing.has('barangay')) alterClauses.push("ADD COLUMN barangay VARCHAR(120) NULL AFTER address_line")
    if (!existing.has('city')) alterClauses.push("ADD COLUMN city VARCHAR(120) NULL AFTER barangay")
    if (!existing.has('province')) alterClauses.push("ADD COLUMN province VARCHAR(120) NULL AFTER city")
    if (!existing.has('postal_code')) alterClauses.push("ADD COLUMN postal_code VARCHAR(16) NULL AFTER province")
    if (!existing.has('updated_at')) {
      alterClauses.push("ADD COLUMN updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_at")
    }

    if (alterClauses.length) {
      await db.pool.query(`ALTER TABLE customers ${alterClauses.join(', ')}`)
    }

    const [indexes] = await db.pool.query('SHOW INDEX FROM customers')
    const indexNames = new Set(
      indexes.map((row) => String(row.Key_name || '').toLowerCase())
    )

    if (!indexNames.has('idx_customers_customer_code')) {
      await db.pool.query('CREATE INDEX idx_customers_customer_code ON customers(customer_code)')
    }
    if (!indexNames.has('idx_customers_phone')) {
      await db.pool.query('CREATE INDEX idx_customers_phone ON customers(phone)')
    }
    if (!indexNames.has('idx_customers_email')) {
      await db.pool.query('CREATE INDEX idx_customers_email ON customers(email)')
    }
    if (!indexNames.has('idx_customers_region_code')) {
      await db.pool.query('CREATE INDEX idx_customers_region_code ON customers(region_code)')
    }
    if (!indexNames.has('idx_customers_province_code')) {
      await db.pool.query('CREATE INDEX idx_customers_province_code ON customers(province_code)')
    }
    if (!indexNames.has('idx_customers_city_code')) {
      await db.pool.query('CREATE INDEX idx_customers_city_code ON customers(city_code)')
    }
    if (!indexNames.has('idx_customers_barangay_code')) {
      await db.pool.query('CREATE INDEX idx_customers_barangay_code ON customers(barangay_code)')
    }

    await db.pool.query(`
      UPDATE customers
      SET full_name = COALESCE(NULLIF(TRIM(full_name), ''), NULLIF(TRIM(name), ''))
      WHERE full_name IS NULL OR TRIM(full_name) = ''
    `)

    await db.pool.query(`
      UPDATE customers
      SET name = COALESCE(NULLIF(TRIM(name), ''), NULLIF(TRIM(full_name), ''), name)
      WHERE name IS NULL OR TRIM(name) = ''
    `)

    await db.pool.query(`
      UPDATE customers
      SET customer_code = CONCAT('CUST-', LPAD(id, 6, '0'))
      WHERE customer_code IS NULL OR TRIM(customer_code) = ''
    `)

    await db.pool.query(`
      UPDATE customers
      SET address_line = COALESCE(NULLIF(TRIM(address_line), ''), NULLIF(TRIM(address), ''))
      WHERE address_line IS NULL OR TRIM(address_line) = ''
    `)

    await db.pool.query(`
      UPDATE customers
      SET province_name = COALESCE(NULLIF(TRIM(province_name), ''), NULLIF(TRIM(province), ''))
      WHERE province_name IS NULL OR TRIM(province_name) = ''
    `)

    await db.pool.query(`
      UPDATE customers
      SET city_name = COALESCE(NULLIF(TRIM(city_name), ''), NULLIF(TRIM(city), ''))
      WHERE city_name IS NULL OR TRIM(city_name) = ''
    `)

    await db.pool.query(`
      UPDATE customers
      SET barangay_name = COALESCE(NULLIF(TRIM(barangay_name), ''), NULLIF(TRIM(barangay), ''))
      WHERE barangay_name IS NULL OR TRIM(barangay_name) = ''
    `)

    await db.pool.query(`
      UPDATE customers
      SET address = COALESCE(NULLIF(TRIM(address), ''), NULLIF(TRIM(address_line), ''))
      WHERE address IS NULL OR TRIM(address) = ''
    `)

    await db.pool.query(`
      UPDATE customers
      SET province = COALESCE(NULLIF(TRIM(province), ''), NULLIF(TRIM(province_name), ''))
      WHERE province IS NULL OR TRIM(province) = ''
    `)

    await db.pool.query(`
      UPDATE customers
      SET city = COALESCE(NULLIF(TRIM(city), ''), NULLIF(TRIM(city_name), ''))
      WHERE city IS NULL OR TRIM(city) = ''
    `)

    await db.pool.query(`
      UPDATE customers
      SET barangay = COALESCE(NULLIF(TRIM(barangay), ''), NULLIF(TRIM(barangay_name), ''))
      WHERE barangay IS NULL OR TRIM(barangay) = ''
    `)
  })().catch((err) => {
    ensureCustomerSchemaPromise = null
    throw err
  })

  return ensureCustomerSchemaPromise
}

async function findDuplicateCustomers({ phone = null, email = null, excludeId = null } = {}) {
  const conditions = []
  const params = []

  if (phone) {
    conditions.push('phone = ?')
    params.push(phone)
  }

  if (email) {
    conditions.push('LOWER(TRIM(COALESCE(email, ""))) = ?')
    params.push(email)
  }

  if (!conditions.length) return []

  let sql = `
    SELECT
      id,
      customer_code,
      COALESCE(NULLIF(full_name, ''), NULLIF(name, ''), CONCAT('Customer #', id)) AS full_name,
      phone,
      email
    FROM customers
    WHERE (${conditions.join(' OR ')})
  `

  if (excludeId) {
    sql += ' AND id <> ?'
    params.push(excludeId)
  }

  sql += ' ORDER BY id ASC LIMIT 10'

  const [rows] = await db.pool.query(sql, params)
  return rows.map((row) => ({
    id: Number(row.id) || null,
    customer_code: normalizeSingleLine(row.customer_code) || null,
    full_name: normalizeSingleLine(row.full_name) || null,
    phone: normalizeText(row.phone) || null,
    email: normalizeText(row.email).toLowerCase() || null
  }))
}

async function maybeThrowDuplicateError({ phone = null, email = null, excludeId = null } = {}) {
  const duplicates = await findDuplicateCustomers({ phone, email, excludeId })
  if (!duplicates.length) return

  throw createConflictError(
    'A customer with the same phone or email already exists.',
    duplicates
  )
}

// Searchable PH region suggestions
router.get('/locations/regions', verifyToken, authorize(['customers.view', 'customers.create', 'customers.update']), async (req, res) => {
  try {
    await ensureCustomerSchema()

    const q = normalizeSearchTerm(req.query?.q)
    const limit = clampLocationLimit(req.query?.limit)
    try {
      const rows = await fetchPhLocationRows('/regions', {
        q: q || undefined,
        limit: Math.max(limit, PH_LOCATION_DEFAULT_LIMIT)
      })

      const options = filterLocationOptions(
        uniqueLocationOptions(rows.map(mapRegionOption).filter(Boolean)),
        q
      ).slice(0, limit)

      if (options.length > 0 || q) {
        return res.json({ source: 'psgc', options })
      }

      console.warn('ph region suggestion provider returned no rows; falling back to local/seed')
    } catch (err) {
      console.error('ph region suggestion provider failed:', err?.message || err)
    }

    let localOptions = []
    try {
      localOptions = await getLocalRegionFallback(q, limit)
    } catch (err) {
      console.error('local region fallback failed:', err?.message || err)
    }

    const seedOptions = getSeedRegionOptions(q, limit)
    const options = mergeLocationOptionSets(seedOptions, localOptions).slice(0, limit)
    return res.json({ source: seedOptions.length > 0 ? 'seed' : 'local', options })
  } catch (err) {
    console.error('region suggestions failed:', err?.message || err)
    res.status(500).json({ error: 'failed to load region suggestions' })
  }
})

// Searchable PH province suggestions
router.get('/locations/provinces', verifyToken, authorize(['customers.view', 'customers.create', 'customers.update']), async (req, res) => {
  try {
    await ensureCustomerSchema()

    const q = normalizeSearchTerm(req.query?.q)
    const limit = clampLocationLimit(req.query?.limit)
    const regionCode = normalizeText(req.query?.region_code || req.query?.regionCode)
    const regionName = normalizeSearchTerm(req.query?.region)

    try {
      const rows = await fetchPhLocationRows('/provinces', {
        q: q || undefined,
        region_code: regionCode || undefined,
        limit: Math.max(limit, PH_LOCATION_DEFAULT_LIMIT)
      })

      let options = uniqueLocationOptions(rows.map(mapProvinceOption).filter(Boolean))
      if (regionCode) {
        options = options.filter((option) => normalizeText(option.region_code) === regionCode)
      }
      if (regionName) {
        options = options.filter((option) => normalizeSingleLine(option.region_name).toLowerCase().includes(regionName.toLowerCase()))
      }
      options = filterLocationOptions(options, q).slice(0, limit)

      if (options.length > 0 || q) {
        return res.json({ source: 'psgc', options })
      }

      console.warn('ph province suggestion provider returned no rows; falling back to local/seed')
    } catch (err) {
      console.error('ph province suggestion provider failed:', err?.message || err)
    }

    let localOptions = []
    try {
      localOptions = await getLocalProvinceFallback(q, { regionCode, regionName }, limit)
    } catch (err) {
      console.error('local province fallback failed:', err?.message || err)
    }

    const seedOptions = getSeedProvinceOptions(q, { regionCode, regionName }, limit)
    const options = mergeLocationOptionSets(seedOptions, localOptions).slice(0, limit)
    return res.json({ source: seedOptions.length > 0 ? 'seed' : 'local', options })
  } catch (err) {
    console.error('province suggestions failed:', err?.message || err)
    res.status(500).json({ error: 'failed to load province suggestions' })
  }
})

// Searchable PH city/municipality suggestions
router.get('/locations/cities-municipalities', verifyToken, authorize(['customers.view', 'customers.create', 'customers.update']), async (req, res) => {
  try {
    await ensureCustomerSchema()

    const q = normalizeSearchTerm(req.query?.q)
    const limit = clampLocationLimit(req.query?.limit)
    const provinceCode = normalizeText(req.query?.province_code || req.query?.provinceCode)
    const provinceName = normalizeSearchTerm(req.query?.province)
    const regionCode = normalizeText(req.query?.region_code || req.query?.regionCode)
    const regionName = normalizeSearchTerm(req.query?.region)

    try {
      const rows = await fetchPhLocationRows('/cities-municipalities', {
        q: q || undefined,
        province_code: provinceCode || undefined,
        region_code: regionCode || undefined,
        limit: Math.max(limit, PH_LOCATION_DEFAULT_LIMIT)
      })

      let options = uniqueLocationOptions(rows.map(mapCityMunicipalityOption).filter(Boolean))
      if (provinceCode) {
        options = options.filter((option) => normalizeText(option?.province_code) === provinceCode)
      }
      if (provinceName) {
        options = options.filter((option) => normalizeSingleLine(option?.province_name).toLowerCase().includes(provinceName.toLowerCase()))
      }
      if (regionCode) {
        options = options.filter((option) => normalizeText(option?.region_code) === regionCode)
      }
      if (regionName) {
        options = options.filter((option) => normalizeSingleLine(option?.region_name).toLowerCase().includes(regionName.toLowerCase()))
      }

      options = filterLocationOptions(options, q).slice(0, limit)
      if (options.length > 0 || q) {
        return res.json({ source: 'psgc', options })
      }

      console.warn('ph city suggestion provider returned no rows; falling back to local/seed')
    } catch (err) {
      console.error('ph city suggestion provider failed:', err?.message || err)
    }

    let localOptions = []
    try {
      localOptions = await getLocalCityFallback(q, { provinceCode, provinceName, regionCode, regionName }, limit)
    } catch (err) {
      console.error('local city fallback failed:', err?.message || err)
    }

    const seedOptions = getSeedCityMunicipalityOptions(q, { provinceCode, provinceName, regionCode, regionName }, limit)
    const options = mergeLocationOptionSets(seedOptions, localOptions).slice(0, limit)
    return res.json({ source: seedOptions.length > 0 ? 'seed' : 'local', options })
  } catch (err) {
    console.error('city/municipality suggestions failed:', err?.message || err)
    res.status(500).json({ error: 'failed to load city/municipality suggestions' })
  }
})

// Searchable PH barangay suggestions
router.get('/locations/barangays', verifyToken, authorize(['customers.view', 'customers.create', 'customers.update']), async (req, res) => {
  try {
    await ensureCustomerSchema()

    const q = normalizeSearchTerm(req.query?.q)
    const limit = clampLocationLimit(req.query?.limit)
    const cityCode = normalizeText(req.query?.city_municipality_code || req.query?.cityCode)
    const cityName = normalizeSearchTerm(req.query?.city)
    const provinceCode = normalizeText(req.query?.province_code || req.query?.provinceCode)
    const regionCode = normalizeText(req.query?.region_code || req.query?.regionCode)

    if (!cityCode && !cityName) {
      return res.json({ source: 'seed', options: [] })
    }

    if (cityCode) {
      try {
        const rows = await fetchPhLocationRows(`/cities-municipalities/${encodeURIComponent(cityCode)}/barangays`)
        const options = filterLocationOptions(
          uniqueLocationOptions(rows.map(mapBarangayOption).filter(Boolean)),
          q
        ).slice(0, limit)

        if (options.length > 0 || q) {
          return res.json({ source: 'psgc', options })
        }

        console.warn('ph barangay suggestion provider returned no rows; falling back to local/seed')
      } catch (err) {
        console.error('ph barangay suggestion provider failed:', err?.message || err)
      }
    }

    let localOptions = []
    try {
      localOptions = await getLocalBarangayFallback(q, { cityCode, cityName, provinceCode, regionCode }, limit)
    } catch (err) {
      console.error('local barangay fallback failed:', err?.message || err)
    }

    const seedOptions = getSeedBarangayOptions(q, { cityCode, cityName }, limit)
    const options = mergeLocationOptionSets(seedOptions, localOptions).slice(0, limit)
    return res.json({ source: seedOptions.length > 0 ? 'seed' : 'local', options })
  } catch (err) {
    console.error('barangay suggestions failed:', err?.message || err)
    res.status(500).json({ error: 'failed to load barangay suggestions' })
  }
})

// Duplicate check for frontend inline warnings
router.get('/duplicate-check', verifyToken, authorize(['customers.view', 'customers.create', 'customers.update']), async (req, res) => {
  try {
    await ensureCustomerSchema()

    const phone = hasOwn(req.query, 'phone') ? normalizePhone(req.query.phone) : null
    const email = hasOwn(req.query, 'email') ? normalizeEmail(req.query.email) : null
    const excludeId = Number(req.query?.exclude_id)
    const exclude = Number.isInteger(excludeId) && excludeId > 0 ? excludeId : null

    if (!phone && !email) {
      return res.json({
        duplicate: false,
        matches: []
      })
    }

    const matches = await findDuplicateCustomers({
      phone,
      email,
      excludeId: exclude
    })

    res.json({
      duplicate: matches.length > 0,
      matches
    })
  } catch (err) {
    console.error(err)
    res.status(err?.statusCode || 500).json({ error: err?.message || 'failed to check duplicates' })
  }
})

router.get('/search', verifyToken, authorize(['customers.view', 'sales.create']), async (req, res) => {
  try {
    await ensureCustomerSchema()

    const q = normalizeSearchTerm(req.query?.q)
    const limit = clampCustomerSearchLimit(req.query?.limit)
    const searchToken = q ? `%${q}%` : '%'

    const [rows] = await db.pool.query(
      `SELECT
         id,
         customer_code,
         COALESCE(NULLIF(full_name, ''), NULLIF(name, ''), CONCAT('Customer #', id)) AS full_name,
         phone,
         email
       FROM customers
       WHERE ? = ''
          OR customer_code LIKE ?
          OR COALESCE(NULLIF(full_name, ''), NULLIF(name, '')) LIKE ?
          OR COALESCE(phone, '') LIKE ?
          OR COALESCE(email, '') LIKE ?
       ORDER BY COALESCE(NULLIF(full_name, ''), NULLIF(name, ''), customer_code, CONCAT('Customer #', id)) ASC
       LIMIT ?`,
      [
        q,
        searchToken,
        searchToken,
        searchToken,
        searchToken,
        limit
      ]
    )

    res.json(rows.map((row) => ({
      id: Number(row.id) || null,
      customer_code: normalizeSingleLine(row.customer_code) || null,
      full_name: normalizeSingleLine(row.full_name) || null,
      phone: normalizeText(row.phone) || null,
      email: normalizeText(row.email).toLowerCase() || null
    })))
  } catch (err) {
    console.error(err)
    res.status(err?.statusCode || 500).json({ error: err?.message || 'failed to search customers' })
  }
})

// List customers
router.get('/', verifyToken, authorize('customers.view'), async (req, res) => {
  try {
    await ensureCustomerSchema()
    await ensureWalkInCustomerProfiles()

    const [rows] = await db.pool.query(
      `SELECT
         c.*,
         COALESCE((
           SELECT COUNT(*)
           FROM sales s
           WHERE s.status IN (?, ?)
             AND ${MATCH_SALE_TO_CUSTOMER_SQL}
         ), 0) AS total_orders,
         COALESCE((
           SELECT ROUND(SUM(s.total), 2)
           FROM sales s
           WHERE s.status IN (?, ?)
             AND ${MATCH_SALE_TO_CUSTOMER_SQL}
         ), 0) AS gross_spent,
         COALESCE((
           SELECT ROUND(SUM(sri.quantity * sri.unit_price), 2)
           FROM sale_return_items sri
           JOIN sales s ON s.id = sri.sale_id
           WHERE s.status IN (?, ?)
             AND ${MATCH_SALE_TO_CUSTOMER_SQL}
         ), 0) AS returns_value,
         (
           SELECT MAX(s.date)
           FROM sales s
           WHERE s.status IN (?, ?)
             AND ${MATCH_SALE_TO_CUSTOMER_SQL}
         ) AS last_purchase_at,
         COALESCE((
           SELECT GROUP_CONCAT(
             DISTINCT COALESCE(si.product_name_snapshot, p.name, 'Item')
             ORDER BY s.date DESC
             SEPARATOR ' | '
           )
           FROM sales s
           JOIN sale_items si ON si.sale_id = s.id
           LEFT JOIN products p ON p.id = si.product_id
           WHERE s.status IN (?, ?)
             AND ${MATCH_SALE_TO_CUSTOMER_SQL}
         ), '') AS recent_items_preview
       FROM customers c
       ORDER BY COALESCE(NULLIF(c.full_name, ''), c.name) ASC`,
      [
        SALE_STATUSES_FOR_CUSTOMER_METRICS[0],
        SALE_STATUSES_FOR_CUSTOMER_METRICS[1],
        SALE_STATUSES_FOR_CUSTOMER_METRICS[0],
        SALE_STATUSES_FOR_CUSTOMER_METRICS[1],
        SALE_STATUSES_FOR_CUSTOMER_METRICS[0],
        SALE_STATUSES_FOR_CUSTOMER_METRICS[1],
        SALE_STATUSES_FOR_CUSTOMER_METRICS[0],
        SALE_STATUSES_FOR_CUSTOMER_METRICS[1],
        SALE_STATUSES_FOR_CUSTOMER_METRICS[0],
        SALE_STATUSES_FOR_CUSTOMER_METRICS[1]
      ]
    )

    res.json(rows.map(normalizeCustomerMetrics))
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'failed to fetch customers' })
  }
})

// Get single customer
router.get('/:id', verifyToken, authorize('customers.view'), async (req, res) => {
  try {
    await ensureCustomerSchema()
    await ensureWalkInCustomerProfiles()

    const customerId = Number(req.params.id)
    if (!Number.isInteger(customerId) || customerId <= 0) {
      return res.status(400).json({ error: 'invalid customer id' })
    }

    const [rows] = await db.pool.query(
      `SELECT
         c.*,
         COALESCE((
           SELECT COUNT(*)
           FROM sales s
           WHERE s.status IN (?, ?)
             AND ${MATCH_SALE_TO_CUSTOMER_SQL}
         ), 0) AS total_orders,
         COALESCE((
           SELECT ROUND(SUM(s.total), 2)
           FROM sales s
           WHERE s.status IN (?, ?)
             AND ${MATCH_SALE_TO_CUSTOMER_SQL}
         ), 0) AS gross_spent,
         COALESCE((
           SELECT ROUND(SUM(sri.quantity * sri.unit_price), 2)
           FROM sale_return_items sri
           JOIN sales s ON s.id = sri.sale_id
           WHERE s.status IN (?, ?)
             AND ${MATCH_SALE_TO_CUSTOMER_SQL}
         ), 0) AS returns_value,
         (
           SELECT MAX(s.date)
           FROM sales s
           WHERE s.status IN (?, ?)
             AND ${MATCH_SALE_TO_CUSTOMER_SQL}
         ) AS last_purchase_at,
         COALESCE((
           SELECT GROUP_CONCAT(
             DISTINCT COALESCE(si.product_name_snapshot, p.name, 'Item')
             ORDER BY s.date DESC
             SEPARATOR ' | '
           )
           FROM sales s
           JOIN sale_items si ON si.sale_id = s.id
           LEFT JOIN products p ON p.id = si.product_id
           WHERE s.status IN (?, ?)
             AND ${MATCH_SALE_TO_CUSTOMER_SQL}
         ), '') AS recent_items_preview
       FROM customers c
       WHERE c.id = ?
       LIMIT 1`,
      [
        SALE_STATUSES_FOR_CUSTOMER_METRICS[0],
        SALE_STATUSES_FOR_CUSTOMER_METRICS[1],
        SALE_STATUSES_FOR_CUSTOMER_METRICS[0],
        SALE_STATUSES_FOR_CUSTOMER_METRICS[1],
        SALE_STATUSES_FOR_CUSTOMER_METRICS[0],
        SALE_STATUSES_FOR_CUSTOMER_METRICS[1],
        SALE_STATUSES_FOR_CUSTOMER_METRICS[0],
        SALE_STATUSES_FOR_CUSTOMER_METRICS[1],
        SALE_STATUSES_FOR_CUSTOMER_METRICS[0],
        SALE_STATUSES_FOR_CUSTOMER_METRICS[1],
        customerId
      ]
    )

    if (!rows.length) return res.status(404).json({ error: 'customer not found' })

    const [purchaseLines] = await db.pool.query(
      `SELECT
         si.id AS sale_item_id,
         si.sale_id,
         s.sale_number,
         s.receipt_no,
         s.date AS purchased_at,
         si.qty,
         si.unit_price,
         si.line_total,
         COALESCE(si.product_name_snapshot, p.name, 'Item') AS product_name,
         COALESCE(si.sku_snapshot, p.sku, '') AS sku,
         COALESCE(si.brand_snapshot, p.brand, '') AS brand,
         COALESCE(si.barcode_snapshot, p.barcode, '') AS barcode,
         COALESCE(si.size_snapshot, p.size, '') AS size,
         COALESCE(si.color_snapshot, p.color, '') AS color
       FROM sales s
       JOIN sale_items si ON si.sale_id = s.id
       LEFT JOIN products p ON p.id = si.product_id
       JOIN customers c ON c.id = ?
       WHERE s.status IN (?, ?)
         AND ${MATCH_SALE_TO_CUSTOMER_SQL}
       ORDER BY s.date DESC, si.id DESC
       LIMIT 200`,
      [
        customerId,
        SALE_STATUSES_FOR_CUSTOMER_METRICS[0],
        SALE_STATUSES_FOR_CUSTOMER_METRICS[1]
      ]
    )

    const base = normalizeCustomerMetrics(rows[0])

    res.json({
      ...base,
      recent_purchase_lines: purchaseLines.map((line) => ({
        ...line,
        qty: Number(line.qty || 0),
        unit_price: toMoney(line.unit_price),
        line_total: toMoney(line.line_total)
      }))
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'failed to fetch customer' })
  }
})

// Create customer
router.post('/', express.json(), verifyToken, authorize('customers.create'), async (req, res) => {
  try {
    await ensureCustomerSchema()

    const body = req.body || {}
    const normalized = mapIncomingCustomerBody(body, null)

    await maybeThrowDuplicateError({
      phone: normalized.phone,
      email: normalized.email
    })

    const [result] = await db.pool.query(
      `INSERT INTO customers (
         customer_code,
         full_name,
         name,
         nickname,
         phone,
         email,
         preferred_contact_method,
         address_line,
         region_code,
         region_name,
         province_code,
         province_name,
         city_code,
         city_name,
         barangay_code,
         barangay_name,
         barangay,
         city,
         province,
         postal_code,
         address,
         notes,
         created_at,
         updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [
        null,
        normalized.full_name,
        normalized.name,
        normalized.nickname,
        normalized.phone,
        normalized.email,
        normalized.preferred_contact_method,
        normalized.address_line,
        normalized.region_code,
        normalized.region_name,
        normalized.province_code,
        normalized.province_name,
        normalized.city_code,
        normalized.city_name,
        normalized.barangay_code,
        normalized.barangay_name,
        normalized.barangay,
        normalized.city,
        normalized.province,
        normalized.postal_code,
        normalized.address,
        normalized.notes
      ]
    )

    const generatedCode = formatCustomerCode(result.insertId)
    if (generatedCode) {
      await db.pool.query(
        'UPDATE customers SET customer_code = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [generatedCode, result.insertId]
      )
    }

    const nextCode = formatCustomerCode((Number(result.insertId) || 0) + 1)

    res.json({
      id: result.insertId,
      customer_code: generatedCode,
      next_customer_code: nextCode
    })
  } catch (err) {
    console.error(err)
    res.status(err?.statusCode || 500).json({
      error: err?.message || 'failed to create customer',
      duplicates: err?.duplicates || undefined
    })
  }
})

// Update customer
router.put('/:id', express.json(), verifyToken, authorize('customers.update'), async (req, res) => {
  try {
    await ensureCustomerSchema()

    const customerId = Number(req.params.id)
    if (!Number.isInteger(customerId) || customerId <= 0) {
      return res.status(400).json({ error: 'invalid customer id' })
    }

    const body = req.body || {}
    if (!Object.keys(body).length) {
      return res.status(400).json({ error: 'nothing to update' })
    }

    const [existingRows] = await db.pool.query('SELECT * FROM customers WHERE id = ? LIMIT 1', [customerId])
    if (!existingRows.length) return res.status(404).json({ error: 'customer not found' })
    const existing = existingRows[0]

    const normalized = mapIncomingCustomerBody(body, existing)

    await maybeThrowDuplicateError({
      phone: normalized.phone,
      email: normalized.email,
      excludeId: customerId
    })

    const customerCode = normalizeSingleLine(existing.customer_code) || formatCustomerCode(customerId)

    await db.pool.query(
      `UPDATE customers
       SET
         customer_code = ?,
         full_name = ?,
         name = ?,
         nickname = ?,
         phone = ?,
         email = ?,
         preferred_contact_method = ?,
         address_line = ?,
         region_code = ?,
         region_name = ?,
         province_code = ?,
         province_name = ?,
         city_code = ?,
         city_name = ?,
         barangay_code = ?,
         barangay_name = ?,
         barangay = ?,
         city = ?,
         province = ?,
         postal_code = ?,
         address = ?,
         notes = ?,
         updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        customerCode,
        normalized.full_name,
        normalized.name,
        normalized.nickname,
        normalized.phone,
        normalized.email,
        normalized.preferred_contact_method,
        normalized.address_line,
        normalized.region_code,
        normalized.region_name,
        normalized.province_code,
        normalized.province_name,
        normalized.city_code,
        normalized.city_name,
        normalized.barangay_code,
        normalized.barangay_name,
        normalized.barangay,
        normalized.city,
        normalized.province,
        normalized.postal_code,
        normalized.address,
        normalized.notes,
        customerId
      ]
    )

    res.json({
      success: true,
      customer_code: customerCode
    })
  } catch (err) {
    console.error(err)
    res.status(err?.statusCode || 500).json({
      error: err?.message || 'failed to update customer',
      duplicates: err?.duplicates || undefined
    })
  }
})

// Delete customer
router.delete('/:id', verifyToken, authorize('customers.delete'), async (req, res) => {
  try {
    await db.pool.query('DELETE FROM customers WHERE id = ?', [req.params.id])
    res.json({ success: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'failed to delete customer' })
  }
})

module.exports = router
