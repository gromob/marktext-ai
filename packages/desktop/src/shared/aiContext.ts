import type { AiConversationMessage, AiModel } from './types/ai'

export const DEFAULT_CONTEXT_WINDOW = 8192
export const DEFAULT_TIMEOUT_SECONDS = 600
export const MAX_CONTEXT_WINDOW = 2_097_152
export const validContextWindow = (value: unknown): value is number => Number.isInteger(value) && Number(value) >= 2048 && Number(value) <= MAX_CONTEXT_WINDOW
export const validOutputTokens = (value: unknown): value is number => Number.isInteger(value) && Number(value) >= 128 && Number(value) <= 65_536
export const validTimeoutSeconds = (value: unknown): value is number => Number.isInteger(value) && Number(value) >= 60 && Number(value) <= 3600

export function contextSettings(model?: AiModel) {
  const contextWindow = model?.contextWindow ?? DEFAULT_CONTEXT_WINDOW
  const outputTokens = model?.outputTokens ?? Math.min(4096, Math.floor(contextWindow / 4))
  return { contextWindow, outputTokens, timeoutSeconds: model?.timeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS }
}

// Without a model tokenizer, UTF-8 bytes are a conservative token estimate;
// reserve additional space for the server's chat template and special tokens.
export function fitConversation(
  prefix: Array<{ role: string; content: string }>,
  history: AiConversationMessage[],
  instruction: string,
  model?: AiModel
) {
  const settings = contextSettings(model)
  const estimate = (messages: Array<{ role: string; content: string }>) => new TextEncoder().encode(JSON.stringify(messages)).length + 1024
  const tail = { role: 'user', content: instruction }
  const budget = settings.contextWindow - settings.outputTokens
  if (estimate([...prefix, tail]) > budget) throw new Error('현재 문서와 질문이 문맥 예산을 초과합니다. 서버·모델 관리에서 실제 문맥 한도를 확인하거나 문서를 줄이세요.')
  let used = estimate([...prefix, tail])
  const retained: AiConversationMessage[] = []
  for (let index = history.length - 1; index >= 0; index--) {
    const message = history[index]
    const encoded = { ...message, content: message.role === 'assistant' ? JSON.stringify({ summary: message.content }) : message.content }
    const cost = new TextEncoder().encode(JSON.stringify(encoded)).length + 1
    if (used + cost > budget) break
    used += cost
    retained.unshift(encoded)
  }
  while (retained[0]?.role === 'assistant') retained.shift()
  return { messages: [...prefix, ...retained, tail], retainedMessages: retained.length, droppedMessages: history.length - retained.length, ...settings }
}
