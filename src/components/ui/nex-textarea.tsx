import * as React from 'react';
import { cn } from '@/lib/utils';

export interface NexTextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

const NexTextarea = React.forwardRef<HTMLTextAreaElement, NexTextareaProps>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          'flex min-h-[100px] w-full rounded-xl border border-input bg-card px-4 py-3 text-sm font-medium shadow-sm transition-all duration-200 placeholder:font-normal placeholder:text-muted-foreground/70 focus-visible:outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-50 resize-none',
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
NexTextarea.displayName = 'NexTextarea';

export { NexTextarea };
