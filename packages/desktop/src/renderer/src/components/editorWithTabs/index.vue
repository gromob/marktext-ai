<template>
  <div
    class="editor-with-tabs"
    :style="{ 'max-width': `calc(100vw - ${effectiveSideBarWidth}px)` }"
  >
    <div class="editor-toolbar">
      <tabs v-show="showTabBar" />
      <button
        class="ai-toggle"
        type="button"
        data-testid="ai-toggle"
        :aria-expanded="aiVisible"
        aria-controls="ai-sidebar"
        title="AI 문서 편집 (⌘⇧A / Ctrl+Shift+A)"
        @click="aiVisible = !aiVisible"
      >
        <span aria-hidden="true">✦</span> AI
      </button>
    </div>
    <div
      ref="workspace"
      class="editor-workspace"
      :class="{ 'resizing-ai': resizingAi }"
      :style="{ '--ai-sidebar-width': `${aiWidth}px` }"
    >
      <div class="container">
        <editor
          :markdown="markdown"
          :cursor="cursor"
          :text-direction="textDirection"
          :platform="platform"
        />
        <source-code
          v-if="sourceCode"
          :markdown="markdown"
          :muya-index-cursor="muyaIndexCursor"
          :text-direction="textDirection"
        />
      </div>
      <div
        v-if="aiVisible"
        class="ai-resize-handle"
        data-testid="ai-resize-handle"
        role="separator"
        tabindex="0"
        aria-label="AI 채팅 너비 조절"
        aria-orientation="vertical"
        aria-controls="ai-sidebar"
        :aria-valuemin="minAiWidth"
        :aria-valuemax="maxAiWidth"
        :aria-valuenow="aiWidth"
        title="드래그하여 너비 조절 · 두 번 클릭하여 기본 너비"
        @pointerdown="startAiResize"
        @pointermove="moveAiResize"
        @pointerup="finishAiResize"
        @pointercancel="finishAiResize"
        @lostpointercapture="finishAiResize"
        @keydown="resizeAiWithKeyboard"
        @dblclick="resetAiWidth"
      />
      <ai-sidebar
        v-if="aiMounted"
        v-show="aiVisible"
        :visible="aiVisible"
        @close="aiVisible = false"
      />
    </div>
    <tab-notifications />
  </div>
</template>

<script setup lang="ts">
import { useLayoutStore } from '@/store/layout'
import { storeToRefs } from 'pinia'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import AiSidebar from '../ai/AiSidebar.vue'
import Tabs from './tabs.vue'
import Editor from './editor.vue'
import SourceCode from './sourceCode.vue'
import TabNotifications from './notifications.vue'

defineProps<{
  markdown: string
  // `cursor` originates as `IFileState.cursor` which is `unknown`
  // (see src/shared/types/files.ts); align here instead of forcing every
  // caller to widen.
  cursor: unknown
  muyaIndexCursor?: unknown
  sourceCode: boolean
  showTabBar: boolean
  textDirection: string
  platform: string
}>()

const { effectiveSideBarWidth } = storeToRefs(useLayoutStore())
const aiVisible = ref(false)
const aiMounted = ref(false)
const workspace = ref<HTMLDivElement | null>(null)
const workspaceWidth = ref(window.innerWidth)
const aiWidthStorageKey = 'marktext-ai:sidebar-width'
const defaultAiWidth = 370
const readAiWidth = () => {
  try {
    const saved = Number(localStorage.getItem(aiWidthStorageKey))
    return Number.isFinite(saved) && saved >= 260 ? saved : defaultAiWidth
  } catch { return defaultAiWidth }
}
const preferredAiWidth = ref(readAiWidth())
const maxAiWidth = computed(() => Math.max(0, Math.floor(workspaceWidth.value - (workspaceWidth.value > 760 ? 320 : 24))))
const minAiWidth = computed(() => Math.min(260, maxAiWidth.value))
const clampAiWidth = (width: number) => Math.round(Math.max(minAiWidth.value, Math.min(maxAiWidth.value, width)))
// Window or file-sidebar resizing only clamps the view, preserving the user's chosen width.
const aiWidth = computed(() => clampAiWidth(preferredAiWidth.value))
const resizingAi = ref(false)
let resizeObserver: ResizeObserver | undefined
let aiDrag: { target: HTMLElement; pointerId: number; startX: number; startWidth: number } | undefined

