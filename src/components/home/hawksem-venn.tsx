import { motion } from 'framer-motion';
import { Wifi, SlidersHorizontal, Zap, type LucideIcon } from 'lucide-react';

interface VennCircle {
  label: string;
  color: string;
  ring: string;
  glow: string;
  icon: LucideIcon;
  style: React.CSSProperties;
}

const circles: VennCircle[] = [
  {
    label: 'REMOTE WORK',
    color: '#7c3aed',
    ring: 'border-violet-400',
    glow: 'bg-violet-500/20',
    icon: Wifi,
    style: { top: '0%', left: '50%', transform: 'translateX(-50%)' },
  },
  {
    label: 'FLEXIBILITY',
    color: '#ec4899',
    ring: 'border-pink-400',
    glow: 'bg-pink-500/20',
    icon: SlidersHorizontal,
    style: { bottom: '0%', left: '0%' },
  },
  {
    label: 'ADHOCRACY',
    color: '#14b8a6',
    ring: 'border-teal-400',
    glow: 'bg-teal-500/20',
    icon: Zap,
    style: { bottom: '0%', right: '0%' },
  },
];

export function HawksemVenn() {
  return (
    <div className="flex items-center justify-center">
      <div className="relative aspect-square w-full max-w-[340px]">
        {circles.map((c, i) => {
          const Icon = c.icon;
          return (
            <motion.div
              key={c.label}
              initial={{ opacity: 0, scale: 0.7 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, delay: i * 0.15 }}
              className={`absolute flex size-[52%] items-center justify-center rounded-full border-2 ${c.ring} ${c.glow} backdrop-blur-[2px]`}
              style={c.style}
            >
              <div className="flex flex-col items-center gap-1 pt-6">
                <Icon className="size-5" style={{ color: c.color }} />
                <span
                  className="text-[9px] font-bold tracking-wide sm:text-[10px]"
                  style={{ color: c.color }}
                >
                  {c.label}
                </span>
              </div>
            </motion.div>
          );
        })}

        {/* Center HAWKSEM */}
        <motion.div
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.5 }}
          className="absolute left-1/2 top-1/2 z-10 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
        >
          <div className="flex size-16 items-center justify-center overflow-hidden rounded-2xl bg-white shadow-lg sm:size-20">
            <img
              src="/assets/images/image.png"
              alt="Hawksem"
              className="size-full object-contain"
            />
          </div>
          <span className="mt-2 text-xs font-bold tracking-widest text-slate-800 sm:text-sm">
            HAWKSEM
          </span>
        </motion.div>
      </div>
    </div>
  );
}
