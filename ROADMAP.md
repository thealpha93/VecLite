# VecLite Roadmap

This document outlines the planned future development for VecLite. This is a living document and priorities may shift based on community feedback.

## Current Status: v0.2.0
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

## Planned: v0.3.0
*Focus: Algorithm — scale the search core*

HNSW and distance metrics are coupled: HNSW internally needs a distance function, so the metric abstraction gets designed here regardless. Ship the full algorithm story together.

### Core Algorithms & Indexing
- **HNSW Index (Approximate Nearest Neighbor):** Hierarchical Navigable Small World graphs for sub-linear search beyond 100k vectors. Opt-in alongside the flat index — existing users unaffected. Recall tested against the flat index as ground truth before shipping.
- **Additional Distance Metrics:** L2 (Euclidean) distance and Dot Product alongside Cosine Similarity. Metric specified at construction time; applies to both flat and HNSW index paths.

---

## Planned: v0.4.0
*Focus: Storage — persistence at scale*

Kept separate from v0.3 because the storage work is independent of the algorithm work, and the outcome of chunked persistence determines whether domain-aware storage is even necessary.

### Storage
- **Chunked Persistence:** Replacing the current single JSON blob in `save/load` with a binary format (packed f32 buffer + JSON metadata sidecar). Includes a versioned format and migration path from the v0.1/v0.2 JSON snapshot.
- **Domain-Aware Storage API (Evaluation):** Re-evaluating the `StorageAdapter` interface to support selective index loading. Decided after chunked persistence ships — may be unnecessary if chunked persistence resolves memory pressure on its own.

---

## Planned: v0.5.0
*Focus: Ecosystem — run VecLite everywhere*

### Runtimes
- **Web Worker Support:** Clean API for running VecLite computations off the main thread to prevent UI blocking.
- **Node.js Native Support:** Out-of-the-box support for server environments without requiring custom `fs` buffer loading.
- **React Native Support:** Guaranteed compatibility with mobile React Native architectures.

### Distribution
- **Base64 Inlined WASM:** Alternative distribution that bundles the WASM for zero-config deployments where bundle size is not the primary constraint.

---

## Beyond v0.5

Features not on the immediate roadmap but under consideration:
- Cloud syncing mechanisms
- Built-in multi-tenant indices
- Out-of-the-box local inference and embedding generation bindings

---

## Want to contribute?
Check out the `good first issue` label on our GitHub repository or look through [CONTRIBUTING.md](./CONTRIBUTING.md) to see how you can help us achieve this roadmap!