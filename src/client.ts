import { BkashError } from './errors'
import { formatAmount, mask } from './mask'
import { BkashResponse } from './response'
import { MemoryTokenStore, type TokenStore } from './token-store'
import type {
  BkashAccount,
  BkashClientOptions,
  CreateAgreementParams,
  CreatePaymentParams,
  CreatePaymentWithAgreementParams,
  PaymentWithAgreementParams,
  RefundParams,
  RefundStatusParams,
} from './types'

export const DEFAULT_URLS = {
  sandbox: 'https://tokenized.sandbox.bka.sh/v2',
  production: 'https://tokenized.pay.bka.sh/v2',
}

const DEFAULT_TIMEOUT_MS = 30_000
const REFRESH_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 29

export class BkashClient {
  protected readonly store: TokenStore
  protected readonly timeoutMs: number
  private identity: Promise<string> | null = null
  private inflight = new Map<'normal' | 'fresh', Promise<string>>()

  constructor(
    protected readonly accountName: string,
    protected readonly account: BkashAccount,
    protected readonly options: BkashClientOptions = {},
  ) {
    this.store = options.tokenStore ?? new MemoryTokenStore()
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  }

  name(): string {
    return this.accountName
  }

  isSandbox(): boolean {
    return this.account.sandbox ?? true
  }

  baseUrl(): string {
    const urls = { ...DEFAULT_URLS, ...this.options.urls }
    const url = this.account.baseUrl ?? (this.isSandbox() ? urls.sandbox : urls.production)

    return url.replace(/\/+$/, '')
  }

  /*
   * Payment (without agreement)
   */

  createPayment(params: CreatePaymentParams): Promise<BkashResponse> {
    return this.call('payment/create', {
      payerReference: params.payerReference ?? params.invoiceNumber,
      callbackURL: params.callbackUrl,
      amount: formatAmount(params.amount),
      currency: 'BDT',
      intent: 'sale',
      merchantInvoiceNumber: params.invoiceNumber,
      ...params.extra,
    })
  }

  executePayment(paymentId: string): Promise<BkashResponse> {
    return this.call('payment/execute', { paymentId })
  }

  /** Execute the payment, and ask bKash for its real status if execute fails or times out. */
  confirmPayment(paymentId: string): Promise<BkashResponse> {
    return this.confirm(paymentId, () => this.executePayment(paymentId))
  }

  /*
   * Agreement (one-click payment)
   */

  createAgreement(params: CreateAgreementParams): Promise<BkashResponse> {
    return this.call('agreement/create', {
      payerReference: params.payerReference,
      callbackURL: params.callbackUrl,
    })
  }

  executeAgreement(agreementId: string): Promise<BkashResponse> {
    return this.call('agreement/execute', { agreementId })
  }

  queryAgreement(agreementId: string): Promise<BkashResponse> {
    return this.call('query/agreement', { agreementId })
  }

  cancelAgreement(agreementId: string): Promise<BkashResponse> {
    return this.call('agreement/cancel', { agreementId })
  }

  createPaymentWithAgreement(params: CreatePaymentWithAgreementParams): Promise<BkashResponse> {
    return this.call('payment-with-agreement/create', {
      agreementId: params.agreementId,
      callbackURL: params.callbackUrl,
      amount: formatAmount(params.amount),
      currency: 'BDT',
      intent: 'sale',
      merchantInvoiceNumber: params.invoiceNumber,
      ...params.extra,
    })
  }

  executePaymentWithAgreement(params: PaymentWithAgreementParams): Promise<BkashResponse> {
    return this.call('payment-with-agreement/execute', {
      paymentId: params.paymentId,
      agreementId: params.agreementId,
    })
  }

  /** Like `confirmPayment()`, for a payment made with an agreement. */
  confirmPaymentWithAgreement(params: PaymentWithAgreementParams): Promise<BkashResponse> {
    return this.confirm(params.paymentId, () => this.executePaymentWithAgreement(params))
  }

