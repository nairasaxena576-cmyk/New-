import { QrCode } from 'lucide-react';
import { cn } from '@/lib/utils';

interface QrPlaceholderProps {
  label?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizeMap = {
  sm: 'size-32',
  md: 'size-40',
  lg: 'size-48',
};

/**
 * Visual placeholder for a QR code — will be swapped for a real generated
 * QR when the payment gateway is integrated.
 */
export function QrPlaceholder({
  label = 'Scan to pay',
  size = 'md',
  className,
}: QrPlaceholderProps) {
  return (
    <div
      className={cn(
        'relative flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-border bg-muted/30 p-4',
        className
      )}
    >
      <div
        className={cn(
          'flex items-center justify-center rounded-xl bg-card shadow-card',
          sizeMap[size]
        )}
      >
        {/* Decorative QR-like grid */}
        <div className="relative grid grid-cols-8 gap-0.5 p-3">
          {Array.from({ length: 64 }).map((_, i) => {
            const isCorner =
              (i < 3 || i % 8 < 3) && i < 24 ||
              (i % 8 > 4 && i < 24) ||
              (i > 40 && i % 8 < 3);
            const isRandom = (i * 7 + 3) % 3 === 0;
            return (
              <div
                key={i}
                className={cn(
                  'size-2 rounded-[2px]',
                  (isCorner || isRandom) ? 'bg-foreground/80' : 'bg-transparent'
                )}
              />
            );
          })}
        </div>
        <QrCode className="absolute size-8 text-primary/60" />
      </div>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
    </div>
  );
}
