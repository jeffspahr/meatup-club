import { describe, it, expect, vi, beforeEach } from 'vitest';
import { action } from './api.webhooks.email-rsvp';

/**
 * Integration tests for webhook signature verification and database operations
 *
 * CRITICAL SECURITY TESTS:
 * - Webhook signature verification (Svix)
 * - Database operations (D1)
 * - Authentication and authorization
 * - Error handling
 */

// Mock verify function that will be reused
let mockVerify = vi.fn();

// Mock the Svix library
vi.mock('svix', () => {
  return {
    Webhook: class MockWebhook {
      private secret: string;

      constructor(secret: string) {
        this.secret = secret;
      }

      verify(body: string, headers: any) {
        return mockVerify(body, headers, this.secret);
      }
    },
  };
});

describe('Webhook Handler - Signature Verification', () => {
  let mockDb: any;
  let mockEnv: any;

  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();

    // Create mock D1 database
    mockDb = {
      prepare: vi.fn().mockReturnThis(),
      bind: vi.fn().mockReturnThis(),
      first: vi.fn(),
      run: vi.fn(),
    };

    // Create mock environment
    mockEnv = {
      DB: mockDb,
      RESEND_WEBHOOK_SECRET: 'test-webhook-secret',
    };

    // Setup default mock behavior for Svix verify
    mockVerify.mockImplementation((body: string, headers: any, secret: string) => {
      // Check for invalid signature header
      if (headers['svix-signature'] === 'invalid-signature') {
        throw new Error('Invalid signature');
      }

      // Return parsed payload for valid signatures
      return JSON.parse(body);
    });
  });

  describe('Security: Missing Configuration', () => {
    it('should reject requests when webhook secret is not configured', async () => {
      const request = new Request('http://localhost/api/webhooks/email-rsvp', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'svix-id': 'msg_123',
          'svix-timestamp': '1234567890',
          'svix-signature': 'v1,signature',
        },
        body: JSON.stringify({
          type: 'email.received',
          data: {
            from: 'user@example.com',
            subject: 'Test',
            text: 'Test',
          },
        }),
      });

      const context = {
        cloudflare: {
          env: {
            DB: mockDb,
            RESEND_WEBHOOK_SECRET: undefined, // Missing secret
          },
        },
      } as any;

      const response = await action({ request, context, params: {} });
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Webhook not configured');
    });
  });

  describe('Security: Missing Svix Headers', () => {
    it('should reject requests missing svix-id header', async () => {
      const request = new Request('http://localhost/api/webhooks/email-rsvp', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          // Missing svix-id
          'svix-timestamp': '1234567890',
          'svix-signature': 'v1,signature',
        },
        body: JSON.stringify({ type: 'email.received' }),
      });

      const context = {
        cloudflare: { env: mockEnv },
      } as any;

      const response = await action({ request, context, params: {} });
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Missing signature headers');
    });

    it('should reject requests missing svix-timestamp header', async () => {
      const request = new Request('http://localhost/api/webhooks/email-rsvp', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'svix-id': 'msg_123',
          // Missing svix-timestamp
          'svix-signature': 'v1,signature',
        },
        body: JSON.stringify({ type: 'email.received' }),
      });

      const context = {
        cloudflare: { env: mockEnv },
      } as any;

      const response = await action({ request, context, params: {} });
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Missing signature headers');
    });

    it('should reject requests missing svix-signature header', async () => {
      const request = new Request('http://localhost/api/webhooks/email-rsvp', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'svix-id': 'msg_123',
          'svix-timestamp': '1234567890',
          // Missing svix-signature
        },
        body: JSON.stringify({ type: 'email.received' }),
      });

      const context = {
        cloudflare: { env: mockEnv },
      } as any;

      const response = await action({ request, context, params: {} });
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Missing signature headers');
    });
  });

  describe('Security: Invalid Signature', () => {
    it('should reject requests with invalid signature', async () => {
      const request = new Request('http://localhost/api/webhooks/email-rsvp', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'svix-id': 'msg_123',
          'svix-timestamp': '1234567890',
          'svix-signature': 'invalid-signature', // This will trigger mock error
        },
        body: JSON.stringify({
          type: 'email.received',
          data: {
            from: 'user@example.com',
            subject: 'Test',
            text: 'Test',
          },
        }),
      });

      const context = {
        cloudflare: { env: mockEnv },
      } as any;

      const response = await action({ request, context, params: {} });
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Invalid signature');
    });
  });

  describe('Valid Webhook Processing', () => {
    it('should ignore non-email.received events', async () => {
      const request = new Request('http://localhost/api/webhooks/email-rsvp', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'svix-id': 'msg_123',
          'svix-timestamp': '1234567890',
          'svix-signature': 'v1,valid-signature',
        },
        body: JSON.stringify({
          type: 'email.sent', // Wrong event type
          data: {
            from: 'user@example.com',
            subject: 'Test',
            text: 'Test',
          },
        }),
      });

      const context = {
        cloudflare: { env: mockEnv },
      } as any;

      const response = await action({ request, context, params: {} });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.message).toBe('Ignored: not an email.received event');
    });

    it('should ignore emails without RSVP data', async () => {
      const request = new Request('http://localhost/api/webhooks/email-rsvp', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'svix-id': 'msg_123',
          'svix-timestamp': '1234567890',
          'svix-signature': 'v1,valid-signature',
        },
        body: JSON.stringify({
          type: 'email.received',
          data: {
            from: 'user@example.com',
            subject: 'Random email',
            text: 'No calendar data here',
          },
        }),
      });

      const context = {
        cloudflare: { env: mockEnv },
      } as any;

      const response = await action({ request, context, params: {} });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.message).toBe('No RSVP data found');
    });
  });
});

