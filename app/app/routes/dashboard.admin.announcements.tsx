import { Form, useNavigation } from "react-router";
import { useMemo, useState, type FormEvent } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import type { Route } from "./+types/dashboard.admin.announcements";
import { requireAdmin } from "../lib/auth.server";
import { logActivity } from "../lib/activity.server";
import { announcementDrafts } from "../lib/announcement-drafts";
import {
  listActiveAnnouncementMembers,
  selectAnnouncementRecipientsByUserIds,
} from "../lib/announcement.server";
import { sendAnnouncementEmails } from "../lib/email.server";
import { Alert, Badge, Button, Card, PageHeader } from "../components/ui";
import { AdminLayout } from "../components/AdminLayout";
import { confirmAction } from "../lib/confirm.client";

const announcementPreviewMarkdownComponents: Components = {
  h1: ({ children }) => <h1 className="text-2xl font-bold mb-3 text-foreground">{children}</h1>,
  h2: ({ children }) => <h2 className="text-xl font-bold mb-3 text-foreground">{children}</h2>,
  h3: ({ children }) => <h3 className="text-lg font-semibold mb-2 text-foreground">{children}</h3>,
  p: ({ children }) => <p className="mb-4 leading-7 text-foreground">{children}</p>,
  ul: ({ children }) => <ul className="mb-4 ml-6 list-disc space-y-2 text-foreground">{children}</ul>,
  ol: ({ children }) => (
    <ol className="mb-4 ml-6 list-decimal space-y-2 text-foreground">{children}</ol>
  ),
  li: ({ children }) => <li>{children}</li>,
  blockquote: ({ children }) => (
    <blockquote className="mb-4 border-l-4 border-accent pl-4 italic text-muted-foreground">
      {children}
    </blockquote>
  ),
  a: ({ children, href }) => (
    <a
      href={href}
      className="text-accent underline decoration-accent/40 underline-offset-4"
      target="_blank"
      rel="noreferrer"
    >
      {children}
    </a>
  ),
  strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  code: ({ children }) => (
    <code className="rounded bg-accent/10 px-1.5 py-0.5 font-mono text-[0.95em] text-foreground">
      {children}
    </code>
  ),
  pre: ({ children }) => (
    <pre className="mb-4 overflow-x-auto rounded-md bg-muted px-4 py-3 text-sm text-foreground">
      {children}
    </pre>
  ),
};

