import React from "react";
import { motion } from "motion/react";
import { springSoft } from "./springs";

const variants = {
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -10 },
};

/**
 * Wrap route or step content. Use inside AnimatePresence with a stable key.
 */
export function PageTransition({ children, className, style }) {
  return (
    <motion.div
      className={className}
      style={style}
      variants={variants}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={springSoft}
    >
      {children}
    </motion.div>
  );
}
