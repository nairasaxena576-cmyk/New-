export interface BannerSlide {
  id: string;
  title: string;
  subtitle: string;
  ctaLabel: string;
  ctaHref: string;
  gradient: string;
  badge: string;
}

export interface Partner {
  id: string;
  name: string;
  initials: string;
  tint: string;
}

import { VIP_LEVELS } from '@/lib/vip-config';

export interface VipTier {
  level: number;
  name: string;
  dailyTasks: number;
  commissionRate: number;
  minDeposit: number;
  benefits: string[];
  gradient: string;
  accent: string;
  badge: string;
}

export interface HomeStat {
  id: string;
  label: string;
  value: number;
  prefix?: string;
  suffix?: string;
  icon: string;
  tint: string;
}

export const bannerSlides: BannerSlide[] = [
  {
    id: 'b1',
    title: 'Build momentum with a smarter strategy',
    subtitle: 'Work with a dedicated growth partner and unlock more opportunities.',
    ctaLabel: 'Explore VIP',
    ctaHref: '#vip',
    gradient: 'from-primary via-primary to-secondary',
    badge: 'Growth Strategy',
  },
  {
    id: 'b2',
    title: 'New partner: TikTok Shop',
    subtitle: 'Reach the right audience across the platforms that matter most.',
    ctaLabel: 'View partners',
    ctaHref: '#partners',
    gradient: 'from-secondary via-secondary to-primary',
    badge: 'New Partner',
  },
  {
    id: 'b3',
    title: 'Turn attention into action',
    subtitle: 'Bring your next campaign to life with a clear, focused plan.',
    ctaLabel: 'Explore services',
    ctaHref: '/recharge',
    gradient: 'from-success via-success to-primary',
    badge: 'Limited time',
  },
];

export const partners: Partner[] = [
  { id: 'p1', name: 'Shopify', initials: 'S', tint: 'bg-success/10 text-success' },
  { id: 'p2', name: 'AliExpress', initials: 'A', tint: 'bg-danger/10 text-danger' },
  { id: 'p3', name: 'TikTok Shop', initials: 'T', tint: 'bg-primary/10 text-primary' },
  { id: 'p4', name: 'Amazon', initials: 'Am', tint: 'bg-warning/10 text-warning' },
  { id: 'p5', name: 'Wayfair', initials: 'W', tint: 'bg-secondary/10 text-secondary' },
  { id: 'p6', name: 'Temu', initials: 'Te', tint: 'bg-primary/10 text-primary' },
  { id: 'p7', name: 'Lazada', initials: 'L', tint: 'bg-success/10 text-success' },
  { id: 'p8', name: 'Shopee', initials: 'Sh', tint: 'bg-danger/10 text-danger' },
];

const vipTierPresentation: Record<number, { benefits: string[]; gradient: string; accent: string; badge: string }> = {
  0: { benefits: ['38 daily orders', '1% commission rate', 'Standard support'], gradient: 'from-slate-500 to-slate-600', accent: 'text-slate-600', badge: 'Free' },
  1: { benefits: ['43 daily orders', '1.5% commission rate', 'Priority support'], gradient: 'from-primary to-primary/80', accent: 'text-primary', badge: 'Starter' },
  2: { benefits: ['51 daily orders', '2% commission rate', 'Priority support', 'Invite bonuses'], gradient: 'from-secondary to-primary', accent: 'text-secondary', badge: 'Pro' },
  3: { benefits: ['60 daily orders', '2.5% commission rate', 'Dedicated manager', 'Invite bonuses', 'Exclusive campaigns'], gradient: 'from-warning to-danger', accent: 'text-warning', badge: 'Elite' },
};

export const vipTiers: VipTier[] = VIP_LEVELS.map((v) => ({
  level: v.level,
  name: v.name,
  dailyTasks: v.dailyOrderLimit,
  commissionRate: v.commissionRate,
  minDeposit: v.minDeposit,
  ...vipTierPresentation[v.level]!,
}));

export const languages = [
  { code: 'en', label: 'English', flag: '🇬🇧' },
  { code: 'es', label: 'Español', flag: '🇪🇸' },
  { code: 'fr', label: 'Français', flag: '🇫🇷' },
  { code: 'de', label: 'Deutsch', flag: '🇩🇪' },
  { code: 'zh', label: '中文', flag: '🇨🇳' },
  { code: 'pt', label: 'Português', flag: '🇵🇹' },
];
