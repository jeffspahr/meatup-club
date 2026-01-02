/**
 * Date utilities for Meatup.Club
 *
 * Server-side (UTC): Used for validation and data consistency
 * Client-side (Local): Used for user-facing display and interaction
 */

/**
 * SERVER-SIDE UTILITIES (UTC)
 * Use these for data validation and consistency checks
 */

const DEFAULT_APP_TIMEZONE = 'UTC';

/**
 * Get the app's configured timezone or fall back to UTC.
 */
export function getAppTimeZone(timeZone?: string): string {
  const trimmed = timeZone?.trim();
  return trimmed ? trimmed : DEFAULT_APP_TIMEZONE;
}

/**
 * Get today's date as a YYYY-MM-DD string in a specific timezone.
 * Useful for server-side comparisons when dates represent a local calendar day.
 */
export function getTodayDateStringInTimeZone(timeZone: string): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(new Date());
}

/**
 * Check if a date string (YYYY-MM-DD) is in the past for a specific timezone.
 */
export function isDateInPastInTimeZone(dateString: string, timeZone: string): boolean {
  const today = getTodayDateStringInTimeZone(timeZone);
  return dateString < today;
}

/**
 * Check if a date string (YYYY-MM-DD) is today or in the future for a specific timezone.
 */
export function isDateTodayOrFutureInTimeZone(dateString: string, timeZone: string): boolean {
  const today = getTodayDateStringInTimeZone(timeZone);
  return dateString >= today;
}

/**
 * Get today's date as a YYYY-MM-DD string in UTC timezone.
 * Use this for server-side validation only.
 */
export function getTodayDateStringUTC(): string {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const day = String(now.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Check if a date string (YYYY-MM-DD) is in the past (UTC).
 * Use this for server-side validation only.
 */
export function isDateInPastUTC(dateString: string): boolean {
  const today = getTodayDateStringUTC();
  return dateString < today;
}

/**
 * Check if a date string (YYYY-MM-DD) is today or in the future (UTC).
 * Use this for server-side validation only.
 */
export function isDateTodayOrFutureUTC(dateString: string): boolean {
  const today = getTodayDateStringUTC();
  return dateString >= today;
}

/**
 * CLIENT-SIDE UTILITIES (Local Timezone)
 * Use these for user-facing display and interaction
 */

/**
 * Get today's date as a YYYY-MM-DD string in the user's local timezone.
 * Use this for client-side display and interaction only.
 */
export function getTodayDateStringLocal(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Get a date string from year, month, and day components (local timezone).
 */
export function getDateString(year: number, month: number, day: number): string {
  const monthStr = String(month + 1).padStart(2, '0');
  const dayStr = String(day).padStart(2, '0');
  return `${year}-${monthStr}-${dayStr}`;
}

/**
 * Check if a date string (YYYY-MM-DD) is in the past (local timezone).
 * Use this for client-side display only.
 */
export function isDateInPastLocal(dateString: string): boolean {
  const today = getTodayDateStringLocal();
  return dateString < today;
}

/**
 * Check if a date string (YYYY-MM-DD) is today or in the future (local timezone).
 * Use this for client-side display only.
 */
export function isDateTodayOrFutureLocal(dateString: string): boolean {
  const today = getTodayDateStringLocal();
  return dateString >= today;
}

/**
 * Check if a date string (YYYY-MM-DD) is today (local timezone).
 */
export function isDateTodayLocal(dateString: string): boolean {
  const today = getTodayDateStringLocal();
  return dateString === today;
}

/**
 * Parse a YYYY-MM-DD date string as a local date (not UTC).
 * This prevents timezone offset issues when displaying dates.
 *
 * Example: "2025-12-27" becomes Dec 27 in all timezones, not Dec 26 in EST.
 */
export function parseLocalDate(dateString: string): Date {
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/**
 * Format a date string (YYYY-MM-DD) for display in the user's locale.
 * Handles timezone correctly by parsing as local date first.
 */
export function formatDateForDisplay(
  dateString: string,
  options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' }
): string {
  return parseLocalDate(dateString).toLocaleDateString('en-US', options);
}

/**
 * Format a time string (HH:mm) for display in the user's locale.
 */
export function formatTimeForDisplay(
  timeString: string,
  options: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit' }
): string {
  return new Date(`2000-01-01T${timeString}`).toLocaleTimeString('en-US', options);
}

/**
 * Format a datetime string (e.g. YYYY-MM-DD HH:mm:ss) for display.
 * Assumes bare timestamps are UTC, then renders in the user's locale.
 */
export function formatDateTimeForDisplay(
  dateTimeString: string,
  options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' }
): string {
  if (!dateTimeString) {
    return '';
  }

  const trimmed = dateTimeString.trim();
  const isBareTimestamp = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(trimmed);
  const normalized = isBareTimestamp ? trimmed.replace(' ', 'T') + 'Z' : trimmed;
  const date = new Date(normalized);
  return date.toLocaleDateString('en-US', options);
}

/**
 * BACKWARDS COMPATIBILITY (deprecated - will be removed)
 * These use UTC on server, local on client - causes hydration issues
 */

/** @deprecated Use getTodayDateStringUTC for server or getTodayDateStringLocal for client */
export function getTodayDateString(): string {
  return getTodayDateStringLocal();
}

/** @deprecated Use isDateInPastUTC for server or isDateInPastLocal for client */
export function isDateInPast(dateString: string): boolean {
  return isDateInPastLocal(dateString);
}

/** @deprecated Use isDateTodayOrFutureUTC for server or isDateTodayOrFutureLocal for client */
export function isDateTodayOrFuture(dateString: string): boolean {
  return isDateTodayOrFutureLocal(dateString);
}
