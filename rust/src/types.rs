use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum MetadataValue {
    Bool(bool),
    Number(f64),
    String(String),
}

pub type Metadata = HashMap<String, MetadataValue>;

/// Operator-based predicate for a single metadata field.
/// All fields are optional; multiple operators on the same field use AND semantics.
#[derive(Debug, Clone, Deserialize)]
pub struct FilterOperator {
    #[serde(rename = "$gte")]
    pub gte: Option<f64>,
    #[serde(rename = "$lte")]
    pub lte: Option<f64>,
    /// Membership test: field value must be one of these.
    #[serde(rename = "$in")]
    pub in_values: Option<Vec<MetadataValue>>,
    #[serde(rename = "$ne")]
    pub ne: Option<MetadataValue>,
}

/// A filter predicate for one metadata key — either an exact value or an operator object.
/// Serde's untagged enum tries Exact first (primitives), then Operator (objects).
#[derive(Debug, Clone, Deserialize)]
#[serde(untagged)]
pub enum FilterValue {
    Exact(MetadataValue),
    Operator(FilterOperator),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VectorEntry {
    pub id: String,
    pub vector: Vec<f32>,
    pub metadata: Metadata,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResult {
    pub id: String,
    pub score: f32,
    pub metadata: Metadata,
}
