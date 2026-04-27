export function flattenVectors(vectors: number[][]): Float32Array {
  if (vectors.length === 0) return new Float32Array(0)
  const dim = vectors[0].length
  const out = new Float32Array(vectors.length * dim)
  for (let i = 0; i < vectors.length; i++) {
    out.set(vectors[i], i * dim)
  }
  return out
}

export function vectorToFloat32Array(v: number[]): Float32Array {
  return new Float32Array(v)
}
