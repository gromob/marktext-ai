/* eslint-disable @typescript-eslint/ban-ts-comment, @typescript-eslint/no-require-imports */
// @ts-nocheck
'use strict'

const path = require('path')
const fs = require('fs')
const { builtinModules, createRequire } = require('module')
const checker = require('license-checker')

// license-checker keys packages as "<name>@<version>", and excludePackages
// matches that string exactly — name-only entries don't match. Build the
// workspace exclusions at runtime from each package's own package.json so
// version bumps stay in sync automatically. @marktext/file-icons stays
// pinned because it's a published third-party dep that license-checker
// fails to detect (MIT).
const repoRoot = path.resolve(__dirname, '..')
const workspaceExclusions = ['packages/desktop', 'packages/muya']
  .map((rel) => {
    const { name, version } = require(path.join(repoRoot, rel, 'package.json'))
    return `${name}@${version}`
  })
  .concat('@marktext/file-icons')
  .join(';')

const getLicenses = (rootDir, callback) => {
  checker.init(
    {
      start: rootDir,
      production: true,
      development: false,
      direct: true,
      excludePackages: workspaceExclusions,
      json: true,
      // BlueOak-1.0.0 is a permissive, OSI-approved licence that minimatch 10
      // (and its npm-adjacent siblings) moved to.
      onlyAllow:
        'Unlicense;WTFPL;ISC;MIT;BSD;Apache-2.0;MIT*;Apache;Apache*;BSD*;BlueOak-1.0.0;CC0-1.0;CC-BY-4.0;CC-BY-3.0'
    },
    function(err, packages) {
      callback(err, packages, checker)
    }
  )
}

// read-installed misses pnpm's transitive symlinks; resolve each production
// edge from its owning package before collecting that package's notice.
const getInstalledLicenses = async(rootDir) => {
  const visited = new Map()
  const visit = (directory) => {
    directory = fs.realpathSync(directory)
    if (visited.has(directory)) return
    const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'package.json'), 'utf8'))
    visited.set(directory, manifest)
    const resolver = createRequire(path.join(directory, 'package.json'))
    const peers = Object.fromEntries(Object.entries(manifest.peerDependencies || {})
      .filter(([name]) => !manifest.peerDependenciesMeta?.[name]?.optional))
    for (const name of Object.keys({ ...manifest.dependencies, ...manifest.optionalDependencies, ...peers })) {
      const filename = resolver.resolve.paths(name)
        ?.map(base => path.join(base, name, 'package.json'))
        .find(candidate => fs.existsSync(candidate))
      if (filename) visit(path.dirname(filename))
      else if (!manifest.optionalDependencies?.[name] && !builtinModules.includes(name)) {
        throw new Error(`Missing installed dependency: ${manifest.name} -> ${name}`)
      }
    }
  }
  visit(rootDir)
  const packages = {}
  for (const [directory, manifest] of visited) {
    if (directory === fs.realpathSync(rootDir) || manifest.name === '@muyajs/core') continue
    const key = `${manifest.name}@${manifest.version}`
    const metadata = await new Promise((resolve, reject) => {
      checker.init({
        start: directory, production: true, development: false, direct: true,
        customFormat: { licenseText: '' }, json: true
      }, (error, result) => {
        if (error) reject(error)
        else resolve(result[key] || result[`${manifest.name}@${manifest.version.replace(/^v/, '')}`] || {})
      })
    })
    const noticeFiles = fs.readdirSync(directory).filter(name =>
      /^(licen[cs]e|copying|copyright|notice)(?:[._-]|$)/i.test(name)
      && fs.statSync(path.join(directory, name)).isFile()).sort()
    packages[key] = {
      ...metadata,
      manifest,
      noticeFiles: noticeFiles.map(name => ({ name, text: fs.readFileSync(path.join(directory, name), 'utf8').trim() }))
    }
  }
  return packages
}

// Check that all production dependencies are allowed.
const validateLicenses = (rootDir) => {
  getLicenses(rootDir, (err, packages, checker) => {
    if (err) {
      console.log(`[ERROR] ${err}`)
      process.exit(1)
    }
    if (!packages || Object.keys(packages).length === 0) {
      console.log('[ERROR] No packages found — check your start path and filters.')
      process.exit(1)
    }
    console.log(checker.asSummary(packages))
  })
}

module.exports = {
  getLicenses,
  getInstalledLicenses,
  validateLicenses
}
