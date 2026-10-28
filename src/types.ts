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

export type Amount = string | number

export interface CreatePaymentParams {
  amount: Amount
  invoiceNumber: string
  callbackUrl: string
  /** Defaults to `invoiceNumber`. */
  payerReference?: string
  /** Extra fields sent to bKash as they are, e.g. `subMerchantName`. */
  extra?: Record<string, unknown>
}

export interface CreateAgreementParams {
  payerReference: string
  callbackUrl: string
}

export interface CreatePaymentWithAgreementParams {
  agreementId: string
  amount: Amount
  invoiceNumber: string
  callbackUrl: string
  /** Extra fields sent to bKash as they are. */
  extra?: Record<string, unknown>
}

export interface PaymentWithAgreementParams {
  paymentId: string
  agreementId: string
}

export interface RefundParams {
  paymentId: string
  trxId: string
  amount: Amount
  reason: string
  /** Defaults to `'N/A'`. */
  sku?: string
}

export interface RefundStatusParams {
  paymentId: string
  trxId: string
}
