import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, Check, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ProcessOverlayProps {
  open: boolean;
  title: string;
  steps: string[];
  duration?: number;
  icon?: LucideIcon;
  onComplete: () => void;
}

export function ProcessOverlay({
  open,
  title,
  steps,
  duration = 1600,
  icon: Icon = Loader2,
  onComplete,
}: ProcessOverlayProps) {
  const total = steps.length;
  const stepDuration = duration / total;
  const [currentStep, setCurrentStep] = useState(0);

  useEffect(() => {
    if (!open) {
      setCurrentStep(0);
      return;
    }

    setCurrentStep(0);
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (let i = 1; i < total; i++) {
      timers.push(setTimeout(() => setCurrentStep(i), stepDuration * i));
    }
    timers.push(setTimeout(onComplete, duration));

    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const progress = Math.min(((currentStep + 1) / total) * 100, 100);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/60 px-5 backdrop-blur-md"
        >
          <motion.div
            initial={{ scale: 0.92, y: 18, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.95, y: 10, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 360, damping: 28 }}
            className="w-full max-w-sm rounded-[18px] border border-border bg-card p-6 shadow-pop"
          >
            {/* Icon */}
            <div className="flex justify-center">
              <div className="relative flex size-16 items-center justify-center">
                <motion.div
                  className="absolute inset-0 rounded-full bg-primary/20"
                  animate={{ scale: [1, 1.4, 1], opacity: [0.5, 0, 0.5] }}
                  transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
                />
                <div className="relative flex size-16 items-center justify-center rounded-full bg-primary/15 text-primary">
                  <Icon className="size-8 animate-spin" />
                </div>
              </div>
            </div>

            {/* Title */}
            <h3 className="mt-5 text-center text-base font-bold tracking-tight text-foreground">
              {title}
            </h3>

            {/* Progress bar */}
            <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <motion.div
                className="h-full rounded-full bg-primary"
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.4, ease: 'easeOut' }}
              />
            </div>

            {/* Step list */}
            <ul className="mt-5 space-y-3">
              {steps.map((step, i) => {
                const done = i < currentStep;
                const active = i === currentStep;
                return (
                  <li key={step} className="flex items-center gap-3">
                    <div
                      className={cn(
                        'flex size-6 shrink-0 items-center justify-center rounded-full transition-colors',
                        done
                          ? 'bg-success/15 text-success'
                          : active
                            ? 'bg-primary/15 text-primary'
                            : 'bg-muted text-muted-foreground/40'
                      )}
                    >
                      {done ? (
                        <Check className="size-3.5" />
                      ) : active ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <span className="size-1.5 rounded-full bg-current" />
                      )}
                    </div>
                    <AnimatePresence mode="wait">
                      <motion.span
                        key={`${step}-${i}`}
                        initial={{ opacity: 0, x: -6 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.25 }}
                        className={cn(
                          'text-sm font-medium transition-colors',
                          done
                            ? 'text-muted-foreground line-through'
                            : active
                              ? 'text-foreground'
                              : 'text-muted-foreground/50'
                        )}
                      >
                        {step}
                      </motion.span>
                    </AnimatePresence>
                  </li>
                );
              })}
            </ul>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
