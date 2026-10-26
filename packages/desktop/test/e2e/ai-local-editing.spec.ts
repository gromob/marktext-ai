import { createServer, type Server } from 'node:http'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { _electron, expect, test } from '@playwright/test'
import { launchWithMarkdown, expectNoRendererErrors, installRendererErrorCounter } from './helpers'

test('local settings, authenticated editing, undo and provider selection use the real IPC transport', async() => {
  const requests: Array<{ model: string; messages: unknown[] }> = []
  let malformed = false
  let conversation = false
  let splashOffline = false
  const server: Server = createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json')
    const isSplash = req.url?.startsWith('/splash/')
    const route = isSplash ? req.url?.slice('/splash'.length) : req.url
    if (isSplash && splashOffline) { res.writeHead(503).end('{}'); return }
    if (req.headers.authorization !== (isSplash ? 'Bearer local' : 'Bearer test-local-key')) { res.writeHead(401).end('{}'); return }
    if (route === '/v1/models') { res.end(JSON.stringify({ data: [{ id: isSplash ? 'mlx-community/Qwen3.8-27B-4bit' : 'local-test-model' }] })); return }
    if (route !== '/v1/chat/completions') { res.writeHead(404).end('{}'); return }
    let input = ''
    req.on('data', chunk => { input += chunk })
    req.on('end', () => {
      requests.push(JSON.parse(input))
      res.end(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: malformed ? 'invalid JSON' : JSON.stringify({ markdown: conversation ? null : '# Title\n\nLocally revised.\n', summary: isSplash ? '저는 Splash 모델입니다.' : conversation ? '저는 local-test-model로 연결된 로컬 AI입니다.' : '로컬 모델로 수정했습니다.' }) } }] }))
    })
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Test server unavailable')
  const baseUrl = `http://127.0.0.1:${address.port}/v1`
  const { app, page } = await launchWithMarkdown('# Title\n\nOriginal paragraph.\n', { suppressErrorDialog: true })
  try {
    await page.evaluate(async(url) => {
      localStorage.setItem('marktext-ai:selected-model', 'codex-test-model')
      await window.electron.ai.configure({ provider: 'splash', baseUrl: url.replace('/v1', '/splash/v1') })
      await window.electron.ai.configure({ provider: 'local', baseUrl: url, apiKey: 'test-local-key' })
    }, baseUrl)
    await page.getByTestId('ai-toggle').click()
    await expect(page.getByTestId('ai-provider')).toHaveValue('local')
    await expect(page.getByTestId('ai-model').locator('option[value="local:local-test-model"]')).toHaveCount(1)
    await page.getByTestId('ai-model').selectOption('local:local-test-model')
    await page.getByTestId('ai-mode').click()
    await page.getByTestId('ai-instruction').fill('문장을 수정하세요.')
    await page.getByTestId('ai-generate').click()
    await expect(page.locator('.editor-component')).toContainText('Locally revised.')
    expect(requests).toHaveLength(1)
    expect(requests[0].model).toBe('local-test-model')
    await page.getByTestId('ai-undo').click()
    await expect(page.locator('.editor-component')).toContainText('Original paragraph.')

    malformed = true
    await page.getByTestId('ai-instruction').fill('다시 수정하세요.')
    await page.getByTestId('ai-generate').click()
    await expect(page.getByTestId('ai-error')).toContainText('응답 형식')
    await expect(page.locator('.editor-component')).toContainText('Original paragraph.')
    expect(requests).toHaveLength(2)

    malformed = false
    conversation = true
    await page.getByTestId('ai-mode').click()
    await page.getByTestId('ai-instruction').fill('너는 누구야?')
    await page.getByTestId('ai-generate').click()
    await expect(page.getByTestId('ai-message-assistant').last()).toHaveText('저는 local-test-model로 연결된 로컬 AI입니다.')
    await expect(page.locator('.editor-component')).toContainText('Original paragraph.')
    await expect(page.getByTestId('ai-undo')).toHaveCount(0)
    await expect(page.locator('.connection-status')).toHaveText('로컬 AI 연결됨')
    expect(requests).toHaveLength(3)

    const settings = await page.evaluate(() => window.electron.ai.settings())
    expect(settings).toEqual({ provider: 'local', baseUrl, hasApiKey: true })
    const profile = await app.evaluate(({ app }) => app.getPath('userData'))
    expect(readFileSync(join(profile, 'ai-connection.json'), 'utf8')).toContain('test-local-key')
    await page.getByRole('button', { name: '연결 설정', exact: true }).click()
    await expect(page.getByTestId('ai-api-key')).toHaveValue('')
    await expect(page.getByTestId('ai-base-url')).toHaveValue(baseUrl)
    await page.getByTestId('ai-base-url').fill(`${baseUrl}/`)
    await page.getByTestId('ai-api-key').fill('test-local-key')
    await page.getByRole('button', { name: '저장하고 연결', exact: true }).click()
    await expect(page.getByTestId('ai-model')).toHaveValue('local:local-test-model')
    await expect(page.getByTestId('ai-provider')).toBeEnabled()
    expect((await page.evaluate(() => window.electron.ai.settings())).hasApiKey).toBe(true)

    const splashUrl = `http://127.0.0.1:${address.port}/splash/v1`
    await page.evaluate(async(url) => {
      await window.electron.ai.configure({ provider: 'splash', baseUrl: url })
    }, splashUrl)
    await expect(page.getByTestId('ai-provider').locator('option')).toHaveCount(2)
    await page.getByTestId('ai-model').selectOption('splash:mlx-community/Qwen3.8-27B-4bit')
    await expect(page.getByTestId('ai-provider')).toHaveValue('local')
    await expect(page.getByTestId('ai-model')).toHaveValue('splash:mlx-community/Qwen3.8-27B-4bit')
    await expect(page.getByTestId('ai-model').locator('option:checked')).toHaveText('Qwen3.8-27B Splash')
    await page.getByTestId('ai-instruction').fill('너는 누구야?')
    await page.getByTestId('ai-generate').click()
    await expect(page.getByTestId('ai-message-assistant').last()).toHaveText('저는 Splash 모델입니다.')
    expect(requests).toHaveLength(4)
    expect(requests[3].model).toBe('mlx-community/Qwen3.8-27B-4bit')
    expect((await page.evaluate(() => window.electron.ai.settings('local'))).baseUrl).toBe(baseUrl)
    splashOffline = true
    await page.getByTestId('ai-close').click()
    await page.getByTestId('ai-toggle').click()
    await expect(page.getByTestId('ai-provider')).toBeEnabled()
    await expect(page.getByTestId('ai-model')).toHaveValue('splash:mlx-community/Qwen3.8-27B-4bit')
    await page.getByTestId('ai-instruction').fill('계속 대화할까요?')
    await expect(page.getByTestId('ai-generate')).toBeDisabled()
    expect(requests).toHaveLength(4)
    await page.getByTestId('ai-model').selectOption('local:local-test-model')
    await expect(page.getByTestId('ai-generate')).toBeEnabled()
    await expect(page.getByTestId('ai-model')).toHaveValue('local:local-test-model')
    expect((await page.evaluate(() => window.electron.ai.settings('splash'))).baseUrl).toBe(splashUrl)

    await app.evaluate(({ ipcMain }) => {
      ipcMain.removeHandler('mt::ai::status')
      ipcMain.removeHandler('mt::ai::models')
      ipcMain.handle('mt::ai::status', () => ({ available: true, loggedIn: true }))
      ipcMain.handle('mt::ai::models', () => [{ id: 'codex-test-model', name: 'Codex test' }])
    })
    await page.getByTestId('ai-provider').selectOption('codex')
    await expect(page.getByTestId('ai-model')).toHaveValue('codex-test-model')
    expect(await page.evaluate(() => localStorage.getItem('marktext-ai:local-selected-model'))).toBe('local-test-model')
    expect((await page.evaluate(() => window.electron.ai.settings())).provider).toBe('codex')
    await expectNoRendererErrors(app)
  } finally {
    await app.close()
    server.closeAllConnections()
    await new Promise<void>(resolve => server.close(() => resolve()))
  }
})

