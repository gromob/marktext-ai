import type { CDPSession, Page } from '@playwright/test';
import { expect, test } from '../fixtures/muya';
import { getMarkdown, getState } from '../helpers/api';

test.use({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
});

async function seed(page: Page, markdown: string, selected: boolean): Promise<string> {
    await page.evaluate(({ markdown, selected }) => {
        window.muya!.setContent(markdown);
        const block = window.muya!.editor.scrollPage!.firstContentInDescendant()!;
        block.setCursor(selected ? 0 : 2, 2, true);
        window.muya!.clearHistory();
    }, { markdown, selected });
    await expect.poll(() => getMarkdown(page)).toContain('수학');
    return getMarkdown(page);
}

async function requestCandidates(page: Page): Promise<void> {
    // Synthetic shortcut: headless Chromium has no macOS Korean input method.
    // Do not supply a CDP replacement range: the captured native input had none.
    const result = await page.evaluate(() => {
        const muya = window.muya!;
        const block = muya.editor.activeContentBlock!;
        const html = muya.domNode.innerHTML;
        const event = new KeyboardEvent('keydown', {
            key: 'Enter',
            altKey: true,
            bubbles: true,
            cancelable: true,
        });
        block.domNode!.dispatchEvent(event);
        return { prevented: event.defaultPrevented, unchanged: html === muya.domNode.innerHTML };
    });
    expect(result).toEqual({ prevented: false, unchanged: true });
}

async function reconvert(cdp: CDPSession, committed: string): Promise<void> {
    await cdp.send('Input.imeSetComposition', {
        text: '修學',
        selectionStart: 2,
        selectionEnd: 2,
    });
    await cdp.send('Input.imeSetComposition', { text: '受學', selectionStart: 2, selectionEnd: 2 });
    await cdp.send('Input.insertText', { text: committed });
}

