import { motion } from 'framer-motion';
import { useAuth } from '@/lib/auth';
import { BalanceOverview } from '@/components/home/balance-overview';
import { PhilosophySection } from '@/components/home/philosophy-section';
import { ActivityGrowthSection } from '@/components/home/activity-growth-section';

export function HomePage() {
  const { user } = useAuth();
  const firstName = user?.fullName?.split(' ')[0] ?? 'there';
  const vipLevel = user?.vipLevel ?? 0;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      {/* Welcome */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <h1 className="text-2xl font-bold tracking-tight text-slate-800 sm:text-3xl">
          Welcome back, {firstName}
          <span className="ml-1.5">👋</span>
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Here's your growth dashboard for today.
        </p>
      </motion.div>

      {/* Balance + Quick Actions */}
      <BalanceOverview
        balance={user?.balance ?? 0}
        lifetimeCommission={user?.lifetimeCommission ?? 0}
        todayCommission={user?.todayCommission ?? 0}
        vipLevel={vipLevel}
      />

      {/* Philosophy + Venn */}
      <PhilosophySection />

      {/* Recent Activity + Growth Overview */}
      <ActivityGrowthSection />
    </motion.div>
  );
}
