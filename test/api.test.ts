import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BkashClient, BkashError } from '../src'

const SANDBOX = 'https://tokenized.sandbox.bka.sh/v2/tokenized-checkout'

const account = {
  appKey: 'key',
  appSecret: 'secret',
  username: 'user',
  password: 'pass',
}

let calls: { endpoint: string; headers: Record<string, string>; body: any }[]
let replies: Record<string, unknown>

beforeEach(() => {
  calls = []
  replies = {
    'auth/grant-token': { statusCode: '0000', id_token: 'tok', refresh_token: 'ref', expires_in: 3600 },
  }

  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      const endpoint = url.replace(`${SANDBOX}/`, '')
      calls.push({ endpoint, headers: init.headers as Record<string, string>, body: JSON.parse(init.body as string) })

      return new Response(JSON.stringify(replies[endpoint] ?? {}))
    }),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const last = () => calls[calls.length - 1]!

describe('payment', () => {
  it('creates a payment with a formatted amount', async () => {
    replies['payment/create'] = { paymentId: 'P1', bkashURL: 'https://pay' }

    const response = await new BkashClient('primary', account).createPayment({
      amount: 500,
      invoiceNumber: 'INV-1',
      callbackUrl: 'https://cb',
    })

    expect(response.redirectUrl()).toBe('https://pay')
    expect(last().endpoint).toBe('payment/create')
    expect(last().headers.Authorization).toBe('tok')
    expect(last().headers['X-App-Key']).toBe('key')
    expect(last().body).toEqual({
      payerReference: 'INV-1',
      callbackURL: 'https://cb',
      amount: '500.00',
      currency: 'BDT',
      intent: 'sale',
      merchantInvoiceNumber: 'INV-1',
    })
  })

  it('uses the given payer reference and extra fields', async () => {
    await new BkashClient('primary', account).createPayment({
      amount: '10.5',
      invoiceNumber: 'INV-2',
      callbackUrl: 'https://cb',
      payerReference: '01700000000',
      extra: { subMerchantName: 'Shop' },
    })

    expect(last().body.payerReference).toBe('01700000000')
    expect(last().body.amount).toBe('10.50')
    expect(last().body.subMerchantName).toBe('Shop')
  })

  it('executes a payment', async () => {
    replies['payment/execute'] = { trxId: 'TRX1', transactionStatus: 'Completed' }

    const response = await new BkashClient('primary', account).executePayment('P1')

    expect(response.isCompleted()).toBe(true)
    expect(last().body).toEqual({ paymentId: 'P1' })
  })
})

describe('agreement', () => {
  it('creates an agreement', async () => {
    replies['agreement/create'] = { paymentId: 'P1', agreementStatus: 'Initiated', bkashURL: 'https://pay' }

    const response = await new BkashClient('primary', account).createAgreement({
      payerReference: '01700000000',
      callbackUrl: 'https://cb',
    })

    expect(response.redirectUrl()).toBe('https://pay')
    expect(last().body).toEqual({ payerReference: '01700000000', callbackURL: 'https://cb' })
  })

  it('executes, queries and cancels an agreement', async () => {
    replies['agreement/execute'] = { agreementId: 'A1', agreementStatus: 'Completed' }
    replies['query/agreement'] = { agreementId: 'A1', agreementStatus: 'Completed' }
    replies['agreement/cancel'] = { agreementId: 'A1', agreementStatus: 'Cancelled' }

    const client = new BkashClient('primary', account)

    expect((await client.executeAgreement('A1')).isCompleted()).toBe(true)
    expect((await client.queryAgreement('A1')).isCompleted()).toBe(true)
    expect((await client.cancelAgreement('A1')).data.agreementStatus).toBe('Cancelled')

    for (const endpoint of ['agreement/execute', 'query/agreement', 'agreement/cancel']) {
      expect(calls.find((c) => c.endpoint === endpoint)!.body).toEqual({ agreementId: 'A1' })
    }
  })

  it('pays with an agreement', async () => {
    replies['payment-with-agreement/execute'] = { trxId: 'TRX2', transactionStatus: 'Completed' }

    const client = new BkashClient('primary', account)

    await client.createPaymentWithAgreement({
      agreementId: 'A1',
      amount: 200,
      invoiceNumber: 'INV-3',
      callbackUrl: 'https://cb',
    })

    expect(last().endpoint).toBe('payment-with-agreement/create')
    expect(last().body).toEqual({
      agreementId: 'A1',
      callbackURL: 'https://cb',
      amount: '200.00',
      currency: 'BDT',
      intent: 'sale',
      merchantInvoiceNumber: 'INV-3',
    })

    const response = await client.executePaymentWithAgreement({ paymentId: 'P2', agreementId: 'A1' })

    expect(response.isCompleted()).toBe(true)
    expect(last().body).toEqual({ paymentId: 'P2', agreementId: 'A1' })
  })
})

