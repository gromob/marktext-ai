// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { contextSettings, fitConversation } from '../../../src/shared/aiContext'
import { buildQuestionMessages, validateRequest } from '../../../src/main/ai/rewrite'

const request = { requestId: 'context', mode: 'ask' as const, model: 'test-model', instruction: '질문', markdown: '한글 문서' }
const model = { id: 'test-model', name: 'Test', contextWindow: 131072, outputTokens: 8192 }

describe('question context budgeting', () => {
  it('keeps more than ten messages within the model budget and preserves a reusable prefix', () => {
    const prefix = buildQuestionMessages(request, 'local')
    const history = Array.from({ length: 30 }, (_, index) => ({ role: index % 2 ? 'assistant' as const : 'user' as const, content: `대화 ${index}` }))
    const result = fitConversation(prefix, history, request.instruction, model)
    expect(result.retainedMessages).toBe(30)
    expect(result.droppedMessages).toBe(0)
    expect(result.messages.slice(0, prefix.length)).toEqual(prefix)
    const next = fitConversation(buildQuestionMessages({ ...request, instruction: '다음 질문', history }, 'local'), history, '다음 질문', model)
    expect(next.messages.slice(0, -1)).toEqual(result.messages.slice(0, -1))
    expect(result.messages.at(-1)?.content).toBe('질문')
    expect(prefix.map(message => message.content).join('')).not.toContain('다음 질문')
  })

  it('drops whole older messages, preserves the document and current question, and avoids a leading assistant', () => {
    const history = Array.from({ length: 40 }, (_, index) => ({ role: index % 2 ? 'assistant' as const : 'user' as const, content: `메시지 ${index} ` + '가'.repeat(100) }))
    const prefix = [{ role: 'system', content: 'fixed' }, { role: 'user', content: 'document' }]
    const result = fitConversation(prefix, history, 'latest', { ...model, contextWindow: 4096, outputTokens: 1024 })
    expect(result.droppedMessages).toBeGreaterThan(0)
    expect(result.messages.slice(0, 2)).toEqual(prefix)
    expect(result.messages[2].role).toBe('user')
    expect(result.messages.at(-1)?.content).toBe('latest')
    expect(result.messages.some(message => message.content === history[0].content)).toBe(false)
    expect(history).toHaveLength(40)
    expect(fitConversation(prefix, [{ role: 'assistant', content: 'one' }, { role: 'assistant', content: 'two' }], 'latest', model).retainedMessages).toBe(0)
  })

  it('refuses an oversized document instead of silently truncating it', () => {
    expect(() => fitConversation([{ role: 'user', content: '가'.repeat(10_000) }], [], '질문', { ...model, contextWindow: 4096, outputTokens: 1024 })).toThrow('문맥 예산')
    expect(contextSettings()).toMatchObject({ contextWindow: 8192, timeoutSeconds: 600 })
  })

  it('allows longer question history but retains legacy editing limits and validates roles', () => {
    const history = Array.from({ length: 30 }, () => ({ role: 'user' as const, content: 'x'.repeat(1000) }))
    expect(() => validateRequest({ ...request, history })).not.toThrow()
    expect(() => validateRequest({ ...request, mode: 'edit', history })).toThrow('대화 기록')
    expect(() => validateRequest({ ...request, history: [{ role: 'system' as 'user', content: 'bad' }] })).toThrow('대화 기록')
  })
})
