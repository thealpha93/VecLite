import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { beforeAll, describe, expect, it } from 'vitest'
import {
  MemoryAdapter,
  VecLite,
  VecLiteDimensionError,
  VecLiteIndexError,
  VecLiteValidationError,
} from '../src/index.js'

const __dir = dirname(fileURLToPath(import.meta.url))

beforeAll(async () => {
  const wasmBytes = readFileSync(join(__dir, '../src/wasm/veclite_bg.wasm'))
  await VecLite.init(wasmBytes)
})

function make(dimensions = 3) {
  return new VecLite({ dimensions, storage: new MemoryAdapter() })
}

describe('init', () => {
  it('is idempotent — calling twice does not throw', async () => {
    await expect(VecLite.init()).resolves.toBeUndefined()
  })

  it('throws VecLiteIndexError if constructor called without init', () => {
    const origReady = (VecLite as any).wasmReady
    ;(VecLite as any).wasmReady = false
    expect(() => new VecLite({ dimensions: 3, storage: new MemoryAdapter() })).toThrow(
      VecLiteIndexError,
    )
    ;(VecLite as any).wasmReady = origReady
  })
})

describe('upsert + search', () => {
  it('upserted vector is found and score is 1.0 for identical query', () => {
    const db = make()
    db.upsert([{ id: 'a', vector: [1, 0, 0], metadata: { cat: 'science' } }])
    const results = db.search({ vector: [1, 0, 0], topK: 1 })
    expect(results).toHaveLength(1)
    expect(results[0].id).toBe('a')
    expect(results[0].score).toBeCloseTo(1.0, 5)
    expect(results[0].metadata.cat).toBe('science')
  })

  it('results are sorted by score descending', () => {
    const db = make()
    db.upsert([
      { id: 'a', vector: [1, 0, 0] },
      { id: 'b', vector: [0, 1, 0] },
      { id: 'c', vector: [1, 1, 0] },
    ])
    const [first, second, third] = db.search({ vector: [1, 0, 0], topK: 3 })
    expect(first.id).toBe('a')
    expect(second.id).toBe('c')
    expect(third.id).toBe('b')
  })

  it('topK limits results', () => {
    const db = make()
    db.upsert([
      { id: 'a', vector: [1, 0, 0] },
      { id: 'b', vector: [0, 1, 0] },
      { id: 'c', vector: [0, 0, 1] },
    ])
    expect(db.search({ vector: [1, 0, 0], topK: 2 })).toHaveLength(2)
  })

  it('upsert replaces entry with the same id', () => {
    const db = make()
    db.upsert([{ id: 'a', vector: [1, 0, 0] }])
    db.upsert([{ id: 'a', vector: [0, 1, 0] }])
    expect(db.size).toBe(1)
    const results = db.search({ vector: [0, 1, 0], topK: 1 })
    expect(results[0].score).toBeCloseTo(1.0, 5)
  })

  it('metadata without explicit field defaults to empty object', () => {
    const db = make()
    db.upsert([{ id: 'a', vector: [1, 0, 0] }])
    const results = db.search({ vector: [1, 0, 0], topK: 1 })
    expect(results[0].metadata).toEqual({})
  })
})

describe('size', () => {
  it('reflects current entry count through mutations', () => {
    const db = make()
    expect(db.size).toBe(0)
    db.upsert([{ id: 'a', vector: [1, 0, 0] }])
    expect(db.size).toBe(1)
    db.upsert([{ id: 'b', vector: [0, 1, 0] }])
    expect(db.size).toBe(2)
    db.delete(['a'])
    expect(db.size).toBe(1)
    db.clear()
    expect(db.size).toBe(0)
  })
})

