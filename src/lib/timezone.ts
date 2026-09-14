export const BUSINESS_TIMEZONE = 'America/New_York';

/**
 * Returns the current calendar date in America/New_York as a YYYY-MM-DD string.
 * Uses Intl.DateTimeFormat to avoid relying on the browser's local timezone.
 */
export function etDateStr(date: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/**
 * Returns true if the given ISO date string (YYYY-MM-DD or full ISO timestamp)
 * falls on the same America/New_York calendar day as "today".
 */
export function isSameEtDay(isoDate: string | null): boolean {
  if (!isoDate) return false;
  const inputDate = isoDate.slice(0, 10);
  return inputDate === etDateStr();
}
