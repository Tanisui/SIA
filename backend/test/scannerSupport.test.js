const test = require('node:test')
const assert = require('node:assert/strict')

const {
  normalizeScannedCode,
  isScannedCodeValid
} = require('../src/utils/scannerSupport')

test('normalizeScannedCode trims whitespace and scanner newlines', () => {
  assert.equal(normalizeScannedCode('  prd000123\r\n'), 'PRD000123')
})

test('isScannedCodeValid rejects empty and control-character values', () => {
  assert.equal(isScannedCodeValid(''), false)
  assert.equal(isScannedCodeValid('PRD 001'), false)
  assert.equal(isScannedCodeValid('PRD-001'), true)
})
