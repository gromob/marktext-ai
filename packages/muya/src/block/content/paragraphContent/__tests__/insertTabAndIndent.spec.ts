// @vitest-environment happy-dom

import type ParagraphContent from '..';
import type Content from '../../../base/content';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Muya } from '../../../../muya';

// Characterization of ParagraphContent.tabHandler's three plain-Tab branches
// (src/block/content/paragraphContent/index.ts):
//   1. insertTab()           — a normal paragraph gains `tabSize` ordinary
//                              spaces (U+0020) at the caret and the caret
//                              advances by that width. `.mu-content` is
//                              `white-space: pre-wrap`, so ordinary spaces are
//                              preserved visually without polluting the saved
//                              markdown with non-breaking spaces (#3273).
//   2. _indentListItem() / _unindentListItem() — Tab nests a list item under
//      its predecessor; Shift+Tab lifts it back out.
//   3. _checkCursorAtEndFormat() — with the caret just inside a closing inline
//      marker (e.g. the `**` of strong) Tab jumps the caret PAST the marker and
//      leaves the text unchanged.
//
// Real Muya is booted (mirroring deleteMerge.spec.ts / backspaceUnwrap.spec.ts):
// the caret is landed via content.setCursor, the handler is invoked the way the
// keydown listener routes it, and state/markdown/cursor are read after the
// json1 op flushes on the next animation frame.

const bootedHosts: HTMLElement[] = [];
let originalVersion: string | undefined;
let hadVersion = false;

// An ordinary space (U+0020) — the character insertTab repeats `tabSize` times.
const SPACE = String.fromCharCode(32);

beforeEach(() => {
    hadVersion = 'MUYA_VERSION' in window;
    originalVersion = window.MUYA_VERSION;
    window.MUYA_VERSION = 'test';
});

afterEach(() => {
    while (bootedHosts.length) {
        const host = bootedHosts.pop()!;
        host.remove();
    }
    document.getSelection()?.removeAllRanges();
    if (hadVersion)
        window.MUYA_VERSION = originalVersion as string;
    else
        delete (window as Partial<Window>).MUYA_VERSION;
});

function bootMuya(markdown: string, options: Record<string, unknown> = {}): Muya {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const muya = new Muya(host, { markdown, ...options } as ConstructorParameters<typeof Muya>[1]);
    muya.init();
    bootedHosts.push(muya.domNode);
    return muya;
}

// Find the leaf `.content` block whose rendered text matches `text`, the way a
// click resolves the active content block.
function contentByText(muya: Muya, text: string): Content {
    let target: Content | null = null;
    const visit = (block: {
        text?: string;
        constructor: { blockName?: string };
        children?: { forEach: (cb: (b: unknown) => void) => void };
    }) => {
        if (block.constructor.blockName?.endsWith('.content') && block.text === text)
            target = block as unknown as Content;
        block.children?.forEach(b => visit(b as typeof block));
    };
    visit(muya.editor.scrollPage as unknown as Parameters<typeof visit>[0]);
    if (!target)
        throw new Error(`content block with text "${text}" not found`);
    return target;
}

// Land the caret at [start, end] of the given content block (active block +
// cursor), then route a Tab through its handler the way the keydown listener
// does.
function tabAt(muya: Muya, content: Content, offset: number, shiftKey = false): void {
    muya.editor.activeContentBlock = content;
    content.setCursor(offset, offset, true);
    const event = {
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        key: 'Tab',
        shiftKey,
    } as unknown as KeyboardEvent;
    content.tabHandler(event);
}

function flush(): Promise<void> {
    return new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
}

function blockText(state: ReturnType<Muya['getState']>, index: number): string {
    return (state[index] as { text: string }).text;
}

