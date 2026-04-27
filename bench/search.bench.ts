/**
 * VecLite vs pure-JS brute-force search benchmark.
 *
 * Dimensions: 128  (use DIM=1536 locally to simulate OpenAI embeddings)
 * Counts:     1k, 5k, 10k
 * topK:       10
 *
 * Run:  npm run bench
 * Full: DIM=1536 COUNTS=10000,50000,100000 npm run bench
 */

import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { beforeAll, bench, describe } from 'vitest'
import { MemoryAdapter, VecLite } from '../src/index.js'

const __dir = dirname(fileURLToPath(import.meta.url))

const DIM = Number(process.env.DIM ?? 128)
const TOP_K = 10
const COUNTS = (process.env.COUNTS ?? '1000,5000,10000')
  .split(',')
  .map(Number)

function randomVec(dim: number): number[] {
  return Array.from({ length: dim }, () => Math.random() * 2 - 1)
}

// Pure JS reference implementation — Float32Array for a fair comparison
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

function jsSearch(
  vectors: Float32Array[],
  query: Float32Array,
  topK: number,
): Array<{ i: number; score: number }> {
  const scored = vectors.map((v, i) => ({ i, score: jsCosine(v, query) }))
  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, topK)
}

beforeAll(async () => {
  const wasmBytes = readFileSync(join(__dir, '../src/wasm/veclite_bg.wasm'))
  await VecLite.init(wasmBytes)
})

for (const count of COUNTS) {
  describe(`${count.toLocaleString()} vectors · dim=${DIM} · topK=${TOP_K}`, () => {
    // Pre-generate data outside bench iterations
    const rawVectors = Array.from({ length: count }, () => randomVec(DIM))
    const f32Vectors = rawVectors.map((v) => new Float32Array(v))
    const query = randomVec(DIM)
    const f32Query = new Float32Array(query)

    let db: VecLite

    beforeAll(() => {
      db = new VecLite({ dimensions: DIM, storage: new MemoryAdapter() })
      db.upsert(rawVectors.map((v, i) => ({ id: String(i), vector: v })))
    })

    bench('VecLite  (Rust/WASM)', () => {
      db.search({ vector: query, topK: TOP_K })
    })

    bench('pure JS  (Float32Array)', () => {
      jsSearch(f32Vectors, f32Query, TOP_K)
    })
  })
}
