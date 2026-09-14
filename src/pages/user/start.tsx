import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Rocket, Lock, Search, ShieldAlert, Headphones, Wallet, AlertTriangle } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import {
  getRemainingTasks,
  buildTask,
  type AssignedTask,
  type Product,
} from '@/lib/start/helpers';
import { getVipDailyOrderLimit, getVipCommissionRate } from '@/lib/vip-config';
import {
  fetchProducts,
  submitOrderRpc,
  completeOrderRpc,
  fetchUserLuckySettings,
  type ProductRow,
  type UserLuckySettingsRow,
} from '@/lib/supabase/deposits';
import { NexButton } from '@/components/ui/nex-button';
import { NexBadge } from '@/components/ui/nex-badge';
import { StartHeader } from '@/components/start/start-header';
import { StartSkeleton } from '@/components/start/start-skeleton';
import { StatusCard, TaskProgress } from '@/components/start/status-card';
import { ProductGrid } from '@/components/start/product-grid';
import { ProcessOverlay } from '@/components/start/process-overlay';
import { AssignmentModal } from '@/components/start/assignment-modal';
import { SuccessModal } from '@/components/start/success-modal';
import { InsufficientBalanceModal } from '@/components/start/insufficient-balance-modal';


type Phase = 'idle' | 'assigning' | 'review' | 'submitting' | 'success' | 'insufficient';

const ASSIGN_STEPS = [
  'Checking account...',
  'Finding eligible product...',
  'Assigning product...',
  'Preparing order...',
];

const SUBMIT_STEPS = [
  'Submitting order...',
  'Verifying...',
  'Recording task...',
  'Calculating commission...',
  'Order completed.',
];

function rowToProduct(row: ProductRow): Product {
  return {
    id: row.id,
    name: row.name,
    merchant: row.merchant,
    price: Number(row.price),
    category: row.category,
    categoryTint: row.category_tint as Product['categoryTint'],
    image: row.image,
    minVip: row.min_vip,
    isLucky: row.is_lucky,
    luckyCommissionPercent: Number(row.lucky_commission_percent),
  };
}

const PENDING_TASK_KEY = 'nex_pending_task';
const PENDING_NOTE_KEY = 'nex_pending_note';

