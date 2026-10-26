// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type * as LocalHttpModule from '../../../src/main/ai/localHttp'
import { LocalHttpError, requestLocalHttp } from '../../../src/main/ai/localHttp'
import { LocalRewriter } from '../../../src/main/ai/local'

vi.mock('../../../src/main/ai/localHttp', async(importOriginal) => ({
  ...await importOriginal<typeof LocalHttpModule>(),
  requestLocalHttp: vi.fn()
}))

const request = { requestId: 'one', model: 'qwen3.8-flash-next-iq3_xxs', instruction: '제목 수정', markdown: '# 원문\n', history: [{ role: 'user' as const, content: '문맥' }] }
const completion = (content = JSON.stringify({ markdown: '# 수정\n', summary: '제목 수정' }), finish = 'stop') =>
  Response.json({ choices: [{ finish_reason: finish, message: { content } }] })
let fetcher: ReturnType<typeof vi.fn>
let service: LocalRewriter

beforeEach(() => {
  fetcher = vi.mocked(requestLocalHttp)
  fetcher.mockReset()
  service = new LocalRewriter(() => ({ baseUrl: 'http://localhost:8081/v1', apiKey: 'test-secret' }), 100)
})
afterEach(() => { service.dispose() })

describe('local OpenAI-compatible transport', () => {
  it('uses the selected model, history and key only at the configured endpoint', async() => {
    fetcher.mockResolvedValue(completion())
    expect(await service.rewrite(1, request)).toEqual({ markdown: '# 수정\n', summary: '제목 수정' })
    const [url, options] = fetcher.mock.calls[0]
    expect(url).toBe('http://localhost:8081/v1/chat/completions')
    expect(options.headers.Authorization).toBe('Bearer test-secret')
    const body = JSON.parse(options.body)
    expect(body.model).toBe(request.model)
    expect(body.stream).toBe(false)
    const payload = JSON.parse(body.messages[0].content.split('\n').at(-1))
    expect(payload.connection).toEqual({ provider: 'local', model: request.model })
    expect(body.messages[0].content).toContain('문맥')
    expect(body.messages[0].content).toContain('원문')
    expect(body.messages[0].content).toContain('U+00A0')
  })

  it('routes Splash requests and model metadata independently', async() => {
    const splash = new LocalRewriter(() => ({ baseUrl: 'http://127.0.0.1:8007/v1', apiKey: 'local' }), 100, 'splash')
    const model = 'mlx-community/Qwen3.8-27B-4bit'
    fetcher.mockResolvedValueOnce(Response.json({ data: [{ id: model }] }))
    expect(await splash.models()).toEqual([{ id: model, name: 'Qwen3.8-27B Splash' }])
    fetcher.mockResolvedValueOnce(completion())
    await splash.rewrite(1, { ...request, model })
    const [url, options] = fetcher.mock.calls[1]
    expect(url).toBe('http://127.0.0.1:8007/v1/chat/completions')
    expect(options.headers.Authorization).toBe('Bearer local')
    const body = JSON.parse(options.body)
    expect(body.model).toBe(model)
    expect(JSON.parse(body.messages[0].content.split('\n').at(-1)).connection).toEqual({ provider: 'splash', model })
    splash.dispose()
  })

  it('returns conversational replies without changing the supplied document', async() => {
    fetcher.mockResolvedValue(completion(JSON.stringify({ markdown: request.markdown, summary: '저는 로컬 AI입니다.' })))
    expect(await service.rewrite(1, { ...request, instruction: '너는 누구야?' })).toEqual({
      markdown: request.markdown, summary: '저는 로컬 AI입니다.'
    })
  })

  it.each(['local', 'splash'] as const)('preserves a large document locally when %s answers without edits', async(provider) => {
    const local = new LocalRewriter(() => ({ baseUrl: 'http://localhost:8081/v1', apiKey: '' }), 100, provider)
    const markdown = '# 수학\n\n' + '본문과 공백을 그대로 보존합니다.\n'.repeat(5_000)
    fetcher.mockResolvedValue(completion(JSON.stringify({ markdown: null, summary: '문서에 대한 답변입니다.' })))
    try {
      expect(await local.rewrite(1, { ...request, markdown, instruction: '문서의 주제는 무엇인가요?' })).toEqual({
        markdown, summary: '문서에 대한 답변입니다.'
      })
      const prompt = JSON.parse(fetcher.mock.calls[0][1].body).messages[0].content
      expect(prompt).toContain('set markdown to null')
      expect(prompt).toContain('Do not copy or reproduce the document')
    } finally { local.dispose() }
  })

  it.each(['local', 'splash'] as const)('enforces question mode for %s even if the model returns edited text', async(provider) => {
    const local = new LocalRewriter(() => ({ baseUrl: 'http://localhost/v1', apiKey: '' }), 100, provider)
    try {
      fetcher.mockResolvedValueOnce(completion(JSON.stringify({ summary: '답변만 반환합니다.' })))
      expect(await local.rewrite(1, { ...request, mode: 'ask' })).toMatchObject({ markdown: request.markdown, summary: '답변만 반환합니다.' })
      fetcher.mockResolvedValueOnce(completion(JSON.stringify({ markdown: 'unwanted edit', summary: '본문은 보호됩니다.' })))
      expect((await local.rewrite(1, { ...request, mode: 'ask' })).markdown).toBe(request.markdown)
      expect(JSON.parse(fetcher.mock.calls[0][1].body).messages[0].content).toContain('Never edit the document')
      fetcher.mockResolvedValueOnce(completion())
      expect((await local.rewrite(1, { ...request, mode: 'edit' })).markdown).toBe('# 수정\n')
    } finally { local.dispose() }
  })

  it('reads actual context metadata, uses saved output budgets and applies per-model timeouts', async() => {
    const local = new LocalRewriter(() => ({ baseUrl: 'http://localhost/v1', apiKey: '', models: [{ id: request.model, name: 'Test', outputTokens: 2048, timeoutSeconds: 900 }] }))
    const timer = vi.spyOn(globalThis, 'setTimeout')
    try {
      fetcher.mockResolvedValueOnce(Response.json({ data: [{ id: request.model, meta: { n_ctx: 131072, n_ctx_train: 999999 } }] }))
      expect((await local.models())[0].contextWindow).toBe(131072)
      fetcher.mockResolvedValueOnce(completion(JSON.stringify({ summary: '답변' })))
      const history = Array.from({ length: 30 }, (_, index) => ({ role: index % 2 ? 'assistant' as const : 'user' as const, content: `message ${index}` }))
      const result = await local.rewrite(1, { ...request, mode: 'ask', history })
      expect(result.context).toMatchObject({ contextWindow: 131072, retainedMessages: 30, droppedMessages: 0 })
      const body = JSON.parse(fetcher.mock.calls[1][1].body)
      expect(body.max_tokens).toBe(2048)
      expect(body.messages).toHaveLength(33)
      expect(timer).toHaveBeenCalledWith(expect.any(Function), 900_000)
    } finally { timer.mockRestore(); local.dispose() }
  })

  it('discovers only valid IDs supplied by this server', async() => {
    fetcher.mockResolvedValue(Response.json({ data: [{ id: request.model }, { id: '../bad model' }, { id: request.model }] }))
    expect(await service.models()).toEqual([{ id: request.model, name: request.model }])
  })

  it.each([['not JSON', 'stop'], ['{"markdown":"lost"}', 'stop'], ['{"markdown":"partial","summary":"ok"}', 'length']])('rejects invalid or truncated output (%s)', async(content, finish) => {
    fetcher.mockResolvedValue(completion(content, finish))
    await expect(service.rewrite(1, request)).rejects.toThrow('문서')
  })

  it('does not retry or switch providers after an authentication failure', async() => {
    fetcher.mockResolvedValue(new Response('secret server body', { status: 401 }))
    await expect(service.rewrite(1, request)).rejects.toThrow('API 키')
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('rejects empty model catalogs and unavailable servers', async() => {
    fetcher.mockResolvedValueOnce(Response.json({ data: [] }))
    expect(await service.status()).toMatchObject({ available: false, loggedIn: false })
    fetcher.mockRejectedValueOnce(new TypeError('network failed'))
    expect(await service.status()).toMatchObject({ available: false, loggedIn: false })
  })

  it.each(['ETIMEDOUT', 'ECONNABORTED'])('reports transport timeout %s separately from connection failure', async(code) => {
    fetcher.mockRejectedValue(new LocalHttpError(code))
    await expect(service.rewrite(1, request)).rejects.toThrow('대기 시간')
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('requires an explicit model without sending a request', async() => {
    await expect(service.rewrite(1, { ...request, model: undefined })).rejects.toThrow('모델을 선택')
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('cancels only the matching owner/request and frees its slot', async() => {
    fetcher.mockImplementation((_url, options) => new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('aborted')))))
    const pending = service.rewrite(1, request)
    service.cancel(2, request.requestId)
    service.cancel(1, 'wrong')
    expect(fetcher.mock.calls[0][1].signal.aborted).toBe(false)
    service.cancel(1, request.requestId)
    await expect(pending).rejects.toThrow('취소')
    fetcher.mockResolvedValue(completion())
    await expect(service.rewrite(1, request)).resolves.toHaveProperty('markdown')
  })

  it('reports timeouts and rejects simultaneous requests from a window', async() => {
    fetcher.mockImplementation((_url, options) => new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('aborted')))))
    const pending = service.rewrite(1, request)
    await expect(service.rewrite(1, request)).rejects.toThrow('진행 중')
    await expect(pending).rejects.toThrow('대기 시간')
  })

  it('limits response bytes before parsing', async() => {
    fetcher.mockResolvedValue(new Response('x'.repeat(2_000_001)))
    await expect(service.rewrite(1, request)).rejects.toThrow('크기')
  })
})
