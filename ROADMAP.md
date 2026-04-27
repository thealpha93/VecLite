# VecLite Roadmap

This document outlines the planned future development for VecLite. This is a living document and priorities may shift based on community feedback.

## Current Status: v0.1.0
*Status: Released*

The initial release focuses on correctness, stability, and proving the Rust/WASM and TypeScript hybrid architecture.
- [x] Brute-force exact-match flat index
- [x] Cosine similarity calculations
- [x] Pre-filter exact-match metadata filtering
- [x] Pluggable generic `StorageAdapter` interface
- [x] In-memory and IndexedDB adapters

---

## Planned: v0.2.0
*Focus: Performance at production dimensions + richer filtering*

Benchmarks from v0.1 show a 2.8x speedup over pure JS at 1536-dimensional vectors (OpenAI embedding size). v0.2 targets two things: closing that gap further with SIMD, and making the query engine production-ready with operator-based filtering.

### Performance
- **SIMD Optimisations:** Enable WebAssembly SIMD instructions for cosine similarity computation. At production embedding dimensions (1536), SIMD processes multiple f32 values simultaneously — expected to deliver a meaningful additional speedup beyond the v0.1 baseline. Controlled via a Cargo feature flag with scalar fallback for environments without SIMD support.

### Query Engine
- **Advanced Metadata Filter Operators:** Adding support for Mongo-style query operators: `$gte`, `$lte`, `$in`, `$ne`. Exact-match filters from v0.1 remain fully backwards compatible.

---

## Planned: v0.3.0
*Focus: Scale — handle larger datasets without breaking a sweat*

### Core Algorithms & Indexing
- **HNSW Index (Approximate Nearest Neighbor):** Hierarchical Navigable Small World graphs to efficiently scale searches well beyond 100k vectors where brute-force becomes a bottleneck.
- **Additional Distance Metrics:** L2 (Euclidean) distance and Dot Product alongside Cosine Similarity.

### Storage
- **Chunked Persistence:** Replacing the current single-blob save/load with chunked serialisation for datasets where a full JSON snapshot is impractical.
- **Domain-Aware Storage API (Evaluation):** Re-evaluating the `StorageAdapter` to support selective index loading, preventing memory pressure on very large datasets.

---

## Planned: v0.4.0
*Focus: Ecosystem — run VecLite everywhere*

### Runtimes
- **Web Worker Support:** Clean API for running VecLite computations off the main thread to prevent UI blocking.
- **Node.js Native Support:** Out-of-the-box support for server environments without requiring custom `fs` buffer loading.
- **React Native Support:** Guaranteed compatibility with mobile React Native architectures.

### Distribution
- **Base64 Inlined WASM:** Alternative distribution that bundles the WASM for zero-config deployments where bundle size is not the primary constraint.

---

## Beyond v0.4

Features not on the immediate roadmap but under consideration:
- Cloud syncing mechanisms
- Built-in multi-tenant indices
- Out-of-the-box local inference and embedding generation bindings

---

## Want to contribute?
Check out the `good first issue` label on our GitHub repository or look through [CONTRIBUTING.md](./CONTRIBUTING.md) to see how you can help us achieve this roadmap!