const fs = require('fs')
const path = require('path')

const testDir = __dirname
const testFiles = fs.readdirSync(testDir)
  .filter((fileName) => fileName.endsWith('.test.js'))
  .sort((a, b) => a.localeCompare(b))

for (const fileName of testFiles) {
  require(path.join(testDir, fileName))
}
