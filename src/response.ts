import { BkashError } from './errors'
import { formatAmount } from './mask'

type Data = Record<string, any>

export class BkashResponse {
  constructor(
    readonly data: Data,
    readonly status: number = 200,
  ) {}

  successful(): boolean {
    if (this.status < 200 || this.status >= 300) {
      return false
    }

    if (this.data.externalCode != null || this.data.errorCode != null) {
      return false
    }

    const statusCode = this.data.statusCode
    if (statusCode != null && statusCode !== '0000' && statusCode !== 0) {
      return false
    }

    return true
  }

  failed(): boolean {
    return !this.successful()
  }

  isCompleted(): boolean {
    if (this.failed()) {
      return false
    }

    const status =
      this.data.transactionStatus ?? this.data.agreementStatus ?? this.data.refundTransactionStatus

    return status === 'Completed'
  }

  errorCode(): string | null {
    if (this.successful()) {
      return null
    }

    const code = this.data.externalCode ?? this.data.errorCode ?? this.data.statusCode

    return code != null ? String(code) : String(this.status)
  }

  errorMessage(): string | null {
    if (this.successful()) {
      return null
    }

    return (
      this.data.errorMessageEn ??
      this.data.errorMessage ??
      this.data.statusMessage ??
      `bKash request failed with HTTP status ${this.status}.`
    )
  }

  errorMessageBn(): string | null {
    return this.successful() ? null : (this.data.errorMessageBn ?? null)
  }

  redirectUrl(): string | null {
    return this.data.bkashURL ?? this.data.bKashURL ?? null
  }

  invoiceNumber(): string | null {
    return this.data.merchantInvoiceNumber ?? this.data.merchantInvoice ?? null
  }

  paymentId(): string | null {
    return this.data.paymentId ?? this.data.paymentID ?? null
  }

  trxId(): string | null {
    return this.data.trxId ?? this.data.trxID ?? null
  }

  agreementId(): string | null {
    return this.data.agreementId ?? this.data.agreementID ?? null
  }

  amount(): string | null {
    return this.data.amount != null ? String(this.data.amount) : null
  }

  /** True when bKash reports the same amount, so "500", 500 and "500.00" all match. */
  amountMatches(expected: string | number): boolean {
    const actual = this.amount()

    if (actual == null) {
      return false
    }

    try {
      return formatAmount(actual) === formatAmount(expected)
    } catch {
      return false
    }
  }

  get<T = unknown>(path: string, defaultValue?: T): T | undefined {
    let current: any = this.data

    for (const segment of path.split('.')) {
      if (current == null || typeof current !== 'object' || !(segment in current)) {
        return defaultValue
      }
      current = current[segment]
    }

    return current as T
  }

  throw(): this {
    if (this.failed()) {
      throw BkashError.fromResponse(this)
    }

    return this
  }

  toJSON(): Data {
    return this.data
  }
}
