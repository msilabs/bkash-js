import { describe, expect, it } from 'vitest'
import { formatAmount, mask } from '../src/mask'

describe('mask', () => {
  it('masks secrets and keeps other fields', () => {
    const result = mask({ app_secret: 'x', password: 'y', Authorization: 'tok', amount: '10.00' })

    expect(result).toEqual({
      app_secret: '********',
      password: '********',
      Authorization: '********',
      amount: '10.00',
    })
  })

  it('keeps the last 4 digits of phone fields', () => {
    const result = mask({ customerMsisdn: '01712345678', payerAccount: '01898765432' })

    expect(result.customerMsisdn).toBe('*******5678')
    expect(result.payerAccount).toBe('*******5432')
  })

  it('masks the app key in headers and body', () => {
    const result = mask({ app_key: 'k', 'X-App-Key': 'k' })

    expect(result).toEqual({ app_key: '********', 'X-App-Key': '********' })
  })

  it('masks a payer reference only when it is a phone number', () => {
    expect(mask({ payerReference: '01712345678' }).payerReference).toBe('*******5678')
    expect(mask({ payerReference: '+8801712345678' }).payerReference).toBe('*******5678')
    expect(mask({ payerReference: 'INV-1001' }).payerReference).toBe('INV-1001')
  })

  it('masks nested objects and arrays', () => {
    const result = mask({ data: { id_token: 'abc', items: [{ customerMsisdn: '01712345678' }] } })

    expect(result).toEqual({ data: { id_token: '********', items: [{ customerMsisdn: '*******5678' }] } })
  })

  it('does not mutate the input', () => {
    const input = { id_token: 'abc' }
    mask(input)

    expect(input.id_token).toBe('abc')
  })
})

describe('formatAmount', () => {
  it('always has two decimals', () => {
    expect(formatAmount(100)).toBe('100.00')
    expect(formatAmount('99.5')).toBe('99.50')
    expect(formatAmount(10.999)).toBe('11.00')
    expect(formatAmount(1.005)).toBe('1.01')
    expect(formatAmount(' 25 ')).toBe('25.00')
  })

  it('rejects invalid amounts', () => {
    expect(() => formatAmount('abc')).toThrow('Invalid bKash amount [abc].')
    expect(() => formatAmount('')).toThrow()
    expect(() => formatAmount(-5)).toThrow()
    expect(() => formatAmount(Infinity)).toThrow()
    expect(() => formatAmount('0x10')).toThrow()
    expect(() => formatAmount('1e3')).toThrow()
    expect(() => formatAmount(0)).toThrow()
    expect(() => formatAmount('0.001')).toThrow()
  })
})
