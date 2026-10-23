// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Muya } from '../../../muya';

const platform = vi.hoisted(() => ({ mac: true }));
vi.mock('../../../config', async (importOriginal) => {
    const config = await importOriginal<typeof import('../../../config')>();
    return {
        ...config,
        get isOsx() {
            return platform.mac;
        },
    };
});

const editors: Muya[] = [];
let originalVersion: string | undefined;

beforeEach(() => {
    originalVersion = window.MUYA_VERSION;
    window.MUYA_VERSION = 'test';
    platform.mac = true;
});

afterEach(() => {
    for (const muya of editors.splice(0)) {
        muya.destroy();
        muya.domNode.remove();
    }
    document.getSelection()?.removeAllRanges();
    if (originalVersion === undefined)
        delete (window as Partial<Window>).MUYA_VERSION;
    else
        window.MUYA_VERSION = originalVersion;
});

function boot(markdown = '수학') {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const muya = new Muya(host, { markdown } as ConstructorParameters<typeof Muya>[1]);
    muya.init();
    editors.push(muya);
    const block = muya.editor.scrollPage!.firstContentInDescendant()!;
    return { muya, block };
}

describe('ime-owned keydown', () => {
    it.each([false, true])('preserves text and selects the macOS reconversion source (selected: %s)', (selected) => {
        const { muya, block } = boot();
        block.setCursor(selected ? 0 : 2, 2, true);
        const before = muya.domNode.innerHTML;
        const event = new KeyboardEvent('keydown', { key: 'Enter', altKey: true, cancelable: true });

        block.keydownHandler(event);

        expect(event.defaultPrevented).toBe(false);
        expect(muya.domNode.innerHTML).toBe(before);
        expect(block.text).toBe('수학');
        expect(block.getCursor()?.start.offset).toBe(0);
        expect(block.getCursor()?.end.offset).toBe(2);
    });

    it('selects only contiguous Hangul before the caret', () => {
        const { block } = boot('앞 수학 뒤');
        block.setCursor(4, 4, true);
        block.keydownHandler(new KeyboardEvent('keydown', { key: 'Enter', altKey: true }));
        expect(block.getCursor()?.start.offset).toBe(2);
        expect(block.getCursor()?.end.offset).toBe(4);
        expect(block.text).toBe('앞 수학 뒤');
    });

    it.each(['math', '수학.'])('does not select non-Hangul at the caret: %s', (markdown) => {
        const { block } = boot(markdown);
        block.setCursor(block.text.length, block.text.length, true);
        block.keydownHandler(new KeyboardEvent('keydown', { key: 'Enter', altKey: true }));
        expect(block.getCursor()?.isCollapsed).toBe(true);
    });

    it.each([false, true])('waits for the active syllable to commit (key released: %s)', (released) => {
        const { block } = boot('수');
        block.setCursor(1, 1, true);
        block.composeHandler(new CompositionEvent('compositionstart'));
        const node = block.domNode!.querySelector('.mu-plain-text')!.firstChild as Text;
        node.data = '수학';
        const range = document.createRange();
        range.setStart(node, 2);
        range.collapse(true);
        document.getSelection()!.removeAllRanges();
        document.getSelection()!.addRange(range);
        block.keydownHandler(new KeyboardEvent('keydown', { key: 'Enter', altKey: true, isComposing: true, keyCode: 229 }));
        expect(block.getCursor()?.isCollapsed).toBe(true);
        if (released)
            block.domNode!.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter' }));

        block.composeHandler(new CompositionEvent('compositionend', { data: '학' }));

        expect(block.text).toBe('수학');
        expect(block.getCursor()?.start.offset).toBe(released ? 2 : 0);
        expect(block.getCursor()?.end.offset).toBe(2);
    });

    it.each([
        { isComposing: true },
        { keyCode: 229 },
    ])('bypasses floating UI and editing before compositionstart: %j', (flags) => {
        const { muya, block } = boot();
        block.setCursor(0, 2, true);
        const ui = vi.spyOn(muya.ui, 'handleContentKeydown').mockReturnValue(true);
        const enter = vi.spyOn(block, 'enterHandler');
        const event = new KeyboardEvent('keydown', { key: 'Enter', cancelable: true, ...flags });

        block.keydownHandler(event);

        expect(ui).not.toHaveBeenCalled();
        expect(enter).not.toHaveBeenCalled();
        expect(event.defaultPrevented).toBe(false);
        expect(block.text).toBe('수학');
    });

    it('leaves candidate navigation to an active composition even with a floating UI', () => {
        const { muya, block } = boot();
        block.setCursor(2, 2, true);
        block.composeHandler(new CompositionEvent('compositionstart'));
        const ui = vi.spyOn(muya.ui, 'handleContentKeydown').mockReturnValue(true);
        const event = new KeyboardEvent('keydown', { key: 'ArrowDown', cancelable: true });

        block.keydownHandler(event);

        expect(ui).not.toHaveBeenCalled();
        expect(event.defaultPrevented).toBe(false);
    });

    it.each([
        { key: 'Enter' },
        { key: 'Enter', shiftKey: true },
        { key: 'Enter', altKey: true, mac: false },
    ])('preserves editor Enter handling: %j', ({ mac = true, ...keys }) => {
        platform.mac = mac;
        const { block } = boot();
        block.setCursor(2, 2, true);
        const enter = vi.spyOn(block, 'enterHandler');
        const event = new KeyboardEvent('keydown', { ...keys, cancelable: true });

        block.keydownHandler(event);

        expect(enter).toHaveBeenCalledOnce();
        expect(event.defaultPrevented).toBe(true);
    });
});
