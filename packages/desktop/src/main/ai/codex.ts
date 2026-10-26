import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { resolveCommand } from '../utils/resolveCommand'
import { readCodexModels } from './codexModels'
import { terminateCodexProcess } from './codexProcess'
import { fitConversation } from '@shared/aiContext'
import { buildRewritePrompt, buildQuestionMessages, validateRequest } from './rewrite'
import type { AiModel, AiRewriteRequest, AiRewriteResult, AiStatus } from '@shared/types/ai'

const MAX_OUTPUT_BYTES = 2_000_000
const CANCELLED = 'AI 요청을 취소했습니다.'
const TIMED_OUT = 'AI 응답 대기 시간이 지났습니다. 범위를 줄여 다시 요청하세요.'
const CONNECTION_ERROR = 'Codex 연결을 확인하세요. 터미널에서 codex login과 네트워크 상태를 확인할 수 있습니다.'

const outputSchema = {
  type: 'object',
  properties: { markdown: { type: 'string' }, summary: { type: 'string' } },
  required: ['markdown', 'summary'],
  additionalProperties: false
}

interface ProcessResult {
  code: number | null
  stdout: string
  stderr: string
}

interface PendingRequest {
  requestId: string
  controller: AbortController
}

function runProcess(
  command: string,
  args: string[],
  cwd: string,
  timeoutMs: number,
  signal?: AbortSignal,
  input?: string
): Promise<ProcessResult> {
  if (signal?.aborted) return Promise.reject(new Error(CANCELLED))
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      shell: false,
      windowsHide: true,
      detached: process.platform !== 'win32',
      stdio: 'pipe'
    })
    let stdout = ''
    let stderr = ''
    let outputBytes = 0
    let failure: Error | undefined
    let killTimer: ReturnType<typeof setTimeout> | undefined
    const stop = (message: string) => {
      if (failure) return
      failure = new Error(message)
      terminateCodexProcess(child, 'SIGTERM')
      killTimer = setTimeout(() => terminateCodexProcess(child, 'SIGKILL'), 1_500)
      killTimer.unref()
    }
    const abort = () => stop(CANCELLED)
    const timer = setTimeout(() => stop(TIMED_OUT), timeoutMs)
    timer.unref()
    signal?.addEventListener('abort', abort, { once: true })
    const collect = (chunk: string, stream: 'stdout' | 'stderr') => {
      outputBytes += Buffer.byteLength(chunk, 'utf8')
      if (outputBytes > MAX_OUTPUT_BYTES) {
        stop('AI 응답 크기가 제한을 초과했습니다. 범위를 줄여 다시 요청하세요.')
        return
      }
      if (stream === 'stdout') stdout += chunk
      else stderr += chunk
    }
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => collect(chunk, 'stdout'))
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => collect(chunk, 'stderr'))
    child.on('error', () => { failure = new Error(CONNECTION_ERROR) })
    child.stdin.on('error', () => stop(CONNECTION_ERROR))
    child.on('close', (code) => {
      clearTimeout(timer)
      if (killTimer) clearTimeout(killTimer)
      signal?.removeEventListener('abort', abort)
      if (failure) reject(failure)
      else resolve({ code, stdout, stderr })
    })
    child.stdin.end(input)
  })
}

/** Each window owns one cancellable request; only the caller applies returned text. */
export class CodexRewriter {
  private pending = new Map<number, PendingRequest>()
  private modelRequest: Promise<AiModel[]> | null = null
  private modelController: AbortController | null = null

  constructor(private readonly timeoutMs = 180_000) {}

  models(): Promise<AiModel[]> {
    if (this.modelRequest) return this.modelRequest
    const controller = new AbortController()
    this.modelController = controller
    this.modelRequest = (async() => {
      const command = await resolveCommand('codex')
      if (!command) throw new Error('Codex CLI를 설치한 후 codex login을 실행하세요.')
      return readCodexModels(command, controller.signal)
    })().finally(() => {
      this.modelRequest = null
      this.modelController = null
    })
    return this.modelRequest
  }

  async status(): Promise<AiStatus> {
    const command = await resolveCommand('codex')
    if (!command) {
      return { available: false, loggedIn: false, error: 'Codex CLI를 설치한 후 codex login을 실행하세요.' }
    }
    try {
      const [version, login] = await Promise.all([
        runProcess(command, ['--version'], tmpdir(), 10_000),
        runProcess(command, ['login', 'status'], tmpdir(), 10_000)
      ])
      const loggedIn = login.code === 0 && /Logged in/i.test(login.stdout + login.stderr)
      return {
        available: version.code === 0,
        loggedIn,
        version: version.stdout.trim().slice(0, 120),
        ...(loggedIn ? {} : { error: '터미널에서 codex login을 실행해 로그인하세요.' })
      }
    } catch {
      return { available: true, loggedIn: false, error: CONNECTION_ERROR }
    }
  }

