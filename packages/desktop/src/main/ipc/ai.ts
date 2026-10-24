import { app, ipcMain } from 'electron'
import { CodexRewriter } from '../ai/codex'
import { AiConnectionStore } from '../ai/connection'
import { LocalRewriter } from '../ai/local'
import type { AiConnectionUpdate, AiLocalServerUpdate, AiProvider, AiRewriteRequest } from '@shared/types/ai'

export const registerAiHandlers = (): void => {
  const codex = new CodexRewriter()
  const settings = new AiConnectionStore()
  const locals = new Map<Exclude<AiProvider, 'codex'>, LocalRewriter>()
  const active = new Map<number, CodexRewriter | LocalRewriter>()
  const idle = () => {
    if (active.size) throw new Error('AI 요청을 중지한 뒤 연결을 변경하세요.')
  }
  const service = (provider: AiProvider = settings.get().provider) => {
    if (provider === 'codex') return codex
    settings.local(provider)
    let local = locals.get(provider)
    if (!local) {
      local = new LocalRewriter(() => settings.local(provider), 180_000, provider)
      locals.set(provider, local)
    }
    return local
  }
  ipcMain.handle('mt::ai::servers', () => settings.servers())
  ipcMain.handle('mt::ai::save-server', (_event, update: AiLocalServerUpdate) => { idle(); return settings.saveServer(update) })
  ipcMain.handle('mt::ai::delete-server', (_event, id: Exclude<AiProvider, 'codex'>) => {
    idle()
    settings.deleteServer(id)
    locals.get(id)?.dispose()
    locals.delete(id)
  })
  ipcMain.handle('mt::ai::settings', (_event, provider?: AiProvider) => settings.get(provider))
  ipcMain.handle('mt::ai::configure', (_event, update: AiConnectionUpdate) => {
    idle()
    return settings.save(update)
  })
  ipcMain.handle('mt::ai::status', (_event, provider?: AiProvider) => service(provider).status())
  ipcMain.handle('mt::ai::models', (_event, provider?: AiProvider) => service(provider).models())
  ipcMain.handle('mt::ai::rewrite', async(event, request: AiRewriteRequest) => {
    const owner = event.sender.id
    if (active.has(owner) || active.size >= 4) throw new Error('진행 중인 AI 요청이 완료된 후 다시 요청하세요.')
    const selected = service(request?.provider)
    active.set(owner, selected)
    const cancel = () => selected.cancel(owner)
    event.sender.once('destroyed', cancel)
    try {
      return await selected.rewrite(owner, request)
    } finally {
      event.sender.removeListener('destroyed', cancel)
      active.delete(owner)
    }
  })
  ipcMain.handle('mt::ai::cancel', (event, requestId: string) => {
    if (typeof requestId === 'string') active.get(event.sender.id)?.cancel(event.sender.id, requestId)
  })
  app.once('before-quit', () => { codex.dispose(); for (const local of locals.values()) local.dispose() })
}
