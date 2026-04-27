import { beforeEach, describe, expect, it } from 'vitest'
import { MemoryAdapter } from '../src/adapters/memory.js'

describe('MemoryAdapter', () => {
  let adapter: MemoryAdapter

  beforeEach(() => {
    adapter = new MemoryAdapter()
  })

  it('get returns null for a missing key', async () => {
    expect(await adapter.get('missing')).toBeNull()
  })

  it('set and get round-trips a value', async () => {
    await adapter.set('key', 'value')
    expect(await adapter.get('key')).toBe('value')
  })

  it('set overwrites an existing key', async () => {
    await adapter.set('key', 'first')
    await adapter.set('key', 'second')
    expect(await adapter.get('key')).toBe('second')
  })

  it('delete removes a key', async () => {
    await adapter.set('key', 'value')
    await adapter.delete('key')
    expect(await adapter.get('key')).toBeNull()
  })

  it('delete of a non-existent key is a no-op', async () => {
    await expect(adapter.delete('nonexistent')).resolves.toBeUndefined()
  })

  it('clear removes all keys', async () => {
    await adapter.set('a', '1')
    await adapter.set('b', '2')
    await adapter.clear()
    expect(await adapter.get('a')).toBeNull()
    expect(await adapter.get('b')).toBeNull()
  })

  it('stores independent values per key', async () => {
    await adapter.set('x', 'foo')
    await adapter.set('y', 'bar')
    expect(await adapter.get('x')).toBe('foo')
    expect(await adapter.get('y')).toBe('bar')
  })
})
