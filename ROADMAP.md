# VecLite Roadmap

This document outlines the planned future development for VecLite. This is a living document and priorities may shift based on community feedback.

## Current Status: v0.3.0
*Status: Released*

---

## Released: v0.1.0

The initial release focuses on correctness, stability, and proving the Rust/WASM and TypeScript hybrid architecture.
- [x] Brute-force exact-match flat index
- [x] Cosine similarity calculations
- [x] Pre-filter exact-match metadata filtering
- [x] Pluggable generic `StorageAdapter` interface
- [x] In-memory and IndexedDB adapters

---

## Released: v0.2.0
*Focus: Performance at production dimensions + richer filtering*

- [x] **SIMD Optimisation:** Explicit `core::arch::wasm32` f32x4 intrinsics for cosine similarity. Gated by `simd` Cargo feature flag; scalar fallback for non-WASM targets. `simd128` target feature enabled via `.cargo/config.toml` for all wasm32 builds.
- [x] **Metadata Filter Operators:** `$gte`, `$lte`, `$in`, `$ne`. Mixed freely with exact-match values. AND semantics across keys and operators. v0.1 exact-match filters fully backwards compatible.

---

## Released: v0.3.0
*Focus: Algorithm — scale the search core*

HNSW and distance metrics are coupled: HNSW internally needs a distance function, so the metric abstraction gets designed here. Shipped the full algorithm story together.

### Core Algorithms & Indexing
- [x] **HNSW Index (Approximate Nearest Neighbor):** Opt-in approximate nearest neighbour index via `indexType: 'hnsw'`. Uses `hnsw` crate (rust-cv), M=16, M0=32, deterministic `Pcg64` RNG. Post-filter strategy with oversample=10. Note: benchmarks show flat outperforms HNSW at typical embedding dimensions (dim ≥ 512) — see ADR-019.
- [x] **Additional Distance Metrics:** L2 (Euclidean) distance and Dot Product alongside Cosine Similarity. `metric` specified at construction time; applies to both flat and HNSW index paths. Rust test count: 68. TypeScript test count: 100.

---

## Released: v0.4.0
*Focus: RAG pipeline — veclite/rag*

A batteries-included RAG pipeline as a sub-path export of the same package. Bring a document, get semantic search. Chunking, embedding, and VecLite search under the hood. Zero config.

### veclite/rag
- **Sub-path export:** `import { VecLiteRAG } from 'veclite/rag'` — separate entry point, no impact on core bundle. `@xenova/transformers` is an optional peer dependency, only required when using `/rag`.
- **Zero-config RAG:** `new VecLiteRAG()` works out of the box. Uses `Xenova/all-MiniLM-L6-v2` (dim=384) by default — runs fully in the browser, no API keys, no data leaves the device.
- **Document ingestion:** `rag.add(id, text, metadata?)` — handles chunking and embedding internally.
- **Semantic search:** `rag.search(query, { topK })` — embeds the query and searches the underlying VecLite index.
- **Model progress:** `rag.init(onProgress)` — explicit model load with progress callback for first-load UX.
- **Non-blocking embedding:** transformers.js worker pipeline runs embedding off the main thread — no UI jank during `add()` or `search()`.
- **Pluggable:** Custom model, chunk size, chunk overlap, and storage adapter all configurable.

```typescript
import { VecLiteRAG } from 'veclite/rag'

const rag = new VecLiteRAG()
await rag.init(({ loaded, total }) => console.log(`${loaded}/${total}`))

await rag.add('doc1', 'The quick brown fox...', { source: 'notes' })
const results = await rag.search('fast animals', { topK: 5 })
// → [{ id: 'doc1', score: 0.94, chunk: '...', metadata: { source: 'notes' } }]

await rag.save()
await rag.load()
```

---

## Planned: v0.5.0
*Focus: Ecosystem — run VecLite everywhere*

### Runtimes
- **Web Worker Support:** Clean API for running core VecLite search off the main thread. Note: RAG embedding already runs off-thread via transformers.js worker pipeline in v0.4 — this covers the core search path for large indices.
- **Node.js Native Support:** Out-of-the-box support for server environments without requiring custom `fs` buffer loading.
- **React Native Support:** Guaranteed compatibility with mobile React Native architectures.

### Storage
- **Chunked Persistence:** Revisited after RAG ships. At RAG scale (dim=384, ~10k chunks), the current JSON blob is adequate. Re-evaluated if users hit limits at larger scales.

### Distribution
- **Base64 Inlined WASM:** Alternative distribution that bundles the WASM for zero-config deployments where bundle size is not the primary constraint.

---

## Beyond v0.5

Features not on the immediate roadmap but under consideration:
- Cloud syncing mechanisms
- Built-in multi-tenant indices

---

## Want to contribute?
Check out the `good first issue` label on our GitHub repository or look through [CONTRIBUTING.md](./CONTRIBUTING.md) to see how you can help us achieve this roadmap!