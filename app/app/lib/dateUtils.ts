/**
 * Date utilities that avoid timezone issues by working with YYYY-MM-DD strings
 * instead of Date objects when comparing dates.
 */

/**
 * Get today's date as a YYYY-MM-DD string in the local timezone.
 * This ensures consistent date comparisons across the application.
 */
export function getTodayDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Get a date string from year, month, and day components.
 */
export function getDateString(year: number, month: number, day: number): string {
  const monthStr = String(month + 1).padStart(2, '0');
  const dayStr = String(day).padStart(2, '0');
  return `${year}-${monthStr}-${dayStr}`;
}

/**
 * Check if a date string (YYYY-MM-DD) is in the past.
 * Returns true if the date is before today, false otherwise.
 */
export function isDateInPast(dateString: string): boolean {
  const today = getTodayDateString();
  return dateString < today;
}

/**
 * Check if a date string (YYYY-MM-DD) is today or in the future.
 * Returns true if the date is today or after today, false otherwise.
 */
export function isDateTodayOrFuture(dateString: string): boolean {
  const today = getTodayDateString();
  return dateString >= today;
}
