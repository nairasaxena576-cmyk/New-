import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';

import { cn } from '@/lib/utils';

const NexModal = DialogPrimitive.Root;
const NexModalTrigger = DialogPrimitive.Trigger;
const NexModalClose = DialogPrimitive.Close;

const NexModalOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      'fixed inset-0 z-50 overflow-hidden bg-slate-900/50 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
      className
    )}
    {...props}
  />
));
NexModalOverlay.displayName = 'NexModalOverlay.displayName';

interface NexModalContentProps
  extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> {
  hideClose?: boolean;
}

const NexModalContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  NexModalContentProps
>(({ className, children, hideClose = false, ...props }, ref) => (
  <DialogPrimitive.Portal>
    <NexModalOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        'fixed left-[50%] top-[50%] z-50 grid w-[calc(100%-2rem)] max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 rounded-2xl border border-border bg-card p-6 shadow-pop duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-top-[48%]',
        className
      )}
      {...props}
    >
      {children}
      {!hideClose && (
        <DialogPrimitive.Close className="absolute right-4 top-4 flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring/40">
          <X className="size-4" />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      )}
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
));
NexModalContent.displayName = 'NexModalContent.displayName';

const NexModalHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn('flex flex-col space-y-1.5 text-left', className)}
    {...props}
  />
);
NexModalHeader.displayName = 'NexModalHeader';

const NexModalFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      'flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3',
      className
    )}
    {...props}
  />
);
NexModalFooter.displayName = 'NexModalFooter';

const NexModalTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn(
      'text-lg font-bold leading-tight tracking-tight text-foreground',
      className
    )}
    {...props}
  />
));
NexModalTitle.displayName = 'NexModalTitle.displayName';

const NexModalDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn('text-sm leading-relaxed text-muted-foreground', className)}
    {...props}
  />
));
NexModalDescription.displayName = 'NexModalDescription.displayName';

export {
  NexModal,
  NexModalOverlay,
  NexModalTrigger,
  NexModalClose,
  NexModalContent,
  NexModalHeader,
  NexModalFooter,
  NexModalTitle,
  NexModalDescription,
};
