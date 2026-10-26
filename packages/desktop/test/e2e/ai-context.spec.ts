import { createServer } from 'node:http'
import { expect, test } from '@playwright/test'
import { launchWithMarkdown, expectNoRendererErrors } from './helpers'

test('local question context accumulates, model limits persist, and /new resets only the current conversation', async() => {
  const requests: Array<{ messages: Array<{ role: string; content: string }>; max_tokens: number }> = []
  const server = createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json')
    if (req.url === '/v1/models') {
      res.end(JSON.stringify({ data: [{ id: 'context-model', meta: { n_ctx: 131072 } }] }))
      return
    }
    let body = ''
    req.on('data', chunk => { body += chunk })
    req.on('end', () => {
      requests.push(JSON.parse(body))
      res.end(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ summary: `answer ${requests.length}` }) } }] }))
    })
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Test server unavailable')
  const { app, page } = await launchWithMarkdown('Preserved document.\n', { suppressErrorDialog: true })
  try {
    await page.evaluate(async(baseUrl) => {
      await window.electron.ai.saveServer({ id: 'local', name: 'Context', baseUrl, apiKey: '', models: [{ id: 'context-model', name: 'Context model', outputTokens: 2048, timeoutSeconds: 900 }] })
      await window.electron.ai.configure({ provider: 'local', baseUrl })
    }, `http://127.0.0.1:${address.port}/v1`)
    await page.getByTestId('ai-toggle').click()
    await page.getByTestId('ai-model').selectOption('local:context-model')
    await expect(page.getByTestId('ai-context-status')).toContainText('131072')
    await expect(page.getByTestId('ai-context-status')).toContainText('900초')
    await page.getByTestId('ai-manage-servers').click()
    await page.getByRole('spinbutton', { name: '모델 문맥 한도' }).fill('65536')
    await page.getByRole('spinbutton', { name: '모델 응답 대기' }).fill('1200')
    await page.getByTestId('ai-server-save').click()
    await expect(page.getByTestId('ai-server-manager')).toContainText('저장했습니다.')
    await page.getByTestId('ai-manage-servers').click()
    await expect(page.getByTestId('ai-context-status')).toContainText('65536')
    await expect(page.getByTestId('ai-context-status')).toContainText('1200초')
    const input = page.getByTestId('ai-instruction')
    for (let index = 1; index <= 7; index++) {
      await input.fill(`question ${index}`)
      await page.getByTestId('ai-generate').click()
      await expect(page.getByTestId('ai-message-assistant').last()).toHaveText(`answer ${index}`)
    }
    expect(requests[6].messages).toHaveLength(15)
    expect(requests[6].messages.slice(0, 3)).toEqual(requests[0].messages)
    expect(requests[6].messages.at(-1)?.content).toBe('question 7')
    expect(requests[6].max_tokens).toBe(2048)
    await input.fill('/new')
    await input.press('Enter')
    await expect(page.getByTestId('ai-message-assistant')).toHaveCount(1)
    await expect(input).toHaveValue('')
    expect(requests).toHaveLength(7)
    await expect(page.getByTestId('ai-model')).toHaveValue('local:context-model')
    await expect(page.locator('.editor-component')).toContainText('Preserved document.')
    await input.fill('fresh question')
    await page.getByTestId('ai-generate').click()
    await expect(page.getByTestId('ai-message-assistant').last()).toHaveText('answer 8')
    expect(requests[7].messages).toHaveLength(3)
    await page.getByTestId('ai-new-chat').click()
    await expect(page.getByTestId('ai-message-assistant')).toHaveCount(1)
    await expect(page.getByTestId('ai-mode')).toHaveAttribute('aria-pressed', 'false')
    const saved = await page.evaluate(() => window.electron.ai.servers())
    expect(saved.find(item => item.id === 'local')?.models?.[0]).toMatchObject({ contextWindow: 65536, outputTokens: 2048, timeoutSeconds: 1200 })
    await expectNoRendererErrors(app)
  } finally {
    await app.close()
    server.closeAllConnections()
    await new Promise<void>(resolve => server.close(() => resolve()))
  }
})

test('elapsed time is visible and a running request blocks reset until cancellation completes', async() => {
  const { app, page } = await launchWithMarkdown('Original.\n', { suppressErrorDialog: true })
  try {
    await app.evaluate(({ ipcMain }) => {
      for (const name of ['status', 'models', 'rewrite', 'cancel']) ipcMain.removeHandler(`mt::ai::${name}`)
      ipcMain.handle('mt::ai::status', () => ({ available: true, loggedIn: true }))
      ipcMain.handle('mt::ai::models', () => [])
      ipcMain.handle('mt::ai::cancel', () => undefined)
      ipcMain.handle('mt::ai::rewrite', (_event, request) => new Promise(resolve => {
        ;(globalThis as unknown as { finishContextRequest: () => void }).finishContextRequest = () => resolve({ markdown: request.markdown, summary: 'late answer' })
      }))
    })
    await page.getByTestId('ai-toggle').click()
    await page.getByTestId('ai-instruction').fill('question')
    await page.getByTestId('ai-generate').click()
    await expect(page.getByTestId('ai-new-chat')).toBeDisabled()
    await expect(page.locator('.thinking')).toContainText(/\([1-9]\d*초\)/)
    await page.getByTestId('ai-cancel').click()
    await app.evaluate(() => (globalThis as unknown as { finishContextRequest: () => void }).finishContextRequest())
    await expect(page.getByTestId('ai-new-chat')).toBeEnabled()
    await expect(page.getByTestId('ai-message-assistant').last()).toContainText('취소')
    await page.getByTestId('ai-new-chat').click()
    await expect(page.getByTestId('ai-message-assistant')).toHaveCount(1)
    await expect(page.locator('.editor-component')).toContainText('Original.')
  } finally { await app.close() }
})
