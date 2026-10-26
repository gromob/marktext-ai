// @vitest-environment node
import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LocalRewriter } from '../../../src/main/ai/local'
import { LocalHttpError, requestLocalHttp } from '../../../src/main/ai/localHttp'

const request = { requestId: 'http-test', model: 'test-model', mode: 'ask' as const, instruction: 'question', markdown: 'Original document.' }
const reply = (res: ServerResponse) => res.end(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ summary: 'answer' }) } }] }))
let handler: (req: IncomingMessage, res: ServerResponse) => void
let server: Server
let service: LocalRewriter
let baseUrl: string

beforeEach(async() => {
  server = createServer((req, res) => handler(req, res))
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Test server unavailable')
  baseUrl = `http://127.0.0.1:${address.port}/v1`
  service = new LocalRewriter(() => ({ baseUrl, apiKey: 'test-http-token' }), 2000)
})
afterEach(async() => {
  service.dispose()
  vi.unstubAllGlobals()
  server.closeAllConnections()
  await new Promise<void>(resolve => server.close(() => resolve()))
})

describe('real local AI HTTP transport', () => {
  it('waits for headers and body without using global fetch', async() => {
    const fetcher = vi.fn(() => { throw new Error('Unexpected fetch transport') })
    vi.stubGlobal('fetch', fetcher)
    handler = (req, res) => {
      expect(req.headers.authorization).toBe('Bearer test-http-token')
      req.resume()
      req.on('end', () => setTimeout(() => {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.flushHeaders()
        setTimeout(() => reply(res), 30)
      }, 30))
    }
    await expect(service.rewrite(1, request)).resolves.toMatchObject({ markdown: request.markdown, summary: 'answer' })
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('uses the app deadline while waiting for headers and frees the request slot', async() => {
    let stall = true
    handler = (_req, res) => { if (!stall) reply(res) }
    service = new LocalRewriter(() => ({ baseUrl, apiKey: '' }), 80)
    await expect(service.rewrite(1, request)).rejects.toThrow('대기 시간')
    stall = false
    await expect(service.rewrite(1, request)).resolves.toHaveProperty('summary', 'answer')
  })

  it('keeps the deadline active after headers arrive but the body stalls', async() => {
    handler = (_req, res) => { res.writeHead(200); res.flushHeaders(); res.write('{"choices":') }
    service = new LocalRewriter(() => ({ baseUrl, apiKey: '' }), 80)
    await expect(service.rewrite(1, request)).rejects.toThrow('대기 시간')
  })

  it.each(['headers', 'body'])('reports user cancellation separately during %s', async(phase) => {
    let arrived: () => void = () => undefined
    const ready = new Promise<void>(resolve => { arrived = resolve })
    handler = (_req, res) => {
      if (phase === 'body') { res.writeHead(200); res.flushHeaders(); res.write('{"choices":') }
      arrived()
    }
    const pending = service.rewrite(1, request)
    const rejected = expect(pending).rejects.toThrow('취소')
    await ready
    service.cancel(1, request.requestId)
    await rejected
  })

  it('never follows redirects with credentials or document text', async() => {
    let redirectedRequests = 0
    handler = (req, res) => {
      if (req.url === '/redirected') { redirectedRequests++; reply(res); return }
      res.writeHead(302, { Location: baseUrl.replace('/v1', '/redirected') }).end()
    }
    await expect(service.rewrite(1, request)).rejects.toThrow('HTTP 302')
    expect(redirectedRequests).toBe(0)
  })

  it('enforces the response byte limit on the real HTTP stream', async() => {
    handler = (_req, res) => res.end('x'.repeat(2_000_001))
    await expect(service.rewrite(1, request)).rejects.toThrow('크기')
  })

  it('classifies a refused socket as a connection failure', async() => {
    await new Promise<void>(resolve => server.close(() => resolve()))
    await expect(service.rewrite(1, request)).rejects.toThrow('서버에 연결할 수 없습니다')
    try {
      await requestLocalHttp(baseUrl, { method: 'GET', headers: { Authorization: 'Bearer test-http-token' }, signal: new AbortController().signal })
      throw new Error('Expected a transport failure')
    } catch (cause) {
      expect(cause).toBeInstanceOf(LocalHttpError)
      expect(JSON.stringify(cause)).not.toContain('test-http-token')
      expect(cause).not.toHaveProperty('config')
    }
  })

  it('handles bodyless HTTP statuses without constructing an invalid response', async() => {
    handler = (_req, res) => res.writeHead(204).end()
    const result = await requestLocalHttp(baseUrl + '/models', { method: 'GET', headers: {}, signal: new AbortController().signal })
    expect(result.status).toBe(204)
    expect(result.body).toBeNull()
  })
})