  /*
   * Query & Search
   */

  queryPayment(paymentId: string): Promise<BkashResponse> {
    return this.call('query/payment', { paymentId })
  }

  searchTransaction(trxId: string): Promise<BkashResponse> {
    return this.call('general/search-transaction', { trxId })
  }

  /*
   * Refund
   */

  refund(params: RefundParams): Promise<BkashResponse> {
    return this.call('refund/payment/transaction', {
      paymentId: params.paymentId,
      trxId: params.trxId,
      refundAmount: formatAmount(params.amount),
      sku: params.sku ?? 'N/A',
      reason: params.reason,
    })
  }

  refundStatus(params: RefundStatusParams): Promise<BkashResponse> {
    return this.call('refund/payment/status', { paymentId: params.paymentId, trxId: params.trxId })
  }

  // A timed-out or failed execute may still have taken the money, so the query result decides.
  private async confirm(paymentId: string, execute: () => Promise<BkashResponse>): Promise<BkashResponse> {
    let executed: BkashResponse | null = null

    try {
      executed = await execute()

      if (executed.isCompleted()) {
        return executed
      }
    } catch (error) {
      if (!(error instanceof BkashError)) {
        throw error
      }
    }

    const queried = await this.queryPayment(paymentId)

    // Keep the execute error (e.g. insufficient balance) unless the query shows the payment went through.
    return queried.isCompleted() || !executed ? queried : executed
  }

  /*
   * Token
   */

  async token(fresh = false): Promise<string> {
    if (!fresh) {
      const cached = await this.store.get(await this.cacheKey('id_token'))

      if (cached) {
        return cached
      }
    }

    // Concurrent callers share one request instead of each granting a token.
    const mode = fresh ? 'fresh' : 'normal'
    let pending = this.inflight.get(mode)

    if (!pending) {
      pending = this.lockedObtainToken(fresh).finally(() => this.inflight.delete(mode))
      this.inflight.set(mode, pending)
    }

    return pending
  }

  async forgetToken(): Promise<void> {
    await this.store.delete(await this.cacheKey('id_token'))
    await this.store.delete(await this.cacheKey('refresh_token'))
  }

  private async lockedObtainToken(fresh: boolean): Promise<string> {
    const obtain = async () => {
      // Another process may have fetched a token while we waited for the lock.
      if (!fresh) {
        const cached = await this.store.get(await this.cacheKey('id_token'))

        if (cached) {
          return cached
        }
      }

      return this.obtainToken(fresh)
    }

    if (!this.store.lock) {
      return obtain()
    }

    // Refresh and grant may both run while the lock is held, so it must outlive two HTTP timeouts.
    const seconds = Math.ceil(this.timeoutMs / 1000) * 2 + 5

    return this.store.lock(await this.cacheKey('lock'), seconds, obtain)
  }

  private async obtainToken(fresh: boolean): Promise<string> {
    const refreshToken = fresh ? undefined : await this.store.get(await this.cacheKey('refresh_token'))

    let response: BkashResponse | null = null

    if (refreshToken) {
      try {
        response = await this.requestToken('auth/refresh-token', { refresh_token: refreshToken })
      } catch (error) {
        // A network error on refresh should not block a new grant.
        if (!(error instanceof BkashError) || error.response) {
          throw error
        }
      }
    }

    if (!response || response.failed() || !response.data.id_token) {
      response = await this.requestToken('auth/grant-token')
    }

    if (response.failed() || !response.data.id_token) {
      // A bKash outage (5xx) says nothing about the cached refresh token, so keep it.
      if (response.status >= 500) {
        await this.store.delete(await this.cacheKey('id_token'))
      } else {
        await this.forgetToken()
      }

      throw new BkashError(
        `Unable to get bKash token for account [${this.accountName}]: ${response.errorMessage()}`,
        { errorCode: response.errorCode(), response },
      )
    }

    const idToken: string = response.data.id_token
    const expiresIn = Number(response.data.expires_in ?? 3600)
    const ttl = Math.max(60, (Number.isFinite(expiresIn) ? expiresIn : 0) - 300)

    await this.store.set(await this.cacheKey('id_token'), idToken, ttl)

    if (response.data.refresh_token) {
      await this.store.set(await this.cacheKey('refresh_token'), response.data.refresh_token, REFRESH_TOKEN_TTL_SECONDS)
    }

    return idToken
  }

