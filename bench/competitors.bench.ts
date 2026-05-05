/**
 * VecLite vs competitors benchmark — honest comparison.
 *
 * Libraries compared:
 *   1. VecLite     — Rust/WASM + SIMD flat index (this library)
 *   2. MeMemo      — Pure JS HNSW (poloclub/mememo)
 *   3. client-vector-search — Pure JS brute-force (EmbeddingIndex)
 *   4. Pure JS     — Raw Float32Array baseline (no library)
 *
 * Vectra is excluded: it's a file-based Node.js RAG library requiring
 * OpenAI API keys — not comparable as a raw vector search engine.
 *
 * All benchmarks use the same random vectors at dim=1536 (OpenAI standard).
 *
 * Run:  npm run bench -- bench/competitors.bench.ts
 */

import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { beforeAll, bench, describe } from 'vitest'
import { MemoryAdapter, VecLite } from '../src/index.js'
import { HNSW } from 'mememo'
import { EmbeddingIndex } from 'client-vector-search'

const __dir = dirname(fileURLToPath(import.meta.url))

const DIM = Number(process.env.DIM ?? 1536)
const TOP_K = 10

// Test at three scales — 1k (where JS is fine), 5k (transition zone), 10k (pain point)
const COUNTS = (process.env.COUNTS ?? '1000,5000,10000').split(',').map(Number)

function randomVec(dim: number): number[] {
  return Array.from({ length: dim }, () => Math.random() * 2 - 1)
}

// ── Pure-JS baseline (same as search.bench.ts) ──────────────────────────────

function jsCosine(a: Float32Array, b: Float32Array): number {
  let dot = 0, na = 0, nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb)
  return denom === 0 ? 0 : dot / denom
}

function jsSearch(vectors: Float32Array[], query: Float32Array, topK: number) {
  const scored = vectors.map((v, i) => ({ i, score: jsCosine(v, query) }))
  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, topK)
}

// ── State — populated in beforeAll ──────────────────────────────────────────

interface TestCase {
  count: number
  rawVectors: number[][]
  f32Vectors: Float32Array[]
  query: number[]
  f32Query: Float32Array
  vecLiteDb: VecLite | null
  mememoIndex: HNSW | null
  cvsIndex: EmbeddingIndex | null
}

const cases: TestCase[] = COUNTS.map((count) => {
  const rawVectors = Array.from({ length: count }, () => randomVec(DIM))
  return {
    count,
    rawVectors,
    f32Vectors: rawVectors.map((v) => new Float32Array(v)),
    query: randomVec(DIM),
    f32Query: new Float32Array(randomVec(DIM)),
    vecLiteDb: null,
    mememoIndex: null,
    cvsIndex: null,
  }
})

beforeAll(async () => {
  // ── VecLite init ──
  const wasmBytes = readFileSync(join(__dir, '../src/wasm/veclite_bg.wasm'))
  await VecLite.init(wasmBytes)

  for (const c of cases) {
    // VecLite
    c.vecLiteDb = new VecLite({ dimensions: DIM, storage: new MemoryAdapter() })
    c.vecLiteDb.upsert(c.rawVectors.map((v, i) => ({ id: String(i), vector: v })))

    // MeMemo — HNSW, in-memory mode (no IndexedDB in Node)
    c.mememoIndex = new HNSW({
      distanceFunction: 'cosine',
      m: 16,
      efConstruction: 200,
      useIndexedDB: false,
    })
    const keys = c.rawVectors.map((_, i) => String(i))
    await c.mememoIndex.bulkInsert(keys, c.rawVectors)

    // client-vector-search — EmbeddingIndex
    c.cvsIndex = new EmbeddingIndex(
      c.rawVectors.map((v, i) => ({ id: String(i), embedding: v }))
    )
  }
}, 600_000) // MeMemo HNSW build at 10k×1536 can take minutes

// ── Benchmarks ──────────────────────────────────────────────────────────────

for (const c of cases) {
  describe(`${c.count.toLocaleString()} vectors · dim=${DIM} · topK=${TOP_K}`, () => {
    bench(
      'VecLite (Rust/WASM + SIMD)',
      () => {
        c.vecLiteDb!.search({ vector: c.query, topK: TOP_K })
      },
      { time: 15_000 },
    )

    bench(
      'MeMemo (JS HNSW)',
      async () => {
        await c.mememoIndex!.query(c.query, TOP_K)
      },
      { time: 15_000 },
    )

    bench(
      'client-vector-search (JS brute-force)',
      async () => {
        await c.cvsIndex!.search(c.query, { topK: TOP_K })
      },
      { time: 15_000 },
    )

    bench(
      'Pure JS (Float32Array baseline)',
      () => {
        jsSearch(c.f32Vectors, c.f32Query, TOP_K)
      },
      { time: 15_000 },
    )
  })
}
