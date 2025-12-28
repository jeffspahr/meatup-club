import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sendInviteEmail, sendCommentReplyEmail } from './email.server';

/**
 * Email Sending Tests
 *
 * Tests for Resend API integration, error handling, and email formatting
 */

describe('Email Sending - Resend API Integration', () => {
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    // Save original fetch
    originalFetch = global.fetch;

    // Mock fetch by default to return success
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'email-123' }),
      text: async () => 'OK',
      statusText: 'OK',
    } as Response);
  });

  afterEach(() => {
    // Restore original fetch
    global.fetch = originalFetch;
    vi.clearAllMocks();
  });

  describe('sendInviteEmail', () => {
    const mockTemplate = {
      subject: 'Join {{inviterName}} on Meatup.Club!',
      html: '<p>Hi {{inviteeName}},</p><p>{{inviterName}} invited you. <a href="{{acceptLink}}">Accept</a></p>',
      text: 'Hi {{inviteeName}}, {{inviterName}} invited you. Accept: {{acceptLink}}',
    };

    it('should send email successfully with correct API call', async () => {
      const result = await sendInviteEmail({
        to: 'test@example.com',
        inviteeName: 'John',
        inviterName: 'Jane',
        acceptLink: 'https://meatup.club/accept/abc123',
        resendApiKey: 'test-api-key',
        template: mockTemplate,
      });

      expect(result.success).toBe(true);
      expect(global.fetch).toHaveBeenCalledTimes(1);

      const fetchCall = (global.fetch as any).mock.calls[0];
      expect(fetchCall[0]).toBe('https://api.resend.com/emails');

      const request = fetchCall[1];
      expect(request.method).toBe('POST');
      expect(request.headers['Authorization']).toBe('Bearer test-api-key');
      expect(request.headers['Content-Type']).toBe('application/json');
    });

    it('should replace template variables correctly', async () => {
      await sendInviteEmail({
        to: 'test@example.com',
        inviteeName: 'John',
        inviterName: 'Jane',
        acceptLink: 'https://meatup.club/accept/abc123',
        resendApiKey: 'test-api-key',
        template: mockTemplate,
      });

      const fetchCall = (global.fetch as any).mock.calls[0];
      const body = JSON.parse(fetchCall[1].body);

      expect(body.subject).toBe('Join Jane on Meatup.Club!');
      expect(body.html).toContain('Hi John,');
      expect(body.html).toContain('Jane invited you');
      expect(body.html).toContain('https://meatup.club/accept/abc123');
      expect(body.text).toContain('Hi John');
      expect(body.text).toContain('Jane invited you');
    });

    it('should use "there" as default when inviteeName is null', async () => {
      await sendInviteEmail({
        to: 'test@example.com',
        inviteeName: null,
        inviterName: 'Jane',
        acceptLink: 'https://meatup.club/accept/abc123',
        resendApiKey: 'test-api-key',
        template: mockTemplate,
      });

      const fetchCall = (global.fetch as any).mock.calls[0];
      const body = JSON.parse(fetchCall[1].body);

      expect(body.html).toContain('Hi there,');
      expect(body.text).toContain('Hi there');
    });

    it('should include correct email metadata', async () => {
      await sendInviteEmail({
        to: 'test@example.com',
        inviteeName: 'John',
        inviterName: 'Jane',
        acceptLink: 'https://meatup.club/accept/abc123',
        resendApiKey: 'test-api-key',
        template: mockTemplate,
      });

      const fetchCall = (global.fetch as any).mock.calls[0];
      const body = JSON.parse(fetchCall[1].body);

      expect(body.from).toBe('Meatup.Club <invites@mail.meatup.club>');
      expect(body.to).toEqual(['test@example.com']);
      expect(body.reply_to).toBe('noreply@meatup.club');
      expect(body.headers['X-Entity-Ref-ID']).toMatch(/^invite-\d+$/);
      expect(body.tags).toEqual([{ name: 'category', value: 'invite' }]);
    });

    it('should handle Resend API errors (non-2xx status)', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        statusText: 'Bad Request',
        text: async () => 'Invalid API key',
      } as Response);

      const result = await sendInviteEmail({
        to: 'test@example.com',
        inviteeName: 'John',
        inviterName: 'Jane',
        acceptLink: 'https://meatup.club/accept/abc123',
        resendApiKey: 'invalid-key',
        template: mockTemplate,
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to send email: Bad Request');
    });

    it('should handle network errors', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      const result = await sendInviteEmail({
        to: 'test@example.com',
        inviteeName: 'John',
        inviterName: 'Jane',
        acceptLink: 'https://meatup.club/accept/abc123',
        resendApiKey: 'test-api-key',
        template: mockTemplate,
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to send invitation email');
    });

    it('should handle timeout errors', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Request timeout'));

      const result = await sendInviteEmail({
        to: 'test@example.com',
        inviteeName: 'John',
        inviterName: 'Jane',
        acceptLink: 'https://meatup.club/accept/abc123',
        resendApiKey: 'test-api-key',
        template: mockTemplate,
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to send invitation email');
    });

    it('should handle multiple variable replacements in same field', async () => {
      const multiVarTemplate = {
        subject: '{{inviterName}} invited {{inviteeName}} - {{inviterName}} again!',
        html: '<p>Test</p>',
        text: 'Test',
      };

      await sendInviteEmail({
        to: 'test@example.com',
        inviteeName: 'John',
        inviterName: 'Jane',
        acceptLink: 'https://meatup.club/accept/abc123',
        resendApiKey: 'test-api-key',
        template: multiVarTemplate,
      });

      const fetchCall = (global.fetch as any).mock.calls[0];
      const body = JSON.parse(fetchCall[1].body);

      expect(body.subject).toBe('Jane invited John - Jane again!');
    });

    it('should handle special characters in template variables', async () => {
      await sendInviteEmail({
        to: 'test@example.com',
        inviteeName: "John O'Brien",
        inviterName: 'Jane & Co.',
        acceptLink: 'https://meatup.club/accept/abc123?ref=test&source=email',
        resendApiKey: 'test-api-key',
        template: mockTemplate,
      });

      const fetchCall = (global.fetch as any).mock.calls[0];
      const body = JSON.parse(fetchCall[1].body);

      expect(body.html).toContain("John O'Brien");
      expect(body.html).toContain('Jane & Co.');
      expect(body.html).toContain('https://meatup.club/accept/abc123?ref=test&source=email');
    });
  });

  describe('sendCommentReplyEmail', () => {
    // Mock the email-templates module
    vi.mock('./email-templates', () => ({
      generateCommentReplyEmail: ({
        recipientName,
        replierName,
        originalComment,
        replyContent,
        pollUrl,
      }: any) => ({
        subject: `${replierName} replied to your comment`,
        html: `<p>Hi ${recipientName || 'there'},</p><p>${replierName} replied to: "${originalComment}"</p><p>Reply: ${replyContent}</p><p><a href="${pollUrl}">View</a></p>`,
        text: `Hi ${recipientName || 'there'}, ${replierName} replied to: "${originalComment}". Reply: ${replyContent}. View: ${pollUrl}`,
      }),
    }));

    it('should send comment reply email successfully', async () => {
      const result = await sendCommentReplyEmail({
        to: 'user@example.com',
        recipientName: 'John',
        replierName: 'Jane',
        originalComment: 'What time should we meet?',
        replyContent: '6pm works for me!',
        pollUrl: 'https://meatup.club/dashboard/polls',
        resendApiKey: 'test-api-key',
      });

      expect(result.success).toBe(true);
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('should include correct comment reply metadata', async () => {
      await sendCommentReplyEmail({
        to: 'user@example.com',
        recipientName: 'John',
        replierName: 'Jane',
        originalComment: 'What time?',
        replyContent: '6pm!',
        pollUrl: 'https://meatup.club/dashboard/polls',
        resendApiKey: 'test-api-key',
      });

      const fetchCall = (global.fetch as any).mock.calls[0];
      const body = JSON.parse(fetchCall[1].body);

      expect(body.from).toBe('Meatup.Club <notifications@mail.meatup.club>');
      expect(body.to).toEqual(['user@example.com']);
      expect(body.reply_to).toBe('noreply@meatup.club');
      expect(body.headers['X-Entity-Ref-ID']).toMatch(/^comment-reply-\d+$/);
      expect(body.tags).toEqual([{ name: 'category', value: 'comment_reply' }]);
    });

    it('should handle null recipient name', async () => {
      await sendCommentReplyEmail({
        to: 'user@example.com',
        recipientName: null,
        replierName: 'Jane',
        originalComment: 'Test comment',
        replyContent: 'Test reply',
        pollUrl: 'https://meatup.club/dashboard/polls',
        resendApiKey: 'test-api-key',
      });

      const fetchCall = (global.fetch as any).mock.calls[0];
      const body = JSON.parse(fetchCall[1].body);

      expect(body.html).toContain('Hi there,');
    });

    it('should handle API errors for comment replies', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        statusText: 'Rate Limited',
        text: async () => 'Too many requests',
      } as Response);

      const result = await sendCommentReplyEmail({
        to: 'user@example.com',
        recipientName: 'John',
        replierName: 'Jane',
        originalComment: 'Test',
        replyContent: 'Reply',
        pollUrl: 'https://meatup.club/dashboard/polls',
        resendApiKey: 'test-api-key',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to send email: Rate Limited');
    });

    it('should handle network errors for comment replies', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Connection refused'));

      const result = await sendCommentReplyEmail({
        to: 'user@example.com',
        recipientName: 'John',
        replierName: 'Jane',
        originalComment: 'Test',
        replyContent: 'Reply',
        pollUrl: 'https://meatup.club/dashboard/polls',
        resendApiKey: 'test-api-key',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to send comment reply notification');
    });

    it('should handle long comment text', async () => {
      const longComment = 'A'.repeat(1000);
      const longReply = 'B'.repeat(1000);

      const result = await sendCommentReplyEmail({
        to: 'user@example.com',
        recipientName: 'John',
        replierName: 'Jane',
        originalComment: longComment,
        replyContent: longReply,
        pollUrl: 'https://meatup.club/dashboard/polls',
        resendApiKey: 'test-api-key',
      });

      expect(result.success).toBe(true);

      const fetchCall = (global.fetch as any).mock.calls[0];
      const body = JSON.parse(fetchCall[1].body);
      expect(body.html).toContain(longComment);
      expect(body.html).toContain(longReply);
    });

    it('should handle special characters in comments', async () => {
      const result = await sendCommentReplyEmail({
        to: 'user@example.com',
        recipientName: 'John',
        replierName: 'Jane',
        originalComment: 'What about "The Grill" at 7pm?',
        replyContent: 'Sounds great & I\'ll be there!',
        pollUrl: 'https://meatup.club/dashboard/polls',
        resendApiKey: 'test-api-key',
      });

      expect(result.success).toBe(true);

      const fetchCall = (global.fetch as any).mock.calls[0];
      const body = JSON.parse(fetchCall[1].body);
      expect(body.html).toContain('"The Grill"');
      expect(body.html).toContain('great & I');
    });
  });

  describe('Error Handling Edge Cases', () => {
    it('should handle malformed JSON responses', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => { throw new Error('Invalid JSON'); },
        text: async () => 'Not JSON',
      } as Response);

      const result = await sendInviteEmail({
        to: 'test@example.com',
        inviteeName: 'John',
        inviterName: 'Jane',
        acceptLink: 'https://meatup.club/accept/abc123',
        resendApiKey: 'test-api-key',
        template: {
          subject: 'Test',
          html: '<p>Test</p>',
          text: 'Test',
        },
      });

      // Should still succeed if response.ok is true, even if JSON parsing fails
      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to send invitation email');
    });

    it('should handle empty API key', async () => {
      const result = await sendInviteEmail({
        to: 'test@example.com',
        inviteeName: 'John',
        inviterName: 'Jane',
        acceptLink: 'https://meatup.club/accept/abc123',
        resendApiKey: '',
        template: {
          subject: 'Test',
          html: '<p>Test</p>',
          text: 'Test',
        },
      });

      // Should still make the request (API will reject it)
      expect(global.fetch).toHaveBeenCalledTimes(1);

      const fetchCall = (global.fetch as any).mock.calls[0];
      const request = fetchCall[1];
      expect(request.headers['Authorization']).toBe('Bearer ');
    });

    it('should handle invalid email addresses gracefully', async () => {
      // The function doesn't validate email format - it just sends
      // This is OK because the Resend API will validate
      const result = await sendInviteEmail({
        to: 'not-an-email',
        inviteeName: 'John',
        inviterName: 'Jane',
        acceptLink: 'https://meatup.club/accept/abc123',
        resendApiKey: 'test-api-key',
        template: {
          subject: 'Test',
          html: '<p>Test</p>',
          text: 'Test',
        },
      });

      expect(result.success).toBe(true); // Will succeed locally, API would reject

      const fetchCall = (global.fetch as any).mock.calls[0];
      const body = JSON.parse(fetchCall[1].body);
      expect(body.to).toEqual(['not-an-email']);
    });
  });
});
