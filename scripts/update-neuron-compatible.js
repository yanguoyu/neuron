const fs = require('fs')
const path = require('path')

const exec = () => {
  const compatiblePath = path.resolve(__dirname, '../compatible.json')
  const info = require(compatiblePath)
  const packagePath = path.resolve(__dirname, '../package.json')
  const currentNeuronFullVersion = require(packagePath).version
  const updateNeuronVersion = currentNeuronFullVersion.split('.').slice(0, 2).join('.')

  const lastNeuronVersion = Object.keys(info.compatible).sort((a, b) => {
    const [aMajor, aMinor] = a.split('.')?.map(v => +v) ?? []
    const [bMajor, bMinor] = b.split('.')?.map(v => +v) ?? []
    if (aMajor !== bMajor) return bMajor - aMajor
    return bMinor - aMinor
  })[0]

  if (updateNeuronVersion && lastNeuronVersion !== updateNeuronVersion) {
    info.compatible[updateNeuronVersion] = {
      full: [...info.compatible[lastNeuronVersion].full],
      light: [...info.compatible[lastNeuronVersion].light],
    }
    fs.writeFileSync(compatiblePath, `${JSON.stringify(info, null, 2)}\r\n`)
  } else {
    process.exit(1)
  }
}

exec()

