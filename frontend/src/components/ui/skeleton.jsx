import { cn } from "@/lib/utils";

function Skeleton({ className, ...props }) {
  return (
    <div
      className={cn("rounded-md bg-muted relative overflow-hidden", className)}
      {...props}
    >
      <div className="skeleton-shimmer" />
    </div>
  );
}

export { Skeleton };