describe('filter', () => {
  it('string filter — only matching entries are returned', () => {
    const db = make()
    db.upsert([
      { id: 'a', vector: [1, 0, 0], metadata: { cat: 'science' } },
      { id: 'b', vector: [1, 0, 0], metadata: { cat: 'math' } },
    ])
    const results = db.search({ vector: [1, 0, 0], topK: 10, filter: { cat: 'science' } })
    expect(results).toHaveLength(1)
    expect(results[0].id).toBe('a')
  })

  it('number filter', () => {
    const db = make()
    db.upsert([
      { id: 'a', vector: [1, 0, 0], metadata: { year: 2024 } },
      { id: 'b', vector: [1, 0, 0], metadata: { year: 2025 } },
    ])
    const results = db.search({ vector: [1, 0, 0], topK: 10, filter: { year: 2024 } })
    expect(results).toHaveLength(1)
    expect(results[0].id).toBe('a')
  })

  it('bool filter', () => {
    const db = make()
    db.upsert([
      { id: 'a', vector: [1, 0, 0], metadata: { active: true } },
      { id: 'b', vector: [1, 0, 0], metadata: { active: false } },
    ])
    const results = db.search({ vector: [1, 0, 0], topK: 10, filter: { active: true } })
    expect(results).toHaveLength(1)
    expect(results[0].id).toBe('a')
  })

  it('no filter returns all candidates', () => {
    const db = make()
    db.upsert([
      { id: 'a', vector: [1, 0, 0] },
      { id: 'b', vector: [0, 1, 0] },
    ])
    expect(db.search({ vector: [1, 0, 0], topK: 10 })).toHaveLength(2)
  })

  it('empty filter {} matches all candidates', () => {
    const db = make()
    db.upsert([
      { id: 'a', vector: [1, 0, 0], metadata: { cat: 'science' } },
      { id: 'b', vector: [1, 0, 0], metadata: { cat: 'math' } },
    ])
    expect(db.search({ vector: [1, 0, 0], topK: 10, filter: {} })).toHaveLength(2)
  })

  it('filter on missing key returns no results', () => {
    const db = make()
    db.upsert([{ id: 'a', vector: [1, 0, 0], metadata: { cat: 'science' } }])
    const results = db.search({ vector: [1, 0, 0], topK: 10, filter: { year: 2024 } })
    expect(results).toHaveLength(0)
  })
})

describe('delete + clear', () => {
  it('delete removes entries by id', () => {
    const db = make()
    db.upsert([
      { id: 'a', vector: [1, 0, 0] },
      { id: 'b', vector: [0, 1, 0] },
    ])
    db.delete(['a'])
    expect(db.size).toBe(1)
    expect(db.search({ vector: [1, 0, 0], topK: 10 })[0].id).toBe('b')
  })

  it('delete of non-existent id is a no-op', () => {
    const db = make()
    db.upsert([{ id: 'a', vector: [1, 0, 0] }])
    db.delete(['nonexistent'])
    expect(db.size).toBe(1)
  })

  it('clear empties the index', () => {
    const db = make()
    db.upsert([{ id: 'a', vector: [1, 0, 0] }])
    db.clear()
    expect(db.size).toBe(0)
    expect(db.search({ vector: [1, 0, 0], topK: 10 })).toHaveLength(0)
  })
})

describe('validation', () => {
  it('throws VecLiteDimensionError on wrong vector length in upsert', () => {
    const db = make(3)
    expect(() => db.upsert([{ id: 'a', vector: [1, 0] }])).toThrow(VecLiteDimensionError)
  })

  it('throws VecLiteDimensionError on wrong vector length in search', () => {
    const db = make(3)
    expect(() => db.search({ vector: [1, 0], topK: 1 })).toThrow(VecLiteDimensionError)
  })

  it('throws VecLiteValidationError for NaN in vector', () => {
    const db = make()
    expect(() => db.upsert([{ id: 'a', vector: [1, NaN, 0] }])).toThrow(VecLiteValidationError)
  })

  it('throws VecLiteValidationError for Infinity in vector', () => {
    const db = make()
    expect(() => db.upsert([{ id: 'a', vector: [1, Infinity, 0] }])).toThrow(
      VecLiteValidationError,
    )
  })

  it('throws VecLiteValidationError for -Infinity in vector', () => {
    const db = make()
    expect(() => db.upsert([{ id: 'a', vector: [1, -Infinity, 0] }])).toThrow(
      VecLiteValidationError,
    )
  })

  it('silently drops __proto__ metadata key', () => {
    const db = make()
    db.upsert([{ id: 'a', vector: [1, 0, 0], metadata: { __proto__: 'evil', safe: 'ok' } as any }])
    const results = db.search({ vector: [1, 0, 0], topK: 1 })
    expect(Object.prototype.hasOwnProperty.call(results[0].metadata, '__proto__')).toBe(false)
    expect(results[0].metadata.safe).toBe('ok')
  })

  it('silently drops constructor and prototype metadata keys', () => {
    const db = make()
    db.upsert([
      { id: 'a', vector: [1, 0, 0], metadata: { constructor: 'x', prototype: 'y' } as any },
    ])
    const results = db.search({ vector: [1, 0, 0], topK: 1 })
    expect(Object.prototype.hasOwnProperty.call(results[0].metadata, 'constructor')).toBe(false)
    expect(Object.prototype.hasOwnProperty.call(results[0].metadata, 'prototype')).toBe(false)
  })

  it('throws VecLiteValidationError for object metadata value', () => {
    const db = make()
    expect(() =>
      db.upsert([{ id: 'a', vector: [1, 0, 0], metadata: { bad: {} as any } }]),
    ).toThrow(VecLiteValidationError)
  })
})

