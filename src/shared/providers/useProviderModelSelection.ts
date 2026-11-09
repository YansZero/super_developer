import { useEffect, useState } from 'react'
import type { ProviderId } from '../types/domain'
import { fetchProviderModelCatalog } from '../../features/projects/detail/providerModelClient'
import type { ProviderModelCatalog } from '../../features/projects/detail/providerModelClient'

export function useProviderModelSelection(initialProviderId: ProviderId = 'antigravity') {
  const [selectedProviderId, setSelectedProviderId] = useState<ProviderId>(initialProviderId)
  const [providerModelCatalog, setProviderModelCatalog] = useState<ProviderModelCatalog>({
    providerId: 'antigravity',
    source: 'default',
    models: [{ id: 'default', label: 'common.cliDefault', efforts: [] }],
    message: 'common.loadingAvailableModelsForThisProvider',
  })
  const [selectedModelId, setSelectedModelId] = useState('default')
  const [selectedEffort, setSelectedEffort] = useState('default')
  const [providerModelError, setProviderModelError] = useState<string | null>(null)
  const [providerModelLoading, setProviderModelLoading] = useState(true)

  useEffect(() => {
    const controller = new AbortController()
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setProviderModelLoading(true)
    setProviderModelError(null)
    fetchProviderModelCatalog(selectedProviderId, controller.signal)
      .then((catalog) => {
        setProviderModelCatalog(catalog)
        setSelectedModelId('default')
        setSelectedEffort('default')
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setProviderModelError(error instanceof Error ? error.message : '無法載入模型選項。')
        setProviderModelCatalog({
          providerId: selectedProviderId,
          source: 'default',
          models: [{ id: 'default', label: 'common.cliDefault', efforts: [] }],
          message: 'common.unableToLoadModelListUsingCliDefault',
        })
        setSelectedModelId('default')
        setSelectedEffort('default')
      })
      .finally(() => {
        if (!controller.signal.aborted) setProviderModelLoading(false)
      })
    return () => controller.abort()
  }, [selectedProviderId])

  return {
    selectedProviderId,
    setSelectedProviderId,
    providerModelCatalog,
    selectedModelId,
    setSelectedModelId,
    selectedEffort,
    setSelectedEffort,
    providerModelError,
    providerModelLoading,
    setProviderModelLoading,
  }
}

export type ProviderModelSelection = ReturnType<typeof useProviderModelSelection>
