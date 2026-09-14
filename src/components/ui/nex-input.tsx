import * as React from 'react';
import { cn } from '@/lib/utils';

export interface NexInputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  containerClassName?: string;
}

const NexInput = React.forwardRef<HTMLInputElement, NexInputProps>(
  ({ className, type, leftIcon, rightIcon, containerClassName, ...props }, ref) => {
    if (leftIcon || rightIcon) {
      return (
        <div className={cn('relative flex items-center', containerClassName)}>
          {leftIcon && (
            <span className="pointer-events-none absolute left-3.5 flex items-center text-muted-foreground [&_svg]:size-[18px]">
              {leftIcon}
            </span>
          )}
          <input
            type={type}
            className={cn(
              'flex h-12 w-full rounded-xl border border-input bg-card px-4 py-2 text-sm font-medium shadow-sm transition-all duration-200 placeholder:font-normal placeholder:text-muted-foreground/70 focus-visible:outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-50',
              leftIcon && 'pl-11',
              rightIcon && 'pr-11',
              className
            )}
            ref={ref}
            {...props}
          />
          {rightIcon && (
            <span className="absolute right-3.5 flex items-center text-muted-foreground [&_svg]:size-[18px]">
              {rightIcon}
            </span>
          )}
        </div>
      );
    }

    return (
      <input
        type={type}
        className={cn(
          'flex h-12 w-full rounded-xl border border-input bg-card px-4 py-2 text-sm font-medium shadow-sm transition-all duration-200 placeholder:font-normal placeholder:text-muted-foreground/70 focus-visible:outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-50',
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
NexInput.displayName = 'NexInput';

export { NexInput };
