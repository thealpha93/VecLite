use crate::types::{FilterOperator, FilterValue, Metadata, MetadataValue};
use std::collections::HashMap;

/// Map of field name → filter predicate (exact match or operator object).
pub type Filter = HashMap<String, FilterValue>;

/// Returns true if every key in `filter` passes its predicate against `metadata`.
/// Missing keys always fail. Empty filter matches everything (vacuously true).
pub fn matches_filter(metadata: &Metadata, filter: &Filter) -> bool {
    filter.iter().all(|(key, filter_val)| {
        match metadata.get(key) {
            None => false,
            Some(actual) => matches_filter_value(actual, filter_val),
        }
    })
}

fn matches_filter_value(actual: &MetadataValue, filter_val: &FilterValue) -> bool {
    match filter_val {
        FilterValue::Exact(expected) => actual == expected,
        FilterValue::Operator(op) => matches_operator(actual, op),
    }
}

/// Evaluates all operator predicates in AND fashion — all must hold for a match.
fn matches_operator(actual: &MetadataValue, op: &FilterOperator) -> bool {
    if let Some(threshold) = op.gte {
        match actual {
            MetadataValue::Number(n) => {
                if *n < threshold {
                    return false;
                }
            }
            _ => return false, // $gte only applies to numbers
        }
    }
    if let Some(threshold) = op.lte {
        match actual {
            MetadataValue::Number(n) => {
                if *n > threshold {
                    return false;
                }
            }
            _ => return false, // $lte only applies to numbers
        }
    }
    if let Some(candidates) = &op.in_values {
        if !candidates.contains(actual) {
            return false;
        }
    }
    if let Some(not_expected) = &op.ne {
        if actual == not_expected {
            return false;
        }
    }
    true
}

#[cfg(test)]
mod tests {
    use super::*;

    fn meta(pairs: &[(&str, MetadataValue)]) -> Metadata {
        pairs
            .iter()
            .map(|(k, v)| (k.to_string(), v.clone()))
            .collect()
    }

    /// Build a filter using exact-match predicates only (v0.1 style).
    fn filter_exact(pairs: &[(&str, MetadataValue)]) -> Filter {
        pairs
            .iter()
            .map(|(k, v)| (k.to_string(), FilterValue::Exact(v.clone())))
            .collect()
    }

    fn op_filter(key: &str, op: FilterOperator) -> Filter {
        let mut f = Filter::new();
        f.insert(key.to_string(), FilterValue::Operator(op));
        f
    }

    fn gte(val: f64) -> FilterOperator {
        FilterOperator { gte: Some(val), lte: None, in_values: None, ne: None }
    }
    fn lte(val: f64) -> FilterOperator {
        FilterOperator { gte: None, lte: Some(val), in_values: None, ne: None }
    }
    fn in_op(vals: Vec<MetadataValue>) -> FilterOperator {
        FilterOperator { gte: None, lte: None, in_values: Some(vals), ne: None }
    }
    fn ne_op(val: MetadataValue) -> FilterOperator {
        FilterOperator { gte: None, lte: None, in_values: None, ne: Some(val) }
    }
    fn range(lo: f64, hi: f64) -> FilterOperator {
        FilterOperator { gte: Some(lo), lte: Some(hi), in_values: None, ne: None }
    }

    // ── v0.1 exact-match tests (must remain passing) ─────────────────────────

    #[test]
    fn empty_filter_matches_everything() {
        let m = meta(&[("category", MetadataValue::String("science".into()))]);
        assert!(matches_filter(&m, &filter_exact(&[])));
    }

    #[test]
    fn exact_string_match() {
        let m = meta(&[("category", MetadataValue::String("science".into()))]);
        let f = filter_exact(&[("category", MetadataValue::String("science".into()))]);
        assert!(matches_filter(&m, &f));
    }

    #[test]
    fn string_mismatch() {
        let m = meta(&[("category", MetadataValue::String("math".into()))]);
        let f = filter_exact(&[("category", MetadataValue::String("science".into()))]);
        assert!(!matches_filter(&m, &f));
    }

