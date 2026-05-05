# Changelog

All notable changes to VecLite will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

---

## [0.4.0] — 2026-05-01

### Added

#### veclite/rag — batteries-included RAG pipeline
- `VecLiteRAG` class — zero-config RAG pipeline exposed as a `veclite/rag` sub-path export
- `rag.init(onProgress?)` — loads WASM and downloads embedding model; progress callback for first-load UX
- `rag.add(id, text, metadata?)` — chunks, embeds, and indexes a document; upsert semantics on re-add
- `rag.search(query, { topK? })` — embeds query and returns top matching chunks with `id`, `chunk`, `score`, `metadata`
- `rag.delete(id)` — removes all chunks for a document
- `rag.save()` / `rag.load()` — persists vectors and chunk map through the configured storage adapter
- `rag.clear()` — wipes in-memory index
- `rag.size` — total chunk count

#### Chunker
- Character-based text chunker with sentence-boundary detection (`. `, `!`, `?`, `\n`) and configurable overlap
- Exported as `chunk(text, chunkSize?, overlap?)` from `veclite/rag` internals

#### Build & packaging
- Dual tsup entry points: `src/index.ts` (core) and `src/rag/index.ts` (RAG pipeline)
- `./rag` sub-path in `package.json` exports — separate CJS, ESM, and `.d.ts` outputs
- `@huggingface/transformers` v3 declared as optional peer dependency

#### Tests
- 21 new Vitest tests covering `VecLiteRAG` (init, add, search, delete, upsert, save/load, clear) and `chunk` unit tests
- Total: 68 Rust tests, 121 TypeScript/Vitest tests

---

## [0.3.0] — 2026-04-30

### Added

#### HNSW index (opt-in)
- `HnswIndex` Rust struct — HNSW approximate nearest neighbour index via `hnsw` crate (rust-cv 0.11), M=16, M0=32, deterministic `Pcg64` RNG
- `indexType: 'hnsw'` config option on `VecLite` — opt-in alongside the flat index, existing users unaffected
- `efConstruction` config option — HNSW build quality parameter (default: 200)
- Post-filter strategy with oversample=10 for HNSW search with metadata filters
- Delete on HNSW triggers full graph rebuild (incremental delete deferred)
- **Note:** benchmarks show flat index outperforms HNSW at typical embedding dimensions (dim ≥ 512) — see ADR-019

#### Distance metrics
- `metric: 'l2'` — L2 (Euclidean) distance, score = `1 / (1 + distance)`
- `metric: 'dot'` — dot product; HNSW graph uses cosine distance internally, dot product recomputed at score time
- `metric` option applies to both flat and HNSW index paths
- `Metric = 'cosine' | 'l2' | 'dot'` type exported from `veclite`

#### TypeScript types
- `IndexType = 'flat' | 'hnsw'` type exported from `veclite`
- `VecLiteConfig` extended with `indexType`, `metric`, `efConstruction`

#### Tests
- 20 new Rust unit tests covering L2/dot similarity, HNSW insert/search/delete, and metric dispatch
- 14 new TypeScript integration tests for HNSW and L2/dot metric paths
- Total: 68 Rust tests, 100 TypeScript/Vitest tests

#### Benchmarks
- `bench/hnsw.bench.ts` — HNSW vs flat at 1k/5k/10k vectors, metric comparison, efConstruction tradeoff, upsert throughput, delete cost
- `LARGE_SCALE=true` flag extends benchmark to 50k/100k vectors to find flat/HNSW crossover point

---

## [0.2.0] — 2026-04-27

### Added

#### SIMD optimisation
- `cosine_similarity_simd` — explicit `core::arch::wasm32` f32x4 intrinsics; 4-lane loop with scalar tail for remainder elements
- `simd` Cargo feature flag gates the SIMD code path; scalar fallback compiles on all other targets
- `rust/.cargo/config.toml` enables `target-feature=+simd128` for all `wasm32-unknown-unknown` builds — enables both hand-written SIMD and compiler auto-vectorisation
- `build:wasm` npm script now passes `--features simd` by default

