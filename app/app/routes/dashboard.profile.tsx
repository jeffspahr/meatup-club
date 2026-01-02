import { Form, redirect } from "react-router";
import type { Route } from "./+types/dashboard.profile";
import { requireActiveUser } from "../lib/auth.server";
import { normalizePhoneNumber } from "../lib/sms.server";

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
      <h1 className="text-3xl font-bold text-foreground mb-8">Profile & Settings</h1>

      {actionData?.success && (
        <div className="mb-6 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-800 dark:text-green-200 px-4 py-3 rounded">
          {actionData.success}
        </div>
      )}

      {actionData?.error && (
        <div className="mb-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-200 px-4 py-3 rounded">
          {actionData.error}
        </div>
      )}

      {/* User Info */}
      <div className="bg-card border border-border rounded-lg p-6 mb-8">
        <h2 className="text-xl font-semibold text-foreground mb-4">Account Information</h2>
        <div className="flex items-center gap-4 mb-4">
          {user.picture && (
            <img
              src={user.picture}
              alt={user.name || user.email}
              className="w-16 h-16 rounded-full"
            />
          )}
          <div>
            <p className="font-semibold text-foreground">{user.name || 'No name set'}</p>
            <p className="text-sm text-muted-foreground">{user.email}</p>
            {user.is_admin === 1 && (
              <span className="inline-block mt-1 px-2 py-1 text-xs font-semibold rounded-full bg-meat-red text-white">
                Admin
              </span>
            )}
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          Your name and profile picture are synced from your Google account. They will update automatically when you sign in.
        </p>
      </div>

      {/* Notification Preferences */}
      <div className="bg-card border border-border rounded-lg p-6">
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
                className="mt-1 h-4 w-4 rounded border-border text-meat-red focus:ring-meat-red"
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
                className="mt-1 h-4 w-4 rounded border-border text-meat-red focus:ring-meat-red"
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
                className="mt-1 h-4 w-4 rounded border-border text-meat-red focus:ring-meat-red"
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
            <button
              type="submit"
              className="bg-meat-red text-white px-6 py-2 rounded-lg hover:bg-red-700 transition font-medium"
            >
              Save Preferences
            </button>
          </div>
        </Form>
      </div>

      {/* SMS Preferences */}
      <div className="bg-card border border-border rounded-lg p-6 mt-8">
        <h2 className="text-xl font-semibold text-foreground mb-4">SMS Reminders</h2>
        <p className="text-sm text-muted-foreground mb-6">
          Get text reminders before each meetup. Reply YES or NO to update your RSVP. Reply STOP to opt out anytime.
        </p>

        {user.sms_opt_out_at && (
          <div className="mb-4 text-sm text-amber-700 bg-amber-50 border border-amber-200 px-3 py-2 rounded">
            You are currently opted out of SMS. Re-enable below if you want reminders again.
          </div>
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
              className="w-full px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-meat-red"
            />
          </div>

          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              name="sms_opt_in"
              defaultChecked={user.sms_opt_in === 1}
              className="mt-1 h-4 w-4 rounded border-border text-meat-red focus:ring-meat-red"
            />
            <div>
              <div className="font-medium text-foreground">I agree to receive SMS reminders</div>
              <div className="text-sm text-muted-foreground">
                Message & data rates may apply. No marketing texts.
              </div>
            </div>
          </label>

          <div className="pt-2">
            <button
              type="submit"
              className="bg-meat-red text-white px-6 py-2 rounded-lg hover:bg-red-700 transition font-medium"
            >
              Save SMS Preferences
            </button>
          </div>
        </Form>
      </div>
    </main>
  );
}
