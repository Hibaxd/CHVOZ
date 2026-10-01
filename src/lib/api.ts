/**
 * Strukturovaná chyba vrácená backendem. Díky ní může každá obrazovka rozlišit
 * například neplatný formulář (400), chybějící přihlášení (401) nebo konflikt (409).
 */
export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly details?: unknown

  constructor(message: string, status: number, code = 'REQUEST_FAILED', details?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
  }
}

interface ErrorResponse {
  error?: {
    code?: string
    message?: string
    details?: unknown
  }
}

/**
 * Jednotný vstup pro komunikaci s API. Požadavky vždy posílají cookies stejného
 * webu, JSON těla automaticky dostanou správnou hlavičku a chyby mají jednotný typ.
 */
export async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers)
  headers.set('Accept', 'application/json')

  if (typeof options.body === 'string' && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  let response: Response
  try {
    response = await fetch(path, {
      ...options,
      headers,
      credentials: 'same-origin',
    })
  } catch {
    throw new ApiError('Server není dostupný. Zkus to prosím znovu.', 0, 'NETWORK_ERROR')
  }

  const contentType = response.headers.get('content-type') ?? ''
  const data = response.status === 204
    ? undefined
    : contentType.includes('application/json')
      ? await response.json().catch(() => undefined)
      : await response.text().catch(() => undefined)

  if (!response.ok) {
    const body = data && typeof data === 'object' ? data as ErrorResponse : undefined
    throw new ApiError(
      body?.error?.message || `Požadavek se nezdařil (${response.status}).`,
      response.status,
      body?.error?.code,
      body?.error?.details,
    )
  }

  return data as T
}
