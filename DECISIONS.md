# VecLite — Architecture Decision Record

Every significant decision is logged here with its rationale.
Do not relitigate these without explicit human approval.

---

## ADR-001: Rust/WASM core

**Decision:** Implement the vector search core in Rust, compiled to WASM.

**Rationale:**
- Pure JS is too slow at 10k+ vectors with 1536 dimensions
- Rust/WASM is 5–20x faster than pure JS for float-heavy computation
- No GC pauses, direct memory access, SIMD-compatible
- Proven by PGlite, DuckDB-WASM, Figma — the toolchain is mature

**Alternatives considered:**
- Pure TypeScript — too slow at scale, existing libs cap at ~1k vectors
- C/C++ via Emscripten — worse DX, harder to maintain

**Status:** Locked

---

## ADR-002: f32 only, no f64

**Decision:** Store and compute all vectors as f32.

**Rationale:**
- OpenAI, Cohere, and most embedding models output f32 precision
- f32 halves memory footprint vs f64 (600MB vs 1.2GB at 100k vectors)
- SIMD instructions work more efficiently with f32
- No meaningful precision loss for cosine similarity

**Alternatives considered:**
- f64 — unnecessary precision, doubles memory cost
- Mixed precision — adds complexity with no benefit

**Status:** Locked

---

## ADR-003: Flat index for v0.1/v0.2, HNSW for v0.3

**Decision:** v0.1 and v0.2 use brute force flat index. HNSW deferred to v0.3.

**Rationale:**
- Flat index is exact, simple to implement, easy to test
- Correctness is more important than speed at launch
- HNSW is complex — wrong implementation silently returns bad results
- Ship fast, get users, validate demand before investing in HNSW
- Flat index is still fast enough at 50k vectors with Rust/WASM + SIMD
- v0.2 used for SIMD + filter operators; HNSW pushed to v0.3

**Alternatives considered:**
- HNSW from day one — too complex, too risky for v0.1
- IVFFlat — good middle ground but still adds complexity

**Status:** Locked. Implement in v0.3.

---

## ADR-004: Cosine similarity only in v0.1

**Decision:** Support cosine similarity as the only distance metric in v0.1.

**Rationale:**
- Cosine similarity is the default for text embeddings (OpenAI, Cohere etc.)
- Covers 90%+ of real-world use cases
- Keeping one metric keeps the API surface small and testable

**Alternatives considered:**
- L2 (Euclidean) — useful for image embeddings, deferred to v0.3
- Dot product — faster but assumes normalised vectors, adds confusion

**Status:** Locked. L2 and dot product deferred to v0.3.

---

## ADR-005: Explicit WASM initialisation

**Decision:** Require await VecLite.init() before first use.

**Rationale:**
- WASM loading is async — hiding this creates surprising behaviour
- Explicit is better than implicit for a library
- Lazy init on first method call would throw cryptic errors if forgotten
- Developers deserve to know when async work is happening

**Alternatives considered:**
- Lazy init on first upsert/search — hides async, error-prone
- Constructor async (await VecLite.create()) — unusual pattern, less familiar

**Status:** Locked

---

## ADR-006: External .wasm file, not base64 inlined

**Decision:** Ship the WASM binary as a separate .wasm file.

**Rationale:**
- Inlining as base64 inflates JS bundle by ~33%
- Browsers cache .wasm files separately and efficiently
- Most bundlers (Vite, webpack, esbuild) handle .wasm natively
- Bundle size is a first-class concern for a client-side library

**Alternatives considered:**
- Base64 inline — zero hosting setup but unacceptable bundle size penalty
- Both (configurable) — adds complexity, defer to v0.2 if demand exists

**Status:** Locked

---

## ADR-007: Class-based API, not functional

**Decision:** VecLite is a class with methods, not a collection of functions.

**Rationale:**
- State (the WASM index, config, adapter) needs to live somewhere
- Class encapsulates state cleanly
- Familiar to developers used to Pinecone, Chroma, Vectra APIs
- Functional API with closures would be less obvious for this use case

**Alternatives considered:**
- Functional API — clean but awkward when managing stateful WASM instances
- Builder pattern — unnecessary complexity for this surface area

**Status:** Locked

---

## ADR-008: Pre-filter strategy for metadata filtering

**Decision:** Filter candidates before ranking by similarity (pre-filter).

**Rationale:**
- Faster when filter is selective — avoids computing similarity on irrelevant vectors
- Simpler to reason about and test
- Post-filter risks returning fewer than topK results when filter is narrow
- v0.2 benchmarks confirm: $in at 25% selectivity is 1.37× faster than unfiltered baseline

**Alternatives considered:**
- Post-filter — better recall in edge cases, but wasteful and confusing
- Hybrid — unnecessary complexity for v0.1 exact-match filtering

**Status:** Locked.

---

## ADR-009: Exact match metadata filtering only in v0.1; operators added in v0.2

**Decision:** v0.1 supports exact match filters only. v0.2 adds operator predicates.

**v0.1 filter shape:** `{ key: value }` — exact match, AND across keys.

