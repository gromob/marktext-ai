<template>
  <aside
    id="ai-sidebar"
    class="ai-sidebar"
    data-testid="ai-sidebar"
    aria-label="AI 채팅"
  >
    <header class="chat-header">
      <strong>AI</strong>
      <span
        class="connection-dot"
        :class="{ ready: connected }"
        :title="connectionHint"
      />
      <button
        v-if="!connected && !checkingConnection"
        class="text-button reconnect"
        type="button"
        @click="checkConnection"
      >
        다시 연결
      </button>
      <button
        class="icon-button close-button"
        type="button"
        data-testid="ai-close"
        aria-label="AI 닫기"
        @click="$emit('close')"
      >
        <svg
          viewBox="0 0 20 20"
          aria-hidden="true"
        ><path d="m5 5 10 10M15 5 5 15" /></svg>
      </button>
    </header>
    <div
      ref="messageList"
      class="chat-messages"
      data-testid="ai-chat-messages"
      role="log"
      aria-live="polite"
    >
      <p
        v-if="!currentMessages.length"
        class="empty-chat"
      >
        문서를 어떻게 바꿀까요?
      </p>
      <div
        v-for="message in currentMessages"
        :key="message.id"
        class="chat-message"
        :class="message.role"
        :data-testid="`ai-message-${message.role}`"
      >
        <p
          :class="{ 'chat-error': message.error }"
          :data-testid="message.error ? 'ai-error' : undefined"
          :role="message.error ? 'alert' : undefined"
        >
          {{ message.content }}
        </p>
        <button
          v-if="message.canUndo"
          class="text-button undo-button"
          type="button"
          data-testid="ai-undo"
          :disabled="busy"
          @click="undoRevision(message)"
        >
          되돌리기
        </button>
      </div>
      <p
        v-if="activeRequest?.documentId === currentDocumentId"
        class="thinking"
        data-testid="ai-request-status"
        role="status"
      >
        {{ cancelling ? '요청을 취소하고 있어요…' : '문서를 편집하고 있어요…' }}
        <span v-if="!cancelling">({{ elapsedTime }})</span>
        <span
          v-if="!cancelling && elapsedSeconds >= 180"
          class="waiting-hint"
        >
          문서 전체를 정리할 때는 시간이 더 걸릴 수 있어요.
          최대 {{ AI_REWRITE_TIMEOUT_MS / 60_000 }}분 동안 기다리며, 중지 버튼으로 취소할 수 있어요.
        </span>
      </p>
    </div>
    <form
      class="chat-composer"
      @submit.prevent="send"
    >
      <textarea
        id="ai-instruction"
        v-model="draft"
        data-testid="ai-instruction"
        aria-label="AI에게 요청"
        placeholder="문서에 대해 요청하세요"
        rows="3"
        maxlength="8000"
        :disabled="busy"
        @keydown="handleComposerKey"
      />
      <div class="composer-tools">
        <select
          id="ai-model"
          v-model="selectedModel"
          data-testid="ai-model"
          aria-label="AI 모델"
          :title="modelError || 'AI 모델 선택'"
          :disabled="busy || loadingModels"
        >
          <option value="">
            Codex 기본 모델
          </option>
          <option
            v-if="selectedModel && !models.some(model => model.id === selectedModel)"
            :value="selectedModel"
          >
            {{ selectedModel }}
          </option>
          <option
            v-for="model in models"
            :key="model.id"
            :value="model.id"
          >
            {{ model.name }}
          </option>
        </select>
        <button
          v-if="busy"
          class="icon-button send-button"
          type="button"
          data-testid="ai-cancel"
          aria-label="요청 중지"
          :disabled="cancelling"
          @click="cancelRewrite"
        >
          <svg
            viewBox="0 0 20 20"
            aria-hidden="true"
          ><rect
            x="5"
            y="5"
            width="10"
            height="10"
            rx="1"
          /></svg>
        </button>
        <button
          v-else
          class="icon-button send-button"
          type="submit"
          data-testid="ai-generate"
          aria-label="보내기"
          :disabled="!connected || !draft.trim() || loadingModels"
        >
          <svg
            viewBox="0 0 20 20"
            aria-hidden="true"
          ><path d="M10 16V4m-5 5 5-5 5 5" /></svg>
        </button>
      </div>
    </form>
  </aside>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useEditorStore } from '@/store/editor'
