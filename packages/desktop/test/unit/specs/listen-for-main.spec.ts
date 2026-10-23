import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

// `listenForMain` pulls in the layout store, which transitively imports the
// preferences store and `@/config` (the latter reads `window.path.sep` at
// module load). Stub the contextBridge surfaces before the hoisted imports run
// so the store graph can load.
vi.hoisted(() => {
  const w = globalThis as unknown as { window?: { path?: { sep: string } } }
  w.window ??= {}
  w.window.path ??= { sep: '/' }
})

import { useListenForMainStore } from '@/store/listenForMain'
import { useLayoutStore } from '@/store/layout'
import bus from '@/bus'

// `EDITOR_EDIT_ACTION('findInFolder')` routes through `layoutStore.SET_LAYOUT`,
// which (because `showSideBar` is defined) reads `window.marktext.env`,
// fires `window.electron.ipcRenderer.send`, and persists the sidebar
// visibility preference (another `ipcRenderer.send`). The renderer i18n module
// (pulled in via the preferences store) also reads `window.electron.ipcRenderer`
// at import time. Provide spies for all of it.
const win = window as unknown as {
  electron?: { ipcRenderer: { on: Mock; send: Mock; invoke: Mock } }
  marktext?: { env: { windowId: number } }
}

describe('listenForMain store EDITOR_EDIT_ACTION', () => {
  beforeEach(() => {
    win.electron = {
      ipcRenderer: {
        on: vi.fn(),
        send: vi.fn(),
        invoke: vi.fn(() => Promise.resolve(false))
      }
    }
    win.marktext = { env: { windowId: 1 } }
    setActivePinia(createPinia())
  })

  afterEach(() => {
    delete win.electron
    delete win.marktext
    bus.all.clear()
    vi.clearAllMocks()
  })

  it("opens the search side panel for 'findInFolder'", () => {
    const layoutStore = useLayoutStore()
    expect(layoutStore.rightColumn).toBe('files')
    expect(layoutStore.showSideBar).toBe(false)

    useListenForMainStore().EDITOR_EDIT_ACTION('findInFolder')

    expect(layoutStore.rightColumn).toBe('search')
    expect(layoutStore.showSideBar).toBe(true)
  })

  it('does not mutate the layout for a non-findInFolder action', () => {
    const layoutStore = useLayoutStore()
    layoutStore.$patch({ rightColumn: 'files', showSideBar: false })

    useListenForMainStore().EDITOR_EDIT_ACTION('insertParagraph')

    expect(layoutStore.rightColumn).toBe('files')
    expect(layoutStore.showSideBar).toBe(false)
  })

  it('registers edit actions once when the app mounts again during development', () => {
    const store = useListenForMainStore()
    for (let mount = 0; mount < 6; mount++) store.LISTEN_FOR_EDIT()

    const ipc = win.electron?.ipcRenderer
    if (!ipc) throw new Error('IPC mock is missing')
    const subscriptions = ipc.on.mock.calls.filter(
      ([channel]) => channel === 'mt::editor-edit-action'
    )
    for (const action of ['undo', 'redo']) {
      const handler = vi.fn()
      bus.on(action, handler)
      try {
        for (const [, callback] of subscriptions) callback({}, action)
        expect(handler).toHaveBeenCalledTimes(1)
        handler.mockClear()
        bus.emit('mt::editor-edit-action', action)
        expect(handler).toHaveBeenCalledTimes(1)
      } finally {
        bus.off(action, handler)
      }
    }
    expect(subscriptions).toHaveLength(1)
  })
})
