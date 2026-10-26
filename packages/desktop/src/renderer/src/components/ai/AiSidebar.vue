<template>
  <aside
    id="ai-sidebar"
    class="ai-sidebar"
    :style="{ '--ai-font-size': `${aiFontSize}px` }"
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
      <span
        class="connection-status"
        role="status"
      >{{ connectionHint }}</span>
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
    <div class="font-controls">
      <span>{{ t('preferences.editor.textEditor.aiFontSize') }}</span>
      <div class="font-buttons">
        <button
          type="button"
          data-testid="ai-font-smaller"
          :aria-label="t('preferences.editor.textEditor.decreaseAiFontSize')"
          :disabled="aiFontSize <= MIN_AI_FONT_SIZE"
          @click="adjustFontSize(-1)"
        >
          A−
        </button>
        <output
          data-testid="ai-font-size"
          aria-live="polite"
        >{{ aiFontSize }} px</output>
        <button
          type="button"
          data-testid="ai-font-larger"
          :aria-label="t('preferences.editor.textEditor.increaseAiFontSize')"
          :disabled="aiFontSize >= MAX_AI_FONT_SIZE"
          @click="adjustFontSize(1)"
        >
          A+
        </button>
      </div>
    </div>
    <div class="connection-controls">
      <label>AI 연결
        <select
          v-model="connectionMode"
          data-testid="ai-provider"
          :disabled="busy || showManager || checkingConnection || savingSettings"
          @change="changeProvider"
        >
          <option value="codex">Codex</option>
          <option value="local">로컬 AI</option>
        </select>
      </label>
      <button
        v-if="provider !== 'codex'"
        type="button"
        class="text-button"
        :disabled="busy || showManager || checkingConnection"
        @click="showSettings = !showSettings"
      >
        연결 설정
      </button>
      <button
        v-if="connectionMode === 'local'"
        type="button"
        class="text-button"
        data-testid="ai-manage-servers"
        :disabled="busy || checkingConnection || savingSettings"
        @click="showManager = !showManager; showSettings = false"
      >
        {{ showManager ? '관리 닫기' : '서버·모델 관리' }}
      </button>
    </div>
    <LocalAiManager
      v-if="showManager && connectionMode === 'local'"
      :initial-provider="provider"
      :catalogs="localCatalogs"
      @changed="refreshManagedServers"
    />
    <form
      v-if="showSettings && provider !== 'codex'"
      class="connection-settings"
      @submit.prevent="saveConnection"
    >
      <label>{{ localCatalogs.find(catalog => catalog.provider === provider)?.name || (provider === 'splash' ? 'Splash' : 'Strata') }} 서버 주소
        <input
          v-model="baseUrl"
          data-testid="ai-base-url"
          placeholder="http://127.0.0.1:8081/v1"
          :disabled="busy || savingSettings"
          required
        >
      </label>
      <label>API 키 (필요한 경우 · 평문 저장)
        <input
          v-model="apiKey"
          data-testid="ai-api-key"
          type="password"
          autocomplete="off"
          :placeholder="hasApiKey ? '기본/저장된 키 사용 · 입력하면 교체' : '인증 없는 서버는 비워 두세요'"
          :disabled="busy || savingSettings"
        >
      </label>
      <p
        v-if="needsApiKey"
        role="status"
      >
        이전 키를 한 번 다시 입력하고 저장하세요. 새 버전은 키체인을 사용하지 않습니다.
      </p>
      <label v-if="hasApiKey"><input
        v-model="removeKey"
        type="checkbox"
        :disabled="busy || savingSettings"
      >저장된 키 삭제</label>
      <p
        v-if="settingsError"
        role="alert"
      >
        {{ settingsError }}
      </p>
      <button
        type="submit"
        class="text-button"
        :disabled="busy || checkingConnection || savingSettings"
      >
        저장하고 연결
      </button>
      <p>현재 문서와 대화가 지정한 서버로 전달됩니다.</p>
    </form>
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
        role="status"
      >
        {{ cancelling ? '요청을 취소하고 있어요…' : activeRequest?.mode === 'ask' ? '문서를 읽고 답변하고 있어요…' : '문서를 편집하고 있어요…' }} ({{ elapsedSeconds }}초)
      </p>
    </div>
    <form
      v-show="!showManager"
      class="chat-composer"
      @submit.prevent="send"
    >
      <div class="mode-tools">
        <button
          type="button"
          class="text-button"
          data-testid="ai-mode"
          :aria-pressed="mode === 'edit'"
          :disabled="busy"
          title="질문·분석 / 문서 편집 전환 (Shift+Tab)"
          @mousedown.prevent
          @click="toggleMode"
        >
          {{ mode === 'ask' ? '질문·분석' : '문서 편집' }} · ⇧Tab
        </button>
        <span>{{ mode === 'ask' ? '본문을 변경하지 않습니다' : '수정 결과를 본문에 적용합니다' }}</span>
        <button
          type="button"
          class="text-button"
          data-testid="ai-new-chat"
          title="현재 문서의 대화만 초기화 (/new)"
          :disabled="busy"
          @mousedown.prevent
          @click="newConversation"
        >
          새 대화
        </button>
      </div>
      <p
        v-if="provider !== 'codex'"
        class="context-status"
        data-testid="ai-context-status"
      >
        문맥 {{ selectedLimits.contextWindow }} 토큰{{ selectedModelInfo?.contextWindow ? '' : ' (미확인·기본값)' }} · 출력·추론 예약 {{ selectedLimits.outputTokens }} · 대기 {{ selectedLimits.timeoutSeconds }}초 · 보수적 추정
      </p>
      <textarea
        id="ai-instruction"
        v-model="draft"
        data-testid="ai-instruction"
        aria-label="AI에게 요청"
        :placeholder="mode === 'ask' ? '문서에 대해 질문하세요' : '문서를 어떻게 수정할까요?'"
        rows="3"
        maxlength="8000"
        :disabled="busy"
        @keydown="handleComposerKey"
      />
      <div class="composer-tools">
        <select
          id="ai-model"
          :value="menuModel"
          data-testid="ai-model"
          aria-label="AI 모델"
          :title="modelError || 'AI 모델 선택'"
          :disabled="busy || showManager || loadingModels || checkingConnection || savingSettings"
          @change="selectModel"
        >
          <option value="">
            {{ provider === 'codex' ? 'Codex 기본 모델' : '모델을 선택하세요' }}
          </option>
          <option
            v-if="provider === 'codex' && selectedModel && !models.some(model => model.id === selectedModel)"
            :value="selectedModel"
          >
            {{ selectedModel }}
          </option>
          <option
            v-for="model in menuOptions"
            :key="model.value"
            :value="model.value"
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
          :disabled="busy || !draft.trim() || (draft.trim() !== '/new' && (checkingConnection || savingSettings || showManager || !connected || loadingModels || !modelAvailable))"
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
import { useI18n } from 'vue-i18n'
import { contextSettings } from '@shared/aiContext'
import { MIN_AI_FONT_SIZE, MAX_AI_FONT_SIZE } from '@shared/aiTypography'
import { usePreferencesStore } from '@/store/preferences'
import LocalAiManager from './LocalAiManager.vue'
import type { AiMode, AiProvider } from '@shared/types/ai'
import { localModelOptions, localModelValue, type LocalAiCatalog, type LocalAiProvider } from '@/util/localAiModels'
import { useEditorStore } from '@/store/editor'
import { useAiEditorStore } from '@/store/aiEditor'

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
const { t } = useI18n()
const preferences = usePreferencesStore()
const { aiFontSize } = storeToRefs(preferences)
const adjustFontSize = (delta: number) => preferences.SET_SINGLE_PREFERENCE({
  type: 'aiFontSize', value: Math.max(MIN_AI_FONT_SIZE, Math.min(MAX_AI_FONT_SIZE, aiFontSize.value + delta))
})
const aiEditor = useAiEditorStore()
const { currentFile } = storeToRefs(useEditorStore())
const currentDocumentId = computed(() => currentFile.value?.id || '')
const conversations = reactive(new Map<string, ChatMessage[]>())
const drafts = reactive(new Map<string, string>())
const mode = ref<AiMode>('ask')
const toggleMode = () => { if (!busy.value) mode.value = mode.value === 'ask' ? 'edit' : 'ask' }
const currentMessages = computed(() => conversations.get(currentDocumentId.value) || [])
const draft = computed({
  get: () => drafts.get(currentDocumentId.value) || '',
  set: value => drafts.set(currentDocumentId.value, value)
})
const messageList = ref<HTMLDivElement | null>(null)
const connection = ref<Awaited<ReturnType<typeof window.electron.ai.status>> | null>(null)
const checkingConnection = ref(false)
const connected = computed(() => !!(connection.value?.available && connection.value.loggedIn))
const provider = ref<AiProvider>('codex')
const connectionMode = ref<'codex' | 'local'>('codex')
const localCatalogs = ref<LocalAiCatalog[]>([])
const lastLocalKey = 'marktext-ai:last-local-provider'
const readLastLocal = (): LocalAiProvider => {
  try { return (localStorage.getItem(lastLocalKey) || 'local') as LocalAiProvider } catch { return 'local' }
}
const baseUrl = ref('http://127.0.0.1:8081/v1')
const apiKey = ref('')
const hasApiKey = ref(false)
const needsApiKey = ref(false)
const removeKey = ref(false)
const showSettings = ref(false)
const showManager = ref(false)
const savingSettings = ref(false)
const settingsError = ref('')
const providerName = computed(() => provider.value === 'codex' ? 'Codex' : '로컬 AI')
const connectionHint = computed(() => `${providerName.value} ${checkingConnection.value ? '연결 확인 중' : connected.value ? '연결됨' : '연결 필요'}`)
const models = ref<Awaited<ReturnType<typeof window.electron.ai.models>>>([])
const loadingModels = ref(false)
const modelError = ref('')
const modelStorageKey = () => provider.value === 'codex' ? 'marktext-ai:selected-model' : provider.value === 'splash' ? 'marktext-ai:splash-selected-model' : provider.value === 'local' ? 'marktext-ai:local-selected-model' : `marktext-ai:${provider.value}:selected-model`
const readSavedModel = () => {
  try { return localStorage.getItem(modelStorageKey()) || (provider.value === 'splash' ? 'mlx-community/Qwen3.8-27B-4bit' : '') } catch { return '' }
}
const selectedModel = ref(readSavedModel())
watch(selectedModel, model => {
  try {
    if (model) localStorage.setItem(modelStorageKey(), model)
    else localStorage.removeItem(modelStorageKey())
  } catch {
    // A storage policy may prevent saving preferences while editing remains available.
  }
}, { flush: 'sync' })
const menuOptions = computed(() => provider.value === 'codex'
  ? models.value.map(model => ({ ...model, value: model.id }))
  : localModelOptions(localCatalogs.value, selectedModel.value ? { provider: provider.value, id: selectedModel.value } : undefined))