#### Metadata filter operators
- `$gte` — field value ≥ threshold (numbers only; returns false for other types)
- `$lte` — field value ≤ threshold (numbers only; returns false for other types)
- `$in` — field value is a member of the provided array (any `MetadataValue` type)
- `$ne` — field value does not equal the given value (any `MetadataValue` type)
- Multiple operators on the same key use **AND** semantics
- Operator predicates and exact-match values can be freely mixed in a single filter
- v0.1 exact-match filters (`{ category: 'science' }`) remain fully backwards compatible

#### TypeScript types
- `FilterOperator` type exported from `veclite`
- `FilterValue = MetadataValue | FilterOperator` type exported from `veclite`
- `SearchOptions.filter` updated from `Partial<Metadata>` to `Record<string, FilterValue>`

#### Validation
- `validateFilter` in `validator.ts` — rejects unknown operator keys, wrong value types, and empty operator objects before the WASM boundary

#### Tests
- 23 new Rust unit tests in `filter.rs` covering all operators, AND combinations, and mixed exact+operator filters
- 8 new test for `simd_and_scalar_paths_return_identical_results` in `similarity.rs`
- 17 new `validateFilter` unit tests in `validator.test.ts`
- 16 new filter-operator integration tests in `veclite.test.ts`
- Total: 48 Rust tests, 86 TypeScript/Vitest tests

#### Benchmarks
- New filter benchmark cases: `$gte` at ~50% selectivity and `$in` at ~25% selectivity vs unfiltered baseline

### Changed
- `Cargo.toml` version bumped to `0.2.0`
- `rust/src/types.rs` — added `FilterOperator` struct and `FilterValue` untagged enum
- `rust/src/filter.rs` — `Filter` type changed from `HashMap<String, MetadataValue>` to `HashMap<String, FilterValue>`

---

## [0.1.0] — 2026-04-27

Initial release. 🎉

### Added

#### Rust/WASM core
- Flat index with brute-force cosine similarity search
- f32-only vector storage (halves memory vs f64, SIMD-compatible)
- Exact-match metadata filtering (pre-filter strategy)
- 25 unit tests covering similarity, filtering, and edge cases

#### TypeScript API
- `VecLite` class — class-based API with explicit WASM init
- `VecLite.init(wasmInput?)` — static async initialiser, idempotent
- `db.upsert(entries)` — batch insert or replace by ID
- `db.search({ vector, topK, filter? })` — cosine similarity search, returns scored results
- `db.delete(ids)` — batch delete by ID
- `db.save()` / `db.load()` — persist/restore full index through storage adapter
- `db.clear()` — wipe in-memory index
- `db.size` — read-only count of indexed vectors
- `maxVectors` config option — cap memory growth in untrusted environments

#### Storage adapters
- `IndexedDBAdapter` — default browser adapter, persists across page reloads
- `MemoryAdapter` — in-memory only, no persistence, ideal for testing
- `StorageAdapter` interface — generic key/value contract for community adapters

#### Error types
- `VecLiteDimensionError` — vector length ≠ configured dimensions
- `VecLiteValidationError` — NaN, Infinity, invalid metadata value
- `VecLiteIndexError` — WASM not initialised or internal error
- `VecLiteStorageError` — storage adapter failure

#### Security
- Full input validation in TypeScript before every WASM boundary crossing
- NaN and Infinity checks on all vectors
- Metadata key sanitisation — silently drops `__proto__`, `constructor`, `prototype`

#### Build
- `wasm-pack` + `wasm-bindgen` — Rust → WASM compilation
- `tsup` — TypeScript bundling (ESM + CJS)
- External `.wasm` file (not base64 inlined) — browser-friendly, cacheable
- Bundle: 120 KB WASM raw / 52 KB brotli, 17 KB JS ESM

#### Benchmarks
- 4.2–5.3× faster than pure-JS Float32Array at 1k–10k vectors (dim=128)

#### CI
- GitHub Actions: Rust tests + TypeScript build + tests on every push and PR

---

[Unreleased]: https://github.com/thealpha93/VecLite/compare/v0.4.0...HEAD
[0.4.0]: https://github.com/thealpha93/VecLite/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/thealpha93/VecLite/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/thealpha93/VecLite/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/thealpha93/VecLite/releases/tag/v0.1.0
