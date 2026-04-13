const SCANNED_CODE_PATTERN = /^[A-Z0-9._-]{1,128}$/

function normalizeScannedCode(value) {
  return String(value || '')
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
  normalizeScannedCode,
  isScannedCodeValid,
  sanitizeFileToken
}
