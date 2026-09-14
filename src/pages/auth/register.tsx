import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Mail,
  Lock,
  User,
  Phone,
  ArrowRight,
  Eye,
  EyeOff,
  AlertCircle,
  Ticket,
  CheckCircle2,
  PartyPopper,
} from 'lucide-react';
import { toast } from 'sonner';
import { NexButton } from '@/components/ui/nex-button';
import { NexInput } from '@/components/ui/nex-input';
import { NexCard } from '@/components/ui/nex-card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { PasswordStrengthIndicator } from '@/components/auth/password-strength-indicator';
import { useAuth, countries, defaultCountry } from '@/lib/auth';
import {
  validateName,
  validateEmail,
  validatePhone,
  validatePassword,
  validateConfirmPassword,
  validateInvitationCode,
} from '@/lib/auth/validation';
import { cn } from '@/lib/utils';

interface FieldErrors {
  fullName?: string;
  email?: string;
  phone?: string;
  password?: string;
  confirmPassword?: string;
  invitationCode?: string;
  terms?: string;
}

export function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [countryCode, setCountryCode] = useState(defaultCountry.code);
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [invitationCode, setInvitationCode] = useState('');
  const [agreedTerms, setAgreedTerms] = useState(false);

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  function validate(): boolean {
    const next: FieldErrors = {};
    const nameCheck = validateName(fullName);
    const emailCheck = validateEmail(email);
    const phoneCheck = validatePhone(phone);
    const passwordCheck = validatePassword(password);
    const confirmCheck = validateConfirmPassword(password, confirmPassword);
    const inviteCheck = validateInvitationCode(invitationCode);

    if (!nameCheck.valid) next.fullName = nameCheck.message;
    if (!emailCheck.valid) next.email = emailCheck.message;
    if (!phoneCheck.valid) next.phone = phoneCheck.message;
    if (!passwordCheck.valid) next.password = passwordCheck.message;
    if (!confirmCheck.valid) next.confirmPassword = confirmCheck.message;
    if (!inviteCheck.valid) next.invitationCode = inviteCheck.message;
    if (!agreedTerms) next.terms = 'You must agree to the Terms to continue';

    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError('');
    if (!validate()) return;

    setIsSubmitting(true);
    try {
      const fullPhone = `${countryCode} ${phone}`.trim();
      const profile = await register({
        fullName,
        email,
        phone: fullPhone,
        password,
        invitationCode,
      });
      setSuccess(true);
      toast.success('Account created!', {
        description: `Welcome to Hawksem, ${profile.fullName.split(' ')[0]}`,
      });
      // Brief success state, then redirect
      setTimeout(() => {
        navigate('/home', { replace: true });
      }, 1600);
    } catch (err) {
      // Supabase PostgrestError is a plain object, not an Error instance — extract the real message
      const message =
        err instanceof Error
          ? err.message
          : typeof err === 'object' && err !== null && 'message' in err
            ? String((err as { message: unknown }).message)
            : 'Unable to create account. Please try again.';
      setFormError(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  if (success) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4 }}
      >
        <NexCard className="overflow-hidden">
          <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
            <motion.div
              initial={{ scale: 0, rotate: -12 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 260, damping: 18, delay: 0.1 }}
              className="mb-5 flex size-20 items-center justify-center rounded-2xl bg-gradient-to-br from-success to-success/70 text-white shadow-[0_8px_24px_-4px_hsl(var(--success)/0.5)]"
            >
              <PartyPopper className="size-9" />
            </motion.div>
            <h2 className="text-xl font-bold tracking-tight text-foreground">
              Account created!
            </h2>
            <p className="mt-2 max-w-xs text-sm leading-relaxed text-muted-foreground">
              Welcome to Hawksem. Your account is ready — taking you to your dashboard…
            </p>
            <div className="mt-6 flex items-center gap-2 text-sm font-medium text-primary">
              <span className="size-2 animate-pulse rounded-full bg-primary" />
              Redirecting…
            </div>
          </div>
        </NexCard>
      </motion.div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Create your account
        </h1>
        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
          Join Hawksem and start building a stronger digital presence.
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

          {/* Full name */}
          <div className="space-y-1.5">
            <label htmlFor="fullName" className="text-sm font-semibold text-foreground">
              Full name
            </label>
            <NexInput
              id="fullName"
              type="text"
              placeholder="Jane Doe"
              leftIcon={<User />}
              autoComplete="name"
              value={fullName}
              onChange={(e) => {
                setFullName(e.target.value);
                if (errors.fullName) setErrors((p) => ({ ...p, fullName: undefined }));
              }}
              aria-invalid={!!errors.fullName}
              className={cn(errors.fullName && 'border-danger focus-visible:border-danger focus-visible:ring-danger/20')}
            />
            {errors.fullName && (
              <p className="text-xs font-medium text-danger">{errors.fullName}</p>
            )}
          </div>

          {/* Email */}
          <div className="space-y-1.5">
            <label htmlFor="reg-email" className="text-sm font-semibold text-foreground">
              Email address
            </label>
            <NexInput
              id="reg-email"
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

          {/* Phone with country code selector */}
          <div className="space-y-1.5">
            <label htmlFor="phone" className="text-sm font-semibold text-foreground">
              Phone number
            </label>
            <div className="flex gap-2">
              <Select value={countryCode} onValueChange={setCountryCode}>
                <SelectTrigger
                  className="h-12 w-[110px] shrink-0 rounded-xl border-input bg-card font-medium shadow-sm"
                  aria-label="Country code"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {countries.map((c) => (
                    <SelectItem key={c.iso + c.code} value={c.code}>
                      <span className="mr-2">{c.flag}</span>
                      <span className="font-medium">{c.code}</span>
                      <span className="ml-2 text-muted-foreground">{c.name}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <NexInput
                id="phone"
                type="tel"
                placeholder="555 0182"
                leftIcon={<Phone />}
                autoComplete="tel"
                value={phone}
                onChange={(e) => {
                  setPhone(e.target.value);
                  if (errors.phone) setErrors((p) => ({ ...p, phone: undefined }));
                }}
                aria-invalid={!!errors.phone}
                className={cn('flex-1', errors.phone && 'border-danger focus-visible:border-danger focus-visible:ring-danger/20')}
                containerClassName="flex-1"
              />
            </div>
            {errors.phone && (
              <p className="text-xs font-medium text-danger">{errors.phone}</p>
            )}
          </div>

          {/* Password */}
          <div className="space-y-1.5">
            <label htmlFor="reg-password" className="text-sm font-semibold text-foreground">
              Password
            </label>
            <NexInput
              id="reg-password"
              type={showPassword ? 'text' : 'password'}
              placeholder="At least 8 characters"
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
              autoComplete="new-password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (errors.password) setErrors((p) => ({ ...p, password: undefined }));
              }}
              aria-invalid={!!errors.password}
              className={cn(errors.password && 'border-danger focus-visible:border-danger focus-visible:ring-danger/20')}
            />
            {errors.password ? (
              <p className="text-xs font-medium text-danger">{errors.password}</p>
            ) : (
              <PasswordStrengthIndicator password={password} />
            )}
          </div>

          {/* Confirm password */}
          <div className="space-y-1.5">
            <label htmlFor="confirmPassword" className="text-sm font-semibold text-foreground">
              Confirm password
            </label>
            <NexInput
              id="confirmPassword"
              type={showConfirm ? 'text' : 'password'}
              placeholder="Re-enter your password"
              leftIcon={<Lock />}
              rightIcon={
                <button
                  type="button"
                  onClick={() => setShowConfirm((s) => !s)}
                  className="pointer-events-auto text-muted-foreground hover:text-foreground"
                  aria-label={showConfirm ? 'Hide password' : 'Show password'}
                >
                  {showConfirm ? <EyeOff /> : <Eye />}
                </button>
              }
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => {
                setConfirmPassword(e.target.value);
                if (errors.confirmPassword)
                  setErrors((p) => ({ ...p, confirmPassword: undefined }));
              }}
              aria-invalid={!!errors.confirmPassword}
              className={cn(
                errors.confirmPassword && 'border-danger focus-visible:border-danger focus-visible:ring-danger/20',
                !errors.confirmPassword && confirmPassword && confirmPassword === password && 'border-success'
              )}
            />
            {errors.confirmPassword ? (
              <p className="text-xs font-medium text-danger">{errors.confirmPassword}</p>
            ) : (
              confirmPassword &&
              confirmPassword === password && (
                <p className="flex items-center gap-1.5 text-xs font-medium text-success">
                  <CheckCircle2 className="size-3.5" />
                  Passwords match
                </p>
              )
            )}
          </div>

          {/* Invitation code */}
          <div className="space-y-1.5">
            <label htmlFor="invitationCode" className="text-sm font-semibold text-foreground">
              Invitation code
              <span className="ml-1.5 rounded bg-danger/10 px-1.5 py-0.5 text-[10px] font-bold uppercase text-danger">
                Required
              </span>
            </label>
            <NexInput
              id="invitationCode"
              type="text"
              placeholder="NEX-XXXXXX"
              leftIcon={<Ticket />}
              value={invitationCode}
              onChange={(e) => {
                setInvitationCode(e.target.value.toUpperCase());
                if (errors.invitationCode)
                  setErrors((p) => ({ ...p, invitationCode: undefined }));
              }}
              aria-invalid={!!errors.invitationCode}
              className={cn(
                errors.invitationCode && 'border-danger focus-visible:border-danger focus-visible:ring-danger/20'
              )}
            />
            {errors.invitationCode && (
              <p className="text-xs font-medium text-danger">{errors.invitationCode}</p>
            )}
          </div>

          {/* Terms checkbox */}
          <div className="space-y-1.5">
            <div className="flex items-start gap-2.5">
              <Checkbox
                id="terms"
                checked={agreedTerms}
                onCheckedChange={(v) => {
                  setAgreedTerms(v === true);
                  if (errors.terms) setErrors((p) => ({ ...p, terms: undefined }));
                }}
                className="mt-0.5 size-4.5 rounded-md data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground"
              />
              <label htmlFor="terms" className="text-sm leading-relaxed text-muted-foreground cursor-pointer select-none">
                I agree to Hawksem's{' '}
                <span className="font-medium text-primary">Terms of Service</span> and{' '}
                <span className="font-medium text-primary">Privacy Policy</span>
              </label>
            </div>
            {errors.terms && (
              <p className="text-xs font-medium text-danger">{errors.terms}</p>
            )}
          </div>

          <NexButton
            type="submit"
            className="w-full"
            size="lg"
            isLoading={isSubmitting}
            rightIcon={!isSubmitting ? <ArrowRight /> : undefined}
          >
            {isSubmitting ? 'Creating account…' : 'Create account'}
          </NexButton>
        </form>
      </NexCard>

      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{' '}
        <Link to="/login" className="font-semibold text-primary hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
