import {
  Home,
  Rocket,
  ClipboardList,
  Headphones,
  UserRound,
  LayoutDashboard,
  Users,
  Settings,
  Wallet,
  BarChart3,
  ShieldCheck,
  ArrowDownToLine,
  Package,
  Crown,
  Sparkles,
  Megaphone,
  Receipt,
  FileBarChart,
  ScrollText,
  Ticket,
  CreditCard,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
  exact?: boolean;
}

/** Primary bottom navigation for mobile (5 items). */
export const bottomNavItems: NavItem[] = [
  { label: 'Home', to: '/home', icon: Home, exact: true },
  { label: 'Start', to: '/start', icon: Rocket, exact: true },
  { label: 'Orders', to: '/orders', icon: ClipboardList, exact: true },
  { label: 'Service', to: '/service', icon: Headphones, exact: true },
  { label: 'Account', to: '/account', icon: UserRound, exact: true },
];

/** Full set of user-facing sidebar destinations (desktop). */
export const userSidebarItems: NavItem[] = [
  { label: 'Home', to: '/home', icon: Home, exact: true },
  { label: 'Start', to: '/start', icon: Rocket, exact: true },
  { label: 'Orders', to: '/orders', icon: ClipboardList, exact: true },
  { label: 'Recharge', to: '/recharge', icon: Wallet, exact: true },
  { label: 'Withdrawal', to: '/withdrawal', icon: Wallet, exact: true },
  { label: 'Service', to: '/service', icon: Headphones, exact: true },
  { label: 'Account', to: '/account', icon: UserRound, exact: true },
];

/** Admin sidebar navigation. */
export interface AdminNavGroup {
  label: string;
  items: NavItem[];
}

export const adminNavGroups: AdminNavGroup[] = [
  {
    label: 'Overview',
    items: [
      { label: 'Dashboard', to: '/admin', icon: LayoutDashboard, exact: true },
      { label: 'Reports', to: '/admin/reports', icon: FileBarChart },
    ],
  },
  {
    label: 'Management',
    items: [
      { label: 'Users', to: '/admin/users', icon: Users },
      { label: 'Deposits', to: '/admin/deposits', icon: Wallet },
      { label: 'Withdrawals', to: '/admin/withdrawals', icon: ArrowDownToLine },
      { label: 'Orders', to: '/admin/orders', icon: ClipboardList },
    ],
  },
  {
    label: 'Catalog',
    items: [
      { label: 'Products', to: '/admin/products', icon: Package },
      { label: 'Lucky Products', to: '/admin/lucky-products', icon: Sparkles },
    ],
  },
  {
    label: 'Configuration',
    items: [
      { label: 'Crypto Wallets', to: '/admin/wallets', icon: CreditCard },
      { label: 'VIP Management', to: '/admin/vip', icon: Crown },
      { label: 'Announcements', to: '/admin/announcements', icon: Megaphone },
      { label: 'FAQ Management', to: '/admin/faqs', icon: Headphones },
    ],
  },
  {
    label: 'Financials',
    items: [
      { label: 'Finance', to: '/admin/finance', icon: BarChart3 },
      { label: 'Activity Logs', to: '/admin/activity-logs', icon: ScrollText },
    ],
  },
  {
    label: 'Support',
    items: [
      { label: 'Support Center', to: '/admin/support', icon: Ticket },
    ],
  },
  {
    label: 'System',
    items: [
      { label: 'Settings', to: '/admin/settings', icon: Settings },
    ],
  },
];
