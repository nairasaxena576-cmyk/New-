import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';

import { cn } from '@/lib/utils';

export const nexButtonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98] [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*=size-])]:size-4',
  {
    variants: {
      variant: {
        primary:
          'bg-primary text-primary-foreground shadow-[0_4px_14px_-2px_hsl(var(--primary)/0.45)] hover:bg-primary/90 hover:shadow-[0_6px_20px_-2px_hsl(var(--primary)/0.5)]',
        secondary:
          'bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/90',
        success:
          'bg-success text-success-foreground shadow-sm hover:bg-success/90',
        warning:
          'bg-warning text-warning-foreground shadow-sm hover:bg-warning/90',
        danger:
          'bg-danger text-danger-foreground shadow-sm hover:bg-danger/90',
        outline:
          'border border-border bg-card text-foreground hover:bg-accent hover:border-primary/30',
        ghost: 'text-foreground hover:bg-accent',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        sm: 'h-9 rounded-lg px-4 text-sm',
        default: 'h-11 rounded-xl px-5 text-sm',
        lg: 'h-12 rounded-xl px-7 text-base',
        icon: 'h-11 w-11 rounded-xl',
        'icon-sm': 'h-9 w-9 rounded-lg',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'default',
    },
  }
);

export interface NexButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof nexButtonVariants> {
  asChild?: boolean;
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

const NexButton = React.forwardRef<HTMLButtonElement, NexButtonProps>(
  (
    {
      className,
      variant,
      size,
      asChild = false,
      isLoading = false,
      leftIcon,
      rightIcon,
      children,
      disabled,
      ...props
    },
    ref
  ) => {
    const Comp = asChild ? Slot : 'button';
    const leading = isLoading ? <Loader2 className="size-4 animate-spin" /> : leftIcon;

    // Slot requires exactly one React element child. When asChild is set we
    // clone the consumer's child and inject the icon(s) inside it so Slot
    // still receives a single element.
    if (asChild && React.isValidElement(children)) {
      const child = children as React.ReactElement<{ children?: React.ReactNode }>;
      return (
        <Comp
          className={cn(nexButtonVariants({ variant, size, className }))}
          ref={ref}
          disabled={disabled || isLoading}
          {...props}
        >
          {React.cloneElement(child, {
            children: (
              <>
                {leading}
                {child.props.children}
                {!isLoading && rightIcon}
              </>
            ),
          })}
        </Comp>
      );
    }

    return (
      <Comp
        className={cn(nexButtonVariants({ variant, size, className }))}
        ref={ref}
        disabled={disabled || isLoading}
        {...props}
      >
        {leading}
        {children}
        {!isLoading && rightIcon}
      </Comp>
    );
  }
);
NexButton.displayName = 'NexButton';

export { NexButton };
