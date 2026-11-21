use gpui::{SpringConfig, SpringState};

/// Fast critically-damped spring tuned for 120Hz sidebar and macOS glass vibrancy glide.
pub const SIDEBAR_SPRING: SpringConfig = SpringConfig::new(420.0, 42.0, 1.0);

/// Crisp spring for selection pills sliding in the realm rail and sub-sidebar.
pub const PILL_SPRING: SpringConfig = SpringConfig::new(520.0, 45.0, 1.0);

/// Critically-damped spring for right-side inspector and comment drawers.
pub const DRAWER_SPRING: SpringConfig = SpringConfig::new(460.0, 43.0, 1.0);

/// Positional tolerance (in logical pixels) for spring settling.
const SETTLE_EPSILON: f32 = 0.35;

/// Scalar spring track driving one UI metric (width or offset) across animation frames.
#[derive(Clone, Copy, Debug)]
pub struct MotionTrack {
    config: SpringConfig,
    state: SpringState,
    target: f32,
}

impl MotionTrack {
    pub fn new(config: SpringConfig, initial: f32) -> Self {
        Self {
            config,
            state: SpringState {
                position: initial,
                velocity: 0.0,
            },
            target: initial,
        }
    }

    pub fn value(&self) -> f32 {
        self.state.position
    }

    pub fn set_target(&mut self, target: f32) {
        self.target = target;
    }

    /// Snap immediately to `value` with zero velocity (used across realm switches or reduce-motion).
    pub fn snap(&mut self, value: f32) {
        self.target = value;
        self.state = SpringState {
            position: value,
            velocity: 0.0,
        };
    }

    pub fn is_moving(&self) -> bool {
        !self.config.is_settled(self.state, self.target, SETTLE_EPSILON)
    }

    /// Advance the spring by `dt` seconds. Returns `true` while still in motion.
    pub fn step(&mut self, dt: f32, reduce_motion: bool) -> bool {
        if reduce_motion {
            self.snap(self.target);
            return false;
        }
        if !self.is_moving() {
            self.state.position = self.target;
            self.state.velocity = 0.0;
            return false;
        }
        // Clamp frame delta so waking from an idle pause never produces a coarse step.
        let clamped_dt = dt.clamp(1.0 / 240.0, 1.0 / 24.0);
        self.state = self.config.step(self.state, self.target, clamped_dt);
        if self.config.is_settled(self.state, self.target, SETTLE_EPSILON) {
            self.state.position = self.target;
            self.state.velocity = 0.0;
            false
        } else {
            true
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn spring_converges_and_settles() {
        let mut track = MotionTrack::new(SIDEBAR_SPRING, 0.0);
        track.set_target(292.0);
        assert!(track.is_moving());

        let mut steps = 0;
        while track.step(1.0 / 120.0, false) {
            steps += 1;
            assert!(steps < 240, "spring failed to settle in 2 seconds");
        }
        assert!(!track.is_moving());
        assert_eq!(track.value(), 292.0);
    }

    #[test]
    fn reduce_motion_snaps_immediately() {
        let mut track = MotionTrack::new(DRAWER_SPRING, 320.0);
        track.set_target(0.0);
        assert!(!track.step(1.0 / 120.0, true));
        assert_eq!(track.value(), 0.0);
    }
}
