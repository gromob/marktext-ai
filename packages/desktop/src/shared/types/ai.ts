export type AiProvider = 'codex' | 'local' | 'splash' | `server-${string}`

export interface AiLocalServer {
  id: Exclude<AiProvider, 'codex'>
  name: string
  baseUrl: string
  hasApiKey: boolean
  needsApiKey?: boolean
  // Undefined preserves automatic discovery for profiles saved before model management.
  models?: AiModel[]
}

export interface AiLocalServerUpdate {
  id?: Exclude<AiProvider, 'codex'>
  name: string
  baseUrl: string
  apiKey?: string
  models: AiModel[]
}

export interface AiConnectionSettings {
  provider: AiProvider
  baseUrl: string
  hasApiKey: boolean
  needsApiKey?: boolean
}

export interface AiConnectionUpdate {
  provider: AiProvider
  baseUrl: string
  // Omitted retains the saved key; an empty string removes it.
  apiKey?: string
}

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
  provider?: AiProvider
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
  servers(): Promise<AiLocalServer[]>
  saveServer(server: AiLocalServerUpdate): Promise<AiLocalServer>
  deleteServer(id: Exclude<AiProvider, 'codex'>): Promise<void>
  settings(provider?: AiProvider): Promise<AiConnectionSettings>
  configure(settings: AiConnectionUpdate): Promise<AiConnectionSettings>
  status(provider?: AiProvider): Promise<AiStatus>
  models(provider?: AiProvider): Promise<AiModel[]>
  rewrite(request: AiRewriteRequest): Promise<AiRewriteResult>
  cancel(requestId: string): Promise<void>
}
