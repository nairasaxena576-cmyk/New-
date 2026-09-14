import { motion } from 'framer-motion';
import { Check, X } from 'lucide-react';
import { getPasswordStrength } from '@/lib/auth/validation';
import { cn } from '@/lib/utils';

interface PasswordStrengthIndicatorProps {
  password: string;
  className?: string;
}

export function PasswordStrengthIndicator({
  password,
  className,
}: PasswordStrengthIndicatorProps) {
  const strength = getPasswordStrength(password);
  const segments = [0, 1, 2, 3];

  if (!password) return null;

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      transition={{ duration: 0.25 }}
      className={cn('space-y-2.5 overflow-hidden', className)}
    >
      {/* Strength bar */}
      <div className="flex gap-1.5">
        {segments.map((i) => (
          <div
            key={i}
            className={cn(
              'h-1.5 flex-1 rounded-full transition-colors duration-300',
              i < strength.score ? strength.color : 'bg-border'
            )}
          />
        ))}
      </div>

      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">
          Password strength
        </span>
        <span
          className={cn(
            'text-xs font-semibold',
            strength.score <= 1
              ? 'text-danger'
              : strength.score === 2
              ? 'text-warning'
              : 'text-success'
          )}
        >
          {strength.label}
        </span>
      </div>

      {/* Requirement checklist */}
      <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        {strength.checks.map((check) => (
          <li
            key={check.label}
            className="flex items-center gap-1.5 text-[11px] font-medium"
          >
            {check.passed ? (
              <Check className="size-3.5 shrink-0 text-success" />
            ) : (
              <X className="size-3.5 shrink-0 text-muted-foreground/50" />
            )}
            <span className={check.passed ? 'text-foreground' : 'text-muted-foreground'}>
              {check.label}
            </span>
          </li>
        ))}
      </ul>
    </motion.div>
  );
}
