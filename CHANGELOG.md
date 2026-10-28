# Changelog

All notable changes to `@msilabs/bkash` are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project follows [Semantic Versioning](https://semver.org/).

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

- Node.js `^22.23.4`, `^24.22.1` or `>=26.12.1`.
