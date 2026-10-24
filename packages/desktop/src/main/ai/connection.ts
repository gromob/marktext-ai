import { randomUUID } from 'node:crypto'
import Store from 'electron-store'
import { isModelId } from './codexModels'
import type { AiConnectionSettings, AiConnectionUpdate, AiLocalServer, AiLocalServerUpdate, AiProvider } from '@shared/types/ai'

type LocalProvider = Exclude<AiProvider, 'codex'>
interface SavedServer extends Omit<AiLocalServer, 'hasApiKey'> {
  // null preserves the supplied public Splash default; empty explicitly disables it.
  encryptedKey: string | null
  apiKey?: string
}
interface SavedConnection {
  provider: AiProvider
  baseUrl: string
  encryptedKey: string
  splashBaseUrl: string
  splashEncryptedKey: string | null
  servers: SavedServer[] | null
}

export function normalizeBaseUrl(value: unknown): string {
  if (typeof value !== 'string' || value.length > 2_000) throw new Error('서버 주소를 확인하세요.')
  let url: URL
  try { url = new URL(value.trim()) } catch { throw new Error('서버 주소를 확인하세요.') }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error('인증정보나 쿼리가 없는 http 또는 https 서버 주소를 입력하세요.')
  }
  if (url.pathname === '/') url.pathname = '/v1'
  return url.toString().replace(/\/+$/, '')
}

/** Credentials stay in main; the renderer receives only whether a key exists. */
export class AiConnectionStore {
  private store = new Store<SavedConnection>({
    name: 'ai-connection',
    defaults: { provider: 'codex', baseUrl: 'http://127.0.0.1:8081/v1', encryptedKey: '', splashBaseUrl: 'http://127.0.0.1:8007/v1', splashEncryptedKey: null, servers: null }
  })

  private savedServers(): SavedServer[] {
    const saved = this.store.get('servers')
    if (saved !== null) return saved
    // Read legacy profiles without copying decrypted credentials or restoring deleted defaults.
    return [
      { id: 'local', name: 'Strata', baseUrl: this.store.get('baseUrl'), encryptedKey: this.store.get('encryptedKey') },
      { id: 'splash', name: 'Splash', baseUrl: this.store.get('splashBaseUrl'), encryptedKey: this.store.get('splashEncryptedKey') }
    ]
  }

  servers(): AiLocalServer[] {
    return this.savedServers().map(({ encryptedKey, apiKey, ...server }) => ({
      ...server, hasApiKey: apiKey !== undefined ? !!apiKey : encryptedKey === null || !!encryptedKey,
      ...(apiKey === undefined && encryptedKey ? { needsApiKey: true } : {})
    }))
  }

  private find(id: AiProvider): SavedServer {
    const server = this.savedServers().find(server => server.id === id)
    if (!server) throw new Error('AI 연결을 다시 선택하세요. 삭제된 서버는 사용할 수 없습니다.')
    return server
  }

  get(provider?: AiProvider): AiConnectionSettings {
    const selected = provider ?? this.store.get('provider')
    if (selected === 'codex') return { provider: selected, baseUrl: this.store.get('baseUrl'), hasApiKey: !!this.store.get('encryptedKey') }
    const server = this.savedServers().find(server => server.id === selected)
    // Keep a deleted selection disconnected instead of silently changing its provider.
    if (!server && provider === undefined) return { provider: selected, baseUrl: '', hasApiKey: false }
    const found = server ?? this.find(selected)
    return { provider: selected, baseUrl: found.baseUrl,
      hasApiKey: found.apiKey !== undefined ? !!found.apiKey : found.encryptedKey === null || !!found.encryptedKey,
      ...(found.apiKey === undefined && found.encryptedKey ? { needsApiKey: true } : {}) }
  }