**v0.2 filter shape:** each key maps to either a plain value (exact match, backwards
compatible) or an operator object:
```json
{ "year": { "$gte": 2020 }, "category": { "$in": ["science", "tech"] }, "status": { "$ne": "archived" } }
```

**Operators supported:** `$gte`, `$lte` (numbers only — return false for other types),
`$in` (array membership via PartialEq), `$ne` (not equal, any MetadataValue).

**Multiple operators on the same key** — AND semantics (all must hold).

**Representation in Rust:** `FilterValue` is an untagged serde enum:
- `Exact(MetadataValue)` — matches primitives (bool, number, string) first
- `Operator(FilterOperator)` — matches objects, all fields Optional

**TypeScript gatekeeper:** `validateFilter` in `validator.ts` rejects unknown operator
keys, wrong value types, and empty operator objects before the WASM boundary.

**Status:** Locked. Next filter additions deferred to v0.3+.

---

## ADR-010: Generic key/value StorageAdapter, no domain knowledge

**Decision:** StorageAdapter interface is a pure generic key/value contract.
The adapter has no knowledge of vectors, metadata, or VecLite internals.
VecLite owns all serialisation and deserialisation.

**Interface:**
```typescript
interface StorageAdapter {
  get(key: string): Promise<string | null>
  set(key: string, value: string): Promise<void>
  delete(key: string): Promise<void>
  clear(): Promise<void>
}
```

**Rationale:**
- Thin interface is easy for community to implement (10–20 lines)
- Serialisation in one place (VecLite) means one place to change
- Domain-aware adapters add complexity with no benefit in v0.1
- In-memory index means we load everything anyway — smart querying
  at the storage layer doesn't help us yet

**Alternatives considered:**
- Repository pattern with domain-aware interface — over-engineered for v0.1,
  revisit in v0.2 if partial loads or native querying become necessary
- Hardcoded IndexedDB — no extensibility, rules out Node.js and React Native

**Ships with:**
- IndexedDBAdapter — default browser adapter
- MemoryAdapter — in-memory only, no persistence, ideal for testing

**Status:** Locked. Revisit in v0.4 — chunked persistence ships first; domain-aware storage evaluated after, as it may be unnecessary if chunked persistence resolves memory pressure.

---

## ADR-011: WASM boundary rules

**Decision:** Strict rules govern every JS ↔ WASM crossing.

**Rules:**
1. Always batch — never call WASM in a loop, one crossing per operation
2. Pass vectors as flat Float32Array, not nested JS arrays
3. Serialise metadata to JSON string before crossing, deserialise in Rust
4. Validate all input in TypeScript before crossing — Rust never receives malformed input

**Rationale:**
- Every WASM crossing has overhead — minimise crossings
- Float32Array enables zero-copy transfer
- Rust should never panic from bad input — TypeScript is the gatekeeper

**Status:** Locked

---

## ADR-012: Metadata key sanitisation

**Decision:** Sanitise metadata keys before storing — silently drop dangerous keys.

**Blocked keys:** __proto__, constructor, prototype

**Rationale:**
- Prototype pollution via user-controlled metadata keys is a real attack vector
- Silent drop is better than throwing — malicious keys are not a user error

**Status:** Locked

---

## ADR-013: SIMD optimisation via wasm32 intrinsics, gated by Cargo feature

**Decision:** SIMD-accelerated cosine similarity is compiled only when `features = ["simd"]`
is passed to wasm-pack, and only on `wasm32` targets.

**Implementation:**
- `cosine_similarity_scalar` — always compiled, used as reference and fallback
- `cosine_similarity_simd` — `core::arch::wasm32` f32x4 intrinsics, 4-lane loop with
  scalar tail for lengths not divisible by 4; gated on `#[cfg(all(target_arch = "wasm32", feature = "simd"))]`
- Public `cosine_similarity` dispatches at compile time — no runtime branch
- `rust/.cargo/config.toml` sets `target-feature=+simd128` for `wasm32-unknown-unknown`,
  which also lets the compiler auto-vectorise the scalar loop when simd feature is off

**`build:wasm` script** passes `--features simd` — SIMD is the default shipped build.

**cargo test** (native target) is unaffected by `.cargo/config.toml`; all 48 tests run
the scalar path. The test `simd_and_scalar_paths_return_identical_results` calls both
`cosine_similarity` (SIMD on wasm32, scalar on native) and `cosine_similarity_scalar`
and asserts they agree within 1e-5.

**Alternatives considered:**
- `std::simd` portable SIMD — requires nightly toolchain; rejected
- External crate (`wide`, `packed_simd2`) — adds dependency for one function; rejected

**Status:** Locked.

---

## ADR-014: HNSW via `hnsw` crate, M=16 fixed

**Decision:** Use the `hnsw` crate (rust-cv 0.11.0) with M=16, M0=32 fixed at compile time.

