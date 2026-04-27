import { describe, expect, it } from 'vitest'
import { sanitizeMetadata, validateFilter, validateVector } from '../src/validator.js'
import { VecLiteDimensionError, VecLiteValidationError } from '../src/types.js'

describe('validateVector', () => {
  it('accepts a valid vector of the correct length', () => {
    expect(validateVector([1, 2, 3], 3)).toEqual([1, 2, 3])
  })

  it('throws VecLiteValidationError for non-array input', () => {
    expect(() => validateVector('nope', 3)).toThrow(VecLiteValidationError)
    expect(() => validateVector(42, 3)).toThrow(VecLiteValidationError)
    expect(() => validateVector(null, 3)).toThrow(VecLiteValidationError)
  })

  it('throws VecLiteDimensionError for wrong length', () => {
    expect(() => validateVector([1, 2], 3)).toThrow(VecLiteDimensionError)
    expect(() => validateVector([1, 2, 3, 4], 3)).toThrow(VecLiteDimensionError)
  })

  it('throws VecLiteValidationError for NaN element', () => {
    expect(() => validateVector([1, NaN, 3], 3)).toThrow(VecLiteValidationError)
  })

  it('throws VecLiteValidationError for Infinity element', () => {
    expect(() => validateVector([1, Infinity, 3], 3)).toThrow(VecLiteValidationError)
  })

  it('throws VecLiteValidationError for -Infinity element', () => {
    expect(() => validateVector([1, -Infinity, 3], 3)).toThrow(VecLiteValidationError)
  })

  it('accepts negative and zero values', () => {
    expect(validateVector([-1, 0, 1], 3)).toEqual([-1, 0, 1])
  })
})

describe('sanitizeMetadata', () => {
  it('accepts string, number, and boolean values', () => {
    expect(sanitizeMetadata({ cat: 'science', year: 2024, active: true })).toEqual({
      cat: 'science',
      year: 2024,
      active: true,
    })
  })

  it('returns {} for undefined', () => {
    expect(sanitizeMetadata(undefined)).toEqual({})
  })

  it('returns {} for null', () => {
    expect(sanitizeMetadata(null)).toEqual({})
  })

  it('silently drops __proto__', () => {
    const result = sanitizeMetadata({ __proto__: 'evil', safe: 'ok' })
    expect(Object.prototype.hasOwnProperty.call(result, '__proto__')).toBe(false)
    expect(result.safe).toBe('ok')
  })

  it('silently drops constructor', () => {
    expect(sanitizeMetadata({ constructor: 'x' })).toEqual({})
  })

  it('silently drops prototype', () => {
    expect(sanitizeMetadata({ prototype: 'x' })).toEqual({})
  })

  it('throws VecLiteValidationError for object value', () => {
    expect(() => sanitizeMetadata({ bad: {} })).toThrow(VecLiteValidationError)
  })

  it('throws VecLiteValidationError for array value', () => {
    expect(() => sanitizeMetadata({ bad: [] })).toThrow(VecLiteValidationError)
  })

  it('throws VecLiteValidationError for null value', () => {
    expect(() => sanitizeMetadata({ bad: null })).toThrow(VecLiteValidationError)
  })

  it('throws VecLiteValidationError when metadata itself is an array', () => {
    expect(() => sanitizeMetadata([1, 2, 3])).toThrow(VecLiteValidationError)
  })
})

describe('validateFilter', () => {
  it('accepts empty filter without throwing', () => {
    expect(() => validateFilter({})).not.toThrow()
  })

  it('accepts v0.1 exact-match primitives', () => {
    expect(() =>
      validateFilter({ cat: 'science', year: 2024, active: true }),
    ).not.toThrow()
  })

  it('accepts valid $gte operator', () => {
    expect(() => validateFilter({ year: { $gte: 2020 } })).not.toThrow()
  })

  it('accepts valid $lte operator', () => {
    expect(() => validateFilter({ year: { $lte: 2024 } })).not.toThrow()
  })

  it('accepts valid $in operator with mixed types', () => {
    expect(() =>
      validateFilter({ cat: { $in: ['science', 'tech'] } }),
    ).not.toThrow()
  })

  it('accepts valid $ne operator', () => {
    expect(() => validateFilter({ status: { $ne: 'archived' } })).not.toThrow()
  })

  it('accepts combined operators on the same key', () => {
    expect(() => validateFilter({ year: { $gte: 2020, $lte: 2024 } })).not.toThrow()
  })

  it('accepts mixed exact + operator keys', () => {
    expect(() =>
      validateFilter({ cat: 'science', year: { $gte: 2020 } }),
    ).not.toThrow()
  })

  it('throws for unknown operator key', () => {
    expect(() =>
      validateFilter({ year: { $exists: true } as any }),
    ).toThrow(VecLiteValidationError)
  })

  it('throws for $gte with string value', () => {
    expect(() =>
      validateFilter({ year: { $gte: 'oops' as any } }),
    ).toThrow(VecLiteValidationError)
  })

  it('throws for $lte with non-number value', () => {
    expect(() =>
      validateFilter({ year: { $lte: true as any } }),
    ).toThrow(VecLiteValidationError)
  })

  it('throws for $in with non-array value', () => {
    expect(() =>
      validateFilter({ cat: { $in: 'science' as any } }),
    ).toThrow(VecLiteValidationError)
  })

  it('throws for $in array containing an object element', () => {
    expect(() =>
      validateFilter({ cat: { $in: [{}] as any } }),
    ).toThrow(VecLiteValidationError)
  })

  it('throws for $ne with object value', () => {
    expect(() =>
      validateFilter({ cat: { $ne: {} as any } }),
    ).toThrow(VecLiteValidationError)
  })

  it('throws for empty operator object', () => {
    expect(() =>
      validateFilter({ year: {} as any }),
    ).toThrow(VecLiteValidationError)
  })

  it('throws for filter value that is a plain array', () => {
    expect(() =>
      validateFilter({ cat: [] as any }),
    ).toThrow(VecLiteValidationError)
  })

  it('silently skips __proto__ key', () => {
    expect(() =>
      validateFilter({ __proto__: { $gte: 0 } } as any),
    ).not.toThrow()
  })
})
