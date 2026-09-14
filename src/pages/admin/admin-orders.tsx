import { useEffect, useState, useMemo, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  ClipboardList,
  Hash,
  Search,
  ChevronLeft,
  ChevronRight,
  ShoppingBag,
  Coins,
  Sparkles,
  Store,
  Calendar,
  Loader2,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { NexCard, NexCardHeader, NexCardTitle, NexCardContent, NexBadge } from '@/components/ui/nex';
import { NexInput } from '@/components/ui/nex-input';
import { EmptyState } from '@/components/ui/empty-state';
import { fetchAllOrders, type OrderRow } from '@/lib/supabase/deposits';
import { supabase } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const PAGE_SIZE = 10;
type Filter = 'all' | 'completed';

const fmt = (n: number) =>
  Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function AdminOrdersPage() {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [page, setPage] = useState(1);

  const loadOrders = useCallback(async () => {
    try {
      const rows = await fetchAllOrders();
      setOrders(rows);
    } catch {
      toast.error('Failed to load orders');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  useEffect(() => {
    const channel = supabase
      .channel('admin-orders-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        loadOrders();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadOrders]);

  const filtered = useMemo(() => {
    let result = orders;
    if (filter === 'completed') {
      result = result.filter((o) => o.status === 'completed');
    }
    const q = search.trim().toLowerCase();
    if (q) {
      result = result.filter(
        (o) =>
          o.order_number.toLowerCase().includes(q) ||
          o.product_name.toLowerCase().includes(q) ||
          o.user_id.toLowerCase().includes(q) ||
          o.merchant.toLowerCase().includes(q)
      );
    }
    return result;
  }, [orders, search, filter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paginated = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const totalCommission = orders.reduce((sum, o) => sum + Number(o.commission), 0);
  const luckyCount = orders.filter((o) => o.is_lucky).length;

  const kpis = [
    { label: 'Total Orders', value: String(orders.length), icon: ClipboardList, tint: 'from-primary/10 to-primary/5 text-primary' },
    { label: 'Total Growth Credit', value: `$${fmt(totalCommission)}`, icon: Coins, tint: 'from-success/10 to-success/5 text-success' },
    { label: 'Lucky Orders', value: String(luckyCount), icon: Sparkles, tint: 'from-warning/10 to-warning/5 text-warning' },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Order Management"
        subtitle="Monitor and manage all platform orders."
        action={<NexBadge variant="success" dot>Realtime</NexBadge>}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        {kpis.map((k, i) => {
          const Icon = k.icon;
          return (
            <motion.div key={k.label} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: i * 0.07 }}>
              <NexCard className="p-5">
                <div className={cn('flex size-11 items-center justify-center rounded-xl bg-gradient-to-br', k.tint)}>
                  <Icon className="size-5" />
                </div>
                <p className="mt-4 text-2xl font-bold tracking-tight text-foreground">{k.value}</p>
                <p className="mt-1 text-sm text-muted-foreground">{k.label}</p>
              </NexCard>
            </motion.div>
          );
        })}
      </div>

      <NexCard>
        <NexCardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <NexCardTitle>All Orders</NexCardTitle>
            <div className="flex flex-wrap items-center gap-2">
              <div className="w-full sm:w-56">
                <NexInput
                  placeholder="Search orders..."
                  leftIcon={<Search />}
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                  className="h-9"
                />
              </div>
              {(['all', 'completed'] as Filter[]).map((f) => (
                <button
                  key={f}
                  onClick={() => {
                    setFilter(f);
                    setPage(1);
                  }}
                  className={cn(
                    'rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors',
                    filter === f ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-accent'
                  )}
                >
                  {f === 'all' ? 'All' : 'Completed'}
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
          ) : paginated.length === 0 ? (
            <EmptyState
              icon={ClipboardList}
              title="No orders found"
              description="Orders will appear here once users start completing tasks."
            />
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden overflow-x-auto sm:block">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Order #</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">User</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Product</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Price</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Commission</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginated.map((order, i) => (
                      <motion.tr
                        key={order.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.2, delay: Math.min(i * 0.03, 0.2) }}
                        className="border-b border-border last:border-0 transition-colors hover:bg-muted/20"
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <Hash className="size-3 text-muted-foreground" />
                            <span className="font-mono text-xs font-bold text-foreground">{order.order_number}</span>
                            {order.is_lucky && (
                              <span className="flex items-center gap-0.5 rounded-full bg-gradient-to-r from-warning to-danger px-1.5 py-0.5 text-[9px] font-bold text-white">
                                <Sparkles className="size-2" />
                                Lucky
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">{order.user_id}</td>
                        <td className="px-4 py-3">
                          <p className="text-sm font-semibold text-foreground line-clamp-1 max-w-[180px]">{order.product_name}</p>
                          <p className="text-xs text-muted-foreground">{order.merchant}</p>
                        </td>
                        <td className="px-4 py-3 text-sm font-bold text-foreground">${fmt(order.unit_price)}</td>
                        <td className="px-4 py-3">
                          <span className="text-sm font-bold text-success">${fmt(order.commission)}</span>
                          <span className="ml-1 text-xs text-muted-foreground">({Number(order.commission_rate)}%)</span>
                        </td>
                        <td className="px-4 py-3">
                          <NexBadge variant="success" size="sm" dot>{order.status}</NexBadge>
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">
                          {new Date(order.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </td>
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards */}
              <div className="space-y-3 sm:hidden">
                {paginated.map((order, i) => (
                  <motion.div
                    key={order.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: Math.min(i * 0.04, 0.2) }}
                    className="rounded-xl border border-border bg-muted/20 p-4"
                  >
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1 font-mono text-sm font-bold text-foreground">
                        <Hash className="size-3 text-muted-foreground" />
                        {order.order_number}
                      </span>
                      {order.is_lucky && (
                        <span className="flex items-center gap-1 rounded-full bg-gradient-to-r from-warning to-danger px-2 py-0.5 text-[10px] font-bold text-white">
                          <Sparkles className="size-2.5" />
                          Lucky
                        </span>
                      )}
                    </div>
                    <p className="mt-2 text-sm font-semibold text-foreground">{order.product_name}</p>
                    <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><Store className="size-3" />{order.merchant}</span>
                      <span className="flex items-center gap-1"><Calendar className="size-3" />{new Date(order.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                    </div>
                    <div className="mt-3 flex items-center justify-between">
                      <div>
                        <p className="text-xs text-muted-foreground">Price: ${fmt(order.unit_price)}</p>
                        <p className="text-sm font-bold text-success">Commission: ${fmt(order.commission)}</p>
                      </div>
                      <NexBadge variant="success" size="sm" dot>{order.status}</NexBadge>
                    </div>
                  </motion.div>
                ))}
              </div>

              {/* Pagination */}
              <div className="mt-4 flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  Page {currentPage} of {totalPages} · {filtered.length} orders
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage <= 1}
                    className="flex size-9 items-center justify-center rounded-lg border border-border bg-card transition-colors hover:bg-accent disabled:opacity-40"
                  >
                    <ChevronLeft className="size-4" />
                  </button>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage >= totalPages}
                    className="flex size-9 items-center justify-center rounded-lg border border-border bg-card transition-colors hover:bg-accent disabled:opacity-40"
                  >
                    <ChevronRight className="size-4" />
                  </button>
                </div>
              </div>
            </>
          )}
        </NexCardContent>
      </NexCard>
    </div>
  );
}
