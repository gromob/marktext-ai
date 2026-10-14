import { spawn } from 'node:child_process'
import { tmpdir } from 'node:os'
import type { AiModel } from '@shared/types/ai'
import { terminateCodexProcess } from './codexProcess'

const MODEL_ERROR = 'Codex 모델 목록을 가져올 수 없습니다. 연결을 확인하거나 기본 모델로 요청하세요.'
const MAX_OUTPUT_BYTES = 2_000_000

export const isModelId = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,127}$/.test(value)

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null

function readPage(value: unknown): { models: AiModel[]; nextCursor: string | null } {
  const page = asRecord(value)
  if (!page || !Array.isArray(page.data)) throw new Error(MODEL_ERROR)
  const models: AiModel[] = []
  for (const item of page.data) {
    const entry = asRecord(item)
    if (!entry || entry.hidden === true || !isModelId(entry.model)) continue
    if (Array.isArray(entry.inputModalities) && !entry.inputModalities.includes('text')) continue
    models.push({
      // `model` is the CLI argument; the catalog's `id` identifies its entry.
      id: entry.model,
      name: typeof entry.displayName === 'string' ? entry.displayName.slice(0, 160) : entry.model,
      ...(typeof entry.description === 'string' ? { description: entry.description.slice(0, 1_000) } : {}),
      isDefault: entry.isDefault === true
    })
  }
  if (page.nextCursor != null && (typeof page.nextCursor !== 'string' || page.nextCursor.length > 4_000)) {
    throw new Error(MODEL_ERROR)
  }
  return { models, nextCursor: typeof page.nextCursor === 'string' ? page.nextCursor : null }
}

/** Discovery reads the account catalog without creating a conversation or turn. */
export function readCodexModels(command: string, signal: AbortSignal, timeoutMs = 20_000): Promise<AiModel[]> {
  if (signal.aborted) return Promise.reject(new Error(MODEL_ERROR))
  return new Promise((resolve, reject) => {
    const child = spawn(command, [
      'app-server', '--stdio', '--disable', 'hooks', '--disable', 'apps', '--disable', 'plugins',
      '--config', 'model_provider="openai"'
    ], {
      cwd: tmpdir(), shell: false, windowsHide: true,
      detached: process.platform !== 'win32', stdio: 'pipe'
    })
    let buffer = ''
    let outputBytes = 0
    let expectedId = 0
    let failure: Error | undefined
    let result: AiModel[] | undefined
    let stopping = false
    let killTimer: ReturnType<typeof setTimeout> | undefined
    const models = new Map<string, AiModel>()
    const cursors = new Set<string>()
    const stop = (error?: Error) => {
      if (stopping) return
      stopping = true
      failure = error
      child.stdin.end()
      terminateCodexProcess(child, 'SIGTERM')
      killTimer = setTimeout(() => terminateCodexProcess(child, 'SIGKILL'), 1_500)
      killTimer.unref()
    }
    const fail = () => stop(new Error(MODEL_ERROR))
    const timer = setTimeout(fail, timeoutMs)
    timer.unref()
    signal.addEventListener('abort', fail, { once: true })
    const send = (message: unknown) => child.stdin.write(`${JSON.stringify(message)}\n`)
    const requestPage = (cursor?: string) => {
      expectedId++
      send({ id: expectedId, method: 'model/list', params: { includeHidden: false, limit: 100, ...(cursor ? { cursor } : {}) } })
    }
    const receive = (line: string) => {
      const message = asRecord(JSON.parse(line))
      if (!message || message.id !== expectedId) return
      if (message.error) throw new Error(MODEL_ERROR)
      if (expectedId === 0) {
        if (!asRecord(message.result)) throw new Error(MODEL_ERROR)
        send({ method: 'initialized', params: {} })
        requestPage()
        return
      }
      const page = readPage(message.result)
      for (const model of page.models) models.set(model.id, model)
      if (page.nextCursor) {
        if (cursors.has(page.nextCursor) || cursors.size >= 10) throw new Error(MODEL_ERROR)
        cursors.add(page.nextCursor)
        requestPage(page.nextCursor)
      } else {
        if (models.size === 0) throw new Error(MODEL_ERROR)
        result = [...models.values()]
        stop()
      }
    }
    const count = (chunk: string) => {
      outputBytes += Buffer.byteLength(chunk, 'utf8')
      if (outputBytes > MAX_OUTPUT_BYTES) fail()
    }
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => {
      count(chunk)
      if (stopping) return
      buffer += chunk
      let newline: number
      try {
        while (!stopping && (newline = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, newline)
          buffer = buffer.slice(newline + 1)
          if (line.trim()) receive(line)
        }
      } catch {
        fail()
      }
    })
    child.stderr.setEncoding('utf8').on('data', count)
    child.on('error', fail)
    child.stdin.on('error', fail)
    child.on('close', () => {
      clearTimeout(timer)
      if (killTimer) clearTimeout(killTimer)
      signal.removeEventListener('abort', fail)
      if (failure || !result) reject(failure ?? new Error(MODEL_ERROR))
      else resolve(result)
    })
    send({ id: 0, method: 'initialize', params: { clientInfo: { name: 'marktext_ai', version: '0.1.0' } } })
  })
}
