# VecLite

## What this is
A client-side vector search library with a Rust/WASM core and a clean
TypeScript API. Designed to work where pure JS solutions break down —
10k, 50k, 100k+ vectors in the browser. No server. No API keys. Just search.

## Core positioning
"Client-side vector search that scales.
Rust/WASM powered, works where pure JS breaks down."

## Repository structure
```
veclite/
├── CLAUDE.md
├── DECISIONS.md
├── README.md
├── package.json
├── tsconfig.json
├── .github/
│   └── workflows/
│       └── ci.yml
├── rust/
│   ├── Cargo.toml
│   └── src/
│       ├── lib.rs
│       ├── index.rs
│       ├── similarity.rs
│       ├── filter.rs
│       └── types.rs
├── src/
│   ├── index.ts
│   ├── veclite.ts
│   ├── types.ts
│   ├── validator.ts
│   ├── utils.ts
│   ├── adapters/
│   │   ├── adapter.ts        ← StorageAdapter interface
│   │   ├── indexeddb.ts      ← default browser adapter
│   │   └── memory.ts         ← in-memory / testing
│   └── rag/                  ← veclite/rag sub-path entry
│       ├── index.ts          ← public API
│       ├── types.ts          ← VecLiteRAGConfig, RAGSearchResult, ProgressCallback
│       ├── pipeline.ts       ← VecLiteRAG class
│       └── chunker.ts        ← text chunking
├── tests/
├── bench/
└── docs/
```

## Architecture layers
Three distinct layers — never mix concerns across them:

1. TypeScript API layer — input validation, error handling, persistence, DX
2. WASM boundary — keep crossings minimal, always batch, use Float32Array
3. Rust/WASM core — pure computation only, no async, no JS concepts

### Golden rule
Rust does pure computation only.
All async, persistence, and validation lives in TypeScript.

## Decisions locked

### Algorithm
- v0.1: Flat index, brute force cosine similarity
- v0.2: SIMD-accelerated cosine similarity (core::arch::wasm32 f32x4, simd Cargo feature)
- v0.3: HNSW approximate nearest neighbour (hnsw crate, M=16/M0=32, opt-in via indexType: 'hnsw')

### Metadata filtering
- v0.1: Exact match only — { category: 'science' }
- v0.2: Operator predicates — $gte, $lte, $in, $ne; exact match fully backwards compatible
- Flat index: Pre-filter (filter candidates first, then rank by similarity)
- HNSW: Post-filter with oversample=10 (fetch topK×10 from graph, apply filter, return topK)
- Rationale: Pre-filter impossible in HNSW without graph knowledge

### Data types
- f32 only (not f64)
- Rationale: OpenAI embeddings are f32, halves memory, better SIMD compatibility

### Build toolchain
- wasm-pack for compilation
- wasm-bindgen for JS/Rust bindings

### Similarity metric
- v0.1: Cosine similarity only
- v0.2: Cosine similarity with SIMD acceleration
- v0.3: L2 (Euclidean) and dot product added; metric specified at construction time (Metric = 'cosine' | 'l2' | 'dot')
- Dot product in HNSW uses cosine distance in the graph (optimized for unit vectors); actual dot product recomputed at score time

### WASM loading
- Explicit init: await VecLite.init() before first use
- Rationale: Explicit is better than implicit for a library

### Bundle strategy
- External .wasm file (not inlined as base64)
- Rationale: Bundle size matters, developers can handle hosting

### Persistence — Storage Adapter pattern
- Pure generic key/value interface — no domain knowledge in the adapter
- Adapter does not know about vectors, metadata, or search
- VecLite owns all serialisation/deserialisation
- Ships with two adapters: IndexedDBAdapter (default) and MemoryAdapter (testing/in-memory)
- Community builds SQLite, AsyncStorage, localStorage etc.
- v0.2: Evaluate Repository pattern if partial loads or native querying become necessary

```typescript
// adapter.ts — the full interface, nothing more
interface StorageAdapter {
  get(key: string): Promise<string | null>
  set(key: string, value: string): Promise<void>
  delete(key: string): Promise<void>
  clear(): Promise<void>
}
```

Usage:
```typescript
// Default — IndexedDB
const db = new VecLite({ dimensions: 1536 })

// Custom adapter
const db = new VecLite({
  dimensions: 1536,
  storage: new MyCustomAdapter()
})

// In-memory only (no persistence)
const db = new VecLite({
  dimensions: 1536,
  storage: new MemoryAdapter()
})
```

### API style
- Class-based (VecLite), not functional
- Methods: upsert, search, delete, save, load
- Metadata: Record<string, string | number | boolean>

## API (v0.3)