import { useAiEditorStore } from '@/store/aiEditor'
import { AI_REWRITE_TIMEOUT_MS } from '@shared/types/ai'

type ChatMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  history: boolean
  error?: boolean
  canUndo?: boolean
}
const props = withDefaults(defineProps<{ visible?: boolean }>(), { visible: true })
defineEmits<{ close: [] }>()
const aiEditor = useAiEditorStore()
const { currentFile } = storeToRefs(useEditorStore())
const currentDocumentId = computed(() => currentFile.value?.id || '')
const conversations = reactive(new Map<string, ChatMessage[]>())
const drafts = reactive(new Map<string, string>())
const currentMessages = computed(() => conversations.get(currentDocumentId.value) || [])
const draft = computed({
  get: () => drafts.get(currentDocumentId.value) || '',
  set: value => drafts.set(currentDocumentId.value, value)
})
const messageList = ref<HTMLDivElement | null>(null)
const connection = ref<Awaited<ReturnType<typeof window.electron.ai.status>> | null>(null)
const checkingConnection = ref(false)
const connected = computed(() => !!(connection.value?.available && connection.value.loggedIn))
const connectionHint = computed(() => checkingConnection.value ? 'Codex 연결 확인 중' : connected.value ? 'Codex 연결됨' : 'Codex 연결 필요')
const models = ref<Awaited<ReturnType<typeof window.electron.ai.models>>>([])
const loadingModels = ref(false)
const modelError = ref('')
const modelStorageKey = 'marktext-ai:selected-model'
const readSavedModel = () => {
  try { return localStorage.getItem(modelStorageKey) || '' } catch { return '' }
}
const selectedModel = ref(readSavedModel())
watch(selectedModel, model => {
  try {
    if (model) localStorage.setItem(modelStorageKey, model)
    else localStorage.removeItem(modelStorageKey)
  } catch {
    // A storage policy may prevent saving preferences while editing remains available.
  }
})
const activeRequest = ref<{ id: string; documentId: string; startedAt: number } | null>(null)
const cancelling = ref(false)
const busy = computed(() => activeRequest.value !== null)
const elapsedSeconds = ref(0)
const elapsedTime = computed(() => `${Math.floor(elapsedSeconds.value / 60)}:${String(elapsedSeconds.value % 60).padStart(2, '0')}`)
let elapsedTimer: ReturnType<typeof setInterval> | undefined
const stopElapsedTimer = () => {
  if (elapsedTimer) clearInterval(elapsedTimer)
  elapsedTimer = undefined
}
watch(activeRequest, request => {
  stopElapsedTimer()
  elapsedSeconds.value = 0
  if (request) {
    elapsedTimer = setInterval(() => {
      elapsedSeconds.value = Math.max(0, Math.floor((Date.now() - request.startedAt) / 1000))
    }, 1000)
  }
})
const errorText = (cause: unknown) => {
  const message = cause instanceof Error ? cause.message : String(cause)
  return message.replace(/^Error invoking remote method '[^']+':\s*(?:Error:\s*)?/, '')
}

const addMessage = (documentId: string, message: Omit<ChatMessage, 'id'>) => {
  const messages = conversations.get(documentId) || []
  const id = crypto.randomUUID()
  messages.push({ id, ...message })
  conversations.set(documentId, messages)
  return id
}
const addReply = (documentId: string, content: string, error = false, canUndo = false) =>
  addMessage(documentId, { role: 'assistant', content, error, canUndo, history: !error })
