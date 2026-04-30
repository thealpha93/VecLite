/**
 * VecLite v0.3 benchmarks — HNSW and distance metrics.
 *
 * Covers:
 *   1. HNSW vs Flat search latency at 1k / 5k / 10k vectors
 *   2. Cosine / L2 / Dot search latency on flat index (10k vectors)
 *   3. Cosine / L2 / Dot search latency on HNSW index (10k vectors)
 *   4. HNSW efConstruction tradeoff — search latency ef=50/100/200/500
 *   5. Upsert throughput — flat vs HNSW (dim=128, 500 vectors)
 *   6. Delete cost — flat O(n) vs HNSW graph rebuild
 *
 * Run:  npm run bench
 * Override dims: DIM=128 npm run bench
 */

import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { beforeAll, bench, describe } from 'vitest'
import { MemoryAdapter, VecLite } from '../src/index.js'

const __dir = dirname(fileURLToPath(import.meta.url))

const DIM = Number(process.env.DIM ?? 1536)
const TOP_K = 10
const UPSERT_DIM = 128
const UPSERT_COUNT = 500
const DELETE_BASE = 1_000

function randomVec(dim: number): number[] {
  return Array.from({ length: dim }, () => Math.random() * 2 - 1)
}

function makeEntries(count: number, dim: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: String(i),
    vector: randomVec(dim),
    metadata: {},
  }))
}

function makeDb(indexType: 'flat' | 'hnsw', metric: string, dim: number, efConstruction = 200): VecLite {
  return new VecLite({
    dimensions: dim,
    indexType,
    metric: metric as any,
    efConstruction,
    storage: new MemoryAdapter(),
  })
}

// ── Module-level variables — populated in beforeAll, referenced by closures ──
// describe/bench are registered synchronously; closures capture the reference,
// so the actual VecLite instances are resolved when benchmarks run (post-beforeAll).

// Section 1: HNSW vs Flat at 1k / 5k / 10k
let flat1k: VecLite, hnsw1k: VecLite, query1k: number[]
let flat5k: VecLite, hnsw5k: VecLite, query5k: number[]
let flat10k: VecLite, hnsw10k: VecLite, query10k: number[]

// Section 2 & 3: Metrics — flat + HNSW, 10k vectors
let cosFlat: VecLite, cosHnsw: VecLite, cosQuery: number[]
let l2Flat:  VecLite, l2Hnsw:  VecLite, l2Query:  number[]
let dotFlat: VecLite, dotHnsw: VecLite, dotQuery: number[]

// Section 4: efConstruction tradeoff
let ef50Db:  VecLite, ef100Db: VecLite
let ef200Db: VecLite, ef500Db: VecLite
let efQuery: number[]

// Section 5: upsert — fresh db per iteration
const upsertEntries = makeEntries(UPSERT_COUNT, UPSERT_DIM)

// Section 6: delete
let deleteFlat: VecLite, deleteHnsw: VecLite
let flatDelCounter = DELETE_BASE
let hnswDelCounter = DELETE_BASE

beforeAll(async () => {
  const wasmBytes = readFileSync(join(__dir, '../src/wasm/veclite_bg.wasm'))
  await VecLite.init(wasmBytes)

  // 1. Search latency at three scales
  for (const [count, setFlat, setHnsw, setQuery] of [
    [1_000,  (v: VecLite) => { flat1k  = v }, (v: VecLite) => { hnsw1k  = v }, (q: number[]) => { query1k  = q }],
    [5_000,  (v: VecLite) => { flat5k  = v }, (v: VecLite) => { hnsw5k  = v }, (q: number[]) => { query5k  = q }],
    [10_000, (v: VecLite) => { flat10k = v }, (v: VecLite) => { hnsw10k = v }, (q: number[]) => { query10k = q }],
  ] as const) {
    const entries = makeEntries(count as number, DIM)
    const flat = makeDb('flat', 'cosine', DIM)
    const hnsw = makeDb('hnsw', 'cosine', DIM, 200)
    flat.upsert(entries); hnsw.upsert(entries)
    ;(setFlat as any)(flat); (setHnsw as any)(hnsw); (setQuery as any)(randomVec(DIM))
  }

  // 2 & 3. Metrics — 10k vectors
  const metricEntries = makeEntries(10_000, DIM)
  cosFlat = makeDb('flat', 'cosine', DIM); cosHnsw = makeDb('hnsw', 'cosine', DIM, 200); cosQuery = randomVec(DIM)
  l2Flat  = makeDb('flat', 'l2',     DIM); l2Hnsw  = makeDb('hnsw', 'l2',     DIM, 200); l2Query  = randomVec(DIM)
  dotFlat = makeDb('flat', 'dot',    DIM); dotHnsw = makeDb('hnsw', 'dot',    DIM, 200); dotQuery = randomVec(DIM)
  cosFlat.upsert(metricEntries); cosHnsw.upsert(metricEntries)
  l2Flat.upsert(metricEntries);  l2Hnsw.upsert(metricEntries)
  dotFlat.upsert(metricEntries); dotHnsw.upsert(metricEntries)

  // 4. efConstruction tradeoff
  const efEntries = makeEntries(10_000, DIM); efQuery = randomVec(DIM)
  ef50Db  = makeDb('hnsw', 'cosine', DIM, 50);  ef50Db.upsert(efEntries)
  ef100Db = makeDb('hnsw', 'cosine', DIM, 100); ef100Db.upsert(efEntries)
  ef200Db = makeDb('hnsw', 'cosine', DIM, 200); ef200Db.upsert(efEntries)
  ef500Db = makeDb('hnsw', 'cosine', DIM, 500); ef500Db.upsert(efEntries)

  // 6. Delete
  const deleteBase = makeEntries(DELETE_BASE, DIM)
  deleteFlat = makeDb('flat', 'cosine', DIM); deleteFlat.upsert(deleteBase)
  deleteHnsw = makeDb('hnsw', 'cosine', DIM, 200); deleteHnsw.upsert(deleteBase)
})

