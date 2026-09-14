import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface NexLogoProps {
  className?: string;
  showWordmark?: boolean;
  size?: 'sm' | 'default' | 'lg';
}

const sizeMap = {
  sm: { frame: 'size-20', compact: 'size-20', image: 'size-20' },
  default: { frame: 'size-36', compact: 'size-24', image: 'size-36' },
  lg: { frame: 'size-52', compact: 'size-36', image: 'size-52' },
};

export function NexLogo({
  className,
  showWordmark = true,
  size = 'default',
}: NexLogoProps) {
  const s = sizeMap[size];
  const frameClass = showWordmark ? s.frame : s.compact;
  const imageClass = showWordmark ? s.image : s.compact;

  return (
    <motion.div
      initial={{ y: 6 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.45, ease: 'easeOut' }}
      className={cn(
        'flex shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white p-1 shadow-sm',
        frameClass,
        className
      )}
    >
      <img
        src="/assets/images/image.png"
        alt="Hawksem Digital Marketing Agency"
        className={cn('block object-contain', imageClass)}
      />
    </motion.div>
  );
}
