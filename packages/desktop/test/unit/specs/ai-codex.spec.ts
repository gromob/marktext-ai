// @vitest-environment node
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { access, readFile, writeFile } from 'node:fs/promises'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CodexRewriter } from '../../../src/main/ai/codex'
import type { AiConversationMessage } from '../../../src/shared/types/ai'

const mocks = vi.hoisted(() => ({ spawn: vi.fn(), resolveCommand: vi.fn() }))
vi.mock('node:child_process', () => ({ spawn: mocks.spawn }))
vi.mock('../../../src/main/utils/resolveCommand', () => ({ resolveCommand: mocks.resolveCommand }))

interface FakeProcess extends EventEmitter {
  stdin: PassThrough
  stdout: PassThrough
  stderr: PassThrough
  kill: ReturnType<typeof vi.fn>
}

interface Invocation {
  child: FakeProcess
  args: string[]
  cwd: string
  input: string
}

let calls: Invocation[]
let handleInvocation: (invocation: Invocation) => void | Promise<void>

const request = {
  requestId: 'request-1',
  instruction: '문장을 다듬어 주세요.',
  markdown: '# 제목\n\n테스트 문장.'
}

beforeEach(() => {
  calls = []
  mocks.resolveCommand.mockResolvedValue('/example/codex')
  handleInvocation = async({ child, args }) => {
    const resultPath = args[args.indexOf('--output-last-message') + 1]
    await writeFile(resultPath, JSON.stringify({ markdown: '# 제목\n\n다듬은 문장.' }))
    child.emit('close', 0)
  }
  mocks.spawn.mockImplementation((_command, args: string[], options: { cwd: string }) => {
    const child = Object.assign(new EventEmitter(), {
      stdin: new PassThrough(),
      stdout: new PassThrough(),
      stderr: new PassThrough(),
      kill: vi.fn()
    }) as FakeProcess
    child.kill.mockImplementation(() => {
      queueMicrotask(() => child.emit('close', null))
      return true
    })
    const call = { child, args, cwd: options.cwd, input: '' }
    child.stdin.on('data', (data: Buffer) => { call.input += data.toString('utf8') })
    child.stdin.on('finish', () => { void handleInvocation(call) })
    calls.push(call)
    return child
  })
})

afterEach(() => vi.clearAllMocks())

