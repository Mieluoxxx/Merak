//! `merak-core` — Cordis-backed domain microkernel for Merak.

pub mod events;
pub mod git;
pub mod plugins;
pub mod store;
pub mod types;

pub use events::*;
pub use store::{StoreConfig, StoreService};
pub use types::*;
