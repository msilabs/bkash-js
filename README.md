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

const payment = await bkash.createPayment({
  amount: 500,
  invoiceNumber: 'INV-1001',
  callbackUrl: 'https://example.com/bkash/callback',
})

// redirect the customer to payment.redirectUrl()
```

## Features

- bKash **Tokenized Checkout v2** API
- Create, execute, query and search payments
- `confirmPayment()`: execute, and check the real status with bKash if execute fails or times out
- `parseCallback()`: read the callback query from any framework
- Full and partial **refunds**, plus refund status
- **Agreement** (one-click) payments
- Automatic token caching and refresh, with a lock hook against concurrent token requests
- A response object with `isCompleted()`, `paymentId()`, `trxId()`, `amountMatches()` and Bangla error messages
- Optional API logging with secrets masked
- ESM and CommonJS builds, with TypeScript types
- Works with any server-side framework: Express, NestJS, Next.js, Nuxt, SvelteKit, Hono, Cloudflare Workers and more

## Requirements

Node.js 22 or newer. The package uses only `fetch` and Web Crypto, so it also runs on Bun, Deno and edge runtimes.

Use it on the server only. It needs your app secret and password, so never import it in browser, mobile or desktop client code, and never put the credentials in browser-exposed variables such as `NEXT_PUBLIC_*` or `VITE_*`.

## Installation

```bash
npm install @msilabs/bkash
```

## Set Up with an AI Agent

Using Claude Code, Cursor, Copilot or another coding agent? Copy this prompt into it. Change the first line to your framework.

<details>
<summary>Show the prompt</summary>

```text
Add bKash payments to this Next.js (App Router) app with @msilabs/bkash.

Read node_modules/@msilabs/bkash/README.md first and use only the methods and field
names it documents.

1. Install @msilabs/bkash.
2. Create one shared server-only module that builds a BkashClient from the env vars
   BKASH_SANDBOX, BKASH_APP_KEY, BKASH_APP_SECRET, BKASH_USERNAME and BKASH_PASSWORD.
   Add them to .env.example with empty values. Never commit real values.
3. Add a server route or action that creates the payment with createPayment() for an
   existing order, saves payment.paymentId() on the order, and redirects to
   payment.redirectUrl().
4. Add the callback route, following handleBkashCallback() in the README's Quick Start:
   read the query with parseCallback(), stop if status is not 'success', and find the
   order by paymentId. If the order is already paid, show success without calling bKash
   again. Otherwise call confirmPayment(paymentId) and mark the order paid only if
   isCompleted() and amountMatches(order total). Save trxId().

Rules:
- Never import the client from browser code or a 'use client' file.
- Never trust the amount or invoice number in the callback URL.
- If confirmPayment() throws, leave the order pending. Do not mark it failed.
- If the app runs on serverless or edge hosting, ask me which shared store (Redis, KV)
  to use for tokenStore before writing it.

When done, run the type check and tell me how to test the flow with the bKash sandbox.
```

</details>

## Quick Start

A payment has three steps:

1. **Create** the payment and redirect the customer to bKash.
2. bKash redirects the customer back to your **callback URL** with `paymentId` and `status`.
3. **Confirm** the payment on success. The money is taken only at this step.

Put the client in one shared server module:

```ts
// lib/bkash.ts
import { BkashClient, parseCallback, type BkashCallbackInput } from '@msilabs/bkash'

export const bkash = new BkashClient('primary', {
  sandbox: process.env.BKASH_SANDBOX !== 'false',
  appKey: process.env.BKASH_APP_KEY!,
  appSecret: process.env.BKASH_APP_SECRET!,
  username: process.env.BKASH_USERNAME!,
  password: process.env.BKASH_PASSWORD!,
})
```

**1. Create the payment** and send the customer to bKash:

```ts
const payment = await bkash.createPayment({
  amount: order.total,
  invoiceNumber: order.invoiceNumber,
  callbackUrl: 'https://example.com/bkash/callback',
})

if (payment.failed()) {
  throw new Error(payment.errorMessage() ?? 'Could not create the payment.')
}

