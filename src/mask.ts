import { BkashError } from './errors'

const SECRET_KEYS = ['app_secret', 'password', 'username', 'Authorization', 'id_token', 'refresh_token']

const PHONE_KEYS = ['customerMsisdn', 'payerAccount']

export function mask(data: Record<string, unknown>): Record<string, unknown> {
  const masked = { ...data }

  for (const key of SECRET_KEYS) {
    if (masked[key] != null) {
      masked[key] = '********'
    }
  }

  // Keep the last 4 digits so a payment can still be matched to a customer.
  for (const key of PHONE_KEYS) {
    const value = masked[key]

    if (typeof value === 'string' || typeof value === 'number') {
      masked[key] = '*******' + String(value).slice(-4)
    }
  }

  return masked
}

export function formatAmount(amount: string | number): string {
  const value = Number(amount)

  const isBlank = typeof amount === 'string' && amount.trim() === ''

  if (isBlank || !Number.isFinite(value) || value < 0) {
    throw new BkashError(`Invalid bKash amount [${amount}].`)
  }

  // EPSILON fixes binary rounding, e.g. 1.005 must become "1.01" like PHP number_format.
  return (Math.round((value + Number.EPSILON) * 100) / 100).toFixed(2)
}
