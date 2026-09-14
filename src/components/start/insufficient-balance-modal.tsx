import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { AlertTriangle, Wallet, ArrowRight, Snowflake } from 'lucide-react';
import {
  NexModal,
  NexModalContent,
  NexModalHeader,
  NexModalFooter,
  NexModalTitle,
  NexModalDescription,
} from '@/components/ui/nex-modal';
import { NexButton } from '@/components/ui/nex-button';
import { formatCurrency, type AssignedTask } from '@/lib/start/helpers';

interface InsufficientBalanceModalProps {
  open: boolean;
  task: AssignedTask;
  currentBalance: number;
  frozenAmount: number;
  onClose: () => void;
}

export function InsufficientBalanceModal({
  open,
  task,
  currentBalance,
  frozenAmount,
  onClose,
}: InsufficientBalanceModalProps) {
  const navigate = useNavigate();
  const required = task.totalPrice;
  const commission = task.commission;
  const requiredDeposit = Math.max(0, -currentBalance);

  return (
    <NexModal open={open} onOpenChange={(o) => !o && onClose()}>
      <NexModalContent
        className="flex max-h-[90vh] max-w-md flex-col gap-0 overflow-hidden p-0 sm:max-h-[92vh]"
        hideClose
      >
        {/* Header — warning banner */}
        <div className="shrink-0 bg-gradient-to-br from-warning to-warning/80 px-5 py-5 text-warning-foreground sm:px-6 sm:py-6">
          <div className="flex items-center gap-3">
            <motion.div
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 260, damping: 18, delay: 0.1 }}
              className="flex size-12 items-center justify-center rounded-full bg-white/20 backdrop-blur-sm"
            >
              <AlertTriangle className="size-6" />
            </motion.div>
            <div className="min-w-0">
              <h2 className="text-lg font-bold tracking-tight">
                Insufficient Balance
              </h2>
              <p className="mt-0.5 text-xs text-warning-foreground/80">
                This order is pending until you deposit enough funds.
              </p>
            </div>
          </div>
        </div>

        {/* Scrollable content */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch] p-5 sm:p-6">
          {/* Order reference */}
          <div className="rounded-xl border border-border bg-muted/30 p-3">
            <p className="text-[11px] font-medium text-muted-foreground">
              Pending Order
            </p>
            <p className="mt-0.5 font-mono text-sm font-bold text-foreground">
              {task.orderNumber}
            </p>
          </div>

          {/* Balance breakdown */}
          <div className="mt-4 space-y-2.5 rounded-xl border border-border bg-muted/20 p-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Order Price</span>
              <span className="text-base font-bold text-foreground">
                ${formatCurrency(required)}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Current Balance</span>
              <span className={currentBalance < 0 ? 'text-base font-bold text-danger' : 'text-base font-bold text-foreground'}>
                ${formatCurrency(currentBalance)}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Required Deposit</span>
              <span className="text-base font-bold text-danger">
                ${formatCurrency(requiredDeposit)}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Expected Commission</span>
              <span className="text-base font-bold text-success">
                ${formatCurrency(commission)}
              </span>
            </div>
            <div className="my-1 h-px bg-border" />
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-1.5 font-semibold text-danger">
                <Snowflake className="size-4" />
                Frozen Amount
              </span>
              <span className="text-lg font-bold text-danger">
                ${formatCurrency(frozenAmount)}
              </span>
            </div>
          </div>

          {/* Product summary */}
          <div className="mt-4 flex items-center gap-3 rounded-xl border border-border bg-card p-3">
            <div className="size-12 shrink-0 overflow-hidden rounded-lg border border-border bg-muted">
              <img
                src={task.product.image}
                alt={task.product.name}
                className="size-full object-cover"
              />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-foreground">
                {task.product.name}
              </p>
              <p className="text-xs text-muted-foreground">{task.merchant}</p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-sm font-bold text-foreground">
                ${formatCurrency(task.totalPrice)}
              </p>
            </div>
          </div>

          <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
            Deposit at least{' '}
            <span className="font-bold text-danger">
              ${formatCurrency(requiredDeposit)}
            </span>{' '}
            to fill the negative balance. Once your deposit is approved, the order will complete automatically and your balance will be restored to deposit + original balance + commission.
          </p>
        </div>

        {/* Sticky footer */}
        <div className="shrink-0 border-t border-border bg-card px-5 py-3 sm:px-6 sm:py-4">
          <NexModalFooter className="gap-2 sm:gap-3">
            <NexButton
              variant="outline"
              size="lg"
              className="flex-1 sm:flex-initial"
              onClick={onClose}
            >
              Keep Pending
            </NexButton>
            <NexButton
              size="lg"
              className="flex-1 sm:flex-initial"
              leftIcon={<Wallet className="size-4" />}
              onClick={() => navigate('/recharge')}
            >
              Deposit Now
              <ArrowRight className="ml-1.5 size-4" />
            </NexButton>
          </NexModalFooter>
        </div>
      </NexModalContent>
    </NexModal>
  );
}
