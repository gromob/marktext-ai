import type { AiModel, AiProvider, AiRewriteRequest, AiRewriteResult, AiStatus } from '@shared/types/ai'
import { LocalHttpError, requestLocalHttp } from './localHttp'
import { contextSettings, fitConversation, validContextWindow } from '@shared/aiContext'
import { buildRewritePrompt, buildQuestionMessages, validateRequest } from './rewrite'
import { isModelId } from './codexModels'

const CANCELLED = 'AI 요청을 취소했습니다.'
const CONNECTION_ERROR = '로컬 AI 서버에 연결할 수 없습니다. 서버 주소와 실행 상태를 확인하세요.'
const TIMED_OUT = '로컬 AI 응답 대기 시간이 지났습니다. 서버의 생성 진행 상태와 처리 속도를 확인한 뒤 다시 시도하세요.'
const RESPONSE_ERROR = '로컬 AI 응답 형식이 올바르지 않아 문서를 변경하지 않았습니다.'
const MAX_BYTES = 2_000_000
type Connection = { baseUrl: string; apiKey: string; models?: AiModel[] }
const record = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null

export class LocalRewriter {
  private pending = new Map<number, { requestId: string; controller: AbortController }>()
  private knownModels = new Map<string, AiModel>()
  private discovery = new Set<AbortController>()

  constructor(private connection: () => Connection, private timeoutMs = 600_000, private provider: Exclude<AiProvider, 'codex'> = 'local') {}

