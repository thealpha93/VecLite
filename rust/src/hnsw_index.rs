use crate::filter::{matches_filter, Filter};
use crate::similarity::{cosine_similarity, dot_product, l2_distance, l2_score};
use crate::types::{Metadata, Metric, SearchResult, VectorEntry};
use hnsw::{Hnsw, Params, Searcher};
use rand_pcg::Pcg64;
use space::{Metric as SpaceMetric, Neighbor};
use std::collections::HashSet;
use wasm_bindgen::prelude::*;

// ── Metric wrappers ───────────────────────────────────────────────────────────
// space::Metric requires Unit: Unsigned + Ord, so f32 distances are stored as
// their bit pattern (u32). IEEE 754 positive floats preserve ordering under
// reinterpretation as u32, so this is safe for non-negative distances.
// HNSW minimises distance, so all wrappers return "smaller = more similar".

#[derive(Default)]
struct CosineMetric;

impl SpaceMetric<Vec<f32>> for CosineMetric {
    type Unit = u32;
    fn distance(&self, a: &Vec<f32>, b: &Vec<f32>) -> u32 {
        // 1 - cosine ∈ [0, 2] for cosine ∈ [-1, 1] — always non-negative
        (1.0_f32 - cosine_similarity(a, b)).to_bits()
    }
}

#[derive(Default)]
struct L2Metric;

impl SpaceMetric<Vec<f32>> for L2Metric {
    type Unit = u32;
    fn distance(&self, a: &Vec<f32>, b: &Vec<f32>) -> u32 {
        // L2 distance is always ≥ 0
        l2_distance(a, b).to_bits()
    }
}

#[derive(Default)]
struct DotMetric;

impl SpaceMetric<Vec<f32>> for DotMetric {
    type Unit = u32;
    fn distance(&self, a: &Vec<f32>, b: &Vec<f32>) -> u32 {
        // Use cosine-like distance for the HNSW graph (correct for unit vectors).
        // Actual dot product is recomputed from vectors at score-return time.
        (1.0_f32 - dot_product(a, b)).clamp(0.0_f32, f32::MAX).to_bits()
    }
}

// ── HnswInner — hides const generics from wasm-bindgen ───────────────────────

enum HnswInner {
    Cosine(Hnsw<CosineMetric, Vec<f32>, Pcg64, 16, 32>),
    L2(Hnsw<L2Metric, Vec<f32>, Pcg64, 16, 32>),
    Dot(Hnsw<DotMetric, Vec<f32>, Pcg64, 16, 32>),
}

impl HnswInner {
    fn new(metric: Metric, ef_construction: usize) -> Self {
        let params = Params::new().ef_construction(ef_construction);
        match metric {
            Metric::Cosine => HnswInner::Cosine(Hnsw::new_params(CosineMetric, params)),
            Metric::L2 => HnswInner::L2(Hnsw::new_params(L2Metric, params)),
            Metric::Dot => HnswInner::Dot(Hnsw::new_params(DotMetric, params)),
        }
    }

    fn insert(&mut self, vector: Vec<f32>, searcher: &mut Searcher<u32>) {
        match self {
            HnswInner::Cosine(g) => { g.insert(vector, searcher); }
            HnswInner::L2(g) => { g.insert(vector, searcher); }
            HnswInner::Dot(g) => { g.insert(vector, searcher); }
        }
    }

    fn nearest(
        &self,
        query: &Vec<f32>,
        ef: usize,
        searcher: &mut Searcher<u32>,
        dest: &mut [Neighbor<u32>],
    ) -> usize {
        let filled = match self {
            HnswInner::Cosine(g) => g.nearest(query, ef, searcher, dest),
            HnswInner::L2(g) => g.nearest(query, ef, searcher, dest),
            HnswInner::Dot(g) => g.nearest(query, ef, searcher, dest),
        };
        filled.len()
    }
}

// ── HnswIndex — the exported wasm-bindgen struct ──────────────────────────────

