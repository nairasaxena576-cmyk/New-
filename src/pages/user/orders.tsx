import { useEffect, useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  ClipboardList,
  Hash,
  Store,
  ShoppingBag,
  Coins,
  Sparkles,
  Calendar,
  Loader2,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { NexCard, NexCardHeader, NexCardTitle, NexCardContent, NexBadge } from '@/components/ui/nex';
import { EmptyState } from '@/components/ui/empty-state';
import { useAuth } from '@/lib/auth';
import { fetchOrders, type OrderRow } from '@/lib/supabase/deposits';
import { supabase } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';

type Filter = 'all' | 'completed';

export function OrdersPage() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('all');

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const rows = await fetchOrders(user.id);
        setOrders(rows);
      } catch {
        // keep empty
      } finally {
        setLoading(false);
      }
    })();
  }, [user]);

  // Realtime
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel('orders-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders', filter: `user_id=eq.${user.id}` },
        async () => {
          try {
            const rows = await fetchOrders(user.id);
            setOrders(rows);
          } catch {
            // ignore
          }
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  const filtered = useMemo(() => {
    if (filter === 'all') return orders;
    return orders.filter((o) => o.status === filter);
  }, [orders, filter]);

  const totalCommission = useMemo(
    () => orders.reduce((sum, o) => sum + Number(o.commission), 0),
    [orders]
  );

  const filters: { id: Filter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'completed', label: 'Completed' },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Orders"
        subtitle="View and manage all your product optimization orders."
      />

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
          <NexCard className="p-5">
            <div className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary/10 to-primary/5 text-primary">
              <ClipboardList className="size-5" />
            </div>
            <p className="mt-3 text-2xl font-bold tracking-tight text-foreground">{orders.length}</p>
            <p className="mt-0.5 text-sm text-muted-foreground">Total Orders</p>
          </NexCard>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: 0.07 }}>
          <NexCard className="p-5">
            <div className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-success/10 to-success/5 text-success">
              <Coins className="size-5" />
            </div>
            <p className="mt-3 text-2xl font-bold tracking-tight text-foreground">
              ${totalCommission.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
            <p className="mt-0.5 text-sm text-muted-foreground">Total Growth Credit</p>
          </NexCard>
        </motion.div>
      </div>

      <NexCard>
        <NexCardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <NexCardTitle>Order history</NexCardTitle>
            <div className="flex flex-wrap gap-2">
              {filters.map((f) => (
                <button
                  key={f.id}
                  onClick={() => setFilter(f.id)}
                  className={cn(
                    'rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors',
                    filter === f.id
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground hover:bg-accent'
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        </NexCardHeader>
        <NexCardContent>
          {loading ? (
            <div className="flex h-40 items-center justify-center">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={ClipboardList}
              title="No orders yet"
              description="Your optimization orders will show up here once you start placing them."
            />
          ) : (
            <div className="space-y-3">
              {filtered.map((order, i) => (
                <OrderCard key={order.id} order={order} index={i} />
              ))}
            </div>
          )}
        </NexCardContent>
      </NexCard>
    </div>
  );
}

function OrderCard({ order, index }: { order: OrderRow; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: Math.min(index * 0.04, 0.3) }}
      className="rounded-xl border border-border bg-muted/20 p-4 transition-colors hover:border-primary/20"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 font-mono text-sm font-bold text-foreground">
              <Hash className="size-3.5 text-muted-foreground" />
              {order.order_number}
            </span>
            {order.is_lucky && (
              <span className="flex items-center gap-1 rounded-full bg-gradient-to-r from-warning to-danger px-2 py-0.5 text-[10px] font-bold text-white">
                <Sparkles className="size-2.5" />
                Lucky
              </span>
            )}
          </div>
          <div className="mt-2 flex items-center gap-3 text-sm">
            <span className="flex items-center gap-1.5 font-semibold text-foreground">
              <ShoppingBag className="size-3.5 text-muted-foreground" />
              <span className="line-clamp-1">{order.product_name}</span>
            </span>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Store className="size-3" />
              {order.merchant}
            </span>
            <span className="flex items-center gap-1">
              <Calendar className="size-3" />
              {new Date(order.created_at).toLocaleString('en-US', {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          </div>
        </div>

        <div className="shrink-0 text-right">
          <p className="text-xs text-muted-foreground">Unit price</p>
          <p className="text-sm font-bold text-foreground">
            ${Number(order.unit_price).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <div className="mt-2">
            <p className="text-xs text-muted-foreground">
              Commission ({Number(order.commission_rate)}%)
            </p>
            <p className="text-base font-bold text-success">
              ${Number(order.commission).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>
          <div className="mt-2">
            <NexBadge variant="success" size="sm" dot>
              {order.status}
            </NexBadge>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
