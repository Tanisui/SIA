const crypto = require('crypto')

let runtimeJwtSecret = null

function getJwtSecret() {
  if (process.env.JWT_SECRET && String(process.env.JWT_SECRET).trim()) {
    return process.env.JWT_SECRET
  }

  // Generate once per process when env secret is missing.
  if (!runtimeJwtSecret) {
    runtimeJwtSecret = crypto.randomBytes(48).toString('hex')
    console.warn('JWT_SECRET is not set. Using generated in-memory secret for this runtime only.')
  }

  return runtimeJwtSecret
}

function getDefaultNewUserPassword() {
  if (process.env.DEFAULT_NEW_USER_PASSWORD && String(process.env.DEFAULT_NEW_USER_PASSWORD).trim()) {
    return process.env.DEFAULT_NEW_USER_PASSWORD
  }

  // Project default for auto-generated accounts.
  return 'Nstyle2026!'
}

module.exports = {
  getJwtSecret,
  getDefaultNewUserPassword
}
