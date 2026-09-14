import { Megaphone } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Announcement {
  id: string;
  text: string;
  type: 'info' | 'success' | 'warning';
}

const typeDot: Record<Announcement['type'], string> = {
  info: 'bg-primary',
  success: 'bg-success',
  warning: 'bg-warning',
};

export function AnnouncementBar({ announcements }: { announcements: Announcement[] }) {
  if (!announcements.length) return null;

  // Duplicate the list so the marquee loops seamlessly.
  const items = [...announcements, ...announcements];

  return (
    <div className="flex items-center gap-3 overflow-hidden rounded-xl border border-border bg-card px-4 py-2.5 shadow-card">
      <div className="flex shrink-0 items-center gap-2">
        <div className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Megaphone className="size-4" />
        </div>
      </div>

      <div className="relative flex-1 overflow-hidden">
        <div className="flex whitespace-nowrap will-change-transform [animation:marquee_28s_linear_infinite] hover:[animation-play-state:paused]">
          {items.map((a, i) => (
            <span
              key={a.id + '-' + i}
              className="flex items-center gap-2 px-6 text-sm font-medium text-muted-foreground"
            >
              <span className={cn('size-1.5 shrink-0 rounded-full', typeDot[a.type])} />
              {a.text}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
