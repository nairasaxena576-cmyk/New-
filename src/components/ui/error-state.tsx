import { motion } from 'framer-motion';
import { AlertCircle, RefreshCw, type LucideIcon } from 'lucide-react';
import { NexButton } from '@/components/ui/nex-button';
import { cn } from '@/lib/utils';

interface ErrorStateProps {
  icon?: LucideIcon;
  title?: string;
  description?: string;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
}

export function ErrorState({
  icon: Icon = AlertCircle,
  title = 'Something went wrong',
  description = 'An unexpected error occurred while loading this content. Please try again.',
  onRetry,
  retryLabel = 'Try again',
  className,
}: ErrorStateProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className={cn(
        'flex flex-col items-center justify-center rounded-2xl border border-danger/20 bg-danger/5 px-6 py-12 text-center',
        className
      )}
    >
      <div className="mb-5 flex size-16 items-center justify-center rounded-2xl bg-danger/10 text-danger">
        <Icon className="size-7" />
      </div>
      <h3 className="text-base font-semibold text-foreground">{title}</h3>
      <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-muted-foreground">
        {description}
      </p>
      {onRetry && (
        <NexButton
          variant="outline"
          size="sm"
          className="mt-6"
          onClick={onRetry}
          leftIcon={<RefreshCw className="size-4" />}
        >
          {retryLabel}
        </NexButton>
      )}
    </motion.div>
  );
}
