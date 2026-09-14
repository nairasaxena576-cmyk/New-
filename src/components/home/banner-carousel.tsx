import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { BannerSlide } from '@/lib/home/constants';
import { cn } from '@/lib/utils';

interface BannerCarouselProps {
  slides: BannerSlide[];
  autoPlayInterval?: number;
}

export function BannerCarousel({
  slides,
  autoPlayInterval = 4000,
}: BannerCarouselProps) {
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState(1);
  const [paused, setPaused] = useState(false);

  const go = useCallback(
    (dir: number) => {
      setDirection(dir);
      setIndex((prev) => (prev + dir + slides.length) % slides.length);
    },
    [slides.length]
  );

  useEffect(() => {
    if (paused || slides.length <= 1) return;
    const timer = setInterval(() => go(1), autoPlayInterval);
    return () => clearInterval(timer);
  }, [paused, go, autoPlayInterval, slides.length]);

  const slide = slides[index];
  if (!slide) return null;

  return (
    <div
      className="relative overflow-hidden rounded-2xl shadow-card"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={() => setPaused(true)}
      onTouchEnd={() => setPaused(false)}
    >
      <AnimatePresence custom={direction} initial={false} mode="popLayout">
        <motion.div
          key={slide.id}
          custom={direction}
          initial={{ opacity: 0, x: direction > 0 ? 60 : -60 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: direction > 0 ? -60 : 60 }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          className={cn(
            'relative flex min-h-[180px] flex-col justify-between bg-gradient-to-br p-6 sm:min-h-[200px] sm:p-8',
            slide.gradient
          )}
        >
          {/* Decorative blobs */}
          <div className="absolute -right-10 -top-10 size-40 rounded-full bg-white/10 blur-2xl" />
          <div className="absolute -bottom-12 right-20 size-32 rounded-full bg-white/5 blur-2xl" />

          <div className="relative">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 text-xs font-semibold text-white backdrop-blur-sm">
              <Sparkles className="size-3.5" />
              {slide.badge}
            </span>
          </div>

          <div className="relative mt-4 max-w-sm">
            <h2 className="text-xl font-bold leading-tight text-white sm:text-2xl">
              {slide.title}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-white/85">
              {slide.subtitle}
            </p>
          </div>

          <div className="relative mt-4">
            <Link
              to={slide.ctaHref}
              className="inline-flex items-center gap-1.5 rounded-xl bg-white/95 px-4 py-2.5 text-sm font-semibold text-slate-900 shadow-sm transition-all hover:bg-white active:scale-95"
            >
              {slide.ctaLabel}
              <ChevronRight className="size-4" />
            </Link>
          </div>
        </motion.div>
      </AnimatePresence>

      {/* Prev / Next controls */}
      {slides.length > 1 && (
        <>
          <button
            onClick={() => go(-1)}
            className="absolute left-3 top-1/2 z-10 flex size-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/20 text-white backdrop-blur-sm transition-all hover:bg-white/30 active:scale-90"
            aria-label="Previous slide"
          >
            <ChevronLeft className="size-5" />
          </button>
          <button
            onClick={() => go(1)}
            className="absolute right-3 top-1/2 z-10 flex size-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/20 text-white backdrop-blur-sm transition-all hover:bg-white/30 active:scale-90"
            aria-label="Next slide"
          >
            <ChevronRight className="size-5" />
          </button>
        </>
      )}

      {/* Pagination dots */}
      {slides.length > 1 && (
        <div className="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 gap-1.5">
          {slides.map((s, i) => (
            <button
              key={s.id}
              onClick={() => {
                setDirection(i > index ? 1 : -1);
                setIndex(i);
              }}
              className={cn(
                'h-1.5 rounded-full transition-all duration-300',
                i === index ? 'w-6 bg-white' : 'w-1.5 bg-white/40 hover:bg-white/60'
              )}
              aria-label={`Go to slide ${i + 1}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