function loadPendingTask(): AssignedTask | null {
  try {
    const raw = sessionStorage.getItem(PENDING_TASK_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AssignedTask;
  } catch {
    return null;
  }
}

function savePendingTask(task: AssignedTask | null) {
  try {
    if (task) {
      sessionStorage.setItem(PENDING_TASK_KEY, JSON.stringify(task));
    } else {
      sessionStorage.removeItem(PENDING_TASK_KEY);
    }
  } catch {
    // ignore storage errors
  }
}

export function StartPage() {
  const { user, refreshUserData } = useAuth();

  const vipLevel = user?.vipLevel ?? 0;
  const dailyLimit = getVipDailyOrderLimit(vipLevel);

  const balance = user?.balance ?? 0;
  const frozenAmount = user?.frozenAmount ?? 0;
  const pendingShortage = user?.pendingShortage ?? 0;
  const hasPendingOrder = frozenAmount > 0 || pendingShortage > 0 || balance < 0;
  const completedToday = user?.completedToday ?? 0;
  const todayCommission = user?.todayCommission ?? 0;
  const lifetimeCommission = user?.lifetimeCommission ?? 0;

  const [loading, setLoading] = useState(true);
  const [phase, setPhase] = useState<Phase>('idle');
  const [task, setTask] = useState<AssignedTask | null>(null);
  const [note, setNote] = useState('');
  const [dbProducts, setDbProducts] = useState<ProductRow[]>([]);
  const [userLuckySettings, setUserLuckySettings] = useState<UserLuckySettingsRow | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [pendingTask, setPendingTask] = useState<AssignedTask | null>(null);

  // Restore pending task from sessionStorage on mount (e.g. after returning from recharge)
  useEffect(() => {
    const restored = loadPendingTask();
    if (restored) {
      setPendingTask(restored);
      const restoredNote = sessionStorage.getItem(PENDING_NOTE_KEY);
      if (restoredNote) setNote(restoredNote);
    }
  }, []);

  // Auto-resume: when deposit fills the negative balance, the server auto-completes
  // the order. When the user returns and frozen is cleared, show the success modal.
  useEffect(() => {
    if (
      pendingTask &&
      balance >= 0 &&
      pendingShortage === 0 &&
      frozenAmount === 0 &&
      phase === 'idle'
    ) {
      setTask(pendingTask);
      setPhase('success');
      clearPending();
    }
  }, [pendingTask, balance, pendingShortage, frozenAmount, phase]);

  const remaining = getRemainingTasks(completedToday, dailyLimit);
  const limitReached = remaining <= 0;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows = await fetchProducts();
        if (!cancelled) setDbProducts(rows);
      } catch {
        // fall back to empty grid
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    const t = setTimeout(() => setLoading(false), 1200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, []);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const settings = await fetchUserLuckySettings(user.id);
        if (!cancelled) setUserLuckySettings(settings);
      } catch {
 // fall back to product defaults
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const allProducts = useMemo(() => dbProducts.map(rowToProduct), [dbProducts]);

  // Grid: show all eligible products EXCEPT lucky ones (lucky is revealed only in assignment popup)
  const displayProducts = useMemo(() => {
    return allProducts.filter((p) => p.minVip <= vipLevel && !p.isLucky);
  }, [allProducts, vipLevel]);

  function handleStart() {
    if (phase !== 'idle') return;
    setPhase('assigning');
  }

  function handleAssignComplete() {
    // Pick from ALL eligible products (including lucky) for random assignment
    const eligible = allProducts.filter((p) => p.minVip <= vipLevel);
    if (eligible.length === 0) {
      setPhase('idle');
      return;
    }

    // Pick any eligible product — insufficient balance creates a pending order
    let product = eligible[Math.floor(Math.random() * eligible.length)]!;
    const luckyProducts = eligible.filter((p) => p.isLucky);
    const luckyEnabled = userLuckySettings?.lucky_enabled ?? false;

    if (luckyEnabled && luckyProducts.length > 0) {
      const chance = Number(userLuckySettings?.lucky_chance_percent) || 0;
      if (Math.random() * 100 < chance) {
        // Filter by price range if set
        let pool = luckyProducts;
        const minPrice = userLuckySettings?.lucky_min_price;
        const maxPrice = userLuckySettings?.lucky_max_price;
        if (minPrice != null) pool = pool.filter((p) => p.price >= Number(minPrice));
        if (maxPrice != null) pool = pool.filter((p) => p.price <= Number(maxPrice));
        if (pool.length > 0) {
          product = pool[Math.floor(Math.random() * pool.length)]!;
        }
      }
    }

    const userLuckyCommission = userLuckySettings?.lucky_commission_percent != null
      ? Number(userLuckySettings.lucky_commission_percent)
      : undefined;
    const newTask = buildTask(product, vipLevel, userLuckyCommission);
    setTask(newTask);
    setNote('');
    setPhase('review');
  }

  function handleSend() {
    if (!user || !task) return;

    setPhase('submitting');
    setSubmitError(null);
    (async () => {
      try {
        const commissionRate = task.lucky
          ? (userLuckySettings?.lucky_commission_percent != null
              ? Number(userLuckySettings.lucky_commission_percent)
              : task.product.luckyCommissionPercent)
          : getVipCommissionRate(task.vipLevel);

        // With the auto-complete-on-deposit model, pending orders are completed server-side
        // when a deposit fills the negative balance. The complete_order path is only reached
        // if the user manually retries a pending order whose balance is already >= 0.
        if (hasPendingOrder && balance >= 0) {
          await completeOrderRpc({
            p_user_id: user.id,
            p_order_number: task.orderNumber,
            p_task_number: task.taskNumber,
            p_product_id: task.product.id,
            p_product_name: task.product.name,
            p_merchant: task.merchant,
            p_unit_price: task.unitPrice,
            p_total_price: task.totalPrice,
            p_commission: task.commission,
            p_commission_rate: commissionRate,
            p_is_lucky: task.lucky,
            p_lucky_commission_percent: task.product.luckyCommissionPercent,
            p_vip_level: task.vipLevel,
            p_note: note,
          });
          await refreshUserData();
          clearPending();
        } else {
          const result = await submitOrderRpc({
            p_user_id: user.id,
            p_order_number: task.orderNumber,
            p_task_number: task.taskNumber,
            p_product_id: task.product.id,
            p_product_name: task.product.name,
            p_merchant: task.merchant,
            p_unit_price: task.unitPrice,
            p_total_price: task.totalPrice,
            p_commission: task.commission,
            p_commission_rate: commissionRate,
            p_is_lucky: task.lucky,
            p_lucky_commission_percent: task.product.luckyCommissionPercent,
            p_vip_level: task.vipLevel,
            p_note: note,
          });
          await refreshUserData();

          // Check if the RPC created a pending_insufficient order (frozen > 0)
          if (result && Number(result.frozen_amount) > 0) {
            setPendingTask(task);
            savePendingTask(task);
            sessionStorage.setItem(PENDING_NOTE_KEY, note);
            setPhase('insufficient');
          } else {
            clearPending();
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (import.meta.env.DEV) {
          console.error('[submitOrderRpc] error:', message);
        }
        setSubmitError(message);
        setPhase('review');
      }
    })();
  }

  function handleSubmitComplete() {
    setPhase('success');
  }

  function reset() {
    setPhase('idle');
    setTask(null);
    setNote('');
    setSubmitError(null);
    clearPending();
  }

  function clearPending() {
    setPendingTask(null);
    savePendingTask(null);
    sessionStorage.removeItem(PENDING_NOTE_KEY);
  }

  function dismissInsufficient() {
    // Keep the task pending — user chose not to deposit right now
    setPhase('idle');
  }

  if (loading) {
    return <StartSkeleton />;
  }

  if (!user?.startAccessEnabled) {
    return <StartBlockedScreen blockMessage={user?.startAccessBlockMessage ?? null} />;
  }

  return (
    <div className="space-y-6">
      <StartHeader vipLevel={vipLevel} />

      {/* Top dashboard — six statistic cards */}
      <StatusCard
        balance={balance}
        frozenAmount={frozenAmount}
        vipLevel={vipLevel}
        completedToday={completedToday}
        dailyLimit={dailyLimit}
        todayCommission={todayCommission}
        lifetimeCommission={lifetimeCommission}
      />

      {/* Progress card */}
      <TaskProgress completed={completedToday} total={dailyLimit} />

      {/* Product grid */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold tracking-tight text-foreground">
              Available Products
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Display only — tap start to get an assigned task
            </p>
          </div>
          <NexBadge variant="muted" size="sm">
            {displayProducts.length} items
          </NexBadge>
        </div>
        <ProductGrid products={displayProducts} />
      </section>

      {/* Spacer for fixed button */}
      <div className="h-32 lg:h-28" />

      {/* Fixed start button — the only clickable action */}
      <FixedStartButton
        disabled={phase !== 'idle' || limitReached || hasPendingOrder}
        loading={phase === 'assigning'}
        onClick={handleStart}
      />

      {/* Assignment loading sequence */}
      <ProcessOverlay
        open={phase === 'assigning'}
        title="Assigning Product"
        steps={ASSIGN_STEPS}
        duration={1500}
        icon={Search}
        onComplete={handleAssignComplete}
      />

      {/* Submit loading sequence */}
      <ProcessOverlay
        open={phase === 'submitting'}
        title="Processing Order"
        steps={SUBMIT_STEPS}
        duration={2500}
        onComplete={handleSubmitComplete}
      />

      {/* Assignment popup */}
      {task && (
        <AssignmentModal
          open={phase === 'review'}
          task={task}
          note={note}
          onNoteChange={setNote}
          onSend={handleSend}
          onCancel={reset}
        />
      )}

      {/* Insufficient balance popup */}
      {task && (
        <InsufficientBalanceModal
          open={phase === 'insufficient'}
          task={task}
          currentBalance={balance}
          frozenAmount={frozenAmount}
          onClose={dismissInsufficient}
        />
      )}

      {/* Success popup */}
      {task && (
        <SuccessModal
          open={phase === 'success'}
          task={task}
          onClose={reset}
        />
      )}

      {/* Pending order banner — shown when a pending task exists and frozen amount > 0 */}
      {pendingTask && phase === 'idle' && hasPendingOrder && (
        <PendingOrderBanner
          task={pendingTask}
          currentBalance={balance}
          frozenAmount={frozenAmount}
          onDismiss={clearPending}
        />
      )}

      {/* Submit error toast in review modal */}
      {submitError && phase === 'review' && (
        <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-xl border border-danger/20 bg-danger/10 px-4 py-3 text-sm text-danger shadow-lg">
          {import.meta.env.DEV ? submitError : 'Failed to submit task. Please try again.'}
        </div>
      )}
    </div>
  );
}

function StartBlockedScreen({ blockMessage }: { blockMessage: string | null }) {
  const navigate = useNavigate();
  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4 py-10">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: 'easeOut' }}
        className="w-full max-w-lg"
      >
        <div className="rounded-2xl border border-border bg-card p-8 text-center shadow-pop">
          <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-danger/10 text-danger">
            <ShieldAlert className="size-8" />
          </div>
          <h2 className="mt-5 text-xl font-bold text-foreground">
            Start Page Temporarily Unavailable
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Your access to the Start page has been temporarily restricted.
          </p>
          {blockMessage && (
            <div className="mt-4 rounded-xl border border-border bg-muted/30 p-4 text-left">
              <p className="text-sm leading-relaxed text-foreground">{blockMessage}</p>
            </div>
          )}
          <p className="mt-4 text-xs text-muted-foreground">
            Please contact Support if you need help or believe this is an error.
          </p>
          <NexButton
            className="mt-6 w-full"
            size="lg"
            leftIcon={<Headphones className="size-4" />}
            onClick={() => navigate('/service')}
          >
            Contact Support
          </NexButton>
        </div>
      </motion.div>
    </div>
  );
}

function FixedStartButton({
  disabled,
  loading,
  onClick,
}: {
  disabled: boolean;
  loading: boolean;
  onClick: () => void;
}) {
  const label = 'START GETTING ORGANIZED';

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 px-4 pb-[calc(env(safe-area-inset-bottom)+5rem)] lg:left-64 lg:px-8 lg:pb-6">
      <div className="mx-auto w-full max-w-5xl">
        <div className="rounded-[18px] border border-border bg-card/90 p-3 shadow-pop backdrop-blur-lg sm:p-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
          >
            {disabled && !loading ? (
              <div className="flex items-center justify-center gap-2 rounded-xl bg-muted px-6 py-3.5 text-sm font-semibold text-muted-foreground">
                <Lock className="size-4" />
                {label}
              </div>
            ) : (
              <NexButton
                size="lg"
                className="w-full text-base"
                isLoading={loading}
                disabled={disabled}
                onClick={onClick}
                leftIcon={!loading ? <Rocket className="size-5" /> : undefined}
              >
                {loading ? 'Assigning...' : label}
              </NexButton>
            )}
          </motion.div>
        </div>
      </div>
    </div>
  );
}

function PendingOrderBanner({
  task,
  currentBalance,
  frozenAmount,
  onDismiss,
}: {
  task: AssignedTask;
  currentBalance: number;
  frozenAmount: number;
  onDismiss: () => void;
}) {
  const navigate = useNavigate();
  const required = task.totalPrice;
  const commission = task.commission;
  const requiredDeposit = Math.max(0, -currentBalance);

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="rounded-2xl border border-warning/30 bg-warning/5 p-4 shadow-card sm:p-5"
    >
      <div className="flex items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-warning/15 text-warning">
          <AlertTriangle className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-bold text-warning">
            Pending Order — Waiting for Deposit
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Order{' '}
            <span className="font-mono font-semibold text-foreground">{task.orderNumber}</span>
            {' '}will auto-complete once your deposit is approved.
          </p>

          {/* Balance breakdown */}
          <div className="mt-3 space-y-1.5 rounded-lg border border-border bg-muted/20 p-3">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Order Price</span>
              <span className="font-semibold text-foreground">${required.toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Current Balance</span>
              <span className={currentBalance < 0 ? 'font-semibold text-danger' : 'font-semibold text-foreground'}>${currentBalance.toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Required Deposit</span>
              <span className="font-semibold text-danger">${requiredDeposit.toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Expected Commission</span>
              <span className="font-semibold text-success">${commission.toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Frozen Amount</span>
              <span className="font-semibold text-danger">${frozenAmount.toFixed(2)}</span>
            </div>
          </div>

          <div className="mt-3 flex items-center gap-3">
            <NexButton
              size="sm"
              leftIcon={<Wallet className="size-3.5" />}
              onClick={() => navigate('/recharge')}
            >
              Deposit Now
            </NexButton>
            <NexButton
              size="sm"
              variant="outline"
              onClick={onDismiss}
            >
              Cancel Order
            </NexButton>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
