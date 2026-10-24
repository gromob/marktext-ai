<template>
  <section
    class="local-manager"
    aria-label="로컬 서버·모델 관리"
    data-testid="ai-server-manager"
  >
    <label>등록된 서버
      <select
        v-model="selected"
        data-testid="ai-server-select"
        :disabled="working"
        @change="loadSelected"
      >
        <option value="">새 서버</option>
        <option
          v-for="server in servers"
          :key="server.id"
          :value="server.id"
        >{{ server.name }}</option>
      </select>
    </label>
    <form @submit.prevent="save">
      <fieldset :disabled="working">
        <label>서버 이름<input
          v-model="name"
          data-testid="ai-server-name"
          required
          maxlength="100"
        ></label>
        <label>서버 주소<input
          v-model="baseUrl"
          data-testid="ai-server-url"
          required
          placeholder="http://127.0.0.1:8007/v1"
        ></label>
        <label>API 키 (이 컴퓨터에 평문 저장)<input
          v-model="apiKey"
          data-testid="ai-server-key"
          type="password"
          autocomplete="off"
          :placeholder="hasApiKey ? '저장된 키 유지 · 입력하면 교체' : '인증이 없으면 비워 두세요'"
        ></label>
        <label v-if="hasApiKey"><input
          v-model="removeKey"
          type="checkbox"
        >저장된 키 삭제</label>
        <button
          type="button"
          class="primary-button"
          data-testid="ai-server-connection-save"
          @click="saveConnection"
        >
          서버 설정 저장
        </button>
        <p
          v-if="saved?.needsApiKey"
          role="status"
        >
          이전 키를 한 번 다시 입력하고 저장하세요. 키체인 없이 이 컴퓨터의 앱 설정 파일에 저장합니다.
        </p>

        <p
          v-if="saved"
          data-testid="ai-server-saved-url"
        >
          저장된 주소: {{ saved.baseUrl }}
        </p>
        <p
          v-if="error"
          role="alert"
        >
          {{ error }}
        </p>
        <p
          v-if="notice"
          role="status"
        >
          {{ notice }}
        </p>
        <p>모델 목록 조회 시 입력한 서버 주소와 키를 먼저 저장합니다. 모델을 등록하거나 수정한 뒤에는 서버·모델 저장을 누르세요.</p>
        <button
          type="button"
          data-testid="ai-server-discover"
          :disabled="!name.trim() || !baseUrl.trim()"
          @click="discover"
        >
          모델 목록 조회
        </button>
        <ul
          v-if="discovered.length"
          class="discovered-models"
        >
          <li
            v-for="model in discovered"
            :key="model.id"
          >
            {{ model.name }}
            <button
              type="button"
              :disabled="models.some(item => item.id === model.id)"
              @click="models.push({ ...model })"
            >
              등록
            </button>
          </li>
        </ul>
        <p>등록 모델 (목록에서 삭제한 뒤 저장하면 선택 메뉴에서도 제거됩니다.)</p>
        <ul class="registered-models">
          <li
            v-for="(model, index) in models"
            :key="index"
          >
            <label>모델 ID<input
              v-model="model.id"
              aria-label="등록 모델 ID"
              required
              maxlength="128"
            ></label>
            <label>표시 이름<input
              v-model="model.name"
              aria-label="등록 모델 이름"
              required
              maxlength="200"
            ></label>
            <button
              type="button"
              aria-label="모델 삭제"
              @click="models.splice(index, 1)"
            >
              삭제
            </button>
          </li>
        </ul>
        <button
          type="button"
          data-testid="ai-model-add"
          @click="models.push({ id: '', name: '' })"
        >
          모델 직접 추가
        </button>
        <div class="save-actions">
          <button
            type="submit"
            class="primary-button"
            data-testid="ai-server-save"
          >
            서버·모델 저장
          </button>
        </div>
        <button
          v-if="selected"
          type="button"
          data-testid="ai-server-delete"
          @click="confirmDelete = !confirmDelete"
        >
          서버 삭제
        </button>
        <p v-if="confirmDelete">
          이 서버의 등록 모델과 저장된 API 키도 삭제합니다.
          <button
            type="button"
            data-testid="ai-server-delete-confirm"
            @click="remove"
          >
            삭제 확인
          </button>
          <button
            type="button"
            @click="confirmDelete = false"
          >
            취소
          </button>
        </p>
      </fieldset>
    </form>
    <p>서버 실행과 모델 로딩은 직접 수행해야 합니다.</p>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import type { LocalAiCatalog } from '@/util/localAiModels'
import type { AiLocalServer, AiModel } from '@shared/types/ai'