const saveAiWidth = () => {
  try { localStorage.setItem(aiWidthStorageKey, String(preferredAiWidth.value)) } catch {
    // Width adjustments remain available when storage is restricted.
  }
}
const finishAiResize = () => {
  const drag = aiDrag
  if (!drag) return
  aiDrag = undefined
  resizingAi.value = false
  if (drag.target.hasPointerCapture(drag.pointerId)) drag.target.releasePointerCapture(drag.pointerId)
  saveAiWidth()
}
const startAiResize = (event: PointerEvent) => {
  if (event.button !== 0 || aiDrag) return
  event.preventDefault()
  const target = event.currentTarget as HTMLElement
  aiDrag = { target, pointerId: event.pointerId, startX: event.clientX, startWidth: aiWidth.value }
  target.setPointerCapture(event.pointerId)
  resizingAi.value = true
}
const moveAiResize = (event: PointerEvent) => {
  if (aiDrag?.pointerId !== event.pointerId) return
  preferredAiWidth.value = clampAiWidth(aiDrag.startWidth + aiDrag.startX - event.clientX)
}
const resetAiWidth = () => {
  preferredAiWidth.value = defaultAiWidth
  saveAiWidth()
}
const resizeAiWithKeyboard = (event: KeyboardEvent) => {
  const step = event.shiftKey ? 50 : 10
  let width: number
  switch (event.key) {
    case 'ArrowLeft': width = aiWidth.value + step; break
    case 'ArrowRight': width = aiWidth.value - step; break
    case 'Home': width = minAiWidth.value; break
    case 'End': width = maxAiWidth.value; break
    default: return
  }
  event.preventDefault()
  preferredAiWidth.value = clampAiWidth(width)
  saveAiWidth()
}

watch(aiVisible, visible => {
  if (visible) aiMounted.value = true
  else finishAiResize()
})

const handleAiShortcut = (event: KeyboardEvent) => {
  if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.code === 'KeyA') {
    event.preventDefault()
    event.stopPropagation()
    aiVisible.value = !aiVisible.value
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleAiShortcut, true)
  window.addEventListener('blur', finishAiResize)
  resizeObserver = new ResizeObserver(entries => {
    workspaceWidth.value = entries[0].contentRect.width
  })
  if (workspace.value) resizeObserver.observe(workspace.value)
})
onBeforeUnmount(() => {
  finishAiResize()
  resizeObserver?.disconnect()
  window.removeEventListener('keydown', handleAiShortcut, true)
  window.removeEventListener('blur', finishAiResize)
})
</script>

<style scoped>
.editor-with-tabs {
  position: relative;
  height: 100%;
  flex: 1;
  display: flex;
  flex-direction: column;

  overflow: hidden;
  background: var(--editorBgColor);
  container-type: inline-size;
}

.editor-toolbar {
  display: flex;
  flex: 0 0 30px;
  min-width: 0;
  border-bottom: 1px solid var(--editorColor10);
}

.editor-toolbar :deep(.editor-tabs) {
  flex: 1;
  min-width: 0;
  box-shadow: none;
}

.ai-toggle {
  flex-shrink: 0;
  margin-left: auto;
  padding: 0 13px;
  border: 0;
  border-left: 1px solid var(--editorColor10);
  background: transparent;
  color: var(--editorColor80);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}

.ai-toggle:hover,
.ai-toggle[aria-expanded='true'] {
  color: var(--themeColor);
  background: var(--themeColor10);
}

.ai-toggle:focus-visible {
  outline: 2px solid var(--themeColor);
  outline-offset: -2px;
}

.editor-workspace {
  position: relative;
  display: flex;
  flex: 1;
  min-height: 0;
  min-width: 0;
  overflow: hidden;
}

.container {
  position: relative;
  flex: 1;
  min-width: 0;
  overflow: hidden;
}

.container :deep(.source-code) {
  height: 100%;
}

.ai-resize-handle {
  position: absolute;
  top: 0;
  bottom: 0;
  right: calc(var(--ai-sidebar-width) - 4px);
  width: 8px;
  z-index: 21;
  cursor: col-resize;
  touch-action: none;
  user-select: none;
}

.ai-resize-handle::after {
  content: '';
  position: absolute;
  inset: 0 3px;
}

.ai-resize-handle:hover::after,
.ai-resize-handle:focus-visible::after,
.resizing-ai .ai-resize-handle::after {
  background: var(--themeColor);
}

.ai-resize-handle:focus-visible { outline: none; }
.resizing-ai, .resizing-ai :deep(*) { cursor: col-resize !important; user-select: none !important; }

@container (max-width: 760px) {
  .editor-workspace :deep(.ai-sidebar) {
    position: absolute;
    inset: 0 0 0 auto;
    width: var(--ai-sidebar-width);
    box-shadow: -12px 0 32px var(--editorColor10);
    z-index: 20;
  }
}
</style>
