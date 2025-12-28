import { describe, it, expect } from 'vitest';
import { generateCalendarInvite } from './email.server';

/**
 * Tests for calendar invite generation
 * Critical for ensuring calendar apps can properly parse our invites
 */
describe('Calendar Invite Generation', () => {

  describe('RFC 5545 Compliance', () => {
    it('should generate valid iCalendar structure', () => {
      const ics = generateCalendarInvite({
        eventId: 1,
        restaurantName: 'Test Steakhouse',
        restaurantAddress: '123 Main St',
        eventDate: '2025-01-15',
        eventTime: '18:00',
        attendeeEmail: 'user@example.com',
      });

      expect(ics).toContain('BEGIN:VCALENDAR');
      expect(ics).toContain('VERSION:2.0');
      expect(ics).toContain('BEGIN:VEVENT');
      expect(ics).toContain('END:VEVENT');
      expect(ics).toContain('END:VCALENDAR');
    });

    it('should use correct line endings (CRLF)', () => {
      const ics = generateCalendarInvite({
        eventId: 1,
        restaurantName: 'Test Steakhouse',
        restaurantAddress: '123 Main St',
        eventDate: '2025-01-15',
        attendeeEmail: 'user@example.com',
      });

      expect(ics).toContain('\r\n');
      expect(ics.split('\r\n').length).toBeGreaterThan(10);
    });

    it('should include required iCalendar properties', () => {
      const ics = generateCalendarInvite({
        eventId: 1,
        restaurantName: 'Test Steakhouse',
        restaurantAddress: '123 Main St',
        eventDate: '2025-01-15',
        attendeeEmail: 'user@example.com',
      });

      expect(ics).toContain('PRODID:');
      expect(ics).toContain('METHOD:REQUEST');
      expect(ics).toContain('UID:');
      expect(ics).toContain('DTSTART:');
      expect(ics).toContain('DTEND:');
      expect(ics).toContain('SUMMARY:');
    });
  });

  describe('UID Generation', () => {
    it('should generate stable UID without timestamp', () => {
      const ics = generateCalendarInvite({
        eventId: 123,
        restaurantName: 'Test Steakhouse',
        restaurantAddress: '123 Main St',
        eventDate: '2025-01-15',
        attendeeEmail: 'user@example.com',
      });

      expect(ics).toContain('UID:event-123@meatup.club');
      expect(ics).not.toMatch(/UID:event-123-\d+@meatup.club/);
    });

    it('should generate unique UIDs for different events', () => {
      const ics1 = generateCalendarInvite({
        eventId: 1,
        restaurantName: 'Restaurant A',
        restaurantAddress: '123 Main St',
        eventDate: '2025-01-15',
        attendeeEmail: 'user@example.com',
      });

      const ics2 = generateCalendarInvite({
        eventId: 2,
        restaurantName: 'Restaurant B',
        restaurantAddress: '456 Oak Ave',
        eventDate: '2025-01-15',
        attendeeEmail: 'user@example.com',
      });

      expect(ics1).toContain('UID:event-1@meatup.club');
      expect(ics2).toContain('UID:event-2@meatup.club');
    });
  });

  describe('Date/Time Formatting', () => {
    it('should format dates in local time ISO format', () => {
      const ics = generateCalendarInvite({
        eventId: 1,
        restaurantName: 'Test Steakhouse',
        restaurantAddress: '123 Main St',
        eventDate: '2025-01-15',
        eventTime: '18:00',
        attendeeEmail: 'user@example.com',
      });

      // Should match YYYYMMDDTHHMMSS format (local time, no Z)
      expect(ics).toMatch(/DTSTART:\d{8}T\d{6}[^Z]/);
      expect(ics).toMatch(/DTEND:\d{8}T\d{6}[^Z]/);
    });

    it('should set event duration to 2 hours', () => {
      const ics = generateCalendarInvite({
        eventId: 1,
        restaurantName: 'Test Steakhouse',
        restaurantAddress: '123 Main St',
        eventDate: '2025-01-15',
        eventTime: '18:00',
        attendeeEmail: 'user@example.com',
      });

      const startMatch = ics.match(/DTSTART:(\d{8}T\d{6})/);
      const endMatch = ics.match(/DTEND:(\d{8}T\d{6})/);

      expect(startMatch).toBeTruthy();
      expect(endMatch).toBeTruthy();

      // Parse dates and check duration
      const start = new Date(
        startMatch![1].replace(/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/, '$1-$2-$3T$4:$5:$6')
      );
      const end = new Date(
        endMatch![1].replace(/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/, '$1-$2-$3T$4:$5:$6')
      );

      const durationHours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
      expect(durationHours).toBe(2);
    });

    it('should handle custom event times', () => {
      const ics = generateCalendarInvite({
        eventId: 1,
        restaurantName: 'Test Steakhouse',
        restaurantAddress: '123 Main St',
        eventDate: '2025-01-15',
        eventTime: '19:30',
        attendeeEmail: 'user@example.com',
      });

      expect(ics).toContain('T1930');
    });
  });

  describe('Event Details', () => {
    it('should include restaurant name in summary', () => {
      const ics = generateCalendarInvite({
        eventId: 1,
        restaurantName: 'Prime Steakhouse',
        restaurantAddress: '123 Main St',
        eventDate: '2025-01-15',
        attendeeEmail: 'user@example.com',
      });

      expect(ics).toContain('SUMMARY:Meatup.Club - Prime Steakhouse');
    });

    it('should include restaurant name and address in location', () => {
      const ics = generateCalendarInvite({
        eventId: 1,
        restaurantName: 'Prime Steakhouse',
        restaurantAddress: '123 Main St, City, State',
        eventDate: '2025-01-15',
        attendeeEmail: 'user@example.com',
      });

      expect(ics).toContain('LOCATION:Prime Steakhouse, 123 Main St, City, State');
    });

    it('should fallback to restaurant name when address is null', () => {
      const ics = generateCalendarInvite({
        eventId: 1,
        restaurantName: 'Prime Steakhouse',
        restaurantAddress: null,
        eventDate: '2025-01-15',
        attendeeEmail: 'user@example.com',
      });

      expect(ics).toContain('LOCATION:Prime Steakhouse');
    });

    it('should set SEQUENCE to 0 for original invite', () => {
      const ics = generateCalendarInvite({
        eventId: 1,
        restaurantName: 'Test Steakhouse',
        restaurantAddress: '123 Main St',
        eventDate: '2025-01-15',
        attendeeEmail: 'user@example.com',
      });

      expect(ics).toContain('SEQUENCE:0');
    });

    it('should set STATUS to CONFIRMED', () => {
      const ics = generateCalendarInvite({
        eventId: 1,
        restaurantName: 'Test Steakhouse',
        restaurantAddress: '123 Main St',
        eventDate: '2025-01-15',
        attendeeEmail: 'user@example.com',
      });

      expect(ics).toContain('STATUS:CONFIRMED');
    });
  });

  describe('Attendee Configuration', () => {
    it('should include attendee email', () => {
      const ics = generateCalendarInvite({
        eventId: 1,
        restaurantName: 'Test Steakhouse',
        restaurantAddress: '123 Main St',
        eventDate: '2025-01-15',
        attendeeEmail: 'john@example.com',
      });

      expect(ics).toContain('ATTENDEE');
      expect(ics).toContain('mailto:john@example.com');
    });

    it('should set PARTSTAT to NEEDS-ACTION for new invite', () => {
      const ics = generateCalendarInvite({
        eventId: 1,
        restaurantName: 'Test Steakhouse',
        restaurantAddress: '123 Main St',
        eventDate: '2025-01-15',
        attendeeEmail: 'user@example.com',
      });

      expect(ics).toContain('PARTSTAT=NEEDS-ACTION');
    });

    it('should set RSVP=TRUE to request response', () => {
      const ics = generateCalendarInvite({
        eventId: 1,
        restaurantName: 'Test Steakhouse',
        restaurantAddress: '123 Main St',
        eventDate: '2025-01-15',
        attendeeEmail: 'user@example.com',
      });

      expect(ics).toContain('RSVP=TRUE');
    });

    it('should set organizer to rsvp@mail.meatup.club', () => {
      const ics = generateCalendarInvite({
        eventId: 1,
        restaurantName: 'Test Steakhouse',
        restaurantAddress: '123 Main St',
        eventDate: '2025-01-15',
        attendeeEmail: 'user@example.com',
      });

      expect(ics).toContain('ORGANIZER;CN=Meatup.Club:mailto:rsvp@mail.meatup.club');
    });
  });

  describe('Reminder Alarm', () => {
    it('should include 24-hour reminder alarm', () => {
      const ics = generateCalendarInvite({
        eventId: 1,
        restaurantName: 'Test Steakhouse',
        restaurantAddress: '123 Main St',
        eventDate: '2025-01-15',
        attendeeEmail: 'user@example.com',
      });

      expect(ics).toContain('BEGIN:VALARM');
      expect(ics).toContain('TRIGGER:-PT24H');
      expect(ics).toContain('ACTION:DISPLAY');
      expect(ics).toContain('END:VALARM');
    });
  });

  describe('Special Characters Handling', () => {
    it('should handle restaurant names with special characters', () => {
      const ics = generateCalendarInvite({
        eventId: 1,
        restaurantName: "Joe's Steakhouse & Grill",
        restaurantAddress: '123 Main St',
        eventDate: '2025-01-15',
        attendeeEmail: 'user@example.com',
      });

      expect(ics).toContain("SUMMARY:Meatup.Club - Joe's Steakhouse & Grill");
    });

    it('should handle addresses with commas', () => {
      const ics = generateCalendarInvite({
        eventId: 1,
        restaurantName: 'Test Steakhouse',
        restaurantAddress: '123 Main St, Suite 100, City, State 12345',
        eventDate: '2025-01-15',
        attendeeEmail: 'user@example.com',
      });

      expect(ics).toContain('LOCATION:Test Steakhouse, 123 Main St, Suite 100, City, State 12345');
    });

    it('should handle email addresses with special characters', () => {
      const ics = generateCalendarInvite({
        eventId: 1,
        restaurantName: 'Test Steakhouse',
        restaurantAddress: '123 Main St',
        eventDate: '2025-01-15',
        attendeeEmail: 'user+test@example.com',
      });

      expect(ics).toContain('mailto:user+test@example.com');
    });
  });
});
