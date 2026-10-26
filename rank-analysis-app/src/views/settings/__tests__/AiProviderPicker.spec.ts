/**
 * AiProviderPicker：Claude 区域门控与 provider 持久化。
 * 地区不可用时 Claude 卡片置灰、点击不落盘；可用时点击写入 aiProvider 并切到 Anthropic Key 输入。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import naive from 'naive-ui'

vi.mock('@renderer/services/ipc', () => ({
  getConfigByIpc: vi.fn(),
  putConfigByIpc: vi.fn()
}))

const messageMock = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
  info: vi.fn()
}))
vi.mock('naive-ui', async importOriginal => {
  const actual = await importOriginal<typeof import('naive-ui')>()
  return { ...actual, useMessage: () => messageMock }
})

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))

import { getConfigByIpc, putConfigByIpc } from '@renderer/services/ipc'
import { invoke } from '@tauri-apps/api/core'
import AiProviderPicker from '../AiProviderPicker.vue'

const mockGetConfig = vi.mocked(getConfigByIpc)
const mockPutConfig = vi.mocked(putConfigByIpc)
const mockInvoke = vi.mocked(invoke)

async function mountWithRegion(
  region: { country: string | null; allowed: boolean },
  provider?: string
) {
  mockGetConfig.mockImplementation(async (key: string) =>
    key === 'aiProvider' ? provider : undefined
  )
  mockInvoke.mockResolvedValue({ ...region, error: null })
  const wrapper = mount(AiProviderPicker, { global: { plugins: [naive] } })
  await flushPromises()
  return wrapper
}

describe('AiProviderPicker', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPutConfig.mockResolvedValue(undefined)
  })

  it('should disable Claude and not save when region is blocked', async () => {
    const wrapper = await mountWithRegion({ country: 'CN', allowed: false })
    const claude = wrapper.find('.card--claude')

    expect(claude.classes()).toContain('is-disabled')
    expect(claude.text()).toContain('当前地区不可用 · CN')

    await claude.trigger('click')
    expect(mockPutConfig).not.toHaveBeenCalled()
    expect(messageMock.warning).toHaveBeenCalled()
  })

  it('should save provider and show Anthropic key input when Claude selected', async () => {
    const wrapper = await mountWithRegion({ country: 'US', allowed: true })
    const claude = wrapper.find('.card--claude')
    expect(claude.text()).toContain('可用 · US')

    await claude.trigger('click')
    await flushPromises()

    expect(mockPutConfig).toHaveBeenCalledWith('aiProvider', 'claude')
    expect(wrapper.find('.card--claude').classes()).toContain('is-active')
    expect(wrapper.text()).toContain('Anthropic API Key')
  })

  it('should warn about fallback when saved Claude but region now blocked', async () => {
    const wrapper = await mountWithRegion({ country: 'HK', allowed: false }, 'claude')
    expect(wrapper.text()).toContain('自动使用 DeepSeek')
  })

  it('should save custom provider and show its inputs when custom card clicked', async () => {
    const wrapper = await mountWithRegion({ country: 'CN', allowed: false })

    const custom = wrapper.find('.card--custom')
    expect(custom.exists()).toBe(true)
    await custom.trigger('click')
    await flushPromises()

    expect(mockPutConfig).toHaveBeenCalledWith('aiProvider', 'custom')
    expect(custom.classes()).toContain('is-active')
    expect(wrapper.text()).toContain('OpenAI 兼容 API 地址')
  })

  it('should restore custom inputs from saved config', async () => {
    mockGetConfig.mockImplementation(async (key: string) => {
      if (key === 'aiProvider') return 'custom'
      if (key === 'customBaseUrl') return 'https://api.example.com/v1'
      if (key === 'customApiKey') return 'sk-custom'
      if (key === 'customModel') return 'gpt-4o'
      return undefined
    })
    mockInvoke.mockResolvedValue({ country: 'CN', allowed: false, error: null })
    const wrapper = mount(AiProviderPicker, { global: { plugins: [naive] } })
    await flushPromises()

    expect(wrapper.find('.card--custom').classes()).toContain('is-active')
    const inputs = wrapper.findAll('input').map(i => (i.element as HTMLInputElement).value)
    expect(inputs).toContain('https://api.example.com/v1')
    expect(inputs).toContain('sk-custom')
    expect(inputs).toContain('gpt-4o')
  })
})
