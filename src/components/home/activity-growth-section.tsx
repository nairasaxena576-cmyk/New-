import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  ArrowDownToLine,
  ArrowUpFromLine,
  ClipboardList,
  Headphones,
  Crown,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import {
  fetchOrders,
  fetchWithdrawals,
  fetchUserTickets,
  type OrderRow,
  type DepositRow,
  type WithdrawalRow,
  type SupportTicketRow,
} from '@/lib/supabase/deposits';
import { supabase } from '@/lib/supabase/client';

interface ActivityItem {
  id: string;
  type: string;
  label: string;
  detail: string;
  date: string;
  icon: LucideIcon;
  tint: string;
}

function formatRelative(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d ago`;
  return d.toLocaleDateString();
}

export function ActivityGrowthSection() {
  const { user, deposits } = useAuth();
  const navigate = useNavigate();
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [withdrawals, setWithdrawals] = useState<WithdrawalRow[]>([]);
  const [tickets, setTickets] = useState<SupportTicketRow[]>([]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const [o, w, t] = await Promise.all([
          fetchOrders(user.id),
          fetchWithdrawals(user.id),
          fetchUserTickets(user.id),
        ]);
        setOrders(o);
        setWithdrawals(w);
        setTickets(t);
      } catch {
        // keep empty
      }
    })();
  }, [user]);

  const activities = useMemo<ActivityItem[]>(() => {
    const items: ActivityItem[] = [];

    for (const d of deposits.slice(0, 10)) {
      items.push({
        id: `dep-${d.id}`,
        type: 'Deposit',
        label: `Deposit request: $${Number(d.amount).toFixed(2)}`,
        detail: d.status,
        date: d.created_at,
        icon: ArrowDownToLine,
        tint: 'bg-violet-100 text-violet-600',
      });
    }
    for (const o of orders.slice(0, 10)) {
      items.push({
        id: `ord-${o.id}`,
        type: 'Order',
        label: `${o.product_name} — $${Number(o.commission).toFixed(2)} commission`,
        detail: o.status,
        date: o.created_at,
        icon: ClipboardList,
        tint: 'bg-teal-100 text-teal-600',
      });
    }
    for (const w of withdrawals.slice(0, 5)) {
      items.push({
        id: `wd-${w.id}`,
        type: 'Withdrawal',
        label: `Withdrawal request: $${Number(w.amount).toFixed(2)}`,
        detail: w.status,
        date: w.created_at,
        icon: ArrowUpFromLine,
        tint: 'bg-pink-100 text-pink-600',
      });
    }
    for (const t of tickets.slice(0, 5)) {
      items.push({
        id: `tkt-${t.id}`,
        type: 'Support',
        label: `Ticket: ${t.subject}`,
        detail: t.status,
        date: t.created_at,
        icon: Headphones,
        tint: 'bg-amber-100 text-amber-600',
      });
    }

    return items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 8);
  }, [deposits, orders, withdrawals, tickets]);

  const weeklyData = useMemo(() => {
    const days: { label: string; value: number }[] = [];
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const day = new Date(now);
      day.setDate(now.getDate() - i);
      day.setHours(0, 0, 0, 0);
      const next = new Date(day);
      next.setDate(day.getDate() + 1);

      const dayOrders = orders.filter((o) => {
        const od = new Date(o.created_at);
        return od >= day && od < next;
      });
      const total = dayOrders.reduce((sum, o) => sum + Number(o.commission), 0);
      days.push({
        label: day.toLocaleDateString('en-US', { weekday: 'short' }),
        value: total,
      });
    }
    return days;
  }, [orders]);

  const maxWeekly = Math.max(...weeklyData.map((d) => d.value), 1);

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      {/* Recent Activity */}
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-sm"
      >
        <div className="mb-5 flex items-center justify-between">
          <h3 className="text-base font-bold text-slate-800">Recent Activity</h3>
          <button
            onClick={() => navigate('/orders')}
            className="flex items-center gap-1 text-xs font-semibold text-violet-600 transition-colors hover:text-violet-700"
          >
            View All
            <ArrowRight className="size-3.5" />
          </button>
        </div>

        {activities.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
              <ClipboardList className="size-6" />
            </div>
            <p className="mt-4 text-sm text-slate-400">No recent activity yet.</p>
          </div>
        ) : (
          <div className="space-y-1">
            {activities.map((item, i) => {
              const Icon = item.icon;
              return (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.3, delay: Math.min(i * 0.05, 0.3) }}
                  className="flex items-center gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-slate-50"
                >
                  <div className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${item.tint}`}>
                    <Icon className="size-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-700">{item.label}</p>
                    <p className="text-xs capitalize text-slate-400">{item.detail}</p>
                  </div>
                  <span className="shrink-0 text-xs text-slate-400">{formatRelative(item.date)}</span>
                </motion.div>
              );
            })}
          </div>
        )}
      </motion.div>

      {/* Growth Overview */}
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.1 }}
        className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-sm"
      >
        <div className="mb-5 flex items-center justify-between">
          <h3 className="text-base font-bold text-slate-800">Growth Overview</h3>
          <span className="flex items-center gap-1 rounded-lg bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-600">
            <TrendingUp className="size-3.5" />
            This Week
          </span>
        </div>

        <div className="mb-5">
          <p className="text-xs font-medium text-slate-400">Total Growth Credit</p>
          <p className="mt-1 text-3xl font-bold tracking-tight text-slate-800">
            ${user?.lifetimeCommission?.toFixed(2) ?? '0.00'}
          </p>
        </div>

        {/* Bar chart */}
        <div className="flex h-36 items-end justify-between gap-2">
          {weeklyData.map((d, i) => (
            <div key={d.label} className="flex flex-1 flex-col items-center gap-2">
              <motion.div
                initial={{ height: 0 }}
                animate={{ height: `${Math.max((d.value / maxWeekly) * 100, 4)}%` }}
                transition={{ duration: 0.5, delay: i * 0.08 }}
                className="w-full rounded-t-lg bg-gradient-to-t from-violet-500 to-violet-300"
                style={{ minHeight: 4 }}
              />
              <span className="text-[10px] font-medium text-slate-400">{d.label}</span>
            </div>
          ))}
        </div>

        {weeklyData.every((d) => d.value === 0) && (
          <p className="mt-4 text-center text-xs text-slate-400">
            No growth credit earned this week yet. Start tasks to see your progress.
          </p>
        )}
      </motion.div>
    </div>
  );
}