  private async requestToken(endpoint: string, payload: Record<string, unknown> = {}): Promise<BkashResponse> {
    const credentials = {
      app_key: this.account.appKey,
      app_secret: this.account.appSecret,
      username: this.account.username,
      password: this.account.password,
    }

    for (const [key, value] of Object.entries(credentials)) {
      if (!value) {
        throw new BkashError(`bKash account [${this.accountName}] is missing [${key}].`)
      }
    }

    return this.send(
      endpoint,
      { app_key: credentials.app_key, app_secret: credentials.app_secret, ...payload },
      { username: credentials.username, password: credentials.password },
    )
  }

  /*
   * HTTP
   */

  /** Send an authorized request. Retries once with a fresh token on HTTP 401. */
  protected async call(endpoint: string, payload: Record<string, unknown>): Promise<BkashResponse> {
    let response = await this.send(endpoint, payload, this.authHeaders(await this.token()))

    if (response.status === 401) {
      response = await this.send(endpoint, payload, this.authHeaders(await this.token(true)))
    }

    return response
  }

  private authHeaders(token: string): Record<string, string> {
    return {
      Authorization: token,
      'X-App-Key': this.account.appKey,
    }
  }

  private async send(
    endpoint: string,
    payload: Record<string, unknown>,
    headers: Record<string, string>,
  ): Promise<BkashResponse> {
    const url = `${this.baseUrl()}/tokenized-checkout/${endpoint}`

    let status: number
    let body: string

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...headers },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(this.timeoutMs),
      })

      status = response.status
      body = await response.text()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)

      this.log(endpoint, headers, payload, null, message)

      throw new BkashError(`Could not connect to bKash [${endpoint}]: ${message}`, { cause: error })
    }

    let data: unknown

    try {
      data = JSON.parse(body)
    } catch {
      data = null
    }

    const isObject = typeof data === 'object' && data !== null && !Array.isArray(data)

    this.log(endpoint, headers, payload, status, isObject ? (data as Record<string, unknown>) : body)

    if (!isObject) {
      throw new BkashError(`Invalid response from bKash [${endpoint}] with HTTP status ${status}.`)
    }

    return new BkashResponse(data as Record<string, unknown>, status)
  }

  private log(
    endpoint: string,
    headers: Record<string, string>,
    payload: Record<string, unknown>,
    status: number | null,
    response: Record<string, unknown> | string,
  ): void {
    const { enabled, logger } = this.options.log ?? {}

    if (!enabled || !logger) {
      return
    }

    logger(`bKash [${this.accountName}] ${endpoint}`, {
      url: `${this.baseUrl()}/tokenized-checkout/${endpoint}`,
      headers: mask(headers),
      request: mask(payload),
      status,
      response: typeof response === 'string' ? response : mask(response),
    })
  }

  /*
   * Cache key: changing base URL, app key or username never reuses a stale token.
   */

  protected cacheKey(suffix: string): Promise<string> {
    this.identity ??= sha256Hex(
      `${this.baseUrl()}|${this.account.appKey}|${this.account.username}`,
    ).then((hash) => hash.slice(0, 16))

    const prefix = this.options.cachePrefix ?? 'bkash'

    return this.identity.then((identity) => `${prefix}.${this.accountName}.${identity}.${suffix}`)
  }
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))

  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}