test('users can register, rename and remove servers and models without restoring deleted choices', async() => {
  const requests: string[] = []
  const server = createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json')
    if (req.url === '/v1/models') { res.end(JSON.stringify({ data: [{ id: 'managed-model' }, { id: 'extra-model' }] })); return }
    if (req.url !== '/v1/chat/completions') { res.writeHead(404).end('{}'); return }
    let body = ''
    req.on('data', chunk => { body += chunk })
    req.on('end', () => {
      expect(req.headers.authorization).toBe('Bearer managed-key')
      requests.push(JSON.parse(body).model)
      res.end(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ markdown: '# Title\n\nOriginal.\n', summary: '등록한 서버 응답입니다.' }) } }] }))
    })
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Test server unavailable')
  const baseUrl = `http://127.0.0.1:${address.port}/v1`
  const initial = await launchWithMarkdown('# Title\n\nOriginal.\n', { suppressErrorDialog: true })
  const filePath = initial.filePath
  let { app, page } = initial
  const launch = await app.evaluate(({ app }) => ({ executablePath: app.getPath('exe'), root: app.getAppPath(), profile: app.getPath('userData') }))
  const restart = async() => {
    await expectNoRendererErrors(app)
    await app.close()
    app = await _electron.launch({ executablePath: launch.executablePath, args: [launch.root, '--user-data-dir', launch.profile, filePath], env: { ...process.env, MARKTEXT_ERROR_INTERACTION: '1' } })
    await installRendererErrorCounter(app)
    page = await app.firstWindow()
    await page.getByTestId('ai-toggle').click()
  }
  try {
    await page.evaluate(async(url) => {
      await window.electron.ai.configure({ provider: 'splash', baseUrl: url })
      await window.electron.ai.configure({ provider: 'local', baseUrl: url })
    }, baseUrl)
    await page.getByTestId('ai-toggle').click()
    await expect(page.getByTestId('ai-model')).toBeEnabled()
    await page.getByTestId('ai-manage-servers').click()
    await page.getByTestId('ai-server-select').selectOption('')
    await page.getByTestId('ai-server-name').fill('My server')
    await page.getByTestId('ai-server-url').fill(baseUrl)
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1000, 640))
    await page.getByTestId('ai-server-key').fill('managed-key')
    await page.getByTestId('ai-model-add').click()
    await page.getByTestId('ai-server-manager').evaluate(element => { element.scrollTop = 0 })
    await expect(page.getByTestId('ai-server-connection-save')).toBeInViewport()
    await expect(page.getByTestId('ai-server-discover')).toBeEnabled()
    await page.getByTestId('ai-server-connection-save').click()
    await expect(page.getByTestId('ai-server-manager')).toContainText('서버 설정을 저장했습니다.')
    await expect(page.getByRole('textbox', { name: '등록 모델 ID', exact: true })).toHaveValue('')
    await expect(page.getByTestId('ai-server-discover')).toBeEnabled()
    for (let index = 0; index < 6; index++) await page.getByTestId('ai-model-add').click()
    await page.getByTestId('ai-server-manager').evaluate(element => { element.scrollTop = 0 })
    await expect(page.getByTestId('ai-server-save')).toBeInViewport()
    for (let index = 0; index < 6; index++) await page.getByRole('button', { name: '모델 삭제', exact: true }).last().click()
    await page.getByTestId('ai-server-discover').click()
    await expect(page.getByTestId('ai-server-manager')).toContainText('2개 모델을 확인했습니다.')
    await page.getByRole('textbox', { name: '등록 모델 ID', exact: true }).fill('managed-model')
    await page.getByRole('textbox', { name: '등록 모델 이름', exact: true }).fill('My model')
    await page.getByTestId('ai-server-save').click()
    await expect(page.getByTestId('ai-server-manager')).toContainText('저장했습니다.')
    const id = await page.getByTestId('ai-server-select').inputValue()
    expect(id).toMatch(/^server-/)
    await expect(page.getByTestId('ai-server-key')).toHaveValue('')
    const profile = await app.evaluate(({ app }) => app.getPath('userData'))
    expect(readFileSync(join(profile, 'ai-connection.json'), 'utf8')).toContain('managed-key')

    await page.getByTestId('ai-server-discover').click()
    await expect(page.getByTestId('ai-server-manager')).toContainText('2개 모델을 확인했습니다.')
    await page.locator('.discovered-models li').filter({ hasText: 'extra-model' }).getByRole('button', { name: '등록', exact: true }).click()
    await expect(page.getByRole('textbox', { name: '등록 모델 ID', exact: true })).toHaveCount(2)
    await page.getByTestId('ai-server-name').fill('Renamed')
    await page.getByTestId('ai-server-save').click()
    await expect(page.getByTestId('ai-server-manager')).toContainText('저장했습니다.')
    await expect(page.getByTestId('ai-manage-servers')).toBeEnabled()
    await page.getByTestId('ai-manage-servers').click()
    await page.getByTestId('ai-model').selectOption(`${id}:managed-model`)
    await expect(page.getByTestId('ai-model').locator('option:checked')).toHaveText('My model (Renamed)')
    await expect(page.getByTestId('ai-provider')).toBeEnabled()
    await page.getByTestId('ai-instruction').fill('hi')
    await page.getByTestId('ai-generate').click()
    await expect(page.getByTestId('ai-message-assistant').last()).toHaveText('등록한 서버 응답입니다.')
    expect(requests).toEqual(['managed-model'])

    await restart()
    await expect(page.getByTestId('ai-model')).toHaveValue(`${id}:managed-model`)
    await expect(page.getByTestId('ai-model')).toBeEnabled()
    await page.getByTestId('ai-manage-servers').click()
    await page.getByRole('button', { name: '모델 삭제', exact: true }).first().click()
    await page.getByTestId('ai-server-save').click()
    await expect(page.getByTestId('ai-server-manager')).toContainText('저장했습니다.')
    await expect(page.getByTestId('ai-model')).toHaveValue('')
    await expect(page.getByTestId('ai-model').locator(`option[value="${id}:managed-model"]`)).toHaveCount(0)
    await expect(page.getByTestId('ai-generate')).toBeDisabled()
    await expect(page.getByTestId('ai-server-delete')).toBeEnabled()
    await page.getByTestId('ai-server-delete').click()
    await page.getByTestId('ai-server-delete-confirm').click()
    await expect(page.getByTestId('ai-server-manager')).toContainText('삭제했습니다.')
    await expect(page.getByTestId('ai-model').locator(`option[value="${id}:extra-model"]`)).toHaveCount(0)
    await restart()
    await expect(page.getByTestId('ai-provider')).toHaveValue('local')
    await expect(page.getByTestId('ai-generate')).toBeDisabled()
    await expect.poll(() => page.evaluate(() => window.electron.ai.servers().then(servers => servers.some(server => server.name === 'Renamed')))).toBe(false)

    // An empty registry must still be manageable after returning from Codex.
    await page.evaluate(async() => {
      await window.electron.ai.deleteServer('local')
      await window.electron.ai.deleteServer('splash')
      await window.electron.ai.configure({ provider: 'codex', baseUrl: '' })
    })
    await restart()
    await expect(page.getByTestId('ai-provider')).toBeEnabled()
    await page.getByTestId('ai-provider').selectOption('local')
    await expect(page.getByTestId('ai-server-manager')).toBeVisible()
    await expect(page.getByTestId('ai-server-select').locator('option')).toHaveCount(1)
    await expect(page.getByTestId('ai-generate')).toBeDisabled()
    expect(requests).toHaveLength(1)
    await page.getByTestId('ai-server-name').fill('Replacement')
    await page.getByTestId('ai-server-url').fill(baseUrl)
    await page.getByTestId('ai-model-add').click()
    await page.getByRole('textbox', { name: '등록 모델 ID', exact: true }).fill('managed-model')
    await page.getByRole('textbox', { name: '등록 모델 이름', exact: true }).fill('Replacement model')
    await page.getByTestId('ai-server-save').click()
    await expect(page.getByTestId('ai-server-manager')).toContainText('저장했습니다.')
    await expect(page.getByTestId('ai-provider')).toHaveValue('local')
    const replacement = await page.getByTestId('ai-server-select').inputValue()
    await expect(page.getByTestId('ai-manage-servers')).toBeEnabled()
    await page.getByTestId('ai-manage-servers').click()
    await page.getByTestId('ai-model').selectOption(`${replacement}:managed-model`)
    await expect(page.getByTestId('ai-provider')).toBeEnabled()
    await expect(page.getByTestId('ai-model')).toHaveValue(`${replacement}:managed-model`)
    await expectNoRendererErrors(app)
  } finally {
    await app.close()
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  }
})

