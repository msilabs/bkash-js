export interface TokenStore {
  get(key: string): Promise<string | undefined>
  set(key: string, value: string, ttlSeconds: number): Promise<void>
  delete(key: string): Promise<void>
  lock?<T>(key: string, seconds: number, fn: () => Promise<T>): Promise<T>
}

export class MemoryTokenStore implements TokenStore {
  private items = new Map<string, { value: string; expiresAt: number }>()

  async get(key: string): Promise<string | undefined> {
    const item = this.items.get(key)

    if (!item) {
      return undefined
    }

    if (item.expiresAt <= Date.now()) {
      this.items.delete(key)
      return undefined
    }

    return item.value
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    this.items.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 })
  }

  async delete(key: string): Promise<void> {
    this.items.delete(key)
  }
}
