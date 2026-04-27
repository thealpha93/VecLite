use wasm_bindgen::prelude::*;

/// Cosine similarity between two equal-length f32 vectors.
/// Caller (TypeScript) is responsible for ensuring equal lengths and valid floats.
/// Returns a value in [-1.0, 1.0]. Returns 0.0 for any zero vector.
#[wasm_bindgen]
pub fn cosine_similarity(a: &[f32], b: &[f32]) -> f32 {
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
        let a = [0.6_f32, 0.8];      // |a| = 1.0
        let b = [0.8_f32, 0.6];      // |b| = 1.0
        let dot = 0.6 * 0.8 + 0.8 * 0.6; // = 0.96
        let result = cosine_similarity(&a, &b);
        assert!((result - dot).abs() < 1e-6, "expected {dot}, got {result}");
    }
}
