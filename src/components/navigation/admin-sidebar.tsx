import { NavLink, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ChevronRight, LogOut } from 'lucide-react';
import { useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { adminNavGroups } from '@/lib/navigation';
import { NexLogo } from '@/components/brand/nex-logo';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/utils';

export function AdminSidebar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleLogout = () => {
    setIsLoggingOut(true);
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-card lg:flex">
      <div className="flex h-40 items-center gap-2.5 border-b border-border px-6">
        <NexLogo size="default" />
        <span className="rounded-md bg-secondary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-secondary">
          Admin
        </span>
      </div>
      <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="Admin navigation">
        {adminNavGroups.map((group) => (
          <div key={group.label} className="mb-6">
            <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
              {group.label}
            </p>
            <div className="space-y-1">
              {group.items.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.exact}
                    className="group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors"
                  >
                    {({ isActive }) => (
                      <>
                        {isActive && (
                          <motion.span
                            layoutId="admin-sidebar-active"
                            className="absolute inset-0 rounded-xl bg-primary/10"
                            transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                          />
                        )}
                        <Icon
                          className={cn(
                            'relative size-[18px] transition-colors',
                            isActive ? 'text-primary' : 'text-muted-foreground'
                          )}
                        />
                        <span
                          className={cn(
                            'relative flex-1 transition-colors',
                            isActive ? 'text-primary font-semibold' : 'text-foreground/70'
                          )}
                        >
                          {item.label}
                        </span>
                        <ChevronRight
                          className={cn(
                            'relative size-4 transition-all',
                            isActive
                              ? 'text-primary opacity-100'
                              : 'text-muted-foreground opacity-0 group-hover:opacity-60'
                          )}
                        />
                      </>
                    )}
                  </NavLink>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
      <div className="border-t border-border p-4">
        <div className="flex items-center gap-3 rounded-xl bg-muted/60 p-3">
          <div className="flex size-9 items-center justify-center rounded-lg bg-secondary/10 text-secondary">
            <span className="text-xs font-bold">{(user?.fullName || user?.email || 'AD').slice(0, 2).toUpperCase()}</span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold text-foreground">{user?.fullName || 'Admin'}</p>
            <p className="truncate text-[11px] text-muted-foreground">{user?.email || ''}</p>
          </div>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <button
                className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:border-danger/40 hover:text-danger"
                aria-label="Sign out"
                title="Sign out"
              >
                <LogOut className="size-4" />
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent className="rounded-2xl">
              <AlertDialogHeader>
                <AlertDialogTitle>Sign out of admin panel?</AlertDialogTitle>
                <AlertDialogDescription>
                  You will need to sign in again to access the admin dashboard.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={isLoggingOut}>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleLogout}
                  disabled={isLoggingOut}
                  className="bg-danger text-white hover:bg-danger/90"
                >
                  {isLoggingOut ? 'Signing out…' : 'Sign out'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    </aside>
  );
}
