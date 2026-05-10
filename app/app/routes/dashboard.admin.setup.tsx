import { Form, Link } from "react-router";
import type { AppLoadContext } from "react-router";
import { useState } from "react";
import { requireAdmin } from "../lib/auth.server";
import { EnvelopeIcon, CheckIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { AdminLayout } from "../components/AdminLayout";
import { Alert, Card, PageHeader } from "../components/ui";

export async function loader({ request, context }: { request: Request; context: AppLoadContext }) {
  await requireAdmin(request, context);
  return {};
}

export async function action({ request, context }: { request: Request; context: AppLoadContext }) {
  await requireAdmin(request, context);
  const formData = await request.formData();
  const _action = formData.get('_action');

  if (_action === 'setup-resend') {
    // Call our setup endpoint
    const setupUrl = new URL('/api/admin/setup-resend', request.url);
    const response = await fetch(setupUrl, {
      method: 'POST',
      headers: request.headers,
    });

    const result = await response.json();
    return result;
  }

  return { error: 'Invalid action' };
}

interface SetupActionData {
  success?: boolean;
  message?: string;
  error?: string;
  details?: {
    deliveryWebhookUrl?: string;
    deliveryWebhookEvents?: string[];
    domain?: string;
  } | string;
  availableDomains?: string[];
}

export default function AdminSetupPage({ actionData }: { actionData: SetupActionData }) {
  const [isLoading, setIsLoading] = useState(false);

  return (
    <AdminLayout>
    <main className="page-main">
      <PageHeader
        title="System Setup"
        description="Configure external integrations and services"
      />

      {/* Resend Email Setup */}
      <Card className="p-6 mb-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-xl font-semibold mb-2 flex items-center gap-2"><EnvelopeIcon className="w-5 h-5 inline" /> Resend Email</h2>
            <p className="text-muted-foreground text-sm mb-4">
              Configure delivery-status tracking for Resend event emails
            </p>
          </div>
        </div>

        <Alert variant="info" className="mb-6">
          <h3 className="font-semibold mb-2">What this does:</h3>
          <ul className="text-sm space-y-1 list-disc list-inside">
            <li>Verifies the <code className="bg-accent/20 px-1 rounded">mail.meatup.club</code> sending domain exists in Resend</li>
            <li>Registers the delivery-status webhook used to track provider handoff and delivery events</li>
            <li>Stores the delivery webhook signing secret in the app database for webhook verification</li>
            <li>Leaves the existing inbound RSVP webhook configuration unchanged</li>
          </ul>
        </Alert>

        {actionData?.success === true && (
          <Alert variant="success" className="mb-4">
            <h3 className="font-semibold mb-2 flex items-center gap-1"><CheckIcon className="w-5 h-5 inline" /> Success!</h3>
            <p className="text-sm mb-2">{actionData.message}</p>
            {actionData.details && (
              <div className="bg-muted border border-border rounded p-3 text-xs font-mono mt-2">
                <div><strong>Delivery webhook:</strong> {typeof actionData.details === "string" ? "-" : actionData.details.deliveryWebhookUrl}</div>
                <div><strong>Delivery events:</strong> {typeof actionData.details === "string" ? "-" : actionData.details.deliveryWebhookEvents?.join(", ")}</div>
                <div><strong>Domain:</strong> {typeof actionData.details === "string" ? "-" : actionData.details.domain}</div>
              </div>
            )}
          </Alert>
        )}

        {actionData?.success === false && (
          <Alert variant="error" className="mb-4">
            <h3 className="font-semibold mb-2 flex items-center gap-1"><XMarkIcon className="w-5 h-5 inline" /> Error</h3>
            <p className="text-sm mb-2">{actionData.error}</p>
            {actionData.details && (
              <pre className="bg-muted border border-border rounded p-3 text-xs overflow-x-auto mt-2">
                {JSON.stringify(actionData.details, null, 2)}
              </pre>
            )}
            {actionData.availableDomains && (
              <div className="mt-2">
                <p className="text-sm">Available domains:</p>
                <ul className="list-disc list-inside text-xs">
                  {actionData.availableDomains.map((domain: string) => (
                    <li key={domain}>{domain}</li>
                  ))}
                </ul>
              </div>
            )}
          </Alert>
        )}

        <Form
          method="post"
          onSubmit={() => setIsLoading(true)}
        >
          <input type="hidden" name="_action" value="setup-resend" />
          <button
            type="submit"
            disabled={isLoading}
            className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? 'Configuring...' : 'Configure Resend Email'}
          </button>
        </Form>
      </Card>

      {/* Future Setup Options */}
      <Card className="p-6 bg-muted">
        <h2 className="text-xl font-semibold mb-2 text-muted-foreground">Coming Soon</h2>
        <p className="text-muted-foreground text-sm">
          Additional integrations and setup options will appear here
        </p>
      </Card>
    </main>
    </AdminLayout>
  );
}
