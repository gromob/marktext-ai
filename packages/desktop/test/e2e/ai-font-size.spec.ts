import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { _electron, expect, test } from '@playwright/test'
import type { Page } from 'playwright'
import { launchWithMarkdown, expectNoRendererErrors, installRendererErrorCounter } from './helpers'

const sizes = (page: Page, selectors: string[]) => page.evaluate(list => list.map(selector => {
  const element = document.querySelector(selector)
  if (!element) throw new Error(`Missing font sample: ${selector}`)
  return Number.parseFloat(getComputedStyle(element).fontSize)
}), selectors)

test('AI typography syncs with Preferences, scales menus and survives an app restart', async() => {
  const server = createServer((_req, res) => {
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ data: [{ id: 'font-model' }] }))
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Test server unavailable')
  const url = `http://127.0.0.1:${address.port}/v1`
  const initial = await launchWithMarkdown('# Font test\n\nOriginal text.\n', { suppressErrorDialog: true, preferences: { language: 'en' } })
  let { app, page } = initial
  const paths = await app.evaluate(({ app }) => ({ profile: app.getPath('userData'), executablePath: app.getPath('exe'), root: app.getAppPath() }))
  const openPreferences = async() => {
    const next = app.waitForEvent('window')
    await app.evaluate(({ ipcMain }) => { ipcMain.emit('app-create-settings-window') })
    const settings = await next
    await settings.waitForSelector('.pref-container')
    await settings.evaluate(() => { location.hash = '#/preference/editor' })
    await settings.getByTestId('ai-font-size-preference').waitFor()
    return settings
  }
  try {
    await page.evaluate(async(baseUrl) => {
      await window.electron.ai.configure({ provider: 'splash', baseUrl })
      await window.electron.ai.configure({ provider: 'local', baseUrl })
    }, url)
    await page.getByTestId('ai-toggle').click()
    await expect(page.getByTestId('ai-font-size')).toHaveText('13 px')
    const settings = await openPreferences()
    const slider = settings.getByTestId('ai-font-size-preference').getByRole('slider')
    await expect(slider).toHaveAttribute('aria-valuenow', '13')
    await expect(page.getByTestId('ai-manage-servers')).toBeEnabled()
    await page.getByTestId('ai-manage-servers').click()
    await page.getByTestId('ai-server-name').waitFor()
    const selectors = ['.empty-chat', '.chat-composer textarea', '.composer-tools select', '.connection-controls select', '.local-manager', '.local-manager input', '.local-manager select', '.local-manager button']
    const baseline = await sizes(page, selectors)
    await page.getByTestId('ai-font-larger').click()
    await expect(slider).toHaveAttribute('aria-valuenow', '14')
    await slider.press('End')
    await expect(page.getByTestId('ai-font-size')).toHaveText('24 px')
    await expect(page.getByTestId('ai-font-larger')).toBeDisabled()
    const enlarged = await sizes(page, selectors)
    enlarged.forEach((size, index) => expect(size / baseline[index]).toBeCloseTo(24 / 13, 2))
    await page.getByTestId('ai-manage-servers').click()
    await page.getByRole('button', { name: '연결 설정', exact: true }).click()
    const quickSettings = await sizes(page, ['.connection-settings label', '.connection-settings input', '.connection-settings button'])
    expect(quickSettings[0]).toBeCloseTo(24 * 12 / 13, 2)
    expect(quickSettings[1]).toBeCloseTo(quickSettings[0], 2)
    expect(quickSettings[2]).toBeCloseTo(24 * 11 / 13, 2)
    await slider.press('Home')
    await expect(page.getByTestId('ai-font-size')).toHaveText('12 px')
    await expect(page.getByTestId('ai-font-smaller')).toBeDisabled()
    for (let index = 0; index < 6; index++) await slider.press('ArrowRight')
    await expect(page.getByTestId('ai-font-size')).toHaveText('18 px')
    await expect.poll(() => JSON.parse(readFileSync(join(paths.profile, 'preferences.json'), 'utf8')).aiFontSize).toBe(18)
    expect(JSON.parse(readFileSync(join(paths.profile, 'preferences.json'), 'utf8')).fontSize).toBe(16)
    await expect(page.locator('.editor-component')).toContainText('Original text.')
    await expectNoRendererErrors(app)
    await app.close()
    app = await _electron.launch({ executablePath: paths.executablePath, args: [paths.root, '--user-data-dir', paths.profile, initial.filePath], env: { ...process.env, MARKTEXT_ERROR_INTERACTION: '1' } })
    await installRendererErrorCounter(app)
    page = await app.firstWindow()
    await page.getByTestId('ai-toggle').click()
    await expect(page.getByTestId('ai-font-size')).toHaveText('18 px')
    const reopened = await openPreferences()
    await expect(reopened.getByTestId('ai-font-size-preference').getByRole('slider')).toHaveAttribute('aria-valuenow', '18')
    await expectNoRendererErrors(app)
  } finally {
    await app.close()
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  }
})
