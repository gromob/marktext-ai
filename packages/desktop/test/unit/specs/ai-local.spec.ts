// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LocalRewriter } from '../../../src/main/ai/local'

const request = { requestId: 'one', model: 'qwen3.8-flash-next-iq3_xxs', instruction: '제목 수정', markdown: '# 원문\n', history: [{ role: 'user' as const, content: '문맥' }] }
const completion = (content = JSON.stringify({ markdown: '# 수정\n', summary: '제목 수정' }), finish = 'stop') =>
  Response.json({ choices: [{ finish_reason: finish, message: { content } }] })
let fetcher: ReturnType<typeof vi.fn>
let service: LocalRewriter

beforeEach(() => {
  fetcher = vi.fn()
  vi.stubGlobal('fetch', fetcher)
  service = new LocalRewriter(() => ({ baseUrl: 'http://localhost:8081/v1', apiKey: 'test-secret' }), 100)
})
afterEach(() => { service.dispose(); vi.unstubAllGlobals() })

describe('local OpenAI-compatible transport', () => {
  it('uses the selected model, history and key only at the configured endpoint', async() => {
    fetcher.mockResolvedValue(completion())
    expect(await service.rewrite(1, request)).toEqual({ markdown: '# 수정\n', summary: '제목 수정' })
    const [url, options] = fetcher.mock.calls[0]
    expect(url).toBe('http://localhost:8081/v1/chat/completions')
    expect(options.headers.Authorization).toBe('Bearer test-secret')
    expect(options.redirect).toBe('error')
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
