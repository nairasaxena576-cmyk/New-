import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Wallet, Banknote, UserPlus, Headphones, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface QuickAction {
  label: string;
  icon: LucideIcon;
  href: string;
  tint: string;
}

const actions: QuickAction[] = [
  { label: 'Recharge', icon: Wallet, href: '/recharge', tint: 'bg-primary/10 text-primary' },
  { label: 'Withdrawal', icon: Banknote, href: '/withdrawal', tint: 'bg-success/10 text-success' },
  { label: 'Invite', icon: UserPlus, href: '/account', tint: 'bg-warning/10 text-warning' },
  { label: 'Service', icon: Headphones, href: '/service', tint: 'bg-secondary/10 text-secondary' },
];

export function QuickActions() {
  const navigate = useNavigate();

  return (
    <div className="grid grid-cols-4 gap-2.5 sm:gap-4">
      {actions.map((action, i) => {
        const Icon = action.icon;
        return (
          <motion.button
            key={action.label}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: i * 0.06 }}
            whileTap={{ scale: 0.92 }}
            onClick={() => navigate(action.href)}
            className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-card p-3 shadow-card transition-all duration-200 hover:border-primary/20 hover:shadow-pop sm:p-4"
          >
            <div className={cn('flex size-11 items-center justify-center rounded-xl sm:size-12', action.tint)}>
              <Icon className="size-5 sm:size-6" />
            </div>
            <span className="text-[11px] font-semibold text-foreground sm:text-xs">
              {action.label}
            </span>
          </motion.button>
        );
      })}
    </div>
  );
}