describe('query and refund', () => {
  it('queries a payment and searches a transaction', async () => {
    const client = new BkashClient('primary', account)

    await client.queryPayment('P1')
    expect(last().endpoint).toBe('query/payment')
    expect(last().body).toEqual({ paymentId: 'P1' })

    await client.searchTransaction('TRX1')
    expect(last().endpoint).toBe('general/search-transaction')
    expect(last().body).toEqual({ trxId: 'TRX1' })
  })

  it('refunds and checks refund status', async () => {
    const client = new BkashClient('primary', account)

    await client.refund({ paymentId: 'P1', trxId: 'TRX1', amount: 50, reason: 'Damaged' })
    expect(last().endpoint).toBe('refund/payment/transaction')
    expect(last().body).toEqual({
      paymentId: 'P1',
      trxId: 'TRX1',
      refundAmount: '50.00',
      sku: 'N/A',
      reason: 'Damaged',
    })

    await client.refundStatus({ paymentId: 'P1', trxId: 'TRX1' })
    expect(last().endpoint).toBe('refund/payment/status')
    expect(last().body).toEqual({ paymentId: 'P1', trxId: 'TRX1' })
  })
})

describe('confirm payment', () => {
  it('returns the execute result when it completed', async () => {
    replies['payment/execute'] = { paymentId: 'P1', trxId: 'TRX1', transactionStatus: 'Completed' }

    const response = await new BkashClient('primary', account).confirmPayment('P1')

    expect(response.trxId()).toBe('TRX1')
    expect(calls.map((c) => c.endpoint)).not.toContain('query/payment')
  })

  it('queries the payment when execute fails with a network error', async () => {
    replies['query/payment'] = { paymentId: 'P1', trxId: 'TRX1', transactionStatus: 'Completed' }
    const client = new BkashClient('primary', account)
    await client.token()

    vi.mocked(fetch).mockRejectedValueOnce(new Error('timeout'))
    const response = await client.confirmPayment('P1')

    expect(response.isCompleted()).toBe(true)
    expect(last().endpoint).toBe('query/payment')
  })

  it('returns the query result when execute failed but the payment went through', async () => {
    replies['payment/execute'] = { statusCode: '2117', statusMessage: 'Payment execution already been called before' }
    replies['query/payment'] = { paymentId: 'P1', transactionStatus: 'Completed' }

    const response = await new BkashClient('primary', account).confirmPayment('P1')

    expect(response.isCompleted()).toBe(true)
  })

  it('keeps the execute error when the payment did not go through', async () => {
    replies['payment/execute'] = { statusCode: '2023', statusMessage: 'Insufficient Balance' }
    replies['query/payment'] = { paymentId: 'P1', transactionStatus: 'Initiated' }

    const response = await new BkashClient('primary', account).confirmPayment('P1')

    expect(response.isCompleted()).toBe(false)
    expect(response.errorMessage()).toBe('Insufficient Balance')
  })

  it('throws when neither execute nor query can reach bKash', async () => {
    const client = new BkashClient('primary', account)
    await client.token()

    vi.mocked(fetch).mockRejectedValueOnce(new Error('timeout')).mockRejectedValueOnce(new Error('timeout'))

    await expect(client.confirmPayment('P1')).rejects.toThrow(BkashError)
  })

  it('confirms a payment with an agreement', async () => {
    replies['payment-with-agreement/execute'] = { statusCode: '2023', statusMessage: 'Insufficient Balance' }
    replies['query/payment'] = { paymentId: 'P2', transactionStatus: 'Completed' }

    const response = await new BkashClient('primary', account).confirmPaymentWithAgreement({
      paymentId: 'P2',
      agreementId: 'A1',
    })

    expect(response.isCompleted()).toBe(true)
    expect(calls.find((c) => c.endpoint === 'payment-with-agreement/execute')!.body).toEqual({
      paymentId: 'P2',
      agreementId: 'A1',
    })
    expect(last().body).toEqual({ paymentId: 'P2' })
  })
})