test.describe('IME reconversion replacement', () => {
    test.skip(({ browserName }) => browserName !== 'chromium', 'CDP composition requires Chromium');

    for (const [name, markdown] of [
        ['paragraph', '수학'],
        ['list', '- 수학\n- 다음'],
        ['table', '| 수학 | 값 |\n| --- | --- |\n| 내용 | 값 |'],
    ]) {
        test(`${name}: reconverts immediately after the final Hangul syllable commits`, async ({ page }) => {
            const original = await seed(page, markdown, false);
            await page.evaluate((markdown) => {
                window.muya!.setContent(markdown.replace('수학', '수'));
                window.muya!.editor.scrollPage!.firstContentInDescendant()!.setCursor(1, 1, true);
            }, markdown);
            const cdp = await page.context().newCDPSession(page);
            await cdp.send('Input.imeSetComposition', { text: '학', selectionStart: 1, selectionEnd: 1 });
            await requestCandidates(page);
            await cdp.send('Input.insertText', { text: '학' });
            await expect.poll(() => getMarkdown(page)).toBe(original);

            await reconvert(cdp, '數學');
            const expected = original.replace('수학', '數學');
            await expect.poll(() => getMarkdown(page)).toBe(expected);
            await page.evaluate(() => window.muya!.undo());
            await expect.poll(() => getMarkdown(page)).toBe(original);
            await page.evaluate(() => window.muya!.redo());
            await expect.poll(() => getMarkdown(page)).toBe(expected);
        });

        for (const selected of [false, true]) {
            test(`${name}, selected=${selected}: replaces in place and round-trips`, async ({ page }) => {
                const original = await seed(page, markdown, selected);
                const before = JSON.stringify(await getState(page));
                await requestCandidates(page);
                expect(JSON.stringify(await getState(page))).toBe(before);

                const cdp = await page.context().newCDPSession(page);
                await reconvert(cdp, '數學');
                const expected = original.replace('수학', '數學');
                await expect.poll(() => getMarkdown(page)).toBe(expected);

                await page.evaluate(() => window.muya!.undo());
                await expect.poll(() => getMarkdown(page)).toBe(original);
                await page.evaluate(() => window.muya!.redo());
                await expect.poll(() => getMarkdown(page)).toBe(expected);

                const saved = await getMarkdown(page);
                await page.evaluate(md => window.muya!.setContent(md), saved);
                await expect.poll(() => getMarkdown(page)).toBe(expected);
                expect((await getMarkdown(page)).split('\n').length).toBe(original.split('\n').length);
            });
        }
    }

    test('undo after typing the final syllable and reconverting restores the whole word', async ({ page }) => {
        await page.evaluate(() => {
            window.muya!.setContent('수');
            window.muya!.editor.scrollPage!.firstContentInDescendant()!.setCursor(1, 1, true);
        });
        const cdp = await page.context().newCDPSession(page);
        await cdp.send('Input.imeSetComposition', { text: '학', selectionStart: 1, selectionEnd: 1 });
        await cdp.send('Input.insertText', { text: '학' });
        await requestCandidates(page);
        await cdp.send('Input.imeSetComposition', { text: '數學', selectionStart: 2, selectionEnd: 2 });
        await page.evaluate(() => {
            window.muya!.editor.activeContentBlock!.domNode!.dispatchEvent(new KeyboardEvent('keyup', {
                key: 'Enter',
                altKey: true,
                bubbles: true,
            }));
        });
        await cdp.send('Input.insertText', { text: '數學' });
        await page.evaluate(() => window.muya!.undo());
        await expect.poll(() => getMarkdown(page)).toBe('수학\n');
        await page.evaluate(() => window.muya!.undo());
        await expect.poll(() => getMarkdown(page)).toBe('수\n');
        await page.evaluate(() => window.muya!.redo());
        await expect.poll(() => getMarkdown(page)).toBe('수학\n');
        await page.evaluate(() => window.muya!.redo());
        await expect.poll(() => getMarkdown(page)).toBe('數學\n');
    });

    test('keeps Hangul when candidate selection commits the original word', async ({ page }) => {
        const original = await seed(page, '수학', true);
        await requestCandidates(page);
        const cdp = await page.context().newCDPSession(page);
        await reconvert(cdp, '수학');
        await expect.poll(() => getMarkdown(page)).toBe(original);
    });

    test('ordinary Korean composition still commits once', async ({ page }) => {
        await page.evaluate(() => {
            window.muya!.setContent('');
            window.muya!.editor.scrollPage!.firstContentInDescendant()!.setCursor(0, 0, true);
        });
        const cdp = await page.context().newCDPSession(page);
        await cdp.send('Input.imeSetComposition', { text: '수', selectionStart: 1, selectionEnd: 1 });
        await cdp.send('Input.imeSetComposition', { text: '수학', selectionStart: 2, selectionEnd: 2 });
        await cdp.send('Input.insertText', { text: '수학' });
        await expect.poll(() => getMarkdown(page)).toBe('수학\n');
    });

    test('fast typing, paragraph creation and reconversion have separate undo boundaries', async ({ page }) => {
        await page.evaluate(() => {
            window.muya!.setContent('앞');
            window.muya!.editor.scrollPage!.firstContentInDescendant()!.setCursor(1, 1, true);
        });
        await page.keyboard.press('Enter');
        const cdp = await page.context().newCDPSession(page);
        await cdp.send('Input.insertText', { text: '수' });
        await cdp.send('Input.imeSetComposition', { text: '학', selectionStart: 1, selectionEnd: 1 });
        await page.evaluate(() => {
            window.muya!.editor.activeContentBlock!.domNode!.dispatchEvent(new KeyboardEvent('keydown', {
                key: 'Enter',
                altKey: true,
                keyCode: 229,
                isComposing: true,
                bubbles: true,
                cancelable: true,
            }));
        });
        await cdp.send('Input.insertText', { text: '학' });
        await reconvert(cdp, '數學');
        await expect.poll(() => getMarkdown(page)).toBe('앞\n\n數學\n');

        await page.evaluate(() => window.muya!.undo());
        await expect.poll(() => getMarkdown(page)).toBe('앞\n\n수학\n');
        await page.evaluate(() => window.muya!.redo());
        await expect.poll(() => getMarkdown(page)).toBe('앞\n\n數學\n');
        await page.keyboard.press('ArrowRight');
        await expect.poll(() => page.locator('.mu-paragraph').count()).toBe(3);
        expect(await page.evaluate(() => window.muya!.editor.activeContentBlock!.text)).toBe('');
        await page.keyboard.press('Enter');
        await expect.poll(() => page.locator('.mu-paragraph').count()).toBe(4);
    });

    test('typing immediately after reconversion does not merge into its undo entry', async ({ page }) => {
        await seed(page, '수학', false);
        await requestCandidates(page);
        const cdp = await page.context().newCDPSession(page);
        await reconvert(cdp, '數學');
        await cdp.send('Input.insertText', { text: '후' });
        await expect.poll(() => getMarkdown(page)).toBe('數學후\n');

        await page.evaluate(() => window.muya!.undo());
        await expect.poll(() => getMarkdown(page)).toBe('數學\n');
        await page.evaluate(() => window.muya!.undo());
        await expect.poll(() => getMarkdown(page)).toBe('수학\n');
    });

    test('undo during Korean composition preserves its text for redo and leaves cursor keys usable', async ({ page }) => {
        await page.evaluate(() => {
            window.muya!.setContent('기준');
            window.muya!.editor.scrollPage!.firstContentInDescendant()!.setCursor(2, 2, true);
        });
        const cdp = await page.context().newCDPSession(page);
        await cdp.send('Input.insertText', { text: 'a' });
        await expect.poll(() => getMarkdown(page)).toBe('기준a\n');
        await cdp.send('Input.imeSetComposition', { text: '수', selectionStart: 1, selectionEnd: 1 });

        await page.evaluate(() => window.muya!.undo());
        await expect.poll(() => getMarkdown(page)).toBe('기준\n');
        await page.evaluate(() => window.muya!.redo());
        await expect.poll(() => getMarkdown(page)).toBe('기준a수\n');
        await page.keyboard.press('ArrowLeft');
        expect(await page.evaluate(() => window.muya!.editor.activeContentBlock!.getCursor()!.start.offset)).toBe(3);
        await page.keyboard.press('Enter');
        await expect.poll(() => getMarkdown(page)).toBe('기준a\n\n수\n');
    });

    for (const selected of [false, true]) {
        test(`undo restores the original selection in the same middle paragraph (selected=${selected})`, async ({ page }) => {
            const original = '이전 문단\n\n앞 수학 뒤\n\n다음 문단\n';
            const path = await page.evaluate(({ markdown, selected }) => {
                const muya = window.muya!;
                muya.setContent(markdown);
                const block = muya.editor.scrollPage!.queryBlock([1, 'text']);
                if (!block?.isContent())
                    throw new Error('Middle paragraph content not found');
                block.setCursor(selected ? 2 : 4, 4, true);
                return block.path;
            }, { markdown: original, selected });
            await requestCandidates(page);
            const cdp = await page.context().newCDPSession(page);
            await reconvert(cdp, '數學');
            await expect.poll(() => getMarkdown(page)).toBe(original.replace('수학', '數學'));

            await page.evaluate(() => window.muya!.undo());
            await expect.poll(() => getMarkdown(page)).toBe(original);
            const restored = await page.evaluate(() => {
                const muya = window.muya!;
                const selection = muya.editor.selection.getSelection()!;
                return {
                    anchor: { path: selection.anchor.path, offset: selection.anchor.offset },
                    focus: { path: selection.focus.path, offset: selection.focus.offset },
                    text: document.getSelection()!.toString(),
                };
            });
            expect(restored).toEqual({
                anchor: { path, offset: selected ? 2 : 4 },
                focus: { path, offset: 4 },
                text: selected ? '수학' : '',
            });
            await page.evaluate(() => window.muya!.redo());
            await expect.poll(() => getMarkdown(page)).toBe(original.replace('수학', '數學'));
            expect(await page.evaluate(() => window.muya!.editor.activeContentBlock!.path)).toEqual(path);
        });
    }

    test('undo at the first word does not restore the previous ordered-list caret', async ({ page }) => {
        const markdown = '# 검증\n\n## 일반 문단\n\n수학\n\n오늘은 수학 공부를 합니다.\n\n## 목록\n\n- 수학\n- 유지\n\n1. 수학\n2. 유지\n';
        const path = await page.evaluate((markdown) => {
            const muya = window.muya!;
            muya.setContent(markdown);
            const list = muya.editor.scrollPage!.queryBlock([6]);
            if (!list?.isParent())
                throw new Error('Ordered list not found');
            const previous = list.firstContentInDescendant()!;
            previous.setCursor(previous.text.length, previous.text.length, true);
            const first = muya.editor.scrollPage!.queryBlock([2, 'text']);
            if (!first?.isContent())
                throw new Error('First word not found');
            return first.path;
        }, markdown);
        const cdp = await page.context().newCDPSession(page);
        await cdp.send('Input.insertText', { text: 'x' });
        await expect.poll(() => getMarkdown(page)).toContain('수학x');
        await page.evaluate((path) => {
            const block = window.muya!.editor.scrollPage!.queryBlock([...path]);
            if (block?.isContent())
                block.setCursor(2, 2, true);
        }, path);
        const original = await getMarkdown(page);
        await requestCandidates(page);
        await reconvert(cdp, '數學');
        await expect.poll(() => getMarkdown(page)).toBe(original.replace('수학', '數學'));
        await page.evaluate(() => window.muya!.undo());
        await expect.poll(() => getMarkdown(page)).toBe(original);
        expect(await page.evaluate(() => window.muya!.editor.activeContentBlock!.path)).toEqual(path);
        expect(await page.evaluate(() => document.getSelection()!.toString())).toBe('');
        expect(await page.evaluate(() => window.muya!.editor.activeContentBlock!.getCursor()!.start.offset)).toBe(2);
    });
});