describe('persistence', () => {
  it('save + load round-trips entries through MemoryAdapter', async () => {
    const adapter = new MemoryAdapter()

    const db1 = new VecLite({ dimensions: 3, storage: adapter })
    db1.upsert([
      { id: 'a', vector: [1, 0, 0], metadata: { cat: 'science' } },
      { id: 'b', vector: [0, 1, 0], metadata: { year: 2024 } },
    ])
    await db1.save()

    const db2 = new VecLite({ dimensions: 3, storage: adapter })
    await db2.load()
    expect(db2.size).toBe(2)
    const results = db2.search({ vector: [1, 0, 0], topK: 1 })
    expect(results[0].id).toBe('a')
    expect(results[0].metadata.cat).toBe('science')
  })

  it('load from empty adapter is a no-op', async () => {
    const db = new VecLite({ dimensions: 3, storage: new MemoryAdapter() })
    await expect(db.load()).resolves.toBeUndefined()
    expect(db.size).toBe(0)
  })

  it('save overwrites previous save — clear then save persists empty state', async () => {
    const adapter = new MemoryAdapter()
    const db1 = new VecLite({ dimensions: 3, storage: adapter })
    db1.upsert([{ id: 'a', vector: [1, 0, 0] }])
    await db1.save()
    db1.clear()
    await db1.save()

    const db2 = new VecLite({ dimensions: 3, storage: adapter })
    await db2.load()
    expect(db2.size).toBe(0)
  })

  it('load into non-empty index merges (upsert semantics)', async () => {
    const adapter = new MemoryAdapter()
    const db1 = new VecLite({ dimensions: 3, storage: adapter })
    db1.upsert([{ id: 'a', vector: [1, 0, 0] }])
    await db1.save()

    const db2 = new VecLite({ dimensions: 3, storage: adapter })
    db2.upsert([{ id: 'b', vector: [0, 1, 0] }])
    await db2.load()
    expect(db2.size).toBe(2)
  })
})