#[wasm_bindgen]
pub struct HnswIndex {
    dimensions: usize,
    metric: Metric,
    ef_construction: usize,
    /// Source of truth for metadata, delete-rebuild, and save/load.
    entries: Vec<VectorEntry>,
    inner: HnswInner,
}

#[wasm_bindgen]
impl HnswIndex {
    #[wasm_bindgen(constructor)]
    pub fn new(dimensions: usize, metric_str: &str, ef_construction: usize) -> HnswIndex {
        let metric = Metric::from_str(metric_str);
        HnswIndex {
            dimensions,
            metric,
            ef_construction,
            entries: Vec::new(),
            inner: HnswInner::new(metric, ef_construction),
        }
    }

    /// Batch upsert. ids_json: '["id1","id2"]', flat_vectors: Float32Array
    /// (all vectors concatenated), metadata_json: '[{...},{...}]'.
    /// Upserting an existing ID triggers a full graph rebuild (HNSW has no in-place update).
    pub fn upsert(&mut self, ids_json: &str, flat_vectors: &[f32], metadata_json: &str) {
        let ids: Vec<String> = serde_json::from_str(ids_json).unwrap_or_default();
        let metas: Vec<Metadata> = serde_json::from_str(metadata_json).unwrap_or_default();

        let mut any_existing = false;
        for id in &ids {
            if self.entries.iter().any(|e| e.id == *id) {
                any_existing = true;
                break;
            }
        }

        // Apply upsert semantics to the entries Vec
        let first_new = self.entries.len();
        for (i, id) in ids.iter().enumerate() {
            let vector = flat_vectors[i * self.dimensions..(i + 1) * self.dimensions].to_vec();
            let metadata = metas.get(i).cloned().unwrap_or_default();
            if let Some(entry) = self.entries.iter_mut().find(|e| e.id == *id) {
                entry.vector = vector;
                entry.metadata = metadata;
            } else {
                self.entries.push(VectorEntry { id: id.clone(), vector, metadata });
            }
        }

        if any_existing {
            self.rebuild();
        } else {
            // Append-only: insert new entries directly into the graph
            let mut searcher = Searcher::default();
            for entry in &self.entries[first_new..] {
                self.inner.insert(entry.vector.clone(), &mut searcher);
            }
        }
    }

    /// Search top_k approximate nearest neighbours. filter_json: JSON object or 'null'.
    /// Post-filter strategy with oversample=10 when a filter is provided.
    /// Returns JSON: '[{"id":"...","score":0.95,"metadata":{...}}]'.
    pub fn search(&self, query: &[f32], top_k: usize, filter_json: &str) -> String {
        if self.entries.is_empty() {
            return "[]".to_string();
        }

        let filter: Option<Filter> = serde_json::from_str(filter_json).ok().flatten();
        let oversample = if filter.is_some() { (top_k * 10).max(top_k) } else { top_k };
        let ef = oversample.max(self.ef_construction);
        let dest_size = oversample.min(self.entries.len());

        let query_vec = query.to_vec();
        let mut searcher: Searcher<u32> = Searcher::default();
        let mut dest: Vec<Neighbor<u32>> =
            vec![Neighbor { index: usize::MAX, distance: u32::MAX }; dest_size];

        let n_filled = self.inner.nearest(&query_vec, ef, &mut searcher, &mut dest);

        let results: Vec<SearchResult> = dest[..n_filled]
            .iter()
            .filter_map(|n| {
                let idx = n.index;
                if idx >= self.entries.len() {
                    return None;
                }
                let entry = &self.entries[idx];
                if let Some(ref f) = filter {
                    if !matches_filter(&entry.metadata, f) {
                        return None;
                    }
                }
                let score = self.distance_to_score(n.distance, query, &entry.vector);
                Some(SearchResult {
                    id: entry.id.clone(),
                    score,
                    metadata: entry.metadata.clone(),
                })
            })
            .take(top_k)
            .collect();

        serde_json::to_string(&results).unwrap_or_else(|_| "[]".to_string())
    }

