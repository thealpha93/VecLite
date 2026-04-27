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

/// Operator-based predicate for a single filter key.
/// Multiple operators on the same key are combined with AND semantics.
export type FilterOperator = {
  $gte?: number
  $lte?: number
  $in?: MetadataValue[]
  $ne?: MetadataValue
}

/// A filter value: either an exact MetadataValue or an operator object.
export type FilterValue = MetadataValue | FilterOperator

export interface SearchOptions {
  vector: number[]
  topK: number
  /// Each key maps to an exact MetadataValue (v0.1 style) or a FilterOperator (v0.2).
  filter?: Record<string, FilterValue>
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
