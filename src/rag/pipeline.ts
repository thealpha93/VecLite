import type { StorageAdapter } from '../adapters/adapter.js'
import { IndexedDBAdapter } from '../adapters/indexeddb.js'
import type { Metadata } from '../types.js'
import { VecLite } from '../veclite.js'
import { chunk } from './chunker.js'
import type { ProgressCallback, RAGSearchResult, VecLiteRAGConfig } from './types.js'

const DEFAULT_MODEL = 'Xenova/all-MiniLM-L6-v2'
const DEFAULT_CHUNK_SIZE = 1000
const DEFAULT_CHUNK_OVERLAP = 100
const CHUNK_MAP_KEY = 'veclite:rag:v1'

type Embedder = (text: string, options?: Record<string, unknown>) => Promise<{ data: ArrayLike<number> }>

export class VecLiteRAG {
  private db: VecLite | null = null
  private embedder: Embedder | null = null
  private readonly storage: StorageAdapter
  private readonly model: string
  private readonly chunkSize: number
  private readonly chunkOverlap: number
  private chunkMap = new Map<string, string[]>()

  constructor(config: VecLiteRAGConfig = {}) {
    this.model = config.model ?? DEFAULT_MODEL
    this.chunkSize = config.chunkSize ?? DEFAULT_CHUNK_SIZE
    this.chunkOverlap = config.chunkOverlap ?? DEFAULT_CHUNK_OVERLAP
    this.storage = config.storage ?? new IndexedDBAdapter()
  }

  async init(onProgress?: ProgressCallback): Promise<void> {
    await VecLite.init()

    const { pipeline } = await import('@huggingface/transformers')
    this.embedder = await pipeline('feature-extraction', this.model, {
      progress_callback: onProgress
        ? (p: { loaded?: number; total?: number; status?: string }) =>
            onProgress({ loaded: p.loaded ?? 0, total: p.total ?? 0, status: p.status ?? '' })
        : undefined,
    }) as unknown as Embedder

    const probe = await this.embed('probe')
    const dimensions = probe.length
    this.db = new VecLite({ dimensions, storage: this.storage })
  }

  async add(id: string, text: string, metadata: Metadata = {}): Promise<void> {
    this.assertReady()
    await this.delete(id)

    const chunks = chunk(text, this.chunkSize, this.chunkOverlap)
    const chunkIds: string[] = []
    const entries: { id: string; vector: number[]; metadata: Metadata }[] = []

    for (let i = 0; i < chunks.length; i++) {
      const chunkId = `${id}::${i}`
      chunkIds.push(chunkId)
      const vector = await this.embed(chunks[i])
      entries.push({
        id: chunkId,
        vector,
        metadata: { ...metadata, _docId: id, _chunkText: chunks[i], _chunkIndex: i },
      })
    }

    this.db!.upsert(entries)
    this.chunkMap.set(id, chunkIds)
  }

  async search(query: string, options: { topK?: number } = {}): Promise<RAGSearchResult[]> {
    this.assertReady()
    const vector = await this.embed(query)
    const results = this.db!.search({ vector, topK: options.topK ?? 5 })

    return results.map(r => ({
      id: r.metadata._docId as string,
      chunk: r.metadata._chunkText as string,
      score: r.score,
      metadata: Object.fromEntries(
        Object.entries(r.metadata).filter(([k]) => !k.startsWith('_'))
      ),
    }))
  }

  async delete(id: string): Promise<void> {
    this.assertReady()
    const chunkIds = this.chunkMap.get(id)
    if (chunkIds?.length) {
      this.db!.delete(chunkIds)
      this.chunkMap.delete(id)
    }
  }

  async save(): Promise<void> {
    this.assertReady()
    await this.db!.save()
    await this.storage.set(CHUNK_MAP_KEY, JSON.stringify(Object.fromEntries(this.chunkMap)))
  }

  async load(): Promise<void> {
    this.assertReady()
    await this.db!.load()
    const raw = await this.storage.get(CHUNK_MAP_KEY)
    if (raw) this.chunkMap = new Map(Object.entries(JSON.parse(raw)))
  }

  clear(): void {
    this.assertReady()
    this.db!.clear()
    this.chunkMap.clear()
  }

  get size(): number {
    return this.db?.size ?? 0
  }

  private async embed(text: string): Promise<number[]> {
    const result = await this.embedder!(text, { pooling: 'mean', normalize: true })
    return Array.from(result.data) as number[]
  }

  private assertReady(): void {
    if (!this.db || !this.embedder) throw new Error('VecLiteRAG: call init() before use')
  }
}