  private async request(path: string, controller: AbortController, body?: unknown, timeout = this.timeoutMs): Promise<unknown> {
    let timedOut = false
    const timer = setTimeout(() => { timedOut = true; controller.abort() }, timeout)
    try {
      const { baseUrl, apiKey } = this.connection()
      const response = await requestLocalHttp(`${baseUrl}/${path}`, {
        method: body === undefined ? 'GET' : 'POST',
        headers: { 'Content-Type': 'application/json', ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: controller.signal
      })
      if (!response.ok) {
        await response.body?.cancel()
        if (response.status === 401 || response.status === 403) throw new Error('로컬 AI 인증에 실패했습니다. API 키를 확인하세요.')
        if (response.status === 429) throw new Error('로컬 AI 서버가 혼잡합니다. 잠시 후 다시 요청하세요.')
        throw new Error(`로컬 AI 요청이 실패했습니다 (HTTP ${response.status}). 서버의 OpenAI 호환 API와 모델을 확인하세요.`)
      }
      const reader = response.body?.getReader()
      if (!reader) throw new Error(RESPONSE_ERROR)
      const chunks: Uint8Array[] = []
      let size = 0
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          size += value.byteLength
          if (size > MAX_BYTES) {
            await reader.cancel()
            throw new Error('로컬 AI 응답 크기가 제한을 초과했습니다.')
          }
          chunks.push(value)
        }
      } finally { reader.releaseLock() }
      try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch { throw new Error(RESPONSE_ERROR) }
    } catch (cause) {
      if (timedOut) throw new Error(TIMED_OUT, { cause })
      if (controller.signal.aborted) throw new Error(CANCELLED, { cause })
      if (cause instanceof LocalHttpError && ['ECONNABORTED', 'ETIMEDOUT'].includes(cause.code || '')) throw new Error(TIMED_OUT, { cause })
      if (cause instanceof LocalHttpError || cause instanceof TypeError) throw new Error(CONNECTION_ERROR, { cause })
      throw cause
    } finally { clearTimeout(timer) }
  }

  async models(): Promise<AiModel[]> {
    const controller = new AbortController()
    this.discovery.add(controller)
    try {
      const response = record(await this.request('models', controller, undefined, 15_000))
      if (!response || !Array.isArray(response.data)) throw new Error(RESPONSE_ERROR)
      const models = new Map<string, AiModel>()
      for (const item of response.data) {
        const model = record(item)
        const reportedContext = record(model?.meta)?.n_ctx ?? model?.context_length ?? model?.max_model_len
        if (model && isModelId(model.id)) models.set(model.id, { id: model.id, ...(validContextWindow(reportedContext) ? { contextWindow: reportedContext } : {}), name: this.provider === 'splash' && model.id === 'mlx-community/Qwen3.8-27B-4bit' ? 'Qwen3.8-27B Splash' : model.id })
      }
      if (!models.size) throw new Error('로컬 AI 서버에서 제공 중인 모델이 없습니다. 서버의 모델 로딩 상태를 확인하세요.')
      this.knownModels = models
      return [...models.values()]
    } finally { this.discovery.delete(controller) }
  }

  async status(): Promise<AiStatus> {
    try {
      await this.models()
      return { available: true, loggedIn: true }
    } catch (cause) {
      return { available: false, loggedIn: false, error: cause instanceof Error ? cause.message : CONNECTION_ERROR }
    }
  }

  async rewrite(owner: number, request: AiRewriteRequest): Promise<AiRewriteResult> {
    validateRequest(request)
    if (!request.model) throw new Error('로컬 AI 모델을 선택하세요.')
    if (this.pending.has(owner) || this.pending.size >= 4) throw new Error('진행 중인 AI 요청이 완료된 후 다시 요청하세요.')
    const controller = new AbortController()
    this.pending.set(owner, { requestId: request.requestId, controller })
    try {
      const discovered = this.knownModels.get(request.model)
      const configured = this.connection().models?.find(model => model.id === request.model)
      const model = { ...discovered, ...configured, id: request.model, name: request.model }
      const limits = contextSettings(model)
      const conversation = request.mode === 'ask' ? fitConversation(buildQuestionMessages(request, this.provider), request.history || [], request.instruction, model) : null
      const response = record(await this.request('chat/completions', controller, {
        model: request.model, stream: false, temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: conversation?.messages ?? [{ role: 'user', content: buildRewritePrompt(request, this.provider) }],
        ...(conversation ? { max_tokens: limits.outputTokens } : {})
      }, configured?.timeoutSeconds ? configured.timeoutSeconds * 1000 : this.timeoutMs))
      const choices = response?.choices
      const choice = Array.isArray(choices) ? record(choices[0]) : null
      const message = record(choice?.message)
      if (choice?.finish_reason === 'length') throw new Error('모델이 출력·추론 예산에 도달해 응답을 끝내지 못했습니다. 서버·모델 관리에서 출력 예산을 늘리세요. 문서는 변경하지 않았습니다.')
      if (choice?.finish_reason !== 'stop' || typeof message?.content !== 'string') throw new Error(RESPONSE_ERROR)
      let content = message.content.trim()
      // Some compatible servers wrap otherwise valid JSON in a Markdown fence.
      if (content.startsWith('```')) content = content.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```$/, '').trim()
      let parsed: Record<string, unknown> | null
      try { parsed = record(JSON.parse(content)) } catch { throw new Error(RESPONSE_ERROR) }
      if (request.mode === 'ask') {
        if (!parsed || typeof parsed.summary !== 'string' || !parsed.summary.trim() || parsed.summary.length > 128_000) throw new Error(RESPONSE_ERROR)
        if (controller.signal.aborted) throw new Error(CANCELLED)
        return { markdown: request.markdown, summary: parsed.summary, ...(conversation ? { context: { retainedMessages: conversation.retainedMessages, droppedMessages: conversation.droppedMessages, contextWindow: limits.contextWindow, estimated: true } } : {}) }
      }
      if (!parsed || (parsed.markdown !== null && (typeof parsed.markdown !== 'string' || parsed.markdown.length > 300_000)) ||
        typeof parsed.summary !== 'string' || parsed.summary.length > 2_000) throw new Error(RESPONSE_ERROR)
      if (controller.signal.aborted) throw new Error(CANCELLED)
      return { markdown: parsed.markdown === null ? request.markdown : parsed.markdown as string, summary: parsed.summary }
    } finally { this.pending.delete(owner) }
  }

  cancel(owner: number, requestId?: string): void {
    const pending = this.pending.get(owner)
    if (pending && (requestId === undefined || pending.requestId === requestId)) pending.controller.abort()
  }

  dispose(): void {
    for (const controller of this.discovery) controller.abort()
    for (const owner of this.pending.keys()) this.cancel(owner)
  }
}