describe('Codex Markdown rewriting', () => {
  it('uses stdin, constrained execution, and removes its temporary result', async() => {
    const result = await new CodexRewriter().rewrite(1, request)
    expect(result).toEqual({ markdown: '# 제목\n\n다듬은 문장.' })
    expect(calls[0].input).toContain(JSON.stringify({ instruction: request.instruction, markdown: request.markdown }))
    expect(calls[0].args).not.toContain(request.markdown)
    expect(calls[0].args).not.toContain('--model')
    expect(calls[0].args).toEqual(expect.arrayContaining([
      '--sandbox', 'read-only', '--ignore-user-config', '--ignore-rules',
      '--ephemeral', '--output-schema', 'shell_tool', 'apps', 'plugins', 'web_search="disabled"'
    ]))
    expect(mocks.spawn).toHaveBeenCalledWith('/example/codex', expect.any(Array), expect.objectContaining({ shell: false }))
    await expect(access(calls[0].cwd)).rejects.toThrow()
  })

  it('requires a structured Markdown result and cleans up failed responses', async() => {
    handleInvocation = async({ child, args }) => {
      await writeFile(args[args.indexOf('--output-last-message') + 1], '{"message":"wrong shape"}')
      child.emit('close', 0)
    }
    await expect(new CodexRewriter().rewrite(1, request)).rejects.toThrow('AI 응답 형식')
    await expect(access(calls[0].cwd)).rejects.toThrow()
  })

  it('validates renderer input before spawning a process', async() => {
    const service = new CodexRewriter()
    await expect(service.rewrite(1, { ...request, requestId: '../bad' })).rejects.toThrow('요청 형식')
    await expect(service.rewrite(1, { ...request, instruction: ' ' })).rejects.toThrow('요청 형식')
    await expect(service.rewrite(1, { ...request, markdown: 'x'.repeat(300_001) })).rejects.toThrow('요청 형식')
    expect(mocks.spawn).not.toHaveBeenCalled()
  })

  it('passes the selected model as one CLI argument and validates identifiers', async() => {
    const service = new CodexRewriter()
    await service.rewrite(1, { ...request, model: 'catalog-model-v2' })
    const modelIndex = calls[0].args.indexOf('--model')
    expect(calls[0].args[modelIndex + 1]).toBe('catalog-model-v2')
    mocks.spawn.mockClear()
    for (const model of ['', '--dangerous', 'model\n--flag', 'x'.repeat(129)]) {
      await expect(service.rewrite(1, { ...request, model })).rejects.toThrow('모델을 목록')
    }
    expect(mocks.spawn).not.toHaveBeenCalled()
  })

  it('forwards bounded conversation context with the current document and returns the edit summary', async() => {
    const history: AiConversationMessage[] = [
      { role: 'user', content: '제목을 짧게 해 주세요.' },
      { role: 'assistant', content: '제목을 세 단어로 줄였습니다.' }
    ]
    handleInvocation = async({ child, args }) => {
      const schema = JSON.parse(await readFile(args[args.indexOf('--output-schema') + 1], 'utf8'))
      expect(schema.required).toEqual(['markdown', 'summary'])
      await writeFile(args[args.indexOf('--output-last-message') + 1], JSON.stringify({
        markdown: '# 제목\n\n다듬은 문장.', summary: '본문을 자연스러운 문장으로 다듬었습니다.'
      }))
      child.emit('close', 0)
    }
    const result = await new CodexRewriter().rewrite(1, { ...request, history })
    expect(JSON.parse(calls[0].input.split('\n').at(-1) ?? '')).toEqual({
      instruction: request.instruction, markdown: request.markdown, history
    })
    expect(result.summary).toBe('본문을 자연스러운 문장으로 다듬었습니다.')
  })

  it('enforces conversation message count, roles, text types, and character budgets before spawning', async() => {
    const service = new CodexRewriter()
    const invalidHistories: unknown[] = [
      null,
      {},
      Array.from({ length: 11 }, () => ({ role: 'user', content: 'text' })),
      [{ role: 'system', content: 'instructions' }],
      [{ role: 'assistant', content: 3 }],
      [null],
      [{ role: 'user', content: 'x'.repeat(8_001) }],
      Array.from({ length: 4 }, () => ({ role: 'user', content: 'x'.repeat(6_001) }))
    ]
    for (const history of invalidHistories) {
      await expect(service.rewrite(1, { ...request, history: history as AiConversationMessage[] })).rejects.toThrow('대화 기록')
    }
    expect(mocks.spawn).not.toHaveBeenCalled()
    await expect(service.rewrite(1, {
      ...request,
      history: Array.from({ length: 3 }, () => ({ role: 'user', content: 'x'.repeat(8_000) }))
    })).resolves.toEqual({ markdown: '# 제목\n\n다듬은 문장.' })
  })

  it('validates summary output while retaining compatibility with Markdown-only responses', async() => {
    const service = new CodexRewriter()
    for (const summary of [null, 5, {}, 'x'.repeat(2_001)]) {
      handleInvocation = async({ child, args }) => {
        await writeFile(args[args.indexOf('--output-last-message') + 1], JSON.stringify({ markdown: 'result', summary }))
        child.emit('close', 0)
      }
      await expect(service.rewrite(1, request)).rejects.toThrow('AI 응답 형식')
    }
    handleInvocation = async({ child, args }) => {
      await writeFile(args[args.indexOf('--output-last-message') + 1], JSON.stringify({ markdown: 'result' }))
      child.emit('close', 0)
    }
    await expect(service.rewrite(1, request)).resolves.toEqual({ markdown: 'result' })
  })

  it('isolates cancellation by window and request and permits the next request', async() => {
    handleInvocation = () => {}
    const service = new CodexRewriter()
    const running = service.rewrite(1, request)
    const cancelled = expect(running).rejects.toThrow('취소')
    await vi.waitFor(() => expect(calls).toHaveLength(1))
    service.cancel(2, request.requestId)
    service.cancel(1, 'stale-request')
    expect(calls[0].child.kill).not.toHaveBeenCalled()
    await expect(service.rewrite(1, { ...request, requestId: 'request-2' })).rejects.toThrow('현재 AI 요청')
    service.cancel(1, request.requestId)
    await cancelled
    expect(calls[0].child.kill).toHaveBeenCalledWith('SIGTERM')
    await expect(access(calls[0].cwd)).rejects.toThrow()
    handleInvocation = ({ child }) => { child.emit('close', 1) }
    await expect(service.rewrite(1, request)).rejects.toThrow('Codex 연결')
  })

  it('honors cancellation during executable discovery', async() => {
    let resolveLookup: (command: string) => void = () => {}
    mocks.resolveCommand.mockReturnValue(new Promise<string>((resolve) => { resolveLookup = resolve }))
    const service = new CodexRewriter()
    const running = service.rewrite(1, request)
    const cancelled = expect(running).rejects.toThrow('취소')
    service.cancel(1, request.requestId)
    resolveLookup('/example/codex')
    await cancelled
    expect(mocks.spawn).not.toHaveBeenCalled()
  })

  it('terminates stalled subprocesses after the timeout', async() => {
    handleInvocation = () => {}
    await expect(new CodexRewriter(25).rewrite(1, request)).rejects.toThrow('대기 시간')
    expect(calls[0].child.kill).toHaveBeenCalledWith('SIGTERM')
    await expect(access(calls[0].cwd)).rejects.toThrow()
  })

  it('caps subprocess output and hides raw diagnostics', async() => {
    handleInvocation = ({ child }) => {
      child.stderr.write(Buffer.alloc(2_000_001, 'x'))
    }
    await expect(new CodexRewriter().rewrite(1, request)).rejects.toThrow('응답 크기')
    handleInvocation = ({ child }) => {
      child.stderr.write('private source text in error')
      child.emit('close', 1)
    }
    await expect(new CodexRewriter().rewrite(1, request)).rejects.toThrow('Codex 연결')
  })

  it('stops every running request on disposal', async() => {
    handleInvocation = () => {}
    const service = new CodexRewriter()
    const first = expect(service.rewrite(1, request)).rejects.toThrow('취소')
    const second = expect(service.rewrite(2, request)).rejects.toThrow('취소')
    await vi.waitFor(() => expect(calls).toHaveLength(2))
    service.dispose()
    await Promise.all([first, second])
  })

  it('checks existing CLI login without exposing authentication output', async() => {
    handleInvocation = ({ child, args }) => {
      if (args.includes('--version')) child.stdout.write('codex-cli 0.159.2\n')
      else child.stderr.write('Logged in using ChatGPT\n')
      child.emit('close', 0)
    }
    await expect(new CodexRewriter().status()).resolves.toEqual({
      available: true,
      loggedIn: true,
      version: 'codex-cli 0.159.2'
    })
  })
})
