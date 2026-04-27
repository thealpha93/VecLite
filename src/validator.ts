import {
  VecLiteDimensionError,
  VecLiteValidationError,
  type Metadata,
} from './types.js'

const BLOCKED_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

export function validateVector(vector: unknown, dimensions: number): number[] {
  if (!Array.isArray(vector)) {
    throw new VecLiteValidationError('vector must be an array')
  }
  if (vector.length !== dimensions) {
    throw new VecLiteDimensionError(
      `vector has ${vector.length} elements but index expects ${dimensions}`,
    )
  }
  for (const v of vector) {
    if (typeof v !== 'number' || !isFinite(v)) {
      throw new VecLiteValidationError('vector contains a non-finite value (NaN or Infinity)')
    }
  }
  return vector as number[]
}

export function sanitizeMetadata(metadata: unknown): Metadata {
  if (metadata === undefined || metadata === null) return {}
  if (typeof metadata !== 'object' || Array.isArray(metadata)) {
    throw new VecLiteValidationError('metadata must be a plain object')
  }
  const result: Metadata = {}
  for (const [key, value] of Object.entries(metadata as Record<string, unknown>)) {
    if (BLOCKED_KEYS.has(key)) continue
    if (
      typeof value !== 'string' &&
      typeof value !== 'number' &&
      typeof value !== 'boolean'
    ) {
      throw new VecLiteValidationError(
        `metadata["${key}"] must be string, number, or boolean`,
      )
    }
    result[key] = value
  }
  return result
}