function parseRecipientUserIds(formData: FormData): number[] {
  return Array.from(
    new Set(
      formData
        .getAll("recipient_user_ids")
        .map((value) => Number(value))
        .filter((value) => Number.isInteger(value) && value > 0)
    )
  ).sort((left, right) => left - right);
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const admin = await requireAdmin(request, context);
  const db = context.cloudflare.env.DB;

  return {
    admin: {
      id: admin.id,
      email: admin.email,
      name: admin.name,
    },
    drafts: announcementDrafts,
    members: await listActiveAnnouncementMembers(db),
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  const admin = await requireAdmin(request, context);
  const db = context.cloudflare.env.DB;
  const resendApiKey = context.cloudflare.env.RESEND_API_KEY;
  const formData = await request.formData();
  const actionType = formData.get("_action");

  if (actionType !== "send_announcement") {
    return { error: "Invalid action" };
  }

  const subject = String(formData.get("subject") || "").trim();
  const messageText = String(formData.get("message_text") || "").trim();
  const recipientModeValue = String(formData.get("recipient_mode") || "");
  const recipientMode =
    recipientModeValue === "selected"
      ? "selected"
      : recipientModeValue === "me_only"
        ? "me_only"
        : "all_active";

  if (!subject) {
    return { error: "Subject is required" };
  }

  if (!messageText) {
    return { error: "Message is required" };
  }

  if (!resendApiKey) {
    return { error: "RESEND_API_KEY is not configured" };
  }

  const activeMembers = await listActiveAnnouncementMembers(db);
  const selectedUserIds = parseRecipientUserIds(formData);
  const recipients =
    recipientMode === "me_only"
      ? activeMembers.filter((member) => member.id === admin.id)
      : recipientMode === "selected"
      ? selectAnnouncementRecipientsByUserIds(activeMembers, selectedUserIds)
      : activeMembers;

  if (recipients.length === 0) {
    return {
      error:
        recipientMode === "selected"
          ? "Choose at least one active member"
          : "No active members available",
    };
  }

  const sendResult = await sendAnnouncementEmails({
    recipientEmails: recipients.map((member) => member.email),
    subject,
    messageText,
    resendApiKey,
    senderName: admin.name || "MeatUp.Club",
    idempotencyKey: `announcement:${admin.id}:${Date.now()}`,
  });

  if (!sendResult.success) {
    return {
      error: sendResult.error || "Failed to send announcement email",
    };
  }

  await logActivity({
    db,
    userId: admin.id,
    actionType: "send_member_announcement",
    actionDetails: {
      subject,
      recipient_count: sendResult.sentCount,
      recipient_mode: recipientMode,
      recipient_user_ids: recipients.map((member) => member.id),
    },
    route: "/dashboard/admin/announcements",
    request,
  });

  const memberLabel = sendResult.sentCount === 1 ? "member" : "members";
  return {
    success: `Sent announcement to ${sendResult.sentCount} active ${memberLabel}.`,
  };
}

export default function AdminAnnouncementsPage({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const { admin, drafts, members } = loaderData;
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";
  const [subject, setSubject] = useState("");
  const [messageText, setMessageText] = useState("");
  const [recipientMode, setRecipientMode] = useState<"all_active" | "selected" | "me_only">("all_active");
  const [selectedUserIds, setSelectedUserIds] = useState<number[]>([]);
  const [showPreview, setShowPreview] = useState(false);

  const recipientCount =
    recipientMode === "selected"
      ? selectedUserIds.length
      : recipientMode === "me_only"
        ? 1
        : members.length;
  const recipientLabel = recipientCount === 1 ? "member" : "members";

  const selectedUserIdSet = useMemo(() => new Set(selectedUserIds), [selectedUserIds]);

  function toggleSelectedUser(userId: number) {
    setSelectedUserIds((current) =>
      current.includes(userId)
        ? current.filter((id) => id !== userId)
        : [...current, userId].sort((left, right) => left - right)
    );
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    const recipientDescription =
      recipientMode === "selected"
        ? `${selectedUserIds.length} selected ${selectedUserIds.length === 1 ? "member" : "members"}`
        : recipientMode === "me_only"
          ? `just you at ${admin.email}`
        : `${members.length} active ${members.length === 1 ? "member" : "members"}`;

    if (!confirmAction(`Send this announcement to ${recipientDescription}?`)) {
      event.preventDefault();
    }
  }

  function loadDraft(draftId: string) {
    const draft = drafts.find((entry) => entry.id === draftId);
    if (!draft) {
      return;
    }

    setSubject(draft.subject);
    setMessageText(draft.messageText);
    setShowPreview(false);
  }

  return (
    <AdminLayout>
      <main className="page-main">
        <PageHeader
          title="Member Announcements"
          description="Send a one-off email to all active members or a selected subset. Markdown is supported for both the preview and the outgoing email."
        />

        {actionData?.error && (
          <Alert variant="error" className="mb-6">
            {actionData.error}
          </Alert>
        )}

        {actionData?.success && (
          <Alert variant="success" className="mb-6">
            {actionData.success}
          </Alert>
        )}

        <Card className="mb-6">
          <div className="flex flex-wrap items-center gap-3">
            <Badge variant="muted">{members.length} active members</Badge>
            <Badge variant="muted">{recipientCount} selected to receive</Badge>
          </div>
        </Card>

        <Card className="mb-6 space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Drafts</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Load a saved announcement draft, then send it to just yourself, a selected subset, or everyone.
            </p>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {drafts.map((draft) => (
              <div key={draft.id} className="rounded-lg border border-border bg-muted/40 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="font-semibold text-foreground">{draft.title}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">{draft.description}</p>
                  </div>
                  <Button type="button" variant="secondary" size="sm" onClick={() => loadDraft(draft.id)}>
                    Load Draft
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Form method="post" className="space-y-6" onSubmit={handleSubmit}>
          <input type="hidden" name="_action" value="send_announcement" />

          <Card className="space-y-4">
            <div>
              <label
                htmlFor="subject"
                className="block text-sm font-medium text-foreground mb-1"
              >
                Subject
              </label>
              <input
                id="subject"
                name="subject"
                type="text"
                required
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
                placeholder="Postmortem: Calendar invite delivery issue"
                className="w-full px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-accent"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label
                  htmlFor="message_text"
                  className="block text-sm font-medium text-foreground"
                >
                  Message
                </label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowPreview((current) => !current)}
                >
                  {showPreview ? "Edit" : "Preview"}
                </Button>
              </div>

              {showPreview ? (
                <div className="min-h-[320px] rounded-md border border-border bg-muted px-4 py-3">
                  {messageText ? (
                    <div className="prose prose-gray max-w-none text-foreground">
                      <ReactMarkdown components={announcementPreviewMarkdownComponents}>
                        {messageText}
                      </ReactMarkdown>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">Nothing to preview yet.</p>
                  )}
                </div>
              ) : (
                <textarea
                  id="message_text"
                  name="message_text"
                  required
                  rows={18}
                  value={messageText}
                  onChange={(event) => setMessageText(event.target.value)}
                  placeholder="Hi MeatUp members,..."
                  className="w-full px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-accent font-mono text-sm"
                />
              )}

              <p className="text-xs text-muted-foreground mt-2">
                Markdown is supported: headings, emphasis, links, lists, blockquotes, and code.
              </p>
            </div>
          </Card>

          <Card className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Recipients</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Send to all active members or choose a specific subset.
              </p>
            </div>

            <div className="space-y-3">
              <label className="flex items-start gap-3">
                <input
                  type="radio"
                  name="recipient_mode"
                  value="all_active"
                  checked={recipientMode === "all_active"}
                  onChange={() => setRecipientMode("all_active")}
                  className="mt-1"
                />
                <div>
                  <div className="font-medium text-foreground">All active members</div>
                  <div className="text-sm text-muted-foreground">
                    {members.length} active {members.length === 1 ? "member" : "members"}
                  </div>
                </div>
              </label>

              <label className="flex items-start gap-3">
                <input
                  type="radio"
                  name="recipient_mode"
                  value="me_only"
                  checked={recipientMode === "me_only"}
                  onChange={() => setRecipientMode("me_only")}
                  className="mt-1"
                />
                <div>
                  <div className="font-medium text-foreground">Just me (test)</div>
                  <div className="text-sm text-muted-foreground">
                    Send only to {admin.email}
                  </div>
                </div>
              </label>

              <label className="flex items-start gap-3">
                <input
                  type="radio"
                  name="recipient_mode"
                  value="selected"
                  checked={recipientMode === "selected"}
                  onChange={() => setRecipientMode("selected")}
                  className="mt-1"
                />
                <div>
                  <div className="font-medium text-foreground">Selected members</div>
                  <div className="text-sm text-muted-foreground">
                    {selectedUserIds.length} selected {selectedUserIds.length === 1 ? "member" : "members"}
                  </div>
                </div>
              </label>
            </div>

            {recipientMode === "selected" && (
              <div className="grid gap-3 sm:grid-cols-2">
                {members.map((member) => (
                  <label
                    key={member.id}
                    className="flex items-start gap-3 rounded-md border border-border px-3 py-3"
                  >
                    <input
                      type="checkbox"
                      name="recipient_user_ids"
                      value={member.id}
                      checked={selectedUserIdSet.has(member.id)}
                      onChange={() => toggleSelectedUser(member.id)}
                      className="mt-1"
                    />
                    <div>
                      <div className="font-medium text-foreground">
                        {member.name || member.email}
                      </div>
                      {member.name && (
                        <div className="text-sm text-muted-foreground">{member.email}</div>
                      )}
                    </div>
                  </label>
                ))}
              </div>
            )}
          </Card>

          <div className="flex items-center gap-3">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting
                ? "Sending..."
                : `Send to ${recipientCount} ${recipientLabel}`}
            </Button>
          </div>
        </Form>
      </main>
    </AdminLayout>
  );
}