  async rewrite(owner: number, request: AiRewriteRequest): Promise<AiRewriteResult> {
    validateRequest(request)
    if (this.pending.has(owner)) throw new Error('현재 AI 요청이 완료된 후 다시 요청하세요.')
    if (this.pending.size >= 4) throw new Error('다른 창의 AI 요청이 완료된 후 다시 요청하세요.')
    const controller = new AbortController()
    this.pending.set(owner, { requestId: request.requestId, controller })
    let directory: string | undefined
    try {
      const command = await resolveCommand('codex')
      if (!command) throw new Error('Codex CLI를 설치한 후 codex login을 실행하세요.')
      directory = await mkdtemp(join(tmpdir(), 'marktext-ai-'))
      const schemaPath = join(directory, 'schema.json')
      const resultPath = join(directory, 'result.json')
      await writeFile(schemaPath, JSON.stringify(request.mode === 'ask' ? {
        type: 'object', properties: { summary: { type: 'string' } },
        required: ['summary'], additionalProperties: false
      } : outputSchema), { mode: 0o600 })
      const disabledFeatures = [
        'shell_tool', 'unified_exec', 'apps', 'plugins', 'browser_use',
        'computer_use', 'image_generation', 'multi_agent', 'view_image',
        'shell_snapshot', 'skill_search', 'hooks'
      ]
      const args = [
        'exec', '--sandbox', 'read-only', '--skip-git-repo-check', '--ephemeral',
        '--ignore-user-config', '--ignore-rules', '--json', '--color', 'never',
        '--config', 'web_search="disabled"', '--config', 'project_doc_max_bytes=0',
        '--config', 'history.persistence="none"',
        '--enable', 'skip_host_skill_discovery',
        ...disabledFeatures.flatMap((feature) => ['--disable', feature]),
        ...(request.model ? ['--model', request.model] : []),
        '--output-schema', schemaPath, '--output-last-message', resultPath, '-'
      ]
      // stdin keeps document text out of process listings and shell parsing.
      const conversation = request.mode === 'ask' ? fitConversation(buildQuestionMessages(request, 'codex'), request.history || [], request.instruction) : null
      const prompt = conversation ? conversation.messages.map(message => `[${message.role}]\n${message.content}`).join('\n\n') : buildRewritePrompt(request)
      const result = await runProcess(command, args, directory, this.timeoutMs, controller.signal, prompt)
      if (result.code !== 0) {
        if (/rate.limit|usage.limit|quota/i.test(result.stderr + result.stdout)) {
          throw new Error('Codex 사용 한도에 도달했습니다. 계정의 사용량과 초기화 시간을 확인하세요.')
        }
        throw new Error(CONNECTION_ERROR)
      }
      if (controller.signal.aborted) throw new Error(CANCELLED)
      const file = await stat(resultPath).catch(() => null)
      if (!file || file.size > MAX_OUTPUT_BYTES) throw new Error('AI 응답을 확인할 수 없습니다. 다시 요청하세요.')
      let parsed: unknown
      try {
        parsed = JSON.parse(await readFile(resultPath, 'utf8'))
      } catch {
        throw new Error('AI 응답 형식을 확인할 수 없습니다. 다시 요청하세요.')
      }
      if (request.mode === 'ask') {
        if (!parsed || typeof parsed !== 'object' || !('summary' in parsed) ||
          typeof parsed.summary !== 'string' || !parsed.summary.trim() || parsed.summary.length > 128_000) {
          throw new Error('AI 응답 형식을 확인할 수 없습니다. 다시 요청하세요.')
        }
        return { markdown: request.markdown, summary: parsed.summary, ...(conversation ? { context: { retainedMessages: conversation.retainedMessages, droppedMessages: conversation.droppedMessages, contextWindow: conversation.contextWindow, estimated: true } } : {}) }
      }
      if (!parsed || typeof parsed !== 'object' || !('markdown' in parsed) || typeof parsed.markdown !== 'string') {
        throw new Error('AI 응답 형식을 확인할 수 없습니다. 다시 요청하세요.')
      }
      const summary = 'summary' in parsed ? parsed.summary : undefined
      if (summary !== undefined && (typeof summary !== 'string' || summary.length > 2_000)) {
        throw new Error('AI 응답 형식을 확인할 수 없습니다. 다시 요청하세요.')
      }
      return { markdown: parsed.markdown, ...(typeof summary === 'string' ? { summary } : {}) }
    } finally {
      try {
        if (directory) await rm(directory, { recursive: true, force: true })
      } finally {
        this.pending.delete(owner)
      }
    }
  }

  cancel(owner: number, requestId?: string): void {
    const pending = this.pending.get(owner)
    if (pending && (requestId === undefined || pending.requestId === requestId)) pending.controller.abort()
  }

  dispose(): void {
    this.modelController?.abort()
    for (const owner of this.pending.keys()) this.cancel(owner)
  }
}
