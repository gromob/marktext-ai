export interface AiTextRange {
  start: number
  end: number
}

interface PathEndpoint {
  path: Array<string | number>
  offset: number
}

export interface AiPathSelection {
  anchor: PathEndpoint
  focus: PathEndpoint
}

const selectionError = () =>
  new Error(
    '선택 범위를 확인해 주세요. 복잡한 표나 수식은 소스 모드에서 선택하면 정확하게 편집할 수 있습니다.'
  )

/** UTF-16 offsets match CodeMirror and JavaScript slicing, including emoji. */
export const rangeFromPositions = (
  markdown: string,
  anchor: { line: number; ch: number },
  focus: { line: number; ch: number }
): AiTextRange => {
  const lines = markdown.split('\n')
  const offset = ({ line, ch }: { line: number; ch: number }) => {
    if (
      !Number.isInteger(line) ||
      !Number.isInteger(ch) ||
      line < 0 ||
      line >= lines.length ||
      ch < 0 ||
      ch > lines[line].length
    ) {
      throw selectionError()
    }
    return lines.slice(0, line).reduce((sum, text) => sum + text.length + 1, 0) + ch
  }
  const first = offset(anchor)
  const last = offset(focus)
  return { start: Math.min(first, last), end: Math.max(first, last) }
}

/**
 * Source positions are accepted only when marker removal reproduces the exact
 * original serialization. Some table serializers change padding around markers;
 * rejecting those mappings keeps AI edits from touching an adjacent cell.
 */
export const rangeFromStateSelection = <T>(
  state: T[],
  selection: AiPathSelection,
  markdown: string,
  serialize: (state: T[]) => string
): AiTextRange => {
  const cloned = structuredClone(state)
  const token = crypto.randomUUID().replaceAll('-', '')
  const anchorMarker = `AIanchor${token}marker`
  const focusMarker = `AIfocus${token}marker`
  const endpoints = [
    { ...selection.anchor, marker: anchorMarker },
    { ...selection.focus, marker: focusMarker }
  ].sort((a, b) => b.offset - a.offset)

  for (const { path, offset, marker } of endpoints) {
    let node: unknown = cloned
    for (const key of path.slice(0, -1)) {
      if (node == null || typeof node !== 'object') throw selectionError()
      node = (node as Record<string | number, unknown>)[key]
    }
    const key = path.at(-1)
    if (key == null || node == null || typeof node !== 'object') throw selectionError()
    const record = node as Record<string | number, unknown>
    const text = record[key]
    if (typeof text !== 'string' || !Number.isInteger(offset) || offset < 0 || offset > text.length)
      throw selectionError()
    record[key] = text.slice(0, offset) + marker + text.slice(offset)
  }

  const marked = serialize(cloned)
  const anchorIndex = marked.indexOf(anchorMarker)
  const focusIndex = marked.indexOf(focusMarker)
  if (
    anchorIndex < 0 ||
    focusIndex < 0 ||
    marked.replace(anchorMarker, '').replace(focusMarker, '') !== markdown
  ) {
    throw selectionError()
  }
  const anchor = anchorIndex - (focusIndex < anchorIndex ? focusMarker.length : 0)
  const focus = focusIndex - (anchorIndex < focusIndex ? anchorMarker.length : 0)
  return { start: Math.min(anchor, focus), end: Math.max(anchor, focus) }
}
