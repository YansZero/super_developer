import { getStoredLocale } from './i18nContext'

export function localAgentFetch(fetcher: typeof fetch = fetch): typeof fetch {
  return (input, init) => {
    const rawHeaders = init?.headers ?? (input instanceof Request ? input.headers : undefined)
    if (rawHeaders instanceof Headers) {
      const headers = new Headers(rawHeaders)
      headers.set('Accept-Language', getStoredLocale())
      return fetcher(input, { ...init, headers })
    }
    if (Array.isArray(rawHeaders)) {
      const headers: [string, string][] = [
        ...(rawHeaders as [string, string][]),
        ['Accept-Language', getStoredLocale()],
      ]
      return fetcher(input, { ...init, headers })
    }
    const headers: Record<string, string> = {
      ...(rawHeaders as Record<string, string> | undefined),
      'Accept-Language': getStoredLocale(),
    }
    return fetcher(input, { ...init, headers })
  }
}
