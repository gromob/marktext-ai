import { expect, test } from '@playwright/test'
import { launchWithMarkdown, expectNoRendererErrors } from './helpers'

test('mode switching preserves the composer and question mode blocks edits even from a faulty transport', async() => {
  const { app, page } = await launchWithMarkdown('Original document.\n', { suppressErrorDialog: true })
  try {
    await app.evaluate(({ ipcMain }) => {
      for (const name of ['status', 'models', 'rewrite']) ipcMain.removeHandler(`mt::ai::${name}`)
      ipcMain.handle('mt::ai::status', () => ({ available: true, loggedIn: true }))
      ipcMain.handle('mt::ai::models', () => [{ id: 'test-model', name: 'Test model' }])
      ipcMain.handle('mt::ai::rewrite', (_event, request) => ({
        markdown: 'Revised document.\n', summary: request.mode === 'ask' ? '문서에 대한 답변입니다.' : '수정했습니다.'
      }))
    })
    await page.getByTestId('ai-toggle').click()
    const mode = page.getByTestId('ai-mode')
    const input = page.getByTestId('ai-instruction')
    await expect(mode).toHaveAttribute('aria-pressed', 'false')
    await input.fill('수학에 대해 설명해 주세요')
    await input.focus()
    const preserved = await input.evaluate(el => {
      const textarea = el as HTMLTextAreaElement
      textarea.setSelectionRange(2, 4)
      textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, isComposing: true, bubbles: true, cancelable: true }))
      return new Promise<boolean>(resolve => requestAnimationFrame(() => resolve(
        document.getElementById('ai-instruction') === textarea && textarea.selectionStart === 2 && textarea.selectionEnd === 4 && document.activeElement === textarea
      )))
    })
    expect(preserved).toBe(true)
    await expect(mode).toHaveAttribute('aria-pressed', 'true')
    await expect(input).toHaveValue('수학에 대해 설명해 주세요')
    await input.press('Shift+Tab')
    await expect(mode).toHaveAttribute('aria-pressed', 'false')
    await expect(input).toBeFocused()
    await page.getByTestId('ai-generate').click()
    await expect(page.getByTestId('ai-message-assistant').last()).toHaveText('문서에 대한 답변입니다.')
    await expect(page.locator('.editor-component')).toContainText('Original document.')
    await expect(page.getByTestId('ai-undo')).toHaveCount(0)
    await input.focus()
    await mode.click()
    await expect(input).toBeFocused()
    await expect(mode).toHaveAttribute('aria-pressed', 'true')
    await input.fill('본문을 수정하세요')
    await page.getByTestId('ai-generate').click()
    await expect(page.locator('.editor-component')).toContainText('Revised document.')
    await page.getByTestId('ai-undo').click()
    await expect(page.locator('.editor-component')).toContainText('Original document.')
    await expectNoRendererErrors(app)
  } finally { await app.close() }
})
