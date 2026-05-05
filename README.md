# VecLite

[![npm version](https://img.shields.io/npm/v/veclite.svg)](https://www.npmjs.com/package/veclite)
[![CI](https://github.com/thealpha93/VecLite/actions/workflows/ci.yml/badge.svg)](https://github.com/thealpha93/VecLite/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)**Client-side vector search that scales.**
Rust/WASM powered — works where pure JS breaks down.

**Client-side vector search that scales.**

Search 100k vectors in 400ms — entirely in the browser.
No server. No API keys. No data leaves the device.

Built on a Rust/WASM core with SIMD — ~4x faster than pure JS 
at production embedding dimensions. Exact results, pluggable 
storage, MongoDB-style filter operators.

## What can you build with this?

- **Semantic document search** — search your notes, docs, or knowledge base entirely client-side
- **Privacy-first RAG** — retrieval-augmented generation where user data never leaves the browser
- **Offline-capable search** — semantic search that works without internet, via Service Workers
- **In-browser recommendation** — personalised results computed locally, no backend required
- **Developer tools** — AI-powered search in browser extensions or Electron apps

## Why

Pure JS vector search tops out around 1k–5k vectors before latency becomes noticeable. VecLite uses a Rust/WASM core for brute-force cosine similarity — **~4× faster than pure JS** at 10k+ vectors, with no GC pauses and direct SIMD-compatible memory layout.

| Library | Runtime | Target scale | Algorithm |
|---|---|---|---|
| VecLite | Rust/WASM + SIMD | 10k–100k+ | Brute-force flat index, HNSW |
| Vectra | Pure JS | ≤5k | Brute-force, Node.js only |
| client-vector-search | Pure JS | ~1k | Brute-force |
| MeMemo | Pure JS | Large | ✅ | HNSW, brute-force | 

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
  metric: 'cosine',          // optional — 'cosine' (default) | 'l2' | 'dot'
  indexType: 'flat',         // optional — 'flat' (default) | 'hnsw'
  efConstruction: 200,       // optional — HNSW build quality (default: 200, ignored for flat)
})
```

**Index type guidance:** The flat index (default) is recommended for typical embedding dimensions (dim ≥ 512). At standard embedding dimensions like 1536, flat is consistently faster than HNSW at all practical browser scales — graph traversal overhead outweighs the candidate-reduction benefit. HNSW is only beneficial at low dimensions (< 128) with very large vector counts and infrequent writes. See [DECISIONS.md](./DECISIONS.md#adr-019) for benchmark data.

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

## RAG pipeline (`veclite/rag`)

A batteries-included RAG pipeline. Bring a document, get semantic search. Chunking, local embeddings via [transformers.js](https://huggingface.co/docs/transformers.js), and VecLite search under the hood — entirely in the browser.

### Installation

```bash
npm install veclite @huggingface/transformers
```

`@huggingface/transformers` is an optional peer dependency — only required when using `veclite/rag`. The core `veclite` package is unaffected.

### Usage

```typescript
import { VecLiteRAG } from 'veclite/rag'

const rag = new VecLiteRAG()

// Load WASM + download embedding model (cached by browser after first load)
await rag.init(({ loaded, total, status }) => {
  console.log(`${status}: ${loaded}/${total}`)
})

// Add documents — chunking and embedding handled internally
await rag.add('doc1', 'The quick brown fox jumps over the lazy dog.', { source: 'notes' })
await rag.add('doc2', 'Rust and WebAssembly make fast browser apps possible.')

// Semantic search — query is embedded automatically
const results = await rag.search('fast animals', { topK: 3 })
// → [{ id: 'doc1', chunk: '...', score: 0.91, metadata: { source: 'notes' } }, ...]

// Persist across sessions
await rag.save()
await rag.load()
```

### `new VecLiteRAG(config?)`

```typescript
const rag = new VecLiteRAG({
  model: 'Xenova/all-MiniLM-L6-v2', // default — dim=384, runs fully in-browser
  chunkSize: 1000,                   // chars per chunk (default: 1000)
  chunkOverlap: 100,                 // overlap between chunks (default: 100)
  storage: new MyAdapter(),          // default: IndexedDBAdapter
})
```

### `rag.init(onProgress?)`

Loads the WASM module and downloads the embedding model. Must be called before any other method. The model is cached by the browser after the first load — subsequent `init()` calls are fast.

### `rag.add(id, text, metadata?)`

Chunks `text`, embeds each chunk, and stores them in the underlying VecLite index. Re-adding an existing `id` replaces it (upsert semantics).

### `rag.search(query, { topK? })`

Embeds `query` and returns the top matching chunks. Results include the original document `id`, the matched `chunk` text, a similarity `score`, and user `metadata` (internal fields stripped).

### `rag.delete(id)`

Removes all chunks for the given document `id`.

### `rag.save() / rag.load()`

Persists and restores the full index (vectors + chunk map) through the configured storage adapter.

### `rag.clear()`

Wipes the in-memory index. Does not affect persisted state.

### `rag.size`

Total number of chunks currently indexed (not document count).

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

| Dataset               | VecLite (v0.3) | Pure JS   | Speedup |
|-----------------------|----------------|-----------|---------|
| 10k vectors, dim=1536 | 40ms           | 152ms     | 3.8x    |
| 50k vectors, dim=1536 | 200ms          | 778ms     | 3.9x    |
| 100k vectors, dim=1536| 400ms          | 1,576ms   | 3.9x    |

Filtered search (10k vectors, dim=1536, flat index):
| Filter                | Mean   | vs unfiltered |
|-----------------------|--------|---------------|
| $gte (~50% selectivity) | 10ms | 3.9x faster   |
| $in  (~25% selectivity) | 3ms  | 12x faster    |

HNSW vs flat index (dim=1536, cosine, topK=10):
| Scale       | Flat   | HNSW ef=200 | Winner          |
|-------------|--------|-------------|-----------------|
| 1k vectors  | 0.83ms | 0.95ms      | flat 1.1x faster |
| 5k vectors  | 4.1ms  | 4.4ms       | flat 1.1x faster |
| 10k vectors | 8.2ms  | 8.8ms       | flat 1.1x faster |

At dim=1536, flat search outperforms HNSW at every scale. HNSW upsert is ~70x slower and delete (graph rebuild) is ~11,600x slower. Use the flat index (default) unless you have a specific reason for HNSW.

Benchmarks run in Vitest with Rust/WASM compiled with SIMD enabled.

## Bundle size

| File | Raw | Gzip | Brotli |
|------|-----|------|--------|
| `veclite_bg.wasm` | 120 KB | 60 KB | 52 KB |
| `index.js` (ESM glue) | 17 KB | — | — |

The WASM binary is loaded on demand via `VecLite.init()` and cached by the browser.

## Roadmap

VecLite is actively maintained. `v0.3` shipped HNSW indexing, L2/dot-product distance metrics, and 68 Rust + 100 TypeScript tests. Upcoming `v0.4` introduces **`veclite/rag`** — a batteries-included RAG pipeline. Bring a document, get semantic search. Chunking, local embeddings via transformers.js, and VecLite search under the hood. Zero config. No API keys. No data leaves the device.

Check out the full [ROADMAP.md](./ROADMAP.md) to see what's planned and how you can contribute!

## License

MIT
