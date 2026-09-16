import { useState } from "react";
import { useFetcher } from "react-router";
import { confirmAction } from "../lib/confirm.client";
import { Alert, Button } from "./ui";

interface SmsMember {
  id: number;
  name: string | null;
  email: string;
}

interface AdminEventSmsFormProps {
  eventId: number;
  eventName: string;
  smsMembers: SmsMember[];
  eventMembers: { id: number; rsvp_status: string | null }[];
}

const recipientScopes = [
  { value: "pending", label: "No RSVP yet" },
  { value: "all", label: "All SMS-opted members" },
  { value: "yes", label: "RSVP Yes" },
  { value: "no", label: "RSVP No" },
  { value: "maybe", label: "RSVP Maybe" },
  { value: "specific", label: "Specific member" },
];

export function AdminEventSmsForm({ eventId, eventName, smsMembers, eventMembers }: AdminEventSmsFormProps) {
  const fetcher = useFetcher<{ success?: string; error?: string }>();
  const [scope, setScope] = useState("pending");
  const [recipientId, setRecipientId] = useState("");
  const isSending = fetcher.state !== "idle";
  const rsvpByMember = new Map(eventMembers.map((member) => [member.id, member.rsvp_status]));
  const recipients = smsMembers.filter((member) => {
    if (scope === "all") return true;
    if (scope === "specific") return String(member.id) === recipientId;
    const rsvp = rsvpByMember.get(member.id);
    return scope === "pending" ? rsvp == null : rsvp === scope;
  });
  const scopeLabel = recipientScopes.find((option) => option.value === scope)?.label;
  const recipientNames = recipients.map((member) => member.name || member.email).join(", ");
  const inputClassName = "w-full px-3 py-2 border border-border rounded-md focus:outline-hidden focus:ring-2 focus:ring-accent";

  return (
    <fetcher.Form
      method="post"
      className="space-y-3"
      aria-label={`SMS notification for ${eventName}`}
      onSubmit={(event) => {
        if (isSending || recipients.length === 0 || !confirmAction(
          `Send an RSVP text for ${eventName} to ${recipients.length} ${recipients.length === 1 ? "member" : "members"} (${scopeLabel})?\n\nRecipients: ${recipientNames}\n\nEligibility is checked again when sending.`
        )) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="_action" value="send_sms_reminder" />
      <input type="hidden" name="event_id" value={eventId} />
      <div>
        <label htmlFor={`sms-message_type-${eventId}`} className="block text-sm font-medium text-foreground mb-1">
          SMS notification
        </label>
        <select id={`sms-message_type-${eventId}`} name="message_type" className={inputClassName} defaultValue="default">
          <option value="default">Use default reminder template</option>
          <option value="custom">Send custom message</option>
        </select>
      </div>
      <div>
        <label htmlFor={`sms-recipient_scope-${eventId}`} className="block text-sm font-medium text-foreground mb-1">
          Recipients
        </label>
        <select
          id={`sms-recipient_scope-${eventId}`}
          name="recipient_scope"
          className={inputClassName}
          value={scope}
          onChange={(event) => setScope(event.target.value)}
        >
          {recipientScopes.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </div>
      {scope === "specific" && (
        <div>
          <label htmlFor={`sms-recipient_user_id-${eventId}`} className="block text-sm font-medium text-foreground mb-1">
            Specific Recipient
          </label>
          <select
            id={`sms-recipient_user_id-${eventId}`}
            name="recipient_user_id"
            className={inputClassName}
            value={recipientId}
            onChange={(event) => setRecipientId(event.target.value)}
          >
            <option value="">Select a member</option>
            {smsMembers.map((member) => <option key={member.id} value={member.id}>{member.name || member.email}</option>)}
          </select>
        </div>
      )}
      <section aria-label="SMS recipient preview" aria-live="polite" className="rounded-lg border border-border bg-muted/20 p-3 text-sm">
        <p className="font-medium text-foreground">{recipients.length} of {smsMembers.length} SMS-eligible members selected</p>
        <p className="mt-1 text-muted-foreground">
          {recipients.length > 0 ? recipientNames : "No members match this selection."}
        </p>
        {scope === "pending" && <p className="mt-2 text-muted-foreground">
          “No RSVP yet” excludes members with an existing Yes, No, or Maybe response. Choose “All SMS-opted members” to ask everyone eligible.
        </p>}
      </section>
      <div>
        <label htmlFor={`sms-custom_message-${eventId}`} className="block text-sm font-medium text-foreground mb-1">
          Custom Message (Optional)
        </label>
        <textarea
          id={`sms-custom_message-${eventId}`}
          name="custom_message"
          rows={3}
          placeholder="Add a custom note (RSVP + opt-out instructions are appended automatically)."
          className={inputClassName}
        />
      </div>
      <Button type="submit" size="sm" disabled={isSending || recipients.length === 0}>
        {isSending ? "Sending SMS…" : "Send SMS notification"}
      </Button>
      <div role="status" aria-live="polite" aria-atomic="true">
        {isSending ? <p className="text-sm text-muted-foreground">Sending SMS notifications. Please wait for the result.</p> : (
          <>
            {fetcher.data?.error && <Alert variant="error">{fetcher.data.error}</Alert>}
            {fetcher.data?.success && <Alert variant="success">{fetcher.data.success}</Alert>}
          </>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Only active members who opted into SMS and have a phone number receive messages. Replies update this event’s RSVP.
        Provider acceptance does not confirm delivery; check SMS delivery status below.
      </p>
    </fetcher.Form>
  );
}