describe('paragraphContent.tabHandler — insertTab in a plain paragraph', () => {
    it('inserts `tabSize` ordinary spaces and advances the caret by that width (default 4)', async () => {
        const muya = bootMuya('hello\n');
        expect(muya.options.tabSize).toBe(4);
        const content = contentByText(muya, 'hello');

        tabAt(muya, content, 5);

        await flush();
        const text = blockText(muya.getState(), 0);
        // `hello` + four U+0020 spaces.
        expect(text).toBe(`hello${SPACE.repeat(4)}`);
        expect(text.length).toBe(9);
        // The inserted run is ordinary spaces (U+0020), not non-breaking spaces.
        expect([...text.slice(5)].every(ch => ch.charCodeAt(0) === 32)).toBe(true);

        const cursor = content.getCursor();
        expect(cursor).not.toBeNull();
        expect(cursor!.start.offset).toBe(9);
    });

    // #3273: Tab used to insert U+00A0 (charCode 160), which leaked into the
    // saved markdown and was not treated as whitespace by other tools. The
    // serialized document must contain only ordinary spaces.
    it('does not write any non-breaking space into the serialized markdown', async () => {
        const muya = bootMuya('hello\n');
        const content = contentByText(muya, 'hello');

        tabAt(muya, content, 5);

        await flush();
        const markdown = muya.getMarkdown();
        expect(markdown).toContain(`hello${SPACE.repeat(4)}`);
        expect([...markdown].some(ch => ch.charCodeAt(0) === 160)).toBe(false);
    });

    it('honors a custom tabSize of 2 (narrower insert, caret advances by 2)', async () => {
        const muya = bootMuya('hello\n', { tabSize: 2 });
        expect(muya.options.tabSize).toBe(2);
        const content = contentByText(muya, 'hello');

        tabAt(muya, content, 5);

        await flush();
        const text = blockText(muya.getState(), 0);
        expect(text).toBe(`hello${SPACE.repeat(2)}`);
        expect(text.length).toBe(7);

        const cursor = content.getCursor();
        expect(cursor!.start.offset).toBe(7);
    });

    it('the tabSize-2 insert is strictly narrower than the tabSize-4 insert', async () => {
        // Only one DOM selection exists at a time, so capture each instance's
        // caret offset immediately after driving it, before booting the other.
        const wide = bootMuya('x\n');
        const wideContent = contentByText(wide, 'x');
        tabAt(wide, wideContent, 1);
        await flush();
        const wideLen = blockText(wide.getState(), 0).length;
        const wideCaret = wideContent.getCursor()!.start.offset;

        const narrow = bootMuya('x\n', { tabSize: 2 });
        const narrowContent = contentByText(narrow, 'x');
        tabAt(narrow, narrowContent, 1);
        await flush();
        const narrowLen = blockText(narrow.getState(), 0).length;
        const narrowCaret = narrowContent.getCursor()!.start.offset;

        // 1 ('x') + 4 vs 1 ('x') + 2.
        expect(wideLen).toBe(5);
        expect(narrowLen).toBe(3);
        expect(narrowLen).toBeLessThan(wideLen);
        expect(wideCaret).toBe(5);
        expect(narrowCaret).toBe(3);
    });
});

describe('paragraphContent.tabHandler — indent / unindent a list item', () => {
    it('tab nests the second item under the first (2-space markdown indent)', async () => {
        const muya = bootMuya('- a\n- b\n');
        expect(muya.getMarkdown()).toBe('- a\n- b\n');
        const b = contentByText(muya, 'b');

        tabAt(muya, b, 0);

        await flush();
        // `b` is now a nested bullet list under `a`'s list item.
        expect(muya.getMarkdown()).toBe('- a\n  - b\n');
        // The whole document stays a single bullet list — nothing dropped.
        const state = muya.getState();
        expect(state.length).toBe(1);
        expect(state[0].name).toBe('bullet-list');
    });

    it('shift+Tab lifts the nested item back out to the top level', async () => {
        const muya = bootMuya('- a\n- b\n');
        const b = contentByText(muya, 'b');

        tabAt(muya, b, 0);
        await flush();
        expect(muya.getMarkdown()).toBe('- a\n  - b\n');

        const nestedB = contentByText(muya, 'b');
        tabAt(muya, nestedB, 0, true);
        await flush();

        expect(muya.getMarkdown()).toBe('- a\n- b\n');
        const state = muya.getState();
        expect(state.length).toBe(1);
        expect(state[0].name).toBe('bullet-list');
    });
});

