import { motion } from 'framer-motion';
import { Handshake } from 'lucide-react';
import type { Partner } from '@/lib/home/constants';
import { cn } from '@/lib/utils';

interface PartnerSectionProps {
  partners: Partner[];
}

export function PartnerSection({ partners }: PartnerSectionProps) {
  return (
    <section id="partners">
      <div className="mb-3 flex items-center gap-2">
        <Handshake className="size-4 text-primary" />
        <h2 className="text-base font-bold tracking-tight text-foreground">
          Trusted Platforms
        </h2>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {partners.map((partner, i) => (
          <motion.div
            key={partner.id}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3, delay: i * 0.05 }}
            whileHover={{ y: -3 }}
            className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3.5 shadow-card transition-colors hover:border-primary/20"
          >
            <div
              className={cn(
                'flex size-11 shrink-0 items-center justify-center rounded-xl text-sm font-bold',
                partner.tint
              )}
            >
              {partner.initials}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-foreground">
                {partner.name}
              </p>
              <p className="text-[11px] text-muted-foreground">Verified partner</p>
            </div>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
