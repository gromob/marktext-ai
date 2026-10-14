/* eslint-disable @typescript-eslint/ban-ts-comment, @typescript-eslint/no-require-imports */
// @ts-nocheck
'use strict'

const path = require('path')
const fs = require('fs')
const thirdPartyChecker = require('./thirdPartyChecker.js')
const repoRoot = path.resolve(__dirname, '..')
const desktopRoot = path.join(repoRoot, 'packages/desktop')
const rootLicense = fs.readFileSync(path.join(repoRoot, 'LICENSE'), 'utf8')
const mitTerms = rootLicense.slice(rootLicense.indexOf('Permission is hereby granted')).trim()

const generate = async() => {
  const packages = await thirdPartyChecker.getInstalledLicenses(desktopRoot)
  const keys = Object.keys(packages).sort()
  if (!keys.length) throw new Error('No installed production dependencies found.')
  const summary = []
  const notices = []
  for (const key of keys) {
    const { manifest, noticeFiles, licenseText, licenses: detected } = packages[key]
    const licenses = typeof manifest.license === 'string' ? manifest.license : detected
    if (!licenses || licenses === 'UNKNOWN') throw new Error(`Missing license declaration: ${key}`)
    const repository = typeof manifest.repository === 'string' ? manifest.repository : manifest.repository?.url
    const attribution = typeof manifest.author === 'string' ? manifest.author : manifest.author && JSON.stringify(manifest.author)
    const source = `https://www.npmjs.com/package/${manifest.name}/v/${manifest.version.replace(/^v/, '')}`
    summary.push(`${summary.length + 1}. ${key} (${licenses})`)
    const section = [`# ${key} (${licenses})`, '-------------------------------------------------', `Package source: ${source}`]
    if (repository) section.push(`Repository: ${repository.replace(/^git\+/, '')}`)
    if (attribution) section.push(`Author (package metadata): ${attribution}`)
    section.push('')
    if (noticeFiles.length) {
      for (const notice of noticeFiles) section.push(`--- ${notice.name} ---`, notice.text, '')
    } else {
      section.push('The installed package contains no separate license file.', `Declared license in package metadata: ${licenses}.`, '')
      if (licenseText) section.push('--- Published package README / license material ---', licenseText, '')
      if (licenses === 'MIT') section.push('--- Standard MIT terms for the package-declared MIT license ---', mitTerms, '')
      if (manifest.name === 'vega-util') {
        const vega = keys.find(candidate => candidate.startsWith('vega@'))
        const license = packages[vega]?.noticeFiles.find(notice => /^license/i.test(notice.name))
        if (!license) throw new Error('Missing installed Vega monorepo license for vega-util.')
        section.push('--- Vega monorepo license (from the installed vega package) ---', license.text, '')
      }
      if (!licenseText && licenses !== 'MIT' && manifest.name !== 'vega-util') {
        throw new Error(`Missing published license material: ${key}`)
      }
    }
    notices.push(section.join('\n'))
  }
  const output = `# Third Party Notices
-------------------------------------------------

MarkText AI is an independent fork of MarkText. Its original MIT license is
provided in LICENSE.txt. This inventory includes installed production
dependencies, their transitive dependencies and required peers. Some packages
provide build helpers or assets; inclusion does not imply every file is loaded
at runtime. Electron and Chromium also provide their own bundled license files.

Package versions and original notices are retained. Packages that omit a
separate license file are identified explicitly below. Source links point to
the package version and, where available, its upstream repository.

-------------------------------------------------
# Summary
-------------------------------------------------

${summary.join('\n')}

-------------------------------------------------
# Licenses
-------------------------------------------------

${notices.join('\n\n')}
`
  if (/(?:\/Users\/|\/private\/var\/folders\/|\/var\/folders\/)/.test(output)) {
    throw new Error('Generated notices contain a private local path.')
  }
  fs.writeFileSync(path.join(desktopRoot, 'build', 'THIRD-PARTY-LICENSES.txt'),
    output.replace(/\r\n/g, '\n').replace(/[\t ]+$/gm, ''))
  console.log(`THIRD-PARTY-LICENSES.txt generated successfully (${keys.length} package versions).`)
}

generate().catch(error => {
  console.error(`[ERROR] ${error.message}`)
  process.exitCode = 1
})