describe('filter operators (v0.2)', () => {
  // Shared fixture: 4 entries with numeric year and string category
  function makeFilterDb() {
    const db = make()
    db.upsert([
      { id: 'a', vector: [1, 0, 0], metadata: { cat: 'science', year: 2019 } },
      { id: 'b', vector: [1, 0, 0], metadata: { cat: 'science', year: 2021 } },
      { id: 'c', vector: [1, 0, 0], metadata: { cat: 'tech', year: 2022 } },
      { id: 'd', vector: [1, 0, 0], metadata: { cat: 'tech', year: 2023 } },
    ])
    return db
  }

  // ── $gte ──────────────────────────────────────────────────────────────────

  it('$gte — returns entries with year >= 2021', () => {
    const db = makeFilterDb()
    const results = db.search({ vector: [1, 0, 0], topK: 10, filter: { year: { $gte: 2021 } } })
    const ids = results.map((r) => r.id).sort()
    expect(ids).toEqual(['b', 'c', 'd'])
  })

  it('$gte — no results when threshold exceeds all entries', () => {
    const db = makeFilterDb()
    const results = db.search({ vector: [1, 0, 0], topK: 10, filter: { year: { $gte: 2030 } } })
    expect(results).toHaveLength(0)
  })

  // ── $lte ──────────────────────────────────────────────────────────────────

  it('$lte — returns entries with year <= 2021', () => {
    const db = makeFilterDb()
    const results = db.search({ vector: [1, 0, 0], topK: 10, filter: { year: { $lte: 2021 } } })
    const ids = results.map((r) => r.id).sort()
    expect(ids).toEqual(['a', 'b'])
  })

  it('$lte — no results when threshold is below all entries', () => {
    const db = makeFilterDb()
    const results = db.search({ vector: [1, 0, 0], topK: 10, filter: { year: { $lte: 2000 } } })
    expect(results).toHaveLength(0)
  })

  // ── $in ───────────────────────────────────────────────────────────────────

  it('$in — matches entries whose category is in the array', () => {
    const db = makeFilterDb()
    const results = db.search({
      vector: [1, 0, 0],
      topK: 10,
      filter: { cat: { $in: ['science'] } },
    })
    const ids = results.map((r) => r.id).sort()
    expect(ids).toEqual(['a', 'b'])
  })

  it('$in — matches multiple values', () => {
    const db = makeFilterDb()
    const results = db.search({
      vector: [1, 0, 0],
      topK: 10,
      filter: { cat: { $in: ['science', 'tech'] } },
    })
    expect(results).toHaveLength(4)
  })

  it('$in — empty array matches nothing', () => {
    const db = makeFilterDb()
    const results = db.search({
      vector: [1, 0, 0],
      topK: 10,
      filter: { cat: { $in: [] } },
    })
    expect(results).toHaveLength(0)
  })

  // ── $ne ───────────────────────────────────────────────────────────────────

  it('$ne — excludes entry with matching value', () => {
    const db = makeFilterDb()
    const results = db.search({
      vector: [1, 0, 0],
      topK: 10,
      filter: { cat: { $ne: 'science' } },
    })
    const ids = results.map((r) => r.id).sort()
    expect(ids).toEqual(['c', 'd'])
  })

  // ── Range ($gte + $lte combined) ─────────────────────────────────────────

  it('combined $gte + $lte narrows range correctly', () => {
    const db = makeFilterDb()
    const results = db.search({
      vector: [1, 0, 0],
      topK: 10,
      filter: { year: { $gte: 2021, $lte: 2022 } },
    })
    const ids = results.map((r) => r.id).sort()
    expect(ids).toEqual(['b', 'c'])
  })

  // ── Mixed exact + operator ────────────────────────────────────────────────

  it('mixed filter — exact cat + $gte year both must hold', () => {
    const db = makeFilterDb()
    const results = db.search({
      vector: [1, 0, 0],
      topK: 10,
      filter: { cat: 'science', year: { $gte: 2021 } },
    })
    const ids = results.map((r) => r.id).sort()
    expect(ids).toEqual(['b'])
  })

  it('mixed filter — result empty when exact fails', () => {
    const db = makeFilterDb()
    const results = db.search({
      vector: [1, 0, 0],
      topK: 10,
      filter: { cat: 'physics', year: { $gte: 2021 } },
    })
    expect(results).toHaveLength(0)
  })

  // ── Backwards compatibility ───────────────────────────────────────────────

  it('v0.1 exact-match filter still works unchanged', () => {
    const db = makeFilterDb()
    const results = db.search({
      vector: [1, 0, 0],
      topK: 10,
      filter: { cat: 'tech' },
    })
    const ids = results.map((r) => r.id).sort()
    expect(ids).toEqual(['c', 'd'])
  })

  // ── Validator rejects invalid operator input ──────────────────────────────

  it('validator rejects unknown operator key', () => {
    const db = make()
    db.upsert([{ id: 'a', vector: [1, 0, 0], metadata: { year: 2024 } }])
    expect(() =>
      db.search({ vector: [1, 0, 0], topK: 1, filter: { year: { $exists: true } as any } }),
    ).toThrow(VecLiteValidationError)
  })

  it('validator rejects $gte with non-number value', () => {
    const db = make()
    db.upsert([{ id: 'a', vector: [1, 0, 0], metadata: { year: 2024 } }])
    expect(() =>
      db.search({ vector: [1, 0, 0], topK: 1, filter: { year: { $gte: 'oops' as any } } }),
    ).toThrow(VecLiteValidationError)
  })

  it('validator rejects $in with non-array value', () => {
    const db = make()
    db.upsert([{ id: 'a', vector: [1, 0, 0], metadata: { cat: 'science' } }])
    expect(() =>
      db.search({ vector: [1, 0, 0], topK: 1, filter: { cat: { $in: 'science' as any } } }),
    ).toThrow(VecLiteValidationError)
  })

  it('validator rejects empty operator object', () => {
    const db = make()
    db.upsert([{ id: 'a', vector: [1, 0, 0], metadata: { year: 2024 } }])
    expect(() =>
      db.search({ vector: [1, 0, 0], topK: 1, filter: { year: {} as any } }),
    ).toThrow(VecLiteValidationError)
  })
})

