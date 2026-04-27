use crate::types::{Metadata, MetadataValue};
use std::collections::HashMap;

pub type Filter = HashMap<String, MetadataValue>;

pub fn matches_filter(metadata: &Metadata, filter: &Filter) -> bool {
    filter
        .iter()
        .all(|(key, expected)| metadata.get(key).map_or(false, |actual| actual == expected))
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

    fn filter(pairs: &[(&str, MetadataValue)]) -> Filter {
        pairs
            .iter()
            .map(|(k, v)| (k.to_string(), v.clone()))
            .collect()
    }

    #[test]
    fn empty_filter_matches_everything() {
        let m = meta(&[("category", MetadataValue::String("science".into()))]);
        assert!(matches_filter(&m, &filter(&[])));
    }

    #[test]
    fn exact_string_match() {
        let m = meta(&[("category", MetadataValue::String("science".into()))]);
        let f = filter(&[("category", MetadataValue::String("science".into()))]);
        assert!(matches_filter(&m, &f));
    }

    #[test]
    fn string_mismatch() {
        let m = meta(&[("category", MetadataValue::String("math".into()))]);
        let f = filter(&[("category", MetadataValue::String("science".into()))]);
        assert!(!matches_filter(&m, &f));
    }

    #[test]
    fn number_match() {
        let m = meta(&[("year", MetadataValue::Number(2024.0))]);
        let f = filter(&[("year", MetadataValue::Number(2024.0))]);
        assert!(matches_filter(&m, &f));
    }

    #[test]
    fn bool_match() {
        let m = meta(&[("active", MetadataValue::Bool(true))]);
        let f = filter(&[("active", MetadataValue::Bool(true))]);
        assert!(matches_filter(&m, &f));
    }

    #[test]
    fn missing_key_does_not_match() {
        let m = meta(&[("category", MetadataValue::String("science".into()))]);
        let f = filter(&[("year", MetadataValue::Number(2024.0))]);
        assert!(!matches_filter(&m, &f));
    }

    #[test]
    fn all_keys_must_match() {
        let m = meta(&[
            ("category", MetadataValue::String("science".into())),
            ("year", MetadataValue::Number(2024.0)),
        ]);
        let f = filter(&[
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
        let f = filter(&[
            ("category", MetadataValue::String("science".into())),
            ("active", MetadataValue::Bool(true)),
        ]);
        assert!(matches_filter(&m, &f));
    }
}
