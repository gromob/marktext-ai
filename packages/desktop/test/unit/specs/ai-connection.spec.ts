// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { AiConnectionStore, normalizeBaseUrl } from '../../../src/main/ai/connection'

const mock = vi.hoisted(() => ({ values: {} as Record<string, unknown> }))
vi.mock('electron-store', () => ({ default: class {
  constructor(options: { defaults: Record<string, unknown> }) { mock.values = { ...options.defaults } }
  get(key: string) { return mock.values[key] }
  get store() { return { ...mock.values } }
  set(values: Record<string, unknown>) { Object.assign(mock.values, values) }
} }))
vi.mock('electron', () => ({ safeStorage: {
  isEncryptionAvailable: () => { throw new Error('Unexpected Keychain access') },
  encryptString: () => { throw new Error('Unexpected Keychain access') },
  decryptString: () => { throw new Error('Unexpected Keychain access') }
} }))

describe('AI connection settings', () => {
  it('defaults to Codex and keeps credentials out of renderer settings', () => {
    const store = new AiConnectionStore()
    expect(store.get().provider).toBe('codex')
    store.save({ provider: 'local', baseUrl: 'http://localhost:8081/v1/', apiKey: 'secret' })
    expect(store.get()).toEqual({ provider: 'local', baseUrl: 'http://localhost:8081/v1', hasApiKey: true })
    expect((mock.values.servers as Array<{ apiKey: string }>)[0].apiKey).toBe('secret')
    expect(JSON.stringify(store.servers())).not.toContain('secret')
    expect(store.local().apiKey).toBe('secret')
    store.save({ provider: 'codex', baseUrl: store.get().baseUrl })
    expect(store.local().apiKey).toBe('secret')
    store.save({ provider: 'local', baseUrl: store.get().baseUrl, apiKey: '' })
    expect(store.get().hasApiKey).toBe(false)
  })

  it('keeps legacy Strata settings and Splash address/key independent', () => {
    const store = new AiConnectionStore()
    store.save({ provider: 'local', baseUrl: 'http://strata.test:8081/v1', apiKey: 'strata-secret' })
    expect(store.get('splash')).toEqual({ provider: 'splash', baseUrl: 'http://127.0.0.1:8007/v1', hasApiKey: true })
    expect(store.get().provider).toBe('local')
    expect(store.local('splash').apiKey).toBe('local')
    store.save({ provider: 'splash', baseUrl: 'http://splash.test:8007/v1', apiKey: 'splash-secret' })
    expect(store.local()).toEqual({ baseUrl: 'http://strata.test:8081/v1', apiKey: 'strata-secret' })
    expect(store.local('splash')).toEqual({ baseUrl: 'http://splash.test:8007/v1', apiKey: 'splash-secret' })
    store.save({ provider: 'local', baseUrl: store.get('local').baseUrl })
    expect(store.local('splash').apiKey).toBe('splash-secret')
    store.save({ provider: 'splash', baseUrl: store.get('splash').baseUrl, apiKey: '' })
    expect(store.local('splash').apiKey).toBe('')
    expect(store.local().apiKey).toBe('strata-secret')
  })

  it('retains default Splash authentication on selection and rejects unknown profiles', () => {
    const store = new AiConnectionStore()
    const splash = store.get('splash')
    store.save({ provider: 'splash', baseUrl: splash.baseUrl })
    expect(store.local('splash').apiKey).toBe('local')
    expect(store.get().provider).toBe('splash')
    expect(() => store.get('other' as 'local')).toThrow('AI 연결')
  })

  it('stores local server tokens without accessing the OS keychain', () => {
    const store = new AiConnectionStore()
    store.save({ provider: 'local', baseUrl: 'http://localhost:8081', apiKey: 'random-local-token' })
    expect(store.local().apiKey).toBe('random-local-token')
    expect(JSON.stringify(mock.values)).toContain('random-local-token')
    expect(JSON.stringify(store.get())).not.toContain('random-local-token')
    expect(JSON.stringify(store.servers())).not.toContain('random-local-token')
  })

  it.each(['file:///tmp/a', 'http://user:secret@localhost/v1', 'http://localhost/v1?key=x', 'http://localhost/#x', 'bad'])('rejects unsafe/ambiguous addresses: %s', url => {
    expect(() => normalizeBaseUrl(url)).toThrow()
  })
  it('adds /v1 to a bare server and preserves proxy paths', () => {
    expect(normalizeBaseUrl('http://localhost:8081')).toBe('http://localhost:8081/v1')
    expect(normalizeBaseUrl('https://host.example/proxy/v1/')).toBe('https://host.example/proxy/v1')
  })
})