**Rationale:**
- Only WASM-compatible HNSW crate (instant-distance and hnsw_rs use rayon → incompatible with wasm32-unknown-unknown)
- M=16 is the standard default used by Pinecone, Weaviate, and hnswlib
- Correct from-scratch implementation is ~800 lines; the crate gives recall-tested correctness
- Users needing other M values can recompile from source (advanced use case)
- `rand_pcg::Pcg64` used as deterministic RNG; seeded from default (zero) — sufficient for layer assignment quality

**Alternatives considered:**
- From-scratch HNSW with runtime M — correct but risky; silent recall degradation from any implementation bug
- Other crates (instant-distance, hnsw_rs) — rejected due to rayon dependency (incompatible with wasm32)

**Status:** Locked.

---

## ADR-015: Metric abstraction — string at WASM boundary, enum in Rust

**Decision:** Metric is passed as a `&str` ("cosine" | "l2" | "dot") to WASM constructors and parsed to an internal `Metric` enum. TypeScript exposes `Metric = 'cosine' | 'l2' | 'dot'`.

**Rationale:**
- wasm-bindgen cannot export generic structs; a Rust trait-based metric would require wasm-bindgen generics or dynamic dispatch
- String parameter keeps the WASM boundary simple and consistent with the existing JSON-string convention
- `Metric::from_str` defaults to cosine for unknown values — safe fallback, no panic

**Status:** Locked.

---

## ADR-016: HNSW post-filter with oversample=10; flat index keeps pre-filter

**Decision:** HNSW search fetches `topK × 10` candidates from the graph, applies metadata filter post-hoc, returns top `topK`. Flat index retains pre-filter (unchanged from v0.2).

**Rationale:**
- Pre-filter requires knowing candidates before graph traversal — impossible in HNSW without re-architecting the graph
- Oversample=10 balances recall vs wasted computation; at 25% selectivity this returns enough candidates
- Flat index pre-filter is still exact and fast; no reason to change it

**Limitation:** Narrow filters with selectivity < 1/oversample may return fewer than `topK` results. Increasing `efConstruction` helps but does not guarantee full topK under extreme filters.

**Status:** Locked. Oversample factor may be revisited in v0.3+.

---

## ADR-017: HNSW distance metrics as u32 bit patterns; dot product uses cosine distance in graph

**Decision:** `space::Metric::Unit = u32` for all three metrics. f32 distances are stored as their IEEE 754 bit pattern (positive f32 values preserve ordering under u32 reinterpretation). Dot product uses `1 - dot_product` as the graph distance (equivalent to cosine distance for unit vectors); actual dot product is recomputed from vectors at score-return time.

**Rationale:**
- `space::Metric` (hnsw 0.11 dependency) requires `Unit: Unsigned + Ord + Copy` — f32 does not satisfy this
- IEEE 754 positive floats are monotonically ordered as u32 bit patterns — safe for non-negative distances
- Cosine distance = 1 - cosine_similarity ∈ [0, 2]; L2 distance ≥ 0; both always non-negative ✓
- Dot product "distance" can be negative for unnormalized vectors — using 1 - dot_product as graph distance matches cosine for unit vectors and degrades gracefully for non-unit vectors
- Actual dot product score is recomputed from vectors at query time (one extra dot product per candidate) — exact, no information loss

**Limitation:** Dot product metric in HNSW mode is optimized for L2-normalized (unit) vectors. Non-unit vectors will get approximately correct ANN results (graph finds angularly close vectors, which correlates with high dot product for normalized embeddings). For exact dot product with non-unit vectors, use the flat index.

**Status:** Locked.

---

## ADR-018: HNSW delete = full graph rebuild (O(n log n))

**Decision:** Deleting any entry from HNSW rebuilds the graph from scratch using the remaining entries.

**Rationale:**
- HNSW graphs have no incremental delete operation — neighbor pointers from deleted nodes remain in the graph
- Lazy-delete (tombstoning) requires tracking deleted indices throughout search and complicates index / size semantics
- At v0.3 scale (< 500k vectors), a rebuild triggered by delete is acceptable; it is not on the hot path
- Upsert of an existing ID also triggers a rebuild (HNSW has no in-place update)

**Limitation:** Frequent individual deletes on a large HNSW index are O(n log n) per delete. Batch deletes (delete N, one rebuild) are preferred. Incremental delete deferred to v0.4+.

**Status:** Locked.

---

## What's deferred — do not implement without explicit approval

**Planned for v0.4 (storage):**
- Chunked persistence — binary serialisation replacing the single JSON blob in save/load; versioned format with migration path from v0.1/v0.2/v0.3 JSON snapshot
- Domain-aware storage API (evaluation) — decided after chunked persistence ships; may be unnecessary

**Planned for v0.4 (storage):**
- Chunked persistence — binary serialisation replacing the single JSON blob in save/load; versioned format with migration path from v0.1/v0.2 JSON snapshot
- Domain-aware storage API (evaluation) — decided after chunked persistence ships; may be unnecessary

**Planned for v0.5 (ecosystem):**
- Node.js native support
- Web Worker support
- React Native support
- Base64 inlined WASM option

**No version assigned:**
- Filter operators beyond $gte, $lte, $in, $ne (e.g. $exists, $regex)