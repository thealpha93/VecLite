# Contributing to VecLite

Thanks for your interest in contributing! VecLite is a Rust/WASM vector search library and contributions of all kinds are welcome — bug reports, documentation improvements, fixing issues, and new features.

Please read this guide before opening an issue or PR.

---

## Table of contents

- [Code of conduct](#code-of-conduct)
- [Getting started](#getting-started)
- [Development setup](#development-setup)
- [Project structure](#project-structure)
- [Running tests](#running-tests)
- [Opening issues](#opening-issues)
- [Submitting pull requests](#submitting-pull-requests)
- [Commit style](#commit-style)
- [Architecture decisions](#architecture-decisions)

---

## Code of conduct

This project follows the [Contributor Covenant Code of Conduct](./CODE_OF_CONDUCT.md). By participating you agree to abide by its terms.

---

## Getting started

1. Browse [open issues](https://github.com/thealpha93/VecLite/issues) — look for the `good first issue` or `help wanted` labels.
2. Comment on the issue to let others know you're working on it.
3. If you have an idea that doesn't have a matching issue, open one first to discuss before writing code.

---

## Development setup

### Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Rust (stable) | latest stable | [rustup.rs](https://rustup.rs) |
| wasm-pack | latest | `cargo install wasm-pack` |
| Node.js | ≥ 20 | [nodejs.org](https://nodejs.org) |
| npm | ≥ 10 | bundled with Node.js |

### Clone and install

```bash
git clone git@github.com:thealpha93/VecLite.git
cd VecLite
npm install
```

### Build

```bash
# Full build: compiles Rust → WASM, then TypeScript → dist/
npm run build

# Build WASM only (faster iteration on Rust changes)
npm run build:wasm

# Build TypeScript only (faster iteration on TS changes)
npm run build:ts
```

The build pipeline is:
1. `wasm-pack build rust --target web --out-dir ../src/wasm` — produces `veclite_bg.wasm` + JS bindings
2. `tsup` — bundles TypeScript, copies WASM to `dist/`

---

## Project structure

```
VecLite/
├── rust/               ← Rust/WASM core (pure computation only)
│   └── src/
│       ├── lib.rs      ← wasm-bindgen exports
│       ├── index.rs    ← flat index, brute-force search
│       ├── similarity.rs
│       ├── filter.rs   ← exact-match metadata filtering
│       └── types.rs
├── src/                ← TypeScript API layer
│   ├── veclite.ts      ← main class
│   ├── types.ts
│   ├── validator.ts    ← ALL input validation lives here
│   ├── utils.ts
│   └── adapters/
│       ├── adapter.ts  ← StorageAdapter interface
│       ├── indexeddb.ts
│       └── memory.ts
├── tests/              ← Vitest unit tests
├── bench/              ← Vitest benchmarks
└── docs/               ← Additional documentation
```

**Three-layer architecture — never mix concerns across layers:**

1. **TypeScript layer** — validation, error handling, persistence, DX
2. **WASM boundary** — batch crossings, Float32Array, JSON metadata
3. **Rust core** — pure computation only, no async, no JS concepts

---

## Running tests

```bash
# TypeScript tests (Vitest)
npm test

# TypeScript tests in watch mode
npm run test:watch

# Rust unit tests
npm run test:rust     # shortcut for: cd rust && cargo test

# Benchmarks (VecLite vs pure-JS Float32Array)
npm run bench
```

All tests must pass before a PR will be merged. The CI runs both suites automatically.

---

## Opening issues

Use the issue templates:

- **Bug report** — include your environment (OS, browser, bundler, Node.js version), a minimal reproduction, and what you expected vs what happened.
- **Feature request** — describe the use case, the proposed API, and what alternatives you considered.

For questions that aren't bugs or feature requests, use [GitHub Discussions](https://github.com/thealpha93/VecLite/discussions).

---

## Submitting pull requests

1. **Fork** the repository and create a branch from `main`:
   ```bash
   git checkout -b fix/dimension-validation-edge-case
   ```

2. **Make your changes.** Follow the coding guidelines below.

3. **Write tests** for any new behaviour or bug fix.

4. **Run the full test suite** and confirm everything passes:
   ```bash
   npm run build && npm test && npm run test:rust
   ```

5. **Update `CHANGELOG.md`** under the `[Unreleased]` heading describing what you changed.

6. **Open a PR** against `main`. Fill in the PR template — it prompts for what changed, why, and how it was tested.

### Branch naming

| Type | Pattern | Example |
|------|---------|---------|
| Bug fix | `fix/<short-description>` | `fix/nan-vector-crash` |
| Feature | `feat/<short-description>` | `feat/memory-adapter-size` |
| Documentation | `docs/<short-description>` | `docs/adapter-guide` |
| Chore / tooling | `chore/<short-description>` | `chore/update-vitest` |

---

## Commit style

We use [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <short summary>

[optional body]

[optional footer]
```

Types: `feat`, `fix`, `docs`, `test`, `bench`, `chore`, `refactor`, `perf`

Examples:
```
feat(adapter): add MemoryAdapter.keys() utility method
fix(validator): reject vectors containing Infinity
docs(readme): add Vite bundler setup example
test(rust): add cosine similarity edge case for zero vector
```

---

## Architecture decisions

Significant design decisions are recorded in [`DECISIONS.md`](./DECISIONS.md). Before proposing a change that contradicts a locked decision, open an issue to discuss it first. Changes to locked decisions require explicit maintainer approval.

The golden rule: **Rust does pure computation only. All async, persistence, and validation lives in TypeScript.**
