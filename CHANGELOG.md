# Changelog

All notable changes to VecLite will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

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

[Unreleased]: https://github.com/thealpha93/VecLite/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/thealpha93/VecLite/releases/tag/v0.1.0