const menuModel = computed(() => provider.value === 'codex' ? selectedModel.value : selectedModel.value ? localModelValue(provider.value, selectedModel.value) : '')
const selectedModelInfo = computed(() => menuOptions.value.find(model => model.value === menuModel.value))
const selectedLimits = computed(() => contextSettings(selectedModelInfo.value))
const modelAvailable = computed(() => provider.value === 'codex' || localModelOptions(localCatalogs.value).some(model => model.available && model.value === menuModel.value))
const activeRequest = ref<{ id: string; documentId: string; mode: AiMode; startedAt: number } | null>(null)
const clock = ref(Date.now())
const elapsedSeconds = computed(() => activeRequest.value ? Math.max(0, Math.floor((clock.value - activeRequest.value.startedAt) / 1000)) : 0)
let clockTimer: ReturnType<typeof setInterval> | undefined
const cancelling = ref(false)
const busy = computed(() => activeRequest.value !== null)
const errorText = (cause: unknown) => (cause instanceof Error ? cause.message : String(cause)).replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '')

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
const newConversation = () => {
  if (busy.value) return
  conversations.delete(currentDocumentId.value)
  drafts.set(currentDocumentId.value, '')
  addMessage(currentDocumentId.value, { role: 'assistant', content: '새 대화를 시작했습니다. 현재 문서와 모델 설정은 유지합니다.', history: false })
}
const requestHistory = (documentId: string) => {
  if (mode.value === 'ask') return (conversations.get(documentId) || []).filter(message => message.history).map(({ role, content }) => ({ role, content }))
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
    if (provider.value !== 'codex') {
      const servers = await window.electron.ai.servers()
      const sources = servers.map(server => server.id)
      const results = await Promise.allSettled(sources.map(source => window.electron.ai.models(source)))
      localCatalogs.value = results.map((result, index) => result.status === 'fulfilled'
        ? { provider: sources[index], models: result.value, registered: servers[index].models, ...(servers[index].models !== undefined ? { name: servers[index].name } : {}) }
        : { provider: sources[index], models: [], registered: servers[index].models, name: servers[index].name, error: errorText(result.reason) })
      const active = localCatalogs.value.find(catalog => catalog.provider === provider.value)
      connection.value = !active || active.error ? { available: false, loggedIn: false, error: active?.error || '서버·모델 관리에서 서버를 등록하고 사용할 모델을 선택하세요.' } : { available: true, loggedIn: true }
      if (active?.registered !== undefined && !active.registered.some(model => model.id === selectedModel.value)) selectedModel.value = ''
      if (!active) selectedModel.value = ''
      if (active?.error) {
        modelError.value = active.error
        addReply(currentDocumentId.value, modelError.value, true)
      }
      return
    }
    models.value = await window.electron.ai.models('codex')
    if (selectedModel.value && !models.value.some(model => model.id === selectedModel.value)) selectedModel.value = ''
  } catch {
    models.value = []
    selectedModel.value = ''
    modelError.value = '모델 목록을 가져오지 못했습니다. 다시 연결해 주세요.'
    addReply(currentDocumentId.value, modelError.value, true)
  } finally { loadingModels.value = false }
}
const checkConnection = async () => {
  if (checkingConnection.value || busy.value) return
  checkingConnection.value = true
  try {
    if (provider.value !== 'codex') { await refreshModels(); return }
    connection.value = await window.electron.ai.status('codex')
    if (connected.value) await refreshModels()
    else addReply(currentDocumentId.value, connection.value.error || '터미널에서 codex login으로 로그인한 뒤 다시 연결해주세요.', true)
  } catch (cause) {
    connection.value = { available: false, loggedIn: false }
    addReply(currentDocumentId.value, errorText(cause), true)
  } finally { checkingConnection.value = false }
}
const acceptSettings = (settings: Awaited<ReturnType<typeof window.electron.ai.settings>>, model?: string) => {
  provider.value = settings.provider
  connectionMode.value = settings.provider === 'codex' ? 'codex' : 'local'
  if (settings.provider !== 'codex') {
    try { localStorage.setItem(lastLocalKey, settings.provider) } catch { /* Model selection remains usable without persistence. */ }
  }
  baseUrl.value = settings.baseUrl
  hasApiKey.value = settings.hasApiKey
  needsApiKey.value = !!settings.needsApiKey
  apiKey.value = ''
  removeKey.value = false
  selectedModel.value = model ?? readSavedModel()
}
const saveConnection = async () => {
  if (busy.value || checkingConnection.value || savingSettings.value) return
  savingSettings.value = true
  settingsError.value = ''
  connection.value = null
  models.value = []
  try {
    acceptSettings(await window.electron.ai.configure({
      provider: provider.value, baseUrl: baseUrl.value,
      ...(removeKey.value ? { apiKey: '' } : apiKey.value ? { apiKey: apiKey.value } : {})
    }))
    showSettings.value = false
  } catch (cause) {
    settingsError.value = errorText(cause)
    showSettings.value = true
    try { acceptSettings(await window.electron.ai.settings()) } catch { /* Keep the editable form when settings cannot be read. */ }
  } finally { savingSettings.value = false }
  if (!settingsError.value) await checkConnection()
}
const switchProvider = async (selected: AiProvider, model?: string) => {
  if (busy.value || checkingConnection.value || savingSettings.value) return
  savingSettings.value = true
  settingsError.value = ''
  connection.value = null
  models.value = []
  try {
    const saved = await window.electron.ai.settings(selected)
    acceptSettings(await window.electron.ai.configure({ provider: selected, baseUrl: saved.baseUrl }), model)
  } catch (cause) {
    settingsError.value = errorText(cause)
    addReply(currentDocumentId.value, settingsError.value, true)
    try { acceptSettings(await window.electron.ai.settings()) } catch { /* Leave sending disabled until settings can be read. */ }
  } finally { savingSettings.value = false }
  if (!settingsError.value) await checkConnection()
  if (provider.value !== 'codex' && !connected.value) showSettings.value = true
}
const changeProvider = async () => {
  if (connectionMode.value === 'codex') { await switchProvider('codex'); return }
  const last = readLastLocal()
  const servers = await window.electron.ai.servers()
  if (!servers.some(server => server.id === last)) {
    provider.value = last
    selectedModel.value = ''
    baseUrl.value = ''
    connection.value = null
    localCatalogs.value = []
    showManager.value = true
    showSettings.value = false
    return
  }
  await switchProvider(last)
}
const selectModel = async (event: Event) => {
  if (busy.value || checkingConnection.value || savingSettings.value || loadingModels.value) return
  const value = (event.target as HTMLSelectElement).value
  if (provider.value === 'codex') { selectedModel.value = value; return }
  if (!value) { selectedModel.value = ''; return }
  const option = localModelOptions(localCatalogs.value, selectedModel.value ? { provider: provider.value, id: selectedModel.value } : undefined).find(model => model.value === value)
  if (!option) return
  if (option.provider === provider.value) selectedModel.value = option.id
  else await switchProvider(option.provider, option.id)
}
const initializeConnection = async () => {
  if (busy.value || checkingConnection.value || savingSettings.value) return
  checkingConnection.value = true
  try { acceptSettings(await window.electron.ai.settings()) } catch (cause) {
    connection.value = null
    addReply(currentDocumentId.value, errorText(cause), true)
    return
  } finally { checkingConnection.value = false }
  await checkConnection()
}
const refreshManagedServers = async () => {
  try { acceptSettings(await window.electron.ai.settings(provider.value), selectedModel.value) } catch {
    baseUrl.value = ''
    hasApiKey.value = false
    needsApiKey.value = false
    apiKey.value = ''
    selectedModel.value = ''
  }
  await checkConnection()
}
const send = async () => {
  if (draft.value.trim() === '/new') { newConversation(); return }
  if (busy.value || checkingConnection.value || savingSettings.value || !connected.value || showManager.value || loadingModels.value || !draft.value.trim() || !modelAvailable.value) return
  const documentId = currentDocumentId.value
  let snapshot
  try { snapshot = aiEditor.capture('document') } catch (cause) {
    addReply(documentId, errorText(cause), true)
    return
  }
  const requestMode = mode.value
  const instruction = draft.value.trim()
  const history = requestHistory(documentId)
  const userMessageId = addMessage(documentId, { role: 'user', content: instruction, history: false })
  drafts.set(documentId, '')
  const requestId = crypto.randomUUID()
  clock.value = Date.now()
  activeRequest.value = { id: requestId, documentId, mode: requestMode, startedAt: clock.value }
  try {
    const result = await window.electron.ai.rewrite({ requestId, mode: requestMode, provider: provider.value, instruction, markdown: snapshot.markdown, model: selectedModel.value || undefined, history })
    if (activeRequest.value?.id !== requestId || cancelling.value) return
    if (requestMode === 'ask' || result.markdown === snapshot.markdown) {
      const current = aiEditor.capture('document')
      if (current.documentId !== snapshot.documentId || current.documentMarkdown !== snapshot.documentMarkdown) {
        throw new Error('문서가 바뀌었습니다. 현재 내용을 기준으로 다시 요청해주세요.')
      }
      addReply(documentId, result.summary?.trim() || '문서를 변경하지 않았습니다.')
      if (result.context?.droppedMessages) addMessage(documentId, { role: 'assistant', content: `문맥 한도로 이전 메시지 ${result.context.droppedMessages}개는 이번 요청에서 제외했습니다. /new로 새 대화를 시작할 수 있습니다.`, history: false })
    } else {
      aiEditor.apply(snapshot, result.markdown)
      clearUndoLinks()
      addReply(documentId, result.summary || '문서에 반영했습니다.', false, true)
    }
    const userMessage = conversations.get(documentId)?.find(message => message.id === userMessageId)
    if (userMessage) userMessage.history = true
  } catch (cause) {
    if (activeRequest.value?.id === requestId && !cancelling.value) addReply(documentId, errorText(cause), true)
  } finally {
    if (activeRequest.value?.id === requestId) {
      if (cancelling.value) addMessage(documentId, { role: 'assistant', content: '요청을 취소했습니다.', history: false })
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
  if (event.key === 'Tab' && event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey) {
    event.preventDefault()
    event.stopPropagation()
    if (!event.repeat) toggleMode()
    return
  }
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
  if (visible) void initializeConnection()
  else void cancelRewrite()
})
onMounted(() => {
  clockTimer = setInterval(() => { clock.value = Date.now() }, 1000)
  void initializeConnection()
  window.addEventListener('beforeunload', releaseRequest)
})
onBeforeUnmount(() => {
  if (clockTimer) clearInterval(clockTimer)
  releaseRequest()
  window.removeEventListener('beforeunload', releaseRequest)
})
</script>

<style scoped>
.font-controls { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 6px; padding: 4px 12px; font-size: 0.923077em; }
.font-buttons { display: flex; align-items: center; gap: 6px; }
.font-buttons button { padding: 3px 7px; border: 1px solid var(--editorColor20); border-radius: 4px; color: var(--editorColor80); background: transparent; }
.font-buttons output { min-width: 3.5em; text-align: center; }
.connection-status { font-size: 0.846154em; color: var(--editorColor50); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.connection-controls { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; padding: 8px 12px; gap: 8px; }
.connection-controls select { margin-left: 6px; max-width: 140px; }
.connection-settings { display: grid; gap: 8px; padding: 12px; }
.connection-settings label { display: block; font-size: 0.923077em; }
.connection-settings input:not([type="checkbox"]) { box-sizing: border-box; display: block; width: 100%; margin-top: 4px; padding: 6px; }
.connection-settings p { margin: 0; font-size: 0.923077em; overflow-wrap: anywhere; }

.ai-sidebar { box-sizing: border-box; width: var(--ai-sidebar-width, 370px); flex: 0 0 var(--ai-sidebar-width, 370px); min-width: 0; display: flex; flex-direction: column; border-left: 1px solid var(--editorColor10); background: var(--editorBgColor); color: var(--editorColor80); font-size: var(--ai-font-size, 13px); line-height: 1.65; text-align: left; }
.ai-sidebar * { box-sizing: border-box; }
.ai-sidebar button, .ai-sidebar select, .ai-sidebar textarea, .ai-sidebar input { font: inherit; }
.ai-sidebar button { cursor: pointer; }
.ai-sidebar button:disabled { opacity: .4; cursor: default; }
.ai-sidebar button:focus-visible, .ai-sidebar select:focus-visible, .ai-sidebar textarea:focus-visible { outline: 2px solid var(--themeColor); outline-offset: 2px; }
.ai-sidebar p { margin: 0; }
.ai-sidebar svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; }
.chat-header { display: flex; align-items: center; gap: 8px; padding: 16px 18px 10px; }
.chat-header strong { font-size: 1.076923em; font-weight: 600; }
.connection-dot { width: 5px; height: 5px; border-radius: 50%; background: var(--editorColor40); }
.connection-dot.ready { background: #39a576; }
.icon-button { font-size: 1em; display: grid; place-items: center; flex-shrink: 0; width: 30px; height: 30px; padding: 0; border: 0; border-radius: 7px; color: var(--editorColor60); background: transparent; }
.icon-button:hover:enabled { background: var(--editorColor04); }
.close-button { margin-left: auto; }
.text-button { padding: 0; border: 0; background: transparent; color: var(--editorColor50); font-size: 0.846154em !important; }
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
.thinking { margin-top: 20px !important; color: var(--editorColor50); font-size: 0.923077em; }
.chat-composer { flex-shrink: 0; margin: 0 14px 14px; border: 1px solid var(--editorColor10); border-radius: 12px; background: var(--editorColor04); overflow: hidden; }
.chat-composer:focus-within { border-color: var(--themeColor40); }
.chat-composer textarea { display: block; width: 100%; min-height: 84px; max-height: 200px; padding: 12px 13px 4px; resize: vertical; border: 0; background: transparent; color: var(--editorColor80); font-size: 0.923077em; line-height: 1.7; }
.chat-composer textarea:focus-visible { outline: none; }
.chat-composer textarea::placeholder { color: var(--editorColor40); }
.mode-tools { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 7px 12px 0; font-size: 0.846154em; }
.context-status { margin: 4px 12px 0; font-size: 0.8em; color: var(--editorColor50); }
.mode-tools span { color: var(--editorColor50); }
.composer-tools { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 7px 9px; }
.composer-tools select { min-width: 0; max-width: 240px; padding: 4px 2px; border: 0; border-radius: 4px; background: transparent; color: var(--editorColor60); font-size: 0.846154em; text-overflow: ellipsis; }
.composer-tools option { background: var(--editorBgColor); color: var(--editorColor80); }
.send-button { background: var(--themeColor); color: var(--buttonPrimaryFontColor); }
.send-button:hover:enabled { background: var(--themeColor90); }
</style>
