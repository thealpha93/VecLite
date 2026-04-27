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

## ADR-003: Flat index for v0.1, HNSW for v0.2

**Decision:** v0.1 uses brute force flat index. HNSW deferred to v0.2.

**Rationale:**
- Flat index is exact, simple to implement, easy to test
- Correctness is more important than speed at launch
- HNSW is complex — wrong implementation silently returns bad results
- Ship fast, get users, validate demand before investing in HNSW
- Flat index is still fast enough at 50k vectors with Rust/WASM

**Alternatives considered:**
- HNSW from day one — too complex, too risky for v0.1
- IVFFlat — good middle ground but still adds complexity

**Status:** Locked. Revisit after v0.1 adoption confirmed.

---

## ADR-004: Cosine similarity only in v0.1

**Decision:** Support cosine similarity as the only distance metric in v0.1.

**Rationale:**
- Cosine similarity is the default for text embeddings (OpenAI, Cohere etc.)
- Covers 90%+ of real-world use cases
- Keeping one metric keeps the API surface small and testable

**Alternatives considered:**
- L2 (Euclidean) — useful for image embeddings, deferred to v0.2
- Dot product — faster but assumes normalised vectors, adds confusion

**Status:** Locked. L2 and dot product deferred to v0.2.

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

**Alternatives considered:**
- Post-filter — better recall in edge cases, but wasteful and confusing
- Hybrid — unnecessary complexity for v0.1 exact-match filtering

**Status:** Locked. Revisit if filter operators are added in v0.2.

---

## ADR-009: Exact match metadata filtering only in v0.1

**Decision:** v0.1 supports exact match filters only — { key: value }.

**Rationale:**
- Covers the most common use case (filter by category, type, tag)
- Keeps the Rust filter implementation simple and correct
- Operator support ($gte, $lte, $in) adds significant complexity
- Ship simple, validate demand, add operators in v0.2

**Alternatives considered:**
- Full operator support from day one — too complex for v0.1
- No filtering — leaves a gap that forces workarounds immediately

**Status:** Locked. Operators ($gte, $lte, $in, $ne) deferred to v0.2.

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

**Status:** Locked. Revisit in v0.2 if query-level storage access is needed.

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

## What's deferred — do not implement in v0.1

- HNSW index
- L2 / dot product distance metrics
- Metadata filter operators ($gte, $lte, $in, $ne)
- Node.js support
- React Native support
- Web Worker support
- SIMD optimisation
- Base64 inlined WASM option
- Repository pattern / domain-aware storage