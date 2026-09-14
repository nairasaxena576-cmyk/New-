import { NavLink } from 'react-router-dom';
import { motion } from 'framer-motion';
import { userSidebarItems } from '@/lib/navigation';
import { NexLogo } from '@/components/brand/nex-logo';
import { VipSidebarCard } from '@/components/home/vip-sidebar-card';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/utils';

export function DashboardSidebar() {
  const { user } = useAuth();

  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-slate-200/80 bg-white lg:flex">
      <div className="flex h-40 items-center px-6">
        <NexLogo size="default" />
      </div>
      <nav className="flex-1 space-y-1 px-3 py-4" aria-label="Dashboard navigation">
        {userSidebarItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.exact}
              className="relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors"
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <motion.span
                      layoutId="sidebar-active"
                      className="absolute inset-0 rounded-xl bg-gradient-to-r from-violet-100 to-violet-50"
                      transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                    />
                  )}
                  <Icon
                    className={cn(
                      'relative size-[18px] transition-colors',
                      isActive ? 'text-violet-600' : 'text-slate-400'
                    )}
                  />
                  <span
                    className={cn(
                      'relative transition-colors',
                      isActive ? 'font-semibold text-violet-700' : 'text-slate-600'
                    )}
                  >
                    {item.label}
                  </span>
                </>
              )}
            </NavLink>
          );
        })}
      </nav>
      <div className="border-t border-slate-200/80 p-4">
        <VipSidebarCard
          vipLevel={user?.vipLevel ?? 0}
          currentBalance={user?.balance ?? 0}
        />
      </div>
    </aside>
  );
}
