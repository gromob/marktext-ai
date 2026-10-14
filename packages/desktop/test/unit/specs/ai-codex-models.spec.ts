// @vitest-environment node
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readCodexModels } from '../../../src/main/ai/codexModels'
import { CodexRewriter } from '../../../src/main/ai/codex'

const mocks = vi.hoisted(() => ({ spawn: vi.fn(), resolveCommand: vi.fn() }))
vi.mock('node:child_process', () => ({ spawn: mocks.spawn }))
vi.mock('../../../src/main/utils/resolveCommand', () => ({ resolveCommand: mocks.resolveCommand }))

interface RpcRequest {
  id?: number
  method: string
  params: Record<string, unknown>
}

interface FakeProcess extends EventEmitter {
  stdin: PassThrough
  stdout: PassThrough
  stderr: PassThrough
  kill: ReturnType<typeof vi.fn>
}

let child: FakeProcess
let requests: RpcRequest[]
let respond: (request: RpcRequest) => void
const reply = (id: number | undefined, result: unknown) => {
  child.stdout.write(`${JSON.stringify({ id, result })}\n`)
}
const model = { id: 'entry-id', model: 'catalog-model', displayName: '모델 이름', description: '설명', isDefault: true }

beforeEach(() => {
  requests = []
  mocks.resolveCommand.mockResolvedValue('/example/codex')
  respond = (request) => {
    if (request.method === 'initialize') reply(request.id, { userAgent: 'fake' })
    if (request.method === 'model/list') reply(request.id, { data: [model], nextCursor: null })
  }
  mocks.spawn.mockImplementation(() => {
    child = Object.assign(new EventEmitter(), {
      stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(), kill: vi.fn()
    }) as FakeProcess
    child.kill.mockImplementation(() => {
      queueMicrotask(() => child.emit('close', null))
      return true
    })
    child.stdin.on('data', (chunk: Buffer) => {
      for (const line of chunk.toString('utf8').split('\n').filter(Boolean)) {
        const request = JSON.parse(line) as RpcRequest
        requests.push(request)
        queueMicrotask(() => respond(request))
      }
    })
    return child
  })
})

afterEach(() => vi.clearAllMocks())

describe('Codex account model discovery', () => {
  it('initializes the protocol, follows pages, filters entries, and terminates the server', async() => {
    respond = (request) => {
      if (request.method === 'initialize') reply(request.id, { userAgent: 'fake' })
      if (request.method === 'model/list') {
        if (request.params.cursor) {
          reply(request.id, { data: [{ ...model, model: 'another-model', isDefault: false }], nextCursor: null })
        } else {
          reply(request.id, { data: [model, { ...model, model: 'hidden', hidden: true }, { ...model, model: 'audio', inputModalities: ['audio'] }, { ...model, model: '--bad' }], nextCursor: 'page-2' })
        }
      }
    }
    const result = await readCodexModels('/example/codex', new AbortController().signal)
    expect(result).toEqual([
      { id: 'catalog-model', name: '모델 이름', description: '설명', isDefault: true },
      { id: 'another-model', name: '모델 이름', description: '설명', isDefault: false }
    ])
    expect(requests.map((request) => request.method)).toEqual(['initialize', 'initialized', 'model/list', 'model/list'])
    expect(requests[3].params.cursor).toBe('page-2')
    expect(child.kill).toHaveBeenCalledWith('SIGTERM')
    expect(mocks.spawn).toHaveBeenCalledWith('/example/codex', expect.arrayContaining(['app-server', '--stdio']), expect.objectContaining({ shell: false }))
  })

  it('shares concurrent discovery and fetches again on a later refresh', async() => {
    const service = new CodexRewriter()
    const first = service.models()
    const second = service.models()
    expect(first).toBe(second)
    await Promise.all([first, second])
    expect(mocks.spawn).toHaveBeenCalledTimes(1)
    await service.models()
    expect(mocks.spawn).toHaveBeenCalledTimes(2)
  })

  it('rejects malformed pages and hides raw RPC errors', async() => {
    respond = (request) => {
      if (request.method === 'initialize') reply(request.id, {})
      if (request.method === 'model/list') reply(request.id, { data: 'wrong shape' })
    }
    await expect(readCodexModels('/example/codex', new AbortController().signal)).rejects.toThrow('모델 목록')
    respond = (request) => {
      child.stdout.write(`${JSON.stringify({ id: request.id, error: { message: 'private account diagnostics' } })}\n`)
    }
    await expect(readCodexModels('/example/codex', new AbortController().signal)).rejects.toThrow('모델 목록을 가져올 수 없습니다.')
  })

  it('bounds pagination and subprocess output', async() => {
    respond = (request) => {
      if (request.method === 'initialize') reply(request.id, {})
      if (request.method === 'model/list') reply(request.id, { data: [model], nextCursor: 'repeated' })
    }
    await expect(readCodexModels('/example/codex', new AbortController().signal)).rejects.toThrow('모델 목록')
    respond = () => { child.stdout.write('x'.repeat(2_000_001)) }
    await expect(readCodexModels('/example/codex', new AbortController().signal)).rejects.toThrow('모델 목록')
  })

  it('terminates a stalled discovery on timeout or application disposal', async() => {
    respond = () => {}
    await expect(readCodexModels('/example/codex', new AbortController().signal, 10)).rejects.toThrow('모델 목록')
    expect(child.kill).toHaveBeenCalledWith('SIGTERM')
    const service = new CodexRewriter()
    const pending = expect(service.models()).rejects.toThrow('모델 목록')
    await vi.waitFor(() => expect(mocks.spawn).toHaveBeenCalledTimes(2))
    service.dispose()
    await pending
    expect(child.kill).toHaveBeenCalledWith('SIGTERM')
  })
})
