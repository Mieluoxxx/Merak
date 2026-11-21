//! `StoreService` ("store"): thread-safe domain snapshot state and monotonic revision emitter.

use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, RwLock};

use cordis::{Context, CordisError, Service};
use merak_contracts::{MerakSnapshot, seed_snapshot};
use tokio::sync::watch;

use crate::events::{EVT_SNAPSHOT_CHANGED, SnapshotChangedEvent};

#[derive(Clone)]
pub struct StoreConfig {
    pub initial_snapshot: MerakSnapshot,
}

impl Default for StoreConfig {
    fn default() -> Self {
        Self {
            initial_snapshot: seed_snapshot(),
        }
    }
}

/// Core snapshot store registered as Cordis service `"store"`.
pub struct StoreService {
    ctx: Context,
    snapshot: RwLock<MerakSnapshot>,
    revision: AtomicU64,
    id_seq: AtomicU64,
    rev_tx: watch::Sender<u64>,
}

impl StoreService {
    pub fn with_seed(initial_snapshot: MerakSnapshot) -> StoreConfig {
        StoreConfig { initial_snapshot }
    }

    pub fn snapshot(&self) -> MerakSnapshot {
        self.snapshot.read().unwrap().clone()
    }

    pub fn revision(&self) -> u64 {
        self.revision.load(Ordering::SeqCst)
    }

    pub fn subscribe_revision(&self) -> watch::Receiver<u64> {
        self.rev_tx.subscribe()
    }

    pub fn read<R>(&self, f: impl FnOnce(&MerakSnapshot) -> R) -> R {
        let guard = self.snapshot.read().unwrap();
        f(&guard)
    }

    /// Mutate the authoritative snapshot under lock, release the lock, then notify watchers & Cordis listeners.
    pub fn write<R>(&self, reason: impl Into<String>, f: impl FnOnce(&mut MerakSnapshot) -> R) -> R {
        let out = {
            let mut guard = self.snapshot.write().unwrap();
            f(&mut guard)
        };
        let rev = self.revision.fetch_add(1, Ordering::SeqCst) + 1;
        let _ = self.rev_tx.send(rev);
        self.ctx.emit(
            EVT_SNAPSHOT_CHANGED,
            SnapshotChangedEvent {
                revision: rev,
                reason: reason.into(),
            },
        );
        out
    }

    pub fn next_id(&self, prefix: &str) -> String {
        let seq = self.id_seq.fetch_add(1, Ordering::SeqCst);
        format!("{prefix}-{seq}")
    }
}

impl Service for StoreService {
    type Config = StoreConfig;

    fn service_name() -> &'static str {
        "store"
    }

    fn create(ctx: &Context, config: Self::Config) -> Result<Arc<Self>, CordisError> {
        let (rev_tx, _rx) = watch::channel(1_u64);
        Ok(Arc::new(Self {
            ctx: ctx.clone(),
            snapshot: RwLock::new(config.initial_snapshot),
            revision: AtomicU64::new(1),
            id_seq: AtomicU64::new(100),
            rev_tx,
        }))
    }
}
