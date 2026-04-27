use crate::filter::{matches_filter, Filter};
use crate::similarity::cosine_similarity;
use crate::types::{Metadata, SearchResult, VectorEntry};
use std::collections::HashSet;
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub struct FlatIndex {
    dimensions: usize,
    entries: Vec<VectorEntry>,
}

#[wasm_bindgen]
impl FlatIndex {
    #[wasm_bindgen(constructor)]
    pub fn new(dimensions: usize) -> FlatIndex {
        FlatIndex {
            dimensions,
            entries: Vec::new(),
        }
    }

    /// Batch upsert. ids_json: '["id1","id2"]', flat_vectors: Float32Array
    /// (all vectors concatenated), metadata_json: '[{...},{...}]'.
    pub fn upsert(&mut self, ids_json: &str, flat_vectors: &[f32], metadata_json: &str) {
        let ids: Vec<String> = serde_json::from_str(ids_json).unwrap_or_default();
        let metas: Vec<Metadata> = serde_json::from_str(metadata_json).unwrap_or_default();

        for (i, id) in ids.iter().enumerate() {
            let start = i * self.dimensions;
            let end = start + self.dimensions;
            let vector = flat_vectors[start..end].to_vec();
            let metadata = metas.get(i).cloned().unwrap_or_default();

            if let Some(entry) = self.entries.iter_mut().find(|e| e.id == *id) {
                entry.vector = vector;
                entry.metadata = metadata;
            } else {
                self.entries.push(VectorEntry { id: id.clone(), vector, metadata });
            }
        }
    }

    /// Search top_k nearest neighbours. filter_json: JSON object or 'null'.
    /// Returns JSON: '[{"id":"...","score":0.95,"metadata":{...}}]'.
    pub fn search(&self, query: &[f32], top_k: usize, filter_json: &str) -> String {
        let filter: Option<Filter> = serde_json::from_str(filter_json).ok().flatten();

        let mut scored: Vec<(f32, usize)> = self
            .entries
            .iter()
            .enumerate()
            .filter(|(_, entry)| {
                filter.as_ref().map_or(true, |f| matches_filter(&entry.metadata, f))
            })
            .map(|(i, entry)| (cosine_similarity(query, &entry.vector), i))
            .collect();

        scored.sort_unstable_by(|a, b| b.0.partial_cmp(&a.0).unwrap_or(std::cmp::Ordering::Equal));

        let results: Vec<SearchResult> = scored
            .into_iter()
            .take(top_k)
            .map(|(score, i)| SearchResult {
                id: self.entries[i].id.clone(),
                score,
                metadata: self.entries[i].metadata.clone(),
            })
            .collect();

        serde_json::to_string(&results).unwrap_or_else(|_| "[]".to_string())
    }

    /// Delete entries by ID. ids_json: '["id1","id2"]'.
    pub fn delete(&mut self, ids_json: &str) {
        let ids: HashSet<String> = serde_json::from_str::<Vec<String>>(ids_json)
            .unwrap_or_default()
            .into_iter()
            .collect();
        self.entries.retain(|e| !ids.contains(&e.id));
    }

    pub fn clear(&mut self) {
        self.entries.clear();
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

#[cfg(test)]
mod tests {
    use super::*;

    fn idx() -> FlatIndex {
        FlatIndex::new(3)
    }

    #[test]
    fn new_index_is_empty() {
        assert_eq!(idx().size(), 0);
    }

    #[test]
    fn upsert_adds_entries() {
        let mut i = idx();
        i.upsert(r#"["a","b"]"#, &[1.0, 0.0, 0.0, 0.0, 1.0, 0.0], r#"[{},{}]"#);
        assert_eq!(i.size(), 2);
    }

    #[test]
    fn upsert_replaces_existing_id() {
        let mut i = idx();
        i.upsert(r#"["a"]"#, &[1.0, 0.0, 0.0], r#"[{}]"#);
        i.upsert(r#"["a"]"#, &[0.0, 1.0, 0.0], r#"[{}]"#);
        assert_eq!(i.size(), 1);
        let res: Vec<serde_json::Value> =
            serde_json::from_str(&i.search(&[0.0, 1.0, 0.0], 1, "null")).unwrap();
        assert_eq!(res[0]["id"], "a");
        assert!((res[0]["score"].as_f64().unwrap() - 1.0).abs() < 1e-6);
    }

    #[test]
    fn search_sorted_by_score_descending() {
        let mut i = idx();
        i.upsert(
            r#"["a","b","c"]"#,
            &[1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 1.0, 1.0, 0.0],
            r#"[{},{},{}]"#,
        );
        // Query along x: a (score 1.0) > c (~0.707) > b (0.0)
        let res: Vec<serde_json::Value> =
            serde_json::from_str(&i.search(&[1.0, 0.0, 0.0], 3, "null")).unwrap();
        assert_eq!(res[0]["id"], "a");
        assert_eq!(res[1]["id"], "c");
        assert_eq!(res[2]["id"], "b");
    }

    #[test]
    fn search_with_filter_pre_filters_candidates() {
        let mut i = idx();
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
    fn search_null_filter_returns_all_candidates() {
        let mut i = idx();
        i.upsert(
            r#"["a","b"]"#,
            &[1.0, 0.0, 0.0, 0.0, 1.0, 0.0],
            r#"[{"cat":"science"},{"cat":"math"}]"#,
        );
        let res: Vec<serde_json::Value> =
            serde_json::from_str(&i.search(&[1.0, 0.0, 0.0], 10, "null")).unwrap();
        assert_eq!(res.len(), 2);
    }

    #[test]
    fn search_top_k_limits_results() {
        let mut i = idx();
        i.upsert(
            r#"["a","b","c"]"#,
            &[1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0],
            r#"[{},{},{}]"#,
        );
        let res: Vec<serde_json::Value> =
            serde_json::from_str(&i.search(&[1.0, 0.0, 0.0], 1, "null")).unwrap();
        assert_eq!(res.len(), 1);
    }

    #[test]
    fn delete_removes_entries() {
        let mut i = idx();
        i.upsert(
            r#"["a","b","c"]"#,
            &[1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0],
            r#"[{},{},{}]"#,
        );
        i.delete(r#"["a","c"]"#);
        assert_eq!(i.size(), 1);
        let res: Vec<serde_json::Value> =
            serde_json::from_str(&i.search(&[0.0, 1.0, 0.0], 10, "null")).unwrap();
        assert_eq!(res[0]["id"], "b");
    }

    #[test]
    fn clear_empties_index() {
        let mut i = idx();
        i.upsert(r#"["a","b"]"#, &[1.0, 0.0, 0.0, 0.0, 1.0, 0.0], r#"[{},{}]"#);
        i.clear();
        assert_eq!(i.size(), 0);
    }

    #[test]
    fn export_entries_json_round_trips() {
        let mut i = idx();
        i.upsert(r#"["a"]"#, &[1.0, 0.0, 0.0], r#"[{"tag":"x"}]"#);
        let json = i.export_entries_json();
        let entries: Vec<serde_json::Value> = serde_json::from_str(&json).unwrap();
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0]["id"], "a");
        assert_eq!(entries[0]["metadata"]["tag"], "x");
    }
}
