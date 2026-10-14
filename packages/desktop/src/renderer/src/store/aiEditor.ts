import { defineStore } from 'pinia'
import type { AiTextRange } from '@/util/aiSelection'

export type AiEditScope = 'selection' | 'document'
export type AiEditorMode = 'wysiwyg' | 'source'

export interface AiEditorDocument {
  documentId: string
  markdown: string
  revision: number
}

export interface AiEditSnapshot {
  documentId: string
  documentMarkdown: string
  markdown: string
  scope: AiEditScope
  editorMode: AiEditorMode
  adapterVersion: number
  revision: number
  range: AiTextRange
  selectionContext?: unknown
}

export interface AiEditorAdapter {
  isActive(): boolean
  readDocument(): AiEditorDocument
  readSelection(): { range: AiTextRange; context?: unknown }
  replace(snapshot: AiEditSnapshot, markdown: string): void
  undo(): void
}

export const useAiEditorStore = defineStore('aiEditor', () => {
  const adapters = new Map<AiEditorMode, AiEditorAdapter>()
  const adapterVersions = new Map<AiEditorMode, number>()
  let nextAdapterVersion = 0
  let lastApplied: (AiEditorDocument & { mode: AiEditorMode; adapterVersion: number }) | null = null

  const registerAdapter = (mode: AiEditorMode, adapter: AiEditorAdapter) => {
    adapters.set(mode, adapter)
    adapterVersions.set(mode, ++nextAdapterVersion)
    return () => {
      if (adapters.get(mode) === adapter) adapters.delete(mode)
    }
  }

  const activeEditor = (): [AiEditorMode, AiEditorAdapter] => {
    for (const entry of adapters) {
      if (entry[1].isActive()) return entry
    }
    throw new Error('편집할 문서를 열어 주세요.')
  }

  const capture = (scope: AiEditScope): AiEditSnapshot => {
    const [editorMode, adapter] = activeEditor()
    const document = adapter.readDocument()
    const selection =
      scope === 'selection'
        ? adapter.readSelection()
        : { range: { start: 0, end: document.markdown.length }, context: undefined }
    const { start, end } = selection.range
    if (
      start < 0 ||
      end > document.markdown.length ||
      start > end ||
      !Number.isInteger(start) ||
      !Number.isInteger(end)
    ) {
      throw new Error('선택 범위가 변경되었습니다. 편집할 부분을 다시 선택해 주세요.')
    }
    if (scope === 'selection' && start === end) {
      throw new Error('편집기에서 수정할 글을 먼저 선택해 주세요.')
    }
    return {
      documentId: document.documentId,
      documentMarkdown: document.markdown,
      markdown: document.markdown.slice(start, end),
      scope,
      editorMode,
      adapterVersion: adapterVersions.get(editorMode) ?? 0,
      revision: document.revision,
      range: { start, end },
      selectionContext: selection.context
    }
  }

  const apply = (snapshot: AiEditSnapshot, replacement: string) => {
    const [mode, adapter] = activeEditor()
    const current = adapter.readDocument()
    if (
      mode !== snapshot.editorMode ||
      adapterVersions.get(mode) !== snapshot.adapterVersion ||
      current.documentId !== snapshot.documentId ||
      current.markdown !== snapshot.documentMarkdown ||
      current.revision !== snapshot.revision
    ) {
      throw new Error(
        '문서 또는 편집 모드가 변경되었습니다. 현재 내용을 기준으로 수정안을 다시 요청해 주세요.'
      )
    }
    const { start, end } = snapshot.range
    if (
      start < 0 ||
      start > end ||
      end > current.markdown.length ||
      !Number.isInteger(start) ||
      !Number.isInteger(end) ||
      current.markdown.slice(start, end) !== snapshot.markdown
    ) {
      throw new Error('선택 범위가 변경되었습니다. 수정할 부분을 다시 선택해 주세요.')
    }
    const nextMarkdown =
      current.markdown.slice(0, start) + replacement + current.markdown.slice(end)
    if (nextMarkdown === current.markdown) throw new Error('수정 내용이 원문과 같습니다.')
    adapter.replace(snapshot, nextMarkdown)
    lastApplied = { ...adapter.readDocument(), mode, adapterVersion: adapterVersions.get(mode) ?? 0 }
  }

  /** Only the unchanged, most recent AI transaction belongs to this button. */
  const undo = () => {
    const [mode, adapter] = activeEditor()
    const current = adapter.readDocument()
    if (
      !lastApplied ||
      mode !== lastApplied.mode ||
      adapterVersions.get(mode) !== lastApplied.adapterVersion ||
      current.documentId !== lastApplied.documentId ||
      current.markdown !== lastApplied.markdown ||
      current.revision !== lastApplied.revision
    ) {
      throw new Error('적용 이후 편집 상태가 변경되었습니다. ⌘Z로 편집 기록을 확인해 주세요.')
    }
    lastApplied = null
    adapter.undo()
  }

  return { registerAdapter, capture, apply, undo }
})
