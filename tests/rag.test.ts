import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { MemoryAdapter, VecLite } from '../src/index.js'
import { VecLiteRAG } from '../src/rag/index.js'
import { chunk } from '../src/rag/chunker.js'

const __dir = dirname(fileURLToPath(import.meta.url))

vi.mock('@huggingface/transformers', () => ({
  pipeline: vi.fn().mockImplementation(async () =>
    vi.fn().mockResolvedValue({ data: new Float32Array(384).fill(0.1) })
  ),
}))

beforeAll(async () => {
  const wasmBytes = readFileSync(join(__dir, '../src/wasm/veclite_bg.wasm'))
  await VecLite.init(wasmBytes)
})

function makeRag() {
  return new VecLiteRAG({ storage: new MemoryAdapter() })
}

// ── VecLiteRAG ────────────────────────────────────────────────────────────────

describe('VecLiteRAG', () => {
  it('initialises without error', async () => {
    const rag = makeRag()
    await rag.init()
    expect(rag.size).toBe(0)
  })

  it('throws before init', async () => {
    const rag = makeRag()
    await expect(rag.add('doc1', 'hello')).rejects.toThrow('init()')
  })

  it('adds a short document as a single chunk', async () => {
    const rag = makeRag()
    await rag.init()
    await rag.add('doc1', 'Short text.')
    expect(rag.size).toBe(1)
  })

  it('adds a long document as multiple chunks', async () => {
    const rag = makeRag()
    await rag.init()
    await rag.add('doc1', 'word '.repeat(300))  // ~1500 chars
    expect(rag.size).toBeGreaterThan(1)
  })

  it('search returns results with correct structure', async () => {
    const rag = makeRag()
    await rag.init()
    await rag.add('doc1', 'The quick brown fox.', { source: 'test' })
    const results = await rag.search('fox', { topK: 1 })
    expect(results).toHaveLength(1)
    expect(results[0].id).toBe('doc1')
    expect(typeof results[0].chunk).toBe('string')
    expect(results[0].chunk.length).toBeGreaterThan(0)
    expect(typeof results[0].score).toBe('number')
    expect(results[0].metadata).toEqual({ source: 'test' })
  })

  it('strips internal metadata from search results', async () => {
    const rag = makeRag()
    await rag.init()
    await rag.add('doc1', 'Some text.')
    const results = await rag.search('text', { topK: 1 })
    expect(results[0].metadata).not.toHaveProperty('_docId')
    expect(results[0].metadata).not.toHaveProperty('_chunkText')
    expect(results[0].metadata).not.toHaveProperty('_chunkIndex')
  })

  it('deletes a document', async () => {
    const rag = makeRag()
    await rag.init()
    await rag.add('doc1', 'Some text.')
    expect(rag.size).toBeGreaterThan(0)
    await rag.delete('doc1')
    expect(rag.size).toBe(0)
  })

  it('delete of unknown id is a no-op', async () => {
    const rag = makeRag()
    await rag.init()
    await expect(rag.delete('nonexistent')).resolves.not.toThrow()
    expect(rag.size).toBe(0)
  })

  it('re-adding a document replaces it', async () => {
    const rag = makeRag()
    await rag.init()
    await rag.add('doc1', 'First version.')
    const sizeAfterFirst = rag.size
    await rag.add('doc1', 'Second version.')
    expect(rag.size).toBe(sizeAfterFirst)
  })

  it('multiple documents accumulate correctly', async () => {
    const rag = makeRag()
    await rag.init()
    await rag.add('doc1', 'First document.')
    await rag.add('doc2', 'Second document.')
    expect(rag.size).toBe(2)
    await rag.delete('doc1')
    expect(rag.size).toBe(1)
  })

  it('save and load round-trip restores index and chunk map', async () => {
    const storage = new MemoryAdapter()
    const rag = new VecLiteRAG({ storage })
    await rag.init()
    await rag.add('doc1', 'Persistent text.', { tag: 'saved' })
    await rag.save()

    const rag2 = new VecLiteRAG({ storage })
    await rag2.init()
    await rag2.load()
    expect(rag2.size).toBe(1)

    const results = await rag2.search('text', { topK: 1 })
    expect(results[0].id).toBe('doc1')
    expect(results[0].metadata).toEqual({ tag: 'saved' })
  })

  it('delete works after load', async () => {
    const storage = new MemoryAdapter()
    const rag = new VecLiteRAG({ storage })
    await rag.init()
    await rag.add('doc1', 'Some text.')
    await rag.save()

    const rag2 = new VecLiteRAG({ storage })
    await rag2.init()
    await rag2.load()
    await rag2.delete('doc1')
    expect(rag2.size).toBe(0)
  })

  it('clear wipes the index', async () => {
    const rag = makeRag()
    await rag.init()
    await rag.add('doc1', 'Some text.')
    rag.clear()
    expect(rag.size).toBe(0)
  })

  it('topK defaults to 5', async () => {
    const rag = makeRag()
    await rag.init()
    for (let i = 0; i < 8; i++) await rag.add(`doc${i}`, `Document ${i}.`)
    const results = await rag.search('document')
    expect(results.length).toBeLessThanOrEqual(5)
  })
})

// ── chunker ───────────────────────────────────────────────────────────────────

describe('chunk', () => {
  it('returns empty array for empty string', () => {
    expect(chunk('')).toEqual([])
    expect(chunk('   ')).toEqual([])
  })

  it('returns single chunk when text fits', () => {
    const result = chunk('Short text.', 1000, 100)
    expect(result).toHaveLength(1)
    expect(result[0]).toBe('Short text.')
  })

  it('splits long text into multiple chunks', () => {
    const result = chunk('word '.repeat(300), 1000, 100)
    expect(result.length).toBeGreaterThan(1)
  })

  it('produces no empty chunks', () => {
    const result = chunk('word '.repeat(300), 1000, 100)
    result.forEach(c => expect(c.trim().length).toBeGreaterThan(0))
  })

  it('all chunks together contain all the original words', () => {
    const words = Array.from({ length: 200 }, (_, i) => `word${i}`)
    const text = words.join(' ')
    const chunks = chunk(text, 500, 50)
    const combined = chunks.join(' ')
    words.forEach(w => expect(combined).toContain(w))
  })

  it('respects chunkSize boundary', () => {
    const result = chunk('a'.repeat(2500), 1000, 0)
    result.forEach(c => expect(c.length).toBeLessThanOrEqual(1000))
  })
})
