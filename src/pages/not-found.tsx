import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Compass, ArrowLeft } from 'lucide-react';
import { NexButton } from '@/components/ui/nex-button';
import { NexLogo } from '@/components/brand/nex-logo';

export function NotFoundPage() {
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-background px-6 text-center">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
        className="space-y-6"
      >
        <NexLogo size="lg" className="justify-center" />
        <div className="flex size-20 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Compass className="size-9" />
        </div>
        <div>
          <p className="text-6xl font-extrabold tracking-tight text-foreground">404</p>
          <h1 className="mt-2 text-xl font-bold text-foreground">Page not found</h1>
          <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
            The page you're looking for doesn't exist or has been moved.
          </p>
        </div>
        <NexButton asChild leftIcon={<ArrowLeft className="size-4" />}>
          <Link to="/home">Back to home</Link>
        </NexButton>
      </motion.div>
    </div>
  );
}