const clearUndoLinks = () => {
  for (const messages of conversations.values()) {
    for (const message of messages) message.canUndo = false
  }
}
const requestHistory = (documentId: string) => {
  const recent = (conversations.get(documentId) || []).filter(message => message.history).slice(-10)
  const history: Array<{ role: 'user' | 'assistant'; content: string }> = []
  let remaining = 24000
  for (let index = recent.length - 1; index >= 0 && remaining > 0; index--) {
    const message = recent[index]
    const content = message.content.slice(0, Math.min(8000, remaining))
    remaining -= content.length
    history.unshift({ role: message.role, content })
  }
  return history
}
const refreshModels = async () => {
  loadingModels.value = true
  modelError.value = ''
  try {
    models.value = await window.electron.ai.models()
    if (selectedModel.value && !models.value.some(model => model.id === selectedModel.value)) selectedModel.value = ''
  } catch {
    models.value = []
    selectedModel.value = ''
    modelError.value = '모델 목록을 다시 확인하려면 AI를 열어주세요. 현재는 Codex 기본 모델을 사용합니다.'
  } finally { loadingModels.value = false }
}
const checkConnection = async () => {
  if (checkingConnection.value || busy.value) return
  checkingConnection.value = true
  const documentId = currentDocumentId.value
  try {
    connection.value = await window.electron.ai.status()
    if (connected.value) await refreshModels()
    else addReply(documentId, connection.value.error || '터미널에서 codex login으로 로그인한 뒤 다시 연결해주세요.', true)
  } catch (cause) {
    connection.value = { available: false, loggedIn: false }
    addReply(documentId, errorText(cause), true)
  } finally { checkingConnection.value = false }
}
const send = async () => {
  if (busy.value || !connected.value || loadingModels.value || !draft.value.trim()) return
  const documentId = currentDocumentId.value
  let snapshot
  try { snapshot = aiEditor.capture('document') } catch (cause) {
    addReply(documentId, errorText(cause), true)
    return
  }
  const instruction = draft.value.trim()
  const history = requestHistory(documentId)
  const userMessageId = addMessage(documentId, { role: 'user', content: instruction, history: false })
  drafts.set(documentId, '')
  const requestId = crypto.randomUUID()
  activeRequest.value = { id: requestId, documentId, startedAt: Date.now() }
  try {
    const result = await window.electron.ai.rewrite({ requestId, instruction, markdown: snapshot.markdown, model: selectedModel.value || undefined, history })
    if (activeRequest.value?.id !== requestId || cancelling.value) return
    if (result.markdown === snapshot.markdown) {
      const current = aiEditor.capture('document')
      if (current.documentId !== snapshot.documentId || current.documentMarkdown !== snapshot.documentMarkdown) {
        throw new Error('문서가 바뀌었습니다. 현재 내용을 기준으로 다시 요청해주세요.')
      }
      addReply(documentId, '현재 문서에 반영되어 있습니다.')
    } else {
      aiEditor.apply(snapshot, result.markdown)
      clearUndoLinks()
      addReply(documentId, result.summary || '문서에 반영했습니다.', false, true)
    }
    const userMessage = conversations.get(documentId)?.find(message => message.id === userMessageId)
    if (userMessage) userMessage.history = true
  } catch (cause) {
    if (activeRequest.value?.id === requestId && !cancelling.value) {
      addReply(documentId, errorText(cause), true)
      if (!drafts.get(documentId)) drafts.set(documentId, instruction)
    }
  } finally {
    if (activeRequest.value?.id === requestId) {
      if (cancelling.value) {
        addMessage(documentId, { role: 'assistant', content: '요청을 취소했습니다.', history: false })
        if (!drafts.get(documentId)) drafts.set(documentId, instruction)
      }
      activeRequest.value = null
      cancelling.value = false
    }
  }
}
const cancelRewrite = async () => {
  const request = activeRequest.value
  if (!request || cancelling.value) return
  cancelling.value = true
  try { await window.electron.ai.cancel(request.id) } catch (cause) {
    if (activeRequest.value?.id === request.id) {
      addReply(request.documentId, errorText(cause), true)
    }
  }
}
const undoRevision = (message: ChatMessage) => {
  try {
    aiEditor.undo()
    clearUndoLinks()
    addReply(currentDocumentId.value, '적용을 되돌렸습니다.')
  } catch (cause) {
    message.canUndo = false
    addReply(currentDocumentId.value, errorText(cause), true)
  }
}
const handleComposerKey = (event: KeyboardEvent) => {
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing && event.keyCode !== 229) {
    event.preventDefault()
    void send()
  }
}
const releaseRequest = () => {
  const request = activeRequest.value
  activeRequest.value = null
  if (request) void window.electron.ai.cancel(request.id).catch(() => undefined)
}
watch(() => [currentDocumentId.value, currentMessages.value.length, busy.value, props.visible], async () => {
  await nextTick()
  if (messageList.value) messageList.value.scrollTop = messageList.value.scrollHeight
})
watch(() => props.visible, visible => {
  if (visible) void checkConnection()
  else void cancelRewrite()
})
onMounted(() => {
  void checkConnection()
  window.addEventListener('beforeunload', releaseRequest)
})
onBeforeUnmount(() => {
  stopElapsedTimer()
  releaseRequest()
  window.removeEventListener('beforeunload', releaseRequest)
})
</script>

