import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import {
  expectNoRendererErrors,
  getMarkdownContent,
  launchWithDoc,
  launchWithMarkdown,
  placeCaretInEditor,
  sendIpcToRenderer,
  setSourceMarkdown
} from './helpers'

const INDENT = '\u00a0'.repeat(4)

const paragraphText = (page: Page): Promise<string> =>
  page.locator('.editor-component span.mu-paragraph-content').first().evaluate(
    element => (element.textContent || '').replace(/\n+$/, '')
  )

const selectParagraphText = async(page: Page, start: number, end = start): Promise<void> => {
  await page.evaluate(({ start, end }) => {
    const root = document.querySelector<HTMLElement>('.editor-component')
    const span = root?.querySelector('span.mu-paragraph-content')
    if (!root || !span) throw new Error('The paragraph is missing')
    root.focus()
    const endpoint = (offset: number) => {
      const walker = document.createTreeWalker(span, NodeFilter.SHOW_TEXT)
      let node: Node | null
      let remaining = offset
      while ((node = walker.nextNode())) {
        const length = node.textContent?.length || 0
        if (remaining <= length) return { node, offset: remaining }
        remaining -= length
      }
      throw new Error('The paragraph offset is out of bounds')
    }
    const anchor = endpoint(start)
    const focus = endpoint(end)
    const range = document.createRange()
    range.setStart(anchor.node, anchor.offset)
    range.setEnd(focus.node, focus.offset)
    const selection = window.getSelection()
    if (!selection) throw new Error('The browser selection is missing')
    selection.removeAllRanges()
    selection.addRange(range)
    document.dispatchEvent(new Event('selectionchange'))
    root.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowRight', bubbles: true }))
  }, { start, end })
}

test.describe('Paragraph Tab indentation', () => {
  let app: ElectronApplication
  let page: Page
  let filePath: string

  test.beforeAll(async() => {
    const launched = await launchWithMarkdown('seed\n', {
      suppressErrorDialog: true,
      preferences: { tabSize: 4 }
    })
    app = launched.app
    page = launched.page
    filePath = launched.filePath
  })

  test.afterEach(async() => {
    await expectNoRendererErrors(app)
  })

  test.afterAll(async() => {
    if (app) await app.close()
  })

  test('Tab on a blank paragraph followed by Korean input retains a paragraph', async() => {
    await setSourceMarkdown(page, app, '\n')
    await placeCaretInEditor(page)
    await page.keyboard.press('Tab')
    await page.keyboard.insertText('한글 문장을 입력합니다.')
    await expect.poll(() => paragraphText(page)).toBe(`${INDENT}한글 문장을 입력합니다.`)
    await expect(page.locator('.editor-component .mu-code-block')).toHaveCount(0)
    expect((await getMarkdownContent(page, app)).replace(/\n+$/, '')).toBe(`${INDENT}한글 문장을 입력합니다.`)
    await expect(page.locator('.editor-component .mu-code-block')).toHaveCount(0)
  })

  test('repeated Tab indents the line while preserving a midline caret and one undo boundary', async() => {
    await setSourceMarkdown(page, app, 'alpha beta\n')
    await selectParagraphText(page, 3)
    await page.keyboard.press('Tab')
    await page.keyboard.press('Tab')
    await expect.poll(() => paragraphText(page)).toBe(`${INDENT}${INDENT}alpha beta`)
    await sendIpcToRenderer(app, 'mt::editor-edit-action', 'undo')
    await expect.poll(() => paragraphText(page)).toBe(`${INDENT}alpha beta`)
    await page.keyboard.insertText('X')
    await expect.poll(() => paragraphText(page)).toBe(`${INDENT}alpXha beta`)
    await page.keyboard.press('Shift+Tab')
    await expect.poll(() => paragraphText(page)).toBe('alpXha beta')
    await page.keyboard.press('Shift+Tab')
    await expect.poll(() => paragraphText(page)).toBe('alpXha beta')
    await expect(page.locator('.editor-component .mu-code-block')).toHaveCount(0)
  })

  test('Tab and Shift-Tab retain the selected text while changing leading indentation', async() => {
    await setSourceMarkdown(page, app, 'alpha beta\n')
    await selectParagraphText(page, 2, 5)
    await page.keyboard.press('Tab')
    await expect.poll(() => paragraphText(page)).toBe(`${INDENT}alpha beta`)
    await expect.poll(() => page.evaluate(() => window.getSelection()?.toString())).toBe('pha')
    await page.keyboard.press('Shift+Tab')
    await expect.poll(() => paragraphText(page)).toBe('alpha beta')
    await expect.poll(() => page.evaluate(() => window.getSelection()?.toString())).toBe('pha')
    await page.keyboard.insertText('X')
    await expect.poll(() => paragraphText(page)).toBe('alX beta')
  })

  test('indentation survives source mode, saving, and reopening the Markdown file', async() => {
    await setSourceMarkdown(page, app, '저장할 문장\n')
    await selectParagraphText(page, 0)
    await page.keyboard.press('Tab')
    await expect.poll(() => paragraphText(page)).toBe(`${INDENT}저장할 문장`)
    const markdown = await getMarkdownContent(page, app)
    expect(markdown.replace(/\n+$/, '')).toBe(`${INDENT}저장할 문장`)
    await expect(page.locator('.editor-component .mu-code-block')).toHaveCount(0)
    await sendIpcToRenderer(app, 'mt::editor-ask-file-save')
    await expect.poll(() => readFileSync(filePath, 'utf8')).toBe(markdown)
    await expect(page.locator('.editor-tabs li.unsaved')).toHaveCount(0)
    await app.close()
    const reopened = await launchWithDoc(filePath, {
      suppressErrorDialog: true,
      preferences: { tabSize: 4 }
    })
    app = reopened.app
    page = reopened.page
    await expect.poll(() => paragraphText(page)).toBe(`${INDENT}저장할 문장`)
    await expect(page.locator('.editor-component .mu-code-block')).toHaveCount(0)
    expect(await getMarkdownContent(page, app)).toBe(markdown)
  })

  test('four ordinary leading spaces in an imported document retain Markdown code semantics', async() => {
    await setSourceMarkdown(page, app, '    const value = 1\n\nplain paragraph\n')
    await expect(page.locator('.editor-component .mu-code-block')).toHaveCount(1)
    await expect(page.locator('.editor-component .mu-codeblock-content')).toContainText('const value = 1')
    const markdown = await getMarkdownContent(page, app)
    expect(markdown).toMatch(/^ {4}const value = 1\n/)
    await expect(page.locator('.editor-component .mu-code-block')).toHaveCount(1)
  })
})