```typescript
import { VecLite, IndexedDBAdapter, MemoryAdapter } from 'veclite'
import type { FilterOperator, FilterValue, Metric, IndexType } from 'veclite'

// Explicit init — required before first use
await VecLite.init()

// Default (IndexedDB, flat index, cosine metric)
const db = new VecLite({ dimensions: 1536 })

// HNSW index with L2 metric
const db = new VecLite({
  dimensions: 1536,
  indexType: 'hnsw',
  metric: 'l2',
  efConstruction: 200,    // HNSW build quality (default: 200)
})

// Custom storage adapter
const db = new VecLite({ dimensions: 1536, storage: new MyAdapter() })

// In-memory only
const db = new VecLite({ dimensions: 1536, storage: new MemoryAdapter() })

// Upsert
db.upsert([
  { id: 'doc1', vector: [...], metadata: { category: 'science', year: 2024 } }
])

// Search — exact match (v0.1, still works)
const results = db.search({
  vector: [...],
  topK: 5,
  filter: { category: 'science' }
})

// Search — operator predicates (v0.2)
const results = db.search({
  vector: [...],
  topK: 5,
  filter: {
    category: 'science',        // exact match
    year:     { $gte: 2022 },  // number ≥ 2022
    status:   { $ne: 'archived' },
    tags:     { $in: ['ml', 'ai'] },
  }
})

// Persistence
await db.save()   // → IndexedDB
await db.load()   // ← IndexedDB

// Utilities
db.size           // number of vectors
db.clear()        // wipe index
```

## Error types

```typescript
VecLiteDimensionError   // vector length mismatch
VecLiteValidationError  // NaN, Infinity, invalid input
VecLiteIndexError       // WASM panic / internal error
VecLiteStorageError     // storage adapter failure (any backend)
```

## Security rules
- Validate ALL input in TypeScript before WASM boundary
- Check for NaN/Infinity in every vector
- Sanitise metadata keys (block __proto__, constructor, prototype)
- Optional maxVectors cap to prevent memory exhaustion
- Document IndexedDB exposure clearly
- Publish checksums with every release

## WASM boundary rules
- Always batch — never call WASM in a loop
- Pass vectors as flat Float32Array, not nested arrays
- Serialise metadata to JSON string before crossing
- Validate everything before it crosses — Rust should never receive malformed input

## What's deliberately deferred
- Filter operators beyond $gte, $lte, $in, $ne (e.g. $exists, $regex) — no version assigned
- Node.js support — v0.5
- Web Worker support for core search — v0.5 (RAG embedding already off-thread via transformers.js worker in v0.4)
- Chunked persistence — v0.5+, re-evaluated after RAG ships; current JSON blob is adequate at RAG scale (dim=384, ~10k chunks)
- HNSW incremental delete — deprioritised; HNSW not recommended for high-dimensional use cases (see ADR-019)

## Current state
- v0.4 complete and verified
- Rust: 68 unit tests (similarity with L2/dot, flat index with metrics, HNSW index, filter operators)
- TypeScript: 121 Vitest tests (100 core + 21 RAG including chunker unit tests)
- veclite/rag: VecLiteRAG class, character-based chunker, @huggingface/transformers v3 peer dep
- RAG storage: chunk map persisted to 'veclite:rag:v1' key, vector index to 'veclite:v1'
- Build: dual tsup entry (src/index.ts + src/rag/index.ts), both CJS/ESM/DTS
- package.json exports: "." and "./rag" sub-path, @huggingface/transformers optional peer dep
- HNSW: hnsw crate (rust-cv 0.11), M=16 M0=32, Pcg64 RNG, post-filter oversample=10
- Metrics: cosine (default), l2 (1/(1+distance) score), dot (recomputed from vectors)
- SIMD: explicit f32x4 intrinsics in similarity.rs, simd Cargo feature, scalar fallback
- Filter operators: $gte, $lte, $in, $ne; exact-match backwards compatible
- Build toolchain working: wasm-pack --features simd + tsup, WASM copied to dist/
- Browser WASM init path verified manually via docs/smoke-test.html
- CI configured (.github/workflows/ci.yml)

## What we're working on next
- Publish to npm (v0.4.0)
- v0.5: Web Worker support for core search path, Node.js native support

## Competitors
- Vectra — Node.js only, pure JS, file-based
- client-vector-search — pure JS, targets ~1k vectors
- vector5db — pure JS, brute force only
- Our edge — Rust/WASM, meaningfully faster at 10k+ vectors

## Session notes
[Update at start and end of every session]
- Last session: implemented v0.4 veclite/rag — VecLiteRAG class, chunker, types, 21 new tests (121 total), dual tsup entry, package.json exports + peerDeps, @huggingface/transformers v3
- Next session: npm publish, or v0.5 planning