await saveBkashPaymentId(order, payment.paymentId())

return redirect(payment.redirectUrl()!)
```

**2. Confirm it in your callback.** Add this to `lib/bkash.ts`:

```ts
/** Returns true when the order is paid. */
export async function handleBkashCallback(query: BkashCallbackInput): Promise<boolean> {
  const { paymentId, status } = parseCallback(query)

  if (!paymentId || status !== 'success') {
    return false // the customer cancelled or the payment failed
  }

  const order = await findOrderByBkashPaymentId(paymentId)

  if (!order) {
    return false
  }

  if (order.paid) {
    return true // bKash can call the callback twice: never execute again
  }

  const result = await bkash.confirmPayment(paymentId)

  if (result.isCompleted() && result.amountMatches(order.total)) {
    await markOrderPaid(order, result.trxId())
    return true
  }

  return false
}
```

`saveBkashPaymentId`, `findOrderByBkashPaymentId` and `markOrderPaid` stand for your own database code.

`confirmPayment()` executes the payment. If execute fails or times out, it asks bKash for the payment's real status with `queryPayment()`, because a timed-out execute may still have taken the money. If bKash cannot be reached at all, it throws a `BkashError`: leave the order pending and check it later with `queryPayment()`.

Look the order up by the `paymentId` you saved, and check the amount with `amountMatches()`. Never trust the amount or invoice number in the callback URL.

### createPayment options

```ts
await bkash.createPayment({
  amount: 500,                    // number or string, sent as "500.00"
  invoiceNumber: 'INV-1001',      // your unique invoice or order ID
  callbackUrl: 'https://example.com/bkash/callback',
  payerReference: '01712345678',  // optional, prefills the wallet number; defaults to invoiceNumber
  extra: { subMerchantName: 'My Shop' }, // optional extra bKash fields (aggregators)
})
```

## Using with Frameworks

The client has no framework code. With `lib/bkash.ts` from the [Quick Start](#quick-start), each framework only wires up two routes.

### Express

```ts
import express from 'express'
import { bkash, handleBkashCallback } from './lib/bkash'

const app = express()

app.post('/checkout/:orderId', async (req, res) => {
  const order = await findOrder(req.params.orderId)
  const payment = await bkash.createPayment({
    amount: order.total,
    invoiceNumber: order.invoiceNumber,
    callbackUrl: 'https://example.com/bkash/callback',
  })

  if (payment.failed()) {
    return res.status(502).send(payment.errorMessage())
  }

  await saveBkashPaymentId(order, payment.paymentId())
  res.redirect(303, payment.redirectUrl()!)
})

app.get('/bkash/callback', async (req, res) => {
  const paid = await handleBkashCallback(req.query)

  res.redirect(paid ? '/orders/thank-you' : '/orders/failed')
})
```

Fastify, Koa, Hapi and NestJS work the same way: pass the callback query or URL to `handleBkashCallback()`.

### Next.js (App Router)

```ts
// app/bkash/callback/route.ts
import { redirect } from 'next/navigation'
import { handleBkashCallback } from '@/lib/bkash'

export async function GET(request: Request) {
  const paid = await handleBkashCallback(request.url)

  redirect(paid ? '/orders/thank-you' : '/orders/failed')
}
```

Call the client only from Route Handlers, Server Actions and Server Components. Adding `import 'server-only'` to `lib/bkash.ts` makes the build fail if a client component imports it.

### Hono on Cloudflare Workers

Workers have no `process.env`, and each isolate has its own memory, so build the client from `env` and keep tokens in KV:

```ts
import { Hono } from 'hono'
import { BkashClient, parseCallback, type TokenStore } from '@msilabs/bkash'

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
  const { paymentId, status } = parseCallback(c.req.url)

  if (!paymentId || status !== 'success') {
    return c.redirect('/orders/failed')
  }

  // look the order up and check order.paid and amountMatches(), as in handleBkashCallback()
  const result = await bkash(c.env).confirmPayment(paymentId)

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

## Agreement (One-Click) Payments

With an agreement, a returning customer pays with only their PIN, with no OTP.

