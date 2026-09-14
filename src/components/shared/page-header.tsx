import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  className?: string;
}

export function PageHeader({ title, subtitle, action, className }: PageHeaderProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className={cn(
        'flex flex-wrap items-start justify-between gap-4',
        className
      )}
    >
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-[1.75rem]">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            {subtitle}
          </p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </motion.div>
  );
}