describe('Webhook Handler - Database Operations', () => {
  let mockDb: any;
  let mockEnv: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockDb = {
      prepare: vi.fn().mockReturnThis(),
      bind: vi.fn().mockReturnThis(),
      first: vi.fn(),
      run: vi.fn(),
    };

    mockEnv = {
      DB: mockDb,
      RESEND_WEBHOOK_SECRET: 'test-webhook-secret',
    };

    // Setup default mock behavior for Svix verify
    mockVerify.mockImplementation((body: string, headers: any, secret: string) => {
      // Return parsed payload for valid signatures
      return JSON.parse(body);
    });
  });

  describe('User Lookup', () => {
    it('should return 404 when user not found', async () => {
      // Mock: user not found
      mockDb.first.mockResolvedValueOnce(null);

      const request = new Request('http://localhost/api/webhooks/email-rsvp', {
        method: 'POST',
        headers: {
          'svix-id': 'msg_123',
          'svix-timestamp': '1234567890',
          'svix-signature': 'v1,valid-signature',
        },
        body: JSON.stringify({
          type: 'email.received',
          data: {
            from: 'unknown@example.com',
            subject: 'RSVP',
            text: 'UID:event-123@meatup.club\nPARTSTAT:ACCEPTED',
          },
        }),
      });

      const context = {
        cloudflare: { env: mockEnv },
      } as any;

      const response = await action({ request, context, params: {} });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.message).toBe('User not found');
      expect(data.email).toBe('unknown@example.com');
    });

    it('should extract email from "Name <email>" format', async () => {
      mockDb.first
        .mockResolvedValueOnce({ id: 1, email: 'user@example.com', name: 'Test User' }) // User lookup
        .mockResolvedValueOnce({ id: 123, restaurant_name: 'Test Restaurant', event_date: '2025-01-15' }) // Event lookup
        .mockResolvedValueOnce(null); // No existing RSVP

      mockDb.run.mockResolvedValueOnce({ success: true });

      const request = new Request('http://localhost/api/webhooks/email-rsvp', {
        method: 'POST',
        headers: {
          'svix-id': 'msg_123',
          'svix-timestamp': '1234567890',
          'svix-signature': 'v1,valid-signature',
        },
        body: JSON.stringify({
          type: 'email.received',
          data: {
            from: 'Test User <user@example.com>', // Name format
            subject: 'RSVP',
            text: 'UID:event-123@meatup.club\nPARTSTAT:ACCEPTED',
          },
        }),
      });

      const context = {
        cloudflare: { env: mockEnv },
      } as any;

      const response = await action({ request, context, params: {} });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);

      // Verify the email was extracted correctly
      expect(mockDb.prepare).toHaveBeenCalledWith(
        'SELECT id, email, name FROM users WHERE LOWER(email) = ?'
      );
      expect(mockDb.bind).toHaveBeenCalledWith('user@example.com');
    });

    it('should handle emails with case-insensitive lookup', async () => {
      mockDb.first
        .mockResolvedValueOnce({ id: 1, email: 'User@Example.COM', name: 'Test User' })
        .mockResolvedValueOnce({ id: 123, restaurant_name: 'Test Restaurant', event_date: '2025-01-15' })
        .mockResolvedValueOnce(null);

      mockDb.run.mockResolvedValueOnce({ success: true });

      const request = new Request('http://localhost/api/webhooks/email-rsvp', {
        method: 'POST',
        headers: {
          'svix-id': 'msg_123',
          'svix-timestamp': '1234567890',
          'svix-signature': 'v1,valid-signature',
        },
        body: JSON.stringify({
          type: 'email.received',
          data: {
            from: 'User@Example.COM',
            subject: 'RSVP',
            text: 'UID:event-123@meatup.club\nPARTSTAT:ACCEPTED',
          },
        }),
      });

      const context = {
        cloudflare: { env: mockEnv },
      } as any;

      const response = await action({ request, context, params: {} });

      expect(response.status).toBe(200);
      expect(mockDb.bind).toHaveBeenCalledWith('user@example.com'); // Lowercased
    });
  });

  describe('Event Validation', () => {
    it('should ignore emails with invalid event UID format', async () => {
      // Note: parseCalendarRSVP regex requires numeric event IDs, so invalid formats
      // won't parse and will return 200 with "No RSVP data found"
      // The 400 check in the handler is defensive programming for future edge cases

      const request = new Request('http://localhost/api/webhooks/email-rsvp', {
        method: 'POST',
        headers: {
          'svix-id': 'msg_123',
          'svix-timestamp': '1234567890',
          'svix-signature': 'v1,valid-signature',
        },
        body: JSON.stringify({
          type: 'email.received',
          data: {
            from: 'user@example.com',
            subject: 'RSVP',
            text: 'UID:event-abc@meatup.club\nPARTSTAT:ACCEPTED', // Non-numeric event ID won't parse
          },
        }),
      });

      const context = {
        cloudflare: { env: mockEnv },
      } as any;

      const response = await action({ request, context, params: {} });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.message).toBe('No RSVP data found');
    });

    it('should return 404 when event not found', async () => {
      mockDb.first
        .mockResolvedValueOnce({ id: 1, email: 'user@example.com', name: 'Test User' })
        .mockResolvedValueOnce(null); // Event not found

      const request = new Request('http://localhost/api/webhooks/email-rsvp', {
        method: 'POST',
        headers: {
          'svix-id': 'msg_123',
          'svix-timestamp': '1234567890',
          'svix-signature': 'v1,valid-signature',
        },
        body: JSON.stringify({
          type: 'email.received',
          data: {
            from: 'user@example.com',
            subject: 'RSVP',
            text: 'UID:event-999@meatup.club\nPARTSTAT:ACCEPTED',
          },
        }),
      });

      const context = {
        cloudflare: { env: mockEnv },
      } as any;

      const response = await action({ request, context, params: {} });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.message).toBe('Event not found');
      expect(data.eventId).toBe(999);
    });
  });

  describe('RSVP Creation', () => {
    it('should create new RSVP when none exists', async () => {
      mockDb.first
        .mockResolvedValueOnce({ id: 1, email: 'user@example.com', name: 'Test User' })
        .mockResolvedValueOnce({ id: 123, restaurant_name: 'Prime Steakhouse', event_date: '2025-01-15' })
        .mockResolvedValueOnce(null); // No existing RSVP

      mockDb.run.mockResolvedValueOnce({ success: true });

      const request = new Request('http://localhost/api/webhooks/email-rsvp', {
        method: 'POST',
        headers: {
          'svix-id': 'msg_123',
          'svix-timestamp': '1234567890',
          'svix-signature': 'v1,valid-signature',
        },
        body: JSON.stringify({
          type: 'email.received',
          data: {
            from: 'user@example.com',
            subject: 'RSVP',
            text: 'UID:event-123@meatup.club\nPARTSTAT:ACCEPTED',
          },
        }),
      });

      const context = {
        cloudflare: { env: mockEnv },
      } as any;

      const response = await action({ request, context, params: {} });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.status).toBe('yes'); // ACCEPTED -> yes
      expect(data.data.user).toBe('user@example.com');
      expect(data.data.event).toBe('Prime Steakhouse');

      // Verify INSERT was called
      expect(mockDb.prepare).toHaveBeenCalledWith(
        'INSERT INTO rsvps (event_id, user_id, status, updated_via_calendar) VALUES (?, ?, ?, 1)'
      );
      expect(mockDb.bind).toHaveBeenCalledWith(123, 1, 'yes');
    });

    it('should map DECLINED to "no" status', async () => {
      mockDb.first
        .mockResolvedValueOnce({ id: 1, email: 'user@example.com', name: 'Test User' })
        .mockResolvedValueOnce({ id: 123, restaurant_name: 'Prime Steakhouse', event_date: '2025-01-15' })
        .mockResolvedValueOnce(null);

      mockDb.run.mockResolvedValueOnce({ success: true });

      const request = new Request('http://localhost/api/webhooks/email-rsvp', {
        method: 'POST',
        headers: {
          'svix-id': 'msg_123',
          'svix-timestamp': '1234567890',
          'svix-signature': 'v1,valid-signature',
        },
        body: JSON.stringify({
          type: 'email.received',
          data: {
            from: 'user@example.com',
            subject: 'RSVP',
            text: 'UID:event-123@meatup.club\nPARTSTAT:DECLINED',
          },
        }),
      });

      const context = {
        cloudflare: { env: mockEnv },
      } as any;

      const response = await action({ request, context, params: {} });
      const data = await response.json();

      expect(data.data.status).toBe('no');
      expect(mockDb.bind).toHaveBeenCalledWith(123, 1, 'no');
    });

    it('should map TENTATIVE to "maybe" status', async () => {
      mockDb.first
        .mockResolvedValueOnce({ id: 1, email: 'user@example.com', name: 'Test User' })
        .mockResolvedValueOnce({ id: 123, restaurant_name: 'Prime Steakhouse', event_date: '2025-01-15' })
        .mockResolvedValueOnce(null);

      mockDb.run.mockResolvedValueOnce({ success: true });

      const request = new Request('http://localhost/api/webhooks/email-rsvp', {
        method: 'POST',
        headers: {
          'svix-id': 'msg_123',
          'svix-timestamp': '1234567890',
          'svix-signature': 'v1,valid-signature',
        },
        body: JSON.stringify({
          type: 'email.received',
          data: {
            from: 'user@example.com',
            subject: 'RSVP',
            text: 'UID:event-123@meatup.club\nPARTSTAT:TENTATIVE',
          },
        }),
      });

      const context = {
        cloudflare: { env: mockEnv },
      } as any;

      const response = await action({ request, context, params: {} });
      const data = await response.json();

      expect(data.data.status).toBe('maybe');
      expect(mockDb.bind).toHaveBeenCalledWith(123, 1, 'maybe');
    });
  });

  describe('RSVP Update', () => {
    it('should update existing RSVP', async () => {
      mockDb.first
        .mockResolvedValueOnce({ id: 1, email: 'user@example.com', name: 'Test User' })
        .mockResolvedValueOnce({ id: 123, restaurant_name: 'Prime Steakhouse', event_date: '2025-01-15' })
        .mockResolvedValueOnce({ id: 456, status: 'maybe' }); // Existing RSVP

      mockDb.run.mockResolvedValueOnce({ success: true });

      const request = new Request('http://localhost/api/webhooks/email-rsvp', {
        method: 'POST',
        headers: {
          'svix-id': 'msg_123',
          'svix-timestamp': '1234567890',
          'svix-signature': 'v1,valid-signature',
        },
        body: JSON.stringify({
          type: 'email.received',
          data: {
            from: 'user@example.com',
            subject: 'RSVP',
            text: 'UID:event-123@meatup.club\nPARTSTAT:ACCEPTED',
          },
        }),
      });

      const context = {
        cloudflare: { env: mockEnv },
      } as any;

      const response = await action({ request, context, params: {} });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.status).toBe('yes');

      // Verify UPDATE was called
      expect(mockDb.prepare).toHaveBeenCalledWith(
        'UPDATE rsvps SET status = ?, updated_via_calendar = 1 WHERE id = ?'
      );
      expect(mockDb.bind).toHaveBeenCalledWith('yes', 456);
    });

    it('should change status from yes to no', async () => {
      mockDb.first
        .mockResolvedValueOnce({ id: 1, email: 'user@example.com', name: 'Test User' })
        .mockResolvedValueOnce({ id: 123, restaurant_name: 'Prime Steakhouse', event_date: '2025-01-15' })
        .mockResolvedValueOnce({ id: 456, status: 'yes' });

      mockDb.run.mockResolvedValueOnce({ success: true });

      const request = new Request('http://localhost/api/webhooks/email-rsvp', {
        method: 'POST',
        headers: {
          'svix-id': 'msg_123',
          'svix-timestamp': '1234567890',
          'svix-signature': 'v1,valid-signature',
        },
        body: JSON.stringify({
          type: 'email.received',
          data: {
            from: 'user@example.com',
            subject: 'RSVP',
            text: 'UID:event-123@meatup.club\nPARTSTAT:DECLINED',
          },
        }),
      });

      const context = {
        cloudflare: { env: mockEnv },
      } as any;

      const response = await action({ request, context, params: {} });
      const data = await response.json();

      expect(data.data.status).toBe('no');
      expect(mockDb.bind).toHaveBeenCalledWith('no', 456);
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      mockDb.first.mockRejectedValueOnce(new Error('Database connection failed'));

      const request = new Request('http://localhost/api/webhooks/email-rsvp', {
        method: 'POST',
        headers: {
          'svix-id': 'msg_123',
          'svix-timestamp': '1234567890',
          'svix-signature': 'v1,valid-signature',
        },
        body: JSON.stringify({
          type: 'email.received',
          data: {
            from: 'user@example.com',
            subject: 'RSVP',
            text: 'UID:event-123@meatup.club\nPARTSTAT:ACCEPTED',
          },
        }),
      });

      const context = {
        cloudflare: { env: mockEnv },
      } as any;

      const response = await action({ request, context, params: {} });
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Failed to process email webhook');
      expect(data.message).toContain('Database connection failed');
    });
  });
});
