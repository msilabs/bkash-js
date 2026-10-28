import { describe, expect, it } from 'vitest'
import { BkashError } from '../src/errors'
import { BkashResponse } from '../src/response'

describe('BkashResponse', () => {
  it('is successful for a clean 200', () => {
    const res = new BkashResponse({ statusCode: '0000', paymentID: 'P1' }, 200)

    expect(res.successful()).toBe(true)
    expect(res.errorCode()).toBeNull()
    expect(res.errorMessage()).toBeNull()
  })

  it('fails on non-2xx status', () => {
    const res = new BkashResponse({}, 500)

    expect(res.failed()).toBe(true)
    expect(res.errorCode()).toBe('500')
    expect(res.errorMessage()).toBe('bKash request failed with HTTP status 500.')
  })

  it('fails when externalCode or errorCode is present', () => {
    expect(new BkashResponse({ externalCode: '9999' }).failed()).toBe(true)
    expect(new BkashResponse({ errorCode: '2001' }).failed()).toBe(true)
  })

  it('fails on a non-zero statusCode but accepts 0000 and 0', () => {
    expect(new BkashResponse({ statusCode: '2023' }).failed()).toBe(true)
    expect(new BkashResponse({ statusCode: 0 }).successful()).toBe(true)
  })

  it('reads error code and message with the right precedence', () => {
    const res = new BkashResponse(
      { externalCode: 'E1', errorCode: 'E2', errorMessageEn: 'en', errorMessage: 'm', errorMessageBn: 'bn' },
      400,
    )

    expect(res.errorCode()).toBe('E1')
    expect(res.errorMessage()).toBe('en')
    expect(res.errorMessageBn()).toBe('bn')
  })

  it('falls back to statusMessage', () => {
    const res = new BkashResponse({ statusCode: '2023', statusMessage: 'Insufficient Balance' })

    expect(res.errorCode()).toBe('2023')
    expect(res.errorMessage()).toBe('Insufficient Balance')
  })

  it('detects Completed from any status field', () => {
    expect(new BkashResponse({ transactionStatus: 'Completed' }).isCompleted()).toBe(true)
    expect(new BkashResponse({ agreementStatus: 'Completed' }).isCompleted()).toBe(true)
    expect(new BkashResponse({ refundTransactionStatus: 'Completed' }).isCompleted()).toBe(true)
    expect(new BkashResponse({ transactionStatus: 'Initiated' }).isCompleted()).toBe(false)
    expect(new BkashResponse({ transactionStatus: 'Completed', errorCode: 'x' }).isCompleted()).toBe(false)
  })

  it('reads redirect url and invoice number aliases', () => {
    expect(new BkashResponse({ bkashURL: 'a' }).redirectUrl()).toBe('a')
    expect(new BkashResponse({ bKashURL: 'b' }).redirectUrl()).toBe('b')
    expect(new BkashResponse({ merchantInvoice: 'INV' }).invoiceNumber()).toBe('INV')
    expect(new BkashResponse({ merchantInvoiceNumber: 'N' }).invoiceNumber()).toBe('N')
  })

  it('reads ids in either casing', () => {
    const camel = new BkashResponse({ paymentId: 'P1', trxId: 'T1', agreementId: 'A1' })
    const upper = new BkashResponse({ paymentID: 'P2', trxID: 'T2', agreementID: 'A2' })

    expect([camel.paymentId(), camel.trxId(), camel.agreementId()]).toEqual(['P1', 'T1', 'A1'])
    expect([upper.paymentId(), upper.trxId(), upper.agreementId()]).toEqual(['P2', 'T2', 'A2'])
    expect(new BkashResponse({}).paymentId()).toBeNull()
  })

  it('compares the paid amount', () => {
    const res = new BkashResponse({ amount: '500.00' })

    expect(res.amount()).toBe('500.00')
    expect(res.amountMatches(500)).toBe(true)
    expect(res.amountMatches('500')).toBe(true)
    expect(res.amountMatches(499.99)).toBe(false)
    expect(new BkashResponse({ amount: 500 }).amountMatches('500.00')).toBe(true)
    expect(new BkashResponse({}).amountMatches(500)).toBe(false)
    expect(new BkashResponse({ amount: 'n/a' }).amountMatches(500)).toBe(false)
  })

  it('gets nested values with a default', () => {
    const res = new BkashResponse({ a: { b: 1 } })

    expect(res.get('a.b')).toBe(1)
    expect(res.get('a.c', 'fallback')).toBe('fallback')
  })

  it('throw() returns this on success and throws BkashError on failure', () => {
    const ok = new BkashResponse({})
    expect(ok.throw()).toBe(ok)

    const bad = new BkashResponse({ errorCode: '2001', errorMessageEn: 'Invalid' }, 400)

    try {
      bad.throw()
      expect.unreachable()
    } catch (e) {
      expect(e).toBeInstanceOf(BkashError)
      expect((e as BkashError).message).toBe('[2001] Invalid')
      expect((e as BkashError).errorCode).toBe('2001')
      expect((e as BkashError).response).toBe(bad)
    }
  })

  it('serializes to the raw data', () => {
    expect(JSON.stringify(new BkashResponse({ x: 1 }))).toBe('{"x":1}')
  })
})
