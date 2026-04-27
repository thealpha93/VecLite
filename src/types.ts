import type { StorageAdapter } from './adapters/adapter.js'

export type MetadataValue = string | number | boolean
export type Metadata = Record<string, MetadataValue>

export interface VecLiteConfig {
  dimensions: number
  storage?: StorageAdapter
  maxVectors?: number
}

export interface VectorEntry {
  id: string
  vector: number[]
  metadata?: Metadata
}

export interface SearchOptions {
  vector: number[]
  topK: number
  filter?: Partial<Metadata>
}

export interface SearchResult {
  id: string
  score: number
  metadata: Metadata
}

export class VecLiteDimensionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'VecLiteDimensionError'
  }
}

export class VecLiteValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'VecLiteValidationError'
  }
}

export class VecLiteIndexError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'VecLiteIndexError'
  }
}

export class VecLiteStorageError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'VecLiteStorageError'
  }
}
