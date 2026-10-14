import { app, ipcMain } from 'electron'
import { CodexRewriter } from '../ai/codex'
import type { AiRewriteRequest } from '@shared/types/ai'

export const registerAiHandlers = (): void => {
  const service = new CodexRewriter()
  ipcMain.handle('mt::ai::status', () => service.status())
  ipcMain.handle('mt::ai::models', () => service.models())
  ipcMain.handle('mt::ai::rewrite', async(event, request: AiRewriteRequest) => {
    const owner = event.sender.id
    const cancel = () => service.cancel(owner)
    event.sender.once('destroyed', cancel)
    try {
      return await service.rewrite(owner, request)
    } finally {
      event.sender.removeListener('destroyed', cancel)
    }
  })
  ipcMain.handle('mt::ai::cancel', (event, requestId: string) => {
    if (typeof requestId === 'string') service.cancel(event.sender.id, requestId)
  })
  app.once('before-quit', () => service.dispose())
}
