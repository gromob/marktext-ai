import { expect, test, type Page } from '@playwright/test'
import type { ElectronApplication } from 'playwright'
import {
  launchWithMarkdown,
  enterSourceMode,
  getMarkdownContent,
  expectNoRendererErrors,
  sendIpcToRenderer
} from './helpers'

interface RecordedRequest {
  instruction: string
  markdown: string
  history?: Array<{ role: string; content: string }>
}

interface MockState {
  requests: RecordedRequest[]
  finish?: () => void
}

// Only transport is replaced; the real chat, editor transactions and tab guards run.
const mockCodex = async(
  app: ElectronApplication,
  replies: Array<{ markdown: string; summary?: string }>,
  deferred = false
): Promise<void> => {
  await app.evaluate(
    ({ ipcMain }, options) => {
      for (const channel of ['status', 'models', 'rewrite', 'cancel'])
        ipcMain.removeHandler(`mt::ai::${channel}`)
      const state: MockState = { requests: [] }
      ;(globalThis as unknown as { aiChatTest: MockState }).aiChatTest = state
      ipcMain.handle('mt::ai::status', () => ({ available: true, loggedIn: true, version: 'test' }))
      ipcMain.handle('mt::ai::models', () => [{ id: 'test-model', name: '테스트 모델' }])
      ipcMain.handle('mt::ai::cancel', () => undefined)
      ipcMain.handle('mt::ai::rewrite', (_event, request: RecordedRequest) => {
        state.requests.push(request)
        const result = options.replies[state.requests.length - 1] || options.replies[0]
        if (!options.deferred || state.requests.length > 1) return result
        return new Promise((resolve) => {
          state.finish = () => resolve(result)
        })
      })
    },
    { replies, deferred }
  )
}

const requests = (app: ElectronApplication): Promise<RecordedRequest[]> =>
  app.evaluate(() => (globalThis as unknown as { aiChatTest: MockState }).aiChatTest.requests)

const finishRequest = (app: ElectronApplication): Promise<void> =>
  app.evaluate(() => {
    const finish = (globalThis as unknown as { aiChatTest: MockState }).aiChatTest.finish
    if (!finish) throw new Error('The mock request has not started')
    finish()
  })

const send = async(page: Page, instruction: string): Promise<void> => {
  await page.getByTestId('ai-instruction').fill(instruction)
  await expect(page.getByTestId('ai-generate')).toBeEnabled()
  await page.getByTestId('ai-generate').click()
}

const sourceText = (page: Page): Promise<string> =>
  page.evaluate(() => {
    const cm = document.querySelector('.source-code .CodeMirror') as Element & {
      CodeMirror: { getValue(): string }
    }
    return cm.CodeMirror.getValue()
  })

test('chat directly edits WYSIWYG and one undo restores the original document', async() => {
  const { app, page } = await launchWithMarkdown('# Title\n\nOriginal paragraph.\n', {
    suppressErrorDialog: true
  })
  try {
    await mockCodex(app, [
      { markdown: '# Title\n\nRevised paragraph.\n', summary: '문장을 다듬었습니다.' }
    ])
    await page.getByTestId('ai-toggle').click()
    await send(page, '문장을 간결하게 다듬어 주세요.')
    await expect(page.locator('.editor-component')).toContainText('Revised paragraph.')
    await expect(page.getByTestId('ai-message-user')).toContainText('문장을 간결하게')
    await expect(page.getByTestId('ai-message-assistant')).toContainText('문장을 다듬었습니다.')
    for (const id of [
      'ai-original',
      'ai-revised',
      'ai-apply',
      'ai-scope-selection',
      'ai-scope-document'
    ]) {
      await expect(page.getByTestId(id)).toHaveCount(0)
    }
    await expect(page.locator('.connection-card, .prompt-presets, .comparison-card')).toHaveCount(0)
    await expect(page.getByTestId('ai-sidebar').locator('textarea')).toHaveCount(1)
    await expect(page.locator('.editor-tabs li.unsaved')).toHaveCount(1)
    await page.getByTestId('ai-undo').click()
    await expect(page.locator('.editor-component')).toContainText('Original paragraph.')
    expect((await getMarkdownContent(page, app)).trim()).toBe('# Title\n\nOriginal paragraph.')
    await expectNoRendererErrors(app)
  } finally {
    await app.close()
  }
})