describe('distance metrics (v0.3)', () => {
  it('flat l2 — nearest by Euclidean distance wins', () => {
    const db = new VecLite({ dimensions: 3, storage: new MemoryAdapter(), metric: 'l2' })
    // a is closer to [1,0,0] by L2 than b
    db.upsert([
      { id: 'a', vector: [0.9, 0.1, 0.0] },
      { id: 'b', vector: [0.0, 1.0, 0.0] },
    ])
    const results = db.search({ vector: [1, 0, 0], topK: 1 })
    expect(results[0].id).toBe('a')
  })

  it('flat l2 — score is 1/(1+distance), identical vector scores 1', () => {
    const db = new VecLite({ dimensions: 3, storage: new MemoryAdapter(), metric: 'l2' })
    db.upsert([{ id: 'a', vector: [1, 0, 0] }])
    const results = db.search({ vector: [1, 0, 0], topK: 1 })
    expect(results[0].score).toBeCloseTo(1.0, 5)
  })

  it('flat dot — highest dot product wins', () => {
    const db = new VecLite({ dimensions: 3, storage: new MemoryAdapter(), metric: 'dot' })
    db.upsert([
      { id: 'a', vector: [2, 0, 0] },
      { id: 'b', vector: [0.5, 0, 0] },
    ])
    const results = db.search({ vector: [1, 0, 0], topK: 1 })
    expect(results[0].id).toBe('a')
  })

  it('flat dot — score equals raw dot product', () => {
    const db = new VecLite({ dimensions: 3, storage: new MemoryAdapter(), metric: 'dot' })
    db.upsert([{ id: 'a', vector: [0.6, 0.8, 0] }])
    const results = db.search({ vector: [1, 0, 0], topK: 1 })
    // dot([1,0,0], [0.6,0.8,0]) = 0.6
    expect(results[0].score).toBeCloseTo(0.6, 5)
  })

  it('flat unknown metric defaults to cosine', () => {
    const db = new VecLite({
      dimensions: 3,
      storage: new MemoryAdapter(),
      metric: 'cosine',
    })
    db.upsert([{ id: 'a', vector: [1, 0, 0] }])
    const results = db.search({ vector: [1, 0, 0], topK: 1 })
    expect(results[0].score).toBeCloseTo(1.0, 5)
  })
})