    #[test]
    fn number_match() {
        let m = meta(&[("year", MetadataValue::Number(2024.0))]);
        let f = filter_exact(&[("year", MetadataValue::Number(2024.0))]);
        assert!(matches_filter(&m, &f));
    }

    #[test]
    fn bool_match() {
        let m = meta(&[("active", MetadataValue::Bool(true))]);
        let f = filter_exact(&[("active", MetadataValue::Bool(true))]);
        assert!(matches_filter(&m, &f));
    }

    #[test]
    fn missing_key_does_not_match() {
        let m = meta(&[("category", MetadataValue::String("science".into()))]);
        let f = filter_exact(&[("year", MetadataValue::Number(2024.0))]);
        assert!(!matches_filter(&m, &f));
    }

    #[test]
    fn all_keys_must_match() {
        let m = meta(&[
            ("category", MetadataValue::String("science".into())),
            ("year", MetadataValue::Number(2024.0)),
        ]);
        let f = filter_exact(&[
            ("category", MetadataValue::String("science".into())),
            ("year", MetadataValue::Number(2025.0)),
        ]);
        assert!(!matches_filter(&m, &f));
    }

    #[test]
    fn multi_key_filter_all_match() {
        let m = meta(&[
            ("category", MetadataValue::String("science".into())),
            ("year", MetadataValue::Number(2024.0)),
            ("active", MetadataValue::Bool(true)),
        ]);
        let f = filter_exact(&[
            ("category", MetadataValue::String("science".into())),
            ("active", MetadataValue::Bool(true)),
        ]);
        assert!(matches_filter(&m, &f));
    }

    // ── $gte ─────────────────────────────────────────────────────────────────

    #[test]
    fn gte_matches_equal_number() {
        let m = meta(&[("year", MetadataValue::Number(2020.0))]);
        assert!(matches_filter(&m, &op_filter("year", gte(2020.0))));
    }

    #[test]
    fn gte_matches_greater_number() {
        let m = meta(&[("year", MetadataValue::Number(2024.0))]);
        assert!(matches_filter(&m, &op_filter("year", gte(2020.0))));
    }

    #[test]
    fn gte_rejects_lesser_number() {
        let m = meta(&[("year", MetadataValue::Number(2018.0))]);
        assert!(!matches_filter(&m, &op_filter("year", gte(2020.0))));
    }

    #[test]
    fn gte_rejects_non_number() {
        let m = meta(&[("year", MetadataValue::String("2024".into()))]);
        assert!(!matches_filter(&m, &op_filter("year", gte(2020.0))));
    }

    #[test]
    fn gte_rejects_bool() {
        let m = meta(&[("year", MetadataValue::Bool(true))]);
        assert!(!matches_filter(&m, &op_filter("year", gte(0.0))));
    }

    // ── $lte ─────────────────────────────────────────────────────────────────

    #[test]
    fn lte_matches_equal_number() {
        let m = meta(&[("year", MetadataValue::Number(2024.0))]);
        assert!(matches_filter(&m, &op_filter("year", lte(2024.0))));
    }

    #[test]
    fn lte_matches_lesser_number() {
        let m = meta(&[("year", MetadataValue::Number(2020.0))]);
        assert!(matches_filter(&m, &op_filter("year", lte(2024.0))));
    }

    #[test]
    fn lte_rejects_greater_number() {
        let m = meta(&[("year", MetadataValue::Number(2025.0))]);
        assert!(!matches_filter(&m, &op_filter("year", lte(2024.0))));
    }

    #[test]
    fn lte_rejects_non_number() {
        let m = meta(&[("year", MetadataValue::String("2020".into()))]);
        assert!(!matches_filter(&m, &op_filter("year", lte(2024.0))));
    }

    // ── $in ──────────────────────────────────────────────────────────────────

    #[test]
    fn in_matches_string_in_array() {
        let m = meta(&[("cat", MetadataValue::String("science".into()))]);
        let f = op_filter(
            "cat",
            in_op(vec![
                MetadataValue::String("science".into()),
                MetadataValue::String("tech".into()),
            ]),
        );
        assert!(matches_filter(&m, &f));
    }

