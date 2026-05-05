import type { StorageAdapter } from '../adapters/adapter.js'
import type { Metadata } from '../types.js'

export interface VecLiteRAGConfig {
  model?: string
  storage?: StorageAdapter
  chunkSize?: number
  chunkOverlap?: number
}

export interface RAGSearchResult {
  id: string
  chunk: string
  score: number
  metadata: Metadata
}

export type ProgressCallback = (progress: {
  loaded: number
  total: number
  status: string
}) => void
