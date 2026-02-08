import { Form, Link } from "react-router";
import type { AppLoadContext } from "react-router";
import { useState } from "react";
import { requireAdmin } from "../lib/auth.server";
import { EnvelopeIcon, CheckIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { AdminLayout } from "../components/AdminLayout";

export async function loader({ request, context }: { request: Request; context: AppLoadContext }) {
  await requireAdmin(request, context);
  return {};
}

export async function action({ request, context }: { request: Request; context: AppLoadContext }) {
  const formData = await request.formData();
  const _action = formData.get('_action');

  if (_action === 'setup-resend') {
    // Call our setup endpoint
    const response = await fetch('/api/admin/setup-resend', {
      method: 'POST',
      headers: request.headers,
    });

    const result = await response.json();
    return result;
  }

  return { error: 'Invalid action' };
}

export default function AdminSetupPage({ actionData }: { actionData: any }) {
  const [isLoading, setIsLoading] = useState(false);

  return (
    <AdminLayout>
    <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">System Setup</h1>
        <p className="text-muted-foreground mt-1">Configure external integrations and services</p>
      </div>

      {/* Resend Inbound Email Setup */}
      <div className="bg-card border border-border rounded-lg p-6 mb-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-xl font-semibold mb-2 flex items-center gap-2"><EnvelopeIcon className="w-5 h-5 inline" /> Resend Inbound Email</h2>
            <p className="text-muted-foreground text-sm mb-4">
              Configure automatic email routing for calendar RSVP responses
            </p>
          </div>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <h3 className="font-semibold text-blue-900 mb-2">What this does:</h3>
          <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
            <li>Sets up <code className="bg-blue-100 px-1 rounded">rsvp@mail.meatup.club</code> email address</li>
            <li>Forwards incoming RSVP emails to your webhook</li>
            <li>Enables automatic calendar → website RSVP sync</li>
            <li>Uses Resend API (no manual configuration needed)</li>
          </ul>
        </div>

        {actionData?.success === true && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
            <h3 className="font-semibold text-green-900 mb-2 flex items-center gap-1"><CheckIcon className="w-5 h-5 inline" /> Success!</h3>
            <p className="text-sm text-green-800 mb-2">{actionData.message}</p>
            {actionData.details && (
              <div className="bg-green-100 rounded p-3 text-xs text-green-900 font-mono mt-2">
                <div><strong>Email:</strong> {actionData.details.email}</div>
                <div><strong>Forwards to:</strong> {actionData.details.forwardsTo}</div>
                <div><strong>Domain:</strong> {actionData.details.domain}</div>
              </div>
            )}
          </div>
        )}

        {actionData?.success === false && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
            <h3 className="font-semibold text-red-900 mb-2 flex items-center gap-1"><XMarkIcon className="w-5 h-5 inline" /> Error</h3>
            <p className="text-sm text-red-800 mb-2">{actionData.error}</p>
            {actionData.details && (
              <pre className="bg-red-100 rounded p-3 text-xs text-red-900 overflow-x-auto mt-2">
                {JSON.stringify(actionData.details, null, 2)}
              </pre>
            )}
            {actionData.availableDomains && (
              <div className="mt-2">
                <p className="text-sm text-red-800">Available domains:</p>
                <ul className="list-disc list-inside text-xs text-red-700">
                  {actionData.availableDomains.map((domain: string) => (
                    <li key={domain}>{domain}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
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
            {isLoading ? 'Configuring...' : 'Configure Resend Inbound Email'}
          </button>
        </Form>
      </div>

      {/* Future Setup Options */}
      <div className="bg-muted border border-border rounded-lg p-6">
        <h2 className="text-xl font-semibold mb-2 text-muted-foreground">Coming Soon</h2>
        <p className="text-muted-foreground text-sm">
          Additional integrations and setup options will appear here
        </p>
      </div>
    </main>
    </AdminLayout>
  );
}
