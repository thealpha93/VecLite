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

The `v0.2` release will focus on scale, introducing advanced indexing, expanded query operators, and more environment support.

### Core Algorithms & Indexing
- **HNSW Index (Approximate Nearest Neighbor):** Adding Hierarchical Navigable Small World graphs to efficiently scale searches well beyond 100k vectors where brute-force becomes unviable.
- **Additional Distance Metrics:** Implementing L2 (Euclidean) distance and Dot Product alongside Cosine Similarity.
- **SIMD Optimizations:** Utilizing WebAssembly SIMD instructions for a significant bump in array processing speeds.

### Query Engine Enhancements
- **Advanced Metadata Filter Operators:** Adding support for Mongo-style query operators: `$gte`, `$lte`, `$in`, `$ne`, etc.
- **Domain-Aware Storage API (Evaluation):** Re-evaluating the `StorageAdapter` to selectively load parts of the index preventing memory overflows on very massive datasets.

### Ecosystem & Runtimes
- **Web Worker Support:** Providing a clean API or exported helper methods to run VecLite computations off the main thread to prevent UI blocking.
- **Node.js Native Support:** Offering out-of-the-box support for server environments without requiring custom `fs` buffer loading.
- **React Native Support:** Guaranteeing compatibility with mobile React Native architectures.
- **Base64 Inlined WASM:** Providing an alternative distribution that bundles the WASM explicitly for zero-config deployments where bundle size isn't the primary constraint.

---

## Beyond v0.2

Features currently not on the immediate roadmap but being considered for the distant future:
- Cloud syncing mechanisms
- Built-in multi-tenant indices
- Out-of-the-box local inference/embedding generation bindings

## Want to contribute?
Check out the `good first issue` label on our GitHub repository or look through [CONTRIBUTING.md](./CONTRIBUTING.md) to see how you can help us achieve this roadmap!
