# Changelog

All notable changes to `@msilabs/bkash` are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project follows [Semantic Versioning](https://semver.org/).

## [1.0.0] - 2026-10-29

The first stable release. See [Upgrading from 0.x](README.md#upgrading-from-0x) for the changes to make.

### Added

- `confirmPayment()` and `confirmPaymentWithAgreement()`: execute the payment, and ask bKash for its real status with `queryPayment()` when execute fails or times out.
- `parseCallback()` reads `status`, `paymentId` and `agreementId` from the callback query (a URL, `URLSearchParams` or a parsed query object), in either ID casing.
- `BkashResponse` methods `paymentId()`, `trxId()`, `agreementId()`, `amount()` and `amountMatches()`.
- Exported parameter types: `CreatePaymentParams`, `CreateAgreementParams`, `CreatePaymentWithAgreementParams`, `PaymentWithAgreementParams`, `RefundParams`, `RefundStatusParams`, `Amount`, `BkashCallback` and `BkashCallbackInput`.
- README: a copy-paste prompt for AI coding agents, a guide for Express, Next.js, Hono on Cloudflare Workers and other frameworks, a going-live checklist and an upgrade guide.

### Changed

- **Breaking:** methods that take more than one value now take a single object: `createPayment()`, `createAgreement()`, `createPaymentWithAgreement()`, `executePaymentWithAgreement()`, `refund()` and `refundStatus()`.
- **Breaking:** the `BkashClient` constructor requires a full `BkashAccount`, so a missing credential is a type error.
- Node.js requirement relaxed to 22 or newer.
- Logs now also mask the app key, a phone-number `payerReference`, and secrets in nested objects.

### Fixed

- A network error on token refresh falls back to a new grant instead of throwing.
- A bKash outage (HTTP 5xx) during a token request no longer deletes the cached refresh token.
- `formatAmount()` rejects zero, hex (`0x10`) and exponent (`1e3`) amounts.
- README examples use the v2 field names (`paymentId`, `trxId`, `agreementId`).

## [0.1.0] - 2026-10-28

### Added

- bKash Tokenized Checkout **v2** client for Node, Bun, Deno and edge runtimes.
- Payments: `createPayment()`, `executePayment()`.
- Agreement (one-click) payments: `createAgreement()`, `executeAgreement()`, `queryAgreement()`, `cancelAgreement()`, `createPaymentWithAgreement()`, `executePaymentWithAgreement()`.
- Query and search: `queryPayment()`, `searchTransaction()`.
- Refund: `refund()`, `refundStatus()`.
- `BkashResponse` and `BkashError`.
- Token caching and refresh, a pluggable `TokenStore` with an optional lock, and one automatic retry on HTTP 401.
- Optional request and response logging, with secrets and wallet numbers masked.
- ESM and CommonJS builds.

### Requires

- Node.js 22 or newer.
