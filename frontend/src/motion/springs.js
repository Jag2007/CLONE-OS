/** Shared Motion transitions — springs feel “buttery”; instant enough for reduced-motion via MotionConfig */

export const springSnappy = {
  type: "spring",
  stiffness: 420,
  damping: 32,
  mass: 0.85,
};

export const springSoft = {
  type: "spring",
  stiffness: 280,
  damping: 28,
  mass: 1,
};

export const springBouncy = {
  type: "spring",
  stiffness: 380,
  damping: 22,
  mass: 0.9,
};

/** Short tween when springs are disabled by user preference */
export const tweenFast = { duration: 0.2, ease: [0.25, 0.1, 0.25, 1] };

export const tweenMedium = { duration: 0.35, ease: [0.25, 0.1, 0.25, 1] };
