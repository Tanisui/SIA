const SCANNED_CODE_PATTERN = /^[A-Z0-9._-]{1,128}$/

function safeDecodeURIComponent(value) {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function extractScannedCodeToken(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''

  const compact = raw.replace(/[\r\n]+/g, '').trim()
  if (!compact) return ''

  const queryParamMatch = compact.match(/[?&](?:scan|code|barcode|sku)=([^&#\s]+)/i)
  if (queryParamMatch?.[1]) {
    return safeDecodeURIComponent(queryParamMatch[1])
  }

  const keyValueMatch = compact.match(/\b(?:scan|code|barcode|sku)\s*[:=]\s*([A-Za-z0-9._-]{1,128})\b/i)
  if (keyValueMatch?.[1]) {
    return keyValueMatch[1]
  }

  if (compact.startsWith('{') && compact.endsWith('}')) {
    try {
      const parsed = JSON.parse(compact)
      if (parsed && typeof parsed === 'object') {
        for (const key of ['scan', 'code', 'barcode', 'sku']) {
          if (parsed[key] !== undefined && parsed[key] !== null && String(parsed[key]).trim()) {
            return String(parsed[key])
          }
        }
      }
    } catch {
      // Leave invalid JSON payloads untouched and treat them as direct codes.
    }
  }

  return compact
}

function normalizeScannedCode(value) {
  return extractScannedCodeToken(value)
    .replace(/[\r\n]+/g, '')
    .trim()
    .toUpperCase()
}

function isScannedCodeValid(value) {
  return SCANNED_CODE_PATTERN.test(normalizeScannedCode(value))
}

function sanitizeFileToken(value) {
  return String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

module.exports = {
  SCANNED_CODE_PATTERN,
  extractScannedCodeToken,
  normalizeScannedCode,
  isScannedCodeValid,
  sanitizeFileToken
}