```ts
// 1. once per customer
const agreement = await bkash.createAgreement({
  payerReference: '01700000000',
  callbackUrl: 'https://example.com/bkash/agreement/callback',
})
// redirect to agreement.redirectUrl()

// 2. in the agreement callback
const { agreementId, status } = parseCallback(request.url)

if (agreementId && status === 'success') {
  const done = await bkash.executeAgreement(agreementId)
  // if done.isCompleted(), store done.agreementId() against the customer
}

// 3. later payments, with the stored agreement ID
const payment = await bkash.createPaymentWithAgreement({
  agreementId: customer.bkashAgreementId,
  amount: 200,
  invoiceNumber: 'INV-1002',
  callbackUrl: 'https://example.com/bkash/callback',
})
// redirect to payment.redirectUrl(), then in the callback:
const result = await bkash.confirmPaymentWithAgreement({ paymentId, agreementId: customer.bkashAgreementId })

// manage the agreement
await bkash.queryAgreement(customer.bkashAgreementId)
await bkash.cancelAgreement(customer.bkashAgreementId)
```

## Refund

```ts
const refund = await bkash.refund({
  paymentId,
  trxId,
  amount: 50,             // full or partial
  reason: 'Damaged item',
  sku: 'SKU-1',           // optional, defaults to 'N/A'
})

const status = await bkash.refundStatus({ paymentId, trxId })
```

## Query and Search

```ts
await bkash.queryPayment(paymentId)
await bkash.searchTransaction(trxId)
```

Use `queryPayment()` to reconcile orders left pending, for example when a customer closed the browser before the callback.

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
| `paymentId()`, `trxId()`, `agreementId()` | IDs from the response, `null` when absent |
| `amount()` | The amount as bKash sent it |
| `amountMatches(500)` | True when the response amount equals yours, so `500`, `'500'` and `'500.00'` all match |
| `invoiceNumber()` | The merchant invoice number |
| `errorCode()`, `errorMessage()`, `errorMessageBn()` | Error details, `null` on success |
| `get('a.b', default)` | Read a nested value from `data` |
| `throw()` | Throw a `BkashError` if the call failed, otherwise return the response |
| `data`, `status` | The raw body and HTTP status |

bKash business errors (for example insufficient balance) come back as a failed response, not an exception.

## Error Handling

`BkashError` is thrown when the request itself cannot complete: a network failure or timeout, an invalid response, missing credentials, an invalid amount, or a failed token request. It has `errorCode` and `response`.

```ts
import { BkashError } from '@msilabs/bkash'

try {
  const result = (await bkash.queryPayment(paymentId)).throw()
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

1. Test the full flow in the sandbox: create, cancel, confirm, refund.
2. Set `sandbox: false` and use your production credentials.
3. Use an HTTPS callback URL on your own domain.
4. On serverless, edge or multiple servers, pass a shared [token store](#token-store).

## Upgrading from 0.x

Methods that take more than one value now take a single object, so arguments cannot be mixed up:

```ts
// 0.x
bkash.createPayment(500, 'INV-1', callbackUrl, payerReference, extra)
bkash.createAgreement(payerReference, callbackUrl)
bkash.createPaymentWithAgreement(agreementId, 500, 'INV-1', callbackUrl, extra)
bkash.executePaymentWithAgreement(paymentId, agreementId)
bkash.refund(paymentId, trxId, 50, reason, sku)
bkash.refundStatus(paymentId, trxId)

// 1.x
bkash.createPayment({ amount: 500, invoiceNumber: 'INV-1', callbackUrl, payerReference, extra })
bkash.createAgreement({ payerReference, callbackUrl })
bkash.createPaymentWithAgreement({ agreementId, amount: 500, invoiceNumber: 'INV-1', callbackUrl, extra })
bkash.executePaymentWithAgreement({ paymentId, agreementId })
bkash.refund({ paymentId, trxId, amount: 50, reason, sku })
bkash.refundStatus({ paymentId, trxId })
```

Methods that take one ID, such as `executePayment(paymentId)`, are unchanged. The `BkashClient` constructor now needs a full account with all four credentials.

## License

MIT
