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
