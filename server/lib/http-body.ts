import { Readable } from 'node:stream'

export function requestBodyStream(body: unknown): Readable {
  return Readable.fromWeb(body as import('node:stream/web').ReadableStream)
}