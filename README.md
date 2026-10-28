# @msilabs/bkash

Server-side bKash Tokenized Checkout (v2) client for Node, Bun, Deno and edge runtimes. No runtime dependencies.

```ts
import { BkashClient } from '@msilabs/bkash'

const bkash = new BkashClient('primary', {
  sandbox: true,
  appKey: process.env.BKASH_APP_KEY!,
  appSecret: process.env.BKASH_APP_SECRET!,
  username: process.env.BKASH_USERNAME!,
  password: process.env.BKASH_PASSWORD!,
})

const payment = await bkash.createPayment(500, 'INV-1001', 'https://example.com/bkash/callback')

// redirect the customer to payment.redirectUrl()
```

## Features

- bKash **Tokenized Checkout v2** API
- Create, execute, query and search payments
- Full and partial **refunds**, plus refund status
- **Agreement** (one-click) payments
- Automatic token caching and refresh, with a lock hook against concurrent token requests
- A response object with `isCompleted()`, `redirectUrl()`, `errorMessage()` and Bangla error messages
- Optional API logging with secrets masked
- ESM and CommonJS builds, with TypeScript types

## Requirements

Node.js `^22.23.4`, `^24.22.1` or `>=26.12.1`. Older Node versions are end-of-life. The package uses only `fetch` and Web Crypto, so it also runs on Bun, Deno and edge runtimes.

## Installation

```bash
npm install @msilabs/bkash
```

## Quick Start

**1. Create the payment** and send the customer to bKash:

```ts
const payment = await bkash.createPayment(500, 'INV-1001', callbackUrl)

if (payment.failed()) {
  throw new Error(payment.errorMessage() ?? 'Could not create the payment.')
}

return redirect(payment.redirectUrl()!)
```

**2. Execute it in your callback.** bKash calls `callbackUrl` with `paymentID` and `status`:

```ts
if (status !== 'success') {
  // the customer cancelled or the payment failed
}

const result = await bkash.executePayment(paymentID)

if (result.isCompleted()) {
  // result.data.trxID, result.invoiceNumber()
}
```

Amounts can be a number or a string. They are sent with two decimals.

## Refund

```ts
const refund = await bkash.refund(paymentId, trxId, 50, 'Damaged item')
const status = await bkash.refundStatus(paymentId, trxId)
```

`refund()` takes an optional fifth argument, `sku` (default `'N/A'`).

## Query and Search

```ts
await bkash.queryPayment(paymentId)
await bkash.searchTransaction(trxId)
```

## Agreement (One-Click) Payments

With an agreement, a returning customer pays with only their PIN, with no OTP.

```ts
// 1. once per customer
const agreement = await bkash.createAgreement('01700000000', agreementCallbackUrl)
// redirect to agreement.redirectUrl()

// 2. in the callback, then store agreementID
const done = await bkash.executeAgreement(paymentID)

// 3. later payments
const payment = await bkash.createPaymentWithAgreement(agreementId, 200, 'INV-1002', callbackUrl)
// redirect to payment.redirectUrl(), then in the callback:
await bkash.executePaymentWithAgreement(paymentID, agreementId)

await bkash.queryAgreement(agreementId)
await bkash.cancelAgreement(agreementId)
```

## Multiple Merchants

A `BkashClient` is one merchant account. Create one per account:

```ts
const shop = new BkashClient('shop', shopCredentials)
const store = new BkashClient('store', storeCredentials)
```

Token cache keys include the account name, base URL, app key and username, so accounts never share tokens.

## Working with Responses

Every call returns a `BkashResponse`:

| Method | |
|---|---|
| `successful()` / `failed()` | The HTTP status and bKash status code say it worked or not |
| `isCompleted()` | The payment, agreement or refund reached `Completed` |
| `redirectUrl()` | The bKash payment page |
| `invoiceNumber()` | The merchant invoice number |
| `errorCode()`, `errorMessage()`, `errorMessageBn()` | Error details, `null` on success |
| `get('a.b', default)` | Read a nested value from `data` |
| `throw()` | Throw a `BkashError` if the call failed, otherwise return the response |
| `data`, `status` | The raw body and HTTP status |

bKash business errors (for example insufficient balance) come back as a failed response, not an exception.

## Error Handling

`BkashError` is thrown when the request itself cannot complete: a network failure or timeout, an invalid response, missing credentials, or a failed token request. It has `errorCode` and `response`.

```ts
import { BkashError } from '@msilabs/bkash'

try {
  const result = (await bkash.executePayment(paymentID)).throw()
} catch (error) {
  if (error instanceof BkashError) {
    console.error(error.errorCode, error.message)
  }
}
```

## Options

```ts
new BkashClient('primary', account, {
  timeoutMs: 30_000,
  urls: { sandbox: 'https://...', production: 'https://...' },
  cachePrefix: 'bkash',
  tokenStore,
  log: { enabled: true, logger: (message, context) => console.log(message, context) },
})
```

Account fields: `sandbox` (default `true`), `appKey`, `appSecret`, `username`, `password`, and an optional `baseUrl`.

## Token Store

Tokens are cached in memory by default. In a multi-process or serverless app, pass a shared store (Redis, KV, a database) so processes reuse one token:

```ts
import type { TokenStore } from '@msilabs/bkash'

const tokenStore: TokenStore = {
  get: async (key) => (await redis.get(key)) ?? undefined,
  set: async (key, value, ttlSeconds) => void (await redis.set(key, value, 'EX', ttlSeconds)),
  delete: async (key) => void (await redis.del(key)),
  // optional: serialise token requests across processes
  lock: async (key, seconds, fn) => withRedisLock(key, seconds, fn),
}
```

The client refreshes the token with the refresh token, falls back to a new grant, and retries once with a fresh token on HTTP 401.

## Logging

When `log.enabled` is true, each request and response goes to your `logger`. Credentials, tokens and customer wallet numbers are masked.

## Going Live

Set `sandbox: false` and use your production credentials.

## License

MIT
