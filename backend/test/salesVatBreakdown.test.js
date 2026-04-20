const test = require('node:test')
const assert = require('node:assert/strict')

const { calculateSaleTaxBreakdown, enrichSaleRecord } = require('../src/utils/salesSupport')

test('inclusive VAT breakdown computes Philippine 12% totals correctly', () => {
  const result = calculateSaleTaxBreakdown(400, 0.12)

  assert.equal(result.total, 400)
  assert.equal(result.vatableSales, 357.14)
  assert.equal(result.vatAmount, 42.86)
  assert.equal(result.nonVatSales, 0)
  assert.equal(result.taxRatePercentage, 12)
  assert.equal(result.taxCalculationMethod, 'INCLUSIVE')
  assert.equal(result.invoiceType, 'VAT Invoice')
})

test('non-vat breakdown pushes the full amount into non-vat sales', () => {
  const result = calculateSaleTaxBreakdown(400, 0)

  assert.equal(result.total, 400)
  assert.equal(result.vatableSales, 0)
  assert.equal(result.vatAmount, 0)
  assert.equal(result.nonVatSales, 400)
  assert.equal(result.taxCalculationMethod, 'NON_VAT')
  assert.equal(result.invoiceType, 'Non-VAT Invoice')
})

test('sale enrichment preserves VAT-inclusive percentage math', () => {
  const sale = enrichSaleRecord({
    subtotal: 400,
    discount: 0,
    tax: 42.86,
    total: 400,
    sold_qty: 2,
    returned_qty: 0,
    returned_amount: 0
  })

  assert.equal(sale.vatable_sales, 357.14)
  assert.equal(sale.vat_amount, 42.86)
  assert.equal(sale.non_vat_sales, 0)
  assert.equal(sale.tax_rate_percentage, 12)
  assert.equal(sale.invoice_type, 'VAT Invoice')
})
