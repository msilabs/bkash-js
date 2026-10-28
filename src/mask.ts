import { BkashError } from './errors'

const SECRET_KEYS = ['app_key', 'app_secret', 'password', 'username', 'Authorization', 'X-App-Key', 'id_token', 'refresh_token']

const PHONE_KEYS = ['customerMsisdn', 'payerAccount']

const PHONE_PATTERN = /^(\+?88)?01\d{9}$/

const AMOUNT_PATTERN = /^\d+(\.\d+)?$/

export function mask(data: Record<string, unknown>): Record<string, unknown> {
  const masked: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(data)) {
    masked[key] = maskValue(key, value)
  }

  return masked
}

function maskValue(key: string, value: unknown): unknown {
  if (value == null) {
    return value
  }

  if (SECRET_KEYS.includes(key)) {
    return '********'
  }

  // Keep the last 4 digits so a payment can still be matched to a customer.
  const isPhone =
    PHONE_KEYS.includes(key) || (key === 'payerReference' && PHONE_PATTERN.test(String(value)))

  if (isPhone && (typeof value === 'string' || typeof value === 'number')) {
    return '*******' + String(value).slice(-4)
  }

  if (Array.isArray(value)) {
    return value.map((item) => maskValue(key, item))
  }

  if (typeof value === 'object') {
    return mask(value as Record<string, unknown>)
  }

  return value
}

export function formatAmount(amount: string | number): string {
  const isValidString = typeof amount === 'string' && AMOUNT_PATTERN.test(amount.trim())
  const isValidNumber = typeof amount === 'number' && Number.isFinite(amount)
  // EPSILON fixes binary rounding, e.g. 1.005 must become "1.01" like PHP number_format.
  const value = Math.round((Number(amount) + Number.EPSILON) * 100) / 100

  if ((!isValidString && !isValidNumber) || !(value > 0)) {
    throw new BkashError(`Invalid bKash amount [${amount}].`)
  }

  return value.toFixed(2)
}
