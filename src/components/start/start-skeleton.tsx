import { motion } from 'framer-motion';

export function StartSkeleton() {
  return (
    <div className="space-y-6">
      {/* Header skeleton */}
      <div className="flex items-center gap-3">
        <div className="size-10 animate-pulse rounded-xl bg-muted" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-40 animate-pulse rounded bg-muted" />
          <div className="h-3 w-24 animate-pulse rounded bg-muted" />
        </div>
        <div className="size-10 animate-pulse rounded-xl bg-muted" />
        <div className="h-6 w-16 animate-pulse rounded-full bg-muted" />
      </div>

      {/* Status card skeleton */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="h-24 animate-pulse rounded-[18px] bg-muted"
            style={{ animationDelay: `${i * 80}ms` }}
          />
        ))}
      </div>

      {/* Progress skeleton */}
      <div className="h-28 animate-pulse rounded-[18px] bg-muted" />

      {/* Products skeleton */}
      <div className="space-y-3">
        <div className="h-5 w-32 animate-pulse rounded bg-muted" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: i * 0.05 }}
              className="overflow-hidden rounded-[18px] border border-border bg-card"
            >
              <div className="aspect-square animate-pulse bg-muted" />
              <div className="space-y-2 p-4">
                <div className="h-3 w-full animate-pulse rounded bg-muted" />
                <div className="h-3 w-2/3 animate-pulse rounded bg-muted" />
                <div className="h-5 w-20 animate-pulse rounded bg-muted" />
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}
