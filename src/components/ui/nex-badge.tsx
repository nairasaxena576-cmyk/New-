import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { motion } from 'framer-motion';

import { cn } from '@/lib/utils';

const nexBadgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition-colors focus:outline-none',
  {
    variants: {
      variant: {
        default: 'bg-primary/10 text-primary',
        secondary: 'bg-secondary/10 text-secondary',
        success: 'bg-success/10 text-success',
        warning: 'bg-warning/15 text-warning',
        danger: 'bg-danger/10 text-danger',
        muted: 'bg-muted text-muted-foreground',
        outline: 'border border-border text-foreground bg-transparent',
      },
      size: {
        sm: 'px-2.5 py-0.5 text-[11px]',
        default: 'px-3 py-1 text-xs',
        lg: 'px-3.5 py-1.5 text-sm',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

export interface NexBadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof nexBadgeVariants> {
  dot?: boolean;
}

function NexBadge({
  className,
  variant,
  size,
  dot = false,
  children,
  ...props
}: NexBadgeProps) {
  return (
    <div className={cn(nexBadgeVariants({ variant, size }), className)} {...props}>
      {dot && (
        <motion.span
          className={cn(
            'inline-block size-1.5 rounded-full',
            variant === 'success' && 'bg-success',
            variant === 'warning' && 'bg-warning',
            variant === 'danger' && 'bg-danger',
            variant === 'default' && 'bg-primary',
            variant === 'secondary' && 'bg-secondary',
            (variant === 'muted' || variant === 'outline') && 'bg-muted-foreground'
          )}
          animate={{ opacity: [1, 0.4, 1] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        />
      )}
      {children}
    </div>
  );
}

export { NexBadge, nexBadgeVariants };