  private keyUpdate(key: unknown, previous?: SavedServer): Pick<SavedServer, 'apiKey' | 'encryptedKey'> {
    if (key === undefined) return { apiKey: previous?.apiKey, encryptedKey: previous ? previous.encryptedKey : '' }
    if (typeof key !== 'string' || key.length > 8_000 || /[\r\n]/.test(key)) throw new Error('API 키 형식을 확인하세요.')
    // Local server tokens are intentionally stored without Keychain, per the user's choice.
    return { apiKey: key.trim(), encryptedKey: '' }
  }

  save(update: AiConnectionUpdate): AiConnectionSettings {
    if (!update || typeof update.provider !== 'string') throw new Error('AI 연결을 다시 선택하세요.')
    if (update.provider === 'codex') {
      this.store.set({ ...this.store.store, provider: 'codex' })
      return this.get()
    }
    const baseUrl = normalizeBaseUrl(update.baseUrl)
    const previous = this.find(update.provider)
    this.writeServer({ ...previous, baseUrl, ...this.keyUpdate(update.apiKey, previous) })
    this.store.set({ ...this.store.store, provider: update.provider })
    return this.get()
  }

  private writeServer(server: SavedServer): void {
    const servers = this.savedServers()
    const index = servers.findIndex(item => item.id === server.id)
    if (index < 0) servers.push(server)
    else servers[index] = server
    this.store.set({ ...this.store.store, servers,
      ...(server.id === 'local' ? { baseUrl: server.baseUrl, encryptedKey: server.encryptedKey ?? '' } : {}),
      ...(server.id === 'splash' ? { splashBaseUrl: server.baseUrl, splashEncryptedKey: server.encryptedKey } : {}) })
  }

  saveServer(update: AiLocalServerUpdate): AiLocalServer {
    if (!update || typeof update.name !== 'string' || !update.name.trim() || update.name.length > 100) throw new Error('서버 이름을 100자 이내로 입력하세요.')
    const baseUrl = normalizeBaseUrl(update.baseUrl)
    if (!Array.isArray(update.models) || update.models.length > 200 || update.models.some(model => !model || !isModelId(model.id) || typeof model.name !== 'string' || !model.name.trim() || model.name.length > 200)) {
      throw new Error('모델 ID와 이름을 확인하세요. 모델은 서버당 200개까지 등록할 수 있습니다.')
    }
    if (new Set(update.models.map(model => model.id)).size !== update.models.length) throw new Error('같은 모델 ID를 중복 등록할 수 없습니다.')
    const previous = update.id === undefined ? undefined : this.find(update.id)
    if (!previous && this.savedServers().length >= 20) throw new Error('서버는 20개까지 등록할 수 있습니다.')
    const id = previous?.id ?? `server-${randomUUID()}`
    this.writeServer({ id, name: update.name.trim(), baseUrl,
      ...this.keyUpdate(update.apiKey, previous),
      models: update.models.map(model => ({ id: model.id, name: model.name.trim() })) })
    const server = this.servers().find(server => server.id === id)
    if (!server) throw new Error('서버 설정을 다시 읽을 수 없습니다.')
    return server
  }

  deleteServer(id: LocalProvider): void {
    this.find(id)
    this.store.set({ ...this.store.store, servers: this.savedServers().filter(server => server.id !== id),
      ...(id === 'local' ? { baseUrl: '', encryptedKey: '' } : {}),
      ...(id === 'splash' ? { splashBaseUrl: '', splashEncryptedKey: '' } : {}) })
  }

  local(provider: LocalProvider = 'local'): { baseUrl: string; apiKey: string } {
    const server = this.find(provider)
    if (server.apiKey === undefined && server.encryptedKey) {
      throw new Error('이전 버전에서 암호화한 API 키가 있습니다. 서버·모델 관리에서 키를 한 번 다시 입력하고 저장하세요. 새 버전은 키체인을 사용하지 않습니다.')
    }
    return { baseUrl: normalizeBaseUrl(server.baseUrl), apiKey: server.apiKey ?? (server.encryptedKey === null ? 'local' : '') }
  }
}
