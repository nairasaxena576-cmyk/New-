import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { FullPageSpinner } from '@/components/ui/spinner';

interface ProtectedRouteProps {
  children: ReactNode;
  /** Restrict access to a specific role. */
  role?: 'user' | 'admin';
}

export function ProtectedRoute({ children, role }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading, hasRole } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return <FullPageSpinner label="Verifying your session…" />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (role && !hasRole(role)) {
    return <Navigate to={hasRole('admin') ? '/admin' : '/home'} replace />;
  }

  return <>{children}</>;
}

/** Redirect already-authenticated users away from auth pages. */
export function GuestRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading, user } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return <FullPageSpinner label="Loading…" />;
  }

  if (isAuthenticated && user) {
    const target = user.role === 'admin' ? '/admin' : '/home';
    void location;
    return <Navigate to={target} replace />;
  }

  return <>{children}</>;
}
