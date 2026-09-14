import { useState } from 'react';
import { Outlet, Link, useNavigate } from 'react-router-dom';
import { Bell, Search, Globe, Check, LogOut, Menu, ChevronRight } from 'lucide-react';
import { motion } from 'framer-motion';
import { DashboardSidebar } from '@/components/navigation/dashboard-sidebar';
import { BottomNav } from '@/components/navigation/bottom-nav';
import { NexLogo } from '@/components/brand/nex-logo';
import { VipSidebarCard } from '@/components/home/vip-sidebar-card';
import { NexInput } from '@/components/ui/nex-input';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { userSidebarItems } from '@/lib/navigation';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
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
import { languages } from '@/lib/home/constants';
import { cn } from '@/lib/utils';

function DashboardTopBar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [lang, setLang] = useState(languages[0]);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleLogout = () => {
    setIsLoggingOut(true);
    logout();
    navigate('/login', { replace: true });
  };

  const initials = user?.fullName
    ?.split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase() ?? 'HS';

  return (
    <header className="sticky top-0 z-30 flex h-20 items-center gap-3 border-b border-slate-200/80 bg-white/80 px-4 backdrop-blur-lg sm:px-6">
      {/* Mobile menu */}
      <Sheet>
        <SheetTrigger asChild>
          <button
            className="flex size-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition-colors hover:bg-slate-50 lg:hidden"
            aria-label="Open menu"
          >
            <Menu className="size-5" />
          </button>
        </SheetTrigger>
        <SheetContent side="left" className="w-72 border-r border-slate-200 p-0">
          <div className="flex h-40 items-center px-6">
            <NexLogo size="default" />
          </div>
          <nav className="space-y-1 px-3 py-4" aria-label="Mobile dashboard navigation">
            {userSidebarItems.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:bg-violet-50 hover:text-violet-700"
                >
                  <Icon className="size-[18px] text-slate-400" />
                  <span className="flex-1">{item.label}</span>
                  <ChevronRight className="size-4 text-slate-300" />
                </Link>
              );
            })}
          </nav>
          <div className="border-t border-slate-200 p-4">
            <VipSidebarCard
              vipLevel={user?.vipLevel ?? 0}
              currentBalance={user?.balance ?? 0}
            />
          </div>
        </SheetContent>
      </Sheet>

      <Link to="/home" className="lg:hidden">
        <NexLogo size="sm" showWordmark={false} />
      </Link>

      <div className="relative hidden flex-1 sm:block sm:max-w-xs">
        <NexInput
          placeholder="Search…"
          leftIcon={<Search />}
          className="h-10"
          aria-label="Search"
        />
      </div>

      <div className="ml-auto flex items-center gap-2 sm:gap-3">
        {/* Language selector */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-sm font-medium text-slate-500 transition-colors hover:bg-slate-50"
              aria-label="Select language"
            >
              <Globe className="size-[18px]" />
              <span className="hidden text-xs sm:inline">{lang.flag}</span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44 rounded-xl">
            <DropdownMenuLabel className="text-xs uppercase tracking-wide text-slate-400">
              Language
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {languages.map((l) => (
              <DropdownMenuItem
                key={l.code}
                onClick={() => setLang(l)}
                className="flex cursor-pointer items-center gap-2 rounded-lg py-2"
              >
                <span className="text-base">{l.flag}</span>
                <span className="flex-1 text-sm">{l.label}</span>
                {l.code === lang.code && <Check className="size-4 text-violet-600" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Notifications */}
        <button
          className="relative flex size-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition-colors hover:bg-slate-50"
          aria-label="Notifications"
        >
          <Bell className="size-[18px]" />
          <span className="absolute right-2.5 top-2.5 size-2 rounded-full bg-pink-500 ring-2 ring-white" />
        </button>

        {/* User avatar */}
        <Link
          to="/account"
          className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white py-1.5 pl-1.5 pr-3 transition-colors hover:bg-slate-50"
        >
          <div className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-pink-500 text-xs font-bold text-white">
            {initials}
          </div>
          <div className="hidden text-left sm:block">
            <p className="text-xs font-semibold leading-tight text-slate-800">
              {user?.fullName ?? 'Hawksem Client'}
            </p>
            <p className="text-[11px] leading-tight text-slate-400">
              VIP{user?.vipLevel ?? 0}
            </p>
          </div>
        </Link>

        {/* Sign out */}
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <button
              className="flex size-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition-colors hover:border-red-300 hover:text-red-500"
              aria-label="Sign out"
              title="Sign out"
            >
              <LogOut className="size-[18px]" />
            </button>
          </AlertDialogTrigger>
          <AlertDialogContent className="rounded-2xl">
            <AlertDialogHeader>
              <AlertDialogTitle>Sign out of Hawksem?</AlertDialogTitle>
              <AlertDialogDescription>
                You will need to sign in again to access your account, orders, and balance.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isLoggingOut}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleLogout}
                disabled={isLoggingOut}
                className="bg-red-500 text-white hover:bg-red-600"
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

export function DashboardLayout() {
  return (
    <div className="flex min-h-[100dvh] bg-slate-50">
      <DashboardSidebar />
      <div className="flex flex-1 flex-col">
        <DashboardTopBar />
        <main className="flex-1 px-4 pb-28 pt-6 sm:px-6 lg:pb-12 lg:pl-8 lg:pr-10">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
            className="mx-auto w-full max-w-5xl"
          >
            <Outlet />
          </motion.div>
        </main>
      </div>
      <BottomNav />
    </div>
  );
}
