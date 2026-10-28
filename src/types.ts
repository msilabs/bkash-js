import type { TokenStore } from './token-store'

export interface BkashAccount {
  sandbox?: boolean
  appKey: string
  appSecret: string
  username: string
  password: string
  baseUrl?: string
}

export interface BkashLogOptions {
  enabled?: boolean
  logger?: (message: string, context: unknown) => void
}

export interface BkashClientOptions {
  urls?: { sandbox?: string; production?: string }
  timeoutMs?: number
  tokenStore?: TokenStore
  cachePrefix?: string
  log?: BkashLogOptions
}