// ── 1. HNSW vs Flat — search latency ─────────────────────────────────────────

describe(`HNSW vs Flat · 1,000 vectors · dim=${DIM} · topK=${TOP_K}`, () => {
  bench('flat  cosine (exact)',       () => { flat1k.search({ vector: query1k, topK: TOP_K }) }, { time: 10_000 })
  bench('hnsw  cosine ef=200 (approx)', () => { hnsw1k.search({ vector: query1k, topK: TOP_K }) }, { time: 10_000 })
})

describe(`HNSW vs Flat · 5,000 vectors · dim=${DIM} · topK=${TOP_K}`, () => {
  bench('flat  cosine (exact)',       () => { flat5k.search({ vector: query5k, topK: TOP_K }) }, { time: 10_000 })
  bench('hnsw  cosine ef=200 (approx)', () => { hnsw5k.search({ vector: query5k, topK: TOP_K }) }, { time: 10_000 })
})

describe(`HNSW vs Flat · 10,000 vectors · dim=${DIM} · topK=${TOP_K}`, () => {
  bench('flat  cosine (exact)',       () => { flat10k.search({ vector: query10k, topK: TOP_K }) }, { time: 10_000 })
  bench('hnsw  cosine ef=200 (approx)', () => { hnsw10k.search({ vector: query10k, topK: TOP_K }) }, { time: 10_000 })
})

// ── 2. Metrics — flat index ───────────────────────────────────────────────────

describe(`Metrics · Flat · 10,000 vectors · dim=${DIM} · topK=${TOP_K}`, () => {
  bench('flat  cosine', () => { cosFlat.search({ vector: cosQuery, topK: TOP_K }) }, { time: 10_000 })
  bench('flat  l2',     () => { l2Flat.search({  vector: l2Query,  topK: TOP_K }) }, { time: 10_000 })
  bench('flat  dot',    () => { dotFlat.search({ vector: dotQuery, topK: TOP_K }) }, { time: 10_000 })
})

// ── 3. Metrics — HNSW index ───────────────────────────────────────────────────

describe(`Metrics · HNSW · 10,000 vectors · dim=${DIM} · topK=${TOP_K} · ef=200`, () => {
  bench('hnsw  cosine', () => { cosHnsw.search({ vector: cosQuery, topK: TOP_K }) }, { time: 10_000 })
  bench('hnsw  l2',     () => { l2Hnsw.search({  vector: l2Query,  topK: TOP_K }) }, { time: 10_000 })
  bench('hnsw  dot',    () => { dotHnsw.search({ vector: dotQuery, topK: TOP_K }) }, { time: 10_000 })
})

// ── 4. HNSW efConstruction tradeoff — search latency ─────────────────────────

describe(`HNSW efConstruction · 10,000 vectors · dim=${DIM} · topK=${TOP_K}`, () => {
  bench('hnsw  ef= 50',  () => { ef50Db.search({  vector: efQuery, topK: TOP_K }) }, { time: 10_000 })
  bench('hnsw  ef=100',  () => { ef100Db.search({ vector: efQuery, topK: TOP_K }) }, { time: 10_000 })
  bench('hnsw  ef=200',  () => { ef200Db.search({ vector: efQuery, topK: TOP_K }) }, { time: 10_000 })
  bench('hnsw  ef=500',  () => { ef500Db.search({ vector: efQuery, topK: TOP_K }) }, { time: 10_000 })
})

// ── 5. Upsert throughput ──────────────────────────────────────────────────────

describe(`Upsert throughput · ${UPSERT_COUNT} vectors · dim=${UPSERT_DIM} (fresh index per iteration)`, () => {
  bench('flat  upsert',        () => { makeDb('flat', 'cosine', UPSERT_DIM).upsert(upsertEntries) },       { iterations: 20, warmupIterations: 2 })
  bench('hnsw  upsert ef=200', () => { makeDb('hnsw', 'cosine', UPSERT_DIM, 200).upsert(upsertEntries) }, { iterations: 20, warmupIterations: 2 })
  bench('hnsw  upsert ef=50',  () => { makeDb('hnsw', 'cosine', UPSERT_DIM, 50).upsert(upsertEntries) },  { iterations: 20, warmupIterations: 2 })
})

// ── 6. Delete cost ────────────────────────────────────────────────────────────
// Each iteration inserts one new entry then immediately deletes it,
// isolating the delete path against a stable base index.

describe(`Delete cost · base=${DELETE_BASE} vectors · dim=${DIM}`, () => {
  bench(
    'flat  delete (O(n) splice)',
    () => {
      const id = String(flatDelCounter++)
      deleteFlat.upsert([{ id, vector: randomVec(DIM), metadata: {} }])
      deleteFlat.delete([id])
    },
    { iterations: 50, warmupIterations: 5 },
  )
  bench(
    'hnsw  delete (O(n log n) rebuild)',
    () => {
      const id = String(hnswDelCounter++)
      deleteHnsw.upsert([{ id, vector: randomVec(DIM), metadata: {} }])
      deleteHnsw.delete([id])
    },
    { iterations: 20, warmupIterations: 2 },
  )
})
