export type ValidationResult = { valid: boolean; message?: string };

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phoneDigitsRegex = /^\d{6,14}$/;

export function validateEmail(email: string): ValidationResult {
  if (!email.trim()) return { valid: false, message: 'Email is required' };
  if (!emailRegex.test(email))
    return { valid: false, message: 'Enter a valid email address' };
  return { valid: true };
}

export function validatePassword(password: string): ValidationResult {
  if (!password) return { valid: false, message: 'Password is required' };
  if (password.length < 8)
    return { valid: false, message: 'Password must be at least 8 characters' };
  if (!/[A-Za-z]/.test(password))
    return { valid: false, message: 'Include at least one letter' };
  if (!/\d/.test(password))
    return { valid: false, message: 'Include at least one number' };
  return { valid: true };
}

export function validateConfirmPassword(
  password: string,
  confirm: string
): ValidationResult {
  if (!confirm) return { valid: false, message: 'Please confirm your password' };
  if (password !== confirm)
    return { valid: false, message: 'Passwords do not match' };
  return { valid: true };
}

export function validateName(name: string): ValidationResult {
  if (!name.trim()) return { valid: false, message: 'Full name is required' };
  if (name.trim().length < 2)
    return { valid: false, message: 'Name is too short' };
  return { valid: true };
}

export function validatePhone(phone: string): ValidationResult {
  const digits = phone.replace(/\D/g, '');
  if (!digits) return { valid: false, message: 'Phone number is required' };
  if (!phoneDigitsRegex.test(digits))
    return { valid: false, message: 'Enter a valid phone number (6–14 digits)' };
  return { valid: true };
}

export function validateInvitationCode(code: string): ValidationResult {
  if (!code.trim()) return { valid: false, message: 'Invitation code is required' };
  if (code.trim().length < 6)
    return { valid: false, message: 'Code must be at least 6 characters' };
  return { valid: true };
}

export type PasswordStrength = {
  score: 0 | 1 | 2 | 3 | 4;
  label: string;
  color: string;
  checks: { label: string; passed: boolean }[];
};

export function getPasswordStrength(password: string): PasswordStrength {
  const checks = [
    { label: 'At least 8 characters', passed: password.length >= 8 },
    { label: 'Contains a letter', passed: /[A-Za-z]/.test(password) },
    { label: 'Contains a number', passed: /\d/.test(password) },
    { label: 'Contains a symbol', passed: /[^A-Za-z0-9]/.test(password) },
    { label: 'Upper & lowercase', passed: /[A-Z]/.test(password) && /[a-z]/.test(password) },
  ];

  const passedCount = checks.filter((c) => c.passed).length;
  const score = Math.min(4, Math.floor((passedCount / checks.length) * 4)) as 0 | 1 | 2 | 3 | 4;

  const map = [
    { label: 'Very weak', color: 'bg-danger' },
    { label: 'Weak', color: 'bg-danger' },
    { label: 'Fair', color: 'bg-warning' },
    { label: 'Good', color: 'bg-success' },
    { label: 'Strong', color: 'bg-success' },
  ];

  return { score, ...map[score], checks };
}