    /// Delete entries by ID. Rebuilds the graph after deletion (O(n log n)).
    pub fn delete(&mut self, ids_json: &str) {
        let ids: HashSet<String> = serde_json::from_str::<Vec<String>>(ids_json)
            .unwrap_or_default()
            .into_iter()
            .collect();
        let before = self.entries.len();
        self.entries.retain(|e| !ids.contains(&e.id));
        if self.entries.len() != before {
            self.rebuild();
        }
    }

    pub fn clear(&mut self) {
        self.entries.clear();
        self.inner = HnswInner::new(self.metric, self.ef_construction);
    }

    /// Returns all entries as a JSON string for persistence (TypeScript save/load).
    pub fn export_entries_json(&self) -> String {
        serde_json::to_string(&self.entries).unwrap_or_else(|_| "[]".to_string())
    }

    #[wasm_bindgen(getter)]
    pub fn size(&self) -> usize {
        self.entries.len()
    }
}

impl HnswIndex {
    fn rebuild(&mut self) {
        self.inner = HnswInner::new(self.metric, self.ef_construction);
        let mut searcher: Searcher<u32> = Searcher::default();
        for entry in &self.entries {
            self.inner.insert(entry.vector.clone(), &mut searcher);
        }
    }

    /// Convert HNSW-internal distance (u32 bits of a non-negative f32) back to a
    /// "higher = better" score. Dot metric recomputes actual dot product from vectors.
    fn distance_to_score(&self, distance_bits: u32, query: &[f32], entry_vec: &[f32]) -> f32 {
        match self.metric {
            Metric::Cosine => 1.0 - f32::from_bits(distance_bits),
            Metric::L2 => l2_score(f32::from_bits(distance_bits)),
            Metric::Dot => dot_product(query, entry_vec),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn idx(metric: &str) -> HnswIndex {
        HnswIndex::new(3, metric, 100)
    }

    #[test]
    fn new_hnsw_index_is_empty() {
        assert_eq!(idx("cosine").size(), 0);
    }

    #[test]
    fn upsert_adds_entries() {
        let mut i = idx("cosine");
        i.upsert(r#"["a","b"]"#, &[1.0, 0.0, 0.0, 0.0, 1.0, 0.0], r#"[{},{}]"#);
        assert_eq!(i.size(), 2);
    }

    #[test]
    fn search_finds_nearest_cosine() {
        let mut i = idx("cosine");
        i.upsert(
            r#"["a","b","c"]"#,
            &[1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0],
            r#"[{},{},{}]"#,
        );
        let res: Vec<serde_json::Value> =
            serde_json::from_str(&i.search(&[1.0, 0.0, 0.0], 1, "null")).unwrap();
        assert_eq!(res.len(), 1);
        assert_eq!(res[0]["id"], "a");
        assert!((res[0]["score"].as_f64().unwrap() - 1.0).abs() < 1e-5);
    }

    #[test]
    fn search_finds_nearest_l2() {
        let mut i = idx("l2");
        i.upsert(
            r#"["a","b"]"#,
            &[0.9, 0.1, 0.0, 0.0, 1.0, 0.0],
            r#"[{},{}]"#,
        );
        let res: Vec<serde_json::Value> =
            serde_json::from_str(&i.search(&[1.0, 0.0, 0.0], 1, "null")).unwrap();
        assert_eq!(res[0]["id"], "a");
    }

    #[test]
    fn search_finds_nearest_dot() {
        let mut i = idx("dot");
        i.upsert(
            r#"["a","b"]"#,
            &[0.9, 0.0, 0.0, 0.1, 0.0, 0.0],
            r#"[{},{}]"#,
        );
        // query [1,0,0]: dot with a=0.9, dot with b=0.1 — a should win
        let res: Vec<serde_json::Value> =
            serde_json::from_str(&i.search(&[1.0, 0.0, 0.0], 1, "null")).unwrap();
        assert_eq!(res[0]["id"], "a");
    }

    #[test]
    fn search_empty_index_returns_empty() {
        let i = idx("cosine");
        let res: Vec<serde_json::Value> =
            serde_json::from_str(&i.search(&[1.0, 0.0, 0.0], 5, "null")).unwrap();
        assert!(res.is_empty());
    }

    #[test]
    fn upsert_replaces_existing_id() {
        let mut i = idx("cosine");
        i.upsert(r#"["a"]"#, &[1.0, 0.0, 0.0], r#"[{}]"#);
        i.upsert(r#"["a"]"#, &[0.0, 1.0, 0.0], r#"[{}]"#);
        assert_eq!(i.size(), 1);
        let res: Vec<serde_json::Value> =
            serde_json::from_str(&i.search(&[0.0, 1.0, 0.0], 1, "null")).unwrap();
        assert_eq!(res[0]["id"], "a");
    }

    #[test]
    fn delete_removes_entry() {
        let mut i = idx("cosine");
        i.upsert(
            r#"["a","b","c"]"#,
            &[1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0],
            r#"[{},{},{}]"#,
        );
        i.delete(r#"["a"]"#);
        assert_eq!(i.size(), 2);
        let res: Vec<serde_json::Value> =
            serde_json::from_str(&i.search(&[1.0, 0.0, 0.0], 5, "null")).unwrap();
        assert!(!res.iter().any(|r| r["id"] == "a"));
    }

    #[test]
    fn clear_empties_index() {
        let mut i = idx("cosine");
        i.upsert(r#"["a","b"]"#, &[1.0, 0.0, 0.0, 0.0, 1.0, 0.0], r#"[{},{}]"#);
        i.clear();
        assert_eq!(i.size(), 0);
    }

    #[test]
    fn search_with_filter_post_filters() {
        let mut i = idx("cosine");
        i.upsert(
            r#"["a","b"]"#,
            &[1.0, 0.0, 0.0, 1.0, 0.0, 0.0],
            r#"[{"cat":"science"},{"cat":"math"}]"#,
        );
        let res: Vec<serde_json::Value> =
            serde_json::from_str(&i.search(&[1.0, 0.0, 0.0], 10, r#"{"cat":"science"}"#)).unwrap();
        assert_eq!(res.len(), 1);
        assert_eq!(res[0]["id"], "a");
    }

    #[test]
    fn export_entries_json_round_trips() {
        let mut i = idx("cosine");
        i.upsert(r#"["a"]"#, &[1.0, 0.0, 0.0], r#"[{"tag":"x"}]"#);
        let json = i.export_entries_json();
        let entries: Vec<serde_json::Value> = serde_json::from_str(&json).unwrap();
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0]["id"], "a");
    }

    // Incremental append: two separate upsert calls with all-new IDs each time.
    // Exercises the append-only graph insertion path (no rebuild).
    #[test]
    fn incremental_append_is_searchable() {
        let mut i = idx("cosine");
        i.upsert(r#"["a","b"]"#, &[1.0, 0.0, 0.0, 0.0, 1.0, 0.0], r#"[{},{}]"#);
        i.upsert(r#"["c","d"]"#, &[0.0, 0.0, 1.0, 1.0, 1.0, 0.0], r#"[{},{}]"#);
        assert_eq!(i.size(), 4);
        // query near "d" [1,1,0] — should find "d" first (score near 1.0 after normalising)
        let res: Vec<serde_json::Value> =
            serde_json::from_str(&i.search(&[1.0, 1.0, 0.0], 4, "null")).unwrap();
        assert_eq!(res.len(), 4);
        // All four entries must appear in results
        let ids: Vec<&str> = res.iter().map(|r| r["id"].as_str().unwrap()).collect();
        assert!(ids.contains(&"a"));
        assert!(ids.contains(&"b"));
        assert!(ids.contains(&"c"));
        assert!(ids.contains(&"d"));
    }
}
