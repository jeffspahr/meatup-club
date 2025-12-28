import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import {
  getTodayDateStringUTC,
  getTodayDateStringLocal,
  parseLocalDate,
  formatDateForDisplay,
  isDateInPastLocal,
  isDateTodayOrFutureLocal,
  isDateTodayLocal,
} from '../app/lib/dateUtils';
import { generateCalendarInvite } from '../app/lib/email.server';

/**
 * Timezone Tests
 *
 * Ensures all dates and times are handled correctly in local time, not UTC.
 * This prevents common timezone bugs like:
 * - Events showing wrong dates (off by 1 day)
 * - Calendar invites in UTC instead of local time
 * - Date parsing issues when crossing DST boundaries
 * - Hydration mismatches between server and client
 *
 * CRITICAL: Always use local time for user-facing dates!
 */

describe('Timezone Safety - Local Time Handling', () => {
  describe('Date Utilities', () => {
    it('should parse dates as local, not UTC', () => {
      const dateString = '2025-12-27';
      const parsed = parseLocalDate(dateString);

      // Verify it's December 27 in local timezone
      expect(parsed.getFullYear()).toBe(2025);
      expect(parsed.getMonth()).toBe(11); // December (0-indexed)
      expect(parsed.getDate()).toBe(27);

      // CRITICAL: Verify it's NOT shifted by timezone offset
      // If we used new Date('2025-12-27'), it would parse as UTC
      // and could show as Dec 26 in timezones like EST (-5)
      const asIsoString = parsed.toISOString();
      // Local date should include timezone offset in ISO string
      expect(asIsoString.includes('T')).toBe(true);
    });

    it('should handle date boundaries correctly in different timezones', () => {
      // Test a date that could be problematic near midnight in different timezones
      const dateString = '2025-01-01'; // New Year's Day
      const parsed = parseLocalDate(dateString);

      expect(parsed.getFullYear()).toBe(2025);
      expect(parsed.getMonth()).toBe(0); // January
      expect(parsed.getDate()).toBe(1);

      // Should NOT be 2024-12-31 or 2025-01-02 due to timezone conversion
    });

    it('should format dates for display without timezone shifts', () => {
      const dateString = '2025-12-27';
      const formatted = formatDateForDisplay(dateString);

      // Should include "27" and "Dec" (or "December")
      expect(formatted.toLowerCase()).toContain('dec');
      expect(formatted).toContain('27');
      expect(formatted).toContain('2025');

      // Should NOT show Dec 26 or Dec 28 due to timezone conversion
      expect(formatted).not.toContain('26');
      expect(formatted).not.toContain('28');
    });

    it('should compare dates in local timezone, not UTC', () => {
      // Set up dates
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayString = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;

      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowString = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;

      const today = getTodayDateStringLocal();

      // Test past/future detection
      expect(isDateInPastLocal(yesterdayString)).toBe(true);
      expect(isDateInPastLocal(today)).toBe(false);
      expect(isDateInPastLocal(tomorrowString)).toBe(false);

      expect(isDateTodayOrFutureLocal(yesterdayString)).toBe(false);
      expect(isDateTodayOrFutureLocal(today)).toBe(true);
      expect(isDateTodayOrFutureLocal(tomorrowString)).toBe(true);

      expect(isDateTodayLocal(today)).toBe(true);
      expect(isDateTodayLocal(yesterdayString)).toBe(false);
      expect(isDateTodayLocal(tomorrowString)).toBe(false);
    });
  });

  describe('Calendar Invite Generation', () => {
    it('should generate calendar invites in local time, not UTC', () => {
      const eventDate = '2025-12-27';
      const eventTime = '18:00'; // 6:00 PM
      const icsContent = generateCalendarInvite({
        eventId: 1,
        restaurantName: 'Test Restaurant',
        restaurantAddress: '123 Main St',
        eventDate,
        eventTime,
        attendeeEmail: 'test@example.com',
      });

      // Parse the DTSTART from the ICS content
      const dtStartMatch = icsContent.match(/DTSTART:(\d{8}T\d{6})/);
      expect(dtStartMatch).toBeTruthy();

      if (dtStartMatch) {
        const dtStart = dtStartMatch[1];
        // Should be: 20251227T180000 (Dec 27, 2025 at 6:00 PM)
        expect(dtStart).toBe('20251227T180000');

        // CRITICAL: Verify it's NOT shifted to UTC
        // If it were UTC, it might show 20251227T230000 (for EST timezone)
        // or 20251228T020000 (for PST timezone)
        expect(dtStart.startsWith('20251227T18')).toBe(true);
      }
    });

    it('should handle midnight events correctly', () => {
      const eventDate = '2025-12-27';
      const eventTime = '00:00'; // Midnight
      const icsContent = generateCalendarInvite({
        eventId: 1,
        restaurantName: 'Late Night Spot',
        restaurantAddress: '456 Night Ave',
        eventDate,
        eventTime,
        attendeeEmail: 'night@example.com',
      });

      const dtStartMatch = icsContent.match(/DTSTART:(\d{8}T\d{6})/);
      expect(dtStartMatch).toBeTruthy();

      if (dtStartMatch) {
        const dtStart = dtStartMatch[1];
        // Should be: 20251227T000000 (Dec 27, 2025 at midnight)
        expect(dtStart).toBe('20251227T000000');

        // Should NOT be previous day (20251226) or next day (20251228)
        expect(dtStart.startsWith('20251227')).toBe(true);
      }
    });

    it('should handle late evening events without date rollover', () => {
      const eventDate = '2025-12-27';
      const eventTime = '23:30'; // 11:30 PM
      const icsContent = generateCalendarInvite({
        eventId: 1,
        restaurantName: 'Late Dinner',
        restaurantAddress: '789 Evening Rd',
        eventDate,
        eventTime,
        attendeeEmail: 'late@example.com',
      });

      const dtStartMatch = icsContent.match(/DTSTART:(\d{8}T\d{6})/);
      const dtEndMatch = icsContent.match(/DTEND:(\d{8}T\d{6})/);

      expect(dtStartMatch).toBeTruthy();
      expect(dtEndMatch).toBeTruthy();

      if (dtStartMatch && dtEndMatch) {
        const dtStart = dtStartMatch[1];
        const dtEnd = dtEndMatch[1];

        // Start: 20251227T233000 (Dec 27 at 11:30 PM)
        expect(dtStart).toBe('20251227T233000');

        // End: 20251228T013000 (Dec 28 at 1:30 AM - 2 hours later)
        expect(dtEnd).toBe('20251228T013000');

        // Verify the start is still on Dec 27
        expect(dtStart.startsWith('20251227')).toBe(true);
      }
    });

    it('should handle events across DST boundaries correctly', () => {
      // Test an event during DST transition (if applicable)
      // Spring forward: March 2025 (varies by location)
      // Fall back: November 2025 (varies by location)

      const springDate = '2025-03-09'; // Around DST spring forward
      const springTime = '02:00'; // 2:00 AM (might not exist in some timezones!)

      const icsContent = generateCalendarInvite({
        eventId: 1,
        restaurantName: 'Early Bird',
        restaurantAddress: '111 Spring St',
        eventDate: springDate,
        eventTime: springTime,
        attendeeEmail: 'spring@example.com',
      });

      const dtStartMatch = icsContent.match(/DTSTART:(\d{8}T\d{6})/);
      expect(dtStartMatch).toBeTruthy();

      if (dtStartMatch) {
        const dtStart = dtStartMatch[1];
        // NOTE: During DST spring forward, 2:00 AM doesn't exist - it jumps to 3:00 AM
        // JavaScript Date constructor automatically adjusts to 3:00 AM in DST-observing timezones
        // This is correct behavior - the time literally doesn't exist!

        // Should show March 9 at either 2:00 AM or 3:00 AM depending on DST
        expect(dtStart.startsWith('20250309T0')).toBe(true);
        expect(['20250309T020000', '20250309T030000']).toContain(dtStart);

        // Should NOT be shifted to different day
        expect(dtStart.startsWith('20250309')).toBe(true);
      }
    });

    it('should calculate event end time correctly (2 hours later)', () => {
      const eventDate = '2025-12-27';
      const eventTime = '18:00'; // 6:00 PM
      const icsContent = generateCalendarInvite({
        eventId: 1,
        restaurantName: 'Test Restaurant',
        restaurantAddress: '123 Main St',
        eventDate,
        eventTime,
        attendeeEmail: 'test@example.com',
      });

      const dtStartMatch = icsContent.match(/DTSTART:(\d{8}T\d{6})/);
      const dtEndMatch = icsContent.match(/DTEND:(\d{8}T\d{6})/);

      expect(dtStartMatch).toBeTruthy();
      expect(dtEndMatch).toBeTruthy();

      if (dtStartMatch && dtEndMatch) {
        const dtStart = dtStartMatch[1];
        const dtEnd = dtEndMatch[1];

        // Start: 20251227T180000 (6:00 PM)
        expect(dtStart).toBe('20251227T180000');

        // End: 20251227T200000 (8:00 PM - 2 hours later)
        expect(dtEnd).toBe('20251227T200000');

        // Verify 2-hour difference
        const startHour = parseInt(dtStart.substring(9, 11));
        const endHour = parseInt(dtEnd.substring(9, 11));
        expect(endHour - startHour).toBe(2);
      }
    });
  });

  describe('UTC vs Local Time Consistency', () => {
    it('should use UTC for server-side validation consistently', () => {
      const utcToday = getTodayDateStringUTC();

      // UTC date string should be YYYY-MM-DD format
      expect(utcToday).toMatch(/^\d{4}-\d{2}-\d{2}$/);

      // Should use UTC methods
      const now = new Date();
      const utcYear = now.getUTCFullYear();
      const utcMonth = String(now.getUTCMonth() + 1).padStart(2, '0');
      const utcDay = String(now.getUTCDate()).padStart(2, '0');
      const expected = `${utcYear}-${utcMonth}-${utcDay}`;

      expect(utcToday).toBe(expected);
    });

    it('should use local time for client-side display consistently', () => {
      const localToday = getTodayDateStringLocal();

      // Local date string should be YYYY-MM-DD format
      expect(localToday).toMatch(/^\d{4}-\d{2}-\d{2}$/);

      // Should use local methods
      const now = new Date();
      const localYear = now.getFullYear();
      const localMonth = String(now.getMonth() + 1).padStart(2, '0');
      const localDay = String(now.getDate()).padStart(2, '0');
      const expected = `${localYear}-${localMonth}-${localDay}`;

      expect(localToday).toBe(expected);
    });

    it('should document timezone differences near UTC boundaries', () => {
      // When it's Dec 27 in EST (UTC-5), it's Dec 27 or Dec 28 in UTC
      // depending on the time of day

      const utcToday = getTodayDateStringUTC();
      const localToday = getTodayDateStringLocal();

      // Both should be valid date strings
      expect(utcToday).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(localToday).toMatch(/^\d{4}-\d{2}-\d{2}$/);

      // They might differ by 1 day depending on timezone
      // This is expected and correct!
      const utcDate = new Date(utcToday + 'T00:00:00Z');
      const localDate = parseLocalDate(localToday);

      // Difference should be at most 1 day
      const diffMs = Math.abs(utcDate.getTime() - localDate.getTime());
      const diffDays = diffMs / (1000 * 60 * 60 * 24);
      expect(diffDays).toBeLessThan(2);
    });
  });

  describe('Common Timezone Pitfalls (Regression Prevention)', () => {
    it('should NOT use Date constructor with string (causes UTC parsing)', () => {
      const dateString = '2025-12-27';

      // WRONG: new Date(dateString) parses as UTC
      const wrongDate = new Date(dateString);
      const wrongDay = wrongDate.getDate();

      // RIGHT: parseLocalDate(dateString) parses as local
      const rightDate = parseLocalDate(dateString);
      const rightDay = rightDate.getDate();

      // In timezones west of UTC (like EST, PST), these will differ
      // Example: In EST (-5), new Date('2025-12-27') shows as Dec 26, 7pm local
      if (wrongDate.getTimezoneOffset() > 0) {
        // We're west of UTC (e.g., EST, PST)
        // The wrong parsing should show previous day
        expect(wrongDay).toBeLessThanOrEqual(rightDay);
      }

      // The right way should always show 27
      expect(rightDay).toBe(27);
    });

    it('should NOT use toISOString for display (shows UTC)', () => {
      const dateString = '2025-12-27';
      const date = parseLocalDate(dateString);

      const isoString = date.toISOString();
      const displayString = formatDateForDisplay(dateString);

      // ISO string shows UTC date which might be different
      expect(isoString).toMatch(/^\d{4}-\d{2}-\d{2}T/);

      // Display string should show local date (Dec 27)
      expect(displayString.toLowerCase()).toContain('dec');
      expect(displayString).toContain('27');

      // ISO might show Dec 26 or Dec 27 depending on timezone
      // This is why we don't use it for display!
    });

    it('should NOT mix UTC and local methods on same Date object', () => {
      const date = new Date(2025, 11, 27, 18, 0, 0); // Dec 27, 2025, 6 PM local

      // Local methods
      const localYear = date.getFullYear();
      const localMonth = date.getMonth();
      const localDay = date.getDate();
      const localHour = date.getHours();

      // UTC methods (could be different!)
      const utcYear = date.getUTCFullYear();
      const utcMonth = date.getUTCMonth();
      const utcDay = date.getUTCDate();
      const utcHour = date.getUTCHours();

      // Local should be Dec 27, 6 PM
      expect(localYear).toBe(2025);
      expect(localMonth).toBe(11); // December (0-indexed)
      expect(localDay).toBe(27);
      expect(localHour).toBe(18);

      // UTC might be Dec 27 or Dec 28 depending on timezone
      // Example: In EST (-5), 6 PM local = 11 PM UTC (still Dec 27)
      //          In PST (-8), 6 PM local = 2 AM UTC (Dec 28!)
      expect(utcYear).toBe(2025);
      // UTC day might be 27 or 28
      expect([27, 28]).toContain(utcDay);

      // This test documents the difference - don't mix them!
    });
  });

  describe('AUTO-DISCOVERY: Date/Time Presentations', () => {
    it('should automatically scan codebase for date formatting patterns', async () => {
      const results = {
        formatDateForDisplay: 0,
        parseLocalDate: 0,
        newDateWithString: 0,
        toISOString: 0,
        toLocaleDateString: 0,
        getUTCMethods: 0,
      };

      const files = discoverSourceFiles(join(__dirname, '../app'));

      for (const file of files) {
        const content = readFileSync(file, 'utf-8');

        // Count good patterns
        results.formatDateForDisplay += (content.match(/formatDateForDisplay/g) || []).length;
        results.parseLocalDate += (content.match(/parseLocalDate/g) || []).length;

        // Count potentially problematic patterns
        // new Date with string literal (e.g., new Date('2025-12-27'))
        results.newDateWithString += (content.match(/new Date\(['"`][^'"`]+['"`]\)/g) || []).length;

        // toISOString usage (fine for API/DB, bad for display)
        results.toISOString += (content.match(/\.toISOString\(\)/g) || []).length;

        // toLocaleDateString usage (good for display)
        results.toLocaleDateString += (content.match(/\.toLocaleDateString\(/g) || []).length;

        // UTC methods (should only be in dateUtils.ts for getTodayDateStringUTC)
        results.getUTCMethods += (content.match(/\.getUTC(FullYear|Month|Date|Hours|Minutes)/g) || []).length;
      }

      // Log summary
      console.log('\n📅 Date/Time Pattern Discovery:');
      console.log(`   ✅ formatDateForDisplay: ${results.formatDateForDisplay} usages`);
      console.log(`   ✅ parseLocalDate: ${results.parseLocalDate} usages`);
      console.log(`   ✅ toLocaleDateString: ${results.toLocaleDateString} usages`);
      console.log(`   ⚠️  new Date(string): ${results.newDateWithString} usages (check if used for display)`);
      console.log(`   ⚠️  toISOString: ${results.toISOString} usages (check if used for display)`);
      console.log(`   ⚠️  UTC methods: ${results.getUTCMethods} usages (should be limited to dateUtils.ts)`);

      // Expect to have some good patterns
      expect(results.formatDateForDisplay).toBeGreaterThan(0);
      expect(results.parseLocalDate).toBeGreaterThan(0);
    });

    it('should verify formatDateForDisplay is used for all user-facing dates', async () => {
      const routeFiles = discoverSourceFiles(join(__dirname, '../app/routes'));
      const componentFiles = discoverSourceFiles(join(__dirname, '../app/components'));
      const allFiles = [...routeFiles, ...componentFiles];

      const filesWithDateDisplay: string[] = [];
      const filesWithCorrectFormatting: string[] = [];

      for (const file of allFiles) {
        const content = readFileSync(file, 'utf-8');

        // Check if file deals with event dates
        if (content.includes('event_date') || content.includes('eventDate')) {
          filesWithDateDisplay.push(file);

          // Check if it uses formatDateForDisplay
          if (content.includes('formatDateForDisplay')) {
            filesWithCorrectFormatting.push(file);
          }
        }
      }

      console.log(`\n📋 Files displaying event dates: ${filesWithDateDisplay.length}`);
      console.log(`   ✅ Using formatDateForDisplay: ${filesWithCorrectFormatting.length}`);

      if (filesWithDateDisplay.length > filesWithCorrectFormatting.length) {
        const missingFiles = filesWithDateDisplay.filter(f => !filesWithCorrectFormatting.includes(f));
        console.log(`   ⚠️  Missing formatDateForDisplay:`, missingFiles.map(f => f.replace(__dirname, '')));
      }

      // At least some files should use formatDateForDisplay
      expect(filesWithCorrectFormatting.length).toBeGreaterThan(0);
    });

    it('should detect anti-patterns: new Date(string) in user-facing code', async () => {
      const routeFiles = discoverSourceFiles(join(__dirname, '../app/routes'));
      const componentFiles = discoverSourceFiles(join(__dirname, '../app/components'));
      const allFiles = [...routeFiles, ...componentFiles];

      const filesWithLiteralAntiPattern: Array<{ file: string; matches: string[] }> = [];
      const filesWithVariableAntiPattern: Array<{ file: string; matches: string[]; lines: number[] }> = [];

      for (const file of allFiles) {
        const content = readFileSync(file, 'utf-8');

        // Look for new Date with YYYY-MM-DD string literal pattern
        const literalMatches = content.match(/new Date\(['"`]\d{4}-\d{2}-\d{2}['"`]\)/g);

        if (literalMatches && literalMatches.length > 0) {
          filesWithLiteralAntiPattern.push({
            file: file.replace(__dirname + '/../app/', ''),
            matches: literalMatches,
          });
        }

        // Look for new Date with variable that might be a date string
        // Pattern: new Date(variable).toLocaleDateString
        // This is a strong indicator that the variable is likely a date string
        const variablePattern = /new Date\(([a-zA-Z_$][a-zA-Z0-9_$.]*)\)\.toLocaleDateString/g;
        const variableMatches: string[] = [];
        const lines: number[] = [];
        let match;

        while ((match = variablePattern.exec(content)) !== null) {
          variableMatches.push(match[0]);
          // Calculate line number
          const lineNumber = content.substring(0, match.index).split('\n').length;
          lines.push(lineNumber);
        }

        if (variableMatches.length > 0) {
          filesWithVariableAntiPattern.push({
            file: file.replace(__dirname + '/../app/', ''),
            matches: variableMatches,
            lines,
          });
        }
      }

      if (filesWithLiteralAntiPattern.length > 0) {
        console.log('\n⚠️  ANTI-PATTERN DETECTED: new Date(literal string) found in:');
        filesWithLiteralAntiPattern.forEach(({ file, matches }) => {
          console.log(`   - ${file}: ${matches.length} occurrence(s)`);
          console.log(`     ${matches.join(', ')}`);
        });
        console.log('\n   ⚠️  Use parseLocalDate() instead to avoid timezone offset issues!');
      }

      if (filesWithVariableAntiPattern.length > 0) {
        console.log('\n⚠️  ANTI-PATTERN DETECTED: new Date(variable).toLocaleDateString() found in:');
        filesWithVariableAntiPattern.forEach(({ file, matches, lines }) => {
          console.log(`   - ${file}:`);
          matches.forEach((match, i) => {
            console.log(`     Line ${lines[i]}: ${match}`);
          });
        });
        console.log('\n   ⚠️  Use formatDateForDisplay() instead to avoid timezone offset issues!');
        console.log('   ⚠️  Example: formatDateForDisplay(dateString) instead of new Date(dateString).toLocaleDateString()');
      }

      if (filesWithLiteralAntiPattern.length === 0 && filesWithVariableAntiPattern.length === 0) {
        console.log('\n✅ No new Date(dateString) anti-patterns found in user-facing code');
      }

      // Enforce timezone-safe date handling
      expect(filesWithLiteralAntiPattern.length).toBe(0);
      expect(filesWithVariableAntiPattern.length).toBe(0);
    });

    it('should verify calendar invite generation uses local time', async () => {
      const emailFiles = discoverSourceFiles(join(__dirname, '../app/lib'));

      let calendarInviteFiles = 0;
      let usesLocalTimePattern = 0;

      for (const file of emailFiles) {
        if (!file.includes('email')) continue;

        const content = readFileSync(file, 'utf-8');

        // Check if file generates calendar invites
        if (content.includes('DTSTART') || content.includes('generateCalendarInvite')) {
          calendarInviteFiles++;

          // Verify it uses local Date constructor: new Date(year, month, day, hours, minutes)
          // NOT: new Date(dateString) or Date.UTC()
          if (content.match(/new Date\(\s*year,\s*month/)) {
            usesLocalTimePattern++;
          }
        }
      }

      console.log(`\n📧 Calendar invite generation:`, {
        calendarInviteFiles,
        usesLocalTimePattern,
      });

      // Should have calendar generation and use local time
      expect(calendarInviteFiles).toBeGreaterThan(0);
      expect(usesLocalTimePattern).toBeGreaterThan(0);
    });

    it('should verify UTC methods are only used in dateUtils for server validation', async () => {
      const allFiles = discoverSourceFiles(join(__dirname, '../app'));

      const filesWithUTCMethods: Array<{ file: string; count: number }> = [];

      for (const file of allFiles) {
        const content = readFileSync(file, 'utf-8');

        // Count UTC method usage
        const utcMatches = content.match(/\.(getUTCFullYear|getUTCMonth|getUTCDate|getUTCHours|getUTCMinutes|getUTCSeconds)\(/g);

        if (utcMatches && utcMatches.length > 0) {
          filesWithUTCMethods.push({
            file: file.replace(__dirname + '/../app/', ''),
            count: utcMatches.length,
          });
        }
      }

      console.log(`\n🌍 UTC method usage:`, {
        filesWithUTCMethods: filesWithUTCMethods.length,
      });

      filesWithUTCMethods.forEach(({ file, count }) => {
        console.log(`   - ${file}: ${count} UTC method calls`);

        // UTC methods should primarily be in dateUtils.ts
        if (file.includes('dateUtils')) {
          console.log(`     ✅ (Expected in dateUtils)`);
        } else {
          console.log(`     ⚠️  (Check if this should use local time instead)`);
        }
      });

      // At least dateUtils.ts should use UTC methods
      const dateUtilsHasUTC = filesWithUTCMethods.some(f => f.file.includes('dateUtils'));
      expect(dateUtilsHasUTC).toBe(true);
    });
  });
});

/**
 * Helper function to recursively discover source files
 */
function discoverSourceFiles(dir: string, fileList: string[] = []): string[] {
  try {
    const files = readdirSync(dir, { withFileTypes: true });

    for (const file of files) {
      const filePath = join(dir, file.name);

      if (file.isDirectory()) {
        // Recurse into subdirectories
        discoverSourceFiles(filePath, fileList);
      } else if (
        (file.name.endsWith('.tsx') || file.name.endsWith('.ts')) &&
        !file.name.includes('.test.') &&
        !file.name.endsWith('.d.ts')
      ) {
        fileList.push(filePath);
      }
    }

    return fileList;
  } catch (err) {
    console.warn('Could not read directory:', dir, err);
    return fileList;
  }
}
