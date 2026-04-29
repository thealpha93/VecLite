# VecLite

[![npm version](https://img.shields.io/npm/v/veclite.svg)](https://www.npmjs.com/package/veclite)
[![CI](https://github.com/thealpha93/VecLite/actions/workflows/ci.yml/badge.svg)](https://github.com/thealpha93/VecLite/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)**Client-side vector search that scales.**
Rust/WASM powered — works where pure JS breaks down.

Search 10k, 50k, 100k+ vectors in the browser. No server. No API keys.

## Why

Pure JS vector search tops out around 1k–5k vectors before latency becomes noticeable. VecLite uses a Rust/WASM core for brute-force cosine similarity — **5–20× faster than pure JS** at 10k+ vectors, with no GC pauses and direct SIMD-compatible memory layout.

| Library | Runtime | Target scale | Algorithm |
|---|---|---|---|
| VecLite | Rust/WASM + SIMD | 10k–100k+ | Brute-force flat index |
| Vectra | Pure JS | ≤5k | Brute-force, Node.js only |
| client-vector-search | Pure JS | ~1k | Brute-force |

## Installation

```bash
npm install veclite
```

The package ships with a `.wasm` binary. Most bundlers (Vite, webpack, esbuild) handle it automatically.

## Quick start

```typescript
import { VecLite, MemoryAdapter } from 'veclite'

// 1. Load WASM — do this once at app startup
await VecLite.init()

// 2. Create an index (IndexedDB by default, MemoryAdapter for testing)
const db = new VecLite({ dimensions: 1536 })

// 3. Upsert vectors
db.upsert([
  { id: 'doc1', vector: [...], metadata: { category: 'science', year: 2024 } },
  { id: 'doc2', vector: [...], metadata: { category: 'math',    year: 2023 } },
])

// 4. Search — exact match or operator predicates
const results = db.search({
  vector: queryEmbedding,
  topK: 5,
  filter: { category: 'science', year: { $gte: 2023 } },
})
// → [{ id: 'doc1', score: 0.94, metadata: { category: 'science', year: 2024 } }, ...]

// 5. Persist
await db.save()   // → IndexedDB
await db.load()   // ← IndexedDB

// 6. Delete / clear
db.delete(['doc1'])
db.clear()
```

## API

### `VecLite.init(wasmInput?)`

Static. Must be called before any instance is created. Idempotent — safe to call multiple times.

In browsers the WASM binary is fetched automatically. Pass a `Buffer` or `ArrayBuffer` to override (useful in Node.js and tests).

```typescript
await VecLite.init()                         // browser — fetches veclite_bg.wasm
await VecLite.init(readFileSync('...wasm'))  // Node.js / tests
```

### `new VecLite(config)`

```typescript
const db = new VecLite({
  dimensions: 1536,          // required — must match your embedding model
  storage: new MyAdapter(),  // optional — defaults to IndexedDBAdapter
  maxVectors: 100_000,       // optional — throws before exceeding this count
})
```

### `db.upsert(entries)`

Batch insert or replace. Existing `id` → replace; new `id` → insert.

```typescript
db.upsert([
  { id: 'doc1', vector: float32Array, metadata: { category: 'science' } },
])
```

### `db.search(options)`

Returns results sorted by cosine similarity (highest first).

```typescript
const results = db.search({
  vector: queryEmbedding,
  topK: 10,
  filter: { category: 'science' },              // exact match (v0.1 style)
})

// Operator predicates (v0.2) — mix freely with exact-match keys
const results = db.search({
  vector: queryEmbedding,
  topK: 10,
  filter: {
    category: 'science',          // exact match
    year:     { $gte: 2020 },     // number ≥ 2020
    score:    { $lte: 0.9 },      // number ≤ 0.9
    tags:     { $in: ['ai', 'ml'] }, // value is in array
    status:   { $ne: 'archived' }, // not equal
  },
})
// result: Array<{ id: string, score: number, metadata: Metadata }>
```

All filter predicates are combined with **AND** semantics. Filters run before similarity scoring (pre-filter strategy), so selective filters meaningfully reduce compute.

### `db.delete(ids)`

```typescript
db.delete(['doc1', 'doc2'])
```

### `db.save() / db.load()`

Persist the full index through the configured `StorageAdapter`. `save/load` serialise the entire in-memory index as a single JSON blob — suitable for up to ~50k vectors in v0.1.

### `db.clear()`

Wipes the in-memory index. Does not affect persisted state.

### `db.size`

Read-only. Current number of vectors in the index.

## Storage adapters

```typescript
import { IndexedDBAdapter, MemoryAdapter } from 'veclite'
import type { StorageAdapter } from 'veclite'

// Default — persists to browser IndexedDB
const db = new VecLite({ dimensions: 1536 })

// In-memory only — no persistence, ideal for testing
const db = new VecLite({ dimensions: 1536, storage: new MemoryAdapter() })

// Custom adapter — implement four async methods
class MyAdapter implements StorageAdapter {
  async get(key: string): Promise<string | null> { ... }
  async set(key: string, value: string): Promise<void> { ... }
  async delete(key: string): Promise<void> { ... }
  async clear(): Promise<void> { ... }
}
```

Community adapters for `localStorage`, React Native `AsyncStorage`, SQLite, etc. follow the same interface.

## Error types

```typescript
import {
  VecLiteDimensionError,   // vector length ≠ index dimensions
  VecLiteValidationError,  // NaN, Infinity, invalid metadata value
  VecLiteIndexError,       // WASM not initialised, or internal error
  VecLiteStorageError,     // storage adapter failure
} from 'veclite'
```

## Security

- All input is validated in TypeScript before crossing the WASM boundary
- Vectors are checked for `NaN` and `Infinity`
- Metadata keys `__proto__`, `constructor`, and `prototype` are silently dropped
- `maxVectors` caps memory growth in untrusted environments
- IndexedDB contents are readable by same-origin JS — document this to your users

## Building from source

```bash
# Prerequisites: Rust (stable), wasm-pack, Node.js 20+
cargo install wasm-pack

git clone https://github.com/thealpha93/VecLite.git
cd VecLite
npm install
npm run build       # wasm-pack (with SIMD) + tsup
npm test            # vitest (86 tests)
npm run test:rust   # cargo test (48 unit tests)
npm run bench       # VecLite vs pure-JS benchmark
```

## Benchmarks

Run `npm run bench` to compare VecLite against a pure-JS Float32Array implementation.
The following benchmarks were measured using 1536-dimensional vectors (standard for most OpenAI models) on an Apple M-series chip with `topK=10`:

| Dataset              | VecLite (v0.2) | Pure JS   | Speedup |
|----------------------|----------------|-----------|---------|
| 10k vectors, dim=1536 | 9.1ms         | 33.3ms    | 3.7x    |
| 50k vectors, dim=1536 | 46ms          | 183ms     | 4.0x    |
| 100k vectors, dim=1536| 85.5ms        | 343ms     | 4.0x    |

Filtered search (10k vectors, dim=1536):
| Filter               | Mean   | vs unfiltered |
|----------------------|--------|---------------|
| $gte (~50% match)    | 4.6ms  | 1.8x faster   |
| $in  (~25% match)    | 2.5ms  | 3.3x faster   |

Benchmarks run in Vitest with Rust/WASM compiled with SIMD enabled.

The performance gap scales as dataset sizes increase thanks to WASM's highly optimized, contiguous `f32` memory layout circumventing V8 JavaScript runtime garbage collection pauses.

## Bundle size

| File | Raw | Gzip | Brotli |
|------|-----|------|--------|
| `veclite_bg.wasm` | 120 KB | 60 KB | 52 KB |
| `index.js` (ESM glue) | 17 KB | — | — |

The WASM binary is loaded on demand via `VecLite.init()` and cached by the browser.

## Roadmap

VecLite is actively maintained. `v0.2` shipped SIMD-accelerated cosine similarity and operator-based metadata filtering (`$gte`, `$lte`, `$in`, `$ne`). Upcoming work for `v0.3` includes **HNSW approximate nearest neighbour** indexing, L2/dot-product distance metrics, and chunked persistence for very large datasets.

Check out the full [ROADMAP.md](./ROADMAP.md) to see what's planned and how you can contribute!

## License

MIT
