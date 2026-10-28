import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BkashClient, BkashError, MemoryTokenStore, type TokenStore } from '../src'

const SANDBOX = 'https://tokenized.sandbox.bka.sh/v2/tokenized-checkout'

const account = {
  appKey: 'primary-key',
  appSecret: 'primary-secret',
  username: 'primary-user',
  password: 'primary-pass',
}

const tokenBody = (idToken = 'test-token', refreshToken = 'test-refresh') => ({
  statusCode: '0000',
  id_token: idToken,
  refresh_token: refreshToken,
  expires_in: 3600,
})

class TestClient extends BkashClient {
  run(endpoint: string, payload: Record<string, unknown> = {}) {
    return this.call(endpoint, payload)
  }

  key(suffix: string) {
    return this.cacheKey(suffix)
  }
}

type Reply = { body: unknown; status?: number }

let replies: Record<string, Reply[]>
let calls: { endpoint: string; headers: Record<string, string>; body: any }[]

// Each endpoint replies in order; the last reply repeats.
function reply(endpoint: string, ...items: Reply[]) {
  replies[endpoint] = items
}

const callsTo = (endpoint: string) => calls.filter((c) => c.endpoint === endpoint)

beforeEach(() => {
  replies = {}
  calls = []

  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      const endpoint = url.replace(`${SANDBOX}/`, '')
      calls.push({ endpoint, headers: init.headers as Record<string, string>, body: JSON.parse(init.body as string) })

      const queue = replies[endpoint] ?? []
      const next = queue.length > 1 ? queue.shift() : queue[0]

      if (!next) {
        throw new Error(`No fake reply for ${endpoint}`)
      }

      return new Response(JSON.stringify(next.body), { status: next.status ?? 200 })
    }),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('token', () => {
  it('grants a token with credentials', async () => {
    reply('auth/grant-token', { body: tokenBody() })

    expect(await new BkashClient('primary', account).token()).toBe('test-token')

    const sent = calls[0]!
    expect(sent.endpoint).toBe('auth/grant-token')
    expect(sent.headers.username).toBe('primary-user')
    expect(sent.headers.password).toBe('primary-pass')
    expect(sent.headers.Authorization).toBeUndefined()
    expect(sent.body).toEqual({ app_key: 'primary-key', app_secret: 'primary-secret' })
  })

  it('caches the token', async () => {
    reply('auth/grant-token', { body: tokenBody() })
    const client = new BkashClient('primary', account)

    await client.token()
    await client.token()

    expect(calls).toHaveLength(1)
  })

  it('fresh token skips the cache', async () => {
    reply('auth/grant-token', { body: tokenBody() })
    const client = new BkashClient('primary', account)

    await client.token()
    await client.token(true)

    expect(calls).toHaveLength(2)
  })

  it('shares one request between concurrent callers', async () => {
    reply('auth/grant-token', { body: tokenBody() })
    const client = new BkashClient('primary', account)

    const tokens = await Promise.all([client.token(), client.token(), client.token()])

    expect(tokens).toEqual(['test-token', 'test-token', 'test-token'])
    expect(calls).toHaveLength(1)
  })

  it('caches the id token for expires_in minus 5 minutes', async () => {
    vi.useFakeTimers()
    reply('auth/grant-token', { body: tokenBody('first') })
    reply('auth/refresh-token', { body: tokenBody('second') })
    const client = new BkashClient('primary', account)

    try {
      await client.token()
      vi.advanceTimersByTime((3600 - 300 - 1) * 1000)
      expect(await client.token()).toBe('first')

      vi.advanceTimersByTime(2000)
      expect(await client.token()).toBe('second')
    } finally {
      vi.useRealTimers()
    }
  })

  it('uses the refresh token when the id token expired', async () => {
    reply('auth/grant-token', { body: tokenBody('first-token', 'first-refresh') })
    reply('auth/refresh-token', { body: tokenBody('refreshed-token', 'second-refresh') })
    const store = new MemoryTokenStore()
    const client = new TestClient('primary', account, { tokenStore: store })

    await client.token()
    await store.delete(await client.key('id_token'))

    expect(await client.token()).toBe('refreshed-token')
    expect(callsTo('auth/refresh-token')[0]!.body.refresh_token).toBe('first-refresh')
    expect(await store.get(await client.key('refresh_token'))).toBe('second-refresh')
  })

  it('falls back to grant when refresh fails', async () => {
    reply('auth/grant-token', { body: tokenBody('first-token') }, { body: tokenBody('second-token') })
    reply('auth/refresh-token', { body: { statusCode: '2079', statusMessage: 'Invalid refresh token' } })
    const store = new MemoryTokenStore()
    const client = new TestClient('primary', account, { tokenStore: store })

    await client.token()
    await store.delete(await client.key('id_token'))

    expect(await client.token()).toBe('second-token')
    expect(callsTo('auth/refresh-token')).toHaveLength(1)
  })

  it('throws and clears cached tokens when the token request fails', async () => {
    reply('auth/grant-token', { body: { statusCode: '2001', statusMessage: 'Invalid App Key' } })
    const store = new MemoryTokenStore()
    const client = new TestClient('primary', account, { tokenStore: store })
    await store.set(await client.key('refresh_token'), 'stale-refresh', 100)

    const error = await client.token(true).catch((e) => e)

    expect(error).toBeInstanceOf(BkashError)
    expect(error.errorCode).toBe('2001')
    expect(error.message).toContain('Invalid App Key')
    expect(await store.get(await client.key('refresh_token'))).toBeUndefined()
  })

  it('throws when a credential is missing', async () => {
    const client = new BkashClient('primary', { ...account, appKey: '' })

    await expect(client.token()).rejects.toThrow('bKash account [primary] is missing [app_key].')
    expect(calls).toHaveLength(0)
  })

  it('throws when credential keys are absent', async () => {
    const client = new BkashClient('custom', { sandbox: true })

    await expect(client.token()).rejects.toThrow('bKash account [custom] is missing [app_key].')
  })

  it('forgetToken clears the cache', async () => {
    reply('auth/grant-token', { body: tokenBody() })
    const client = new BkashClient('primary', account)

    await client.token()
    await client.forgetToken()
    await client.token()

    expect(calls).toHaveLength(2)
  })

  it('fetches the token inside the store lock when the store has one', async () => {
    reply('auth/grant-token', { body: tokenBody() })
    const memory = new MemoryTokenStore()
    const lock = vi.fn((_key: string, _seconds: number, fn: () => Promise<unknown>) => fn())
    const store: TokenStore = {
      get: (key) => memory.get(key),
      set: (key, value, ttl) => memory.set(key, value, ttl),
      delete: (key) => memory.delete(key),
      lock: lock as TokenStore['lock'],
    }

    await new BkashClient('primary', account, { tokenStore: store, timeoutMs: 30_000 }).token()

    expect(lock).toHaveBeenCalledOnce()
    expect(lock.mock.calls[0]![0]).toMatch(/\.lock$/)
    expect(lock.mock.calls[0]![1]).toBe(65)
  })

  it('does not reuse a token after credentials change', async () => {
    reply('auth/grant-token', { body: tokenBody('token-a') }, { body: tokenBody('token-b') })
    const store = new MemoryTokenStore()

    const a = new BkashClient('primary', account, { tokenStore: store })
    const b = new BkashClient('primary', { ...account, appKey: 'other-key' }, { tokenStore: store })

    expect(await a.token()).toBe('token-a')
    expect(await b.token()).toBe('token-b')
  })

  it('builds cache keys from prefix, account and a credential hash', async () => {
    const key = await new TestClient('primary', account, { cachePrefix: 'shop' }).key('id_token')

    expect(key).toMatch(/^shop\.primary\.[0-9a-f]{16}\.id_token$/)
  })
})

