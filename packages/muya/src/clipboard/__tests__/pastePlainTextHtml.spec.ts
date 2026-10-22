// @vitest-environment happy-dom

import type Content from '../../block/base/content';
import type { Muya } from '../../muya';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Muya as MuyaClass } from '../../muya';
import { SelectionCaretType, SelectionDirection } from '../../selection/types';

// muyajs `pasteAsPlainText`: block-level HTML present in text/plain is inserted
// as literal text, not rendered into a live html-block (which is what NORMAL
// paste does).

vi.mock('../../utils/prism/index', () => ({
    default: {},
    walkTokens: () => null,
    loadedLanguages: new Set(),
    transformAliasToOrigin: (s: string) => s,
    loadLanguage: () => null,
    search: () => [],
}));

vi.mock('../../utils/paste', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../utils/paste')>();
    return { ...actual, normalizePastedHTML: async (html: string) => html };
});

const bootedHosts: HTMLElement[] = [];
let hadVersion = false;
let originalVersion: string | undefined;

beforeEach(() => {
    hadVersion = 'MUYA_VERSION' in window;
    originalVersion = window.MUYA_VERSION;
    window.MUYA_VERSION = 'test';
});

afterEach(() => {
    while (bootedHosts.length)
        bootedHosts.pop()!.remove();
    if (hadVersion)
        window.MUYA_VERSION = originalVersion as string;
    else
        delete (window as Partial<Window>).MUYA_VERSION;
});

function bootMuya(markdown: string, options: Record<string, unknown> = {}): Muya {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const muya = new MuyaClass(host, { markdown, ...options } as ConstructorParameters<typeof MuyaClass>[1]);
    muya.init();
    bootedHosts.push(muya.domNode);
    return muya;
}

function firstContent(muya: Muya): Content {
    return muya.editor.scrollPage!.firstContentInDescendant()!;
}

describe('paste as plain text — block-level HTML is literal (A8, muyajs parity)', () => {
    it('inserts <ul>...</ul> as literal text rather than a live html-block', async () => {
        const html = '<ul><li>a</li><li>b</li></ul>';
        const muya = bootMuya('foo\n', { clipboardText: () => html });
        const block = firstContent(muya);
        const path = block.path;
        muya.editor.selection.getSelection = () => ({
            anchor: { offset: 3, block, path },
            focus: { offset: 3, block, path },
            isCollapsed: true,
            isSelectionInSameBlock: true,
            direction: SelectionDirection.FORWARD,
            type: SelectionCaretType.RANGE,
        });

        await muya.editor.clipboard.pasteAsPlainText();
        await new Promise(r => setTimeout(r, 40));

        // The HTML merged into the paragraph as literal text — one block, no
        // separate html-block.
        expect(muya.getMarkdown()).toBe(`foo${html}\n`);
        expect(muya.editor.scrollPage!.length()).toBe(1);
    });

    it('folds the first line into the anchor and makes the rest one html-block (muyajs parity)', async () => {
        const html = '<ul>\n<li>a</li>\n</ul>';
        const muya = bootMuya('foo\n', { clipboardText: () => html });
        const block = firstContent(muya);
        const path = block.path;
        muya.editor.selection.getSelection = () => ({
            anchor: { offset: 3, block, path },
            focus: { offset: 3, block, path },
            isCollapsed: true,
            isSelectionInSameBlock: true,
            direction: SelectionDirection.FORWARD,
            type: SelectionCaretType.RANGE,
        });

        await muya.editor.clipboard.pasteAsPlainText();
        await new Promise(r => setTimeout(r, 40));

        // muyajs: line 0 folds into 'foo' as literal text, the remaining lines
        // become a single live html-block — two blocks, not three paragraphs.
        const md = muya.getMarkdown();
        expect(md).toBe('foo<ul>\n\n<li>a</li>\n</ul>\n');
        expect(muya.editor.scrollPage!.length()).toBe(2);
    });
});

describe('plain-text paste policy', () => {
    it.each(['native', 'explicit'])('uses text even when the OS clipboard resolves an image (%s)', async (entry) => {
        const clipboardFilePath = vi.fn().mockResolvedValue('/tmp/copied-image.png');
        const imageAction = vi.fn().mockResolvedValue('assets/copied-image.png');
        const muya = bootMuya('start ', {
            pasteAsPlainText: true,
            clipboardText: async () => '복사한 텍스트',
            clipboardFilePath,
            imageAction,
        });
        const block = firstContent(muya);
        const path = block.path;
        muya.editor.selection.getSelection = () => ({
            anchor: { offset: 6, block, path },
            focus: { offset: 6, block, path },
            isCollapsed: true,
            isSelectionInSameBlock: true,
            direction: SelectionDirection.FORWARD,
            type: SelectionCaretType.RANGE,
        });

        if (entry === 'explicit') {
            await muya.editor.clipboard.pasteAsPlainText();
        }
        else {
            const data = new DataTransfer();
            data.setData('text/plain', '복사한 텍스트');
            data.setData('text/html', '<p><strong>복사한 텍스트</strong><img src="photo.png"></p>');
            data.items.add(new File(['image'], 'photo.png', { type: 'image/png' }));
            await muya.editor.clipboard.pasteHandler(new ClipboardEvent('paste', { clipboardData: data }));
        }

        await expect.poll(() => muya.getMarkdown()).toBe('start 복사한 텍스트\n');
        expect(clipboardFilePath).not.toHaveBeenCalled();
        expect(imageAction).not.toHaveBeenCalled();
    });

    it('preserves a cross-block selection when the clipboard contains only an image', async () => {
        const muya = bootMuya('first\n\nsecond\n', { pasteAsPlainText: true });
        const anchor = firstContent(muya);
        const focus = muya.editor.scrollPage!.lastContentInDescendant()!;
        muya.editor.selection.getSelection = () => ({
            anchor: { offset: 0, block: anchor, path: anchor.path },
            focus: { offset: 6, block: focus, path: focus.path },
            isCollapsed: false,
            isSelectionInSameBlock: false,
            direction: SelectionDirection.FORWARD,
            type: SelectionCaretType.RANGE,
        });
        const cut = vi.spyOn(muya.editor.clipboard, 'cutHandler');
        const data = new DataTransfer();
        data.items.add(new File(['image'], 'photo.png', { type: 'image/png' }));
        const event = new ClipboardEvent('paste', { clipboardData: data, cancelable: true });

        await muya.editor.clipboard.pasteHandler(event);

        expect(event.defaultPrevented).toBe(true);
        expect(muya.getMarkdown()).toBe('first\n\nsecond\n');
        expect(cut).not.toHaveBeenCalled();
    });
});