test('source chat sends the complete buffer and applies one undoable document edit', async() => {
  const { app, page } = await launchWithMarkdown('same\n\nsame\n\ntail\n', {
    suppressErrorDialog: true
  })
  try {
    await mockCodex(app, [
      { markdown: 'same\n\nchanged\n\ntail\n', summary: '두 번째 문단을 수정했습니다.' }
    ])
    await enterSourceMode(page, app)
    const original = await sourceText(page)
    await page.evaluate(() => {
      const cm = document.querySelector('.source-code .CodeMirror') as Element & {
        CodeMirror: {
          setSelection(a: { line: number; ch: number }, b: { line: number; ch: number }): void
        }
      }
      cm.CodeMirror.setSelection({ line: 2, ch: 0 }, { line: 2, ch: 4 })
    })
    await page.getByTestId('ai-toggle').click()
    await send(page, '두 번째 문단을 changed로 바꿔 주세요.')
    await expect.poll(() => sourceText(page)).toBe('same\n\nchanged\n\ntail\n')
    expect((await requests(app))[0].markdown).toBe(original)
    await page.getByTestId('ai-undo').click()
    await expect.poll(() => sourceText(page)).toBe(original)
    await expectNoRendererErrors(app)
  } finally {
    await app.close()
  }
})

test('follow-up uses prior conversation and the latest document across closing the sidebar', async() => {
  const { app, page } = await launchWithMarkdown('Original.\n', { suppressErrorDialog: true })
  try {
    await mockCodex(app, [
      { markdown: 'First revision.\n', summary: '첫 요청을 반영했습니다.' },
      { markdown: 'Second revision.\n', summary: '후속 요청을 반영했습니다.' }
    ])
    await page.getByTestId('ai-toggle').click()
    await send(page, '첫 문장을 다듬어 주세요.')
    await expect(page.locator('.editor-component')).toContainText('First revision.')
    await page.getByTestId('ai-toggle').click()
    await page.getByTestId('ai-toggle').click()
    await expect(page.getByTestId('ai-message-user')).toContainText('첫 문장을 다듬어 주세요.')
    await expect(page.getByTestId('ai-message-assistant')).toContainText('첫 요청을 반영했습니다.')
    await send(page, '조금 더 짧게 해 주세요.')
    await expect(page.locator('.editor-component')).toContainText('Second revision.')
    const captured = await requests(app)
    expect(captured).toHaveLength(2)
    expect(captured[1].markdown.trim()).toBe('First revision.')
    expect(captured[1].history).toEqual([
      { role: 'user', content: '첫 문장을 다듬어 주세요.' },
      { role: 'assistant', content: '첫 요청을 반영했습니다.' }
    ])
    await expect(page.getByTestId('ai-message-user')).toHaveCount(2)
    await expectNoRendererErrors(app)
  } finally {
    await app.close()
  }
})

test('manual edits made while waiting survive a stale AI response', async() => {
  const { app, page } = await launchWithMarkdown('Original.\n', { suppressErrorDialog: true })
  try {
    await mockCodex(app, [{ markdown: 'Stale response.\n' }], true)
    await enterSourceMode(page, app)
    await page.getByTestId('ai-toggle').click()
    await send(page, '간결하게 다듬어 주세요.')
    await expect.poll(async() => (await requests(app)).length).toBe(1)
    await page.evaluate(() => {
      const cm = document.querySelector('.source-code .CodeMirror') as Element & {
        CodeMirror: { replaceRange(text: string, from: { line: number; ch: number }): void }
      }
      cm.CodeMirror.replaceRange('User edit. ', { line: 0, ch: 0 })
    })
    const edited = await sourceText(page)
    await finishRequest(app)
    await expect(page.getByTestId('ai-error')).toContainText('변경')
    expect(await sourceText(page)).toBe(edited)
    await expect(page.getByTestId('ai-undo')).toHaveCount(0)
    await send(page, '현재 내용을 기준으로 다시 다듬어 주세요.')
    await expect.poll(async() => (await requests(app)).length).toBe(2)
    expect((await requests(app))[1].history).toEqual([])
    await expectNoRendererErrors(app)
  } finally {
    await app.close()
  }
})

