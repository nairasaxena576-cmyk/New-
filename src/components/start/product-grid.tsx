import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Store } from 'lucide-react';
import { NexBadge } from '@/components/ui/nex-badge';
import { formatCurrency } from '@/lib/start/helpers';
import type { Product } from '@/lib/start/helpers';
import { cn } from '@/lib/utils';

interface ProductGridProps {
  products: Product[];
}

export function ProductGrid({ products }: ProductGridProps) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
      {products.map((product, i) => (
        <ProductCard key={product.id} product={product} index={i} />
      ))}
    </div>
  );
}

function ProductCard({ product, index }: { product: Product; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: Math.min(index * 0.04, 0.4) }}
      whileHover={{ y: -4 }}
      className="group overflow-hidden rounded-[18px] border border-border bg-card shadow-card transition-shadow duration-300 hover:shadow-pop"
    >
      {/* Image */}
      <div className="relative aspect-square overflow-hidden bg-muted">
        <img
          src={product.image}
          alt={product.name}
          loading="lazy"
          className={cn(
            'size-full object-cover transition-transform duration-500',
            'group-hover:scale-105'
          )}
        />
        {/* Category badge */}
        <div className="absolute left-2.5 top-2.5">
          <NexBadge variant={product.categoryTint} size="sm">
            {product.category}
          </NexBadge>
        </div>
      </div>

      {/* Body */}
      <div className="p-3 sm:p-4">
        <h4 className="line-clamp-2 text-xs font-semibold leading-snug text-foreground sm:text-sm">
          {product.name}
        </h4>
        <div className="mt-1.5 flex items-center gap-1 text-[11px] text-muted-foreground">
          <Store className="size-3" />
          <span className="truncate">{product.merchant}</span>
        </div>
        <p className="mt-2 text-base font-bold tracking-tight text-foreground sm:text-lg">
          ${formatCurrency(product.price)}
        </p>
      </div>
    </motion.div>
  );
}