describe('HNSW index (v0.3)', () => {
  function makeHnsw(metric: 'cosine' | 'l2' | 'dot' = 'cosine') {
    return new VecLite({
      dimensions: 3,
      storage: new MemoryAdapter(),
      indexType: 'hnsw',
      metric,
      efConstruction: 100,
    })
  }

  it('upserted vector is found — cosine', () => {
    const db = makeHnsw('cosine')
    db.upsert([{ id: 'a', vector: [1, 0, 0] }])
    const results = db.search({ vector: [1, 0, 0], topK: 1 })
    expect(results).toHaveLength(1)
    expect(results[0].id).toBe('a')
    expect(results[0].score).toBeCloseTo(1.0, 4)
  })

  it('upserted vector is found — l2', () => {
    const db = makeHnsw('l2')
    db.upsert([
      { id: 'a', vector: [0.9, 0.1, 0.0] },
      { id: 'b', vector: [0.0, 1.0, 0.0] },
    ])
    const results = db.search({ vector: [1, 0, 0], topK: 1 })
    expect(results[0].id).toBe('a')
  })

  it('upserted vector is found — dot', () => {
    const db = makeHnsw('dot')
    db.upsert([
      { id: 'a', vector: [0.9, 0, 0] },
      { id: 'b', vector: [0.1, 0, 0] },
    ])
    const results = db.search({ vector: [1, 0, 0], topK: 1 })
    expect(results[0].id).toBe('a')
  })

  it('topK limits results', () => {
    const db = makeHnsw()
    db.upsert([
      { id: 'a', vector: [1, 0, 0] },
      { id: 'b', vector: [0, 1, 0] },
      { id: 'c', vector: [0, 0, 1] },
    ])
    expect(db.search({ vector: [1, 0, 0], topK: 2 })).toHaveLength(2)
  })

  it('delete removes entry from results', () => {
    const db = makeHnsw()
    db.upsert([
      { id: 'a', vector: [1, 0, 0] },
      { id: 'b', vector: [0, 1, 0] },
    ])
    db.delete(['a'])
    expect(db.size).toBe(1)
    const results = db.search({ vector: [1, 0, 0], topK: 5 })
    expect(results.every((r) => r.id !== 'a')).toBe(true)
  })

  it('clear empties the index', () => {
    const db = makeHnsw()
    db.upsert([{ id: 'a', vector: [1, 0, 0] }])
    db.clear()
    expect(db.size).toBe(0)
    expect(db.search({ vector: [1, 0, 0], topK: 5 })).toHaveLength(0)
  })

  it('post-filter returns only matching entries', () => {
    const db = makeHnsw()
    db.upsert([
      { id: 'a', vector: [1, 0, 0], metadata: { cat: 'science' } },
      { id: 'b', vector: [1, 0, 0], metadata: { cat: 'math' } },
    ])
    const results = db.search({ vector: [1, 0, 0], topK: 10, filter: { cat: 'science' } })
    expect(results).toHaveLength(1)
    expect(results[0].id).toBe('a')
  })

  it('save + load round-trips HNSW entries through MemoryAdapter', async () => {
    const adapter = new MemoryAdapter()
    const db1 = new VecLite({
      dimensions: 3,
      storage: adapter,
      indexType: 'hnsw',
      efConstruction: 100,
    })
    db1.upsert([
      { id: 'a', vector: [1, 0, 0], metadata: { cat: 'science' } },
      { id: 'b', vector: [0, 1, 0] },
    ])
    await db1.save()

    const db2 = new VecLite({
      dimensions: 3,
      storage: adapter,
      indexType: 'hnsw',
      efConstruction: 100,
    })
    await db2.load()
    expect(db2.size).toBe(2)
    const results = db2.search({ vector: [1, 0, 0], topK: 1 })
    expect(results[0].id).toBe('a')
  })

  it('incremental append — two separate upserts with new IDs both searchable', () => {
    const db = makeHnsw()
    db.upsert([
      { id: 'a', vector: [1, 0, 0] },
      { id: 'b', vector: [0, 1, 0] },
    ])
    db.upsert([
      { id: 'c', vector: [0, 0, 1] },
      { id: 'd', vector: [1, 1, 0] },
    ])
    expect(db.size).toBe(4)
    const results = db.search({ vector: [1, 0, 0], topK: 4 })
    const ids = results.map((r) => r.id).sort()
    expect(ids).toEqual(['a', 'b', 'c', 'd'])
  })

  it('flat and HNSW return same top-1 for cosine on orthogonal vectors', () => {
    const flat = make(3)
    const hnsw = makeHnsw('cosine')
    const entries = [
      { id: 'a', vector: [1, 0, 0] as number[] },
      { id: 'b', vector: [0, 1, 0] as number[] },
      { id: 'c', vector: [0, 0, 1] as number[] },
    ]
    flat.upsert(entries)
    hnsw.upsert(entries)
    const query = { vector: [1, 0, 0], topK: 1 }
    expect(flat.search(query)[0].id).toBe(hnsw.search(query)[0].id)
  })
})
