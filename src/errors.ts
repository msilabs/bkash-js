import type { BkashResponse } from './response'

export class BkashError extends Error {
  readonly errorCode: string | null
  readonly response: BkashResponse | null

  constructor(
    message: string,
    options: { errorCode?: string | null; response?: BkashResponse | null; cause?: unknown } = {},
  ) {
    super(message, { cause: options.cause })
    this.name = 'BkashError'
    this.errorCode = options.errorCode ?? null
    this.response = options.response ?? null
  }

  static fromResponse(response: BkashResponse): BkashError {
    let message = response.errorMessage() ?? 'bKash request failed.'
    const code = response.errorCode()

    if (code) {
      message = `[${code}] ${message}`
    }

    return new BkashError(message, { errorCode: code, response })
  }
}
