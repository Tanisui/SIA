const test = require('node:test')
const assert = require('node:assert/strict')

const {
  extractScannedCodeToken,
  normalizeScannedCode,
  isScannedCodeValid
} = require('../src/utils/scannerSupport')

test('extractScannedCodeToken pulls the scan query parameter from QR links', () => {
  assert.equal(
    extractScannedCodeToken('https://pos.local/sales?tab=pos&scan=bar-001'),
    'bar-001'
  )
})

test('normalizeScannedCode extracts wrapped JSON scan payloads', () => {
  assert.equal(
    normalizeScannedCode('{"barcode":"bar-001"}'),
    'BAR-001'
  )
})

test('normalizeScannedCode trims whitespace and scanner newlines', () => {
  assert.equal(normalizeScannedCode('  prd000123\r\n'), 'PRD000123')
})

test('isScannedCodeValid rejects empty and control-character values', () => {
  assert.equal(isScannedCodeValid(''), false)
  assert.equal(isScannedCodeValid('PRD 001'), false)
  assert.equal(isScannedCodeValid('PRD-001'), true)
  assert.equal(isScannedCodeValid('https://pos.local/sales?tab=pos&scan=prd-001'), true)
})
