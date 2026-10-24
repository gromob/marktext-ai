import type { AiModel, AiProvider } from '@shared/types/ai'

export type LocalAiProvider = Exclude<AiProvider, 'codex'>
export interface LocalAiCatalog {
  provider: LocalAiProvider
  models: AiModel[]
  name?: string
  registered?: AiModel[]
  error?: string
}
export interface LocalAiModelOption extends AiModel {
  provider: LocalAiProvider
  value: string
  available: boolean
}

const defaults = {
  local: { id: 'qwen3.8-flash-next-iq3_xxs', name: 'Qwen3.8 Flash Next (Strata)' },
  splash: { id: 'mlx-community/Qwen3.8-27B-4bit', name: 'Qwen3.8-27B Splash' }
}

export const localModelValue = (provider: LocalAiProvider, model: string): string => `${provider}:${model}`

/** Offline choices remain selectable for server configuration, never for sending. */
export function localModelOptions(
  catalogs: LocalAiCatalog[],
  selected?: { provider: LocalAiProvider; id: string }
): LocalAiModelOption[] {
  const result = new Map<string, LocalAiModelOption>()
  const add = (provider: LocalAiProvider, model: AiModel, available: boolean) => {
    const value = localModelValue(provider, model.id)
    const catalog = catalogs.find(item => item.provider === provider)
    const preset = provider === 'local' || provider === 'splash' ? defaults[provider] : undefined
    const name = catalog?.name ? `${model.name} (${catalog.name})` : model.id === preset?.id ? preset.name : `${model.name} (${provider === 'local' ? 'Strata' : provider === 'splash' ? 'Splash' : provider})`
    result.set(value, { ...model, provider, value, available, name: available ? name : `${name} · 연결/모델 확인 필요` })
  }
  for (const catalog of catalogs) {
    for (const model of catalog.registered ?? catalog.models) add(catalog.provider, model, !catalog.error && catalog.models.some(item => item.id === model.id))
    if (catalog.error && catalog.registered === undefined) {
      const model = selected?.provider === catalog.provider ? { id: selected.id, name: selected.id } : catalog.provider === 'local' || catalog.provider === 'splash' ? defaults[catalog.provider] : undefined
      if (model) add(catalog.provider, model, false)
    }
  }
  if (selected?.id && catalogs.some(catalog => catalog.provider === selected.provider && catalog.registered === undefined) && !result.has(localModelValue(selected.provider, selected.id))) {
    add(selected.provider, { id: selected.id, name: selected.id }, false)
  }
  return [...result.values()]
}
