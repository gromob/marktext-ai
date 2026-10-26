import axios, { isAxiosError } from 'axios'
import { Readable } from 'node:stream'

type LocalHttpOptions = {
  method: 'GET' | 'POST'
  headers: Record<string, string>
  body?: string
  signal: AbortSignal
}

export class LocalHttpError extends Error {
  constructor(readonly code?: string) { super('Local AI HTTP transport failed.') }
}

export async function requestLocalHttp(url: string, options: LocalHttpOptions): Promise<Response> {
  const response = await axios.request<Readable>({
    url,
    method: options.method,
    headers: options.headers,
    data: options.body,
    signal: options.signal,
    // Node fetch has a separate five-minute header/body deadline. The caller's
    // AbortSignal owns the full request deadline, including streamed body reads.
    adapter: 'http',
    timeout: 0,
    responseType: 'stream',
    proxy: false,
    // Never forward credentials or document text to a redirected host.
    maxRedirects: 0,
    validateStatus: () => true
  }).catch((cause: unknown) => {
    // Axios errors contain request headers; retain only the diagnostic code.
    if (isAxiosError(cause)) throw new LocalHttpError(cause.code)
    throw cause
  })
  if ([204, 205, 304].includes(response.status)) {
    response.data.destroy()
    return new Response(null, { status: response.status })
  }
  return new Response(Readable.toWeb(response.data) as ReadableStream<Uint8Array>, { status: response.status })
}
