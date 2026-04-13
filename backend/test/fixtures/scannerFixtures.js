function createMockConnection(overrides = {}) {
  const state = {
    products: overrides.products || [],
    draftSales: overrides.draftSales || [],
    saleItems: overrides.saleItems || [],
    scanEvents: overrides.scanEvents || []
  }

  return {
    state,
    async query(sql, params = []) {
      const normalizedSql = String(sql).replace(/\s+/g, ' ').trim()

      if (normalizedSql.includes('FROM products') && normalizedSql.includes('UPPER(TRIM(barcode)) = ?')) {
        const code = String(params[0] || '').toUpperCase()
        const match = state.products.find((product) => {
          const barcode = String(product.barcode || '').trim().toUpperCase()
          const sku = String(product.sku || '').trim().toUpperCase()
          return barcode === code || sku === code
        })
        return [[match || null].filter(Boolean)]
      }

      throw new Error(`Unsupported mock query: ${normalizedSql}`)
    }
  }
}

module.exports = {
  createMockConnection
}
