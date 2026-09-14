import * as React from 'react';
import { motion, type HTMLMotionProps } from 'framer-motion';

import { cn } from '@/lib/utils';

type NexCardProps = HTMLMotionProps<'div'> & {
  interactive?: boolean;
};

const NexCard = React.forwardRef<HTMLDivElement, NexCardProps>(
  ({ className, interactive = false, ...props }, ref) => (
    <motion.div
      ref={ref}
      className={cn(
        'rounded-2xl border border-border bg-card text-card-foreground shadow-card',
        interactive &&
          'transition-all duration-300 hover:shadow-pop hover:-translate-y-0.5 hover:border-primary/20 cursor-pointer',
        className
      )}
      {...props}
    />
  )
);
NexCard.displayName = 'NexCard';

const NexCardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn('flex flex-col space-y-1.5 p-5 sm:p-6', className)}
    {...props}
  />
));
NexCardHeader.displayName = 'NexCardHeader';

const NexCardTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn(
      'text-base font-semibold leading-tight tracking-tight text-foreground',
      className
    )}
    {...props}
  />
));
NexCardTitle.displayName = 'NexCardTitle';

const NexCardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn('text-sm leading-relaxed text-muted-foreground', className)}
    {...props}
  />
));
NexCardDescription.displayName = 'NexCardDescription';

const NexCardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('p-5 pt-0 sm:p-6 sm:pt-0', className)} {...props} />
));
NexCardContent.displayName = 'NexCardContent';

const NexCardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn('flex items-center p-5 pt-0 sm:p-6 sm:pt-0', className)}
    {...props}
  />
));
NexCardFooter.displayName = 'NexCardFooter';

export {
  NexCard,
  NexCardHeader,
  NexCardFooter,
  NexCardTitle,
  NexCardDescription,
  NexCardContent,
};
