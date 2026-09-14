import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Mail,
  Lock,
  ArrowRight,
  Eye,
  EyeOff,
  AlertCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { NexButton } from '@/components/ui/nex-button';
import { NexInput } from '@/components/ui/nex-input';
import { NexCard } from '@/components/ui/nex-card';
import { Checkbox } from '@/components/ui/checkbox';
import { useAuth } from '@/lib/auth';
import { validateEmail, validatePassword } from '@/lib/auth/validation';
import { cn } from '@/lib/utils';

interface FieldErrors {
  email?: string;
  password?: string;
}

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  function validate(): boolean {
    const next: FieldErrors = {};
    const emailCheck = validateEmail(email);
    const passwordCheck = validatePassword(password);
    if (!emailCheck.valid) next.email = emailCheck.message;
    if (!passwordCheck.valid) next.password = passwordCheck.message;
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError('');
    if (!validate()) return;

    setIsSubmitting(true);
    try {
      const profile = await login(email, password, remember);
      toast.success('Welcome back!', {
        description: `Signed in as ${profile.fullName || profile.email}`,
      });
      const target = profile.role === 'admin' ? '/admin' : '/home';
      navigate(target, { replace: true });
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : typeof err === 'object' && err !== null && 'message' in err
            ? String((err as { message: unknown }).message)
            : 'Unable to sign in. Please try again.';
      setFormError(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Welcome back
        </h1>
        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
          Sign in to your Hawksem account to continue optimizing and earning.
        </p>
      </div>

      <NexCard className="p-6">
        <form className="space-y-4" onSubmit={handleSubmit} noValidate>
          {/* Form-level error */}
          <AnimatePresence>
            {formError && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="flex items-start gap-2.5 rounded-xl border border-danger/20 bg-danger/5 px-4 py-3"
              >
                <AlertCircle className="mt-0.5 size-4 shrink-0 text-danger" />
                <p className="text-sm font-medium text-danger">{formError}</p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Email */}
          <div className="space-y-1.5">
            <label htmlFor="email" className="text-sm font-semibold text-foreground">
              Email address
            </label>
            <NexInput
              id="email"
              type="email"
              placeholder="you@example.com"
              leftIcon={<Mail />}
              autoComplete="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (errors.email) setErrors((p) => ({ ...p, email: undefined }));
              }}
              aria-invalid={!!errors.email}
              className={cn(errors.email && 'border-danger focus-visible:border-danger focus-visible:ring-danger/20')}
            />
            {errors.email && (
              <p className="text-xs font-medium text-danger">{errors.email}</p>
            )}
          </div>

          {/* Password */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="password" className="text-sm font-semibold text-foreground">
                Password
              </label>
              <button
                type="button"
                className="text-xs font-medium text-primary hover:underline"
              >
                Forgot?
              </button>
            </div>
            <NexInput
              id="password"
              type={showPassword ? 'text' : 'password'}
              placeholder="••••••••"
              leftIcon={<Lock />}
              rightIcon={
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  className="pointer-events-auto text-muted-foreground hover:text-foreground"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff /> : <Eye />}
                </button>
              }
              autoComplete="current-password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (errors.password) setErrors((p) => ({ ...p, password: undefined }));
              }}
              aria-invalid={!!errors.password}
              className={cn(errors.password && 'border-danger focus-visible:border-danger focus-visible:ring-danger/20')}
            />
            {errors.password && (
              <p className="text-xs font-medium text-danger">{errors.password}</p>
            )}
          </div>

          {/* Remember me */}
          <div className="flex items-center gap-2.5">
            <Checkbox
              id="remember"
              checked={remember}
              onCheckedChange={(v) => setRemember(v === true)}
              className="size-4.5 rounded-md data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground"
            />
            <label htmlFor="remember" className="text-sm font-medium text-foreground cursor-pointer select-none">
              Remember me for 7 days
            </label>
          </div>

          <NexButton
            type="submit"
            className="w-full"
            size="lg"
            isLoading={isSubmitting}
            rightIcon={!isSubmitting ? <ArrowRight /> : undefined}
          >
            {isSubmitting ? 'Signing in…' : 'Sign in'}
          </NexButton>
        </form>
      </NexCard>

      <p className="text-center text-sm text-muted-foreground">
        Don't have an account?{' '}
        <Link to="/register" className="font-semibold text-primary hover:underline">
          Create one
        </Link>
      </p>
    </div>
  );
}
