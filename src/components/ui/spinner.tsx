import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SpinnerProps {
  size?: 'sm' | 'default' | 'lg';
  className?: string;
}

const sizeMap = {
  sm: 'size-4',
  default: 'size-6',
  lg: 'size-8',
};

export function Spinner({ size = 'default', className }: SpinnerProps) {
  return (
    <Loader2
      className={cn('animate-spin text-primary', sizeMap[size], className)}
    />
  );
}

interface FullPageSpinnerProps {
  label?: string;
}

export function FullPageSpinner({ label = 'Loading…' }: FullPageSpinnerProps) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4">
      <Spinner size="lg" />
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
    </div>
  );
}
