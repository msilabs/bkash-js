<p align="center">
  <a href="https://www.npmjs.com/package/@msilabs/bkash"><img src="https://img.shields.io/npm/dm/@msilabs/bkash" alt="Monthly Downloads"></a>
  <a href="https://www.npmjs.com/package/@msilabs/bkash"><img src="https://img.shields.io/npm/v/@msilabs/bkash" alt="Latest Stable Version"></a>
  <a href="https://github.com/msilabs/bkash-js/actions/workflows/tests.yml"><img src="https://github.com/msilabs/bkash-js/actions/workflows/tests.yml/badge.svg?branch=main" alt="Tests"></a>
  <a href="https://www.npmjs.com/package/@msilabs/bkash"><img src="https://img.shields.io/npm/l/@msilabs/bkash" alt="License"></a>
  <a href="https://github.com/msilabs/bkash-js"><img src="https://img.shields.io/github/stars/msilabs/bkash-js" alt="GitHub Stars"></a>
</p>

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
- Works with any server-side framework: Express, NestJS, Next.js, Nuxt, SvelteKit, Hono, Cloudflare Workers and more

## Requirements

Node.js 22 or newer. The package uses only `fetch` and Web Crypto, so it also runs on Bun, Deno and edge runtimes.

Use it on the server only. It needs your app secret and password, so never import it in browser, mobile or desktop client code.

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

**2. Execute it in your callback.** bKash calls `callbackUrl` with `paymentId` and `status`:

```ts
if (status !== 'success') {
  // the customer cancelled or the payment failed
}

// a timeout does not mean the payment failed: ask bKash before deciding
const result = await bkash.executePayment(paymentId).catch(() => bkash.queryPayment(paymentId))

if (result.isCompleted()) {
  // result.data.trxId, result.invoiceNumber()
}
```

Store the `paymentId` when you create the payment and look the order up by it in the callback. Never trust the amount or invoice number from the callback URL. Use `queryPayment()` to reconcile orders left pending when a customer closed the browser before the callback.

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

// 2. in the callback (query has agreementId and status), then store done.data.agreementId
const done = await bkash.executeAgreement(agreementId)

// 3. later payments
const payment = await bkash.createPaymentWithAgreement(agreementId, 200, 'INV-1002', callbackUrl)
// redirect to payment.redirectUrl(), then in the callback:
await bkash.executePaymentWithAgreement(paymentId, agreementId)

await bkash.queryAgreement(agreementId)
await bkash.cancelAgreement(agreementId)
```

## Using with Frameworks

The client has no framework code. Create it once in a shared module and call it from your routes:

```ts
// lib/bkash.ts
import { BkashClient } from '@msilabs/bkash'

export const bkash = new BkashClient('primary', {
  sandbox: process.env.BKASH_SANDBOX !== 'false',
  appKey: process.env.BKASH_APP_KEY!,
  appSecret: process.env.BKASH_APP_SECRET!,
  username: process.env.BKASH_USERNAME!,
  password: process.env.BKASH_PASSWORD!,
})

export async function confirmPayment(paymentId: string, status: string): Promise<boolean> {
  if (status !== 'success') {
    return false
  }

  const result = await bkash.executePayment(paymentId).catch(() => bkash.queryPayment(paymentId))

  // mark the order paid here when result.isCompleted()
  return result.isCompleted()
}
```

### Express

```ts
import express from 'express'
import { bkash, confirmPayment } from './lib/bkash'

const app = express()

app.post('/checkout/:orderId', async (req, res) => {
  const order = await findOrder(req.params.orderId)
  const payment = await bkash.createPayment(order.total, order.invoice, 'https://example.com/bkash/callback')

  if (payment.failed()) {
    return res.status(502).send(payment.errorMessage())
  }

  await saveBkashPaymentId(order, payment.data.paymentId)
  res.redirect(303, payment.redirectUrl()!)
})

app.get('/bkash/callback', async (req, res) => {
  const paid = await confirmPayment(String(req.query.paymentId), String(req.query.status))

  res.redirect(paid ? '/orders/thank-you' : '/orders/failed')
})
```

Fastify, Koa, Hapi and NestJS work the same way: read `paymentId` and `status` from the callback query and call `confirmPayment()`.

### Next.js (App Router)

```ts
// app/bkash/callback/route.ts
import { redirect } from 'next/navigation'
import { confirmPayment } from '@/lib/bkash'

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams
  const paid = await confirmPayment(params.get('paymentId') ?? '', params.get('status') ?? '')

  redirect(paid ? '/orders/thank-you' : '/orders/failed')
}
```

Call the client only from Route Handlers, Server Actions and Server Components. Adding `import 'server-only'` to `lib/bkash.ts` makes the build fail if a client component imports it.

### Hono on Cloudflare Workers

Workers have no `process.env`, and each isolate has its own memory, so build the client from `env` and keep tokens in KV:

```ts
import { Hono } from 'hono'
import { BkashClient, type TokenStore } from '@msilabs/bkash'

type Env = {
  BKASH_APP_KEY: string
  BKASH_APP_SECRET: string
  BKASH_USERNAME: string
  BKASH_PASSWORD: string
  BKASH_TOKENS: KVNamespace
}

function bkash(env: Env): BkashClient {
  const tokenStore: TokenStore = {
    get: async (key) => (await env.BKASH_TOKENS.get(key)) ?? undefined,
    set: (key, value, ttlSeconds) => env.BKASH_TOKENS.put(key, value, { expirationTtl: ttlSeconds }),
    delete: (key) => env.BKASH_TOKENS.delete(key),
  }

  return new BkashClient(
    'primary',
    {
      sandbox: true,
      appKey: env.BKASH_APP_KEY,
      appSecret: env.BKASH_APP_SECRET,
      username: env.BKASH_USERNAME,
      password: env.BKASH_PASSWORD,
    },
    { tokenStore },
  )
}

const app = new Hono<{ Bindings: Env }>()

app.get('/bkash/callback', async (c) => {
  const client = bkash(c.env)
  const paymentId = c.req.query('paymentId') ?? ''

  if (c.req.query('status') !== 'success') {
    return c.redirect('/orders/failed')
  }

  const result = await client.executePayment(paymentId).catch(() => client.queryPayment(paymentId))

  return c.redirect(result.isCompleted() ? '/orders/thank-you' : '/orders/failed')
})

export default app
```

The same code runs on Hono with Bun, Deno or Node, where a module-level client like `lib/bkash.ts` is fine.

### Other Frameworks

| Framework | Where the client goes |
|---|---|
| Nuxt | `server/api/` routes |
| SvelteKit | `+server.ts` and `+page.server.ts` |
| Remix / React Router | `loader` and `action` |
| Astro | SSR endpoints |
| Elysia, Fresh, Oak | route handlers |
| AWS Lambda, Vercel and Netlify Functions | the function handler, with a shared [token store](#token-store) |
| Strapi, Medusa, Payload | a custom service or plugin |

In serverless and edge apps every cold start has an empty memory cache, so pass a shared [token store](#token-store) to avoid a token grant on each start.

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
  const result = (await bkash.executePayment(paymentId)).throw()
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

When `log.enabled` is true, each request and response goes to your `logger`. Credentials, the app key, tokens and customer wallet numbers (including a phone-number `payerReference`) are masked, in nested objects too.

## Going Live

Set `sandbox: false` and use your production credentials.

## License

MIT