test('switching tabs during a request protects both documents from the late response', async() => {
  const { app, page } = await launchWithMarkdown('Original tab.\n', { suppressErrorDialog: true })
  try {
    await mockCodex(app, [{ markdown: 'Wrong document.\n' }], true)
    await page.getByTestId('ai-toggle').click()
    await send(page, '문장을 다듬어 주세요.')
    await expect.poll(async() => (await requests(app)).length).toBe(1)
    await sendIpcToRenderer(app, 'mt::new-untitled-tab', true, 'Second tab.\n')
    await expect(page.locator('.editor-component')).toContainText('Second tab.')
    await finishRequest(app)
    await expect(page.getByTestId('ai-cancel')).toHaveCount(0)
    await expect(page.locator('.editor-component')).toContainText('Second tab.')
    await sendIpcToRenderer(app, 'mt::switch-tab-by-index', 0)
    await expect(page.locator('.editor-component')).toContainText('Original tab.')
    await expectNoRendererErrors(app)
  } finally {
    await app.close()
  }
})

test('long requests show elapsed time and apply the completed response', async() => {
  const { app, page } = await launchWithMarkdown('Original.\n', { suppressErrorDialog: true })
  try {
    await mockCodex(app, [{ markdown: '| 항목 | 내용 |\n| --- | --- |\n| 문장 | Original. |\n' }], true)
    await page.getByTestId('ai-toggle').click()
    await page.clock.install()
    await send(page, '보기 좋게 편집해 줘. 표도 적극 이용해 줘.')
    await expect.poll(async() => (await requests(app)).length).toBe(1)
    await page.clock.fastForward(181_000)

    await expect(page.getByTestId('ai-request-status')).toContainText('3:01')
    await expect(page.getByTestId('ai-request-status')).toContainText('최대 15분')
    await expect(page.getByTestId('ai-cancel')).toBeEnabled()
    await expect(page.locator('.editor-component')).toContainText('Original.')
    await finishRequest(app)
    await expect(page.locator('.editor-component table')).toContainText('Original.')
    await expect(page.getByTestId('ai-request-status')).toHaveCount(0)
    await expectNoRendererErrors(app)
  } finally {
    await app.close()
  }
})

test('a failed request keeps the document and restores the instruction for retry', async() => {
  const { app, page } = await launchWithMarkdown('Original.\n', { suppressErrorDialog: true })
  try {
    await mockCodex(app, [{ markdown: 'Revised.\n' }])
    await app.evaluate(({ ipcMain }) => {
      ipcMain.removeHandler('mt::ai::rewrite')
      ipcMain.handle('mt::ai::rewrite', () => { throw new Error('AI 응답 대기 시간이 지났습니다.') })
    })
    await page.getByTestId('ai-toggle').click()
    const instruction = '보기 좋게 편집해 줘. 표도 적극 이용해 줘.'
    await send(page, instruction)

    await expect(page.getByTestId('ai-error')).toHaveText('AI 응답 대기 시간이 지났습니다.')
    await expect(page.getByTestId('ai-instruction')).toHaveValue(instruction)
    await expect(page.getByTestId('ai-generate')).toBeEnabled()
    await expect(page.locator('.editor-component')).toContainText('Original.')
    await mockCodex(app, [{ markdown: 'Revised.\n' }])
    await page.getByTestId('ai-generate').click()
    await expect(page.locator('.editor-component')).toContainText('Revised.')
    expect((await requests(app))[0].history).toEqual([])
    await expectNoRendererErrors(app)
  } finally {
    await app.close()
  }
})
