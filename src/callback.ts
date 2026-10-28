export interface BkashCallback {
  /** `'success'`, `'failure'` or `'cancel'`. */
  status: string | null
  paymentId: string | null
  agreementId: string | null
}

/** A full or relative URL, `URL`, `URLSearchParams`, or a parsed query object such as Express `req.query`. */
export type BkashCallbackInput = string | URL | URLSearchParams | Record<string, unknown>

/** Read the query bKash sends to your callback URL. */
export function parseCallback(input: BkashCallbackInput): BkashCallback {
  const params = toSearchParams(input)
  const read = (...keys: string[]) => keys.map((key) => params.get(key)).find((value) => value) ?? null

  return {
    status: read('status'),
    paymentId: read('paymentId', 'paymentID'),
    agreementId: read('agreementId', 'agreementID'),
  }
}

function toSearchParams(input: BkashCallbackInput): URLSearchParams {
  if (input instanceof URLSearchParams) {
    return input
  }

  if (input instanceof URL) {
    return input.searchParams
  }

  if (typeof input === 'string') {
    const withoutHash = input.split('#')[0]!
    const queryStart = withoutHash.indexOf('?')

    return new URLSearchParams(queryStart === -1 ? withoutHash : withoutHash.slice(queryStart + 1))
  }

  const params = new URLSearchParams()

  for (const [key, value] of Object.entries(input)) {
    const first = Array.isArray(value) ? value[0] : value

    if (typeof first === 'string') {
      params.set(key, first)
    }
  }

  return params
}
