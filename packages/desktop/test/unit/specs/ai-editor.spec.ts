import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAiEditorStore, type AiEditorAdapter } from '@/store/aiEditor'
import { rangeFromPositions, rangeFromStateSelection } from '@/util/aiSelection'

describe('AI editor transactions', () => {
  beforeEach(() => setActivePinia(createPinia()))

  const fixture = () => {
    const document = { documentId: 'one', markdown: 'same\n\nsame\n', revision: 0 }
    const history: string[] = []
    const adapter: AiEditorAdapter = {
      isActive: () => true,
      readDocument: () => ({ ...document }),
      readSelection: () => ({ range: { start: 6, end: 10 } }),
      replace: vi.fn((_snapshot, markdown) => {
        history.push(document.markdown)
        document.markdown = markdown
        document.revision++
      }),
      undo: vi.fn(() => {
        document.markdown = history.pop() ?? document.markdown
        document.revision++
      })
    }
    const store = useAiEditorStore()
    const unregister = store.registerAdapter('source', adapter)
    return { store, adapter, document, unregister }
  }

  it('replaces only the selected duplicate and undoes the whole AI transaction', () => {
    const { store, adapter, document } = fixture()
    const snapshot = store.capture('selection')
    expect(snapshot.markdown).toBe('same')
    store.apply(snapshot, '다른 글')
    expect(document.markdown).toBe('same\n\n다른 글\n')
    store.undo()
    expect(document.markdown).toBe(snapshot.documentMarkdown)
    expect(adapter.undo).toHaveBeenCalledOnce()
    expect(() => store.undo()).toThrow('편집 상태가 변경')
  })

  it('refuses a response after edits even when undo restores the same text', () => {
    const { store, adapter, document } = fixture()
    const snapshot = store.capture('document')
    document.revision += 2
    expect(() => store.apply(snapshot, 'changed')).toThrow('수정안을 다시 요청')
    expect(adapter.replace).not.toHaveBeenCalled()
  })

  it('refuses another document and a remounted editor with identical content', () => {
    const { store, adapter, document, unregister } = fixture()
    const snapshot = store.capture('document')
    document.documentId = 'two'
    expect(() => store.apply(snapshot, 'changed')).toThrow('수정안을 다시 요청')
    document.documentId = 'one'
    unregister()
    store.registerAdapter('source', adapter)
    expect(() => store.apply(snapshot, 'changed')).toThrow('수정안을 다시 요청')
    expect(adapter.replace).not.toHaveBeenCalled()
  })

  it('keeps intervening manual edits outside the AI undo button', () => {
    const { store, adapter, document } = fixture()
    store.apply(store.capture('document'), 'AI result')
    document.markdown += ' typed'
    document.revision++
    expect(() => store.undo()).toThrow('⌘Z')
    expect(adapter.undo).not.toHaveBeenCalled()
  })

  it('guards against mutated or empty selection ranges', () => {
    const { store, adapter } = fixture()
    const snapshot = store.capture('selection')
    snapshot.range.start = 0
    expect(() => store.apply(snapshot, 'changed')).toThrow('선택 범위가 변경')
    adapter.readSelection = () => ({ range: { start: 0, end: 0 } })
    expect(() => store.capture('selection')).toThrow('먼저 선택')
    expect(adapter.replace).not.toHaveBeenCalled()
  })
})

describe('AI Markdown selection positions', () => {
  it('handles backward multiline selections and UTF-16 emoji positions', () => {
    const markdown = '앞😀뒤\nsecond'
    const range = rangeFromPositions(markdown, { line: 1, ch: 3 }, { line: 0, ch: 1 })
    expect(markdown.slice(range.start, range.end)).toBe('😀뒤\nsec')
    expect(() => rangeFromPositions(markdown, { line: 0, ch: 99 }, { line: 1, ch: 0 })).toThrow()
  })

  const state = [{ text: 'same' }, { text: 'same' }]
  const serialize = (blocks: typeof state) => blocks.map((block) => block.text).join('\n\n')

  it('uses block paths for repeated text while keeping the input tree intact', () => {
    const range = rangeFromStateSelection(
      state,
      {
        anchor: { path: [1, 'text'], offset: 4 },
        focus: { path: [1, 'text'], offset: 0 }
      },
      serialize(state),
      serialize
    )
    expect(range).toEqual({ start: 6, end: 10 })
    expect(state).toEqual([{ text: 'same' }, { text: 'same' }])
  })

  it('maps a selection across blocks without searching their text', () => {
    expect(
      rangeFromStateSelection(
        state,
        {
          anchor: { path: [0, 'text'], offset: 2 },
          focus: { path: [1, 'text'], offset: 2 }
        },
        serialize(state),
        serialize
      )
    ).toEqual({ start: 2, end: 8 })
  })

  it('rejects a serializer whose structure or padding changes around a marker', () => {
    expect(() =>
      rangeFromStateSelection(
        state,
        {
          anchor: { path: [1, 'text'], offset: 0 },
          focus: { path: [1, 'text'], offset: 4 }
        },
        serialize(state),
        (blocks) => `${serialize(blocks)} `
      )
    ).toThrow('소스 모드')
  })
})
