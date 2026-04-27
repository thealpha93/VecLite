import { describe, expect, it } from 'vitest'
import { sanitizeMetadata, validateVector } from '../src/validator.js'
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
