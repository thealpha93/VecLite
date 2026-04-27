import {
  VecLiteDimensionError,
  VecLiteValidationError,
  type FilterValue,
  type Metadata,
} from './types.js'

const BLOCKED_KEYS = new Set(['__proto__', 'constructor', 'prototype'])
const OPERATOR_KEYS = new Set(['$gte', '$lte', '$in', '$ne'])

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

/// Validates a filter object before it crosses the WASM boundary.
/// Accepts both v0.1 exact-match values and v0.2 operator objects.
export function validateFilter(filter: Record<string, FilterValue>): void {
  for (const [key, value] of Object.entries(filter)) {
    if (BLOCKED_KEYS.has(key)) continue

    // Primitive → exact match (always valid)
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      continue
    }

    // Must be a plain, non-null, non-array object (operator predicate)
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new VecLiteValidationError(
        `filter["${key}"] must be a MetadataValue or operator object`,
      )
    }

    const op = value as Record<string, unknown>
    const opKeys = Object.keys(op)

    if (opKeys.length === 0) {
      throw new VecLiteValidationError(
        `filter["${key}"] operator object must have at least one operator ($gte, $lte, $in, $ne)`,
      )
    }

    for (const opKey of opKeys) {
      if (!OPERATOR_KEYS.has(opKey)) {
        throw new VecLiteValidationError(
          `filter["${key}"] contains unknown operator: ${opKey}`,
        )
      }
    }

    if ('$gte' in op) {
      if (typeof op.$gte !== 'number' || !isFinite(op.$gte as number)) {
        throw new VecLiteValidationError(`filter["${key}"].$gte must be a finite number`)
      }
    }

    if ('$lte' in op) {
      if (typeof op.$lte !== 'number' || !isFinite(op.$lte as number)) {
        throw new VecLiteValidationError(`filter["${key}"].$lte must be a finite number`)
      }
    }

    if ('$ne' in op) {
      const t = typeof op.$ne
      if (t !== 'string' && t !== 'number' && t !== 'boolean') {
        throw new VecLiteValidationError(
          `filter["${key}"].$ne must be a MetadataValue (string, number, or boolean)`,
        )
      }
    }

    if ('$in' in op) {
      if (!Array.isArray(op.$in)) {
        throw new VecLiteValidationError(`filter["${key}"].$in must be an array`)
      }
      for (const item of op.$in as unknown[]) {
        const t = typeof item
        if (t !== 'string' && t !== 'number' && t !== 'boolean') {
          throw new VecLiteValidationError(
            `filter["${key}"].$in array items must be MetadataValue (string, number, or boolean)`,
          )
        }
      }
    }
  }
}