<style scoped>
.ai-sidebar { box-sizing: border-box; width: var(--ai-sidebar-width, 370px); flex: 0 0 var(--ai-sidebar-width, 370px); min-width: 0; display: flex; flex-direction: column; border-left: 1px solid var(--editorColor10); background: var(--editorBgColor); color: var(--editorColor80); font-size: 13px; line-height: 1.65; text-align: left; }
.ai-sidebar * { box-sizing: border-box; }
.ai-sidebar button, .ai-sidebar select, .ai-sidebar textarea { font: inherit; }
.ai-sidebar button { cursor: pointer; }
.ai-sidebar button:disabled { opacity: .4; cursor: default; }
.ai-sidebar button:focus-visible, .ai-sidebar select:focus-visible, .ai-sidebar textarea:focus-visible { outline: 2px solid var(--themeColor); outline-offset: 2px; }
.ai-sidebar p { margin: 0; }
.ai-sidebar svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; }
.chat-header { display: flex; align-items: center; gap: 8px; padding: 16px 18px 10px; }
.chat-header strong { font-size: 14px; font-weight: 600; }
.connection-dot { width: 5px; height: 5px; border-radius: 50%; background: var(--editorColor40); }
.connection-dot.ready { background: #39a576; }
.icon-button { display: grid; place-items: center; flex-shrink: 0; width: 30px; height: 30px; padding: 0; border: 0; border-radius: 7px; color: var(--editorColor60); background: transparent; }
.icon-button:hover:enabled { background: var(--editorColor04); }
.close-button { margin-left: auto; }
.text-button { padding: 0; border: 0; background: transparent; color: var(--editorColor50); font-size: 11px !important; }
.text-button:hover:enabled { color: var(--themeColor); }
.reconnect { margin-left: auto; }
.chat-messages { flex: 1; min-height: 0; overflow-y: auto; padding: 12px 18px 24px; overflow-wrap: anywhere; }
.empty-chat { padding: 48px 0; text-align: center; color: var(--editorColor40); }
.chat-message { margin-top: 20px; }
.chat-message:first-child { margin-top: 0; }
.chat-message p { white-space: pre-wrap; }
.chat-message.user { margin-left: 24px; padding: 10px 13px; border-radius: 12px 12px 3px 12px; background: var(--editorColor04); }
.chat-message.assistant { padding-right: 8px; }
.chat-error { color: var(--deleteColor); }
.undo-button { margin-top: 7px; }
.thinking { margin-top: 20px !important; color: var(--editorColor50); font-size: 12px; }
.waiting-hint { display: block; margin-top: 5px; }
.chat-composer { flex-shrink: 0; margin: 0 14px 14px; border: 1px solid var(--editorColor10); border-radius: 12px; background: var(--editorColor04); overflow: hidden; }
.chat-composer:focus-within { border-color: var(--themeColor40); }
.chat-composer textarea { display: block; width: 100%; min-height: 84px; max-height: 200px; padding: 12px 13px 4px; resize: vertical; border: 0; background: transparent; color: var(--editorColor80); font-size: 12px; line-height: 1.7; }
.chat-composer textarea:focus-visible { outline: none; }
.chat-composer textarea::placeholder { color: var(--editorColor40); }
.composer-tools { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 7px 9px; }
.composer-tools select { min-width: 0; max-width: 240px; padding: 4px 2px; border: 0; border-radius: 4px; background: transparent; color: var(--editorColor60); font-size: 11px; text-overflow: ellipsis; }
.composer-tools option { background: var(--editorBgColor); color: var(--editorColor80); }
.send-button { background: var(--themeColor); color: var(--buttonPrimaryFontColor); }
.send-button:hover:enabled { background: var(--themeColor90); }
</style>
