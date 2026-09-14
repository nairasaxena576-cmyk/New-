import { useEffect, useRef, useState } from 'react';

interface UseCounterOptions {
  start?: number;
  duration?: number;
  decimals?: number;
}

/**
 * Animates a number from `start` to `value` once the element is visible.
 * Returns the current animated value and a ref to attach to the target.
 */
export function useCounter(target: number, options: UseCounterOptions = {}) {
  const { start = 0, duration = 1200, decimals = 0 } = options;
  const [value, setValue] = useState(start);
  const ref = useRef<HTMLSpanElement>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !startedRef.current) {
          startedRef.current = true;
          const startTime = performance.now();

          const tick = (now: number) => {
            const progress = Math.min((now - startTime) / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            const next = start + (target - start) * eased;
            setValue(parseFloat(next.toFixed(decimals)));
            if (progress < 1) requestAnimationFrame(tick);
            else setValue(target);
          };

          requestAnimationFrame(tick);
        }
      },
      { threshold: 0.3 }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [target, start, duration, decimals]);

  return { value, ref };
}