describe('paragraphContent.tabHandler — jump past a closing inline marker', () => {
    it('tab just inside a closing `**` moves the caret past the marker with no text change', async () => {
        const muya = bootMuya('**bold**\n');
        const content = contentByText(muya, '**bold**');
        // Content text carries the raw markers: `**bold**` (length 8); the
        // closing `**` occupies offsets 6..8, so "just inside" is offset 6.
        expect(content.text).toBe('**bold**');

        tabAt(muya, content, 6);

        await flush();
        // No text was inserted — the caret only jumped past the closing marker.
        expect(blockText(muya.getState(), 0)).toBe('**bold**');
        const cursor = content.getCursor();
        expect(cursor).not.toBeNull();
        expect(cursor!.start.offset).toBe(8);
    });

    it('tab at the true end of the paragraph still inserts a tab (no marker to jump)', async () => {
        const muya = bootMuya('**bold**\n');
        const content = contentByText(muya, '**bold**');

        tabAt(muya, content, 8);

        await flush();
        const text = blockText(muya.getState(), 0);
        // Caret was past the closing marker, so insertTab runs.
        expect(text).toBe(`**bold**${SPACE.repeat(4)}`);
        expect(content.getCursor()!.start.offset).toBe(12);
    });
});

describe('paragraphContent.tabHandler — opt-in paragraph indentation', () => {
    const indent = '\u00A0'.repeat(4);

    function pressTab(content: Content, anchor: number, focus = anchor, shiftKey = false) {
        content.setCursor(anchor, focus, true);
        content.tabHandler(new KeyboardEvent('keydown', { key: 'Tab', shiftKey }));
    }

    it('indents a line from a mid-text caret and keeps its Korean/emoji offset', () => {
        const text = '한글🙂 문장';
        const muya = bootMuya(text, { indentParagraphsWithTab: true });
        const content = contentByText(muya, text);

        pressTab(content, 4);

        expect(content.text).toBe(indent + text);
        expect(content.getCursor()!.start.offset).toBe(8);
        expect(muya.getState()[0].name).toBe('paragraph');
        const markdown = muya.getMarkdown();
        const reopened = bootMuya(markdown, { indentParagraphsWithTab: true });
        expect(reopened.getState()).toEqual(muya.getState());
        expect(reopened.getMarkdown()).toBe(markdown);
    });

    it('keeps a blank line followed by repeated Tabs and Korean input as a paragraph', () => {
        const muya = bootMuya('', { indentParagraphsWithTab: true });
        const content = contentByText(muya, '');
        pressTab(content, 0);
        pressTab(content, 4);
        expect(content.text).toBe(indent + indent);

        content.text += '안녕하세요🙂';
        content.setCursor(content.text.length, content.text.length, true);
        (content as ParagraphContent).checkInlineUpdate();
        muya.flush();

        expect(muya.getState()[0].name).toBe('paragraph');
        expect(blockText(muya.getState(), 0)).toBe(`${indent + indent}안녕하세요🙂`);
        const reopened = bootMuya(muya.getMarkdown(), { indentParagraphsWithTab: true });
        expect(reopened.getState()).toEqual(muya.getState());
    });

    it('outdents one level, clamps a caret in removed whitespace, and stops at zero', () => {
        const muya = bootMuya(`${indent}${indent}문장`, { indentParagraphsWithTab: true });
        const content = contentByText(muya, `${indent}${indent}문장`);
        pressTab(content, 9, 9, true);
        expect(content.text).toBe(`${indent}문장`);
        expect(content.getCursor()!.start.offset).toBe(5);

        pressTab(content, 2, 2, true);
        expect(content.text).toBe('문장');
        expect(content.getCursor()!.start.offset).toBe(0);
        const undoCount = muya.getHistory().stack.undo.length;
        pressTab(content, 0, 0, true);
        expect(content.text).toBe('문장');
        expect(muya.getHistory().stack.undo).toHaveLength(undoCount);
    });

    it('honors tabSize and removes a partial mixed-space indent', () => {
        const muya = bootMuya('문장', { indentParagraphsWithTab: true, tabSize: 2 });
        const content = contentByText(muya, '문장');
        pressTab(content, 1);
        expect(content.text).toBe('\u00A0\u00A0문장');
        expect(content.getCursor()!.start.offset).toBe(3);

        content.text = ' \u00A0 문장';
        pressTab(content, 4, 4, true);
        expect(content.text).toBe(' 문장');
        expect(content.getCursor()!.start.offset).toBe(2);
        pressTab(content, 2, 2, true);
        expect(content.text).toBe('문장');
        expect(content.getCursor()!.start.offset).toBe(1);
    });

    it('preserves a backward selection across indented lines and excludes the next-line boundary', () => {
        const text = '첫🙂 줄\n둘째 줄\n마지막';
        const muya = bootMuya(text, { indentParagraphsWithTab: true });
        const content = contentByText(muya, text);
        const end = text.indexOf('마지막');

        pressTab(content, end, 1);

        expect(content.text).toBe(`${indent}첫🙂 줄\n${indent}둘째 줄\n마지막`);
        expect(content.getCursor()!.anchor.offset).toBe(end + 8);
        expect(content.getCursor()!.focus.offset).toBe(5);
        pressTab(content, end + 8, 5, true);
        expect(content.text).toBe(text);
        expect(content.getCursor()!.anchor.offset).toBe(end);
        expect(content.getCursor()!.focus.offset).toBe(1);
    });

    it('undoes each Tab separately from pending typing and restores selection on undo/redo', () => {
        const muya = bootMuya('문장', { indentParagraphsWithTab: true });
        const content = contentByText(muya, '문장');
        content.text += '🙂';
        pressTab(content, 4, 2);
        pressTab(content, 8, 6);
        expect(content.text).toBe(`${indent + indent}문장🙂`);

        muya.undo();
        expect(content.text).toBe(`${indent}문장🙂`);
        expect(content.getCursor()!.anchor.offset).toBe(8);
        expect(content.getCursor()!.focus.offset).toBe(6);
        muya.undo();
        expect(content.text).toBe('문장🙂');
        expect(content.getCursor()!.anchor.offset).toBe(4);
        expect(content.getCursor()!.focus.offset).toBe(2);
        muya.redo();
        expect(content.text).toBe(`${indent}문장🙂`);
        expect(content.getCursor()!.anchor.offset).toBe(8);
        expect(content.getCursor()!.focus.offset).toBe(6);
    });

    it.each([
        ['- first\n- second\n', '- first\n  - second\n'],
        ['1. first\n2. second\n', '1. first\n   1. second\n'],
        ['- [ ] first\n- [ ] second\n', '- [ ] first\n  - [ ] second\n'],
    ])('preserves list indentation with the option enabled: %s', (markdown, nested) => {
        const muya = bootMuya(markdown, { indentParagraphsWithTab: true });
        pressTab(contentByText(muya, 'second'), 2);
        muya.flush();
        expect(muya.getMarkdown()).toBe(nested);
        pressTab(contentByText(muya, 'second'), 2, 2, true);
        muya.flush();
        expect(muya.getMarkdown()).toBe(markdown);
        expect(muya.getMarkdown()).not.toContain('\u00A0');
    });

    it('keeps ordinary-space imported code as code with the option enabled', () => {
        const muya = bootMuya('    코드 내용\n', { indentParagraphsWithTab: true });
        expect(muya.getState()[0].name).toBe('code-block');
        expect(blockText(muya.getState(), 0)).toBe('코드 내용');
    });

    it('keeps paragraphs inside a quote nested in a list on the existing Tab path', () => {
        const muya = bootMuya('- > 문장\n', { indentParagraphsWithTab: true });
        const content = contentByText(muya, '문장');
        pressTab(content, 1);
        muya.flush();
        expect(content.text).toBe('문    장');
        expect(muya.getMarkdown()).not.toContain('\u00A0');
    });

    it.each([
        ['# 제목', 'atx-heading'],
        ['- 항목', 'bullet-list'],
    ])('outdents %s safely before later input converts Markdown syntax', (text, blockName) => {
        const muya = bootMuya(indent + text, { indentParagraphsWithTab: true });
        const content = contentByText(muya, indent + text);
        pressTab(content, content.text.length, content.text.length, true);
        expect(content.text).toBe(text);
        expect(content.getCursor()!.start.offset).toBe(text.length);

        content.text += '추가';
        content.setCursor(content.text.length, content.text.length, true);
        (content as ParagraphContent).checkInlineUpdate();
        muya.flush();
        expect(muya.getState()[0].name).toBe(blockName);
        expect(muya.getMarkdown()).toBe(`${text}추가\n`);
        expect(muya.editor.selection.getSelection()!.anchor.block.domNode!.isConnected).toBe(true);
    });
});
