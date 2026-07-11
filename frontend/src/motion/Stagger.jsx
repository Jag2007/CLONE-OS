import React from "react";
import { motion } from "motion/react";
import { springSnappy } from "./springs";

const STAGGER_EACH = 0.045;

const containerVariants = {
  hidden: { opacity: 1 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: STAGGER_EACH,
      delayChildren: 0.06,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 10 },
  show: {
    opacity: 1,
    y: 0,
    transition: springSnappy,
  },
};

export function StaggerContainer({ children, className, style }) {
  return (
    <motion.div
      className={className}
      style={style}
      variants={containerVariants}
      initial="hidden"
      animate="show"
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({ children, className, style }) {
  return (
    <motion.div variants={itemVariants} className={className} style={style}>
      {children}
    </motion.div>
  );
}

/** Clamp delay for long lists (cap index contribution) */
const MAX_INDEX_FOR_DELAY = 10;

export function StaggerItemIndexed({ children, className, style, index = 0 }) {
  const delay = Math.min(index, MAX_INDEX_FOR_DELAY) * STAGGER_EACH;
  return (
    <motion.div
      className={className}
      style={style}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...springSnappy, delay }}
    >
      {children}
    </motion.div>
  );
}

export { itemVariants, containerVariants };
