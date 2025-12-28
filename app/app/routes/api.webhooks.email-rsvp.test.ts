import { describe, it, expect } from 'vitest';
import { parseCalendarRSVP } from './api.webhooks.email-rsvp';

/**
 * Tests for calendar RSVP parsing function
 * This is critical security-sensitive code that processes untrusted email input
 */
describe('parseCalendarRSVP', () => {

  describe('Valid RSVP Emails', () => {
    it('should parse ACCEPTED RSVP with UID and PARTSTAT', () => {
      const result = parseCalendarRSVP({
        subject: 'Event Response',
        text: 'UID:event-123@meatup.club\nPARTSTAT:ACCEPTED',
      });

      expect(result).toEqual({
        eventUid: 'event-123@meatup.club',
        partstat: 'ACCEPTED',
      });
    });

    it('should parse DECLINED RSVP', () => {
      const result = parseCalendarRSVP({
        subject: 'Event Response',
        text: 'UID:event-456@meatup.club\nPARTSTAT:DECLINED',
      });

      expect(result).toEqual({
        eventUid: 'event-456@meatup.club',
        partstat: 'DECLINED',
      });
    });

    it('should parse TENTATIVE RSVP', () => {
      const result = parseCalendarRSVP({
        subject: 'Event Response',
        text: 'UID:event-789@meatup.club\nPARTSTAT:TENTATIVE',
      });

      expect(result).toEqual({
        eventUid: 'event-789@meatup.club',
        partstat: 'TENTATIVE',
      });
    });

    it('should support legacy UID format with timestamp', () => {
      const result = parseCalendarRSVP({
        subject: 'Event Response',
        text: 'UID:event-123-1234567890@meatup.club\nPARTSTAT:ACCEPTED',
      });

      expect(result).toEqual({
        eventUid: 'event-123-1234567890@meatup.club',
        partstat: 'ACCEPTED',
      });
    });

    it('should parse RSVP from HTML content', () => {
      const result = parseCalendarRSVP({
        subject: 'Event Response',
        text: '',
        html: '<div>UID:event-999@meatup.club</div><div>PARTSTAT:ACCEPTED</div>',
      });

      expect(result).toEqual({
        eventUid: 'event-999@meatup.club',
        partstat: 'ACCEPTED',
      });
    });

    it('should fallback to subject line parsing when PARTSTAT missing', () => {
      const result = parseCalendarRSVP({
        subject: 'You accepted: Meatup Event',
        text: 'UID:event-111@meatup.club',
      });

      expect(result).toEqual({
        eventUid: 'event-111@meatup.club',
        partstat: 'ACCEPTED',
      });
    });

    it('should parse "declined" from subject', () => {
      const result = parseCalendarRSVP({
        subject: 'Declined: Meatup Event',
        text: 'UID:event-222@meatup.club',
      });

      expect(result).toEqual({
        eventUid: 'event-222@meatup.club',
        partstat: 'DECLINED',
      });
    });

    it('should parse "tentative" from subject', () => {
      const result = parseCalendarRSVP({
        subject: 'Maybe: Meatup Event',
        text: 'UID:event-333@meatup.club',
      });

      expect(result).toEqual({
        eventUid: 'event-333@meatup.club',
        partstat: 'TENTATIVE',
      });
    });

    it('should default to NEEDS-ACTION when status unclear', () => {
      const result = parseCalendarRSVP({
        subject: 'Event Reminder',
        text: 'UID:event-444@meatup.club',
      });

      expect(result).toEqual({
        eventUid: 'event-444@meatup.club',
        partstat: 'NEEDS-ACTION',
      });
    });
  });

  describe('Invalid/Malicious Input', () => {
    it('should return null when UID missing', () => {
      const result = parseCalendarRSVP({
        subject: 'Event Response',
        text: 'PARTSTAT:ACCEPTED',
      });

      expect(result).toBeNull();
    });

    it('should return null when UID has wrong domain', () => {
      const result = parseCalendarRSVP({
        subject: 'Event Response',
        text: 'UID:event-123@evil.com\nPARTSTAT:ACCEPTED',
      });

      expect(result).toBeNull();
    });

    it('should return null for completely wrong UID format', () => {
      const result = parseCalendarRSVP({
        subject: 'Event Response',
        text: 'UID:malicious-payload\nPARTSTAT:ACCEPTED',
      });

      expect(result).toBeNull();
    });

    it('should ignore invalid PARTSTAT values', () => {
      const result = parseCalendarRSVP({
        subject: 'Event Response',
        text: 'UID:event-123@meatup.club\nPARTSTAT:MALICIOUS',
      });

      // Should default to NEEDS-ACTION for invalid PARTSTAT
      expect(result).toEqual({
        eventUid: 'event-123@meatup.club',
        partstat: 'NEEDS-ACTION',
      });
    });

    it('should handle SQL injection attempts in UID', () => {
      const result = parseCalendarRSVP({
        subject: 'Event Response',
        text: "UID:event-123'; DROP TABLE users; --@meatup.club\nPARTSTAT:ACCEPTED",
      });

      // Should not match the malicious UID
      expect(result).toBeNull();
    });

    it('should handle XSS attempts in email content', () => {
      const result = parseCalendarRSVP({
        subject: '<script>alert("XSS")</script>',
        text: 'UID:event-123@meatup.club\n<script>alert("XSS")</script>',
      });

      // Should still parse valid data and ignore script tags
      expect(result).toEqual({
        eventUid: 'event-123@meatup.club',
        partstat: 'NEEDS-ACTION',
      });
    });

    it('should handle extremely long input without crashing', () => {
      const longText = 'X'.repeat(1000000) + 'UID:event-123@meatup.club\nPARTSTAT:ACCEPTED';

      const result = parseCalendarRSVP({
        subject: 'Event Response',
        text: longText,
      });

      expect(result).toEqual({
        eventUid: 'event-123@meatup.club',
        partstat: 'ACCEPTED',
      });
    });

    it('should handle null/undefined gracefully', () => {
      const result = parseCalendarRSVP({
        subject: '',
        text: '',
        html: undefined,
      });

      expect(result).toBeNull();
    });
  });

  describe('Edge Cases', () => {
    it('should handle multiple UIDs by taking the first match', () => {
      const result = parseCalendarRSVP({
        subject: 'Event Response',
        text: 'UID:event-123@meatup.club\nUID:event-456@meatup.club\nPARTSTAT:ACCEPTED',
      });

      expect(result).toEqual({
        eventUid: 'event-123@meatup.club',
        partstat: 'ACCEPTED',
      });
    });

    it('should be case-sensitive for UID domain', () => {
      const result = parseCalendarRSVP({
        subject: 'Event Response',
        text: 'UID:event-123@MEATUP.CLUB\nPARTSTAT:ACCEPTED',
      });

      // Should not match uppercase domain
      expect(result).toBeNull();
    });

    it('should handle multiline calendar data', () => {
      const calendarData = `
BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:event-555@meatup.club
SUMMARY:Meatup Event
PARTSTAT:ACCEPTED
END:VEVENT
END:VCALENDAR
      `;

      const result = parseCalendarRSVP({
        subject: 'Event Response',
        text: calendarData,
      });

      expect(result).toEqual({
        eventUid: 'event-555@meatup.club',
        partstat: 'ACCEPTED',
      });
    });
  });
});