describe('request pipeline', () => {
  it('sends the raw token and app key without Bearer', async () => {
    reply('auth/grant-token', { body: tokenBody() })
    reply('payment/execute', { body: { statusCode: '0000' } })

    await new TestClient('primary', account).run('payment/execute', { paymentId: 'P1' })

    const sent = callsTo('payment/execute')[0]!
    expect(sent.headers.Authorization).toBe('test-token')
    expect(sent.headers['X-App-Key']).toBe('primary-key')
    expect(sent.body).toEqual({ paymentId: 'P1' })
  })

  it('retries once with a fresh token on 401', async () => {
    reply('auth/grant-token', { body: tokenBody('old-token') }, { body: tokenBody('new-token') })
    reply('payment/execute', { body: {}, status: 401 }, { body: { statusCode: '0000' } })

    const response = await new TestClient('primary', account).run('payment/execute')

    expect(response.successful()).toBe(true)
    expect(callsTo('payment/execute').map((c) => c.headers.Authorization)).toEqual(['old-token', 'new-token'])
  })

  it('does not retry a second 401', async () => {
    reply('auth/grant-token', { body: tokenBody() })
    reply('payment/execute', { body: {}, status: 401 })

    const response = await new TestClient('primary', account).run('payment/execute')

    expect(response.status).toBe(401)
    expect(callsTo('payment/execute')).toHaveLength(2)
  })

  it('does not throw on bKash business errors', async () => {
    reply('auth/grant-token', { body: tokenBody() })
    reply('payment/execute', { body: { statusCode: '2023', statusMessage: 'Insufficient Balance' } })

    const response = await new TestClient('primary', account).run('payment/execute')

    expect(response.failed()).toBe(true)
    expect(response.errorCode()).toBe('2023')
  })

  it('throws on a non-JSON body', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response('<html>', { status: 502 }))

    await expect(new BkashClient('primary', account).token()).rejects.toThrow(
      'Invalid response from bKash [auth/grant-token] with HTTP status 502.',
    )
  })

  it('wraps network errors and keeps the cause', async () => {
    const cause = new Error('socket hang up')
    vi.mocked(fetch).mockRejectedValueOnce(cause)

    const error = await new BkashClient('primary', account).token().catch((e) => e)

    expect(error).toBeInstanceOf(BkashError)
    expect(error.message).toBe('Could not connect to bKash [auth/grant-token]: socket hang up')
    expect(error.cause).toBe(cause)
  })

  it('uses the production URL or a custom base URL', async () => {
    const urls: string[] = []
    vi.mocked(fetch).mockImplementation(async (url) => {
      urls.push(String(url))
      return new Response(JSON.stringify(tokenBody()))
    })

    await new BkashClient('a', { ...account, sandbox: false }).token()
    await new BkashClient('b', { ...account, baseUrl: 'https://example.test/v2/' }).token()

    expect(urls).toEqual([
      'https://tokenized.pay.bka.sh/v2/tokenized-checkout/auth/grant-token',
      'https://example.test/v2/tokenized-checkout/auth/grant-token',
    ])
  })

  it('logs masked data only when enabled', async () => {
    reply('auth/grant-token', { body: tokenBody() })
    reply('payment/execute', { body: { statusCode: '0000', customerMsisdn: '01712345678' } })
    const logger = vi.fn()

    await new TestClient('primary', account, { log: { enabled: true, logger } }).run('payment/execute', {
      customerMsisdn: '01712345678',
    })

    expect(logger.mock.calls.map(([message]) => message)).toEqual([
      'bKash [primary] auth/grant-token',
      'bKash [primary] payment/execute',
    ])

    const logged = JSON.stringify(logger.mock.calls)
    for (const secret of ['primary-secret', 'primary-pass', 'primary-user', 'test-token', 'test-refresh', '01712345678']) {
      expect(logged).not.toContain(secret)
    }
    expect(logged).toContain('*******5678')

    const silent = vi.fn()
    await new TestClient('primary', account, { log: { enabled: false, logger: silent } }).run('payment/execute')
    expect(silent).not.toHaveBeenCalled()
  })
})
