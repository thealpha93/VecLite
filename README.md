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
| VecLite | Rust/WASM | 10k–100k+ | Brute-force (v0.1), HNSW (v0.2) |
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

// 4. Search
const results = db.search({
  vector: queryEmbedding,
  topK: 5,
  filter: { category: 'science' },  // exact match only in v0.1
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
  filter: { category: 'science' },  // optional exact-match filter
})
// result: Array<{ id: string, score: number, metadata: Metadata }>
```

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
npm run build       # wasm-pack + tsup
npm test            # vitest
npm run test:rust   # cargo test (25 unit tests)
npm run bench       # VecLite vs pure-JS benchmark
```

## Benchmarks

Run `npm run bench` to compare VecLite against a pure-JS Float32Array implementation.
Measured on Apple M-series, dim=128, topK=10:

```
 1,000 vectors   VecLite 0.087ms  pure JS 0.37ms   → 4.2× faster
 5,000 vectors   VecLite 0.42ms   pure JS 2.06ms   → 4.9× faster
10,000 vectors   VecLite 0.82ms   pure JS 4.34ms   → 5.3× faster
```

The gap widens with vector count as WASM's memory layout and SIMD-friendly f32 arithmetic pull further ahead. For OpenAI `text-embedding-3-large` (3072 dims) the advantage is larger still — set `DIM=3072` to reproduce locally.

## Bundle size

| File | Raw | Gzip | Brotli |
|------|-----|------|--------|
| `veclite_bg.wasm` | 120 KB | 60 KB | 52 KB |
| `index.js` (ESM glue) | 17 KB | — | — |

The WASM binary is loaded on demand via `VecLite.init()` and cached by the browser.

## Roadmap

| Version | What's coming |
|---------|--------------|
| v0.1 | Flat index, cosine similarity, exact-match filters, IndexedDB + Memory adapters |
| v0.2 | HNSW approximate nearest neighbour, L2 distance, filter operators (`$gte`, `$lte`, `$in`), Web Worker support |

## License

MIT