describe('user-managed local servers', () => {
  it('migrates legacy keys and preserves them while adding, renaming and deleting another server', () => {
    const store = new AiConnectionStore()
    store.save({ provider: 'local', baseUrl: 'http://strata.test/v1', apiKey: 'legacy-key' })
    const server = store.saveServer({ name: 'New', baseUrl: 'http://other.test', apiKey: 'new-key', models: [{ id: 'same', name: 'First' }] })
    expect(server.id).toMatch(/^server-/)
    expect(server).toMatchObject({ name: 'New', baseUrl: 'http://other.test/v1', hasApiKey: true })
    expect(JSON.stringify(store.servers())).not.toContain('new-key')
    expect(store.local(server.id).apiKey).toBe('new-key')
    expect(store.local().apiKey).toBe('legacy-key')
    store.saveServer({ id: server.id, name: 'Renamed', baseUrl: server.baseUrl, models: [] })
    expect(store.servers().find(item => item.id === server.id)?.models).toEqual([])
    expect(store.local(server.id).apiKey).toBe('new-key')
    store.deleteServer(server.id)
    expect(store.servers().map(item => item.id)).toEqual(['local', 'splash'])
    expect(() => store.local(server.id)).toThrow('삭제된 서버')
    expect(store.local().apiKey).toBe('legacy-key')
  })

  it('does not resurrect deleted defaults or silently change the active provider', () => {
    const store = new AiConnectionStore()
    store.save({ provider: 'local', baseUrl: 'http://strata.test/v1', apiKey: 'old-key' })
    store.deleteServer('local')
    store.deleteServer('splash')
    expect(store.servers()).toEqual([])
    expect(store.get()).toEqual({ provider: 'local', baseUrl: '', hasApiKey: false })
    expect(mock.values.encryptedKey).toBe('')
    expect(mock.values.splashEncryptedKey).toBe('')
    expect(() => store.get('local')).toThrow()
    store.save({ provider: 'codex', baseUrl: '' })
    expect(store.get().provider).toBe('codex')
    expect(store.servers()).toEqual([])
  })

  it('rejects duplicate IDs, invalid model names, unsafe URLs and unknown edit targets without writes', () => {
    const store = new AiConnectionStore()
    const update = { name: 'Test', baseUrl: 'http://test.local/v1', models: [{ id: 'model', name: 'Model' }] }
    for (const invalid of [
      { ...update, models: [...update.models, ...update.models] },
      { ...update, models: [{ id: 'bad model', name: 'Invalid' }] },
      { ...update, models: [{ id: 'ok', name: '' }] },
      { ...update, baseUrl: 'http://user:password@host/v1' },
      { ...update, id: 'server-missing' as const }
    ]) expect(() => store.saveServer(invalid)).toThrow()
    expect(store.servers()).toHaveLength(2)
  })

  it('does not partially update a server when a key is invalid', () => {
    const store = new AiConnectionStore()
    const before = JSON.stringify(mock.values)
    expect(() => store.saveServer({ id: 'local', name: 'New', baseUrl: 'http://other.test/v1', apiKey: 'invalid\nkey', models: [] })).toThrow('API 키 형식')
    expect(JSON.stringify(mock.values)).toBe(before)
  })
})


it('keeps legacy encrypted keys untouched until the user re-enters or removes the key', () => {
  const store = new AiConnectionStore()
  mock.values.encryptedKey = 'legacy-ciphertext'
  mock.values.provider = 'local'
  const before = JSON.stringify(mock.values)
  expect(store.get()).toMatchObject({ hasApiKey: true, needsApiKey: true })
  expect(() => store.local()).toThrow('키를 한 번 다시 입력')
  expect(JSON.stringify(mock.values)).toBe(before)
  store.save({ provider: 'local', baseUrl: 'http://strata.test/v1' })
  expect(() => store.local()).toThrow('키를 한 번 다시 입력')
  store.save({ provider: 'local', baseUrl: 'http://strata.test/v1', apiKey: 'replacement-token' })
  expect(store.local().apiKey).toBe('replacement-token')
  expect(store.get().needsApiKey).toBeUndefined()
  expect(JSON.stringify(mock.values)).not.toContain('legacy-ciphertext')
  store.save({ provider: 'local', baseUrl: 'http://strata.test/v1', apiKey: '' })
  expect(store.local().apiKey).toBe('')
  expect(store.get().hasApiKey).toBe(false)
})
