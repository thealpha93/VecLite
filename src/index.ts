export { VecLite } from './veclite.js'
export { IndexedDBAdapter } from './adapters/indexeddb.js'
export { MemoryAdapter } from './adapters/memory.js'
export type { StorageAdapter } from './adapters/adapter.js'
export type {
  VecLiteConfig,
  VectorEntry,
  SearchOptions,
  SearchResult,
  Metadata,
  MetadataValue,
} from './types.js'
export {
  VecLiteDimensionError,
  VecLiteIndexError,
  VecLiteStorageError,
  VecLiteValidationError,
} from './types.js'
