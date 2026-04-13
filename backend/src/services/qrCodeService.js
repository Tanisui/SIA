const fs = require('fs/promises')
const path = require('path')
const QRCode = require('qrcode')
const { normalizeScannedCode, sanitizeFileToken } = require('../utils/scannerSupport')

function getQrStorageRoot() {
  return process.env.QR_STORAGE_DIR
    ? path.resolve(process.env.QR_STORAGE_DIR)
    : path.resolve(__dirname, '..', '..', 'uploads', 'qr')
}

function buildPublicQrPath(fileName) {
  return `/uploads/qr/${fileName}`
}

async function ensureQrStorageDirectory() {
  await fs.mkdir(getQrStorageRoot(), { recursive: true })
}

async function generateProductQrImage({ productId, code }) {
  const normalizedCode = normalizeScannedCode(code)
  if (!normalizedCode) {
    throw new Error('valid code is required for QR generation')
  }

  await ensureQrStorageDirectory()

  const fileName = `product-${Number(productId)}-${sanitizeFileToken(normalizedCode)}.png`
  const filePath = path.join(getQrStorageRoot(), fileName)

  await QRCode.toFile(filePath, normalizedCode, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 320
  })

  return {
    fileName,
    filePath,
    publicPath: buildPublicQrPath(fileName)
  }
}

module.exports = {
  getQrStorageRoot,
  buildPublicQrPath,
  ensureQrStorageDirectory,
  generateProductQrImage
}
