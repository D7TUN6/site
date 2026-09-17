import { Agent } from 'node:http'
import { Agent as HttpsAgent } from 'node:https'

const httpAgent = new Agent({ keepAlive: true, maxSockets: 20 })
const httpsAgent = new HttpsAgent({ keepAlive: true, maxSockets: 20 })

const httpOptions = { agent: { http: httpAgent, https: httpsAgent } } as const

export function serverFetch(url: string, init?: RequestInit): Promise<Response> {
  return fetch(url, { ...init, ...httpOptions } as unknown as RequestInit)
}
