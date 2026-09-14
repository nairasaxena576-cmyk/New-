import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Bell, Crown } from 'lucide-react';
import { NexBadge } from '@/components/ui/nex-badge';
import { cn } from '@/lib/utils';
import { getVipName } from '@/lib/vip-config';

interface StartHeaderProps {
  vipLevel: number;
  notifications?: number;
}

export function StartHeader({ vipLevel, notifications = 3 }: StartHeaderProps) {
  const navigate = useNavigate();

  return (
    <motion.header
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="flex items-center gap-3"
    >
      {/* Back */}
      <motion.button
        whileTap={{ scale: 0.9 }}
        onClick={() => navigate(-1)}
        className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-border bg-card text-foreground shadow-card transition-colors hover:bg-accent"
        aria-label="Go back"
      >
        <ArrowLeft className="size-[18px]" />
      </motion.button>

      {/* Title */}
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-lg font-bold tracking-tight text-foreground sm:text-xl">
          Product Optimization
        </h1>
        <p className="truncate text-xs text-muted-foreground">
          Task Center
        </p>
      </div>

      {/* Notification */}
      <button
        className="relative flex size-10 shrink-0 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground shadow-card transition-colors hover:bg-accent hover:text-foreground"
        aria-label="Notifications"
      >
        <Bell className="size-[18px]" />
        {notifications > 0 && (
          <span
            className={cn(
              'absolute right-2 top-2 flex size-4 items-center justify-center rounded-full bg-danger text-[9px] font-bold text-white ring-2 ring-card'
            )}
          >
            {notifications}
          </span>
        )}
      </button>

      {/* VIP badge */}
      <NexBadge variant="warning" size="lg" className="shrink-0">
        <Crown className="size-3.5" />
        {getVipName(vipLevel)}
      </NexBadge>
    </motion.header>
  );
}
