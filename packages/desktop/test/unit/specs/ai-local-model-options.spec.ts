import { describe, expect, it } from 'vitest'
import { localModelOptions } from '@/util/localAiModels'

describe('unified local model choices', () => {
  it('keeps identical model IDs on different servers distinct', () => {
    const result = localModelOptions([
      { provider: 'local', models: [{ id: 'same', name: 'Same' }] },
      { provider: 'splash', models: [{ id: 'same', name: 'Same' }] }
    ])
    expect(result.map(m => m.value)).toEqual(['local:same', 'splash:same'])
    expect(result.map(m => m.name)).toEqual(['Same (Strata)', 'Same (Splash)'])
    expect(result.every(m => m.available)).toBe(true)
  })

  it('leaves another server usable when the selected server fails', () => {
    const result = localModelOptions([
      { provider: 'local', models: [], error: 'offline' },
      { provider: 'splash', models: [{ id: 'mlx-community/Qwen3.8-27B-4bit', name: 'Splash' }] }
    ], { provider: 'local', id: 'saved-model' })
    expect(result[0]).toMatchObject({ value: 'local:saved-model', available: false })
    expect(result[1]).toMatchObject({ value: 'splash:mlx-community/Qwen3.8-27B-4bit', available: true })
  })

  it('preserves an unavailable saved selection without picking a different model', () => {
    const result = localModelOptions([{ provider: 'local', models: [{ id: 'new-model', name: 'New' }] }], { provider: 'local', id: 'old-model' })
    expect(result.find(m => m.id === 'old-model')).toMatchObject({ available: false, value: 'local:old-model' })
    expect(result.find(m => m.id === 'new-model')).toMatchObject({ available: true })
  })

  it('never marks cached models available when both servers fail', () => {
    const result = localModelOptions([
      { provider: 'local', models: [{ id: 'cached-other', name: 'Cached' }], error: 'offline' },
      { provider: 'splash', models: [], error: 'offline' }
    ], { provider: 'local', id: 'saved-model' })
    expect(result.length).toBeGreaterThanOrEqual(2)
    expect(result.every(model => !model.available)).toBe(true)
    expect(result.some(model => model.value === 'local:saved-model')).toBe(true)
  })
})

it('lists only registered models and distinguishes a renamed custom server', () => {
  const result = localModelOptions([
    { provider: 'server-one', name: 'My server', registered: [{ id: 'same', name: 'My model' }, { id: 'offline', name: 'Unloaded' }], models: [{ id: 'same', name: 'same' }, { id: 'unregistered', name: 'Hidden' }] },
    { provider: 'splash', registered: [], models: [{ id: 'deleted', name: 'Deleted' }] }
  ], { provider: 'splash', id: 'deleted' })
  expect(result.map(model => model.value)).toEqual(['server-one:same', 'server-one:offline'])
  expect(result[0]).toMatchObject({ name: 'My model (My server)', available: true })
  expect(result[1].available).toBe(false)
})

it('does not restore a selection belonging to a removed server', () => {
  expect(localModelOptions([], { provider: 'server-deleted', id: 'saved' })).toEqual([])
})
