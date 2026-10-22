import { expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import { getMarkdownContent, launchWithMarkdown, placeCaretInEditor } from './helpers'

test.describe('plain-text clipboard paste', () => {
  let app: ElectronApplication
  let page: Page

  test.beforeEach(async() => {
    ;({ app, page } = await launchWithMarkdown('Start '))
    await placeCaretInEditor(page)
  })

  test.afterEach(async() => {
    if (app) await app.close()
  })

  for (const entry of ['shortcut', 'native menu', 'plain-text command']) {
    test(`${entry} uses text from a clipboard containing HTML and an image`, async() => {
      await app.evaluate(({ clipboard, nativeImage }) => {
        clipboard.write({
          text: '복사한 텍스트\n다음 줄',
          html: '<p><strong>복사한 텍스트</strong></p><p>다음 줄</p>',
          image: nativeImage.createFromBitmap(Buffer.from([0, 0, 0, 255]), { width: 1, height: 1 })
        })
      })
      expect(await app.evaluate(({ clipboard }) => !clipboard.readImage().isEmpty())).toBe(true)

      if (entry === 'shortcut') {
        await page.keyboard.press('ControlOrMeta+V')
      } else if (entry === 'native menu') {
        await app.evaluate(({ BrowserWindow }) => {
          BrowserWindow.getAllWindows()[0].webContents.paste()
        })
      } else {
        await app.evaluate(({ BrowserWindow }) => {
          BrowserWindow.getAllWindows()[0].webContents.send('mt::cm-paste-as-plain-text')
        })
      }

      await expect(page.locator('.editor-component')).toContainText('복사한 텍스트')
      expect(await getMarkdownContent(page, app)).toBe('Start 복사한 텍스트\n다음 줄')
      await expect(page.locator('.editor-component img')).toHaveCount(0)
    })
  }
})
