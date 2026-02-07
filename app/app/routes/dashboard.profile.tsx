import { Form, redirect } from "react-router";
import type { Route } from "./+types/dashboard.profile";
import { requireActiveUser } from "../lib/auth.server";
import { normalizePhoneNumber } from "../lib/sms.server";
import { PageHeader, Card, UserAvatar, Badge, Alert, Button } from "~/components/ui";

export async function loader({ request, context }: Route.LoaderArgs) {
  const user = await requireActiveUser(request, context);
  return { user };
}

export async function action({ request, context }: Route.ActionArgs) {
  const user = await requireActiveUser(request, context);
  const db = context.cloudflare.env.DB;
  const formData = await request.formData();
  const actionType = formData.get('_action');

  if (actionType === 'update_notifications') {
    const notifyCommentReplies = formData.get('notify_comment_replies') === 'on' ? 1 : 0;
    const notifyPollUpdates = formData.get('notify_poll_updates') === 'on' ? 1 : 0;
    const notifyEventUpdates = formData.get('notify_event_updates') === 'on' ? 1 : 0;

    await db
      .prepare(`
        UPDATE users
        SET notify_comment_replies = ?,
            notify_poll_updates = ?,
            notify_event_updates = ?
        WHERE id = ?
      `)
      .bind(notifyCommentReplies, notifyPollUpdates, notifyEventUpdates, user.id)
      .run();

    return { success: 'Notification preferences updated successfully' };
  }

  if (actionType === 'update_sms') {
    const rawPhone = String(formData.get('phone_number') || '').trim();
    const wantsSms = formData.get('sms_opt_in') === 'on';
    const normalizedPhone = rawPhone ? normalizePhoneNumber(rawPhone) : null;

    if (rawPhone && !normalizedPhone) {
      return { error: 'Please enter a valid US phone number (e.g. 555-123-4567).' };
    }

    if (wantsSms && !normalizedPhone) {
      return { error: 'SMS consent requires a valid phone number.' };
    }

    if (normalizedPhone) {
      const existing = await db
        .prepare('SELECT id FROM users WHERE phone_number = ? AND id != ?')
        .bind(normalizedPhone, user.id)
        .first();
      if (existing) {
        return { error: 'That phone number is already linked to another account.' };
      }
    }

    const smsOptIn = wantsSms && !!normalizedPhone ? 1 : 0;

    await db
      .prepare(`
        UPDATE users
        SET phone_number = ?,
            sms_opt_in = ?,
            sms_opt_out_at = CASE
              WHEN ? = 1 THEN NULL
              ELSE COALESCE(sms_opt_out_at, CURRENT_TIMESTAMP)
            END
        WHERE id = ?
      `)
      .bind(normalizedPhone, smsOptIn, smsOptIn, user.id)
      .run();

    return { success: 'SMS preferences updated successfully' };
  }

  return { error: 'Invalid action' };
}

export default function ProfilePage({ loaderData, actionData }: Route.ComponentProps) {
  const { user } = loaderData;

  return (
    <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <PageHeader title="Profile & Settings" />

      {actionData?.success && (
        <Alert variant="success" className="mb-6">
          {actionData.success}
        </Alert>
      )}

      {actionData?.error && (
        <Alert variant="error" className="mb-6">
          {actionData.error}
        </Alert>
      )}

      {/* User Info */}
      <Card className="mb-8">
        <h2 className="text-xl font-semibold text-foreground mb-4">Account Information</h2>
        <div className="flex items-center gap-4 mb-4">
          {user.picture && (
            <UserAvatar
              src={user.picture}
              name={user.name}
              email={user.email}
              size="lg"
            />
          )}
          <div>
            <p className="font-semibold text-foreground">{user.name || 'No name set'}</p>
            <p className="text-sm text-muted-foreground">{user.email}</p>
            {user.is_admin === 1 && (
              <Badge variant="accent" className="mt-1">Admin</Badge>
            )}
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          Your name and profile picture are synced from your Google account. They will update automatically when you sign in.
        </p>
      </Card>

      {/* Notification Preferences */}
      <Card>
        <h2 className="text-xl font-semibold text-foreground mb-4">Email Notifications</h2>
        <p className="text-sm text-muted-foreground mb-6">
          Choose which email notifications you'd like to receive from Meatup.Club
        </p>

        <Form method="post">
          <input type="hidden" name="_action" value="update_notifications" />

          <div className="space-y-4">
            {/* Comment Replies */}
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                name="notify_comment_replies"
                defaultChecked={user.notify_comment_replies === 1}
                className="mt-1 h-4 w-4 rounded border-border text-accent focus:ring-accent"
              />
              <div>
                <div className="font-medium text-foreground">Comment Replies</div>
                <div className="text-sm text-muted-foreground">
                  Get notified when someone replies to your comments
                </div>
              </div>
            </label>

            {/* Poll Updates */}
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                name="notify_poll_updates"
                defaultChecked={user.notify_poll_updates === 1}
                className="mt-1 h-4 w-4 rounded border-border text-accent focus:ring-accent"
              />
              <div>
                <div className="font-medium text-foreground">Poll Updates</div>
                <div className="text-sm text-muted-foreground">
                  Get notified when new polls are created or closed
                </div>
              </div>
            </label>

            {/* Event Updates */}
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                name="notify_event_updates"
                defaultChecked={user.notify_event_updates === 1}
                className="mt-1 h-4 w-4 rounded border-border text-accent focus:ring-accent"
              />
              <div>
                <div className="font-medium text-foreground">Event Updates</div>
                <div className="text-sm text-muted-foreground">
                  Get notified about upcoming events and event changes
                </div>
              </div>
            </label>
          </div>

          <div className="mt-6 pt-6 border-t border-border">
            <Button variant="primary" type="submit">
              Save Preferences
            </Button>
          </div>
        </Form>
      </Card>

      {/* SMS Preferences */}
      <Card className="mt-8">
        <h2 className="text-xl font-semibold text-foreground mb-4">SMS Reminders</h2>
        <p className="text-sm text-muted-foreground mb-6">
          Get text reminders before each meetup. Reply YES or NO to update your RSVP. Reply STOP to opt out anytime.
        </p>

        {user.sms_opt_out_at && (
          <Alert variant="warning" className="mb-4">
            You are currently opted out of SMS. Re-enable below if you want reminders again.
          </Alert>
        )}

        <Form method="post" className="space-y-4">
          <input type="hidden" name="_action" value="update_sms" />

          <div>
            <label
              htmlFor="phone_number"
              className="block text-sm font-medium text-foreground mb-1"
            >
              Mobile Number (US)
            </label>
            <input
              id="phone_number"
              name="phone_number"
              type="tel"
              inputMode="tel"
              placeholder="555-123-4567"
              defaultValue={user.phone_number || ''}
              className="w-full px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </div>

          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              name="sms_opt_in"
              defaultChecked={user.sms_opt_in === 1}
              className="mt-1 h-4 w-4 rounded border-border text-accent focus:ring-accent"
            />
            <div>
              <div className="font-medium text-foreground">I agree to receive SMS reminders</div>
              <div className="text-sm text-muted-foreground">
                Message & data rates may apply. No marketing texts.
              </div>
            </div>
          </label>

          <div className="pt-2">
            <Button variant="primary" type="submit">
              Save SMS Preferences
            </Button>
          </div>
        </Form>
      </Card>
    </main>
  );
}