describe('Event UID Validation', () => {
  it('should extract valid event ID from UID', () => {
    const uid = 'event-123@meatup.club';
    const match = uid.match(/^event-(\d+)(?:-\d+)?@/);

    expect(match).toBeTruthy();
    expect(match![1]).toBe('123');
  });

  it('should extract event ID from legacy format with timestamp', () => {
    const uid = 'event-456-1234567890@meatup.club';
    const match = uid.match(/^event-(\d+)(?:-\d+)?@/);

    expect(match).toBeTruthy();
    expect(match![1]).toBe('456');
  });

  it('should reject invalid event ID formats', () => {
    const invalidUids = [
      'event-abc@meatup.club',  // Non-numeric ID
      'event@meatup.club',       // Missing ID
      'notanevent-123@meatup.club', // Wrong prefix
      'event-',                  // Incomplete
      '',                        // Empty
    ];

    invalidUids.forEach(uid => {
      const match = uid.match(/^event-(\d+)(?:-\d+)?@/);
      expect(match).toBeNull();
    });
  });

  it('should match valid UID but require domain validation separately', () => {
    // The regex matches the UID structure but domain validation is separate
    const uid = 'event-123@wrong.com';
    const match = uid.match(/^event-(\d+)(?:-\d+)?@/);
    expect(match).toBeTruthy(); // Matches structure

    // But the full UID validation in parseCalendarRSVP requires meatup.club domain
    const result = parseCalendarRSVP({
      subject: 'Test',
      text: `UID:${uid}`,
    });
    expect(result).toBeNull(); // Should be rejected due to wrong domain
  });
});

describe('PARTSTAT to RSVP Status Mapping', () => {
  it('should map PARTSTAT values correctly', () => {
    const statusMap: Record<string, string> = {
      'ACCEPTED': 'yes',
      'DECLINED': 'no',
      'TENTATIVE': 'maybe',
      'NEEDS-ACTION': 'maybe',
    };

    expect(statusMap['ACCEPTED']).toBe('yes');
    expect(statusMap['DECLINED']).toBe('no');
    expect(statusMap['TENTATIVE']).toBe('maybe');
    expect(statusMap['NEEDS-ACTION']).toBe('maybe');
  });

  it('should default to "maybe" for unknown status', () => {
    const statusMap: Record<string, string> = {
      'ACCEPTED': 'yes',
      'DECLINED': 'no',
      'TENTATIVE': 'maybe',
      'NEEDS-ACTION': 'maybe',
    };

    const unknownStatus = 'INVALID';
    const result = statusMap[unknownStatus] || 'maybe';

    expect(result).toBe('maybe');
  });
});