test('model lookup saves an edited offline server address and key before querying', async() => {
  let authenticatedQueries = 0
  const server = createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json')
    if (req.url !== '/v1/models') { res.writeHead(404).end('{}'); return }
    if (req.headers.authorization === 'Bearer edited-key') authenticatedQueries++
    res.end(JSON.stringify({ data: [{ id: 'replacement-model' }] }))
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Test server unavailable')
  const baseUrl = `http://127.0.0.1:${address.port}/v1`
  const { app, page } = await launchWithMarkdown('# Test\n', { suppressErrorDialog: true })
  try {
    await page.evaluate(async(url) => {
      await window.electron.ai.configure({ provider: 'local', baseUrl: 'http://127.0.0.1:1/v1' })
      await window.electron.ai.configure({ provider: 'splash', baseUrl: url })
    }, baseUrl)
    await page.getByTestId('ai-toggle').click()
    await expect(page.getByTestId('ai-model')).toBeEnabled()
    await page.getByTestId('ai-manage-servers').click()
    await page.getByTestId('ai-server-select').selectOption('local')
    await page.getByTestId('ai-server-discover').click()
    await expect(page.getByTestId('ai-server-manager').getByRole('alert')).toContainText('로컬 AI 서버에 연결할 수 없습니다.')
    await page.getByTestId('ai-server-url').fill(baseUrl)
    await page.getByTestId('ai-server-key').fill('edited-key')
    await page.getByTestId('ai-model-add').click()
    await page.getByTestId('ai-server-discover').click()
    await expect(page.getByTestId('ai-server-manager')).toContainText('1개 모델을 확인했습니다.')
    await expect(page.getByTestId('ai-server-manager').getByRole('alert')).toHaveCount(0)
    await expect(page.getByTestId('ai-server-saved-url')).toContainText(baseUrl)
    await expect(page.getByTestId('ai-server-key')).toHaveValue('')
    await expect(page.getByRole('textbox', { name: '등록 모델 ID', exact: true })).toHaveValue('')
    const saved = await page.evaluate(() => window.electron.ai.settings('local'))
    expect(saved).toEqual({ provider: 'local', baseUrl, hasApiKey: true })
    expect(authenticatedQueries).toBeGreaterThan(0)
    const profile = await app.evaluate(({ app }) => app.getPath('userData'))
    expect(readFileSync(join(profile, 'ai-connection.json'), 'utf8')).toContain('edited-key')
    await expectNoRendererErrors(app)
  } finally {
    await app.close()
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  }
})
