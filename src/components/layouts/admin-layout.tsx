import { Outlet, Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Bell, Search, LogOut, Menu } from 'lucide-react';
import { useState } from 'react';
import { AdminSidebar } from '@/components/navigation/admin-sidebar';
import { NexLogo } from '@/components/brand/nex-logo';
import { NexInput } from '@/components/ui/nex-input';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { adminNavGroups } from '@/lib/navigation';
import { cn } from '@/lib/utils';
import { ChevronRight } from 'lucide-react';
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
import { useAuth } from '@/lib/auth';

function AdminTopBar() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleLogout = () => {
    setIsLoggingOut(true);
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <header className="sticky top-0 z-30 flex h-20 items-center gap-3 border-b border-border bg-card/80 px-4 backdrop-blur-lg sm:px-6">
      <Sheet>
        <SheetTrigger asChild>
          <button
            className="flex size-10 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground transition-colors hover:bg-accent hover:text-foreground lg:hidden"
            aria-label="Open admin menu"
          >
            <Menu className="size-5" />
          </button>
        </SheetTrigger>
        <SheetContent side="left" className="w-72 p-0">
          <div className="flex h-40 items-center gap-2.5 border-b border-border px-6">
            <NexLogo size="default" />
            <span className="rounded-md bg-secondary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-secondary">
              Admin
            </span>
          </div>
          <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="Admin navigation mobile">
            {adminNavGroups.map((group) => (
              <div key={group.label} className="mb-6">
                <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                  {group.label}
                </p>
                <div className="space-y-1">
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    return (
                      <Link
                        key={item.to}
                        to={item.to}
                        className="group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors hover:bg-primary/10"
                      >
                        <Icon className="relative size-[18px] text-muted-foreground" />
                        <span className="relative flex-1 text-foreground/70">{item.label}</span>
                        <ChevronRight className="relative size-4 text-muted-foreground opacity-0 group-hover:opacity-60" />
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>
        </SheetContent>
      </Sheet>

      <div className="lg:hidden">
        <NexLogo size="sm" showWordmark={false} />
      </div>

      <div className="relative hidden flex-1 sm:block sm:max-w-sm">
        <NexInput
          placeholder="Search users, orders, transactions…"
          leftIcon={<Search />}
          className="h-10"
          aria-label="Search admin"
        />
      </div>

      <div className="ml-auto flex items-center gap-2 sm:gap-3">
        <button
          className="relative flex size-10 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          aria-label="Notifications"
        >
          <Bell className="size-[18px]" />
          <span className="absolute right-2.5 top-2.5 size-2 rounded-full bg-danger ring-2 ring-card" />
        </button>
        <Link
          to="/admin"
          className="flex items-center gap-2.5 rounded-xl border border-border bg-card py-1.5 pl-1.5 pr-3 transition-colors hover:bg-accent"
        >
          <div className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-secondary to-primary text-xs font-bold text-primary-foreground">
            AD
          </div>
          <div className="hidden text-left sm:block">
            <p className="text-xs font-semibold leading-tight text-foreground">Admin</p>
            <p className="text-[11px] leading-tight text-muted-foreground">Super admin</p>
          </div>
        </Link>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <button
              className="flex size-10 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground transition-colors hover:border-danger/40 hover:text-danger"
              aria-label="Sign out"
              title="Sign out"
            >
              <LogOut className="size-[18px]" />
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
    </header>
  );
}

export function AdminLayout() {
  return (
    <div className="flex min-h-[100dvh] bg-background">
      <AdminSidebar />
      <div className="flex flex-1 flex-col">
        <AdminTopBar />
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-10">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
            className="mx-auto w-full max-w-6xl"
          >
            <Outlet />
          </motion.div>
        </main>
      </div>
    </div>
  );
}
