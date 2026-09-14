import { Outlet, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ShieldCheck, TrendingUp, Wallet } from 'lucide-react';
import { NexLogo } from '@/components/brand/nex-logo';

const features = [
  {
    icon: TrendingUp,
    title: 'Grow Your Online Presence',
    description: 'Build visibility and conversion with focused digital strategy.',
  },
  {
    icon: Wallet,
    title: 'Digital Marketing Solutions',
    description: 'Strategy, creative, and campaigns built around your goals.',
  },
  {
    icon: ShieldCheck,
    title: 'Professional & Reliable Service',
    description: 'A thoughtful team delivering clear, dependable support.',
  },
];

export function AuthLayout() {
  return (
    <div className="flex min-h-[100dvh] bg-background">
      <div className="relative hidden w-1/2 flex-col justify-between overflow-hidden bg-primary p-12 lg:flex">
        <div className="absolute -right-24 -top-24 size-96 rounded-full bg-white/10 blur-3xl" />
        <div className="absolute -bottom-32 -left-16 size-96 rounded-full bg-white/5 blur-3xl" />
        <div className="relative">
          <NexLogo size="lg" className="[&_span]:text-white" />
          <p className="mt-3 text-xs font-semibold uppercase tracking-[0.28em] text-white/60">
            Digital Marketing Agency
          </p>
        </div>
        <div className="relative space-y-10">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
            <h1 className="max-w-md font-serif text-5xl font-semibold leading-[1.05] tracking-tight text-white">
              Make your brand impossible to ignore.
            </h1>
            <p className="mt-5 max-w-md text-base leading-relaxed text-white/75">
              Hawksem helps ambitious businesses turn strategy into meaningful digital growth.
            </p>
          </motion.div>
          <div className="space-y-5">
            {features.map((f, i) => {
              const Icon = f.icon;
              return (
                <motion.div key={f.title} initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.5, delay: 0.2 + i * 0.12 }} className="flex items-start gap-4">
                  <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-white/15 text-white backdrop-blur-sm"><Icon className="size-5" /></div>
                  <div>
                    <p className="font-semibold text-white">{f.title}</p>
                    <p className="mt-0.5 text-sm leading-relaxed text-white/70">{f.description}</p>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
        <div className="relative text-sm text-white/55">&copy; {new Date().getFullYear()} Hawksem Digital Marketing Agency. All rights reserved.</div>
      </div>
      <div className="flex w-full flex-col lg:w-1/2">
        <div className="flex items-center justify-between p-6 lg:hidden"><NexLogo size="default" /></div>
        <div className="flex flex-1 items-center justify-center px-6 pb-12 pt-4 sm:px-12 lg:p-12">
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="w-full max-w-md"><Outlet /></motion.div>
        </div>
        <div className="hidden p-6 text-center text-xs text-muted-foreground lg:block">
          By continuing you agree to Hawksem&apos;s <Link to="/login" className="font-medium text-primary hover:underline">Terms</Link> &amp; <Link to="/login" className="font-medium text-primary hover:underline">Privacy Policy</Link>.
        </div>
      </div>
    </div>
  );
}