    #[test]
    fn in_misses_string_not_in_array() {
        let m = meta(&[("cat", MetadataValue::String("math".into()))]);
        let f = op_filter(
            "cat",
            in_op(vec![
                MetadataValue::String("science".into()),
                MetadataValue::String("tech".into()),
            ]),
        );
        assert!(!matches_filter(&m, &f));
    }

    #[test]
    fn in_matches_number_in_array() {
        let m = meta(&[("year", MetadataValue::Number(2023.0))]);
        let f = op_filter(
            "year",
            in_op(vec![
                MetadataValue::Number(2022.0),
                MetadataValue::Number(2023.0),
                MetadataValue::Number(2024.0),
            ]),
        );
        assert!(matches_filter(&m, &f));
    }

    #[test]
    fn in_empty_array_never_matches() {
        let m = meta(&[("cat", MetadataValue::String("science".into()))]);
        assert!(!matches_filter(&m, &op_filter("cat", in_op(vec![]))));
    }

    // ── $ne ──────────────────────────────────────────────────────────────────

    #[test]
    fn ne_matches_when_value_differs() {
        let m = meta(&[("status", MetadataValue::String("active".into()))]);
        let f = op_filter("status", ne_op(MetadataValue::String("archived".into())));
        assert!(matches_filter(&m, &f));
    }

    #[test]
    fn ne_misses_when_value_equal() {
        let m = meta(&[("status", MetadataValue::String("archived".into()))]);
        let f = op_filter("status", ne_op(MetadataValue::String("archived".into())));
        assert!(!matches_filter(&m, &f));
    }

    #[test]
    fn ne_matches_different_type() {
        // String "1" != Number 1.0 — different MetadataValue variants
        let m = meta(&[("val", MetadataValue::String("1".into()))]);
        let f = op_filter("val", ne_op(MetadataValue::Number(1.0)));
        assert!(matches_filter(&m, &f));
    }

    // ── Combined operators (AND semantics) ────────────────────────────────────

    #[test]
    fn combined_gte_lte_range_match() {
        let m = meta(&[("year", MetadataValue::Number(2022.0))]);
        assert!(matches_filter(&m, &op_filter("year", range(2020.0, 2023.0))));
    }

    #[test]
    fn combined_gte_lte_range_miss_below() {
        let m = meta(&[("year", MetadataValue::Number(2019.0))]);
        assert!(!matches_filter(&m, &op_filter("year", range(2020.0, 2023.0))));
    }

    #[test]
    fn combined_gte_lte_range_miss_above() {
        let m = meta(&[("year", MetadataValue::Number(2025.0))]);
        assert!(!matches_filter(&m, &op_filter("year", range(2020.0, 2023.0))));
    }

    // ── Mixed exact + operator in same filter (AND across keys) ──────────────

    #[test]
    fn mixed_exact_and_operator_both_match() {
        let m = meta(&[
            ("cat", MetadataValue::String("science".into())),
            ("year", MetadataValue::Number(2022.0)),
        ]);
        let mut f = op_filter("year", gte(2020.0));
        f.insert("cat".to_string(), FilterValue::Exact(MetadataValue::String("science".into())));
        assert!(matches_filter(&m, &f));
    }

    #[test]
    fn mixed_exact_and_operator_exact_fails() {
        let m = meta(&[
            ("cat", MetadataValue::String("math".into())),
            ("year", MetadataValue::Number(2022.0)),
        ]);
        let mut f = op_filter("year", gte(2020.0));
        f.insert("cat".to_string(), FilterValue::Exact(MetadataValue::String("science".into())));
        assert!(!matches_filter(&m, &f));
    }

    #[test]
    fn mixed_exact_and_operator_op_fails() {
        let m = meta(&[
            ("cat", MetadataValue::String("science".into())),
            ("year", MetadataValue::Number(2018.0)),
        ]);
        let mut f = op_filter("year", gte(2020.0));
        f.insert("cat".to_string(), FilterValue::Exact(MetadataValue::String("science".into())));
        assert!(!matches_filter(&m, &f));
    }
}
