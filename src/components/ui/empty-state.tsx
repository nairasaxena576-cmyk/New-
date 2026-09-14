import { motion } from 'framer-motion';
import { PackageOpen, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({
  icon: Icon = PackageOpen,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className={cn(
        'flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-muted/40 px-6 py-12 text-center',
        className
      )}
    >
      <div className="mb-5 flex size-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <Icon className="size-7" />
      </div>
      <h3 className="text-base font-semibold text-foreground">{title}</h3>
      {description && (
        <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>
      )}
      {action && <div className="mt-6">{action}</div>}
    </motion.div>
  );
}
