use wasm_bindgen::prelude::*;

/// Scalar cosine similarity — always compiled, used as fallback and reference.
/// Dead-code warning suppressed: this function is the test reference on wasm32+simd.
#[allow(dead_code)]
fn cosine_similarity_scalar(a: &[f32], b: &[f32]) -> f32 {
    let mut dot = 0.0_f32;
    let mut norm_a = 0.0_f32;
    let mut norm_b = 0.0_f32;
    for (x, y) in a.iter().zip(b.iter()) {
        dot += x * y;
        norm_a += x * x;
        norm_b += y * y;
    }
    let denom = norm_a.sqrt() * norm_b.sqrt();
    if denom == 0.0 {
        0.0
    } else {
        (dot / denom).clamp(-1.0, 1.0)
    }
}

/// SIMD-accelerated cosine similarity using wasm32 f32x4 intrinsics.
/// Processes 4 f32 values per cycle; handles any tail with scalar arithmetic.
/// Only compiled when targeting wasm32 with the "simd" feature enabled.
#[cfg(all(target_arch = "wasm32", feature = "simd"))]
#[target_feature(enable = "simd128")]
unsafe fn cosine_similarity_simd(a: &[f32], b: &[f32]) -> f32 {
    use core::arch::wasm32::*;

    let chunks = a.len() / 4;

    let mut vdot = f32x4(0.0, 0.0, 0.0, 0.0);
    let mut vna = f32x4(0.0, 0.0, 0.0, 0.0);
    let mut vnb = f32x4(0.0, 0.0, 0.0, 0.0);

    for i in 0..chunks {
        let o = i * 4;
        let va = f32x4(a[o], a[o + 1], a[o + 2], a[o + 3]);
        let vb = f32x4(b[o], b[o + 1], b[o + 2], b[o + 3]);
        vdot = f32x4_add(vdot, f32x4_mul(va, vb));
        vna = f32x4_add(vna, f32x4_mul(va, va));
        vnb = f32x4_add(vnb, f32x4_mul(vb, vb));
    }

    // Horizontal sum of the four lanes
    let mut dot = f32x4_extract_lane::<0>(vdot)
        + f32x4_extract_lane::<1>(vdot)
        + f32x4_extract_lane::<2>(vdot)
        + f32x4_extract_lane::<3>(vdot);
    let mut na = f32x4_extract_lane::<0>(vna)
        + f32x4_extract_lane::<1>(vna)
        + f32x4_extract_lane::<2>(vna)
        + f32x4_extract_lane::<3>(vna);
    let mut nb = f32x4_extract_lane::<0>(vnb)
        + f32x4_extract_lane::<1>(vnb)
        + f32x4_extract_lane::<2>(vnb)
        + f32x4_extract_lane::<3>(vnb);

    // Scalar tail for lengths not divisible by 4
    for i in (chunks * 4)..a.len() {
        dot += a[i] * b[i];
        na += a[i] * a[i];
        nb += b[i] * b[i];
    }

    let denom = na.sqrt() * nb.sqrt();
    if denom == 0.0 {
        0.0
    } else {
        (dot / denom).clamp(-1.0, 1.0)
    }
}

/// Public cosine similarity function exposed to JavaScript via wasm-bindgen.
/// Dispatches to the SIMD path on wasm32 with the "simd" feature; scalar otherwise.
/// Caller is responsible for equal lengths and finite floats.
#[wasm_bindgen]
pub fn cosine_similarity(a: &[f32], b: &[f32]) -> f32 {
    #[cfg(not(all(target_arch = "wasm32", feature = "simd")))]
    return cosine_similarity_scalar(a, b);

    #[cfg(all(target_arch = "wasm32", feature = "simd"))]
    unsafe {
        cosine_similarity_simd(a, b)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn identical_vectors_returns_one() {
        let a = [1.0_f32, 2.0, 3.0];
        let result = cosine_similarity(&a, &a);
        assert!((result - 1.0).abs() < 1e-6, "expected 1.0, got {result}");
    }

    #[test]
    fn opposite_vectors_returns_minus_one() {
        let a = [1.0_f32, 2.0, 3.0];
        let b = [-1.0_f32, -2.0, -3.0];
        let result = cosine_similarity(&a, &b);
        assert!((result + 1.0).abs() < 1e-6, "expected -1.0, got {result}");
    }

    #[test]
    fn orthogonal_vectors_returns_zero() {
        let a = [1.0_f32, 0.0];
        let b = [0.0_f32, 1.0];
        let result = cosine_similarity(&a, &b);
        assert!(result.abs() < 1e-6, "expected 0.0, got {result}");
    }

    #[test]
    fn known_values_45_degrees() {
        // [1, 0] vs [1, 1] — angle is 45°, cosine = 1/√2 ≈ 0.70711
        let a = [1.0_f32, 0.0];
        let b = [1.0_f32, 1.0];
        let expected = 1.0_f32 / 2.0_f32.sqrt();
        let result = cosine_similarity(&a, &b);
        assert!(
            (result - expected).abs() < 1e-6,
            "expected {expected}, got {result}"
        );
    }

    #[test]
    fn known_values_60_degrees() {
        // [1, 0, 0] vs [0.5, √3/2, 0] — angle is 60°, cosine = 0.5
        let a = [1.0_f32, 0.0, 0.0];
        let b = [0.5_f32, (3.0_f32.sqrt() / 2.0), 0.0];
        let result = cosine_similarity(&a, &b);
        assert!((result - 0.5).abs() < 1e-6, "expected 0.5, got {result}");
    }

    #[test]
    fn zero_vector_returns_zero() {
        let a = [0.0_f32, 0.0, 0.0];
        let b = [1.0_f32, 2.0, 3.0];
        let result = cosine_similarity(&a, &b);
        assert_eq!(result, 0.0, "expected 0.0 for zero vector, got {result}");
    }

    #[test]
    fn unit_vectors_return_dot_product() {
        // For unit vectors cosine_similarity == dot product
        let a = [0.6_f32, 0.8]; // |a| = 1.0
        let b = [0.8_f32, 0.6]; // |b| = 1.0
        let dot = 0.6 * 0.8 + 0.8 * 0.6; // = 0.96
        let result = cosine_similarity(&a, &b);
        assert!((result - dot).abs() < 1e-6, "expected {dot}, got {result}");
    }

    /// Verifies that the SIMD dispatch path returns the same result as the scalar
    /// reference implementation. On native targets both paths are scalar (trivially
    /// identical). On wasm32 + simd feature the dispatched path uses SIMD intrinsics.
    #[test]
    fn simd_and_scalar_paths_return_identical_results() {
        let a = [1.0_f32, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0];
        let b = [0.5_f32, 1.5, 2.5, 3.5, 4.5, 5.5, 6.5, 7.5, 8.5];
        let scalar = cosine_similarity_scalar(&a, &b);
        let dispatched = cosine_similarity(&a, &b);
        assert!(
            (dispatched - scalar).abs() < 1e-5,
            "SIMD path {dispatched} diverged from scalar {scalar}"
        );
    }
}
