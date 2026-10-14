export interface AiStatus {
  available: boolean
  loggedIn: boolean
  version?: string
  error?: string
}

export interface AiConversationMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface AiRewriteRequest {
  requestId: string
  instruction: string
  markdown: string
  model?: string
  history?: AiConversationMessage[]
}

export interface AiModel {
  id: string
  name: string
  description?: string
  isDefault?: boolean
}

export interface AiRewriteResult {
  markdown: string
  summary?: string
}

export interface AiAPI {
  status(): Promise<AiStatus>
  models(): Promise<AiModel[]>
  rewrite(request: AiRewriteRequest): Promise<AiRewriteResult>
  cancel(requestId: string): Promise<void>
}
