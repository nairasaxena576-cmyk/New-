import { NavLink } from 'react-router-dom';
import { motion } from 'framer-motion';
import { bottomNavItems } from '@/lib/navigation';
import { cn } from '@/lib/utils';

export function BottomNav() {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 backdrop-blur-lg lg:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      aria-label="Primary navigation"
    >
      <ul className="mx-auto flex max-w-md items-stretch justify-around px-1">
        {bottomNavItems.map((item) => {
          const Icon = item.icon;
          return (
            <li key={item.to} className="flex-1">
              <NavLink
                to={item.to}
                end={item.exact}
                className="flex flex-col items-center justify-center gap-1 py-2.5 text-[11px] font-medium transition-colors"
              >
                {({ isActive }) => (
                  <>
                    <span
                      className={cn(
                        'relative flex size-9 items-center justify-center rounded-xl transition-all duration-200',
                        isActive
                          ? 'text-primary'
                          : 'text-muted-foreground'
                      )}
                    >
                      {isActive && (
                        <motion.span
                          layoutId="bottom-nav-pill"
                          className="absolute inset-0 rounded-xl bg-primary/12"
                          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                        />
                      )}
                      <Icon
                        className={cn(
                          'relative size-[22px] transition-transform',
                          isActive && 'scale-110'
                        )}
                      />
                    </span>
                    <span
                      className={cn(
                        'transition-colors',
                        isActive ? 'text-primary font-semibold' : 'text-muted-foreground'
                      )}
                    >
                      {item.label}
                    </span>
                  </>
                )}
              </NavLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
