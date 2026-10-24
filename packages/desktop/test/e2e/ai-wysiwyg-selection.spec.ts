import { expect, test, type Page } from '@playwright/test'
import type { ElectronApplication } from 'playwright'
import { launchWithMarkdown, expectNoRendererErrors } from './helpers'

interface ChatRequest {
  instruction: string
  markdown: string
  model?: string
  history?: Array<{ role: string; content: string }>
}
interface MockState {
  requests: ChatRequest[]
  cancelCount: number
  finish?: () => void
}

const mockCodex = async(
  app: ElectronApplication,
  options: { deferred?: boolean; catalogError?: boolean; unchanged?: boolean; cancelError?: boolean } = {}
): Promise<void> => {
  await app.evaluate(({ ipcMain }, options) => {
    for (const channel of ['status', 'models', 'rewrite', 'cancel'])
      ipcMain.removeHandler(`mt::ai::${channel}`)
    const state: MockState = { requests: [], cancelCount: 0 }
    ;(globalThis as unknown as { aiChatTest: MockState }).aiChatTest = state
    ipcMain.handle('mt::ai::status', () => ({ available: true, loggedIn: true, version: 'test' }))
    ipcMain.handle('mt::ai::models', () => {
      if (options.catalogError) throw new Error('Model catalog unavailable')
      return [{ id: 'test-model', name: '테스트 모델' }]
    })
    ipcMain.handle('mt::ai::cancel', () => {
      state.cancelCount++
      if (options.cancelError) throw new Error('Cancel transport failed')
    })
    ipcMain.handle('mt::ai::rewrite', (_event, request: ChatRequest) => {
      state.requests.push(request)
      const result = {
        markdown: options.unchanged ? request.markdown : 'Revised.\n',
        summary: options.unchanged ? '현재 표현을 유지했습니다.' : '문장을 수정했습니다.'
      }
      if (!options.deferred || state.requests.length > 1) return result
      return new Promise((resolve) => {
        state.finish = () => resolve(result)
      })
    })
  }, options)
}

const requests = (app: ElectronApplication): Promise<ChatRequest[]> =>
  app.evaluate(() => (globalThis as unknown as { aiChatTest: MockState }).aiChatTest.requests)

const send = async(page: Page): Promise<void> => {
  await page.getByTestId('ai-instruction').fill('간결하게 다듬어 주세요.')
  await expect(page.getByTestId('ai-generate')).toBeEnabled()
  await page.getByTestId('ai-generate').click()
}

test('cancel transport failure still discards the late response and keeps it out of follow-up history', async() => {
  const { app, page } = await launchWithMarkdown('Original.\n', { suppressErrorDialog: true })
  try {
    await mockCodex(app, { deferred: true, cancelError: true })
    await page.getByTestId('ai-toggle').click()
    await send(page)
    await expect.poll(async() => (await requests(app)).length).toBe(1)
    await page.getByTestId('ai-cancel').click()
    await expect(page.getByTestId('ai-cancel')).toBeDisabled()
    await expect(page.getByTestId('ai-generate')).toHaveCount(0)
    await app.evaluate(() => {
      const state = (globalThis as unknown as { aiChatTest: MockState }).aiChatTest
      if (!state.finish) throw new Error('The mock request has not started')
      state.finish()
    })
    await expect(page.getByTestId('ai-generate')).toBeVisible()
    await expect(page.getByTestId('ai-message-assistant').last()).toContainText('취소')
    await expect(page.locator('.editor-component')).toContainText('Original.')
    await expect(page.getByTestId('ai-undo')).toHaveCount(0)
    expect(
      await app.evaluate(
        () => (globalThis as unknown as { aiChatTest: MockState }).aiChatTest.cancelCount
      )
    ).toBe(1)
    await page.getByTestId('ai-instruction').fill('새 요청으로 문장을 다듬어 주세요.')
    await page.getByTestId('ai-generate').click()
    await expect(page.locator('.editor-component')).toContainText('Revised.')
    expect((await requests(app))[1].history).toEqual([])
    await expectNoRendererErrors(app)
  } finally {
    await app.close()
  }
})

test('chosen model is sent and persists when the chat panel is reopened', async() => {
  const { app, page } = await launchWithMarkdown('Original.\n', { suppressErrorDialog: true })
  try {
    await mockCodex(app)
    await page.getByTestId('ai-toggle').click()
    await expect(page.getByTestId('ai-model')).toBeEnabled()
    await page.getByTestId('ai-model').selectOption('test-model')
    await send(page)
    await expect(page.locator('.editor-component')).toContainText('Revised.')
    expect((await requests(app))[0].model).toBe('test-model')
    expect(await page.evaluate(() => localStorage.getItem('marktext-ai:selected-model'))).toBe(
      'test-model'
    )
    await page.getByTestId('ai-toggle').click()
    await page.getByTestId('ai-toggle').click()
    await expect(page.getByTestId('ai-model')).toHaveValue('test-model')
    await expect(page.getByTestId('ai-message-user')).toHaveCount(1)
    await expect(page.getByTestId('ai-message-assistant')).toContainText('문장을 수정했습니다.')
    await expectNoRendererErrors(app)
  } finally {
    await app.close()
  }
})

test('model catalog failure still allows editing through the default model', async() => {
  const { app, page } = await launchWithMarkdown('Original.\n', { suppressErrorDialog: true })
  try {
    await mockCodex(app, { catalogError: true })
    await page.getByTestId('ai-toggle').click()
    await expect(page.getByTestId('ai-model')).toBeEnabled()
    await expect(page.getByTestId('ai-model')).toHaveValue('')
    await send(page)
    await expect(page.locator('.editor-component')).toContainText('Revised.')
    expect((await requests(app))[0].model).toBeUndefined()
    await expectNoRendererErrors(app)
  } finally {
    await app.close()
  }
})

test('Shift+Enter adds a line, composing Enter stays in the input, and Enter sends once', async() => {
  const { app, page } = await launchWithMarkdown('Original.\n', { suppressErrorDialog: true })
  try {
    await mockCodex(app)
    await page.getByTestId('ai-toggle').click()
    const input = page.getByTestId('ai-instruction')
    await input.fill('첫 문장')
    await expect(page.getByTestId('ai-generate')).toBeEnabled()
    await input.press('Shift+Enter')
    await expect(input).toHaveValue('첫 문장\n')
    const compositionContinues = await input.evaluate((element) =>
      element.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'Enter',
          code: 'Enter',
          isComposing: true,
          bubbles: true,
          cancelable: true
        })
      )
    )
    expect(compositionContinues).toBe(true)
    expect(await requests(app)).toHaveLength(0)
    await input.press('Enter')
    await expect(page.locator('.editor-component')).toContainText('Revised.')
    const captured = await requests(app)
    expect(captured).toHaveLength(1)
    expect(captured[0].instruction).toBe('첫 문장')
    await expectNoRendererErrors(app)
  } finally {
    await app.close()
  }
})

test('an unchanged response records the conversation and preserves the document', async() => {
  const { app, page } = await launchWithMarkdown('Original.\n', { suppressErrorDialog: true })
  try {
    await mockCodex(app, { unchanged: true })
    await page.getByTestId('ai-toggle').click()
    await send(page)
    await expect(page.getByTestId('ai-message-assistant')).toContainText(
      '현재 표현을 유지했습니다.'
    )
    await expect(page.locator('.editor-component')).toContainText('Original.')
    await expect(page.getByTestId('ai-undo')).toHaveCount(0)
    await expect(page.getByTestId('ai-error')).toHaveCount(0)
    await expectNoRendererErrors(app)
  } finally {
    await app.close()
  }
})
