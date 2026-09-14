import { motion } from 'framer-motion';
import { CheckCircle2, Hash, ShoppingBag, Coins } from 'lucide-react';
import {
  NexModal,
  NexModalContent,
} from '@/components/ui/nex-modal';
import { NexButton } from '@/components/ui/nex-button';
import { formatCurrency, type AssignedTask } from '@/lib/start/helpers';

interface SuccessModalProps {
  open: boolean;
  task: AssignedTask;
  onClose: () => void;
}

export function SuccessModal({ open, task, onClose }: SuccessModalProps) {
  return (
    <NexModal open={open} onOpenChange={(o) => !o && onClose()}>
      <NexModalContent className="max-w-md p-0" hideClose>
        {/* Header banner */}
        <div className="relative overflow-hidden rounded-t-2xl bg-gradient-to-br from-success to-success/80 px-6 py-8 text-center text-success-foreground">
          {/* Decorative glow */}
          <motion.div
            className="absolute inset-0 bg-white/10"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.3, 0] }}
            transition={{ duration: 2, repeat: Infinity }}
          />
          <motion.div
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 260, damping: 18, delay: 0.1 }}
            className="relative mx-auto flex size-20 items-center justify-center"
          >
            <motion.div
              className="absolute inset-0 rounded-full bg-white/25"
              animate={{ scale: [1, 1.5, 1], opacity: [0.5, 0, 0.5] }}
              transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
            />
            <div className="relative flex size-20 items-center justify-center rounded-full bg-white/20 backdrop-blur-sm">
              <CheckCircle2 className="size-11" />
            </div>
          </motion.div>
          <motion.h3
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
            className="relative mt-4 text-xl font-bold tracking-tight"
          >
            Task Completed Successfully
          </motion.h3>
        </div>

        {/* Body */}
        <div className="space-y-4 p-6">
          <dl className="space-y-3 rounded-xl border border-border bg-muted/30 p-4">
            <SummaryRow icon={Hash} label="Order Number">
              <span className="font-mono text-sm font-bold text-foreground">
                {task.orderNumber}
              </span>
            </SummaryRow>
            <div className="h-px bg-border" />
            <SummaryRow icon={ShoppingBag} label="Product Name">
              <span className="line-clamp-2 text-right text-sm font-semibold text-foreground">
                {task.product.name}
              </span>
            </SummaryRow>
            <div className="h-px bg-border" />
            <SummaryRow icon={Coins} label="Commission Earned">
              <span className="text-base font-bold text-success">
                ${formatCurrency(task.commission)}
              </span>
            </SummaryRow>
          </dl>

          <NexButton
            size="lg"
            className="w-full"
            onClick={onClose}
          >
            Close
          </NexButton>
        </div>
      </NexModalContent>
    </NexModal>
  );
}

function SummaryRow({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof Hash;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2.5">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <Icon className="size-4" />
        </div>
        <span className="text-sm font-medium text-muted-foreground">
          {label}
        </span>
      </div>
      {children}
    </div>
  );
}
