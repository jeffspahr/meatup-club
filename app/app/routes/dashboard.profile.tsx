import { Form, redirect } from "react-router";
import type { Route } from "./+types/dashboard.profile";
import { requireActiveUser } from "../lib/auth.server";
import { normalizePhoneNumber } from "../lib/sms.server";
import { prepareSmsConsentEvent } from "../lib/sms-consent.server";
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
    const notifyPollUpdates = formData.get('notify_poll_updates') === 'on' ? 1 : 0;
    const notifyEventUpdates = formData.get('notify_event_updates') === 'on' ? 1 : 0;

    await db
      .prepare(`
        UPDATE users
        SET notify_poll_updates = ?,
            notify_event_updates = ?
        WHERE id = ?
      `)
      .bind(notifyPollUpdates, notifyEventUpdates, user.id)
      .run();

    return { success: 'Notification preferences updated successfully' };
  }

  if (actionType === 'update_sms') {
    const rawPhone = String(formData.get('phone_number') || '').trim();
    const wantsSms = formData.get('sms_opt_in') === 'on';
    const normalizedPhone = rawPhone ? normalizePhoneNumber(rawPhone) : null;
    const hasCarrierOptOut = Boolean(
      user.sms_opt_out_at && user.sms_opt_out_source !== 'profile'
    );

    if (rawPhone && !normalizedPhone) {
      return { error: 'Please enter a valid US phone number (e.g. 555-123-4567).' };
    }

    if (wantsSms && !normalizedPhone) {
      return { error: 'SMS consent requires a valid phone number.' };
    }

    if (wantsSms && hasCarrierOptOut) {
      return {
        error: 'Reply START to (888) 857-6328 to re-enable SMS after opting out by text.',
      };
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

    const updateStatement = db
      .prepare(`
        UPDATE users
        SET phone_number = ?,
            sms_opt_in = ?,
            sms_opt_out_at = CASE
              WHEN ? = 1 THEN NULL
              ELSE COALESCE(sms_opt_out_at, CURRENT_TIMESTAMP)
            END,
            sms_opt_out_source = CASE
              WHEN ? = 1 THEN NULL
              WHEN ? = 1 THEN COALESCE(sms_opt_out_source, 'sms')
              ELSE 'profile'
            END
        WHERE id = ?
      `)
      .bind(normalizedPhone, smsOptIn, smsOptIn, smsOptIn, hasCarrierOptOut ? 1 : 0, user.id);

    const wasSmsEnabled = user.sms_opt_in === 1 && !user.sms_opt_out_at;
    const phoneChanged = normalizedPhone !== user.phone_number;
    const consentPhoneNumber = normalizedPhone || user.phone_number;
    const consentEventType = smsOptIn === 1 && (!wasSmsEnabled || phoneChanged)
      ? 'opt_in'
      : smsOptIn === 0 && wasSmsEnabled
        ? 'opt_out'
        : null;
    const statements = [updateStatement];

    if (consentEventType && consentPhoneNumber) {
      statements.push(
        prepareSmsConsentEvent(db, {
          userId: user.id,
          phoneNumber: consentPhoneNumber,
          eventType: consentEventType,
          source: 'profile',
        })
      );
    }

    await db.batch(statements);

    return { success: 'SMS preferences updated successfully' };
  }

  return { error: 'Invalid action' };
}

export default function ProfilePage({ loaderData, actionData }: Route.ComponentProps) {
  const { user } = loaderData;
  const hasCarrierOptOut = Boolean(
    user.sms_opt_out_at && user.sms_opt_out_source !== 'profile'
  );

  return (
    <main className="page-main">
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
      <h2 className="section-heading mb-3">Account Information</h2>
      <Card className="mb-8">
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
      <h2 className="section-heading mb-3">Email Notifications</h2>
      <Card>
        <p className="text-sm text-muted-foreground mb-6">
          Choose which email notifications you'd like to receive from Meatup.Club
        </p>

        <Form method="post">
          <input type="hidden" name="_action" value="update_notifications" />

          <div className="space-y-4">
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
      <h2 className="section-heading mb-3 mt-8">SMS Reminders</h2>
      <Card>
        <p className="text-sm text-muted-foreground mb-6">
          Get text reminders before each meetup. SMS is optional and not required to use
          Meatup.Club.
        </p>

        {hasCarrierOptOut ? (
          <Alert variant="warning" className="mb-4">
            You opted out by text. Reply START to (888) 857-6328 to re-enable reminders;
            Twilio will confirm the change and Meatup.Club will update automatically.
          </Alert>
        ) : user.sms_opt_out_at ? (
          <Alert variant="warning" className="mb-4">
            SMS reminders are disabled in your profile. Check the consent box below to re-enable
            them.
          </Alert>
        ) : null}

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

          <label className={`flex items-start gap-3 ${hasCarrierOptOut ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'}`}>
            <input
              type="checkbox"
              name="sms_opt_in"
              defaultChecked={user.sms_opt_in === 1}
              disabled={hasCarrierOptOut}
              aria-describedby={hasCarrierOptOut ? 'sms-carrier-opt-out-help' : undefined}
              className="mt-1 h-4 w-4 rounded border-border text-accent focus:ring-accent"
            />
            <div>
              <div className="font-medium text-foreground">
                I agree to receive SMS reminders from Meatup.Club. Message frequency varies. Msg &
                data rates may apply. Reply HELP for help and STOP to opt out.
              </div>
              <div className="text-sm text-muted-foreground">
                Reminder and RSVP update messages only. No marketing texts.
              </div>
              {hasCarrierOptOut ? (
                <div id="sms-carrier-opt-out-help" className="mt-1 text-sm text-muted-foreground">
                  Text START before this option becomes available again.
                </div>
              ) : null}
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
