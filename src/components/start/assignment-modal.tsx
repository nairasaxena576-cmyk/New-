import {
  Hash,
  Store,
  Tag,
  Crown,
  Send,
  Sparkles,
  ShoppingBag,
} from 'lucide-react';
import {
  NexModal,
  NexModalContent,
  NexModalFooter,
} from '@/components/ui/nex-modal';
import { NexButton } from '@/components/ui/nex-button';
import { NexBadge } from '@/components/ui/nex-badge';
import { NexTextarea } from '@/components/ui/nex-textarea';
import { cn } from '@/lib/utils';
import { formatCurrency, type AssignedTask } from '@/lib/start/helpers';
import { getVipCommissionRate } from '@/lib/vip-config';

interface AssignmentModalProps {
  open: boolean;
  task: AssignedTask;
  note: string;
  onNoteChange: (note: string) => void;
  onSend: () => void;
  onCancel: () => void;
}

export function AssignmentModal({
  open,
  task,
  note,
  onNoteChange,
  onSend,
  onCancel,
}: AssignmentModalProps) {
  const commissionRate = task.lucky
    ? task.product.luckyCommissionPercent
    : getVipCommissionRate(task.vipLevel);

  return (
    <NexModal open={open} onOpenChange={(o) => !o && onCancel()}>
      <NexModalContent
        className="flex max-h-[88vh] max-w-2xl flex-col gap-0 overflow-hidden p-0 sm:max-h-[92vh]"
        hideClose
      >
        {/* Header — sticky, never scrolls away */}
        <div className="shrink-0 rounded-t-2xl bg-gradient-to-br from-primary to-secondary px-4 py-4 text-primary-foreground sm:px-6 sm:py-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-base font-bold tracking-tight sm:text-lg">
                Product Optimization Task
              </h2>
              <p className="mt-0.5 text-xs text-primary-foreground/80 sm:mt-1 sm:text-sm">
                Complete this optimization task to earn commission.
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5 rounded-lg bg-white/15 px-2.5 py-1.5 backdrop-blur-sm sm:px-3 sm:py-2">
              <Hash className="size-3 shrink-0" />
              <span className="font-mono text-[11px] font-bold tracking-tight sm:text-xs">
                {task.orderNumber}
              </span>
            </div>
          </div>
        </div>

        {/* Scrollable content area */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch] p-3 sm:p-6">
          {/* Body — image + product details */}
          <div className="grid gap-3 sm:grid-cols-[180px_1fr] sm:gap-5">
            {/* Image */}
            <div className="relative mx-auto aspect-square w-full max-w-[120px] overflow-hidden rounded-xl border border-border bg-muted sm:max-w-[180px]">
              <img
                src={task.product.image}
                alt={task.product.name}
                className="size-full object-cover"
              />
              {task.lucky && (
                <div className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-gradient-to-r from-warning to-danger px-2.5 py-1 text-[11px] font-bold text-white shadow-sm">
                  <Sparkles className="size-3" />
                  Lucky
                </div>
              )}
            </div>

            {/* Details */}
            <div className="flex flex-col justify-center space-y-2.5 sm:space-y-3">
              <DetailRow icon={ShoppingBag} label="Product Name">
                <span className="font-semibold text-foreground">
                  {task.product.name}
                </span>
              </DetailRow>
              <DetailRow icon={Store} label="Merchant">
                <span className="font-medium text-foreground">
                  {task.merchant}
                </span>
              </DetailRow>
              <DetailRow icon={Tag} label="Category">
                <NexBadge variant={task.product.categoryTint} size="sm">
                  {task.product.category}
                </NexBadge>
              </DetailRow>
              <DetailRow icon={Crown} label="VIP Required">
                <span className="font-semibold text-foreground">
                  VIP{task.product.minVip}+
                </span>
              </DetailRow>
            </div>
          </div>

          {/* Order details */}
          <div className="mt-3 rounded-xl border border-border bg-muted/30 p-3 sm:mt-5 sm:p-4">
            <h4 className="mb-3 text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Order Details
            </h4>
            <dl className="space-y-2.5 text-sm">
              <DetailLine label="Quantity" value="1" />
              <DetailLine
                label="Unit Price"
                value={`$${formatCurrency(task.unitPrice)}`}
              />
              <DetailLine
                label="Total"
                value={`$${formatCurrency(task.totalPrice)}`}
              />
              <div className="my-1 h-px bg-border" />
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <dt className="font-semibold text-foreground">Commission</dt>
                  {task.lucky && (
                    <span className="flex items-center gap-1 rounded-full bg-gradient-to-r from-warning to-danger px-2 py-0.5 text-[10px] font-bold text-white">
                      <Sparkles className="size-2.5" />
                      Lucky Product
                    </span>
                  )}
                </div>
                <dd className="flex items-baseline gap-1.5">
                  <span className="text-base font-bold text-success">
                    ${formatCurrency(task.commission)}
                  </span>
                  <span className="text-xs font-semibold text-muted-foreground">
                    ({commissionRate}%)
                  </span>
                </dd>
              </div>
              <p className="pt-1 text-[11px] text-muted-foreground">
                {task.lucky
                  ? `Lucky product — ${commissionRate}% admin-assigned commission rate.`
                  : `VIP${task.vipLevel} — ${commissionRate}% commission rate.`}
              </p>
            </dl>
          </div>

          {/* Note */}
          <div className="mt-3 space-y-1.5 sm:mt-5">
            <label className="text-xs font-semibold text-muted-foreground">
              Note
            </label>
            <NexTextarea
              placeholder="Add a note (optional)"
              value={note}
              onChange={(e) => onNoteChange(e.target.value)}
              rows={3}
              className="min-h-[72px]"
            />
          </div>
        </div>

        {/* Sticky footer — always visible */}
        <div className="shrink-0 border-t border-border bg-card px-3 py-3 sm:px-6 sm:py-4">
          <NexModalFooter className="gap-2 sm:gap-3">
            <NexButton
              variant="outline"
              size="lg"
              className="flex-1 sm:flex-initial"
              onClick={onCancel}
            >
              Cancel
            </NexButton>
            <NexButton
              size="lg"
              className="flex-1 sm:flex-initial"
              leftIcon={<Send className="size-4" />}
              onClick={onSend}
            >
              Send Order
            </NexButton>
          </NexModalFooter>
        </div>
      </NexModalContent>
    </NexModal>
  );
}

function DetailRow({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof Hash;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <Icon className="size-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
        <div className="truncate text-sm">{children}</div>
      </div>
    </div>
  );
}

function DetailLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-semibold text-foreground">{value}</dd>
    </div>
  );
}