const props = defineProps<{ initialProvider: string; catalogs: LocalAiCatalog[] }>()
const emit = defineEmits<{ changed: [] }>()
const servers = ref<AiLocalServer[]>([])
const selected = ref('')
const name = ref('')
const baseUrl = ref('')
const apiKey = ref('')
const hasApiKey = ref(false)
const removeKey = ref(false)
const models = ref<AiModel[]>([])
const discovered = ref<AiModel[]>([])
const working = ref(false)
const confirmDelete = ref(false)
const error = ref('')
const notice = ref('')
const saved = computed(() => servers.value.find(server => server.id === selected.value))
const dirtyConnection = computed(() => !saved.value || saved.value.baseUrl !== baseUrl.value || saved.value.name !== name.value || !!apiKey.value || removeKey.value)
const loadSelected = () => {
  name.value = saved.value?.name || ''
  baseUrl.value = saved.value?.baseUrl || ''
  hasApiKey.value = saved.value?.hasApiKey || false
  apiKey.value = ''
  removeKey.value = false
  models.value = (saved.value?.models ?? props.catalogs.find(catalog => catalog.provider === selected.value)?.models ?? []).map(model => ({ ...model }))
  discovered.value = []
  confirmDelete.value = false
  error.value = ''
  notice.value = ''
}
const run = async (operation: () => Promise<void>) => {
  if (working.value) return
  working.value = true
  error.value = ''
  notice.value = ''
  try { await operation() } catch (cause) { error.value = (cause instanceof Error ? cause.message : String(cause)).replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '') }
  finally { working.value = false }
}
const discover = () => run(async () => {
  if (dirtyConnection.value) await persist(true)
  if (!saved.value) throw new Error('서버 설정을 저장할 수 없습니다.')
  discovered.value = []
  discovered.value = await window.electron.ai.models(saved.value.id)
  notice.value = `${discovered.value.length}개 모델을 확인했습니다. 사용할 모델을 등록하고 저장하세요.`
})
const persist = async (connectionOnly = false) => {
  const draftModels = models.value.map(model => ({ ...model }))
  const draftDiscovered = discovered.value
  const storedModels = saved.value?.models ?? props.catalogs.find(catalog => catalog.provider === selected.value)?.models ?? []
  const server = await window.electron.ai.saveServer({
    ...(saved.value ? { id: saved.value.id } : {}), name: name.value, baseUrl: baseUrl.value,
    models: (connectionOnly ? storedModels : models.value).map(model => ({ id: model.id, name: model.name })),
    ...(removeKey.value ? { apiKey: '' } : apiKey.value ? { apiKey: apiKey.value } : {})
  })
  servers.value = await window.electron.ai.servers()
  selected.value = server.id
  loadSelected()
  if (connectionOnly) {
    // Saving credentials must not discard unsaved model rows or validate incomplete drafts.
    models.value = draftModels
    discovered.value = draftDiscovered
  }
  notice.value = connectionOnly ? '서버 설정을 저장했습니다. 모델 목록을 조회할 수 있습니다.' : '저장했습니다. 모델 선택 메뉴에 반영됩니다.'
  emit('changed')
}
const save = () => run(() => persist())
const saveConnection = () => run(() => persist(true))
const remove = () => run(async () => {
  if (!saved.value || !confirmDelete.value) return
  await window.electron.ai.deleteServer(saved.value.id)
  servers.value = await window.electron.ai.servers()
  selected.value = ''
  loadSelected()
  notice.value = '서버와 등록 모델을 삭제했습니다. 사용할 모델을 직접 선택하세요.'
  emit('changed')
})
onMounted(() => void run(async () => {
  servers.value = await window.electron.ai.servers()
  selected.value = servers.value.some(server => server.id === props.initialProvider) ? props.initialProvider : ''
  loadSelected()
}))
</script>

<style scoped>
.local-manager { padding: 12px; max-height: 55vh; min-height: 0; flex-shrink: 1; overflow-y: auto; border-bottom: 1px solid var(--editorColor10); font-size: 0.923077em; }
fieldset { border: 0; padding: 0; margin: 0; min-width: 0; }
label { display: block; margin: 6px 0; }
input:not([type="checkbox"]), select { box-sizing: border-box; width: 100%; display: block; padding: 5px; background: var(--editorBgColor); color: var(--editorColor80); border: 1px solid var(--editorColor20); }
input, select { font: inherit; }
button { margin: 4px 8px 4px 0; font: inherit; cursor: pointer; }
button:disabled { opacity: .5; cursor: default; }
.primary-button { border: 0; border-radius: 5px; padding: 7px 10px; background: var(--themeColor); color: var(--buttonPrimaryFontColor); }
.save-actions { position: sticky; bottom: 0; padding: 6px 0; background: var(--editorBgColor); z-index: 1; }
ul { padding-left: 16px; overflow-wrap: anywhere; }
p { overflow-wrap: anywhere; margin: 6px 0; }
[role="alert"] { color: var(--deleteColor); }
</style>
