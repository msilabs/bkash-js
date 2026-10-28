import { describe, expect, it } from 'vitest'
import { parseCallback } from '../src'

describe('parseCallback', () => {
  it('reads a full or relative URL', () => {
    const expected = { status: 'success', paymentId: 'P1', agreementId: null }

    expect(parseCallback('https://shop.test/bkash/callback?paymentId=P1&status=success')).toEqual(expected)
    expect(parseCallback('/bkash/callback?paymentId=P1&status=success')).toEqual(expected)
    expect(parseCallback('paymentId=P1&status=success')).toEqual(expected)
    expect(parseCallback('/cb?paymentId=P1&status=success#done')).toEqual(expected)
  })

  it('reads URL and URLSearchParams', () => {
    const url = new URL('https://shop.test/cb?agreementId=A1&status=cancel')

    expect(parseCallback(url)).toEqual({ status: 'cancel', paymentId: null, agreementId: 'A1' })
    expect(parseCallback(url.searchParams).agreementId).toBe('A1')
  })

  it('reads a parsed query object', () => {
    expect(parseCallback({ paymentId: ['P1', 'P2'], status: 'failure', extra: 5 })).toEqual({
      status: 'failure',
      paymentId: 'P1',
      agreementId: null,
    })
  })

  it('accepts the upper-case ID spelling', () => {
    expect(parseCallback('?paymentID=P1&agreementID=A1&status=success')).toEqual({
      status: 'success',
      paymentId: 'P1',
      agreementId: 'A1',
    })
  })

  it('returns nulls for a missing or empty query', () => {
    expect(parseCallback('/bkash/callback')).toEqual({ status: null, paymentId: null, agreementId: null })
    expect(parseCallback('?paymentId=&status=')).toEqual({ status: null, paymentId: null, agreementId: null })
  })
})
