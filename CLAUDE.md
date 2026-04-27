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
│   └── adapters/
│       ├── adapter.ts        ← StorageAdapter interface
│       ├── indexeddb.ts      ← default browser adapter
│       └── memory.ts         ← in-memory / testing
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
- v0.2: HNSW approximate nearest neighbour
- Rationale: Ship fast, get users, add HNSW once adoption confirmed

### Metadata filtering
- v0.1: Exact match only — { category: 'science' }
- v0.2: Basic operators — { score: { $gte: 0.8 } }
- Strategy: Pre-filter (filter candidates first, then rank by similarity)
- Rationale: Faster when filter is selective, simpler to reason about

### Data types
- f32 only (not f64)
- Rationale: OpenAI embeddings are f32, halves memory, better SIMD compatibility

### Build toolchain
- wasm-pack for compilation
- wasm-bindgen for JS/Rust bindings

### Similarity metric
- v0.1: Cosine similarity only
- v0.2: L2 (Euclidean) as option

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

## API (locked for v0.1)

```typescript
import { VecLite, IndexedDBAdapter, MemoryAdapter } from 'veclite'

// Explicit init — required before first use
await VecLite.init()

// Default (IndexedDB)
const db = new VecLite({ dimensions: 1536 })

// Custom storage adapter
const db = new VecLite({ dimensions: 1536, storage: new MyAdapter() })

// In-memory only
const db = new VecLite({ dimensions: 1536, storage: new MemoryAdapter() })

// Upsert
db.upsert([
  { id: 'doc1', vector: [...], metadata: { category: 'science' } }
])

// Search with optional filter
const results = db.search({
  vector: [...],
  topK: 5,
  filter: { category: 'science' }  // exact match only in v0.1
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

## What's deliberately deferred to v0.2
- HNSW index
- L2 distance metric
- Metadata filter operators ($gte, $lte, $in etc.)
- Node.js support
- Web Worker support
- SIMD optimisation

## Current state
- v0.1 complete and verified
- All Rust source files implemented and tested (25 unit tests)
- Full TypeScript API layer implemented and tested (53 tests)
- Build toolchain working: wasm-pack + tsup, WASM copied to dist/
- Browser WASM init path verified manually via docs/smoke-test.html
- CI configured (.github/workflows/ci.yml)
- Bundle: 120KB WASM raw / 52KB brotli, 17KB JS ESM
- Benchmark: 4.2–5.3× faster than pure-JS Float32Array at 1k–10k vectors (dim=128)

## What we're working on next
- v0.2: HNSW approximate nearest neighbour
- v0.2: L2 distance metric
- v0.2: Metadata filter operators ($gte, $lte, $in)
- v0.2: Web Worker support
- Publish to npm

## Competitors
- Vectra — Node.js only, pure JS, file-based
- client-vector-search — pure JS, targets ~1k vectors
- vector5db — pure JS, brute force only
- Our edge — Rust/WASM, meaningfully faster at 10k+ vectors

## Session notes
[Update at start and end of every session]
- Last session: v0.1 fully implemented — Rust core, TypeScript API, tests, CI, benchmarks, browser verification
- Next session: POC implementation