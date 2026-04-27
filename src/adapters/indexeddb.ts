import type { StorageAdapter } from './adapter.js'
import { VecLiteStorageError } from '../types.js'

export class IndexedDBAdapter implements StorageAdapter {
  private db: IDBDatabase | null = null

  constructor(
    private readonly dbName: string = 'veclite',
    private readonly storeName: string = 'store',
  ) {}

  private open(): Promise<IDBDatabase> {
    if (this.db) return Promise.resolve(this.db)
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(this.dbName, 1)
      req.onupgradeneeded = () => {
        req.result.createObjectStore(this.storeName)
      }
      req.onsuccess = () => {
        this.db = req.result
        resolve(req.result)
      }
      req.onerror = () =>
        reject(new VecLiteStorageError(`Failed to open IndexedDB: ${req.error?.message}`))
    })
  }

  async get(key: string): Promise<string | null> {
    const db = await this.open()
    return new Promise((resolve, reject) => {
      const req = db.transaction(this.storeName, 'readonly').objectStore(this.storeName).get(key)
      req.onsuccess = () => resolve((req.result as string | undefined) ?? null)
      req.onerror = () => reject(new VecLiteStorageError(`get failed: ${req.error?.message}`))
    })
  }

  async set(key: string, value: string): Promise<void> {
    const db = await this.open()
    return new Promise((resolve, reject) => {
      const req = db
        .transaction(this.storeName, 'readwrite')
        .objectStore(this.storeName)
        .put(value, key)
      req.onsuccess = () => resolve()
      req.onerror = () => reject(new VecLiteStorageError(`set failed: ${req.error?.message}`))
    })
  }

  async delete(key: string): Promise<void> {
    const db = await this.open()
    return new Promise((resolve, reject) => {
      const req = db
        .transaction(this.storeName, 'readwrite')
        .objectStore(this.storeName)
        .delete(key)
      req.onsuccess = () => resolve()
      req.onerror = () => reject(new VecLiteStorageError(`delete failed: ${req.error?.message}`))
    })
  }

  async clear(): Promise<void> {
    const db = await this.open()
    return new Promise((resolve, reject) => {
      const req = db.transaction(this.storeName, 'readwrite').objectStore(this.storeName).clear()
      req.onsuccess = () => resolve()
      req.onerror = () => reject(new VecLiteStorageError(`clear failed: ${req.error?.message}`))
    })
  }
}
