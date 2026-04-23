function normalizeCategoryLabel(value) {
  return String(value || '').trim().replace(/\s+/g, ' ')
}

function normalizeComparableCategory(value) {
  return normalizeCategoryLabel(value)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

function singularizeToken(token) {
  const value = String(token || '').toLowerCase()
  if (value.length <= 3) return value
  if (value.endsWith('ies')) return `${value.slice(0, -3)}y`
  if (value.endsWith('sses')) return value.slice(0, -2)
  if (value.endsWith('ses')) return value.slice(0, -1)
  if (value.endsWith('s') && !value.endsWith('ss')) return value.slice(0, -1)
  return value
}

function getComparableWords(value) {
  return normalizeComparableCategory(value).split(' ').filter(Boolean)
}

function getCategoryTokens(value) {
  const tokens = new Set()
  for (const word of getComparableWords(value)) {
    if (word.length < 3) continue
    tokens.add(word)
    tokens.add(singularizeToken(word))
  }
  return Array.from(tokens).filter(Boolean)
}

function titleCaseToken(value) {
  return String(value || '')
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ')
}

function isCategoryTableTypeForCategory(typeName, categoryName) {
  const typeLabel = normalizeCategoryLabel(typeName)
  const categoryLabel = normalizeCategoryLabel(categoryName)
  if (!typeLabel || !categoryLabel) return false
  if (normalizeComparableCategory(typeLabel) === normalizeComparableCategory(categoryLabel)) return false

  const typeWords = getComparableWords(typeLabel)
  if (typeWords.length < 2) return false

  const typeTokens = new Set(getCategoryTokens(typeLabel))
  return getCategoryTokens(categoryLabel).some((token) => typeTokens.has(token))
}

function deriveCategoryAndTypeFromBaleCategory(rawName, categoryRows = []) {
  const label = normalizeCategoryLabel(rawName)
  if (!label) return { categoryName: '', typeName: null }

  const words = getComparableWords(label)
  const lastWord = words[words.length - 1] || ''
  const baseToken = singularizeToken(lastWord)
  const baseCategoryName = titleCaseToken(baseToken)

  if (baseCategoryName) {
    const matchingTypeCount = categoryRows.filter((row) => (
      isCategoryTableTypeForCategory(row?.name, baseCategoryName)
    )).length
    const labelLooksLikeType = isCategoryTableTypeForCategory(label, baseCategoryName)
    const pluralBaseName = words.length === 1 && singularizeToken(words[0]) !== words[0]

    if (labelLooksLikeType && matchingTypeCount > 0) {
      return { categoryName: baseCategoryName, typeName: label }
    }

    if (pluralBaseName && matchingTypeCount > 0) {
      return { categoryName: baseCategoryName, typeName: null }
    }
  }

  return { categoryName: label, typeName: null }
}

function mergeCategoryTypeOptions(category, options = []) {
  const deduped = new Map()
  for (const option of options) {
    const name = normalizeCategoryLabel(option?.name)
    if (!name) continue
    if (category?.name && normalizeComparableCategory(name) === normalizeComparableCategory(category.name)) continue

    const key = normalizeComparableCategory(name)
    if (deduped.has(key)) continue
    deduped.set(key, {
      id: option?.id || null,
      category_id: category?.id || option?.category_id || null,
      name,
      description: option?.description || null,
      source: option?.source || null
    })
  }

  return Array.from(deduped.values()).sort((a, b) => a.name.localeCompare(b.name))
}

module.exports = {
  deriveCategoryAndTypeFromBaleCategory,
  isCategoryTableTypeForCategory,
  mergeCategoryTypeOptions,
  normalizeCategoryLabel,
  normalizeComparableCategory
}
