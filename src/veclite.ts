import { IndexedDBAdapter } from './adapters/indexeddb.js'
import type { StorageAdapter } from './adapters/adapter.js'
import {
  VecLiteIndexError,
  VecLiteStorageError,
  type Metadata,
  type SearchOptions,
  type SearchResult,
  type VecLiteConfig,
  type VectorEntry,
} from './types.js'
import { sanitizeMetadata, validateFilter, validateVector } from './validator.js'
import { flattenVectors, vectorToFloat32Array } from './utils.js'

// Minimal shared interface matching both wasm-pack generated index classes.
// The full types are in src/wasm/veclite.d.ts after running `npm run build:wasm`.
interface WasmIndex {
  upsert(ids_json: string, flat_vectors: Float32Array, metadata_json: string): void
  search(query: Float32Array, top_k: number, filter_json: string): string
  delete(ids_json: string): void
  clear(): void
  export_entries_json(): string
  readonly size: number
  free(): void
}

type WasmInput = string | URL | ArrayBuffer | Uint8Array

type WasmModule = {
  default: (input?: { module_or_path: WasmInput } | WasmInput) => Promise<unknown>
  FlatIndex: new (dimensions: number, metric: string) => WasmIndex
  HnswIndex: new (dimensions: number, metric: string, ef_construction: number) => WasmIndex
}

let wasm: WasmModule | null = null

export class VecLite {
  private static wasmReady = false
  private index: WasmIndex
  private storage: StorageAdapter
  private readonly dimensions: number
  private readonly maxVectors: number | undefined

  static async init(wasmInput?: WasmInput): Promise<void> {
    if (VecLite.wasmReady) return
    wasm = (await import('./wasm/veclite.js')) as WasmModule
    await wasm.default(wasmInput !== undefined ? { module_or_path: wasmInput } : undefined)
    VecLite.wasmReady = true
  }

  constructor(config: VecLiteConfig) {
    if (!VecLite.wasmReady || !wasm) {
      throw new VecLiteIndexError('Call await VecLite.init() before creating an instance')
    }
    this.dimensions = config.dimensions
    this.maxVectors = config.maxVectors
    this.storage = config.storage ?? new IndexedDBAdapter()
    const metric = config.metric ?? 'cosine'
    if ((config.indexType ?? 'flat') === 'hnsw') {
      this.index = new wasm.HnswIndex(config.dimensions, metric, config.efConstruction ?? 200)
    } else {
      this.index = new wasm.FlatIndex(config.dimensions, metric)
    }
  }

  upsert(entries: VectorEntry[]): void {
    // Conservative maxVectors guard — upserts of existing IDs don't increase size,
    // so this may reject some valid calls; exact enforcement is a v0.2 concern.
    if (
      this.maxVectors !== undefined &&
      this.index.size + entries.length > this.maxVectors
    ) {
      throw new VecLiteIndexError(
        `upsert would exceed maxVectors limit of ${this.maxVectors}`,
      )
    }

    const ids: string[] = []
    const vectors: number[][] = []
    const metas: Metadata[] = []

    for (const entry of entries) {
      validateVector(entry.vector, this.dimensions)
      ids.push(entry.id)
      vectors.push(entry.vector)
      metas.push(sanitizeMetadata(entry.metadata))
    }

    this.index.upsert(
      JSON.stringify(ids),
      flattenVectors(vectors),
      JSON.stringify(metas),
    )
  }

  search(options: SearchOptions): SearchResult[] {
    validateVector(options.vector, this.dimensions)
    const hasFilter = options.filter && Object.keys(options.filter).length > 0
    if (hasFilter) {
      validateFilter(options.filter!)
    }
    const filterJson = hasFilter ? JSON.stringify(options.filter) : 'null'
    const raw = this.index.search(
      vectorToFloat32Array(options.vector),
      options.topK,
      filterJson,
    )
    return JSON.parse(raw) as SearchResult[]
  }

  delete(ids: string[]): void {
    this.index.delete(JSON.stringify(ids))
  }

  async save(): Promise<void> {
    try {
      const json = this.index.export_entries_json()
      await this.storage.set('veclite:v1', json)
    } catch (e) {
      if (e instanceof VecLiteStorageError) throw e
      throw new VecLiteStorageError(
        `save failed: ${e instanceof Error ? e.message : String(e)}`,
      )
    }
  }

  async load(): Promise<void> {
    try {
      const json = await this.storage.get('veclite:v1')
      if (!json) return
      const entries = JSON.parse(json) as Array<{
        id: string
        vector: number[]
        metadata: Metadata
      }>
      if (entries.length === 0) return
      this.index.upsert(
        JSON.stringify(entries.map((e) => e.id)),
        flattenVectors(entries.map((e) => e.vector)),
        JSON.stringify(entries.map((e) => e.metadata)),
      )
    } catch (e) {
      if (e instanceof VecLiteStorageError) throw e
      throw new VecLiteStorageError(
        `load failed: ${e instanceof Error ? e.message : String(e)}`,
      )
    }
  }

  clear(): void {
    this.index.clear()
  }

  get size(): number {
    return this.index.size
  }
}
